import './styles.css';
import { h, copyButton, announce } from './ui/dom';
import { mountControls } from './ui/controls';
import { mountBench } from './ui/bench';
import { mountExport } from './ui/exportPanel';

// TODO: replace with a real contact address before launch.
const CONTACT_EMAIL = 'hello@example.com';
const REPO_URL = 'https://github.com/Murali1801/tonal';
const PROFILE_URL = 'https://github.com/Murali1801';

// ---------- theme: system, light, dark ----------
type ThemePref = 'system' | 'light' | 'dark';
const THEME_KEY = 'tonal-theme';
const readTheme = (): ThemePref => {
  try {
    const v = localStorage.getItem(THEME_KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
};
let theme = readTheme();
const applyTheme = () => {
  if (theme === 'system') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', theme);
};
applyTheme();

const app = document.getElementById('app')!;

const themeBtn = h('button', { type: 'button', class: 'btn btn-sm', 'aria-label': 'Colour theme' });
const paintThemeBtn = () => {
  themeBtn.replaceChildren(
    h('span', { class: 'hide-xs' }, 'Theme: '),
    theme === 'system' ? 'System' : theme === 'light' ? 'Light' : 'Dark',
  );
};
paintThemeBtn();
themeBtn.addEventListener('click', () => {
  theme = theme === 'system' ? 'light' : theme === 'light' ? 'dark' : 'system';
  try {
    if (theme === 'system') localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, theme);
  } catch {
    /* storage blocked: the choice still applies for this visit */
  }
  applyTheme();
  paintThemeBtn();
  announce(`Theme: ${theme}`);
});

// ---------- layout ----------
const drawerBtn = h(
  'button',
  { type: 'button', class: 'btn btn-sm drawer-btn', 'aria-controls': 'controls', 'aria-expanded': 'false' },
  'Controls',
);
const top = h(
  'header',
  { class: 'top' },
  drawerBtn,
  h(
    'div',
    { class: 'brand' },
    h('span', { class: 'mark', 'aria-hidden': 'true' }),
    h('h1', { class: 'brand-name' }, 'Tonal'),
    h('span', { class: 'brand-tag mono' }, 'OKLCH colour systems'),
  ),
  h(
    'div',
    { class: 'top-actions' },
    copyButton('Copy link', () => location.href, 'btn btn-sm hide-xs'),
    themeBtn,
    h('a', { class: 'btn btn-sm btn-quiet hide-sm', href: REPO_URL, target: '_blank', rel: 'noopener' }, 'Source'),
  ),
);

const closeBtn = h('button', { type: 'button', class: 'btn btn-sm drawer-close' }, 'Close');
const rail = h(
  'aside',
  { class: 'rail', id: 'controls', 'aria-label': 'Controls' },
  h('div', { class: 'drawer-head' }, h('span', { class: 'rail-title' }, 'Controls'), closeBtn),
);
const railBody = h('div', { class: 'rail-body' });
rail.append(railBody);

const bench = h('div', { class: 'bench' });
const exportEl = h('aside', { class: 'export', 'aria-label': 'Export' });
const work = h('main', { class: 'work', id: 'main' }, bench, exportEl);

const foot = h(
  'footer',
  { class: 'foot' },
  h(
    'span',
    { class: 'sig mono' },
    h('span', { class: 'mark', 'aria-hidden': 'true' }),
    ' Murali · github.com/Murali1801',
  ),
  h(
    'nav',
    { class: 'foot-links', 'aria-label': 'Author' },
    h('a', { href: PROFILE_URL, target: '_blank', rel: 'noopener' }, 'GitHub'),
    copyButton('Copy email', () => CONTACT_EMAIL, 'linkish'),
    h('a', { href: REPO_URL, target: '_blank', rel: 'noopener' }, 'source'),
  ),
  h('span', { class: 'foot-note mono' }, 'WCAG 2.2 · APCA 0.0.98G-4g · CSS Color 4 gamut mapping'),
);
const scrim = h('div', { class: 'scrim', 'aria-hidden': 'true' });

app.append(
  h('a', { class: 'skip', href: '#main' }, 'Skip to the palette'),
  h('div', { class: 'app' }, top, rail, work, foot),
  scrim,
);

mountControls(railBody);
mountBench(bench);
mountExport(exportEl);

// ---------- drawer (below 1024 px) ----------
const narrow = window.matchMedia('(max-width: 1023.98px)');
let open = false;
const setDrawer = (next: boolean) => {
  open = next && narrow.matches;
  document.body.classList.toggle('drawer-open', open);
  drawerBtn.setAttribute('aria-expanded', String(open));
  if (narrow.matches) {
    rail.toggleAttribute('inert', !open);
    if (open) {
      rail.setAttribute('role', 'dialog');
      rail.setAttribute('aria-modal', 'true');
      requestAnimationFrame(() => closeBtn.focus());
    } else {
      rail.removeAttribute('role');
      rail.removeAttribute('aria-modal');
    }
  } else {
    rail.removeAttribute('inert');
    rail.removeAttribute('role');
    rail.removeAttribute('aria-modal');
  }
  top.toggleAttribute('inert', open);
  work.toggleAttribute('inert', open);
  foot.toggleAttribute('inert', open);
};
drawerBtn.addEventListener('click', () => setDrawer(true));
closeBtn.addEventListener('click', () => {
  setDrawer(false);
  drawerBtn.focus();
});
scrim.addEventListener('click', () => setDrawer(false));
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && open && !document.querySelector('.dd-list')) {
    setDrawer(false);
    drawerBtn.focus();
  }
});
narrow.addEventListener('change', () => setDrawer(false));
setDrawer(false);
