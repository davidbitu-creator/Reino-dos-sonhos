import { h, icon, prefersReducedMotion, replace } from '../core/dom.js';
import { store } from '../core/store.js';
import type { ViewInstance } from '../core/router.js';
import { HeroField } from '../anim/heroField.js';
import { isMaster } from '../data/permissions.js';
import type { CampaignSection } from '../data/types.js';
import { characterCard } from '../ui/characterCard.js';
import { toast, withBusy } from '../ui/feedback.js';

const NUMERALS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];

export function homeView(): ViewInstance {
  const canvas = h('canvas', { class: 'hero-canvas', 'aria-hidden': 'true' });
  const title = 'REINO DOS SONHOS';
  const hero = h('section', { class: 'hero', 'aria-labelledby': 'hero-title' },
    canvas,
    h('div', { class: 'hero-fog', 'aria-hidden': 'true' }, h('span'), h('span')),
    h('div', { class: 'hero-horizon', 'aria-hidden': 'true' }),
    h('div', { class: 'hero-content' },
      h('p', { class: 'hero-year' }, 'Ano 2301'),
      h('h1', { class: 'hero-title', id: 'hero-title', 'aria-label': 'Reino dos Sonhos' },
        title.split(' ').map((word, wi) =>
          h('span', { class: 'hero-word', 'aria-hidden': 'true' },
            word.split('').map((ch, ci) => h('span', { class: 'hero-letter', style: { '--d': wi * 6 + ci } }, ch))))),
      h('p', { class: 'hero-sub' }, 'O pesadelo é apenas o começo.'),
      h('a', { class: 'btn btn-hero', href: '#/mundo' }, 'EXPLORAR O REINO')),
    h('div', { class: 'hero-scroll', 'aria-hidden': 'true' }));

  const worldList = h('div', { class: 'world-list' });
  const world = h('section', { class: 'section world', id: 'mundo', 'aria-labelledby': 'world-title' },
    h('div', { class: 'section-head' },
      h('h2', { class: 'section-title', id: 'world-title' }, 'O Mundo'),
      h('p', { class: 'section-lede' }, 'Quatro coisas que todo Adormecido aprende, quase sempre tarde demais.')),
    worldList);

  const galleryGrid = h('div', { class: 'home-gallery' });
  const gallery = h('section', { class: 'section home-chars', 'aria-labelledby': 'home-chars-title' },
    h('div', { class: 'section-head section-head-row' },
      h('h2', { class: 'section-title', id: 'home-chars-title' }, 'Os Adormecidos'),
      h('a', { class: 'link-quiet', href: '#/personagens' }, 'Ver todos os personagens')),
    galleryGrid);

  const closing = h('section', { class: 'section closing' },
    h('a', { class: 'closing-link', href: '#/mar-da-alma' },
      h('span', { class: 'closing-kicker' }, 'Para cada Adormecido'),
      h('span', { class: 'closing-title' }, 'Mar da Alma'),
      h('span', { class: 'closing-text' }, 'O lugar silencioso onde o Núcleo da Alma respira e cresce a cada nível.')),
    h('a', { class: 'closing-link', href: '#/criaturas' },
      h('span', { class: 'closing-kicker' }, 'Classificação'),
      h('span', { class: 'closing-title' }, 'Criaturas do Pesadelo'),
      h('span', { class: 'closing-text' }, 'Sete Ranks, sete Classes. Quarenta e nove maneiras de morrer.')));

  const el = h('div', { class: 'home' }, hero, world, gallery, closing);

  function sectionBlock(s: CampaignSection, i: number): HTMLElement {
    const block = h('article', { class: 'world-item' });
    const show = (): void => {
      replace(block,
        h('span', { class: 'world-num', 'aria-hidden': 'true' }, NUMERALS[i] ?? String(i + 1)),
        h('div', { class: 'world-text' },
          h('h3', { class: 'world-title' }, s.title),
          h('p', { class: 'world-body' }, s.body),
          isMaster(store.state.session)
            ? h('button', { class: 'btn-text', type: 'button', onClick: edit }, icon('edit'), 'Editar texto')
            : null));
    };
    const edit = (): void => {
      const t = h('input', { class: 'input', value: s.title, maxlength: '80', 'aria-label': 'Título' });
      const b = h('textarea', { class: 'input textarea', rows: '5', maxlength: '1500', 'aria-label': 'Texto' }, s.body);
      const save = h('button', { class: 'btn btn-primary', type: 'submit' }, 'Salvar texto');
      const form = h('form', { class: 'world-edit' }, t, b,
        h('div', { class: 'modal-actions' }, h('button', { class: 'btn btn-ghost', type: 'button', onClick: show }, 'Cancelar'), save));
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        void withBusy(save, async () => {
          const next = { ...s, title: t.value.trim() || s.title, body: b.value.trim() };
          await store.repo.saveSection(next);
          Object.assign(s, next);
          store.set({ sections: store.state.sections.map((x) => (x.key === s.key ? next : x)) });
          toast('Texto salvo.');
        });
      });
      replace(block, h('span', { class: 'world-num', 'aria-hidden': 'true' }, NUMERALS[i] ?? String(i + 1)), form);
      t.focus();
    };
    show();
    return block;
  }

  function render(): void {
    replace(worldList, store.state.sections.map(sectionBlock));
    const chars = store.state.characters.slice(0, 3);
    if (chars.length) replace(galleryGrid, chars.map((c, i) => characterCard(c, i)));
    else replace(galleryGrid, h('p', { class: 'empty' }, 'Nenhum personagem foi apresentado ainda. ', h('a', { href: '#/personagens' }, 'Criar o primeiro')));
  }

  render();
  let lastSections = store.state.sections;
  let lastChars = store.state.characters;
  let lastSession = store.state.session;
  const unsub = store.subscribe((s) => {
    if (s.sections !== lastSections || s.characters !== lastChars || s.session !== lastSession) {
      // Não re-renderiza enquanto o mestre edita um texto
      if (worldList.querySelector('form')) return;
      lastSections = s.sections; lastChars = s.characters; lastSession = s.session;
      render();
    }
  });

  let field: HeroField | null = null;
  return {
    el,
    title: '',
    mounted() {
      field = new HeroField(canvas, prefersReducedMotion());
      field.start();
      requestAnimationFrame(() => hero.classList.add('is-in'));
    },
    destroy() {
      unsub();
      field?.destroy();
    },
  };
}
