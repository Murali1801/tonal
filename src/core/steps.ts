/** Step labels, positions along the ramp and semantic roles. */

export type Naming = 'tw' | 'hundreds' | 'index';

export const MIN_STEPS = 5;
export const MAX_STEPS = 15;
export const TW_LABELS = ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950'];

/** Tailwind naming only exists for 11 steps; other counts fall back to hundreds. */
export function effectiveNaming(count: number, naming: Naming): Naming {
  return naming === 'tw' && count !== 11 ? 'hundreds' : naming;
}

export function stepLabels(count: number, naming: Naming): string[] {
  const n = effectiveNaming(count, naming);
  if (n === 'tw') return [...TW_LABELS];
  if (n === 'index') return Array.from({ length: count }, (_, i) => String(i + 1));
  return Array.from({ length: count }, (_, i) => String((i + 1) * 100));
}

/**
 * Position t in [0, 1] for each step. For Tailwind names the position follows
 * the number (50 and 950 are half steps), otherwise steps are evenly spaced.
 */
export function stepPositions(labels: readonly string[]): number[] {
  const nums = labels.map(Number);
  const first = nums[0] ?? 0;
  const last = nums[nums.length - 1] ?? 1;
  if (labels.length < 2 || last === first) return labels.map(() => 0);
  return nums.map((v) => (v - first) / (last - first));
}

/**
 * Semantic role of a step by its position (after Radix's 12-step roles):
 * backgrounds, component states, borders, solids, text.
 */
export function stepRole(t: number): string {
  if (t < 0.12) return 'app bg';
  if (t < 0.3) return 'surface';
  if (t < 0.45) return 'border';
  if (t < 0.7) return 'solid';
  if (t < 0.88) return 'text';
  return 'hi text';
}
