import { h, icon, replace } from '../core/dom.js';
import { store } from '../core/store.js';
import type { ViewInstance } from '../core/router.js';
import { canCreateCharacter } from '../data/permissions.js';
import { characterCard } from '../ui/characterCard.js';
import { openCharacterForm } from '../ui/characterForm.js';

export function charactersView(): ViewInstance {
  const actions = h('div', { class: 'page-actions' });
  const grid = h('div', { class: 'gallery' });
  const el = h('div', { class: 'page page-characters' },
    h('header', { class: 'page-head' },
      h('div', null,
        h('h1', { class: 'page-title' }, 'Personagens'),
        h('p', { class: 'page-lede' }, 'Os Adormecidos desta campanha. Escolha um para ver sua história e entrar em seu Mar da Alma.')),
      actions),
    grid);

  function render(): void {
    const s = store.state;
    replace(actions,
      canCreateCharacter(s.session, s.settings)
        ? h('button', { class: 'btn btn-primary', type: 'button', onClick: () => openCharacterForm(null, (c) => { window.location.hash = `#/personagens/${c.id}`; }) },
          icon('plus'), 'Novo personagem')
        : !s.session ? h('a', { class: 'btn btn-ghost', href: '#/entrar' }, 'Entrar para criar seu personagem') : null);
    if (s.characters.length === 0) {
      replace(grid, h('div', { class: 'empty-state' },
        h('p', { class: 'empty-title' }, 'A galeria ainda está vazia.'),
        h('p', null, s.session ? 'Crie o primeiro personagem para apresentá-lo ao grupo.' : 'Entre na sua conta para criar o seu personagem.')));
      return;
    }
    replace(grid, s.characters.map((c, i) => characterCard(c, i)));
  }

  render();
  const unsub = store.subscribe(render);
  return { el, title: 'Personagens', destroy: unsub };
}
