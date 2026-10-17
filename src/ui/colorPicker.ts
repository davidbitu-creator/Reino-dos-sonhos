/** Seletor da cor do Núcleo da Alma: paleta sugerida + cor livre (hexadecimal ou seletor nativo). */
import { h, uid } from '../core/dom.js';
import { CORE_PRESETS, normalizeHex } from '../core/color.js';

export interface ColorPickerHandle {
  el: HTMLElement;
  value: string;
  set(hex: string): void;
}

export function colorPicker(initial: string, onInput: (hex: string) => void): ColorPickerHandle {
  const id = uid('color');
  let value = normalizeHex(initial) ?? '#7FB4FF';

  const swatches = CORE_PRESETS.map((p) =>
    h('button', {
      type: 'button', class: 'swatch', role: 'radio', style: { '--core': p.hex },
      'aria-label': `${p.name} (${p.hex})`, title: p.name,
      onClick: () => set(p.hex, true),
    }),
  );
  const native = h('input', { type: 'color', class: 'color-native', id: `${id}-native`, value: value.toLowerCase(), 'aria-label': 'Escolher qualquer cor' });
  const hex = h('input', {
    type: 'text', class: 'input input-hex', id: `${id}-hex`, value, maxlength: '7', spellcheck: 'false',
    autocomplete: 'off', inputmode: 'text', 'aria-describedby': `${id}-help`,
  });
  const help = h('span', { class: 'field-help', id: `${id}-help` }, 'Formato #RRGGBB');

  function sync(): void {
    swatches.forEach((s, i) => s.setAttribute('aria-checked', String(CORE_PRESETS[i].hex.toUpperCase() === value)));
    native.value = value.toLowerCase();
    if (document.activeElement !== hex) hex.value = value;
    hex.classList.remove('is-invalid');
    help.textContent = 'Formato #RRGGBB';
  }

  function set(v: string, emit = false): void {
    const n = normalizeHex(v);
    if (!n) return;
    value = n;
    sync();
    if (emit) onInput(value);
  }

  native.addEventListener('input', () => set(native.value, true));
  hex.addEventListener('input', () => {
    const n = normalizeHex(hex.value);
    if (n && hex.value.replace('#', '').length === 6) set(n, true);
  });
  hex.addEventListener('blur', () => {
    const n = normalizeHex(hex.value);
    if (!n) {
      hex.classList.add('is-invalid');
      help.textContent = 'Cor inválida — use #RRGGBB, por exemplo #8FD3FF';
    } else set(n, true);
  });

  const el = h('div', { class: 'color-picker' },
    h('div', { class: 'swatches', role: 'radiogroup', 'aria-label': 'Cores sugeridas' }, swatches),
    h('div', { class: 'color-custom' },
      h('label', { class: 'color-native-wrap', for: `${id}-native` }, native, h('span', { class: 'sr-only' }, 'Cor livre')),
      h('label', { class: 'field field-inline', for: `${id}-hex` }, h('span', { class: 'field-label' }, 'Hexadecimal'), hex),
    ),
    help);
  sync();
  return { el, get value() { return value; }, set: (v) => set(v) };
}
