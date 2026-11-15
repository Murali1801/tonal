/** Tiny DOM helpers. No framework: the app is one screen with a few live regions. */

type Child = Node | string | number | null | undefined | false;
type Props = Record<string, unknown>;

const PROPS = new Set(['value', 'checked', 'disabled', 'selected', 'hidden', 'textContent', 'htmlFor', 'tabIndex']);

function apply(el: Element, props: Props) {
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.setAttribute('class', String(v));
    else if (k === 'text') el.textContent = String(v);
    else if (k.startsWith('on') && typeof v === 'function') {
      el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
    } else if (PROPS.has(k)) (el as unknown as Record<string, unknown>)[k] = v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
}

function append(el: Element, children: Child[]) {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    el.append(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
  }
}

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Props = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  apply(el, props);
  append(el, children);
  return el;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

export function s<K extends keyof SVGElementTagNameMap>(
  tag: K,
  props: Props = {},
  ...children: Child[]
): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVG_NS, tag);
  apply(el, props);
  append(el, children);
  return el;
}

let live: HTMLElement | null = null;

/** Announce a short message to screen readers. */
export function announce(msg: string) {
  if (!live) {
    live = h('div', { class: 'sr-only', 'aria-live': 'polite', role: 'status' });
    document.body.append(live);
  }
  live.textContent = '';
  requestAnimationFrame(() => {
    if (live) live.textContent = msg;
  });
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = h('textarea', { value: text, 'aria-hidden': 'true', class: 'sr-only' });
    document.body.append(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    ta.remove();
    return ok;
  }
}

/** A copy button that shows "Copied" for a moment. */
export function copyButton(label: string, get: () => string, cls = 'btn'): HTMLButtonElement {
  const btn = h('button', { type: 'button', class: cls }, label);
  let timer = 0;
  btn.addEventListener('click', async () => {
    const ok = await copyText(get());
    btn.textContent = ok ? 'Copied' : 'Copy failed';
    btn.dataset.state = ok ? 'done' : 'error';
    announce(ok ? `${label}: copied to clipboard` : 'Copy failed');
    clearTimeout(timer);
    timer = window.setTimeout(() => {
      btn.textContent = label;
      delete btn.dataset.state;
    }, 1400);
  });
  return btn;
}

/** Segmented control built on real radio inputs (keyboard + screen reader friendly). */
export function segmented<T extends string>(
  name: string,
  label: string,
  options: readonly { value: T; label: string; title?: string }[],
  current: T,
  onChange: (v: T) => void,
): { el: HTMLElement; set: (v: T) => void } {
  const inputs: HTMLInputElement[] = [];
  const el = h(
    'fieldset',
    { class: 'seg' },
    h('legend', { class: 'sr-only' }, label),
    ...options.map((o) => {
      const input = h('input', {
        type: 'radio',
        name,
        value: o.value,
        checked: o.value === current,
        onChange: () => onChange(o.value),
      });
      inputs.push(input);
      return h('label', { class: 'seg-opt', title: o.title }, input, h('span', {}, o.label));
    }),
  );
  return {
    el,
    set: (v: T) => inputs.forEach((i) => (i.checked = i.value === v)),
  };
}

export interface Dropdown<T extends string> {
  el: HTMLElement;
  set: (v: T) => void;
  setOptions: (opts: readonly { value: T; label: string }[], v: T) => void;
}

let dropdownSeq = 0;
let openDropdown: (() => void) | null = null;

/**
 * Dropdown drawn in Tonal's own style. A hidden native <select> stays the source
 * of truth; the visible control is a button + role="listbox" popup with
 * arrow keys, Home/End, type-to-find, Enter/Space, Esc and click-outside.
 */
export function dropdown<T extends string>(
  label: string,
  options: readonly { value: T; label: string }[],
  current: T,
  onChange: (v: T) => void,
  cls = '',
): Dropdown<T> {
  const id = `dd${++dropdownSeq}`;
  let opts = [...options];
  const native = h('select', { tabIndex: -1, 'aria-hidden': 'true', class: 'sr-only' });
  const valueEl = h('span', { class: 'dd-value' });
  const btn = h(
    'button',
    {
      type: 'button',
      class: 'dd-btn',
      'aria-haspopup': 'listbox',
      'aria-expanded': 'false',
      'aria-label': label,
      'aria-controls': `${id}-list`,
    },
    valueEl,
    s('svg', { viewBox: '0 0 10 6', width: 10, height: 6, 'aria-hidden': 'true', class: 'dd-chev' }, s('path', { d: 'M1 1l4 4 4-4', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.5 })),
  );
  const list = h('ul', { class: 'dd-list', role: 'listbox', id: `${id}-list`, tabIndex: -1, 'aria-label': label });
  const el = h('div', { class: `dd ${cls}` }, native, btn);
  let active = 0;

  const fill = (v: T) => {
    native.replaceChildren(...opts.map((o) => h('option', { value: o.value, selected: o.value === v }, o.label)));
    native.value = v;
    valueEl.textContent = opts.find((o) => o.value === v)?.label ?? '';
  };
  fill(current);

  const renderList = () => {
    list.replaceChildren(
      ...opts.map((o, i) =>
        h(
          'li',
          {
            role: 'option',
            id: `${id}-o${i}`,
            class: `dd-opt${i === active ? ' is-active' : ''}`,
            'aria-selected': String(o.value === native.value),
            onPointerdown: (e: Event) => e.preventDefault(),
            onClick: () => choose(i),
            onPointermove: () => setActive(i),
          },
          o.label,
        ),
      ),
    );
    list.setAttribute('aria-activedescendant', `${id}-o${active}`);
  };
  const setActive = (i: number) => {
    active = Math.max(0, Math.min(opts.length - 1, i));
    list.querySelectorAll('.dd-opt').forEach((n, j) => n.classList.toggle('is-active', j === active));
    list.setAttribute('aria-activedescendant', `${id}-o${active}`);
    (list.children[active] as HTMLElement | undefined)?.scrollIntoView({ block: 'nearest' });
  };
  const place = () => {
    const r = btn.getBoundingClientRect();
    const below = window.innerHeight - r.bottom;
    const hgt = Math.min(260, opts.length * 34 + 8);
    list.style.minWidth = `${Math.max(r.width, 120)}px`;
    list.style.left = `${Math.min(r.left, window.innerWidth - Math.max(r.width, 120) - 8)}px`;
    if (below < hgt + 8 && r.top > below) {
      list.style.top = '';
      list.style.bottom = `${window.innerHeight - r.top + 4}px`;
    } else {
      list.style.bottom = '';
      list.style.top = `${r.bottom + 4}px`;
    }
  };
  const onOutside = (e: Event) => {
    if (!el.contains(e.target as Node) && !list.contains(e.target as Node)) close(false);
  };
  const onViewport = () => close(false);
  const open = () => {
    if (openDropdown) openDropdown();
    active = Math.max(0, opts.findIndex((o) => o.value === native.value));
    renderList();
    (btn.closest('dialog') ?? document.body).append(list);
    place();
    btn.setAttribute('aria-expanded', 'true');
    list.focus({ preventScroll: true });
    setActive(active);
    document.addEventListener('pointerdown', onOutside, true);
    window.addEventListener('resize', onViewport);
    document.addEventListener('scroll', onViewport, true);
    openDropdown = () => close(false);
  };
  const close = (refocus: boolean) => {
    if (!list.isConnected) return;
    list.remove();
    btn.setAttribute('aria-expanded', 'false');
    document.removeEventListener('pointerdown', onOutside, true);
    window.removeEventListener('resize', onViewport);
    document.removeEventListener('scroll', onViewport, true);
    openDropdown = null;
    if (refocus) btn.focus();
  };
  const choose = (i: number) => {
    const o = opts[i];
    if (!o) return;
    const changed = o.value !== native.value;
    fill(o.value);
    close(true);
    if (changed) onChange(o.value);
  };

  btn.addEventListener('click', () => (list.isConnected ? close(true) : open()));
  btn.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      open();
    }
  });
  let typed = '';
  let typedTimer = 0;
  list.addEventListener('keydown', (e) => {
    const k = e.key;
    if (k === 'ArrowDown') setActive(active + 1);
    else if (k === 'ArrowUp') setActive(active - 1);
    else if (k === 'Home') setActive(0);
    else if (k === 'End') setActive(opts.length - 1);
    else if (k === 'Enter' || k === ' ') choose(active);
    else if (k === 'Escape') close(true);
    else if (k === 'Tab') {
      close(false);
      return;
    } else if (k.length === 1) {
      typed += k.toLowerCase();
      clearTimeout(typedTimer);
      typedTimer = window.setTimeout(() => (typed = ''), 600);
      const i = opts.findIndex((o) => o.label.toLowerCase().startsWith(typed));
      if (i >= 0) setActive(i);
    } else return;
    e.preventDefault();
  });
  list.addEventListener('blur', (e) => {
    if (!el.contains((e as FocusEvent).relatedTarget as Node)) close(false);
  });

  return {
    el,
    set: (v: T) => fill(v),
    setOptions: (o, v) => {
      opts = [...o];
      fill(v);
    },
  };
}

/** Rebuild part of the DOM and put focus back on the control with the same aria-label. */
export function preserveFocus(container: HTMLElement, rebuild: () => void) {
  const active = document.activeElement as HTMLElement | null;
  const key = active && container.contains(active) ? active.getAttribute('aria-label') : null;
  rebuild();
  if (key) {
    const next = Array.from(container.querySelectorAll<HTMLElement>('[aria-label]')).find(
      (n) => n.getAttribute('aria-label') === key,
    );
    next?.focus({ preventScroll: true });
  }
}

export const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
