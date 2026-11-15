import { describe, expect, it } from 'vitest';
import { decodeState, defaultState, encodeState, hueName, sanitize } from './state';
import { generate, type State } from './palette';
import { slugs, toCss, toDtcg, toTailwind } from './exports';

describe('URL hash state', () => {
  it('round-trips the default state', () => {
    const s = defaultState();
    expect(decodeState('#' + encodeState(s))).toEqual(s);
  });
  it('round-trips an edited state with odd names', () => {
    const s: State = {
      ...defaultState(),
      steps: 9,
      naming: 'index',
      gamut: 'p3',
      equal: 'apca',
      metric: 'apca',
      threshold: 75,
      hues: [
        { name: 'Brand blue', h: 266, c: 0.2 },
        { name: 'Café', h: 55, c: 0.09 },
      ],
      constraints: [{ step: '6', target: 60, against: 'black', metric: 'apca' }],
    };
    expect(decodeState(encodeState(s))).toEqual(s);
  });
  it('ignores hashes that are not ours', () => {
    expect(decodeState('#section-2')).toBeNull();
    expect(decodeState('')).toBeNull();
  });
  it('clamps hostile values instead of breaking', () => {
    const s = decodeState('#v=1&s=999&g=cmyk&e=x&t=33&l=9,-4,a,b,c,d&h=%E0%A4%A:9999:5;;&k=abc:999:z:q')!;
    expect(s.steps).toBe(15);
    expect(s.gamut).toBe('srgb');
    expect(s.equal).toBe('wcag');
    expect(s.threshold).toBe(4.5);
    expect(s.light.start).toBe(1);
    expect(s.light.end).toBe(0);
    expect(s.hues[0]!.h).toBeGreaterThanOrEqual(0);
    expect(s.hues[0]!.h).toBeLessThan(360);
    expect(s.hues[0]!.c).toBeLessThanOrEqual(0.4);
    expect(s.constraints[0]!.target).toBe(21);
  });
  it('never returns an empty hue list', () => {
    expect(sanitize({ hues: [] }).hues.length).toBeGreaterThan(0);
  });
  it('names hues by angle', () => {
    expect(hueName(262, 0.2)).toBe('Blue');
    expect(hueName(25, 0.2)).toBe('Red');
    expect(hueName(150, 0.01)).toBe('Gray');
  });
});

describe('exports', () => {
  const small: State = {
    ...defaultState(),
    steps: 5,
    naming: 'hundreds',
    hues: [
      { name: 'Gray', h: 85, c: 0.012 },
      { name: 'Blue', h: 262, c: 0.21 },
    ],
    constraints: [],
  };

  it('dedupes slugs', () => {
    expect(slugs(['Blue', 'blue', 'Brand Blue!', '***'])).toEqual(['blue', 'blue-2', 'brand-blue', 'hue']);
  });

  it('CSS: hex fallback, then oklch in @supports', () => {
    const css = toCss(generate(small));
    expect(css).toMatch(/:root \{\n {2}--gray-100: #[0-9a-f]{6};/);
    expect(css).toContain('@supports (color: oklch(0% 0 0))');
    expect(css).not.toContain('color-gamut: p3');
    expect(css).toMatchSnapshot();
  });

  it('CSS in P3 adds a color-gamut block for P3-only tiles', () => {
    const css = toCss(generate({ ...small, gamut: 'p3', hues: [{ name: 'Green', h: 145, c: 0.3 }] }));
    expect(css).toContain('@media (color-gamut: p3)');
    expect(css).toMatchSnapshot();
  });

  it('Tailwind v4 @theme', () => {
    const tw = toTailwind(generate(small));
    expect(tw).toMatch(/@theme \{\n {2}--color-gray-100: oklch\(/);
    expect(tw.match(/--color-/g)).toHaveLength(10);
    expect(tw).toMatchSnapshot();
  });

  it('DTCG JSON tokens', () => {
    const json = JSON.parse(toDtcg(generate(small)));
    expect(json.color.blue.$type).toBe('color');
    const v = json.color.blue['500'].$value;
    expect(v.colorSpace).toBe('oklch');
    expect(v.components).toHaveLength(3);
    expect(v.hex).toMatch(/^#[0-9a-f]{6}$/);
    expect(toDtcg(generate(small))).toMatchSnapshot();
  });
});
