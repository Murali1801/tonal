/** App store: palette state (shareable, in the URL hash) + view state (local). */
import { decodeState, defaultState, encodeState, generate, sanitize, type Palette, type State } from '../core';
import type { ExportKind } from '../core';

export interface TileRef {
  hue: number;
  step: number;
}

export interface View {
  /** Lens anchor from hover or focus. */
  hover: TileRef | null;
  /** Pinned lens anchor (click or Enter). */
  pinned: TileRef | null;
  /** Roving focus position in the swatch grid. */
  focus: TileRef;
  previewHue: number;
  previewDark: boolean;
  cmText: number;
  cmBg: number;
  exportKind: ExportKind;
}

type Why = 'values' | 'structure' | 'view' | 'load';
type Listener = (why: Why) => void;

class Store {
  state: State;
  palette: Palette;
  view: View;
  private listeners: Listener[] = [];
  private pending: Why | null = null;

  constructor() {
    this.state = decodeState(location.hash) ?? defaultState();
    this.palette = generate(this.state);
    history.replaceState(null, '', '#' + encodeState(this.state));
    this.view = {
      hover: null,
      pinned: null,
      focus: { hue: 0, step: 0 },
      previewHue: Math.min(5, this.state.hues.length - 1),
      previewDark: false,
      cmText: 0,
      cmBg: 0,
      exportKind: 'css',
    };
    window.addEventListener('hashchange', () => {
      const next = decodeState(location.hash);
      if (next && encodeState(next) !== encodeState(this.state)) this.load(next);
    });
  }

  on(fn: Listener) {
    this.listeners.push(fn);
  }

  /** Change palette state. `structure` when hue/step/constraint counts change. */
  update(fn: (s: State) => void, why: 'values' | 'structure' = 'values') {
    fn(this.state);
    this.schedule(why);
  }

  load(s: State) {
    this.state = sanitize(s);
    this.clampView();
    this.schedule('load');
  }

  reset() {
    this.load(defaultState());
  }

  /** Change view-only state (lens, preview hue, tabs). Repaints without regenerating. */
  setView(patch: Partial<View>) {
    Object.assign(this.view, patch);
    this.emit('view');
  }

  /** The lens anchor: pinned wins over hover. */
  get anchor(): TileRef | null {
    return this.view.pinned ?? this.view.hover;
  }

  private clampView() {
    const hn = this.state.hues.length;
    const v = this.view;
    const fix = (r: TileRef | null) =>
      r && r.hue < hn && r.step < this.state.steps ? r : null;
    v.hover = fix(v.hover);
    v.pinned = fix(v.pinned);
    v.focus = fix(v.focus) ?? { hue: 0, step: 0 };
    v.previewHue = Math.min(v.previewHue, hn - 1);
    v.cmText = Math.min(v.cmText, hn - 1);
    v.cmBg = Math.min(v.cmBg, hn - 1);
  }

  private schedule(why: Why) {
    const rank: Record<Why, number> = { view: 0, values: 1, structure: 2, load: 3 };
    if (!this.pending || rank[why] > rank[this.pending]) this.pending = why;
    // rAF coalesces drags to one regeneration per frame; the timeout keeps
    // things moving when the page is hidden and rAF is paused.
    const run = () => {
      if (!this.pending) return;
      const w = this.pending;
      this.pending = null;
      this.clampView();
      this.palette = generate(this.state);
      history.replaceState(null, '', '#' + encodeState(this.state));
      this.emit(w);
    };
    requestAnimationFrame(run);
    setTimeout(run, 60);
  }

  private emit(why: Why) {
    for (const fn of this.listeners) fn(why);
  }
}

export const store = new Store();
