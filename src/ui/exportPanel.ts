/** Export panel: CSS custom properties, Tailwind v4 @theme, DTCG JSON. */
import { exportPalette, type ExportKind } from '../core';
import { copyButton, h, prefersReducedMotion } from './dom';
import { store } from './store';

const TABS: { kind: ExportKind; label: string; file: string; note: string }[] = [
  { kind: 'css', label: 'CSS', file: 'tonal.css', note: 'Hex fallback for every browser, OKLCH where supported, P3 values on P3 screens.' },
  { kind: 'tailwind', label: 'Tailwind v4', file: 'theme.css', note: 'An @theme block. Classes like bg-blue-500 work right away.' },
  { kind: 'dtcg', label: 'DTCG JSON', file: 'tokens.json', note: 'Design Tokens Community Group format, with OKLCH components and a hex fallback.' },
];

function highlight(code: string, kind: ExportKind): DocumentFragment {
  const frag = document.createDocumentFragment();
  const re =
    kind === 'dtcg'
      ? /("(?:\\.|[^"\\])*")(\s*:)?|(-?\d+(?:\.\d+)?)/g
      : /(\/\*[\s\S]*?\*\/)|(--[\w-]+)|(oklch\([^)]*\)|#[0-9a-f]{6})|(@[\w-]+)/gi;
  let last = 0;
  for (const m of code.matchAll(re)) {
    const i = m.index ?? 0;
    if (i > last) frag.append(code.slice(last, i));
    let cls = '';
    if (kind === 'dtcg') cls = m[1] ? (m[2] ? 'tk-key' : 'tk-str') : 'tk-num';
    else cls = m[1] ? 'tk-com' : m[2] ? 'tk-key' : m[3] ? 'tk-val' : 'tk-at';
    const span = h('span', { class: cls }, kind === 'dtcg' && m[1] ? m[1] : m[0]);
    frag.append(span);
    if (kind === 'dtcg' && m[2]) frag.append(m[2]);
    last = i + m[0].length;
  }
  frag.append(code.slice(last));
  return frag;
}

export function mountExport(root: HTMLElement) {
  const tabEls = TABS.map((t) =>
    h(
      'button',
      {
        type: 'button',
        role: 'tab',
        id: `tab-${t.kind}`,
        class: 'tab',
        'aria-controls': 'export-panel',
        onClick: () => store.setView({ exportKind: t.kind }),
      },
      t.label,
    ),
  );
  const tablist = h('div', { class: 'tabs', role: 'tablist', 'aria-label': 'Export format' }, ...tabEls);
  tablist.addEventListener('keydown', (e) => {
    const i = TABS.findIndex((t) => t.kind === store.view.exportKind);
    let j = i;
    if (e.key === 'ArrowRight') j = (i + 1) % TABS.length;
    else if (e.key === 'ArrowLeft') j = (i - 1 + TABS.length) % TABS.length;
    else if (e.key === 'Home') j = 0;
    else if (e.key === 'End') j = TABS.length - 1;
    else return;
    e.preventDefault();
    store.setView({ exportKind: TABS[j]!.kind });
    tabEls[j]?.focus();
  });

  const code = h('code', {});
  const pre = h('pre', { class: 'code', tabindex: 0, 'aria-label': 'Export code' }, code);
  const note = h('p', { class: 'export-note' });
  const meta = h('span', { class: 'export-meta mono' });
  let text = '';
  const copy = copyButton('Copy code', () => text, 'btn btn-primary');
  const panel = h(
    'div',
    { class: 'export-body', role: 'tabpanel', id: 'export-panel' },
    h('div', { class: 'export-bar' }, meta, h('div', { class: 'export-actions' }, copyButton('Copy link', () => location.href, 'btn btn-sm show-xs'), copy)),
    note,
    pre,
  );
  root.append(h('div', { class: 'export-head' }, h('h2', { class: 'sec-h' }, 'Export'), tablist), panel);

  let lastKind: ExportKind | null = null;
  const paint = () => {
    const kind = store.view.exportKind;
    const tab = TABS.find((t) => t.kind === kind)!;
    text = exportPalette(store.palette, kind);
    tabEls.forEach((el, i) => {
      const on = TABS[i]!.kind === kind;
      el.setAttribute('aria-selected', String(on));
      el.tabIndex = on ? 0 : -1;
    });
    panel.setAttribute('aria-labelledby', `tab-${kind}`);
    note.textContent = tab.note;
    const lines = text.split('\n').length - 1;
    meta.textContent = `${tab.file} · ${lines} lines`;
    code.replaceChildren(highlight(text, kind));
    if (lastKind !== null && lastKind !== kind && !prefersReducedMotion()) {
      pre.animate([{ opacity: 0.25 }, { opacity: 1 }], { duration: 120, easing: 'cubic-bezier(.2,.7,.2,1)' });
    }
    lastKind = kind;
  };
  paint();
  store.on((why) => {
    if (why !== 'view' || store.view.exportKind !== lastKind) paint();
  });
}
