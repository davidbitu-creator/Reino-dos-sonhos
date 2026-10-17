/** Criaturas do Pesadelo: simulador de classificação (49 combinações) e tabela 7×7. */
import { fmt, h, prefersReducedMotion, replace } from '../core/dom.js';
import { store } from '../core/store.js';
import type { ViewInstance } from '../core/router.js';
import { CLASSES, RANKS, classify } from '../rules/nightmare.js';
import { xpForCr } from '../rules/encounter.js';
import { createSelect } from '../ui/select.js';

export function nightmareView(): ViewInstance {
  let rank = 3;
  let cls = 5;

  const result = h('div', { class: 'nm-result', 'aria-live': 'polite' });
  const rankSel = createSelect({
    label: 'Rank', value: String(rank),
    options: RANKS.map((r) => ({ value: String(r.id), label: r.pt, hint: r.en })),
    onChange: (v) => { rank = Number(v); update(); },
  });
  const classSel = createSelect({
    label: 'Classe', value: String(cls),
    options: CLASSES.map((c) => ({ value: String(c.id), label: c.pt, hint: `${c.cores} ${c.cores === 1 ? 'núcleo' : 'núcleos'}` })),
    onChange: (v) => { cls = Number(v); update(); },
  });

  const tableWrap = h('div', { class: 'nm-table-wrap' });
  const mobileList = h('div', { class: 'nm-mobile' });
  const tip = h('div', { class: 'nm-tip', role: 'tooltip', id: 'nm-tip', hidden: true });

  const simulator = h('section', { class: 'nm-sim', 'aria-labelledby': 'nm-sim-title', id: 'simulador' },
    h('h2', { class: 'sr-only', id: 'nm-sim-title' }, 'Simulador de classificação'),
    h('div', { class: 'nm-controls' }, rankSel.el, h('span', { class: 'nm-times', 'aria-hidden': 'true' }, '×'), classSel.el),
    result);

  const el = h('div', { class: 'page page-nightmare' },
    h('header', { class: 'page-head' },
      h('div', null,
        h('h1', { class: 'page-title' }, 'Criaturas do Pesadelo'),
        h('p', { class: 'page-lede' }, 'Toda criatura é medida por duas coisas: o Rank diz quão profundamente o Pesadelo a corrompeu; a Classe diz quantos Núcleos da Alma ela carrega.'))),
    simulator,
    h('section', { class: 'nm-grid-section', 'aria-labelledby': 'nm-grid-title' },
      h('div', { class: 'section-head section-head-row' },
        h('h2', { class: 'section-title section-title-sm', id: 'nm-grid-title' }, 'As 49 combinações'),
        h('p', { class: 'section-note' }, 'Selecione uma combinação para levá-la ao simulador.')),
      tableWrap, mobileList, tip),
    h('aside', { class: 'nm-note' },
      h('p', null, 'Rank e Classe não têm conversão oficial para o Challenge Rating de D&D. Valores de CR e XP usados nos encontros são definidos pelo mestre, por criatura ou como padrão para cada combinação.')));

  function update(scroll = false): void {
    const c = classify(rank, cls);
    rankSel.setValue(String(rank));
    classSel.setValue(String(cls));
    const def = store.state.defaults.find((d) => d.rank === rank && d.cls === cls);
    const defXp = def ? def.xp ?? xpForCr(def.cr) : null;
    const node = h('div', { class: 'nm-result-inner' },
      h('p', { class: 'nm-name' }, c.namePt),
      h('p', { class: 'nm-name-en', lang: 'en' }, c.nameEn),
      h('div', { class: 'nm-cores', role: 'img', 'aria-label': `${c.cores} de 7 Núcleos da Alma` },
        Array.from({ length: 7 }, (_, i) => h('span', { class: ['nm-core', i < c.cores && 'is-on'] }))),
      h('p', { class: 'nm-cores-text' }, `${c.cores} ${c.cores === 1 ? 'Núcleo' : 'Núcleos'} da Alma`),
      def
        ? h('p', { class: 'nm-default' }, `Padrão da campanha: ${def.cr ? `CR ${def.cr}` : 'sem CR'}${defXp != null ? ` · ${fmt(defXp)} XP` : ''}`)
        : null);
    if (!prefersReducedMotion()) {
      node.classList.add('is-entering');
      requestAnimationFrame(() => requestAnimationFrame(() => node.classList.remove('is-entering')));
    }
    replace(result, node);
    tableWrap.querySelectorAll('.nm-cell').forEach((b) => {
      const sel = (b as HTMLElement).dataset.key === c.key;
      b.classList.toggle('is-selected', sel);
      b.setAttribute('aria-pressed', String(sel));
    });
    mobileList.querySelectorAll('.nm-chip').forEach((b) => {
      const sel = (b as HTMLElement).dataset.key === c.key;
      b.classList.toggle('is-selected', sel);
      b.setAttribute('aria-pressed', String(sel));
    });
    if (scroll) simulator.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'center' });
  }

  function pick(r: number, k: number): void {
    rank = r;
    cls = k;
    update(true);
  }

  // Tabela 7×7 (desktop/tablet)
  const table = h('table', { class: 'nm-table' },
    h('caption', { class: 'sr-only' }, 'Classificação das criaturas: linhas são Ranks, colunas são Classes'),
    h('thead', null, h('tr', null,
      h('th', { scope: 'col', class: 'nm-corner' }, h('span', { class: 'sr-only' }, 'Rank / Classe')),
      CLASSES.map((c) => h('th', { scope: 'col' }, h('span', { class: 'nm-th' }, c.pt), h('span', { class: 'nm-th-sub' }, `${c.cores}`))))),
    h('tbody', null, RANKS.map((r) => h('tr', null,
      h('th', { scope: 'row' }, h('span', { class: 'nm-th' }, r.pt), h('span', { class: 'nm-th-sub', lang: 'en' }, r.en)),
      CLASSES.map((c) => {
        const k = classify(r.id, c.id);
        const btn = h('button', {
          class: 'nm-cell', type: 'button', 'data-key': k.key, 'aria-pressed': 'false',
          'aria-label': `${k.namePt} (${k.nameEn}), ${k.cores} ${k.cores === 1 ? 'núcleo' : 'núcleos'}`,
          'aria-describedby': 'nm-tip',
          style: { '--depth': (r.id - 1) / 6, '--weight': (c.id - 1) / 6 },
          onClick: () => pick(r.id, c.id),
        }, h('span', { class: 'nm-cell-dot', 'aria-hidden': 'true' }));
        const show = (): void => {
          tip.hidden = false;
          replace(tip, h('strong', null, k.namePt), h('span', { lang: 'en' }, k.nameEn), h('span', null, `${k.cores} ${k.cores === 1 ? 'núcleo' : 'núcleos'}`));
          const br = btn.getBoundingClientRect();
          const wr = tableWrap.parentElement!.getBoundingClientRect();
          tip.style.left = `${br.left - wr.left + br.width / 2}px`;
          tip.style.top = `${br.top - wr.top}px`;
        };
        btn.addEventListener('mouseenter', show);
        btn.addEventListener('focus', show);
        btn.addEventListener('mouseleave', () => (tip.hidden = true));
        btn.addEventListener('blur', () => (tip.hidden = true));
        return h('td', null, btn);
      })))));
  tableWrap.append(table);

  // Alternativa para telas pequenas: um grupo por Rank
  mobileList.append(...RANKS.map((r) => h('details', { class: 'nm-rank-group', open: r.id === rank },
    h('summary', null, h('span', null, r.pt), h('span', { class: 'nm-th-sub', lang: 'en' }, r.en)),
    h('div', { class: 'nm-chips' }, CLASSES.map((c) => {
      const k = classify(r.id, c.id);
      return h('button', { class: 'nm-chip', type: 'button', 'data-key': k.key, 'aria-pressed': 'false', onClick: () => pick(r.id, c.id) },
        h('span', null, k.namePt), h('span', { class: 'nm-chip-cores' }, `${k.cores}`));
    })))));

  update();
  const unsub = store.subscribe(() => update());
  return { el, title: 'Criaturas do Pesadelo', destroy: unsub };
}

