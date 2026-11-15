# Changelog

## 0.1.0 (2026-11-15)

First release.

- OKLCH ramps for up to 12 hues and 5 to 15 steps (Tailwind 50 to 950 by default), with editable lightness and chroma curves.
- Equal lightness across hues, matched by WCAG luminance or APCA screen luminance.
- sRGB and Display P3 targets with CSS Color 4 gamut mapping; P3-only tiles show a hatched corner with the sRGB fallback.
- WCAG 2.2 ratio and APCA 0.0.98G-4g Lc, contrast lens, step by step contrast matrix.
- Constraints that lock a step to a minimum contrast on white or black.
- Live preview of buttons, badges, an alert, a link and an input in light and dark.
- Exports: CSS custom properties with fallbacks, Tailwind v4 `@theme`, DTCG JSON.
- Whole state in the URL hash; light and dark theme; phone layout with a controls drawer.
