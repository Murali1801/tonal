import { describe, expect, it } from 'vitest';
import { apcaContrast, sRGBtoY, wcagLuminance, wcagRatio, wcagLevel, apcaLevel } from './contrast';

const hex = (h: string): [number, number, number] => {
  const s = h.replace('#', '');
  const full = s.length === 3 ? [...s].map((c) => c + c).join('') : s;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)) as [number, number, number];
};
const apca = (txt: string, bg: string) => apcaContrast(sRGBtoY(hex(txt)), sRGBtoY(hex(bg)));
const wcag = (a: string, b: string) => wcagRatio(wcagLuminance(hex(a)), wcagLuminance(hex(b)));

describe('APCA 0.0.98G-4g (reference values from Myndex/apca-w3)', () => {
  it.each([
    ['#888', '#fff', 63.056469930209424],
    ['#fff', '#888', -68.54146436644962],
    ['#000', '#aaa', 58.146262578561334],
    ['#aaa', '#000', -56.24113336839742],
    ['#123', '#def', 91.66830811481631],
    ['#def', '#123', -93.06770049484275],
  ])('text %s on %s = Lc %d', (txt, bg, expected) => {
    expect(apca(txt, bg)).toBeCloseTo(expected, 6);
  });

  it('black on white and white on black hit the known extremes', () => {
    expect(apca('#000', '#fff')).toBeCloseTo(106.04, 1);
    expect(apca('#fff', '#000')).toBeCloseTo(-107.88, 1);
  });

  it('returns 0 for identical colours and out-of-range input', () => {
    expect(apca('#777', '#777')).toBe(0);
    expect(apcaContrast(-1, 0.5)).toBe(0);
    expect(apcaContrast(NaN, 0.5)).toBe(0);
  });

  it('bands', () => {
    expect(apcaLevel(91)).toBe('body+');
    expect(apcaLevel(-62)).toBe('text');
    expect(apcaLevel(10)).toBe('fail');
  });
});

describe('WCAG 2.2 contrast ratio', () => {
  it('white on black is 21:1, same colour is 1:1', () => {
    expect(wcag('#000', '#fff')).toBeCloseTo(21, 6);
    expect(wcag('#3a7', '#3a7')).toBe(1);
  });
  it('matches well-known pairs', () => {
    expect(wcag('#767676', '#fff')).toBeCloseTo(4.54, 2);
    expect(wcag('#777777', '#fff')).toBeCloseTo(4.48, 2);
    expect(wcag('#595959', '#fff')).toBeCloseTo(7.0, 1);
    expect(wcag('#0000ff', '#fff')).toBeCloseTo(8.59, 2);
    expect(wcag('#ff0000', '#fff')).toBeCloseTo(4.0, 2);
  });
  it('is symmetric', () => {
    expect(wcag('#123456', '#abcdef')).toBeCloseTo(wcag('#abcdef', '#123456'), 10);
  });
  it('levels', () => {
    expect(wcagLevel(7.1)).toBe('AAA');
    expect(wcagLevel(4.5)).toBe('AA');
    expect(wcagLevel(3.2)).toBe('AA18');
    expect(wcagLevel(2)).toBe('fail');
  });
});
