/** Painel do mestre: regras da campanha, membros, personagens e padrões de criaturas. */
import { fmt, h, icon, replace, uid } from '../core/dom.js';
import { store } from '../core/store.js';
import type { ViewInstance } from '../core/router.js';
import { isMaster } from '../data/permissions.js';
import type { Profile } from '../data/types.js';
import { CR_OPTIONS, CR_XP, xpForCr } from '../rules/encounter.js';
import { CLASSES, RANKS, classify } from '../rules/nightmare.js';
import { levelForXp } from '../rules/xp.js';
import { openCharacterForm } from '../ui/characterForm.js';
import { reportError, toast, withBusy } from '../ui/feedback.js';
import { notFoundView } from './notFound.js';

type Tab = 'campanha' | 'membros' | 'personagens' | 'criaturas';
const TABS: [Tab, string][] = [['campanha', 'Regras da campanha'], ['membros', 'Membros'], ['personagens', 'Personagens'], ['criaturas', 'Padrões de criaturas']];

export function adminView(): ViewInstance {
  if (!isMaster(store.state.session)) {
    return notFoundView({ title: 'Área do mestre', text: store.state.session ? 'Somente o mestre da campanha acessa esta área.' : 'Entre com a conta do mestre para acessar esta área.', href: store.state.session ? '#/' : '#/entrar', cta: store.state.session ? 'Voltar ao início' : 'Entrar' });
  }
  let tab: Tab = 'campanha';
  const tabList = h('div', { class: 'tabs', role: 'tablist', 'aria-label': 'Seções do painel' });
  const panel = h('div', { class: 'tab-panel', role: 'tabpanel', tabindex: '0' });
  const el = h('div', { class: 'page page-admin' },
    h('header', { class: 'page-head' }, h('div', null,
      h('h1', { class: 'page-title' }, 'Mestre'),
      h('p', { class: 'page-lede' }, 'Regras, permissões e valores que só você controla. Tudo fica salvo e protegido por regras de acesso.'))),
    tabList, panel);

  function renderTabs(): void {
    replace(tabList, TABS.map(([id, label], i) => {
      const b = h('button', {
        class: 'tab', type: 'button', role: 'tab', id: `tab-${id}`, 'aria-selected': String(tab === id),
        'aria-controls': 'admin-panel', tabindex: tab === id ? '0' : '-1',
      }, label);
      b.addEventListener('click', () => { tab = id; renderTabs(); renderPanel(); });
      b.addEventListener('keydown', (e) => {
        const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
        if (!d) return;
        e.preventDefault();
        tab = TABS[(i + d + TABS.length) % TABS.length][0];
        renderTabs(); renderPanel();
        tabList.querySelector<HTMLElement>(`#tab-${tab}`)?.focus();
      });
      return b;
    }));
    panel.id = 'admin-panel';
    panel.setAttribute('aria-labelledby', `tab-${tab}`);
  }

  function renderPanel(): void {
    if (tab === 'campanha') replace(panel, campaignPanel());
    else if (tab === 'membros') { replace(panel, h('p', { class: 'muted' }, 'Carregando membros…')); void membersPanel().then((n) => replace(panel, n)); }
    else if (tab === 'personagens') replace(panel, charactersPanel());
    else replace(panel, creaturesPanel());
  }

  /* --- regras --- */
  function campaignPanel(): HTMLElement {
    const s = { ...store.state.settings };
    const grantId = uid('g');
    const createId = uid('c');
    const rulesId = uid('r');
    const grant = h('input', { type: 'checkbox', id: grantId, checked: s.playersCanGrantXp });
    const create = h('input', { type: 'checkbox', id: createId, checked: s.playersCanCreateCharacters });
    const rules = h('textarea', { class: 'input textarea', id: rulesId, rows: '5', maxlength: '2000' }, s.rewardRules);
    const save = h('button', { class: 'btn btn-primary', type: 'submit' }, 'Salvar regras');
    const form = h('form', { class: 'form admin-form' },
      h('fieldset', { class: 'fieldset' }, h('legend', { class: 'field-label' }, 'Progressão'),
        h('label', { class: 'check', for: grantId }, grant, h('span', null, 'Jogadores podem adicionar XP aos próprios personagens')),
        h('p', { class: 'field-help' }, 'Desligado (recomendado): só o mestre concede XP. A regra é aplicada no banco, não só na interface.'),
        h('label', { class: 'check', for: createId }, create, h('span', null, 'Jogadores podem criar personagens'))),
      h('label', { class: 'field', for: rulesId },
        h('span', { class: 'field-label' }, 'Como recompensas, fragmentos e núcleos são obtidos'),
        rules,
        h('span', { class: 'field-help' }, 'Aparece no Simulador de Encontros. Escreva as regras da sua adaptação — elas podem diferir da novel.')),
      h('div', { class: 'modal-actions' }, save));
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      void withBusy(save, async () => {
        const next = { playersCanGrantXp: grant.checked, playersCanCreateCharacters: create.checked, rewardRules: rules.value.trim() };
        await store.repo.saveSettings(next);
        store.set({ settings: next });
        toast('Regras salvas.');
      });
    });
    return form;
  }

  /* --- membros --- */
  async function membersPanel(): Promise<HTMLElement> {
    let profiles: Profile[] = [];
    try {
      profiles = await store.repo.listProfiles();
    } catch (e) {
      reportError(e);
    }
    const me = store.state.session?.profile.id;
    return h('div', { class: 'admin-list' },
      h('p', { class: 'field-help' }, store.repo.mode === 'demo'
        ? 'Na demonstração, os membros são fictícios.'
        : 'Novos jogadores aparecem aqui assim que criam a conta na página Entrar.'),
      h('table', { class: 'table' },
        h('thead', null, h('tr', null, h('th', { scope: 'col' }, 'Nome'), h('th', { scope: 'col' }, 'Papel'), h('th', { scope: 'col' }, 'Personagens'))),
        h('tbody', null, profiles.map((p) => {
          const sel = h('select', { class: 'input input-compact', 'aria-label': `Papel de ${p.displayName}` },
            h('option', { value: 'player', selected: p.role === 'player' }, 'Jogador'),
            h('option', { value: 'master', selected: p.role === 'master' }, 'Mestre'));
          sel.addEventListener('change', async () => {
            const prev = p.role;
            try {
              await store.repo.setRole(p.id, sel.value as Profile['role']);
              p.role = sel.value as Profile['role'];
              toast(`${p.displayName} agora é ${p.role === 'master' ? 'mestre' : 'jogador'}.`);
              if (p.id === me) { store.set({ session: await store.repo.getSession() }); window.location.hash = '#/'; }
            } catch (e) {
              sel.value = prev;
              reportError(e);
            }
          });
          const count = store.state.characters.filter((c) => c.ownerId === p.id).length;
          return h('tr', null, h('td', null, p.displayName, p.id === me ? h('span', { class: 'muted' }, ' (você)') : null), h('td', null, sel), h('td', null, String(count)));
        }))));
  }

  /* --- personagens --- */
  function charactersPanel(): HTMLElement {
    const chars = store.state.characters;
    return h('div', { class: 'admin-list' },
      h('div', { class: 'admin-list-head' },
        h('p', { class: 'field-help' }, 'XP é concedido no Mar da Alma de cada personagem ou pelo Simulador de Encontros, sempre com histórico.'),
        h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => openCharacterForm(null, () => renderPanel()) }, icon('plus'), 'Novo personagem')),
      chars.length ? h('div', { class: 'table-scroll' }, h('table', { class: 'table' },
        h('thead', null, h('tr', null, ['Personagem', 'Jogador', 'Nível', 'XP', 'Núcleos', 'Visível', ''].map((t) => h('th', { scope: 'col' }, t)))),
        h('tbody', null, chars.map((c) => h('tr', null,
          h('td', null, h('a', { href: `#/personagens/${c.id}` }, c.name)),
          h('td', null, c.playerName || '—'),
          h('td', null, String(levelForXp(c.xp))),
          h('td', null, fmt(c.xp)),
          h('td', null, String(c.soulCores)),
          h('td', null, c.isPublic ? 'Sim' : 'Não'),
          h('td', { class: 'table-actions' },
            h('a', { class: 'btn-text', href: `#/mar-da-alma/${c.id}` }, 'XP e núcleo'),
            h('button', { class: 'btn-text', type: 'button', onClick: () => openCharacterForm(c, () => renderPanel()) }, 'Editar'))))))) : h('p', { class: 'muted' }, 'Nenhum personagem.'));
  }

  /* --- padrões de criaturas --- */
  function creaturesPanel(): HTMLElement {
    let rank = 1;
    let cls = 1;
    const rankSel = h('select', { class: 'input', id: uid('r') }, RANKS.map((r) => h('option', { value: String(r.id) }, r.pt)));
    const clsSel = h('select', { class: 'input', id: uid('c') }, CLASSES.map((c) => h('option', { value: String(c.id) }, `${c.pt} (${c.cores})`)));
    const crSel = h('select', { class: 'input', id: uid('cr') }, h('option', { value: '' }, '— sem CR'), CR_OPTIONS.map((cr) => h('option', { value: cr }, `CR ${cr} · ${fmt(CR_XP[cr])} XP`)));
    const xpIn = h('input', { class: 'input', id: uid('xp'), type: 'number', min: '0', step: '1', placeholder: 'Pelo CR' });
    const shardsIn = h('input', { class: 'input', id: uid('sh'), type: 'number', min: '0', step: '1', value: '0' });
    const rewardIn = h('input', { class: 'input', id: uid('rw'), maxlength: '160', placeholder: 'Ex.: chance de Memória' });
    const title = h('p', { class: 'admin-combo' });
    const save = h('button', { class: 'btn btn-primary', type: 'submit' }, 'Salvar padrão');
    const del = h('button', { class: 'btn btn-ghost btn-quiet', type: 'button' }, 'Remover padrão');
    const listBox = h('div');

    const fieldOf = (label: string, input: HTMLElement): HTMLElement => h('label', { class: 'field', for: input.id }, h('span', { class: 'field-label' }, label), input);

    function loadCombo(): void {
      rankSel.value = String(rank);
      clsSel.value = String(cls);
      const c = classify(rank, cls);
      const d = store.state.defaults.find((x) => x.rank === rank && x.cls === cls);
      crSel.value = d?.cr ?? '';
      xpIn.value = d?.xp != null ? String(d.xp) : '';
      shardsIn.value = String(d?.shards ?? 0);
      rewardIn.value = d?.reward ?? '';
      del.hidden = !d;
      replace(title, h('strong', null, c.namePt), h('span', { class: 'muted', lang: 'en' }, ` ${c.nameEn}`), h('span', { class: 'muted' }, d ? ' · configurado' : ' · sem padrão'));
    }

    function renderList(): void {
      const ds = [...store.state.defaults].sort((a, b) => a.rank - b.rank || a.cls - b.cls);
      replace(listBox, ds.length
        ? h('div', { class: 'table-scroll' }, h('table', { class: 'table' },
          h('thead', null, h('tr', null, ['Combinação', 'CR', 'XP', 'Fragmentos', 'Recompensa'].map((t) => h('th', { scope: 'col' }, t)))),
          h('tbody', null, ds.map((d) => h('tr', null,
            h('td', null, h('button', { class: 'btn-text', type: 'button', onClick: () => { rank = d.rank; cls = d.cls; loadCombo(); rankSel.focus(); } }, classify(d.rank, d.cls).namePt)),
            h('td', null, d.cr ?? '—'),
            h('td', null, d.xp != null ? fmt(d.xp) : xpForCr(d.cr) != null ? `${fmt(xpForCr(d.cr)!)} (CR)` : '—'),
            h('td', null, String(d.shards)),
            h('td', null, d.reward || '—'))))))
        : h('p', { class: 'muted' }, 'Nenhum padrão configurado. Sem padrão, cada criatura do encontro precisa de CR ou XP próprio.'));
    }

    rankSel.addEventListener('change', () => { rank = Number(rankSel.value); loadCombo(); });
    clsSel.addEventListener('change', () => { cls = Number(clsSel.value); loadCombo(); });
    const form = h('form', { class: 'form admin-form' },
      h('p', { class: 'field-help' }, 'Não existe conversão oficial de Rank × Classe para CR. Estes são os valores da sua campanha, usados quando uma criatura do encontro não tem CR/XP próprio.'),
      h('div', { class: 'form-grid' }, fieldOf('Rank', rankSel), fieldOf('Classe', clsSel)),
      title,
      h('div', { class: 'form-grid' }, fieldOf('CR padrão', crSel), fieldOf('XP padrão (opcional, substitui o CR)', xpIn), fieldOf('Fragmentos por criatura', shardsIn), fieldOf('Recompensa padrão', rewardIn)),
      h('div', { class: 'modal-actions' }, del, save),
      h('h3', { class: 'block-title' }, 'Padrões configurados'),
      listBox);

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      void withBusy(save, async () => {
        const xp = xpIn.value.trim() === '' ? null : Math.max(0, Math.floor(Number(xpIn.value) || 0));
        const d = { rank, cls, cr: crSel.value || null, xp, reward: rewardIn.value.trim(), shards: Math.max(0, Math.floor(Number(shardsIn.value) || 0)) };
        await store.repo.saveCreatureDefault(d);
        store.set({ defaults: [...store.state.defaults.filter((x) => !(x.rank === rank && x.cls === cls)), d] });
        toast(`Padrão de ${classify(rank, cls).namePt} salvo.`);
        loadCombo(); renderList();
      });
    });
    del.addEventListener('click', () => void withBusy(del, async () => {
      await store.repo.deleteCreatureDefault(rank, cls);
      store.set({ defaults: store.state.defaults.filter((x) => !(x.rank === rank && x.cls === cls)) });
      toast('Padrão removido.');
      loadCombo(); renderList();
    }));
    loadCombo();
    renderList();
    return form;
  }

  renderTabs();
  renderPanel();
  let lastChars = store.state.characters;
  const unsub = store.subscribe((s) => {
    if (s.characters !== lastChars && tab === 'personagens') { lastChars = s.characters; renderPanel(); }
  });
  return { el, title: 'Mestre', destroy: unsub };
}
