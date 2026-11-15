# Contributing

Thanks for helping with Tonal, an OKLCH colour-system generator that runs in the browser. Issues, ideas and pull requests are all welcome.

## Getting started

You need Node 22.18 or newer.

```bash
git clone https://github.com/Murali1801/tonal.git
cd tonal
npm install
npm run dev
```

Before you open a pull request:

```bash
npm test
npm run build
```

Both run in CI on every pull request.

## Where things live

- `src/core/` holds the colour maths: OKLCH conversion, gamut mapping, WCAG and APCA contrast, the equal-lightness solver, constraints and the exporters. It has no DOM code and is covered by the tests in `src/core/*.test.ts`.
- `src/ui/` builds the interface with small DOM helpers. No framework.
- `src/main.ts` wires state, the URL hash and the UI together.

## Project rules

- Colour maths changes need a test with known reference values (APCA and WCAG have published ones).
- Never animate colour changes in the UI: it makes comparisons misleading.
- Keep every export format valid: CSS, Tailwind v4 `@theme` and DTCG JSON have snapshot tests.

## Good first issues

Issues labelled [good first issue](https://github.com/Murali1801/tonal/labels/good%20first%20issue) are small and self-contained. Comment on one before you start so two people don't pick the same thing.

## Pull requests

- One change per pull request, with a short description of what and why.
- Add or update tests when you change logic.
- Screenshots or a short screen recording help for anything visual.

## Code of conduct

Be kind and assume good intent. Harassment or personal attacks aren't tolerated.
