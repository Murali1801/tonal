/** The left rail: scale, gamut, equal lightness, curves, hues and constraints. */
import {
  MAX_CONSTRAINTS,
  MAX_HUES,
  MAX_STEPS,
  MIN_STEPS,
  cleanName,
  clamp,
  effectiveNaming,
  hueName,
  parseColor,
  stepLabels,
  stepPositions,
  type Constraint,
  type Naming,
  type State,
} from '../core';
import { chromaEditor, lightnessEditor } from './curveEditor';
import { announce, dropdown, h, preserveFocus, segmented } from './dom';
import { store } from './store';

const NAMING_OPTS: { value: Naming; label: string }[] = [
  { value: 'tw', label: 'Tailwind 50, 100 … 950' },
  { value: 'hundreds', label: '100, 200, 300 …' },
  { value: 'index', label: '1, 2, 3 …' },
];

const tileBg = (hue: number, step: number) => {
  const t = store.palette.tiles[hue]?.[step];
  if (!t) return 'transparent';
  return store.palette.gamut === 'p3' ? t.css : t.hex;
};

function section(title: string, hint: string | null, ...body: (Node | null)[]) {
  return h(
    'section',
    { class: 'rail-sec' },
    h('h2', { class: 'rail-h' }, title),
    hint ? h('p', { class: 'rail-hint' }, hint) : null,
    ...body,
  );
}

function numberInput(opts: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onInput: (v: number) => void;
  cls?: string;
  suffix?: string;
}) {
  const input = h('input', {
    type: 'number',
    inputmode: 'decimal',
    class: `num ${opts.cls ?? ''}`,
    value: String(opts.value),
    min: opts.min,
    max: opts.max,
    step: opts.step,
    'aria-label': opts.label,
  });
  input.addEventListener('input', () => {
    const v = Number(input.value);
    if (input.value !== '' && Number.isFinite(v)) opts.onInput(clamp(v, opts.min, opts.max));
  });
  input.addEventListener('change', () => {
    const v = clamp(Number(input.value) || 0, opts.min, opts.max);
    input.value = String(v);
    opts.onInput(v);
  });
  return input;
}

/** When the labels change, keep constraints on the step at the same relative position. */
function remapConstraints(s: State, oldLabels: string[]) {
  const newLabels = stepLabels(s.steps, s.naming);
  const oldPos = stepPositions(oldLabels);
  const newPos = stepPositions(newLabels);
  for (const k of s.constraints) {
    const i = oldLabels.indexOf(k.step);
    if (i < 0) continue;
    const t = oldPos[i] ?? 0.5;
    let best = 0;
    newPos.forEach((p, j) => {
      if (Math.abs(p - t) < Math.abs((newPos[best] ?? 0) - t)) best = j;
    });
    k.step = newLabels[best] ?? k.step;
  }
}

export function mountControls(root: HTMLElement) {
  const st = () => store.state;

  // ---------- Scale ----------
  const stepsOut = h('output', { class: 'stepper-val mono', 'aria-live': 'polite' }, String(st().steps));
  const changeSteps = (d: number) => {
    const old = stepLabels(st().steps, st().naming);
    const next = clamp(st().steps + d, MIN_STEPS, MAX_STEPS);
    if (next === st().steps) return;
    store.update((s) => {
      s.steps = next;
      remapConstraints(s, old);
    }, 'structure');
  };
  const minus = h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Fewer steps', onClick: () => changeSteps(-1) }, '−');
  const plus = h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'More steps', onClick: () => changeSteps(1) }, '+');
  const naming = dropdown('Step names', NAMING_OPTS, st().naming, (v) => {
    const old = stepLabels(st().steps, st().naming);
    store.update((s) => {
      s.naming = v;
      if (v === 'tw') s.steps = 11;
      remapConstraints(s, old);
    }, 'structure');
  });
  const namingNote = h('p', { class: 'rail-note' });
  const scaleSec = section(
    'Scale',
    null,
    h(
      'div',
      { class: 'field-row' },
      h('span', { class: 'field-label', id: 'steps-label' }, 'Steps'),
      h('div', { class: 'stepper', role: 'group', 'aria-labelledby': 'steps-label' }, minus, stepsOut, plus),
    ),
    h('div', { class: 'field-row' }, h('span', { class: 'field-label' }, 'Names'), naming.el),
    namingNote,
  );

  // ---------- Gamut ----------
  const displayP3 = window.matchMedia('(color-gamut: p3)').matches;
  const gamut = segmented(
    'gamut',
    'Target gamut',
    [
      { value: 'srgb', label: 'sRGB', title: 'Map every colour into sRGB' },
      { value: 'p3', label: 'Display P3', title: 'Allow wider P3 colours, with sRGB fallbacks' },
    ],
    st().gamut,
    (v) => store.update((s) => (s.gamut = v)),
  );
  const gamutNote = h('p', { class: 'rail-note' });
  const gamutSec = section('Gamut', null, gamut.el, gamutNote);

  // ---------- Equal lightness ----------
  const equal = segmented(
    'equal',
    'Equal lightness across hues',
    [
      { value: 'off', label: 'Off', title: 'Use the curve L as is' },
      { value: 'wcag', label: 'WCAG', title: 'Match relative luminance: same WCAG ratio per step' },
      { value: 'apca', label: 'APCA', title: 'Match APCA screen luminance: same Lc per step' },
    ],
    st().equal,
    (v) => store.update((s) => (s.equal = v)),
  );
  const equalNote = h('p', { class: 'rail-note' });
  const equalSec = section(
    'Equal lightness',
    'A step number means the same contrast on every hue, so blue 600 and yellow 600 both pass where gray 600 passes.',
    equal.el,
    equalNote,
  );

  // ---------- Lightness ----------
  const lEd = lightnessEditor();
  const lRead = h('p', { class: 'readout mono' });
  const lightSec = section('Lightness curve', null, lEd.el, lRead);

  // ---------- Chroma ----------
  const cEd = chromaEditor();
  const cRead = h('p', { class: 'readout mono' });
  const cMode = segmented(
    'cmode',
    'Chroma mode',
    [
      { value: 'abs', label: 'Absolute', title: 'Each hue sets a peak OKLCH chroma' },
      { value: 'rel', label: '% of gamut max', title: 'Each hue sets a share of the most chroma the gamut allows at that L' },
    ],
    st().chroma.mode,
    (v) =>
      store.update((s) => {
        if (s.chroma.mode === v) return;
        s.chroma.mode = v;
        for (const hue of s.hues) hue.c = v === 'rel' ? clamp(hue.c / 0.24, 0, 1) : clamp(hue.c * 0.24, 0, 0.4);
      }, 'structure'),
  );
  const chromaSec = section('Chroma curve', null, cMode.el, cEd.el, cRead);

  // ---------- Hues ----------
  const hueList = h('ol', { class: 'hue-list', 'aria-label': 'Hues' });
  const addHueBtn = h('button', { type: 'button', class: 'btn btn-sm', onClick: () => addHue() }, 'Add hue');
  const fromInput = h('input', {
    type: 'text',
    class: 'text mono',
    placeholder: '#2747d9 or oklch(…)',
    'aria-label': 'Add a hue from any CSS colour',
    spellcheck: 'false',
    autocomplete: 'off',
  });
  const fromErr = h('p', { class: 'rail-note is-error', 'aria-live': 'polite' });
  const fromForm = h(
    'form',
    {
      class: 'from-form',
      onSubmit: (e: Event) => {
        e.preventDefault();
        const c = parseColor(fromInput.value);
        if (!c) {
          fromErr.textContent = 'Not a colour Tonal can read. Try a hex, rgb() or oklch().';
          return;
        }
        if (st().hues.length >= MAX_HUES) {
          fromErr.textContent = `Up to ${MAX_HUES} hues.`;
          return;
        }
        fromErr.textContent = '';
        const abs = st().chroma.mode === 'abs';
        store.update((s) => {
          s.hues.push({
            name: cleanName(hueName(c.h, c.c)),
            h: Math.round(c.h * 10) / 10,
            c: abs ? clamp(Math.round(c.c * 1000) / 1000, 0, 0.4) : 0.9,
          });
        }, 'structure');
        fromInput.value = '';
        announce(`Added ${hueName(c.h, c.c)} hue`);
      },
    },
    fromInput,
    h('button', { type: 'submit', class: 'btn btn-sm' }, 'Add'),
  );
  const huesSec = section('Hues', null, hueList, h('div', { class: 'row-actions' }, addHueBtn), fromForm, fromErr);

  function addHue() {
    if (st().hues.length >= MAX_HUES) return;
    const angles = st().hues.filter((x) => x.c > 0.03 || st().chroma.mode === 'rel').map((x) => x.h).sort((a, b) => a - b);
    let h0 = 300;
    if (angles.length) {
      let bestGap = -1;
      angles.forEach((a, i) => {
        const next = i === angles.length - 1 ? (angles[0] ?? 0) + 360 : (angles[i + 1] ?? 0);
        if (next - a > bestGap) {
          bestGap = next - a;
          h0 = (a + (next - a) / 2) % 360;
        }
      });
    }
    h0 = Math.round(h0);
    const abs = st().chroma.mode === 'abs';
    store.update((s) => s.hues.push({ name: hueName(h0, 0.2), h: h0, c: abs ? 0.16 : 0.85 }), 'structure');
    announce(`Added ${hueName(h0, 0.2)} hue`);
  }

  // ---------- Constraints ----------
  const kList = h('ol', { class: 'k-list', 'aria-label': 'Contrast constraints' });
  const addKBtn = h(
    'button',
    {
      type: 'button',
      class: 'btn btn-sm',
      onClick: () => {
        if (st().constraints.length >= MAX_CONSTRAINTS) return;
        const labels = store.palette.labels;
        store.update(
          (s) =>
            s.constraints.push({
              step: labels[Math.round(labels.length * 0.65)] ?? labels[0] ?? '600',
              target: 4.5,
              against: 'white',
              metric: 'wcag',
            }),
          'structure',
        );
      },
    },
    'Add constraint',
  );
  const kSec = section(
    'Constraints',
    'Lock a step to a minimum contrast. Tonal moves only that step’s lightness, as little as it can, and keeps the ramp in order.',
    kList,
    h('div', { class: 'row-actions' }, addKBtn),
  );

  const resetBtn = h(
    'button',
    {
      type: 'button',
      class: 'btn btn-sm btn-quiet',
      onClick: () => {
        store.reset();
        announce('Reset to the default palette');
      },
    },
    'Reset to defaults',
  );

  root.append(scaleSec, gamutSec, equalSec, lightSec, chromaSec, huesSec, kSec, h('div', { class: 'rail-foot' }, resetBtn));

  // ---------- list builders ----------
  const rampEls: HTMLElement[] = [];
  function buildHues() {
    rampEls.length = 0;
    const abs = st().chroma.mode === 'abs';
    hueList.replaceChildren(
      ...st().hues.map((hue, i) => {
        const ramp = h('div', { class: 'mini-ramp', 'aria-hidden': 'true' });
        rampEls.push(ramp);
        const name = h('input', {
          type: 'text',
          class: 'text hue-name',
          value: hue.name,
          'aria-label': `Hue ${i + 1} name`,
          maxlength: 20,
          spellcheck: 'false',
        });
        name.addEventListener('input', () => store.update((s) => (s.hues[i]!.name = cleanName(name.value))));
        name.addEventListener('change', () => (name.value = st().hues[i]!.name));
        const range = h('input', {
          type: 'range',
          class: 'range',
          min: 0,
          max: 359,
          step: 1,
          value: String(Math.round(hue.h)),
          'aria-label': `${hue.name} hue angle`,
        });
        const hueNum = numberInput({
          label: `${hue.name} hue angle in degrees`,
          value: Math.round(hue.h * 10) / 10,
          min: 0,
          max: 360,
          step: 1,
          cls: 'num-hue',
          onInput: (v) => {
            range.value = String(v);
            store.update((s) => (s.hues[i]!.h = v % 360));
          },
        });
        range.addEventListener('input', () => {
          hueNum.value = range.value;
          store.update((s) => (s.hues[i]!.h = Number(range.value)));
        });
        const chromaNum = numberInput({
          label: abs ? `${hue.name} peak chroma` : `${hue.name} chroma, percent of gamut maximum`,
          value: abs ? hue.c : Math.round(hue.c * 100),
          min: 0,
          max: abs ? 0.4 : 100,
          step: abs ? 0.005 : 1,
          cls: 'num-c',
          onInput: (v) => store.update((s) => (s.hues[i]!.c = abs ? v : v / 100)),
        });
        const remove = h(
          'button',
          {
            type: 'button',
            class: 'icon-btn',
            'aria-label': `Remove ${hue.name}`,
            disabled: st().hues.length <= 1,
            onClick: () => {
              store.update((s) => s.hues.splice(i, 1), 'structure');
              announce(`Removed ${hue.name}`);
              addHueBtn.focus();
            },
          },
          '×',
        );
        return h(
          'li',
          { class: 'hue-item' },
          h('div', { class: 'hue-top' }, name, remove),
          h(
            'div',
            { class: 'hue-nums' },
            h('label', { class: 'mini-field' }, h('span', {}, 'H'), hueNum),
            h('label', { class: 'mini-field' }, h('span', {}, abs ? 'C' : 'C %'), chromaNum),
          ),
          range,
          ramp,
        );
      }),
    );
    paintRamps();
  }

  function paintRamps() {
    rampEls.forEach((ramp, i) => {
      const n = store.palette.labels.length;
      if (ramp.childElementCount !== n) ramp.replaceChildren(...Array.from({ length: n }, () => h('span')));
      Array.from(ramp.children).forEach((c, j) => ((c as HTMLElement).style.background = tileBg(i, j)));
    });
  }

  const kStatus: HTMLElement[] = [];
  function buildConstraints() {
    kStatus.length = 0;
    const labels = store.palette.labels;
    kList.replaceChildren(
      ...st().constraints.map((k, i) => {
        const set = (fn: (k: Constraint) => void, why: 'values' | 'structure' = 'values') =>
          store.update((s) => fn(s.constraints[i]!), why);
        const stepOpts = labels.map((l) => ({ value: l, label: l }));
        if (!labels.includes(k.step)) stepOpts.push({ value: k.step, label: `${k.step} (missing)` });
        const step = dropdown(`Constraint ${i + 1} step`, stepOpts, k.step, (v) => set((c) => (c.step = v)), 'dd-sm');
        const target = numberInput({
          label: `Constraint ${i + 1} minimum ${k.metric === 'wcag' ? 'ratio' : 'Lc'}`,
          value: k.target,
          min: 1,
          max: k.metric === 'wcag' ? 21 : 108,
          step: k.metric === 'wcag' ? 0.5 : 5,
          cls: 'num-k',
          onInput: (v) => set((c) => (c.target = v)),
        });
        const metric = dropdown(
          `Constraint ${i + 1} metric`,
          [
            { value: 'wcag', label: 'WCAG' },
            { value: 'apca', label: 'APCA Lc' },
          ],
          k.metric,
          (v) =>
            set((c) => {
              c.metric = v;
              c.target = v === 'wcag' ? 4.5 : 60;
            }, 'structure'),
          'dd-sm',
        );
        const against = dropdown(
          `Constraint ${i + 1} paired with`,
          [
            { value: 'white', label: 'white' },
            { value: 'black', label: 'black' },
          ],
          k.against,
          (v) => set((c) => (c.against = v)),
          'dd-sm',
        );
        const remove = h(
          'button',
          {
            type: 'button',
            class: 'icon-btn',
            'aria-label': `Remove constraint ${i + 1}`,
            onClick: () => {
              store.update((s) => s.constraints.splice(i, 1), 'structure');
              addKBtn.focus();
            },
          },
          '×',
        );
        const status = h('p', { class: 'k-status mono' });
        kStatus.push(status);
        return h(
          'li',
          { class: 'k-item' },
          h(
            'div',
            { class: 'k-line' },
            h('span', { class: 'k-word' }, 'Step'),
            step.el,
            metric.el,
            h('span', { class: 'k-word', 'aria-hidden': 'true' }, '≥'),
            target,
            h('span', { class: 'k-word' }, 'on'),
            against.el,
            remove,
          ),
          status,
        );
      }),
    );
    addKBtn.disabled = st().constraints.length >= MAX_CONSTRAINTS;
    paintStatus();
  }

  function paintStatus() {
    const s = st();
    const n = s.hues.length;
    store.palette.constraintResults.forEach((r, i) => {
      const el = kStatus[i];
      if (!el) return;
      let text: string;
      let state: string;
      if (!r.valid) {
        text = 'This step is not in the scale.';
        state = 'bad';
      } else if (r.unmet) {
        text = `Out of reach on ${r.unmet} of ${n} hues.`;
        state = 'bad';
      } else if (r.moved) {
        text = `Met. Moved L on ${r.moved} of ${n} hues.`;
        state = 'ok';
      } else {
        text = 'Already met on every hue.';
        state = 'ok';
      }
      el.textContent = text;
      el.dataset.state = state;
    });
  }

  function paintNotes() {
    const s = st();
    stepsOut.textContent = String(s.steps);
    minus.disabled = s.steps <= MIN_STEPS;
    plus.disabled = s.steps >= MAX_STEPS;
    namingNote.textContent =
      s.naming === 'tw' && effectiveNaming(s.steps, s.naming) !== 'tw'
        ? 'Tailwind names need 11 steps, so these use 100, 200 …'
        : '';
    const p3Count = store.palette.tiles.flat().filter((t) => t.p3Only).length;
    gamutNote.textContent =
      s.gamut === 'p3'
        ? `${p3Count} tile${p3Count === 1 ? '' : 's'} need P3; their hatched corner shows the sRGB fallback.${displayP3 ? '' : ' This screen is sRGB, so the browser clips them.'}`
        : `Every tile is mapped into sRGB with the CSS Color 4 method.${displayP3 ? ' Your screen can show P3.' : ''}`;
    const notes: Record<State['equal'], string> = {
      off: 'Off: tiles use the curve’s OKLCH L. Contrast still varies a little by hue.',
      wcag: 'Each tile’s L is solved so its relative luminance matches a neutral at the curve’s L.',
      apca: 'Each tile’s L is solved so its APCA screen luminance matches a neutral at the curve’s L.',
    };
    equalNote.textContent = notes[s.equal];
    lRead.textContent = lEd.readout();
    cRead.textContent = cEd.readout();
  }

  function syncAll() {
    const s = st();
    naming.set(s.naming);
    gamut.set(s.gamut);
    equal.set(s.equal);
    cMode.set(s.chroma.mode);
    buildHues();
    buildConstraints();
  }

  buildHues();
  buildConstraints();
  paintNotes();

  store.on((why) => {
    if (why === 'view') return;
    if (why === 'load') syncAll();
    else if (why === 'structure') {
      preserveFocus(hueList, buildHues);
      preserveFocus(kList, buildConstraints);
    } else {
      paintRamps();
      paintStatus();
    }
    lEd.sync();
    cEd.sync();
    paintNotes();
  });
}
