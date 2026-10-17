/** Select estilizado e acessível (padrão ARIA "listbox" com botão). */
import { h, icon, uid } from '../core/dom.js';

export interface SelectOption {
  value: string;
  label: string;
  hint?: string;
}

export interface SelectHandle {
  el: HTMLElement;
  value: string;
  setValue(v: string, emit?: boolean): void;
  setOptions(opts: SelectOption[]): void;
}

export function createSelect(opts: {
  label: string;
  options: SelectOption[];
  value: string;
  onChange?: (v: string) => void;
  hideLabel?: boolean;
  compact?: boolean;
}): SelectHandle {
  const id = uid('sel');
  let options = opts.options;
  let value = opts.value;
  let open = false;
  let active = 0;

  const labelEl = h('span', { class: ['field-label', opts.hideLabel && 'sr-only'], id: `${id}-label` }, opts.label);
  const valueEl = h('span', { class: 'select-value' });
  const hintEl = h('span', { class: 'select-hint' });
  const button = h('button', {
    class: ['select-btn', opts.compact && 'select-compact'], type: 'button', id: `${id}-btn`,
    'aria-haspopup': 'listbox', 'aria-expanded': 'false', 'aria-labelledby': `${id}-label ${id}-btn`,
  }, valueEl, hintEl, icon('chevron'));
  const list = h('ul', { class: 'select-list', role: 'listbox', id: `${id}-list`, tabindex: '-1', 'aria-labelledby': `${id}-label` });
  const root = h('div', { class: 'select' }, labelEl, button, list);

  function render(): void {
    const current = options.find((o) => o.value === value) ?? options[0];
    valueEl.textContent = current?.label ?? '';
    hintEl.textContent = current?.hint ?? '';
    list.replaceChildren(
      ...options.map((o, i) =>
        h('li', {
          role: 'option', id: `${id}-o${i}`, class: ['select-option', i === active && 'is-active'],
          'aria-selected': String(o.value === value),
          onMousedown: (e: MouseEvent) => { e.preventDefault(); choose(i); },
          onMousemove: () => { if (active !== i) { active = i; highlight(); } },
        }, h('span', null, o.label), o.hint ? h('span', { class: 'select-option-hint' }, o.hint) : null),
      ),
    );
  }

  function highlight(): void {
    list.querySelectorAll('.select-option').forEach((li, i) => li.classList.toggle('is-active', i === active));
    list.setAttribute('aria-activedescendant', `${id}-o${active}`);
    list.querySelector<HTMLElement>(`#${id}-o${active}`)?.scrollIntoView({ block: 'nearest' });
  }

  function setOpen(v: boolean): void {
    open = v;
    root.classList.toggle('is-open', v);
    button.setAttribute('aria-expanded', String(v));
    if (v) {
      active = Math.max(0, options.findIndex((o) => o.value === value));
      render();
      highlight();
      list.focus();
      document.addEventListener('mousedown', outside, true);
    } else {
      document.removeEventListener('mousedown', outside, true);
    }
  }

  function outside(e: MouseEvent): void {
    if (!root.contains(e.target as Node)) setOpen(false);
  }

  function choose(i: number): void {
    const o = options[i];
    setOpen(false);
    button.focus();
    if (o && o.value !== value) {
      value = o.value;
      render();
      opts.onChange?.(value);
    }
  }

  button.addEventListener('click', () => setOpen(!open));
  button.addEventListener('keydown', (e) => {
    if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
      e.preventDefault();
      setOpen(true);
    }
  });
  list.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); active = Math.min(options.length - 1, active + 1); highlight(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); active = Math.max(0, active - 1); highlight(); }
    else if (e.key === 'Home') { e.preventDefault(); active = 0; highlight(); }
    else if (e.key === 'End') { e.preventDefault(); active = options.length - 1; highlight(); }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(active); }
    else if (e.key === 'Escape' || e.key === 'Tab') { if (e.key === 'Escape') e.preventDefault(); setOpen(false); button.focus(); }
    else if (e.key.length === 1) {
      const k = e.key.toLowerCase();
      const i = options.findIndex((o, idx) => idx > active && o.label.toLowerCase().startsWith(k));
      const j = i >= 0 ? i : options.findIndex((o) => o.label.toLowerCase().startsWith(k));
      if (j >= 0) { active = j; highlight(); }
    }
  });
  list.addEventListener('blur', () => setTimeout(() => { if (open && !root.contains(document.activeElement)) setOpen(false); }, 0));

  render();

  return {
    el: root,
    get value() { return value; },
    set value(v: string) { value = v; render(); },
    setValue(v: string, emit = false) {
      if (v === value) return;
      value = v;
      render();
      if (emit) opts.onChange?.(v);
    },
    setOptions(o: SelectOption[]) { options = o; render(); },
  };
}
