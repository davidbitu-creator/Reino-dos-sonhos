import { h } from '../core/dom.js';
import type { ViewInstance } from '../core/router.js';

export function notFoundView(opts: { title?: string; text?: string; href?: string; cta?: string } = {}): ViewInstance {
  const el = h('div', { class: 'page page-empty' },
    h('h1', { class: 'page-title' }, opts.title ?? 'Caminho perdido'),
    h('p', { class: 'page-lede' }, opts.text ?? 'Esta página não existe. Talvez nunca tenha existido.'),
    h('a', { class: 'btn btn-ghost', href: opts.href ?? '#/' }, opts.cta ?? 'Voltar ao início'));
  return { el, title: opts.title ?? 'Não encontrado' };
}
