import { h } from '../core/dom.js';

/** Barra fina de progresso dentro do nível atual (0..1). */
export function xpBar(ratio: number, label: string): HTMLElement {
  const pct = Math.round(Math.max(0, Math.min(1, ratio)) * 1000) / 10;
  return h('div', {
    class: 'xp-bar', role: 'progressbar', 'aria-label': label,
    'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(pct), 'aria-valuetext': `${pct.toLocaleString('pt-BR')}%`,
  }, h('span', { class: 'xp-bar-fill', style: { '--p': ratio.toFixed(4) } }));
}

export function setXpBar(bar: HTMLElement, ratio: number): void {
  const pct = Math.round(Math.max(0, Math.min(1, ratio)) * 1000) / 10;
  bar.setAttribute('aria-valuenow', String(pct));
  bar.setAttribute('aria-valuetext', `${pct.toLocaleString('pt-BR')}%`);
  (bar.firstElementChild as HTMLElement).style.setProperty('--p', ratio.toFixed(4));
}
