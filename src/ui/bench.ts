/** The bench: lens bar, swatch matrix with the contrast lens, live preview, contrast matrix. */
import {
  BLACK,
  THRESHOLDS,
  THRESHOLD_NOTE,
  WHITE,
  apcaLevel,
  columnSpread,
  contrastOf,
  stepRole,
  wcagLevel,
  type Metric,
  type Tile,
} from '../core';
import { copyButton, dropdown, h, preserveFocus, segmented } from './dom';
import { store, type TileRef } from './store';

type Lum = { y: number; ys: number };

const bgOf = (t: Tile) => (store.palette.gamut === 'p3' ? t.css : t.hex);
const metric = () => store.state.metric;
const threshold = () => store.state.threshold;

/** Contrast of text on background in the current metric; APCA as |Lc|. */
function score(text: Lum, bg: Lum, m: Metric = metric()): number {
  const v = contrastOf(text, bg, m);
  return m === 'apca' ? Math.abs(v) : v;
}

function fmtScore(v: number, m: Metric = metric()): string {
  return m === 'wcag' ? v.toFixed(v >= 10 ? 1 : 2) : String(Math.round(v));
}

/** White or black text, whichever reads better on this tile. */
function inkFor(t: Lum): { ink: '#fff' | '#000'; lum: Lum } {
  return score(WHITE, t) >= score(BLACK, t) ? { ink: '#fff', lum: WHITE } : { ink: '#000', lum: BLACK };
}

/** Tile badge: a level tag (hidden on narrow tiles by a container query) and the value. */
function badge(el: Element, v: number, m: Metric = metric()) {
  const lv = m === 'wcag' ? wcagLevel(v) : 'Lc';
  el.replaceChildren(
    ...(lv === 'fail' ? [] : [h('span', { class: 't-lvl' }, lv === 'AA18' ? 'AA18' : lv)]),
    fmtScore(v, m),
  );
}

export function mountBench(root: HTMLElement) {
  // ---------- lens bar ----------
  const lensInfo = h('div', { class: 'lens-info' });
  const metricSeg = segmented(
    'metric',
    'Contrast metric',
    [
      { value: 'wcag', label: 'WCAG 2.2', title: 'Contrast ratio, 1 to 21' },
      { value: 'apca', label: 'APCA', title: 'APCA 0.0.98G-4g lightness contrast Lc' },
    ],
    metric(),
    (v) =>
      store.update((s) => {
        s.metric = v;
        s.threshold = v === 'wcag' ? 4.5 : 60;
      }),
  );
  const thrOpts = (m: Metric) =>
    THRESHOLDS[m].map((t) => ({
      value: String(t),
      label: `${m === 'wcag' ? `${t}:1` : `Lc ${t}`} ${THRESHOLD_NOTE[`${m}:${t}`] ?? ''}`.trim(),
    }));
  const thr = dropdown('Pass threshold', thrOpts(metric()), String(threshold()), (v) =>
    store.update((s) => (s.threshold = Number(v))),
  );
  const lensBar = h(
    'div',
    { class: 'lensbar' },
    lensInfo,
    h('div', { class: 'lens-ctl' }, metricSeg.el, h('span', { class: 'lens-pass mono' }, 'pass'), thr.el),
  );

  // ---------- matrix ----------
  const matrix = h('div', { class: 'matrix', role: 'grid', 'aria-label': 'Palette, hues by steps', 'aria-describedby': 'lens-help' });
  const matrixScroll = h('div', { class: 'matrix-scroll' }, matrix);
  const help = h(
    'p',
    { class: 'bench-help', id: 'lens-help' },
    'Hover or focus a tile: every tile shows its contrast against it, and pairs under the threshold are hatched. Click or Enter pins it, Esc unpins, arrow keys move, C copies.',
  );
  let tiles: HTMLElement[][] = [];
  let colHeads: HTMLElement[] = [];
  let rowHeads: HTMLElement[] = [];

  function buildMatrix() {
    const p = store.palette;
    const n = p.labels.length;
    matrix.style.setProperty('--cols', String(n));
    const head = h(
      'div',
      { role: 'row', class: 'mrow' },
      h('div', { role: 'columnheader', class: 'corner mono' }, 'hue / step'),
    );
    colHeads = p.labels.map((l, i) => {
      const c = h(
        'div',
        { role: 'columnheader', class: 'colhead' },
        h('span', { class: 'ch-label mono' }, l),
        h('span', { class: 'ch-role' }, stepRole(p.positions[i] ?? 0)),
        h('span', { class: 'ch-spread mono', title: 'Spread of contrast on white across hues at this step' }),
      );
      head.append(c);
      return c;
    });
    rowHeads = [];
    tiles = p.tiles.map((row, hi) => {
      const rh = h('div', { role: 'rowheader', class: 'rowhead' }, h('span', { class: 'rh-name' }), h('span', { class: 'rh-meta mono' }));
      rowHeads.push(rh);
      const r = h('div', { role: 'row', class: 'mrow' }, rh);
      const cells = row.map((_, si) => {
        const cell = h(
          'div',
          { role: 'gridcell', class: 'tile', tabindex: -1, 'data-h': hi, 'data-s': si },
          h('span', { class: 't-top mono' }),
          h('span', { class: 't-val mono' }),
          h('span', { class: 't-gamut', 'aria-hidden': 'true' }),
          h('span', { class: 't-lock', 'aria-hidden': 'true' }),
        );
        r.append(cell);
        return cell;
      });
      matrix.append(r);
      return cells;
    });
    matrix.prepend(head);
  }

  function paintMatrix() {
    const p = store.palette;
    const m = metric();
    const thrV = threshold();
    const anchorRef = store.anchor;
    const anchor = anchorRef ? p.tiles[anchorRef.hue]?.[anchorRef.step] : undefined;
    const focus = store.view.focus;
    matrix.classList.toggle('lens', !!anchor);
    p.labels.forEach((_, i) => {
      const sp = columnSpread(p, i, m);
      const el = colHeads[i]?.querySelector('.ch-spread');
      if (el) el.textContent = `Δ ${m === 'wcag' ? sp.toFixed(2) : sp.toFixed(1)}`;
      colHeads[i]?.classList.toggle('is-even', sp < (m === 'wcag' ? 0.05 : 0.5));
    });
    p.tiles.forEach((row, hi) => {
      const rh = rowHeads[hi];
      if (rh) {
        rh.querySelector('.rh-name')!.textContent = row[0]?.name ?? '';
        rh.querySelector('.rh-meta')!.textContent = `h ${Math.round(store.state.hues[hi]?.h ?? 0)}°`;
      }
      row.forEach((t, si) => {
        const el = tiles[hi]?.[si];
        if (!el) return;
        el.style.background = bgOf(t);
        (el.querySelector('.t-gamut') as HTMLElement).style.backgroundColor = t.p3Only ? t.hex : '';
        const { ink, lum } = inkFor(t);
        el.style.color = ink;
        el.classList.toggle('p3', t.p3Only);
        el.classList.toggle('locked', t.lockedBy.length > 0);
        el.tabIndex = hi === focus.hue && si === focus.step ? 0 : -1;
        const top = el.querySelector('.t-top')!;
        const val = el.querySelector('.t-val')!;
        const isAnchor = !!anchorRef && anchorRef.hue === hi && anchorRef.step === si;
        el.classList.toggle('is-anchor', isAnchor);
        el.classList.toggle('is-pinned', isAnchor && !!store.view.pinned);
        let label: string;
        if (anchor) {
          if (isAnchor) {
            top.textContent = store.view.pinned ? 'pinned' : 'anchor';
            val.textContent = 'bg';
            el.classList.remove('fail');
            label = `${t.name} ${t.label}, lens anchor`;
          } else {
            const v = score(t, anchor, m);
            const pass = v >= thrV;
            top.textContent = t.label;
            val.textContent = fmtScore(v, m);
            el.classList.toggle('fail', !pass);
            label = `${t.name} ${t.label} on ${anchor.name} ${anchor.label}: ${m === 'wcag' ? `${fmtScore(v, m)} to 1` : `Lc ${fmtScore(v, m)}`}, ${pass ? 'passes' : 'fails'}`;
          }
        } else {
          el.classList.remove('fail');
          const v = score(lum, t, m);
          top.textContent = (t.color.l * 100).toFixed(1);
          badge(val, v, m);
          label = `${t.name} ${t.label}, ${t.css}, ${t.hex}${t.p3Only ? ', needs P3' : ''}${t.lockedBy.length ? ', locked by a constraint' : ''}, ${ink === '#fff' ? 'white' : 'black'} text ${m === 'wcag' ? `${fmtScore(v, m)} to 1` : `Lc ${fmtScore(v, m)}`}`;
        }
        el.setAttribute('aria-label', label);
      });
    });
    paintLensInfo(anchor);
  }

  function paintLensInfo(anchor: Tile | undefined) {
    const m = metric();
    if (!anchor) {
      lensInfo.replaceChildren(
        h('span', { class: 'lens-idle' }, h('span', { class: 'mark', 'aria-hidden': 'true' }), 'Contrast lens: hover or focus a tile'),
      );
      return;
    }
    const w = score(WHITE, anchor, m);
    const b = score(BLACK, anchor, m);
    const parts: (Node | null)[] = [
      h('span', { class: 'lens-chip', style: `background:${bgOf(anchor)}`, 'aria-hidden': 'true' }),
      h('strong', { class: 'lens-name' }, `${anchor.name} ${anchor.label}`),
      h('code', { class: 'mono lens-val' }, anchor.css),
      copyButton('Copy oklch', () => anchor.css, 'btn btn-xs'),
      h('code', { class: 'mono lens-val' }, anchor.hex),
      copyButton('Copy hex', () => anchor.hex, 'btn btn-xs'),
      h('span', { class: 'mono lens-vs' }, `white ${fmtScore(w, m)} · black ${fmtScore(b, m)}`),
      anchor.p3Only ? h('span', { class: 'lens-tag' }, 'P3 only') : null,
      store.view.pinned
        ? h('button', { type: 'button', class: 'btn btn-xs', onClick: () => store.setView({ pinned: null }) }, 'Unpin')
        : null,
    ];
    lensInfo.replaceChildren(...parts.filter((n): n is Node => n !== null));
  }

  // lens events
  const refOf = (el: EventTarget | null): TileRef | null => {
    const t = (el as HTMLElement | null)?.closest?.('.tile') as HTMLElement | null;
    if (!t) return null;
    return { hue: Number(t.dataset.h), step: Number(t.dataset.s) };
  };
  const same = (a: TileRef | null, b: TileRef | null) => !!a && !!b && a.hue === b.hue && a.step === b.step;

  matrix.addEventListener('pointerover', (e) => {
    if ((e as PointerEvent).pointerType === 'touch') return;
    const r = refOf(e.target);
    if (r && !same(r, store.view.hover)) store.setView({ hover: r });
  });
  matrix.addEventListener('pointerleave', () => {
    if (store.view.hover && !matrix.contains(document.activeElement)) store.setView({ hover: null });
    else if (store.view.hover) store.setView({ hover: store.view.focus });
  });
  matrix.addEventListener('focusin', (e) => {
    const r = refOf(e.target);
    if (r) store.setView({ hover: r, focus: r });
  });
  matrix.addEventListener('focusout', (e) => {
    if (!matrix.contains((e as FocusEvent).relatedTarget as Node)) store.setView({ hover: null });
  });
  matrix.addEventListener('click', (e) => {
    const r = refOf(e.target);
    if (!r) return;
    store.setView({ pinned: same(r, store.view.pinned) ? null : r, focus: r, hover: r });
    tiles[r.hue]?.[r.step]?.focus({ preventScroll: true });
  });
  matrix.addEventListener('keydown', (e) => {
    const r = refOf(e.target);
    if (!r) return;
    const rows = store.palette.tiles.length;
    const cols = store.palette.labels.length;
    let { hue, step } = r;
    switch (e.key) {
      case 'ArrowRight':
        step = Math.min(cols - 1, step + 1);
        break;
      case 'ArrowLeft':
        step = Math.max(0, step - 1);
        break;
      case 'ArrowDown':
        hue = Math.min(rows - 1, hue + 1);
        break;
      case 'ArrowUp':
        hue = Math.max(0, hue - 1);
        break;
      case 'Home':
        step = 0;
        if (e.ctrlKey) hue = 0;
        break;
      case 'End':
        step = cols - 1;
        if (e.ctrlKey) hue = rows - 1;
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        store.setView({ pinned: same(r, store.view.pinned) ? null : r });
        return;
      case 'Escape':
        if (store.view.pinned) {
          e.preventDefault();
          store.setView({ pinned: null });
        }
        return;
      case 'c':
      case 'C': {
        const t = store.palette.tiles[hue]?.[step];
        if (t && !e.ctrlKey && !e.metaKey) {
          e.preventDefault();
          (lensInfo.querySelector('.btn') as HTMLButtonElement | null)?.click();
        }
        return;
      }
      default:
        return;
    }
    e.preventDefault();
    const next = { hue, step };
    store.setView({ focus: next, hover: next });
    const el = tiles[hue]?.[step];
    if (el) {
      el.tabIndex = 0;
      el.focus();
    }
  });

  // ---------- preview ----------
  const pvHues = h('div', { class: 'pv-hues', role: 'radiogroup', 'aria-label': 'Preview hue' });
  const pvMode = segmented(
    'pvmode',
    'Preview theme',
    [
      { value: 'light', label: 'Light' },
      { value: 'dark', label: 'Dark' },
    ],
    'light',
    (v) => store.setView({ previewDark: v === 'dark' }),
  );
  const pvCanvas = h('div', { class: 'pv-canvas' });
  const pvNotes = h('ul', { class: 'pv-notes mono', 'aria-label': 'Contrast of the preview pairs' });
  const pvInput = h('input', { type: 'text', class: 'pv-input', id: 'pv-input', placeholder: 'you@studio.com', autocomplete: 'off' });
  const pvBtn = h('button', { type: 'button', class: 'pv-btn' }, 'Save changes');
  const pvBtn2 = h('button', { type: 'button', class: 'pv-btn2' }, 'Cancel');
  const pvBadge = h('span', { class: 'pv-badge' }, 'In review');
  const pvBadge2 = h('span', { class: 'pv-badge2' }, 'New');
  const pvAlert = h(
    'div',
    { class: 'pv-alert', role: 'note' },
    h('span', { class: 'pv-alert-mark', 'aria-hidden': 'true' }),
    h('div', {}, h('p', { class: 'pv-alert-title' }, 'Invoice 0142 is due Friday'), h('p', { class: 'pv-alert-body' }, 'Send it before 6 pm IST to keep the early payment rate.')),
  );
  const pvLink = h('a', { class: 'pv-link', href: '#preview', onClick: (e: Event) => e.preventDefault() }, 'View invoice');
  pvCanvas.append(
    h(
      'div',
      { class: 'pv-col' },
      h('div', { class: 'pv-row' }, pvBtn, pvBtn2),
      h('div', { class: 'pv-row' }, pvBadge, pvBadge2, pvLink),
    ),
    pvAlert,
    h('div', { class: 'pv-field' }, h('label', { class: 'pv-label', htmlFor: 'pv-input' }, 'Billing email'), pvInput),
  );
  const preview = h(
    'section',
    { class: 'bench-sec preview', 'aria-labelledby': 'pv-h', id: 'preview' },
    h('header', { class: 'sec-head' }, h('h2', { id: 'pv-h', class: 'sec-h' }, 'In use'), pvHues, pvMode.el),
    pvCanvas,
    pvNotes,
  );

  function buildPvHues() {
    pvHues.replaceChildren(
      ...store.state.hues.map((hue, i) => {
        const b = h(
          'button',
          {
            type: 'button',
            role: 'radio',
            class: 'pv-hue',
            'aria-checked': String(i === store.view.previewHue),
            'aria-label': hue.name,
            title: hue.name,
            tabIndex: i === store.view.previewHue ? 0 : -1,
            onClick: () => store.setView({ previewHue: i }),
          },
          h('span', { class: 'pv-hue-chip', 'aria-hidden': 'true' }),
        );
        return b;
      }),
    );
  }
  pvHues.addEventListener('keydown', (e) => {
    const n = store.state.hues.length;
    let i = store.view.previewHue;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') i = (i + 1) % n;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') i = (i - 1 + n) % n;
    else return;
    e.preventDefault();
    store.setView({ previewHue: i });
    (pvHues.children[i] as HTMLElement | undefined)?.focus();
  });

  /** Index of the step closest to position t. */
  const at = (t: number) => {
    const pos = store.palette.positions;
    let best = 0;
    pos.forEach((p, i) => {
      if (Math.abs(p - t) < Math.abs((pos[best] ?? 0) - t)) best = i;
    });
    return best;
  };

  function paintPreview() {
    const p = store.palette;
    const hi = Math.min(store.view.previewHue, p.tiles.length - 1);
    const row = p.tiles[hi]!;
    // Neutral: the hue with the least chroma.
    let ni = 0;
    store.state.hues.forEach((x, i) => {
      if (x.c < (store.state.hues[ni]?.c ?? 1)) ni = i;
    });
    const nrow = p.tiles[ni]!;
    const dark = store.view.previewDark;
    const T = (t: number) => row[at(dark ? 1 - t : t)]!;
    const N = (t: number) => nrow[at(dark ? 1 - t : t)]!;
    const canvas = N(0);
    const solid = row[at(0.61)]!;
    const solidHover = row[at(dark ? 0.5 : 0.72)]!;
    const solidInk = inkFor(solid);
    const badge2 = row[at(0.61)]!;
    const badge2Ink = inkFor(badge2);
    const vars: Record<string, string> = {
      '--pv-canvas': bgOf(canvas),
      '--pv-solid': bgOf(solid),
      '--pv-solid-hover': bgOf(solidHover),
      '--pv-solid-ink': solidInk.ink,
      '--pv-outline': bgOf(T(0.28)),
      '--pv-outline-text': bgOf(T(0.72)),
      '--pv-badge-bg': bgOf(T(0.06)),
      '--pv-badge-text': bgOf(T(0.83)),
      '--pv-badge2-bg': bgOf(badge2),
      '--pv-badge2-ink': badge2Ink.ink,
      '--pv-alert-bg': bgOf(T(0)),
      '--pv-alert-border': bgOf(T(0.17)),
      '--pv-alert-title': bgOf(T(0.94)),
      '--pv-alert-body': bgOf(T(0.83)),
      '--pv-alert-mark': bgOf(T(0.5)),
      '--pv-link': bgOf(T(0.72)),
      '--pv-label': bgOf(N(0.94)),
      '--pv-input-border': bgOf(N(0.5)),
      '--pv-input-text': bgOf(N(0.94)),
      '--pv-placeholder': bgOf(N(0.61)),
      '--pv-ring': bgOf(T(0.5)),
    };
    for (const [k, v] of Object.entries(vars)) pvCanvas.style.setProperty(k, v);

    const m = metric();
    const fmt = (v: number) => (m === 'wcag' ? `${fmtScore(v, m)}:1` : `Lc ${fmtScore(v, m)}`);
    const pairs: [string, Lum, Tile, number][] = [
      [`Button text on ${solid.label}`, solidInk.lum, solid, threshold()],
      [`Badge ${T(0.83).label} on ${T(0.06).label}`, T(0.83), T(0.06), threshold()],
      [`Alert body ${T(0.83).label} on ${T(0).label}`, T(0.83), T(0), threshold()],
      [`Link ${T(0.72).label} on canvas`, T(0.72), canvas, threshold()],
      [`Input border ${N(0.5).label} vs canvas`, N(0.5), canvas, m === 'wcag' ? 3 : 30],
    ];
    pvNotes.replaceChildren(
      ...pairs.map(([label, fg, bg, need]) => {
        const v = score(fg, bg, m);
        const ok = v >= need;
        return h(
          'li',
          { 'data-state': ok ? 'ok' : 'bad' },
          h('span', { class: 'pv-dot', 'aria-hidden': 'true' }),
          `${label} `,
          h('strong', {}, fmt(v)),
          ` ${ok ? 'passes' : 'below'} ${m === 'wcag' ? `${need}:1` : `Lc ${need}`}`,
        );
      }),
    );
    Array.from(pvHues.children).forEach((b, i) => {
      const el = b as HTMLElement;
      el.setAttribute('aria-checked', String(i === hi));
      el.tabIndex = i === hi ? 0 : -1;
      const chip = el.firstElementChild as HTMLElement;
      const t = p.tiles[i]?.[at(0.5)];
      if (t) chip.style.background = bgOf(t);
    });
    pvMode.set(dark ? 'dark' : 'light');
  }

  // ---------- contrast matrix ----------
  const hueOpts = () => store.state.hues.map((x, i) => ({ value: String(i), label: x.name }));
  const cmText = dropdown('Text hue', hueOpts(), String(store.view.cmText), (v) => store.setView({ cmText: Number(v) }));
  const cmBg = dropdown('Background hue', hueOpts(), String(store.view.cmBg), (v) => store.setView({ cmBg: Number(v) }));
  const cmGrid = h('div', { class: 'cm-grid', role: 'table', 'aria-label': 'Contrast matrix: text steps by background steps' });
  const cmScroll = h('div', { class: 'cm-scroll', tabindex: 0, 'aria-label': 'Contrast matrix, scrollable' }, cmGrid);
  const cmLegend = h('p', { class: 'cm-legend mono' });
  const cm = h(
    'section',
    { class: 'bench-sec', 'aria-labelledby': 'cm-h' },
    h(
      'header',
      { class: 'sec-head' },
      h('h2', { id: 'cm-h', class: 'sec-h' }, 'Contrast matrix'),
      h('div', { class: 'cm-pick' }, h('span', { class: 'field-label' }, 'text'), cmText.el, h('span', { class: 'field-label' }, 'on'), cmBg.el),
    ),
    cmScroll,
    cmLegend,
  );
  let cmCells: HTMLElement[][] = [];

  function buildCm() {
    const labels = store.palette.labels;
    cmGrid.style.setProperty('--cols', String(labels.length));
    const head = h(
      'div',
      { role: 'row', class: 'mrow' },
      h('div', { role: 'columnheader', class: 'corner mono' }, 'text \\ bg'),
      ...labels.map((l) => h('div', { role: 'columnheader', class: 'cm-ch mono' }, l)),
    );
    cmCells = labels.map((l) => {
      const cells = labels.map(() => h('div', { role: 'cell', class: 'cm-cell mono' }));
      cmGrid.append(h('div', { role: 'row', class: 'mrow' }, h('div', { role: 'rowheader', class: 'cm-rh mono' }, l), ...cells));
      return cells;
    });
    cmGrid.prepend(head);
  }

  function paintCm() {
    const p = store.palette;
    const m = metric();
    const thrV = threshold();
    const tr = p.tiles[Math.min(store.view.cmText, p.tiles.length - 1)]!;
    const br = p.tiles[Math.min(store.view.cmBg, p.tiles.length - 1)]!;
    let passing = 0;
    tr.forEach((tt, i) =>
      br.forEach((bt, j) => {
        const el = cmCells[i]?.[j];
        if (!el) return;
        const v = score(tt, bt, m);
        const pass = v >= thrV;
        if (pass) passing++;
        el.style.background = bgOf(bt);
        el.style.color = bgOf(tt);
        el.textContent = fmtScore(v, m);
        el.classList.toggle('fail', !pass);
        el.title = `${tt.name} ${tt.label} on ${bt.name} ${bt.label}: ${m === 'wcag' ? `${fmtScore(v, m)}:1` : `Lc ${fmtScore(v, m)} (${apcaLevel(v)})`}`;
      }),
    );
    const total = tr.length * br.length;
    cmLegend.textContent = `${passing} of ${total} pairs pass ${m === 'wcag' ? `${thrV}:1` : `Lc ${thrV}`}. Each cell is the text step drawn on the background step; hatched cells fail.`;
    cmText.setOptions(hueOpts(), String(Math.min(store.view.cmText, p.tiles.length - 1)));
    cmBg.setOptions(hueOpts(), String(Math.min(store.view.cmBg, p.tiles.length - 1)));
  }

  root.append(
    h('section', { class: 'bench-sec bench-matrix', 'aria-label': 'Swatch matrix' }, lensBar, matrixScroll, help),
    preview,
    cm,
  );

  const rebuild = () => {
    preserveFocus(matrix, () => {
      matrix.replaceChildren();
      buildMatrix();
    });
    cmGrid.replaceChildren();
    buildCm();
    buildPvHues();
  };
  rebuild();
  const paint = () => {
    paintMatrix();
    paintPreview();
    paintCm();
  };
  paint();

  let pvKey = '';
  let cmKey = '';
  store.on((why) => {
    if (why === 'structure' || why === 'load') rebuild();
    if (why !== 'view') {
      metricSeg.set(metric());
      thr.setOptions(thrOpts(metric()), String(threshold()));
      paint();
      pvKey = cmKey = '';
      return;
    }
    // View-only change: repaint the lens, and the other parts only if their inputs changed.
    paintMatrix();
    const v = store.view;
    const pk = `${v.previewHue}:${v.previewDark}`;
    const ck = `${v.cmText}:${v.cmBg}`;
    if (pk !== pvKey) paintPreview();
    if (ck !== cmKey) paintCm();
    pvKey = pk;
    cmKey = ck;
  });
}
