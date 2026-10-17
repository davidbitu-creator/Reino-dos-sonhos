/** Retrato do personagem: imagem enviada (com enquadramento) ou monograma quando não há imagem. */
import { h } from '../core/dom.js';
import type { Character } from '../data/types.js';

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

export function applyFraming(img: HTMLImageElement, focusX: number, focusY: number, zoom: number): void {
  img.style.objectPosition = `${focusX}% ${focusY}%`;
  img.style.transformOrigin = `${focusX}% ${focusY}%`;
  img.style.transform = zoom > 1.001 ? `scale(${zoom})` : '';
}

export function portrait(c: Pick<Character, 'name' | 'imageUrl' | 'focusX' | 'focusY' | 'zoom' | 'coreColor'>, opts: { eager?: boolean } = {}): HTMLElement {
  if (c.imageUrl) {
    const img = h('img', {
      class: 'portrait-img', src: c.imageUrl, alt: `Retrato de ${c.name}`,
      loading: opts.eager ? 'eager' : 'lazy', decoding: 'async', draggable: 'false',
    });
    applyFraming(img, c.focusX, c.focusY, c.zoom);
    return h('div', { class: 'portrait' }, img);
  }
  return h('div', { class: 'portrait portrait-empty', style: { '--core': c.coreColor }, role: 'img', 'aria-label': `${c.name} ainda não tem retrato` },
    h('span', { class: 'portrait-monogram', 'aria-hidden': 'true' }, initials(c.name)));
}
