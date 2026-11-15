/**
 * Contrast metrics.
 *
 * WCAG 2.2 contrast ratio: (L1 + 0.05) / (L2 + 0.05) on relative luminance.
 *
 * APCA: our own implementation of APCA-W3 0.0.98G-4g (the constants published
 * in Myndex/apca-w3, "SA98G"). APCA works on an estimated screen luminance Ys
 * that uses a simple 2.4 exponent instead of the piecewise sRGB curve.
 */

export type Metric = 'wcag' | 'apca';

// ---------- WCAG 2.2 ----------

/** sRGB channel 0..1 to linear light, per the sRGB spec (WCAG uses 0.03928; the difference is below 1e-4). */
export function srgbToLinear(v: number): number {
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

/** WCAG relative luminance from 8-bit sRGB. */
export function wcagLuminance(rgb255: readonly [number, number, number]): number {
  const [r, g, b] = rgb255.map((v) => srgbToLinear(v / 255)) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2.2 contrast ratio between two luminances, 1..21. Order does not matter. */
export function wcagRatio(yA: number, yB: number): number {
  const hi = Math.max(yA, yB);
  const lo = Math.min(yA, yB);
  return (hi + 0.05) / (lo + 0.05);
}

/** WCAG level for a ratio, as people say it. */
export function wcagLevel(ratio: number): 'AAA' | 'AA' | 'AA18' | 'fail' {
  if (ratio >= 7) return 'AAA';
  if (ratio >= 4.5) return 'AA';
  if (ratio >= 3) return 'AA18';
  return 'fail';
}

// ---------- APCA 0.0.98G-4g ----------

const SA98G = {
  mainTRC: 2.4,
  // sRGB coefficients
  sRco: 0.2126729,
  sGco: 0.7151522,
  sBco: 0.072175,
  // Display P3 coefficients
  pRco: 0.228982959480578,
  pGco: 0.691749262585238,
  pBco: 0.0792677779341829,
  normBG: 0.56,
  normTXT: 0.57,
  revTXT: 0.62,
  revBG: 0.65,
  blkThrs: 0.022,
  blkClmp: 1.414,
  scaleBoW: 1.14,
  scaleWoB: 1.14,
  loBoWoffset: 0.027,
  loWoBoffset: 0.027,
  deltaYmin: 0.0005,
  loClip: 0.1,
} as const;

/** APCA screen luminance Ys from 8-bit sRGB. */
export function sRGBtoY(rgb255: readonly [number, number, number]): number {
  const f = (v: number) => (v / 255) ** SA98G.mainTRC;
  return SA98G.sRco * f(rgb255[0]) + SA98G.sGco * f(rgb255[1]) + SA98G.sBco * f(rgb255[2]);
}

/** APCA screen luminance Ys from sRGB channels 0..1. */
export function srgbUnitToY(rgb: readonly [number, number, number]): number {
  const f = (v: number) => Math.max(0, v) ** SA98G.mainTRC;
  return SA98G.sRco * f(rgb[0]) + SA98G.sGco * f(rgb[1]) + SA98G.sBco * f(rgb[2]);
}

/** APCA screen luminance Ys from Display P3 channels 0..1. */
export function p3UnitToY(rgb: readonly [number, number, number]): number {
  const f = (v: number) => Math.max(0, v) ** SA98G.mainTRC;
  return SA98G.pRco * f(rgb[0]) + SA98G.pGco * f(rgb[1]) + SA98G.pBco * f(rgb[2]);
}

/**
 * APCA lightness contrast Lc for text luminance on background luminance.
 * Positive for dark text on light background, negative for light on dark.
 */
export function apcaContrast(txtY: number, bgY: number): number {
  if (!Number.isFinite(txtY) || !Number.isFinite(bgY)) return 0;
  if (Math.min(txtY, bgY) < 0 || Math.max(txtY, bgY) > 1.1) return 0;

  const clampBlack = (y: number) =>
    y > SA98G.blkThrs ? y : y + (SA98G.blkThrs - y) ** SA98G.blkClmp;
  txtY = clampBlack(txtY);
  bgY = clampBlack(bgY);

  if (Math.abs(bgY - txtY) < SA98G.deltaYmin) return 0;

  let out: number;
  if (bgY > txtY) {
    // Normal polarity: dark text on light background
    const sapc = (bgY ** SA98G.normBG - txtY ** SA98G.normTXT) * SA98G.scaleBoW;
    out = sapc < SA98G.loClip ? 0 : sapc - SA98G.loBoWoffset;
  } else {
    // Reverse polarity: light text on dark background
    const sapc = (bgY ** SA98G.revBG - txtY ** SA98G.revTXT) * SA98G.scaleWoB;
    out = sapc > -SA98G.loClip ? 0 : sapc + SA98G.loWoBoffset;
  }
  return out * 100;
}

/** APCA guidance band for |Lc| (bronze simple mode). */
export function apcaLevel(lc: number): string {
  const a = Math.abs(lc);
  if (a >= 90) return 'body+';
  if (a >= 75) return 'body';
  if (a >= 60) return 'text';
  if (a >= 45) return 'large';
  if (a >= 30) return 'spot';
  if (a >= 15) return 'min';
  return 'fail';
}

/** Thresholds offered in the UI, per metric. */
export const THRESHOLDS: Record<Metric, readonly number[]> = {
  wcag: [3, 4.5, 7],
  apca: [45, 60, 75, 90],
};

export const THRESHOLD_NOTE: Record<string, string> = {
  'wcag:3': 'large text, UI',
  'wcag:4.5': 'AA body text',
  'wcag:7': 'AAA body text',
  'apca:45': 'large text',
  'apca:60': 'content text',
  'apca:75': 'body text',
  'apca:90': 'small body text',
};
