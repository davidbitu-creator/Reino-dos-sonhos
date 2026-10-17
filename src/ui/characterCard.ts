import { h } from '../core/dom.js';
import type { Character } from '../data/types.js';
import { levelForXp } from '../rules/xp.js';
import { portrait } from './portrait.js';

export function coreSwatch(color: string, label = true): HTMLElement {
  return h('span', { class: 'core-swatch', style: { '--core': color }, title: label ? `Núcleo da Alma ${color}` : undefined, 'aria-hidden': 'true' });
}

export function characterCard(c: Character, index: number): HTMLElement {
  const level = levelForXp(c.xp);
  return h('a', {
    class: 'char-card', href: `#/personagens/${encodeURIComponent(c.id)}`,
    style: { '--core': c.coreColor, '--i': index },
    'aria-label': `${c.name}, ${c.dndClass || 'sem classe'}, nível ${level}. Jogado por ${c.playerName || 'jogador não informado'}.`,
  },
  h('div', { class: 'char-card-media' }, portrait(c)),
  h('div', { class: 'char-card-shade', 'aria-hidden': 'true' }),
  h('div', { class: 'char-card-flags' },
    c.isDemo ? h('span', { class: 'tag tag-demo' }, 'Demo') : null,
    !c.isPublic ? h('span', { class: 'tag' }, 'Privado') : null),
  h('div', { class: 'char-card-body' },
    h('div', { class: 'char-card-level', 'aria-hidden': 'true' }, h('span', null, 'Nível'), h('strong', null, String(level))),
    h('h3', { class: 'char-card-name' }, c.name),
    h('p', { class: 'char-card-player' }, coreSwatch(c.coreColor, false), c.playerName || 'Jogador não informado'),
    h('dl', { class: 'char-card-meta' },
      h('div', null, h('dt', null, 'Classe'), h('dd', null, c.dndClass || '—')),
      h('div', null, h('dt', null, 'Rank'), h('dd', null, c.campaignRank || '—')))),
  );
}
