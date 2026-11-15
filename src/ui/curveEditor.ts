/** Draggable SVG curve editors for lightness (cubic bezier) and chroma (start, peak, end). */
import { chromaShape, clamp } from '../core';
import { s } from './dom';
import { store } from './store';

const W = 240;
const H = 132;
const PAD = 12;
const X = (t: number) => PAD + t * (W - PAD * 2);
const Y = (v: number) => H - PAD - v * (H - PAD * 2);
const fromX = (x: number) => (x - PAD) / (W - PAD * 2);
const fromY = (y: number) => (H - PAD - y) / (H - PAD * 2);

interface HandleSpec {
  label: string;
  /** Current position in unit space (t, v). */
  get: () => [number, number];
  /** Apply a new unit position; return nothing. */
  set: (t: number, v: number) => void;
  axes: 'xy' | 'x' | 'y';
  describe: () => string;
}

function svgPoint(svg: SVGSVGElement, e: PointerEvent): [number, number] {
  const m = svg.getScreenCTM();
  if (!m) return [0, 0];
  const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
  return [p.x, p.y];
}

function grid(): SVGGElement {
  const g = s('g', { class: 'ce-grid', 'aria-hidden': 'true' });
  for (let i = 0; i <= 4; i++) {
    const y = Y(i / 4);
    g.append(s('line', { x1: PAD, x2: W - PAD, y1: y, y2: y }));
  }
  for (let i = 0; i <= 4; i++) {
    const x = X(i / 4);
    g.append(s('line', { x1: x, x2: x, y1: PAD, y2: H - PAD }));
  }
  return g;
}

function makeHandles(svg: SVGSVGElement, specs: HandleSpec[], onChange: () => void) {
  const nodes = specs.map((spec) => {
    const g = s(
      'g',
      {
        class: `ce-handle ce-${spec.axes}`,
        tabindex: 0,
        role: 'slider',
        'aria-label': spec.label,
        'aria-valuemin': 0,
        'aria-valuemax': 100,
      },
      s('circle', { r: 14, class: 'ce-hit' }),
      s('circle', { r: 5, class: 'ce-dot' }),
    );
    let dragging = false;
    g.addEventListener('pointerdown', (e) => {
      dragging = true;
      g.setPointerCapture(e.pointerId);
      g.classList.add('is-drag');
      e.preventDefault();
      g.focus({ preventScroll: true });
    });
    g.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const [x, y] = svgPoint(svg, e);
      const [t0, v0] = spec.get();
      const t = spec.axes === 'y' ? t0 : clamp(fromX(x), 0, 1);
      const v = spec.axes === 'x' ? v0 : clamp(fromY(y), 0, 1);
      spec.set(t, v);
      onChange();
    });
    const end = () => {
      dragging = false;
      g.classList.remove('is-drag');
    };
    g.addEventListener('pointerup', end);
    g.addEventListener('pointercancel', end);
    g.addEventListener('keydown', (e) => {
      const step = e.shiftKey ? 0.05 : 0.01;
      let [t, v] = spec.get();
      if (e.key === 'ArrowUp' && spec.axes !== 'x') v += step;
      else if (e.key === 'ArrowDown' && spec.axes !== 'x') v -= step;
      else if (e.key === 'ArrowRight' && spec.axes !== 'y') t += step;
      else if (e.key === 'ArrowLeft' && spec.axes !== 'y') t -= step;
      else if (e.key === 'ArrowRight' && spec.axes === 'y') v += step;
      else if (e.key === 'ArrowLeft' && spec.axes === 'y') v -= step;
      else if (e.key === 'ArrowUp' && spec.axes === 'x') t += step;
      else if (e.key === 'ArrowDown' && spec.axes === 'x') t -= step;
      else return;
      e.preventDefault();
      spec.set(clamp(t, 0, 1), clamp(v, 0, 1));
      onChange();
    });
    svg.append(g);
    return { g, spec };
  });
  return () => {
    for (const { g, spec } of nodes) {
      const [t, v] = spec.get();
      g.setAttribute('transform', `translate(${X(t).toFixed(2)} ${Y(v).toFixed(2)})`);
      g.setAttribute('aria-valuenow', String(Math.round((spec.axes === 'x' ? t : v) * 100)));
      g.setAttribute('aria-valuetext', spec.describe());
    }
  };
}

const f2 = (v: number) => v.toFixed(2).replace(/^0\./, '.').replace(/^-0\./, '-.');

/** Lightness: endpoints set the lightest/darkest L; two bezier control points shape the fall. */
export function lightnessEditor(): { el: SVGSVGElement; sync: () => void; readout: () => string } {
  const svg = s('svg', {
    viewBox: `0 0 ${W} ${H}`,
    class: 'curve',
    role: 'group',
    'aria-label': 'Lightness curve editor. Each point is a slider; arrow keys move it, Shift moves faster.',
  });
  svg.append(grid());
  const arms = s('path', { class: 'ce-arm', 'aria-hidden': 'true' });
  const path = s('path', { class: 'ce-path', 'aria-hidden': 'true' });
  const dots = s('g', { class: 'ce-steps', 'aria-hidden': 'true' });
  svg.append(arms, path, dots);
  const L = () => store.state.light;
  const ctrlV = (y: number) => L().start + (L().end - L().start) * y;
  const toY = (v: number) => {
    const d = L().end - L().start;
    return Math.abs(d) < 1e-6 ? 0 : (v - L().start) / d;
  };
  const update = (fn: () => void) => store.update(fn);
  const pct = (v: number) => `${Math.round(v * 1000) / 10}%`;

  const syncHandles = makeHandles(
    svg,
    [
      {
        label: 'Lightest step L',
        axes: 'y',
        get: () => [0, L().start],
        set: (_t, v) => update(() => (L().start = clamp(v, Math.max(0.05, L().end + 0.05), 1))),
        describe: () => `L ${pct(L().start)}`,
      },
      {
        label: 'Darkest step L',
        axes: 'y',
        get: () => [1, L().end],
        set: (_t, v) => update(() => (L().end = clamp(v, 0, Math.min(0.95, L().start - 0.05)))),
        describe: () => `L ${pct(L().end)}`,
      },
      {
        label: 'Curve control point 1',
        axes: 'xy',
        get: () => [L().x1, ctrlV(L().y1)],
        set: (t, v) =>
          update(() => {
            L().x1 = t;
            L().y1 = clamp(toY(v), -0.5, 1.5);
          }),
        describe: () => `x ${f2(L().x1)}, y ${f2(L().y1)}`,
      },
      {
        label: 'Curve control point 2',
        axes: 'xy',
        get: () => [L().x2, ctrlV(L().y2)],
        set: (t, v) =>
          update(() => {
            L().x2 = t;
            L().y2 = clamp(toY(v), -0.5, 1.5);
          }),
        describe: () => `x ${f2(L().x2)}, y ${f2(L().y2)}`,
      },
    ],
    () => sync(),
  );

  const sync = () => {
    const l = L();
    const p0 = [X(0), Y(l.start)];
    const p1 = [X(l.x1), Y(ctrlV(l.y1))];
    const p2 = [X(l.x2), Y(ctrlV(l.y2))];
    const p3 = [X(1), Y(l.end)];
    path.setAttribute('d', `M${p0} C${p1} ${p2} ${p3}`);
    arms.setAttribute('d', `M${p0} L${p1} M${p3} L${p2}`);
    syncHandles();
    // Plot the solved L of the first chromatic hue (what the grid actually uses).
    const pal = store.palette;
    const row = pal.tiles[0];
    dots.replaceChildren(
      ...pal.positions.map((t, i) => s('circle', { cx: X(t), cy: Y(row?.[i]?.color.l ?? 0), r: 2.2 })),
    );
  };
  sync();
  const readout = () => {
    const l = L();
    return `L ${pct(l.start)} to ${pct(l.end)} · cubic-bezier(${f2(l.x1)}, ${f2(l.y1)}, ${f2(l.x2)}, ${f2(l.y2)})`;
  };
  return { el: svg, sync, readout };
}

/** Chroma: a 0..1 multiplier with a start level, a peak position and an end level. */
export function chromaEditor(): { el: SVGSVGElement; sync: () => void; readout: () => string } {
  const svg = s('svg', {
    viewBox: `0 0 ${W} ${H}`,
    class: 'curve',
    role: 'group',
    'aria-label': 'Chroma curve editor. Each point is a slider; arrow keys move it.',
  });
  svg.append(grid());
  const path = s('path', { class: 'ce-path', 'aria-hidden': 'true' });
  const dots = s('g', { class: 'ce-steps', 'aria-hidden': 'true' });
  svg.append(path, dots);
  const C = () => store.state.chroma;
  const update = (fn: () => void) => store.update(fn);
  const pct = (v: number) => `${Math.round(v * 100)}%`;

  const syncHandles = makeHandles(
    svg,
    [
      {
        label: 'Chroma at the lightest step',
        axes: 'y',
        get: () => [0, C().start],
        set: (_t, v) => update(() => (C().start = v)),
        describe: () => `${pct(C().start)} of peak`,
      },
      {
        label: 'Chroma peak position',
        axes: 'x',
        get: () => [C().peak, 1],
        set: (t) => update(() => (C().peak = clamp(t, 0.02, 0.98))),
        describe: () => `peak at ${pct(C().peak)} of the ramp`,
      },
      {
        label: 'Chroma at the darkest step',
        axes: 'y',
        get: () => [1, C().end],
        set: (_t, v) => update(() => (C().end = v)),
        describe: () => `${pct(C().end)} of peak`,
      },
    ],
    () => sync(),
  );

  const sync = () => {
    const c = C();
    const f = chromaShape(c.start, c.peak, c.end);
    let d = '';
    for (let i = 0; i <= 48; i++) {
      const t = i / 48;
      d += `${i ? 'L' : 'M'}${X(t).toFixed(2)},${Y(f(t)).toFixed(2)}`;
    }
    path.setAttribute('d', d);
    syncHandles();
    dots.replaceChildren(...store.palette.positions.map((t) => s('circle', { cx: X(t), cy: Y(f(t)), r: 2.2 })));
  };
  sync();
  const readout = () => {
    const c = C();
    return `start ${pct(c.start)} · peak at ${pct(c.peak)} · end ${pct(c.end)}`;
  };
  return { el: svg, sync, readout };
}
