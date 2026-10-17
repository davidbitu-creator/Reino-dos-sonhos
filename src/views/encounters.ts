/**
 * Simulador de Encontros — orçamento de XP do DMG 2024, recompensas e concessão de XP.
 * Recalcula a cada alteração. O mestre salva/recupera encontros e concede o XP ao grupo.
 */
import { fmt, fmtDate, h, icon, replace, uid } from '../core/dom.js';
import { store } from '../core/store.js';
import type { ViewInstance } from '../core/router.js';
import { isMaster } from '../data/permissions.js';
import type { EncounterData, SavedEncounter } from '../data/types.js';
import {
  CR_OPTIONS, CR_XP, DIFFICULTY_LABEL, defaultKey, summarizeEncounter,
  type CreatureDefault, type CreatureEntry, type PartyMember,
} from '../rules/encounter.js';
import { CLASSES, RANKS, classify } from '../rules/nightmare.js';
import { levelForXp } from '../rules/xp.js';
import { confirmDialog, reportError, toast, withBusy } from '../ui/feedback.js';

function emptyEncounter(): EncounterData {
  return { characterIds: [], temps: [], creatures: [newCreature()], mode: 'even', weights: {}, notes: '' };
}

function newCreature(): CreatureEntry {
  return { id: uid('cr'), name: '', rank: 1, cls: 1, qty: 1, cr: '', xp: null, reward: '', shards: null };
}

const XP_SOURCE_LABEL: Record<string, string> = {
  manual: 'XP manual', cr: 'pelo CR', 'default-xp': 'padrão da campanha', 'default-cr': 'CR padrão da campanha', missing: 'sem CR/XP',
};

export function encountersView(): ViewInstance {
  let data: EncounterData = emptyEncounter();
  let currentId: string | undefined;
  let currentName = '';
  let saved: SavedEncounter[] = [];

  const partyBox = h('div', { class: 'enc-party' });
  const creaturesBox = h('div', { class: 'enc-creatures' });
  const distBox = h('div', { class: 'enc-dist' });
  const results = h('div', { class: 'enc-results', 'aria-live': 'polite' });
  const savedBox = h('div', { class: 'enc-saved' });

  const el = h('div', { class: 'page page-encounters' },
    h('header', { class: 'page-head' },
      h('div', null,
        h('h1', { class: 'page-title' }, 'Simulador de Encontros'),
        h('p', { class: 'page-lede' }, 'Orçamento de XP do Dungeon Master’s Guide 2024, somado nível a nível. Sem multiplicadores por quantidade de inimigos.'))),
    h('div', { class: 'enc-layout' },
      h('div', { class: 'enc-main' },
        h('section', { class: 'enc-block', 'aria-labelledby': 'enc-party-t' }, h('h2', { class: 'block-title', id: 'enc-party-t' }, 'Grupo'), partyBox),
        h('section', { class: 'enc-block', 'aria-labelledby': 'enc-cr-t' }, h('h2', { class: 'block-title', id: 'enc-cr-t' }, 'Criaturas'), creaturesBox),
        h('section', { class: 'enc-block', 'aria-labelledby': 'enc-dist-t' }, h('h2', { class: 'block-title', id: 'enc-dist-t' }, 'Distribuição do XP'), distBox)),
      h('aside', { class: 'enc-side' }, results, savedBox)));

  const defaultsMap = (): Map<string, CreatureDefault> => new Map(store.state.defaults.map((d) => [defaultKey(d.rank, d.cls), d]));

  function members(): PartyMember[] {
    const chars = store.state.characters;
    const regs = data.characterIds
      .map((id) => chars.find((c) => c.id === id))
      .filter((c): c is NonNullable<typeof c> => !!c)
      .map((c) => ({ id: c.id, name: c.name, level: levelForXp(c.xp) }));
    return [...regs, ...data.temps.map((t) => ({ id: t.id, name: t.name || 'Participante', level: t.level, temporary: true }))];
  }

  /* ---------- Grupo ---------- */
  function renderParty(): void {
    const chars = store.state.characters;
    const regs = chars.length
      ? h('fieldset', { class: 'enc-fieldset' }, h('legend', { class: 'field-label' }, 'Personagens cadastrados'),
        h('div', { class: 'enc-checks' }, chars.map((c) => {
          const id = uid('pc');
          const cb = h('input', { type: 'checkbox', id, checked: data.characterIds.includes(c.id) });
          cb.addEventListener('change', () => {
            data.characterIds = cb.checked ? [...data.characterIds, c.id] : data.characterIds.filter((x) => x !== c.id);
            renderDist();
            recompute();
          });
          return h('label', { class: 'enc-check', for: id, style: { '--core': c.coreColor } }, cb,
            h('span', { class: 'enc-check-name' }, c.name), h('span', { class: 'enc-check-lvl' }, `Nível ${levelForXp(c.xp)}`));
        })))
      : h('p', { class: 'field-help' }, 'Nenhum personagem cadastrado visível. Use participantes temporários.');

    const temps = h('div', { class: 'enc-temps' }, data.temps.map((t) => {
      const nameId = uid('tn');
      const lvlId = uid('tl');
      const name = h('input', { class: 'input', id: nameId, value: t.name, placeholder: 'Nome', maxlength: '60' });
      const lvl = h('input', { class: 'input input-narrow', id: lvlId, type: 'number', min: '1', max: '20', step: '1', value: String(t.level) });
      name.addEventListener('input', () => { t.name = name.value; renderDistLabels(); recompute(); });
      lvl.addEventListener('input', () => { t.level = Math.max(1, Math.min(20, Number(lvl.value) || 1)); recompute(); });
      lvl.addEventListener('blur', () => { lvl.value = String(t.level); });
      return h('div', { class: 'enc-temp' },
        h('label', { class: 'field', for: nameId }, h('span', { class: 'field-label' }, 'Participante temporário'), name),
        h('label', { class: 'field', for: lvlId }, h('span', { class: 'field-label' }, 'Nível'), lvl),
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': `Remover ${t.name || 'participante'}`, onClick: () => {
          data.temps = data.temps.filter((x) => x !== t);
          renderParty(); renderDist(); recompute();
        } }, icon('close')));
    }));
    replace(partyBox, regs, temps,
      h('button', { class: 'btn-text', type: 'button', onClick: () => {
        data.temps.push({ id: uid('tmp'), name: '', level: 1 });
        renderParty(); renderDist(); recompute();
        partyBox.querySelector<HTMLInputElement>('.enc-temp:last-child input')?.focus();
      } }, icon('plus'), 'Adicionar participante temporário'));
  }

  /* ---------- Criaturas ---------- */
  function select(label: string, value: string, opts: [string, string][], onChange: (v: string) => void): HTMLElement {
    const id = uid('s');
    const s = h('select', { class: 'input', id }, opts.map(([v, l]) => h('option', { value: v, selected: v === value }, l)));
    s.addEventListener('change', () => onChange(s.value));
    return h('label', { class: 'field', for: id }, h('span', { class: 'field-label' }, label), s);
  }

  function input(label: string, value: string, attrs: Record<string, string>, onInput: (v: string) => void, extraClass = ''): HTMLElement {
    const id = uid('i');
    const i = h('input', { class: ['input', extraClass], id, value, ...attrs });
    i.addEventListener('input', () => onInput(i.value));
    return h('label', { class: 'field', for: id }, h('span', { class: 'field-label' }, label), i);
  }

  function renderCreatures(): void {
    const rows = data.creatures.map((c, idx) => {
      const derived = h('p', { class: 'enc-derived', 'data-derived': c.id });
      const row = h('div', { class: 'enc-creature' },
        h('div', { class: 'enc-creature-head' },
          h('span', { class: 'enc-creature-idx', 'aria-hidden': 'true' }, String(idx + 1)),
          derived,
          h('button', { class: 'icon-btn', type: 'button', 'aria-label': `Remover criatura ${idx + 1}`, onClick: () => {
            data.creatures = data.creatures.filter((x) => x !== c);
            renderCreatures(); recompute();
          } }, icon('close'))),
        h('div', { class: 'enc-creature-grid' },
          input('Nome', c.name, { maxlength: '60', placeholder: classify(c.rank, c.cls).namePt }, (v) => { c.name = v; recompute(); }, 'enc-name'),
          select('Rank', String(c.rank), RANKS.map((r) => [String(r.id), r.pt]), (v) => { c.rank = Number(v); refreshPlaceholder(row, c); recompute(); }),
          select('Classe', String(c.cls), CLASSES.map((k) => [String(k.id), `${k.pt} (${k.cores})`]), (v) => { c.cls = Number(v); refreshPlaceholder(row, c); recompute(); }),
          input('Quantidade', String(c.qty), { type: 'number', min: '0', max: '999', step: '1' }, (v) => { c.qty = Math.max(0, Math.min(999, Math.floor(Number(v) || 0))); recompute(); }, 'input-narrow'),
          select('CR (D&D)', c.cr, [['', '— padrão / nenhum'], ...CR_OPTIONS.map((cr): [string, string] => [cr, `CR ${cr} · ${fmt(CR_XP[cr])} XP`])], (v) => { c.cr = v; recompute(); }),
          input('XP por criatura', c.xp == null ? '' : String(c.xp), { type: 'number', min: '0', step: '1', placeholder: 'Pelo CR' }, (v) => { c.xp = v.trim() === '' ? null : Math.max(0, Math.floor(Number(v) || 0)); recompute(); }, 'input-narrow'),
          input('Fragmentos por criatura', c.shards == null ? '' : String(c.shards), { type: 'number', min: '0', step: '1', placeholder: 'Padrão' }, (v) => { c.shards = v.trim() === '' ? null : Math.max(0, Math.floor(Number(v) || 0)); recompute(); }, 'input-narrow'),
          input('Recompensa de campanha', c.reward, { maxlength: '160', placeholder: 'Ex.: uma Memória, um item…' }, (v) => { c.reward = v; recompute(); }, 'enc-reward')));
      return row;
    });
    replace(creaturesBox, rows,
      h('button', { class: 'btn-text', type: 'button', onClick: () => {
        data.creatures.push(newCreature());
        renderCreatures(); recompute();
        creaturesBox.querySelector<HTMLInputElement>('.enc-creature:last-of-type .enc-name')?.focus();
      } }, icon('plus'), 'Adicionar criatura'),
      h('p', { class: 'field-help' }, 'O XP vem, nesta ordem: do XP manual, do CR informado, ou do padrão que o mestre configurou para o Rank × Classe. Os núcleos possuídos (pela Classe) não são recompensa automática.'));
  }

  function refreshPlaceholder(row: HTMLElement, c: CreatureEntry): void {
    const n = row.querySelector<HTMLInputElement>('.enc-name');
    if (n) n.placeholder = classify(c.rank, c.cls).namePt;
  }

  /* ---------- Distribuição ---------- */
  function renderDist(): void {
    const evenId = uid('ev');
    const wId = uid('wt');
    const even = h('input', { type: 'radio', name: 'enc-mode', id: evenId, checked: data.mode === 'even' });
    const weighted = h('input', { type: 'radio', name: 'enc-mode', id: wId, checked: data.mode === 'weighted' });
    even.addEventListener('change', () => { data.mode = 'even'; renderDist(); recompute(); });
    weighted.addEventListener('change', () => { data.mode = 'weighted'; renderDist(); recompute(); });
    const ms = members();
    const weights = data.mode === 'weighted' && ms.length
      ? h('div', { class: 'enc-weights' }, ms.map((m) => {
        const id = uid('w');
        const i = h('input', { class: 'input input-narrow', id, type: 'number', min: '0', max: '10', step: '0.5', value: String(data.weights[m.id] ?? 1) });
        i.addEventListener('input', () => { data.weights[m.id] = Math.max(0, Number(i.value) || 0); recompute(); });
        return h('label', { class: 'field field-inline', for: id }, h('span', { class: 'field-label', 'data-member': m.id }, m.name), i);
      }))
      : null;
    replace(distBox,
      h('div', { class: 'radio-row', role: 'radiogroup', 'aria-label': 'Modo de distribuição' },
        h('label', { class: 'check', for: evenId }, even, h('span', null, 'Partes iguais')),
        h('label', { class: 'check', for: wId }, weighted, h('span', null, 'Por peso (0 = não recebe)'))),
      weights);
  }

  function renderDistLabels(): void {
    for (const m of members()) {
      const l = distBox.querySelector(`[data-member="${m.id}"]`);
      if (l) l.textContent = m.name;
    }
  }

  /* ---------- Resultados ---------- */
  function recompute(): void {
    const ms = members();
    const s = summarizeEncounter(ms, data.creatures, defaultsMap(), data.mode, data.weights);
    const master = isMaster(store.state.session);

    for (const rc of s.creatures) {
      const d = creaturesBox.querySelector(`[data-derived="${rc.entry.id}"]`);
      if (!d) continue;
      replace(d,
        h('strong', null, rc.entry.name || rc.namePt),
        h('span', null, `${rc.entry.name ? ` · ${rc.namePt}` : ''} · ${rc.coresEach} ${rc.coresEach === 1 ? 'núcleo' : 'núcleos'}`),
        h('span', { class: rc.xpEach == null ? 'is-warn' : '' }, rc.xpEach == null
          ? ' · informe CR ou XP'
          : ` · ${fmt(rc.xpEach)} XP cada (${XP_SOURCE_LABEL[rc.xpSource]})${rc.crShown ? ` · CR ${rc.crShown}` : ''}`));
    }

    const max = Math.max(s.budget.high * 1.25, s.totalXp * 1.05, 1);
    const pos = (v: number): string => `${Math.min(100, (v / max) * 100)}%`;
    const scale = s.budget.high > 0
      ? h('div', { class: 'enc-scale', 'aria-hidden': 'true' },
        h('span', { class: 'enc-scale-zone z-low', style: { width: pos(s.budget.low) } }),
        h('span', { class: 'enc-scale-zone z-mod', style: { left: pos(s.budget.low), width: `calc(${pos(s.budget.moderate)} - ${pos(s.budget.low)})` } }),
        h('span', { class: 'enc-scale-zone z-high', style: { left: pos(s.budget.moderate), width: `calc(${pos(s.budget.high)} - ${pos(s.budget.moderate)})` } }),
        s.canCalculate ? h('span', { class: 'enc-scale-mark', style: { left: pos(s.totalXp) } }) : null)
      : null;

    const memberRows = ms.map((m) => h('li', null,
      h('span', null, m.name, m.temporary ? h('span', { class: 'muted' }, ' (temporário)') : null),
      h('span', null, s.canCalculate ? `${fmt(s.perMember[m.id] ?? 0)} XP` : '—')));

    replace(results,
      h('div', { class: 'enc-total' },
        h('span', { class: 'enc-total-label' }, 'XP total do encontro'),
        h('span', { class: 'enc-total-num' }, s.missingXp.length ? '—' : fmt(s.totalXp))),
      h('div', { class: ['enc-difficulty', `d-${s.difficulty}`] },
        h('span', { class: 'enc-difficulty-label' }, 'Dificuldade estimada'),
        h('span', { class: 'enc-difficulty-value' }, DIFFICULTY_LABEL[s.difficulty]),
        s.belowLow ? h('span', { class: 'enc-difficulty-note' }, 'Abaixo do orçamento Baixo') : null),
      scale,
      h('dl', { class: 'enc-budgets' },
        h('div', null, h('dt', null, 'Baixa'), h('dd', null, fmt(s.budget.low))),
        h('div', null, h('dt', null, 'Moderada'), h('dd', null, fmt(s.budget.moderate))),
        h('div', null, h('dt', null, 'Alta'), h('dd', null, fmt(s.budget.high)))),
      s.warnings.length ? h('ul', { class: 'enc-warnings' }, s.warnings.map((w) => h('li', null, w))) : null,
      h('div', { class: 'enc-sub' }, h('h3', { class: 'enc-sub-title' }, 'XP por personagem'),
        ms.length ? h('ul', { class: 'enc-list' }, memberRows) : h('p', { class: 'muted' }, 'Nenhum membro no grupo.')),
      h('dl', { class: 'enc-budgets enc-budgets-2' },
        h('div', null, h('dt', null, 'Núcleos nas criaturas'), h('dd', null, fmt(s.coresTotal))),
        h('div', null, h('dt', null, 'Fragmentos obtidos'), h('dd', null, fmt(s.shardsTotal)))),
      s.rewards.length || store.state.settings.rewardRules
        ? h('div', { class: 'enc-sub' }, h('h3', { class: 'enc-sub-title' }, 'Recompensas'),
          s.rewards.length ? h('ul', { class: 'enc-list' }, s.rewards.map((r) => h('li', null, h('span', null, `${r.label} ×${r.qty}`), h('span', null, r.reward)))) : null,
          store.state.settings.rewardRules ? h('p', { class: 'enc-rules' }, store.state.settings.rewardRules) : null)
        : null,
      master ? awardButton(s.canCalculate, s.perMember) : null);
  }

  function awardButton(enabled: boolean, perMember: Record<string, number>): HTMLElement {
    const regs = data.characterIds.filter((id) => (perMember[id] ?? 0) > 0);
    const btn = h('button', { class: 'btn btn-primary btn-block', type: 'button', disabled: !enabled || regs.length === 0 }, 'Conceder XP aos personagens');
    btn.addEventListener('click', async () => {
      const chars = store.state.characters;
      const lines = regs.map((id) => `${chars.find((c) => c.id === id)?.name}: +${fmt(perMember[id])} XP`).join(' · ');
      const ok = await confirmDialog('Conceder XP', `${lines}. Participantes temporários não recebem XP registrado. Cada concessão entra no histórico do personagem.`, 'Conceder');
      if (!ok) return;
      await withBusy(btn, async () => {
        const reason = `Encontro: ${currentName.trim() || 'sem nome'}`;
        for (const id of regs) {
          const { character } = await store.repo.applyXp(id, { kind: 'add', value: perMember[id], reason });
          store.upsertCharacter(character);
        }
        toast('XP concedido. Quem subiu de nível verá a ascensão ao entrar no Mar da Alma.');
      });
    });
    return h('div', { class: 'enc-award' }, btn,
      h('p', { class: 'field-help' }, 'Concede o XP calculado para cada personagem cadastrado selecionado.'));
  }

  /* ---------- Salvos ---------- */
  function renderSaved(): void {
    if (!isMaster(store.state.session)) {
      replace(savedBox, h('p', { class: 'field-help enc-saved-note' }, 'Salvar e recuperar encontros é exclusivo do mestre. O cálculo funciona para todos.'));
      return;
    }
    const nameId = uid('en');
    const nameInput = h('input', { class: 'input', id: nameId, value: currentName, maxlength: '120', placeholder: 'Ex.: Emboscada na catedral' });
    nameInput.addEventListener('input', () => { currentName = nameInput.value; });
    const saveBtn = h('button', { class: 'btn btn-primary', type: 'button' }, icon('save'), currentId ? 'Salvar alterações' : 'Salvar encontro');
    const saveNew = currentId ? h('button', { class: 'btn btn-ghost', type: 'button' }, 'Salvar como novo') : null;
    const newBtn = h('button', { class: 'btn-text', type: 'button' }, icon('plus'), 'Novo encontro em branco');

    const doSave = (asNew: boolean, btn: HTMLButtonElement): Promise<unknown> => withBusy(btn, async () => {
      if (!currentName.trim()) { nameInput.focus(); throw new Error('Dê um nome ao encontro antes de salvar.'); }
      const res = await store.repo.saveEncounter({ id: asNew ? undefined : currentId, name: currentName, data });
      currentId = res.id;
      currentName = res.name;
      toast('Encontro salvo.');
      await loadSaved();
    });
    saveBtn.addEventListener('click', () => void doSave(false, saveBtn));
    saveNew?.addEventListener('click', () => void doSave(true, saveNew));
    newBtn.addEventListener('click', () => {
      data = emptyEncounter(); currentId = undefined; currentName = '';
      renderAll();
    });

    replace(savedBox,
      h('div', { class: 'enc-save' },
        h('label', { class: 'field', for: nameId }, h('span', { class: 'field-label' }, 'Nome do encontro'), nameInput),
        h('div', { class: 'panel-actions' }, saveNew, saveBtn),
        newBtn),
      h('div', { class: 'enc-sub' }, h('h3', { class: 'enc-sub-title' }, 'Encontros salvos'),
        saved.length
          ? h('ul', { class: 'enc-saved-list' }, saved.map((e) => h('li', { class: ['enc-saved-item', e.id === currentId && 'is-current'] },
            h('button', { class: 'enc-saved-load', type: 'button', onClick: () => load(e) },
              h('span', null, e.name), h('span', { class: 'muted' }, fmtDate(e.updatedAt))),
            h('button', { class: 'icon-btn', type: 'button', 'aria-label': `Excluir ${e.name}`, onClick: async (ev: Event) => {
              if (!(await confirmDialog('Excluir encontro', `“${e.name}” será apagado.`, 'Excluir', true))) return;
              await withBusy(ev.currentTarget as HTMLButtonElement, async () => {
                await store.repo.deleteEncounter(e.id);
                if (currentId === e.id) currentId = undefined;
                toast('Encontro excluído.');
                await loadSaved();
              });
            } }, icon('trash')))))
          : h('p', { class: 'muted' }, 'Nenhum encontro salvo ainda.')));
  }

  function load(e: SavedEncounter): void {
    data = structuredClone(e.data);
    data.creatures = (data.creatures ?? []).map((c) => ({ ...newCreature(), ...c }));
    data.temps = data.temps ?? [];
    data.characterIds = data.characterIds ?? [];
    data.weights = data.weights ?? {};
    data.mode = data.mode ?? 'even';
    currentId = e.id;
    currentName = e.name;
    renderAll();
    toast(`“${e.name}” carregado.`, 'info');
  }

  async function loadSaved(): Promise<void> {
    try {
      saved = await store.repo.listEncounters();
    } catch (e) {
      reportError(e);
    }
    renderSaved();
  }

  function renderAll(): void {
    renderParty();
    renderCreatures();
    renderDist();
    renderSaved();
    recompute();
  }

  renderAll();
  void loadSaved();
  let lastSession = store.state.session;
  let lastChars = store.state.characters;
  let lastDefaults = store.state.defaults;
  const unsub = store.subscribe((s) => {
    if (s.session !== lastSession) { lastSession = s.session; void loadSaved(); recompute(); }
    if (s.characters !== lastChars) {
      const idsChanged = s.characters.map((c) => c.id + levelForXp(c.xp)).join() !== lastChars.map((c) => c.id + levelForXp(c.xp)).join();
      lastChars = s.characters;
      if (idsChanged) { renderParty(); recompute(); }
    }
    if (s.defaults !== lastDefaults) { lastDefaults = s.defaults; recompute(); }
  });
  return { el, title: 'Simulador de Encontros', destroy: unsub };
}
