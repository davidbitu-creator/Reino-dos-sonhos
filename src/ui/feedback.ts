/** Notificações, modais e estados de carregamento. */
import { h, icon, type Child } from '../core/dom.js';
import { PermissionError } from '../data/types.js';

let region: HTMLElement | null = null;

export function toast(message: string, kind: 'ok' | 'error' | 'info' = 'ok'): void {
  if (!region) {
    region = h('div', { class: 'toasts', role: 'status', 'aria-live': 'polite' });
    document.body.appendChild(region);
  }
  const el = h('div', { class: ['toast', `toast-${kind}`] }, h('span', { class: 'toast-mark', 'aria-hidden': 'true' }), message);
  region.appendChild(el);
  requestAnimationFrame(() => el.classList.add('in'));
  setTimeout(() => {
    el.classList.remove('in');
    setTimeout(() => el.remove(), 400);
  }, kind === 'error' ? 6000 : 3200);
}

export function errorMessage(e: unknown): string {
  if (e instanceof PermissionError) return e.message;
  if (e instanceof Error) return e.message;
  return 'Algo deu errado. Tente novamente.';
}

export function reportError(e: unknown): void {
  console.error(e);
  toast(errorMessage(e), 'error');
}

/** Executa uma ação com o botão em estado de carregamento. */
export async function withBusy<T>(btn: HTMLButtonElement | null, fn: () => Promise<T>): Promise<T | undefined> {
  if (btn) {
    btn.disabled = true;
    btn.classList.add('is-busy');
    btn.setAttribute('aria-busy', 'true');
  }
  try {
    return await fn();
  } catch (e) {
    reportError(e);
    return undefined;
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.classList.remove('is-busy');
      btn.removeAttribute('aria-busy');
    }
  }
}

export function loader(label = 'Carregando'): HTMLElement {
  return h('div', { class: 'loader', role: 'status' },
    h('span', { class: 'loader-ember', 'aria-hidden': 'true' }),
    h('span', { class: 'loader-label' }, label));
}

/* ---------- Modal acessível ---------- */

export interface ModalHandle {
  close(): void;
  el: HTMLElement;
  body: HTMLElement;
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function openModal(opts: { title: string; content: Child; wide?: boolean; onClose?: () => void; describedBy?: string }): ModalHandle {
  const previous = document.activeElement as HTMLElement | null;
  const titleId = `modal-title-${Math.random().toString(36).slice(2, 8)}`;
  const body = h('div', { class: 'modal-body' }, opts.content);
  const closeBtn = h('button', { class: 'icon-btn modal-close', type: 'button', 'aria-label': 'Fechar' }, icon('close'));
  const dialog = h('div', { class: ['modal', opts.wide && 'modal-wide'], role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId },
    h('header', { class: 'modal-head' }, h('h2', { id: titleId, class: 'modal-title' }, opts.title), closeBtn),
    body);
  const backdrop = h('div', { class: 'modal-backdrop' }, dialog);
  let closed = false;

  function close(): void {
    if (closed) return;
    closed = true;
    backdrop.classList.remove('in');
    document.removeEventListener('keydown', onKey, true);
    setTimeout(() => backdrop.remove(), 260);
    document.body.classList.remove('has-modal');
    previous?.focus?.();
    opts.onClose?.();
  }

  function onKey(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      e.stopPropagation();
      close();
    } else if (e.key === 'Tab') {
      const items = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((x) => x.offsetParent !== null);
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }

  closeBtn.addEventListener('click', close);
  backdrop.addEventListener('mousedown', (e) => {
    if (e.target === backdrop) close();
  });
  document.addEventListener('keydown', onKey, true);
  document.body.appendChild(backdrop);
  document.body.classList.add('has-modal');
  requestAnimationFrame(() => {
    backdrop.classList.add('in');
    const first = body.querySelector<HTMLElement>('[data-autofocus]') ?? body.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? closeBtn).focus();
  });
  return { close, el: dialog, body };
}

export function confirmDialog(title: string, message: string, confirmLabel: string, danger = false): Promise<boolean> {
  return new Promise((resolve) => {
    let answered = false;
    const yes = h('button', { class: ['btn', danger ? 'btn-danger' : 'btn-primary'], type: 'button' }, confirmLabel);
    const no = h('button', { class: 'btn btn-ghost', type: 'button', 'data-autofocus': true }, 'Cancelar');
    const m = openModal({
      title,
      content: [h('p', { class: 'modal-text' }, message), h('div', { class: 'modal-actions' }, no, yes)],
      onClose: () => {
        if (!answered) resolve(false);
      },
    });
    yes.addEventListener('click', () => { answered = true; m.close(); resolve(true); });
    no.addEventListener('click', () => { answered = true; m.close(); resolve(false); });
  });
}
