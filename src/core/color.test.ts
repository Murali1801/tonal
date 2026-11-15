import { describe, expect, it } from 'vitest';
import { formatOklch, isInGamut, luminance, mapToGamut, maxChroma, parseColor, toHex, channels } from './color';
import { cubicBezier, chromaShape } from './curves';
import { stepLabels, stepPositions, effectiveNaming } from './steps';

describe('conversions', () => {
  it('parses sRGB red to the published OKLCH value', () => {
    const red = parseColor('#ff0000')!;
    expect(red.l).toBeCloseTo(0.62796, 4);
    expect(red.c).toBeCloseTo(0.25768, 4);
    expect(red.h).toBeCloseTo(29.2339, 3);
  });
  it('white is L=1 with no chroma, black is L=0', () => {
    const w = parseColor('white')!;
    expect(w.l).toBeCloseTo(1, 5);
    expect(w.c).toBeLessThan(1e-4);
    expect(parseColor('#000')!.l).toBeCloseTo(0, 6);
  });
  it('round-trips hex through OKLCH', () => {
    for (const h of ['#2747d9', '#f6d21f', '#16150f', '#7b93ff', '#00a86b']) {
      expect(toHex(parseColor(h)!)).toBe(h);
    }
  });
  it('formats oklch() for CSS', () => {
    expect(formatOklch({ l: 0.62796, c: 0.25768, h: 29.2339 })).toBe('oklch(62.8% 0.258 29.2)');
    expect(formatOklch({ l: 0.5, c: 0.0001, h: 200 })).toBe('oklch(50% 0 0)');
  });
  it('rejects garbage', () => {
    expect(parseColor('not a colour')).toBeNull();
  });
  it('luminance matches WCAG for sRGB colours', () => {
    expect(luminance(parseColor('#fff')!)).toBeCloseTo(1, 4);
    expect(luminance(parseColor('#767676')!)).toBeCloseTo(0.1812, 3);
  });
});

describe('gamut mapping (CSS Color 4)', () => {
  const vivid = { l: 0.7, c: 0.32, h: 150 };
  it('detects out-of-gamut colours', () => {
    expect(isInGamut(vivid, 'srgb')).toBe(false);
    expect(isInGamut({ l: 0.7, c: 0.1, h: 150 }, 'srgb')).toBe(true);
  });
  it('maps into sRGB, keeping lightness and hue close', () => {
    const m = mapToGamut(vivid, 'srgb');
    expect(isInGamut(m, 'srgb')).toBe(true);
    expect(Math.abs(m.l - vivid.l)).toBeLessThan(0.02);
    expect(Math.abs(m.h - vivid.h)).toBeLessThan(3);
    expect(m.c).toBeLessThan(vivid.c);
  });
  it('P3 keeps more chroma than sRGB', () => {
    const s = mapToGamut(vivid, 'srgb');
    const p = mapToGamut(vivid, 'p3');
    expect(isInGamut(p, 'p3')).toBe(true);
    expect(p.c).toBeGreaterThan(s.c);
    expect(isInGamut(p, 'srgb')).toBe(false);
  });
  it('leaves in-gamut colours alone', () => {
    const c = { l: 0.6, c: 0.08, h: 250 };
    const m = mapToGamut(c, 'srgb');
    expect(m.l).toBeCloseTo(c.l, 4);
    expect(m.c).toBeCloseTo(c.c, 4);
    expect(m.h).toBeCloseTo(c.h, 2);
  });
  it('maps L >= 1 to white and L <= 0 to black', () => {
    for (const v of channels(mapToGamut({ l: 1.2, c: 0.2, h: 30 }, 'srgb'), 'srgb')) expect(v).toBeCloseTo(1, 9);
    for (const v of channels(mapToGamut({ l: -0.1, c: 0.2, h: 30 }, 'srgb'), 'srgb')) expect(v).toBeCloseTo(0, 9);
  });
  it('maxChroma finds the gamut edge', () => {
    const c = maxChroma(0.6, 260, 'srgb');
    expect(isInGamut({ l: 0.6, c, h: 260 }, 'srgb')).toBe(true);
    expect(isInGamut({ l: 0.6, c: c + 0.002, h: 260 }, 'srgb')).toBe(false);
    expect(maxChroma(0.6, 260, 'p3')).toBeGreaterThan(c);
  });
});

describe('curves', () => {
  it('cubic bezier hits endpoints and is identity for linear control points', () => {
    const lin = cubicBezier(0, 0, 1, 1);
    expect(lin(0)).toBe(0);
    expect(lin(1)).toBe(1);
    expect(lin(0.37)).toBeCloseTo(0.37, 5);
  });
  it('matches CSS ease-in-out', () => {
    expect(cubicBezier(0.42, 0, 0.58, 1)(0.5)).toBeCloseTo(0.5, 5);
    expect(cubicBezier(0.42, 0, 0.58, 1)(0.25)).toBeCloseTo(0.1291, 3);
  });
  it('chroma shape: start, peak at 1, end', () => {
    const f = chromaShape(0.1, 0.6, 0.4);
    expect(f(0)).toBeCloseTo(0.1, 6);
    expect(f(0.6)).toBeCloseTo(1, 6);
    expect(f(1)).toBeCloseTo(0.4, 6);
  });
});

describe('steps', () => {
  it('tailwind names and half-step positions', () => {
    const l = stepLabels(11, 'tw');
    expect(l).toEqual(['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950']);
    const p = stepPositions(l);
    expect(p[0]).toBe(0);
    expect(p[10]).toBe(1);
    expect(p[5]).toBeCloseTo(0.5, 6);
    expect(p[1]).toBeCloseTo(50 / 900, 6);
  });
  it('falls back to hundreds when the count is not 11', () => {
    expect(effectiveNaming(9, 'tw')).toBe('hundreds');
    expect(stepLabels(5, 'tw')).toEqual(['100', '200', '300', '400', '500']);
    expect(stepLabels(5, 'index')).toEqual(['1', '2', '3', '4', '5']);
  });
});
