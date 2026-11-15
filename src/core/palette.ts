/**
 * Palette generation: hues x steps, from a lightness curve and a chroma curve,
 * with optional equal-lightness-across-hues solving and contrast constraints.
 */
import {
  type Gamut,
  type Lch,
  channels,
  isInGamut,
  luminance,
  mapToGamut,
  maxChroma,
  toHex,
  formatOklch,
} from './color';
import { apcaContrast, p3UnitToY, srgbUnitToY, wcagRatio, type Metric } from './contrast';
import { chromaShape, cubicBezier } from './curves';
import { stepLabels, stepPositions, type Naming } from './steps';

export interface HueSpec {
  name: string;
  /** Hue angle in degrees. */
  h: number;
  /** Peak chroma: absolute OKLCH chroma in 'abs' mode, 0..1 share of the gamut maximum in 'rel' mode. */
  c: number;
}

export interface Constraint {
  /** Step label, e.g. "600". */
  step: string;
  /** Target: WCAG ratio (e.g. 4.5) or APCA |Lc| (e.g. 60). */
  target: number;
  against: 'white' | 'black';
  metric: Metric;
}

/**
 * Equal lightness across hues.
 * - off: every hue uses the curve's OKLCH L as is.
 * - wcag: solve L per tile so relative luminance matches a neutral at the curve's L,
 *   so a step has the same WCAG contrast on any hue.
 * - apca: same, matching APCA screen luminance, so a step has the same APCA Lc.
 */
export type EqualMode = 'off' | 'wcag' | 'apca';

export interface State {
  steps: number;
  naming: Naming;
  gamut: Gamut;
  equal: EqualMode;
  metric: Metric;
  threshold: number;
  light: { start: number; end: number; x1: number; y1: number; x2: number; y2: number };
  chroma: { start: number; peak: number; end: number; mode: 'abs' | 'rel' };
  hues: HueSpec[];
  constraints: Constraint[];
}

export interface Tile {
  hue: number;
  step: number;
  label: string;
  /** Hue name. */
  name: string;
  /** What the curves asked for, before gamut mapping. */
  requested: Lch;
  /** The colour shown, gamut-mapped into the active gamut. */
  color: Lch;
  /** The sRGB-mapped fallback. */
  srgb: Lch;
  hex: string;
  /** oklch() of `color`. */
  css: string;
  /** oklch() of `srgb`. */
  cssSrgb: string;
  /** True when the shown colour needs a P3 display (outside sRGB). */
  p3Only: boolean;
  /** True when the requested colour was outside the active gamut and got mapped. */
  mapped: boolean;
  /** WCAG relative luminance of the shown colour. */
  y: number;
  /** APCA screen luminance of the shown colour. */
  ys: number;
  /** Indices of constraints that moved this tile. */
  lockedBy: number[];
}

export interface ConstraintResult {
  /** Tiles whose lightness changed to meet it. */
  moved: number;
  /** Tiles that could not meet it (target out of reach). */
  unmet: number;
  /** Whether the step label exists in the current ramp. */
  valid: boolean;
}

export interface Palette {
  labels: string[];
  positions: number[];
  tiles: Tile[][]; // [hue][step]
  constraintResults: ConstraintResult[];
  gamut: Gamut;
}

// ---------- luminance helpers ----------

/** WCAG luminance and APCA Ys of an OKLCH colour shown in a gamut. */
export function lumPair(c: Lch, gamut: Gamut): { y: number; ys: number } {
  const y = luminance(c);
  const ys = gamut === 'srgb' ? srgbUnitToY(channels(c, 'srgb')) : p3UnitToY(channels(c, 'p3'));
  return { y, ys };
}

export const WHITE = { y: 1, ys: 1 } as const;
export const BLACK = { y: 0, ys: 0 } as const;

/** Contrast between a foreground and background luminance pair. WCAG ratio or APCA Lc. */
export function contrastOf(
  fg: { y: number; ys: number },
  bg: { y: number; ys: number },
  metric: Metric,
): number {
  return metric === 'wcag' ? wcagRatio(fg.y, bg.y) : apcaContrast(fg.ys, bg.ys);
}

/** Does a tile meet a constraint? APCA checks both polarities and keeps the weaker. */
export function meets(t: { y: number; ys: number }, k: Constraint): boolean {
  return constraintScore(t, k) >= k.target;
}

export function constraintScore(t: { y: number; ys: number }, k: Constraint): number {
  const other = k.against === 'white' ? WHITE : BLACK;
  if (k.metric === 'wcag') return wcagRatio(t.y, other.y);
  return Math.min(Math.abs(apcaContrast(t.ys, other.ys)), Math.abs(apcaContrast(other.ys, t.ys)));
}

// ---------- generation ----------

interface Ctx {
  gamut: Gamut;
  hue: HueSpec;
  shape: number;
  mode: 'abs' | 'rel';
}

/** The colour at lightness L for a tile context: chroma from the curve, then gamut-mapped. */
function colourAt(ctx: Ctx, l: number): { requested: Lch; color: Lch } {
  const h = ctx.hue.h;
  const c =
    ctx.mode === 'abs'
      ? Math.max(0, ctx.hue.c * ctx.shape)
      : Math.max(0, Math.min(1, ctx.hue.c) * ctx.shape * maxChroma(l, h, ctx.gamut));
  const requested = { l, c, h };
  const color = isInGamut(requested, ctx.gamut) ? requested : mapToGamut(requested, ctx.gamut);
  return { requested, color };
}

/**
 * Find L in [0, 1] where f(L) crosses `target`, for f increasing in L.
 * 24 bisection steps resolve L to ~6e-8.
 */
export function solveIncreasing(f: (l: number) => number, target: number, lo = 0, hi = 1): number {
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (f(mid) < target) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/**
 * Find the boundary L for a constraint. Against white, darker passes, so we
 * return the lightest passing L; against black, the darkest passing L.
 * Returns null if no L in [0, 1] passes.
 */
export function solveConstraintL(ctx: Ctx, k: Constraint): number | null {
  const pass = (l: number) => {
    const { color } = colourAt(ctx, l);
    return meets(lumPair(color, ctx.gamut), withMargin(k));
  };
  const darkSide = k.against === 'white';
  const extreme = darkSide ? 0 : 1;
  if (!pass(extreme)) return null;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    const ok = pass(mid);
    if (darkSide) {
      if (ok) lo = mid;
      else hi = mid;
    } else if (ok) hi = mid;
    else lo = mid;
  }
  return darkSide ? lo : hi;
}

/** A small margin so the value still passes after display rounding (4.5 shows as 4.50, not 4.49). */
function withMargin(k: Constraint): Constraint {
  return { ...k, target: k.target + (k.metric === 'wcag' ? 0.006 : 0.06) };
}

/** Target luminance a neutral grey would have at lightness L, for equal-lightness mode. */
function neutralTarget(l: number, mode: Exclude<EqualMode, 'off'>, gamut: Gamut): number {
  const p = lumPair({ l, c: 0, h: 0 }, gamut);
  return mode === 'wcag' ? p.y : p.ys;
}

export function generate(state: State): Palette {
  const labels = stepLabels(state.steps, state.naming);
  const positions = stepPositions(labels);
  const ease = cubicBezier(state.light.x1, state.light.y1, state.light.x2, state.light.y2);
  const shapeFn = chromaShape(state.chroma.start, state.chroma.peak, state.chroma.end);
  const { gamut } = state;

  const curveL = positions.map((t) => state.light.start + (state.light.end - state.light.start) * ease(t));
  const shapes = positions.map((t) => shapeFn(t));

  const constraintResults: ConstraintResult[] = state.constraints.map((k) => ({
    moved: 0,
    unmet: 0,
    valid: labels.includes(k.step),
  }));

  const tiles: Tile[][] = state.hues.map((hue, hi) => {
    const ctxs: Ctx[] = shapes.map((shape) => ({ gamut, hue, shape, mode: state.chroma.mode }));

    // 1. Lightness per step, from the curve or solved for equal luminance.
    const ls = curveL.map((lc, si) => {
      if (state.equal === 'off') return lc;
      const mode = state.equal;
      const target = neutralTarget(lc, mode, gamut);
      const ctx = ctxs[si]!;
      return solveIncreasing((l) => {
        const p = lumPair(colourAt(ctx, l).color, gamut);
        return mode === 'wcag' ? p.y : p.ys;
      }, target);
    });

    // 2. Constraints: move a step's L only as far as needed to pass.
    const lockedBy: number[][] = ls.map(() => []);
    state.constraints.forEach((k, ki) => {
      const si = labels.indexOf(k.step);
      if (si < 0) return;
      const ctx = ctxs[si]!;
      const current = lumPair(colourAt(ctx, ls[si]!).color, gamut);
      if (meets(current, k)) return;
      const l = solveConstraintL(ctx, k);
      const res = constraintResults[ki]!;
      if (l === null) {
        res.unmet++;
        return;
      }
      ls[si] = l;
      lockedBy[si]!.push(ki);
      res.moved++;
      // Keep the ramp monotonic: steps after a white-locked step stay darker,
      // steps before a black-locked step stay lighter.
      const gap = 0.012;
      if (k.against === 'white') {
        for (let j = si + 1; j < ls.length; j++) ls[j] = Math.min(ls[j]!, l - gap * (j - si));
      } else {
        for (let j = si - 1; j >= 0; j--) ls[j] = Math.max(ls[j]!, l + gap * (si - j));
      }
    });

    // 3. Final colours.
    return ls.map((l, si) => {
      const ctx = ctxs[si]!;
      const { requested, color } = colourAt(ctx, Math.min(1, Math.max(0, l)));
      const srgb = gamut === 'srgb' ? color : mapToGamut(color, 'srgb');
      const p3Only = gamut === 'p3' && !isInGamut(color, 'srgb');
      const mapped = Math.abs(requested.c - color.c) > 0.0005 || Math.abs(requested.l - color.l) > 0.0005;
      const { y, ys } = lumPair(color, gamut);
      return {
        hue: hi,
        step: si,
        label: labels[si]!,
        name: hue.name,
        requested,
        color,
        srgb,
        hex: toHex(srgb),
        css: formatOklch(color),
        cssSrgb: formatOklch(srgb),
        p3Only,
        mapped,
        y,
        ys,
        lockedBy: lockedBy[si]!,
      };
    });
  });

  return { labels, positions, tiles, constraintResults, gamut };
}

/**
 * Spread of WCAG contrast-on-white across hues for one step: max/min ratio - 1.
 * 0 means every hue has the same contrast at that step.
 */
export function columnSpread(p: Palette, step: number, metric: Metric): number {
  const vals = p.tiles.map((row) => {
    const t = row[step]!;
    return metric === 'wcag' ? wcagRatio(t.y, 1) : Math.abs(apcaContrast(t.ys, 1));
  });
  if (vals.length < 2) return 0;
  return Math.max(...vals) - Math.min(...vals);
}
