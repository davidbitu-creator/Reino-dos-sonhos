/**
 * MAR DA ALMA — visão imersiva do Núcleo da Alma de um personagem.
 * Transição cinematográfica de entrada/saída, núcleo vivo em Canvas, progressão de XP 2024,
 * personalização de cor, concessão/correção de XP, histórico e a sequência de ascensão.
 */
import { fmt, fmtDate, h, icon, prefersReducedMotion, replace, uid } from '../core/dom.js';
import { store } from '../core/store.js';
import type { ViewInstance } from '../core/router.js';
import { SoulCore } from '../anim/soulCore.js';
import { canEditCharacter, canGrantXp, canSeeHistory, canViewCharacter } from '../data/permissions.js';
import type { Character, XpEvent } from '../data/types.js';
import { levelForXp, levelsGained, progressFor, MAX_XP } from '../rules/xp.js';
import { colorPicker } from '../ui/colorPicker.js';
import { memoryList } from '../ui/memories.js';
import { coreSwatch } from '../ui/characterCard.js';
import { reportError, toast, withBusy } from '../ui/feedback.js';
import { setXpBar, xpBar } from '../ui/xpBar.js';
import { notFoundView } from './notFound.js';

const SEEN_KEY = (id: string): string => `rds-seen-level-${id}`;

function readSeen(id: string): number | null {
  try {
    const v = localStorage.getItem(SEEN_KEY(id));
    return v ? Number(v) : null;
  } catch {
    return null;
  }
}

function writeSeen(id: string, level: number): void {
  try {
    localStorage.setItem(SEEN_KEY(id), String(level));
  } catch {
    /* conveniência local apenas */
  }
}

/* ---------- Seleção de personagem ---------- */

export function soulSeaIndexView(): ViewInstance {
  const list = h('div', { class: 'sea-pick-list' });
  const el = h('div', { class: 'page page-sea-index' },
    h('header', { class: 'page-head' },
      h('div', null,
        h('h1', { class: 'page-title' }, 'Mar da Alma'),
        h('p', { class: 'page-lede' }, 'Cada Adormecido carrega um mar silencioso dentro de si. No centro dele, o Núcleo da Alma respira.'))),
    list);

  function render(): void {
    const s = store.state;
    const me = s.session?.profile.id;
    const mine = s.characters.filter((c) => c.ownerId === me);
    const others = s.characters.filter((c) => c.ownerId !== me && canViewCharacter(s.session, c));
    const item = (c: Character): HTMLElement =>
      h('a', { class: 'sea-pick', href: `#/mar-da-alma/${encodeURIComponent(c.id)}`, style: { '--core': c.coreColor } },
        coreSwatch(c.coreColor, false),
        h('span', { class: 'sea-pick-name' }, c.name),
        h('span', { class: 'sea-pick-meta' }, `Nível ${levelForXp(c.xp)}`));
    const blocks: HTMLElement[] = [];
    if (mine.length) blocks.push(h('section', { class: 'sea-pick-group' }, h('h2', { class: 'group-title' }, 'Seus personagens'), mine.map(item)));
    if (others.length) blocks.push(h('section', { class: 'sea-pick-group' }, h('h2', { class: 'group-title' }, mine.length ? 'Outros Adormecidos' : 'Adormecidos'), others.map(item)));
    if (!blocks.length) {
      blocks.push(h('div', { class: 'empty-state' },
        h('p', { class: 'empty-title' }, 'Nenhum Núcleo para visitar ainda.'),
        h('p', null, s.session ? 'Crie um personagem na galeria para despertar o seu.' : 'Entre na sua conta para acessar o seu Mar da Alma.'),
        h('a', { class: 'btn btn-ghost', href: s.session ? '#/personagens' : '#/entrar' }, s.session ? 'Ir para a galeria' : 'Entrar')));
    }
    replace(list, blocks);
  }
  render();
  const unsub = store.subscribe(render);
  return { el, title: 'Mar da Alma', destroy: unsub };
}

/* ---------- O Mar ---------- */

export function soulSeaView(params: Record<string, string>): ViewInstance {
  const initial = store.character(params.id);
  if (!initial || !canViewCharacter(store.state.session, initial)) {
    return notFoundView({ title: 'Mar da Alma inacessível', text: 'Este personagem não existe ou não está visível para você.', href: '#/mar-da-alma', cta: 'Escolher outro personagem' });
  }
  let c: Character = initial;
  let savedColor = c.coreColor;
  let shownLevel = levelForXp(c.xp);
  let ascending = false;
  const reduced = prefersReducedMotion();

  /* --- estrutura --- */
  const canvas = h('canvas', { class: 'sea-canvas', role: 'img', 'aria-label': `Núcleo da Alma de ${c.name}` });
  const veil = h('div', { class: 'sea-veil', 'aria-hidden': 'true' });
  const levelNum = h('span', { class: 'sea-level-num' }, String(shownLevel));
  const xpLine = h('p', { class: 'sea-xp-line' });
  const bar = xpBar(0, 'Progresso até o próximo nível');
  const statRemaining = h('dd', null);
  const statPct = h('dd', null);
  const statNext = h('dd', null);
  const statCores = h('dd', null, String(c.soulCores));
  const live = h('p', { class: 'sr-only', 'aria-live': 'polite' });

  const stats = h('section', { class: 'sea-stats', 'aria-label': 'Progressão' },
    h('p', { class: 'sea-level' }, h('span', { class: 'sea-level-word' }, 'Nível'), levelNum),
    xpLine, bar,
    h('dl', { class: 'sea-figures' },
      h('div', null, h('dt', null, 'Próximo nível'), statNext),
      h('div', null, h('dt', null, 'Restante'), statRemaining),
      h('div', null, h('dt', null, 'Progresso'), statPct),
      h('div', null, h('dt', null, 'Núcleos da Alma'), statCores)),
    live);

  const message = h('div', { class: 'sea-ascension', 'aria-live': 'assertive', role: 'status' });

  const panelToggle = h('button', { class: 'sea-btn', type: 'button', 'aria-expanded': 'false', 'aria-controls': 'sea-panel' }, 'Núcleo e experiência');
  const panel = h('aside', { class: 'sea-panel', id: 'sea-panel', 'aria-label': 'Ajustes do Núcleo da Alma', hidden: true });

  const el = h('div', { class: ['sea', reduced && 'sea-reduced'], style: { '--core': c.coreColor } },
    canvas,
    h('div', { class: 'sea-vignette', 'aria-hidden': 'true' }),
    h('header', { class: 'sea-top' },
      h('a', { class: 'sea-btn sea-exit', href: `#/personagens/${encodeURIComponent(c.id)}` }, icon('arrow-left'), 'Sair do Mar da Alma'),
      h('h1', { class: 'sea-name' }, h('span', { class: 'sr-only' }, 'Mar da Alma de '), c.name),
      panelToggle),
    stats, message, panel, veil);

  /* --- núcleo --- */
  let core: SoulCore | null = null;
  const prog0 = progressFor(c.xp);

  /* --- números --- */
  let displayedXp = c.xp;
  let tween = 0;
  function renderStats(xp: number, levelOverride?: number): void {
    const p = progressFor(xp);
    const lvl = levelOverride ?? p.level;
    levelNum.textContent = String(lvl);
    if (p.isMax) {
      xpLine.textContent = `${fmt(p.xp)} XP`;
      statNext.textContent = 'Máximo';
      statRemaining.textContent = '—';
      statPct.textContent = '100%';
    } else {
      xpLine.textContent = `${fmt(p.xp)} / ${fmt(p.next!)} XP`;
      statNext.textContent = `${fmt(p.next!)} XP`;
      statRemaining.textContent = `${fmt(p.remaining)} XP`;
      statPct.textContent = `${(p.ratio * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
    }
    setXpBar(bar, p.ratio);
    statCores.textContent = String(c.soulCores);
  }

  function animateXp(from: number, to: number, holdLevel?: number): void {
    cancelAnimationFrame(tween);
    if (reduced || from === to) {
      displayedXp = to;
      renderStats(to, holdLevel);
      return;
    }
    const start = performance.now();
    const dur = 900;
    const step = (now: number): void => {
      const k = Math.min(1, (now - start) / dur);
      const e = 1 - Math.pow(1 - k, 3);
      displayedXp = Math.round(from + (to - from) * e);
      // Durante a ascensão, o número do nível só muda quando a alma "ascende"
      renderStats(displayedXp, holdLevel);
      if (k < 1) tween = requestAnimationFrame(step);
    };
    tween = requestAnimationFrame(step);
  }

  /* --- ascensão --- */
  async function ascend(toLevel: number): Promise<void> {
    if (!core) return;
    ascending = true;
    // Fecha o painel para que a ascensão aconteça no centro, sem distrações
    if (!panel.hidden) setPanel(false);
    el.classList.add('is-ascending');
    panel.querySelectorAll<HTMLButtonElement>('[data-xp-action]').forEach((b) => (b.disabled = true));
    await core.ascend(toLevel, () => {
      shownLevel = toLevel;
      renderStats(displayedXp);
      replace(message,
        h('span', { class: 'sea-asc-line' }, 'Sua alma ascendeu'),
        h('span', { class: 'sea-asc-level' }, `Nível ${toLevel}`));
      message.classList.add('is-visible');
      live.textContent = `Sua alma ascendeu. Nível ${toLevel}.`;
    });
    writeSeen(c.id, toLevel);
    el.classList.remove('is-ascending');
    ascending = false;
    panel.querySelectorAll<HTMLButtonElement>('[data-xp-action]').forEach((b) => (b.disabled = false));
    setTimeout(() => {
      message.classList.remove('is-visible');
      setTimeout(() => { if (!ascending) message.replaceChildren(); }, 1300);
    }, reduced ? 4000 : 2600);
  }

  /* --- painel --- */
  function setPanel(open: boolean): void {
    panel.hidden = !open;
    panelToggle.setAttribute('aria-expanded', String(open));
    panelToggle.textContent = open ? 'Fechar painel' : 'Núcleo e experiência';
    el.classList.toggle('panel-open', open);
    if (open) panel.querySelector<HTMLElement>('button, input')?.focus();
  }
  panelToggle.addEventListener('click', () => setPanel(!!panel.hidden));
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !panel.hidden && !document.querySelector('.modal')) { setPanel(false); panelToggle.focus(); }
  });

  function buildPanel(): void {
    const s = store.state;
    const editable = canEditCharacter(s.session, c);
    const grant = canGrantXp(s.session, c, s.settings);
    const history = canSeeHistory(s.session, c);
    const sections: HTMLElement[] = [];

    // Cor do núcleo
    if (editable) {
      const saveColor = h('button', { class: 'btn btn-primary', type: 'button', disabled: true }, 'Salvar cor');
      const resetColor = h('button', { class: 'btn btn-ghost', type: 'button', disabled: true }, 'Desfazer');
      const picker = colorPicker(c.coreColor, (hex) => {
        core?.setColor(hex);
        el.style.setProperty('--core', hex);
        const dirty: boolean = hex !== savedColor;
        saveColor.disabled = !dirty;
        resetColor.disabled = !dirty;
      });
      resetColor.addEventListener('click', () => {
        picker.set(savedColor);
        core?.setColor(savedColor);
        el.style.setProperty('--core', savedColor);
        saveColor.disabled = resetColor.disabled = true;
      });
      saveColor.addEventListener('click', () => withBusy(saveColor, async () => {
        const next = await store.repo.updateCharacter(c.id, { coreColor: picker.value });
        c = next;
        savedColor = next.coreColor;
        store.upsertCharacter(next);
        resetColor.disabled = true;
        toast('Cor do núcleo salva.');
      }).then(() => { saveColor.disabled = c.coreColor === picker.value; }));
      sections.push(h('section', { class: 'panel-section' },
        h('h2', { class: 'panel-title' }, 'Cor do núcleo'),
        h('p', { class: 'panel-help' }, 'A cor tinge a membrana, o brilho interno, as partículas e o contorno do seu card.'),
        picker.el,
        h('div', { class: 'panel-actions' }, resetColor, saveColor)));
    } else {
      sections.push(h('section', { class: 'panel-section' },
        h('h2', { class: 'panel-title' }, 'Cor do núcleo'),
        h('p', { class: 'panel-help' }, 'Só o jogador deste personagem e o mestre podem mudar a cor.'),
        h('p', { class: 'panel-value' }, coreSwatch(c.coreColor, false), c.coreColor)));
    }

    // Experiência
    if (grant) {
      const addId = uid('xp-add');
      const fixId = uid('xp-fix');
      const reasonId = uid('xp-reason');
      const addInput = h('input', { class: 'input', type: 'number', id: addId, min: '1', max: String(MAX_XP), step: '1', inputmode: 'numeric', placeholder: 'Ex.: 450' });
      const fixInput = h('input', { class: 'input', type: 'number', id: fixId, min: '0', max: String(MAX_XP), step: '1', inputmode: 'numeric', value: String(c.xp) });
      const reason = h('input', { class: 'input', id: reasonId, maxlength: '280', placeholder: 'Ex.: Sessão 5 — o farol submerso' });
      const addBtn = h('button', { class: 'btn btn-primary', type: 'submit', 'data-xp-action': true }, 'Adicionar XP');
      const fixBtn = h('button', { class: 'btn btn-ghost', type: 'button', 'data-xp-action': true }, 'Corrigir total');
      const err = h('p', { class: 'form-error', role: 'alert' });
      const form = h('form', { class: 'panel-form', novalidate: true },
        h('label', { class: 'field', for: addId }, h('span', { class: 'field-label' }, 'XP ganho'), addInput),
        h('label', { class: 'field', for: reasonId }, h('span', { class: 'field-label' }, 'Motivo (aparece no histórico)'), reason),
        h('div', { class: 'panel-actions' }, addBtn),
        h('details', { class: 'panel-details' },
          h('summary', null, 'Corrigir o XP total'),
          h('p', { class: 'panel-help' }, 'Define o total exato, para cima ou para baixo. Uma correção para baixo nunca dispara a ascensão.'),
          h('label', { class: 'field', for: fixId }, h('span', { class: 'field-label' }, 'XP total correto'), fixInput),
          h('div', { class: 'panel-actions' }, fixBtn)),
        err);

      const run = async (kind: 'add' | 'correct', btn: HTMLButtonElement): Promise<void> => {
        if (ascending) return;
        const raw = kind === 'add' ? addInput.value : fixInput.value;
        const value = Number(raw);
        if (raw.trim() === '' || !Number.isFinite(value) || !Number.isInteger(value) || value < (kind === 'add' ? 1 : 0)) {
          err.textContent = kind === 'add' ? 'Informe um número inteiro de XP maior que zero.' : 'Informe um total inteiro, zero ou maior.';
          (kind === 'add' ? addInput : fixInput).focus();
          return;
        }
        err.textContent = '';
        await withBusy(btn, async () => {
          const before = c.xp;
          const { character } = await store.repo.applyXp(c.id, { kind, value, reason: reason.value.trim() });
          c = character;
          store.upsertCharacter(character);
          addInput.value = '';
          reason.value = '';
          fixInput.value = String(character.xp);
          const gained = levelsGained(before, character.xp);
          const newLevel = levelForXp(character.xp);
          core?.setProgress(progressFor(character.xp).ratio);
          if (gained > 0) {
            animateXp(before, character.xp, shownLevel);
            void ascend(newLevel);
          } else {
            animateXp(before, character.xp);
            if (newLevel !== shownLevel) {
              shownLevel = newLevel;
              core?.setLevel(newLevel);
              writeSeen(c.id, newLevel);
            }
            toast(kind === 'add' ? `+${fmt(character.xp - before)} XP registrados.` : 'XP total corrigido.');
          }
          live.textContent = `${fmt(character.xp)} XP no total.`;
          if (history) void loadHistory();
        });
      };
      form.addEventListener('submit', (e) => { e.preventDefault(); void run('add', addBtn); });
      fixBtn.addEventListener('click', () => void run('correct', fixBtn));
      sections.push(h('section', { class: 'panel-section' }, h('h2', { class: 'panel-title' }, 'Experiência'), form));
    } else {
      sections.push(h('section', { class: 'panel-section' },
        h('h2', { class: 'panel-title' }, 'Experiência'),
        h('p', { class: 'panel-help' }, s.session
          ? 'Nesta campanha, o XP é concedido pelo mestre.'
          : 'Entre na sua conta para acompanhar a sua progressão.')));
    }

    // Memórias: cada uma é uma estrela orbitando o núcleo
    sections.push(h('section', { class: 'panel-section' },
      h('h2', { class: 'panel-title' }, 'Memórias'),
      memoryList(c.id, editable, (list) => {
        memoryCount = list.length;
        core?.setMemories(memoryCount);
      })));

    // Histórico
    if (history) {
      sections.push(h('section', { class: 'panel-section' },
        h('h2', { class: 'panel-title' }, 'Histórico'),
        historyList));
      void loadHistory();
    }
    replace(panel, h('div', { class: 'panel-inner' }, sections));
  }

  let memoryCount = 0;
  const historyList = h('ol', { class: 'history' });
  async function loadHistory(): Promise<void> {
    try {
      const events = await store.repo.listXpEvents(c.id);
      renderHistory(events);
    } catch (e) {
      reportError(e);
    }
  }
  function renderHistory(events: XpEvent[]): void {
    if (!events.length) {
      replace(historyList, h('li', { class: 'history-empty' }, 'Nenhuma alteração registrada ainda.'));
      return;
    }
    replace(historyList, events.slice(0, 50).map((e) =>
      h('li', { class: 'history-item' },
        h('span', { class: ['history-delta', e.delta < 0 && 'is-neg'] }, e.kind === 'correct' ? `= ${fmt(e.newXp)}` : `${e.delta >= 0 ? '+' : ''}${fmt(e.delta)}`),
        h('span', { class: 'history-reason' }, e.reason || (e.kind === 'correct' ? 'Correção de total' : 'Sem motivo informado')),
        h('span', { class: 'history-meta' }, `${fmtDate(e.createdAt)} · ${e.createdByName || '—'} · total ${fmt(e.newXp)}`))));
  }

  /* --- ciclo de vida --- */
  renderStats(c.xp);
  buildPanel();
  const unsub = store.subscribe((s) => {
    const fresh = s.characters.find((x) => x.id === c.id);
    if (fresh && fresh.soulCores !== c.soulCores) { c = { ...c, soulCores: fresh.soulCores }; renderStats(displayedXp, ascending ? shownLevel : undefined); }
  });

  return {
    el,
    title: `Mar da Alma — ${c.name}`,
    immersive: true,
    mounted() {
      const seen = readSeen(c.id);
      const current = levelForXp(c.xp);
      const pending = seen !== null && seen < current;
      core = new SoulCore(canvas, {
        color: c.coreColor,
        level: pending ? seen! : current,
        progress: prog0.ratio,
        reducedMotion: reduced,
        scale: window.innerWidth < 640 ? 0.25 : 0.17,
      });
      core.setMemories(memoryCount);
      core.start();
      if (pending) {
        shownLevel = seen!;
        renderStats(c.xp, seen!);
      } else writeSeen(c.id, current);
      requestAnimationFrame(() => el.classList.add('is-in'));
      // XP ganho fora daqui (ex.: concedido pelo mestre num encontro) ascende ao entrar
      if (pending) setTimeout(() => void ascend(current), reduced ? 200 : 1800);
    },
    leave() {
      if (reduced) return Promise.resolve();
      el.classList.remove('is-in');
      el.classList.add('is-leaving');
      return new Promise((r) => setTimeout(r, 700));
    },
    destroy() {
      unsub();
      cancelAnimationFrame(tween);
      core?.destroy();
    },
  };
}
