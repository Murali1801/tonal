import { describe, expect, it } from 'vitest';
import { generate, columnSpread, constraintScore, type State } from './palette';
import { defaultState } from './state';
import { isInGamut } from './color';
import { wcagRatio, apcaContrast } from './contrast';

const base = (patch: Partial<State> = {}): State => ({ ...defaultState(), constraints: [], ...patch });

describe('generate', () => {
  it('builds hues x steps, every tile in the active gamut', () => {
    for (const gamut of ['srgb', 'p3'] as const) {
      const p = generate(base({ gamut }));
      expect(p.tiles).toHaveLength(6);
      expect(p.tiles[0]).toHaveLength(11);
      for (const row of p.tiles) for (const t of row) expect(isInGamut(t.color, gamut)).toBe(true);
    }
  });
  it('lightness falls monotonically along every ramp', () => {
    const p = generate(base());
    for (const row of p.tiles) {
      for (let i = 1; i < row.length; i++) expect(row[i]!.y).toBeLessThan(row[i - 1]!.y);
    }
  });
  it('flags P3-only tiles only in P3 mode', () => {
    const s = generate(base({ gamut: 'srgb' }));
    expect(s.tiles.flat().some((t) => t.p3Only)).toBe(false);
    const p = generate(base({ gamut: 'p3', hues: [{ name: 'Green', h: 145, c: 0.3 }] }));
    expect(p.tiles.flat().some((t) => t.p3Only)).toBe(true);
    for (const t of p.tiles.flat()) expect(isInGamut(t.srgb, 'srgb')).toBe(true);
  });
  it('relative chroma mode stays inside the gamut without mapping', () => {
    const p = generate(
      base({ chroma: { start: 0.1, peak: 0.55, end: 0.4, mode: 'rel' }, hues: [{ name: 'Blue', h: 262, c: 0.9 }] }),
    );
    for (const t of p.tiles.flat()) expect(t.mapped).toBe(false);
  });
});

describe('equal lightness across hues', () => {
  it('wcag mode gives every hue the same WCAG contrast per step', () => {
    const p = generate(base({ equal: 'wcag' }));
    for (let s = 0; s < p.labels.length; s++) expect(columnSpread(p, s, 'wcag')).toBeLessThan(0.01);
  });
  it('apca mode gives every hue the same APCA Lc per step', () => {
    const p = generate(base({ equal: 'apca' }));
    for (let s = 0; s < p.labels.length; s++) expect(columnSpread(p, s, 'apca')).toBeLessThan(0.1);
  });
  it('off mode leaves real differences between hues', () => {
    const p = generate(base({ equal: 'off' }));
    const worst = Math.max(...p.labels.map((_, s) => columnSpread(p, s, 'wcag')));
    expect(worst).toBeGreaterThan(0.3);
  });
});

describe('constraint solver', () => {
  it('locks step 500 to at least 4.5:1 on white on every hue', () => {
    const p = generate(
      base({ equal: 'off', constraints: [{ step: '500', target: 4.5, against: 'white', metric: 'wcag' }] }),
    );
    for (const row of p.tiles) expect(wcagRatio(row[5]!.y, 1)).toBeGreaterThanOrEqual(4.5);
    expect(p.constraintResults[0]!.valid).toBe(true);
    expect(p.constraintResults[0]!.moved).toBeGreaterThan(0);
  });
  it('moves L only as far as needed (lands just above the target)', () => {
    const p = generate(
      base({ equal: 'wcag', constraints: [{ step: '500', target: 4.5, against: 'white', metric: 'wcag' }] }),
    );
    for (const row of p.tiles) {
      const r = wcagRatio(row[5]!.y, 1);
      expect(r).toBeGreaterThanOrEqual(4.5);
      expect(r).toBeLessThan(4.56);
    }
  });
  it('keeps the ramp monotonic after a lock', () => {
    const p = generate(base({ constraints: [{ step: '400', target: 7, against: 'white', metric: 'wcag' }] }));
    for (const row of p.tiles) for (let i = 1; i < row.length; i++) expect(row[i]!.y).toBeLessThan(row[i - 1]!.y);
  });
  it('solves against black by lightening', () => {
    const p = generate(base({ constraints: [{ step: '300', target: 12, against: 'black', metric: 'wcag' }] }));
    for (const row of p.tiles) expect(wcagRatio(row[3]!.y, 0)).toBeGreaterThanOrEqual(12);
  });
  it('APCA constraints hold in both polarities', () => {
    const k = { step: '700', target: 75, against: 'white' as const, metric: 'apca' as const };
    const p = generate(base({ constraints: [k] }));
    for (const row of p.tiles) {
      expect(Math.abs(apcaContrast(row[7]!.ys, 1))).toBeGreaterThanOrEqual(75);
      expect(Math.abs(apcaContrast(1, row[7]!.ys))).toBeGreaterThanOrEqual(75);
      expect(constraintScore(row[7]!, k)).toBeGreaterThanOrEqual(75);
    }
  });
  it('reports unreachable targets and unknown steps', () => {
    const p = generate(
      base({
        constraints: [
          { step: '50', target: 21, against: 'black', metric: 'wcag' },
          { step: '725', target: 4.5, against: 'white', metric: 'wcag' },
        ],
      }),
    );
    expect(p.constraintResults[0]!.unmet).toBeGreaterThan(0);
    expect(p.constraintResults[1]!.valid).toBe(false);
  });
  it('already-passing steps are not touched', () => {
    const p = generate(base({ constraints: [{ step: '950', target: 4.5, against: 'white', metric: 'wcag' }] }));
    expect(p.constraintResults[0]!.moved).toBe(0);
    expect(p.tiles.flat().every((t) => t.lockedBy.length === 0)).toBe(true);
  });
});

describe('performance', () => {
  it('generates the default palette fast enough for live dragging', () => {
    const s = defaultState();
    generate(s);
    const t0 = performance.now();
    for (let i = 0; i < 6; i++) generate({ ...s, gamut: i % 2 ? 'p3' : 'srgb' });
    const ms = (performance.now() - t0) / 6;
    console.log(`generate(): ${ms.toFixed(1)} ms`);
    expect(ms).toBeLessThan(250);
  });
});
