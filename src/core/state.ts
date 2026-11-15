/** Default state, validation, and the URL hash format. */
import type { Constraint, HueSpec, State } from './palette';
import { MAX_STEPS, MIN_STEPS } from './steps';
import { clamp } from './curves';
import { THRESHOLDS } from './contrast';

export const MAX_HUES = 12;
export const MAX_CONSTRAINTS = 6;

export function defaultState(): State {
  return {
    steps: 11,
    naming: 'tw',
    gamut: 'srgb',
    equal: 'wcag',
    metric: 'wcag',
    threshold: 4.5,
    light: { start: 0.975, end: 0.255, x1: 0.05, y1: 0, x2: 0.95, y2: 0.9 },
    chroma: { start: 0.1, peak: 0.58, end: 0.45, mode: 'abs' },
    hues: [
      { name: 'Gray', h: 85, c: 0.012 },
      { name: 'Red', h: 25, c: 0.21 },
      { name: 'Amber', h: 70, c: 0.17 },
      { name: 'Green', h: 150, c: 0.16 },
      { name: 'Teal', h: 195, c: 0.12 },
      { name: 'Blue', h: 262, c: 0.21 },
    ],
    constraints: [{ step: '700', target: 7, against: 'white', metric: 'wcag' }],
  };
}

const num = (v: unknown, lo: number, hi: number, fallback: number): number => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? clamp(n, lo, hi) : fallback;
};

const oneOf = <T extends string>(v: unknown, opts: readonly T[], fallback: T): T =>
  opts.includes(v as T) ? (v as T) : fallback;

export function cleanName(name: string): string {
  const s = name.replace(/[^\p{L}\p{N} _-]/gu, '').trim().slice(0, 20);
  return s || 'Hue';
}

/** Clamp every field into range so a hand-edited hash can never break the app. */
export function sanitize(input: Partial<State>): State {
  const d = defaultState();
  const s: State = {
    steps: Math.round(num(input.steps, MIN_STEPS, MAX_STEPS, d.steps)),
    naming: oneOf(input.naming, ['tw', 'hundreds', 'index'] as const, d.naming),
    gamut: oneOf(input.gamut, ['srgb', 'p3'] as const, d.gamut),
    equal: oneOf(input.equal, ['off', 'wcag', 'apca'] as const, d.equal),
    metric: oneOf(input.metric, ['wcag', 'apca'] as const, d.metric),
    threshold: 0,
    light: {
      start: num(input.light?.start, 0.05, 1, d.light.start),
      end: num(input.light?.end, 0, 0.95, d.light.end),
      x1: num(input.light?.x1, 0, 1, d.light.x1),
      y1: num(input.light?.y1, -0.5, 1.5, d.light.y1),
      x2: num(input.light?.x2, 0, 1, d.light.x2),
      y2: num(input.light?.y2, -0.5, 1.5, d.light.y2),
    },
    chroma: {
      start: num(input.chroma?.start, 0, 1, d.chroma.start),
      peak: num(input.chroma?.peak, 0.02, 0.98, d.chroma.peak),
      end: num(input.chroma?.end, 0, 1, d.chroma.end),
      mode: oneOf(input.chroma?.mode, ['abs', 'rel'] as const, d.chroma.mode),
    },
    hues: [],
    constraints: [],
  };
  const t = Number(input.threshold);
  s.threshold = THRESHOLDS[s.metric].includes(t) ? t : s.metric === 'wcag' ? 4.5 : 60;

  const hues = Array.isArray(input.hues) ? input.hues : d.hues;
  s.hues = hues.slice(0, MAX_HUES).map(
    (h: Partial<HueSpec>): HueSpec => ({
      name: cleanName(String(h?.name ?? 'Hue')),
      h: ((num(h?.h, -720, 720, 0) % 360) + 360) % 360,
      c: num(h?.c, 0, s.chroma.mode === 'abs' ? 0.4 : 1, 0.1),
    }),
  );
  if (s.hues.length === 0) s.hues = d.hues;

  const ks = Array.isArray(input.constraints) ? input.constraints : [];
  s.constraints = ks.slice(0, MAX_CONSTRAINTS).map(
    (k: Partial<Constraint>): Constraint => {
      const metric = oneOf(k?.metric, ['wcag', 'apca'] as const, 'wcag');
      return {
        step: String(k?.step ?? '600').replace(/[^0-9]/g, '').slice(0, 5) || '600',
        target: metric === 'wcag' ? num(k?.target, 1, 21, 4.5) : num(k?.target, 1, 108, 60),
        against: oneOf(k?.against, ['white', 'black'] as const, 'white'),
        metric,
      };
    },
  );
  return s;
}

// ---------- URL hash ----------
// Readable, compact, versioned:
// v=1&s=11&n=tw&g=srgb&e=wcag&m=wcag&t=4.5&l=.975,.255,.32,.12,.62,.88&c=.1,.58,.45,abs
//   &h=Gray:85:0.012;Red:25:0.21&k=600:4.5:w:wcag

const fmt = (v: number) => String(Math.round(v * 10000) / 10000);

export function encodeState(s: State): string {
  const parts = [
    'v=1',
    `s=${s.steps}`,
    `n=${s.naming}`,
    `g=${s.gamut}`,
    `e=${s.equal}`,
    `m=${s.metric}`,
    `t=${fmt(s.threshold)}`,
    `l=${[s.light.start, s.light.end, s.light.x1, s.light.y1, s.light.x2, s.light.y2].map(fmt).join(',')}`,
    `c=${[s.chroma.start, s.chroma.peak, s.chroma.end].map(fmt).join(',')},${s.chroma.mode}`,
    `h=${s.hues.map((h) => `${encodeURIComponent(h.name)}:${fmt(h.h)}:${fmt(h.c)}`).join(';')}`,
  ];
  if (s.constraints.length) {
    parts.push(
      `k=${s.constraints.map((k) => `${k.step}:${fmt(k.target)}:${k.against === 'white' ? 'w' : 'b'}:${k.metric}`).join(';')}`,
    );
  }
  return parts.join('&');
}

/** Parse a hash (with or without '#'). Unknown or broken fields fall back to defaults. */
export function decodeState(hash: string): State | null {
  const raw = hash.replace(/^#/, '');
  if (!raw.includes('v=1')) return null;
  const map = new Map<string, string>();
  for (const pair of raw.split('&')) {
    const i = pair.indexOf('=');
    if (i > 0) map.set(pair.slice(0, i), pair.slice(i + 1));
  }
  const nums = (key: string) => (map.get(key) ?? '').split(',').map(Number);
  const l = nums('l');
  const cParts = (map.get('c') ?? '').split(',');
  const safeDecode = (v: string) => {
    try {
      return decodeURIComponent(v);
    } catch {
      return 'Hue';
    }
  };
  const input: Partial<State> = {
    steps: Number(map.get('s')),
    naming: map.get('n') as State['naming'],
    gamut: map.get('g') as State['gamut'],
    equal: map.get('e') as State['equal'],
    metric: map.get('m') as State['metric'],
    threshold: Number(map.get('t')),
    light: { start: l[0]!, end: l[1]!, x1: l[2]!, y1: l[3]!, x2: l[4]!, y2: l[5]! },
    chroma: {
      start: Number(cParts[0]),
      peak: Number(cParts[1]),
      end: Number(cParts[2]),
      mode: cParts[3] as 'abs' | 'rel',
    },
    hues: (map.get('h') ?? '')
      .split(';')
      .filter(Boolean)
      .map((h) => {
        const [name = 'Hue', hue = '0', c = '0.1'] = h.split(':');
        return { name: safeDecode(name), h: Number(hue), c: Number(c) };
      }),
    constraints: (map.get('k') ?? '')
      .split(';')
      .filter(Boolean)
      .map((k) => {
        const [step = '600', target = '4.5', against = 'w', metric = 'wcag'] = k.split(':');
        return {
          step,
          target: Number(target),
          against: against === 'b' ? 'black' : 'white',
          metric: metric as Constraint['metric'],
        };
      }),
  };
  return sanitize(input);
}

/** Name for a hue angle, used when adding a hue from a colour. */
export function hueName(h: number, c: number): string {
  if (c < 0.03) return 'Gray';
  const names: [number, string][] = [
    [15, 'Pink'],
    [40, 'Red'],
    [60, 'Orange'],
    [90, 'Amber'],
    [110, 'Yellow'],
    [135, 'Lime'],
    [165, 'Green'],
    [185, 'Teal'],
    [215, 'Cyan'],
    [240, 'Sky'],
    [270, 'Blue'],
    [290, 'Indigo'],
    [315, 'Violet'],
    [345, 'Purple'],
    [361, 'Pink'],
  ];
  const a = ((h % 360) + 360) % 360;
  return names.find(([max]) => a < max)?.[1] ?? 'Hue';
}
