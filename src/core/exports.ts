/** Exporters: CSS custom properties, Tailwind v4 @theme, DTCG design tokens. */
import { round } from './color';
import type { Palette, Tile } from './palette';

/** Slug for a hue name; duplicates get -2, -3 so variables never collide. */
export function slugs(names: readonly string[]): string[] {
  const seen = new Map<string, number>();
  return names.map((n) => {
    const base =
      n
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'hue';
    const count = (seen.get(base) ?? 0) + 1;
    seen.set(base, count);
    return count === 1 ? base : `${base}-${count}`;
  });
}

function rows(p: Palette): { slug: string; tiles: Tile[] }[] {
  const names = slugs(p.tiles.map((r) => r[0]?.name ?? 'hue'));
  return p.tiles.map((tiles, i) => ({ slug: names[i]!, tiles }));
}

/**
 * CSS custom properties. sRGB hex first (works everywhere), then OKLCH inside
 * @supports, then the wider P3 values for P3-capable screens when the palette
 * was built in P3.
 */
export function toCss(p: Palette): string {
  const r = rows(p);
  const out: string[] = [];
  out.push(`/* Tonal palette, ${p.gamut === 'p3' ? 'Display P3 with sRGB fallback' : 'sRGB'} */`);
  out.push(':root {');
  for (const { slug, tiles } of r) for (const t of tiles) out.push(`  --${slug}-${t.label}: ${t.hex};`);
  out.push('}', '');
  out.push('@supports (color: oklch(0% 0 0)) {', '  :root {');
  for (const { slug, tiles } of r) for (const t of tiles) out.push(`    --${slug}-${t.label}: ${t.cssSrgb};`);
  out.push('  }', '}');

  const wide = r.flatMap(({ slug, tiles }) => tiles.filter((t) => t.p3Only).map((t) => ({ slug, t })));
  if (p.gamut === 'p3' && wide.length) {
    out.push('', '@media (color-gamut: p3) {', '  @supports (color: oklch(0% 0 0)) {', '    :root {');
    for (const { slug, t } of wide) out.push(`      --${slug}-${t.label}: ${t.css};`);
    out.push('    }', '  }', '}');
  }
  return out.join('\n') + '\n';
}

/** Tailwind CSS v4 @theme block. Tailwind v4 ships OKLCH colours, so we do too. */
export function toTailwind(p: Palette): string {
  const out: string[] = [];
  out.push(`/* Tonal palette for Tailwind CSS v4 (${p.gamut === 'p3' ? 'Display P3' : 'sRGB'}). Paste after @import "tailwindcss"; */`);
  out.push('@theme {');
  rows(p).forEach(({ slug, tiles }, i) => {
    if (i > 0) out.push('');
    for (const t of tiles) out.push(`  --color-${slug}-${t.label}: ${t.css};`);
  });
  out.push('}');
  return out.join('\n') + '\n';
}

/**
 * Design Tokens Community Group format (2025.10): colour values as objects with
 * colorSpace, components, alpha and an sRGB hex fallback.
 */
export function toDtcg(p: Palette): string {
  // Written by hand so "$type" leads each group (JS objects put numeric keys first)
  // and each token stays on one readable line.
  const groups = rows(p);
  const lines = ['{', '  "color": {'];
  groups.forEach(({ slug, tiles }, gi) => {
    lines.push(`    ${JSON.stringify(slug)}: {`, '      "$type": "color",');
    tiles.forEach((t, ti) => {
      const value = {
        $value: {
          colorSpace: 'oklch',
          components: [round(t.color.l, 4), round(t.color.c, 4), round(t.color.c < 0.0005 ? 0 : t.color.h, 2)],
          alpha: 1,
          hex: t.hex,
        },
      };
      lines.push(`      ${JSON.stringify(t.label)}: ${JSON.stringify(value)}${ti < tiles.length - 1 ? ',' : ''}`);
    });
    lines.push(`    }${gi < groups.length - 1 ? ',' : ''}`);
  });
  lines.push('  }', '}');
  return lines.join('\n') + '\n';
}

export type ExportKind = 'css' | 'tailwind' | 'dtcg';

export function exportPalette(p: Palette, kind: ExportKind): string {
  if (kind === 'css') return toCss(p);
  if (kind === 'tailwind') return toTailwind(p);
  return toDtcg(p);
}
