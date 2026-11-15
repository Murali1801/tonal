/** Curve helpers for the lightness and chroma shapes. */

/**
 * CSS-style cubic-bezier easing: control points (0,0), (x1,y1), (x2,y2), (1,1).
 * Returns y for a given x in [0, 1]. x1, x2 are clamped to [0, 1] so the curve
 * stays a function of x.
 */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number): (x: number) => number {
  x1 = clamp01(x1);
  x2 = clamp01(x2);
  const bx = (t: number) => 3 * x1 * t * (1 - t) ** 2 + 3 * x2 * t * t * (1 - t) + t ** 3;
  const by = (t: number) => 3 * y1 * t * (1 - t) ** 2 + 3 * y2 * t * t * (1 - t) + t ** 3;
  const dbx = (t: number) =>
    3 * x1 * (1 - t) ** 2 + 6 * (x2 - x1) * t * (1 - t) + 3 * (1 - x2) * t * t;

  return (x: number) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    // Newton-Raphson, then bisection as a fallback.
    let t = x;
    for (let i = 0; i < 8; i++) {
      const err = bx(t) - x;
      if (Math.abs(err) < 1e-7) return by(t);
      const d = dbx(t);
      if (Math.abs(d) < 1e-6) break;
      t -= err / d;
    }
    let lo = 0;
    let hi = 1;
    t = x;
    for (let i = 0; i < 40; i++) {
      const v = bx(t);
      if (Math.abs(v - x) < 1e-7) break;
      if (v < x) lo = t;
      else hi = t;
      t = (lo + hi) / 2;
    }
    return by(t);
  };
}

/**
 * Chroma shape: 0..1 multiplier across the ramp. Starts at `start` (t = 0),
 * rises to 1 at `peak`, falls to `end` (t = 1), with smooth (cosine) easing so
 * there are no kinks at the peak.
 */
export function chromaShape(start: number, peak: number, end: number): (t: number) => number {
  const p = Math.min(0.98, Math.max(0.02, peak));
  const ease = (u: number) => (1 - Math.cos(Math.PI * clamp01(u))) / 2;
  return (t: number) => {
    t = clamp01(t);
    if (t <= p) return start + (1 - start) * ease(t / p);
    return 1 + (end - 1) * ease((t - p) / (1 - p));
  };
}

export function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}
