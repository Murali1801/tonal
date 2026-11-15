/**
 * Colour conversions and gamut mapping.
 *
 * Built on culori's tree-shakeable `culori/fn` entry: we register only the
 * modes we use (oklch, oklab, rgb, lrgb, p3, xyz65) so the bundle stays small,
 * and we get culori's `toGamut`, which implements the CSS Color 4 gamut mapping
 * algorithm (binary search on OKLCH chroma with a deltaEOK "just noticeable
 * difference" of 0.02, then clip).
 */
import {
  useMode,
  modeOklch,
  modeOklab,
  modeRgb,
  modeLrgb,
  modeP3,
  modeXyz65,
  converter,
  toGamut,
  inGamut,
  formatHex,
  parse,
  differenceEuclidean,
} from 'culori/fn';
import type { Oklch, Rgb, P3 } from 'culori/fn';

useMode(modeOklch);
useMode(modeOklab);
useMode(modeRgb);
useMode(modeLrgb);
useMode(modeP3);
useMode(modeXyz65);

export type Gamut = 'srgb' | 'p3';

/** A colour in OKLCH. l: 0..1, c: 0..~0.4, h: degrees. */
export interface Lch {
  l: number;
  c: number;
  h: number;
}

const toOklch = converter('oklch');
const toRgb = converter('rgb');
const toP3 = converter('p3');
const toXyz = converter('xyz65');

const inSrgbGamut = inGamut('rgb');
const inP3Gamut = inGamut('p3');

/** deltaEOK, as the CSS Color 4 spec uses. */
// @types/culori types `delta` as a number, but culori takes a difference function here.
const deltaEOK = differenceEuclidean('oklab') as unknown as number;
const mapSrgb = toGamut('rgb', 'oklch', deltaEOK, 0.02);
const mapP3 = toGamut('p3', 'oklch', deltaEOK, 0.02);

const asCulori = (c: Lch): Oklch => ({ mode: 'oklch', l: c.l, c: Math.max(0, c.c), h: c.h });

const fromCulori = (c: Oklch | undefined, fallbackHue: number): Lch => ({
  l: c?.l ?? 0,
  c: c?.c ?? 0,
  h: c?.h ?? fallbackHue,
});

/** Is the OKLCH colour inside the gamut (with a tiny tolerance for float noise)? */
export function isInGamut(c: Lch, gamut: Gamut): boolean {
  const col = asCulori(c);
  if (gamut === 'srgb') return inSrgbGamut(col) || nearlyIn(toRgb(col));
  return inP3Gamut(col) || nearlyIn(toP3(col));
}

function nearlyIn(c: Rgb | P3): boolean {
  const e = 1e-6;
  return [c.r, c.g, c.b].every((v) => v >= -e && v <= 1 + e);
}

/** Map an OKLCH colour into the gamut with the CSS Color 4 algorithm, returned as OKLCH. */
export function mapToGamut(c: Lch, gamut: Gamut): Lch {
  const col = asCulori(c);
  const mapped = gamut === 'srgb' ? mapSrgb(col) : mapP3(col);
  const back = fromCulori(toOklch(mapped), c.h);
  // Keep the requested hue for (near) achromatic results so names stay stable.
  if (back.c < 1e-4) back.h = c.h;
  return back;
}

/** Channels 0..1 in the given RGB space, clamped. */
export function channels(c: Lch, space: Gamut): [number, number, number] {
  const col = asCulori(c);
  const out = space === 'srgb' ? toRgb(col) : toP3(col);
  const k = (v: number) => Math.min(1, Math.max(0, v));
  return [k(out.r), k(out.g), k(out.b)];
}

/** sRGB hex of the colour (caller should gamut-map to sRGB first). */
export function toHex(c: Lch): string {
  const [r, g, b] = channels(c, 'srgb');
  return formatHex({ mode: 'rgb', r, g, b });
}

/** Relative luminance Y (CIE XYZ, D65), as WCAG 2.x defines it for sRGB. */
export function luminance(c: Lch): number {
  const y = toXyz(asCulori(c)).y;
  return Math.min(1, Math.max(0, y));
}

/** Round to n decimals, avoiding "-0". */
export function round(v: number, n: number): number {
  const p = 10 ** n;
  const r = Math.round(v * p) / p;
  return Object.is(r, -0) ? 0 : r;
}

/** CSS `oklch()` string: L as a percentage, C and H rounded for readability. */
export function formatOklch(c: Lch): string {
  const l = round(c.l * 100, 1);
  const ch = round(c.c, 3);
  const h = ch === 0 ? 0 : round(((c.h % 360) + 360) % 360, 1);
  return `oklch(${l}% ${ch} ${h})`;
}

/** Parse any CSS colour string into OKLCH, or null. */
export function parseColor(input: string): Lch | null {
  const parsed = parse(input.trim());
  if (!parsed) return null;
  const o = toOklch(parsed);
  if (!o || !Number.isFinite(o.l)) return null;
  return { l: o.l, c: o.c ?? 0, h: o.h ?? 0 };
}

/**
 * The largest chroma at (l, h) that is still inside the gamut.
 * Binary search; 16 iterations resolve chroma to ~6e-6.
 */
export function maxChroma(l: number, h: number, gamut: Gamut): number {
  if (l <= 0 || l >= 1) return 0;
  let lo = 0;
  let hi = 0.5;
  for (let i = 0; i < 16; i++) {
    const mid = (lo + hi) / 2;
    if (isInGamut({ l, c: mid, h }, gamut)) lo = mid;
    else hi = mid;
  }
  return lo;
}
