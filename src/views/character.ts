import { fmt, h, icon, prefersReducedMotion, replace } from '../core/dom.js';
import { store } from '../core/store.js';
import type { ViewInstance } from '../core/router.js';
import { SoulCore } from '../anim/soulCore.js';
import { canEditCharacter, canSeeHistory, canViewCharacter } from '../data/permissions.js';
import type { Character, CharacterPrivate } from '../data/types.js';
import { progressFor } from '../rules/xp.js';
import { openCharacterForm } from '../ui/characterForm.js';
import { confirmDialog, reportError, toast, withBusy } from '../ui/feedback.js';
import { openImageManager } from '../ui/imageFramer.js';
import { memoryList } from '../ui/memories.js';
import { portrait } from '../ui/portrait.js';
import { xpBar } from '../ui/xpBar.js';
import { notFoundView } from './notFound.js';

export function characterView(params: Record<string, string>): ViewInstance {
  const initial = store.character(params.id);
  if (!initial || !canViewCharacter(store.state.session, initial)) {
    return notFoundView({ title: 'Personagem não encontrado', text: 'Este personagem não existe ou não está visível para você.', href: '#/personagens', cta: 'Voltar à galeria' });
  }
  let c: Character = initial;
  let core: SoulCore | null = null;
  let coreMemories: { color: string | null; rank: number }[] = [];

  const media = h('div', { class: 'char-hero-media' });
  const info = h('div', { class: 'char-hero-info' });
  const el = h('article', { class: 'page page-character', style: { '--core': c.coreColor } },
    h('a', { class: 'back-link', href: '#/personagens' }, icon('arrow-left'), 'Galeria'),
    h('div', { class: 'char-hero' }, media, info));

  function render(): void {
    el.style.setProperty('--core', c.coreColor);
    const prog = progressFor(c.xp);
    const editable = canEditCharacter(store.state.session, c);
    replace(media, portrait(c, { eager: true }),
      editable ? h('button', { class: 'btn btn-ghost media-edit', type: 'button', onClick: () => openImageManager(c, onUpdate) }, icon('image'), c.imageUrl ? 'Ajustar retrato' : 'Enviar retrato') : null);

    core?.destroy();
    const coreCanvas = h('canvas', { class: 'sea-door-canvas', 'aria-hidden': 'true' });
    replace(info,
      h('div', { class: 'char-title-block' },
        c.isDemo ? h('span', { class: 'tag tag-demo' }, 'Personagem de demonstração') : null,
        h('h1', { class: 'char-name' }, c.name),
        c.epithet ? h('p', { class: 'char-epithet' }, c.epithet) : null),
      h('dl', { class: 'char-facts' },
        fact('Jogador', c.playerName || '—'),
        fact('Classe', c.dndClass || '—'),
        fact('Nível', String(prog.level)),
        fact('Rank', c.campaignRank || '—'),
        fact('Núcleos da Alma', String(c.soulCores)),
        canSeeHistory(store.state.session, c) ? sheetCell : null),
      h('div', { class: 'char-progress' },
        h('p', { class: 'char-progress-line' },
          prog.isMax ? `${fmt(prog.xp)} XP — nível máximo` : `${fmt(prog.xp)} / ${fmt(prog.next!)} XP`),
        xpBar(prog.ratio, `Progresso até o nível ${prog.level + 1}`)),
      c.bio ? h('div', { class: 'char-bio' }, c.bio.split(/\n{2,}/).map((p) => h('p', null, p))) : null,
      h('section', { class: 'char-memories', 'aria-labelledby': 'char-mem-t' },
        h('h2', { class: 'char-section-title', id: 'char-mem-t' }, 'Memórias'),
        memoryList(c.id, editable, (list) => { coreMemories = list.map((m) => ({ color: m.color, rank: m.rank })); core?.setMemories(coreMemories); })),
      h('a', { class: 'sea-door', href: `#/mar-da-alma/${encodeURIComponent(c.id)}` },
        h('span', { class: 'sea-door-core' }, coreCanvas),
        h('span', { class: 'sea-door-text' },
          h('span', { class: 'sea-door-title' }, 'Entrar no Mar da Alma'),
          h('span', { class: 'sea-door-sub' }, `Núcleo ${c.coreColor} · intensidade de nível ${prog.level}`))),
      canSeeHistory(store.state.session, c) ? loreSection : null,
      editable ? h('div', { class: 'char-actions' },
        h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => openCharacterForm(c, onUpdate) }, icon('edit'), 'Editar informações'),
        h('button', { class: 'btn btn-ghost btn-quiet', type: 'button', onClick: remove }, icon('trash'), 'Excluir personagem')) : null);

    requestAnimationFrame(() => {
      if (!coreCanvas.isConnected) return;
      core = new SoulCore(coreCanvas, { color: c.coreColor, level: prog.level, progress: prog.ratio, compact: true, scale: 0.3, reducedMotion: prefersReducedMotion() });
      core.setMemories(coreMemories);
      core.start();
    });
  }

  /* ---------- Dados privados: ficha e história (só dono e mestre) ---------- */
  let priv: CharacterPrivate | null = null;
  let loreEditing = false;
  const sheetCell = h('div', { class: 'char-fact char-sheet' });
  const loreSection = h('section', { class: 'char-lore', 'aria-labelledby': 'char-lore-t' });

  function fmtSize(n: number | null): string {
    if (!n) return '';
    return n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
  }

  function renderSheet(): void {
    const fileId = `sheet-file-${c.id}`;
    const input = h('input', { type: 'file', id: fileId, class: 'sr-only' });
    input.addEventListener('change', async () => {
      const f = input.files?.[0];
      input.value = '';
      if (!f) return;
      sheetCell.classList.add('is-busy');
      try {
        priv = await store.repo.uploadSheet(c, f);
        toast('Ficha anexada.');
      } catch (e) { reportError(e); }
      sheetCell.classList.remove('is-busy');
      renderSheet();
    });
    const attach = h('label', { class: 'btn-text', for: fileId, tabindex: '0', role: 'button' }, icon('plus'), priv?.sheetPath ? 'Trocar' : 'Anexar ficha');
    attach.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } });
    if (!priv) {
      replace(sheetCell, h('dt', null, 'Ficha'), h('dd', { class: 'muted' }, 'Carregando…'));
      return;
    }
    if (!priv.sheetPath) {
      replace(sheetCell, h('dt', null, 'Ficha'), h('dd', { class: 'char-sheet-actions' }, attach, input));
      return;
    }
    const download = h('button', { class: 'char-sheet-download', type: 'button', title: `Baixar ${priv.sheetName ?? 'ficha'}` },
      icon('download'), h('span', { class: 'char-sheet-name' }, priv.sheetName ?? 'Ficha'));
    download.addEventListener('click', () => void withBusy(download, async () => {
      const url = await store.repo.sheetDownloadUrl(c.id);
      const a = h('a', { href: url, download: priv?.sheetName ?? 'ficha', rel: 'noopener' });
      document.body.appendChild(a);
      a.click();
      a.remove();
    }));
    const removeBtn = h('button', { class: 'btn-text', type: 'button' }, 'Remover');
    removeBtn.addEventListener('click', async () => {
      if (!(await confirmDialog('Remover ficha', `“${priv?.sheetName}” será apagada.`, 'Remover', true))) return;
      await withBusy(removeBtn, async () => {
        priv = await store.repo.removeSheet(c.id);
        toast('Ficha removida.');
        renderSheet();
      });
    });
    replace(sheetCell, h('dt', null, 'Ficha'),
      h('dd', null, download,
        h('span', { class: 'char-sheet-meta' }, fmtSize(priv.sheetSize)),
        h('span', { class: 'char-sheet-actions' }, attach, input, removeBtn)));
  }

  function renderLore(): void {
    const head = h('div', { class: 'char-lore-head' },
      h('h2', { class: 'char-section-title', id: 'char-lore-t' }, 'História'),
      h('span', { class: 'char-lore-private' }, 'Visível só para o dono e o mestre'));
    if (!priv) {
      replace(loreSection, head, h('p', { class: 'muted' }, 'Carregando…'));
      return;
    }
    if (loreEditing) {
      const ta = h('textarea', { class: 'input textarea char-lore-input', rows: '14', maxlength: '20000', id: `lore-${c.id}`, 'aria-label': 'História do personagem', placeholder: 'De onde ele veio, o que perdeu, o que o Pesadelo mostrou…' }, priv.lore);
      const save = h('button', { class: 'btn btn-primary', type: 'button' }, 'Salvar história');
      const cancel = h('button', { class: 'btn btn-ghost', type: 'button' }, 'Cancelar');
      cancel.addEventListener('click', () => { loreEditing = false; renderLore(); });
      save.addEventListener('click', () => void withBusy(save, async () => {
        priv = await store.repo.saveLore(c.id, ta.value);
        loreEditing = false;
        toast('História salva.');
        renderLore();
      }));
      replace(loreSection, head, ta, h('div', { class: 'modal-actions' }, cancel, save));
      ta.focus();
      return;
    }
    const edit = h('button', { class: 'btn-text', type: 'button' }, icon('edit'), priv.lore ? 'Editar história' : 'Escrever história');
    edit.addEventListener('click', () => { loreEditing = true; renderLore(); });
    replace(loreSection, head,
      priv.lore
        ? h('div', { class: 'char-lore-text' }, priv.lore.split(/\n{2,}/).map((p) => h('p', null, p)))
        : h('p', { class: 'muted' }, 'Ainda não há história escrita.'),
      edit);
  }

  async function loadPrivate(): Promise<void> {
    if (!canSeeHistory(store.state.session, c)) return;
    renderSheet();
    renderLore();
    try {
      priv = await store.repo.getPrivate(c.id);
    } catch (e) {
      reportError(e);
      priv = { characterId: c.id, lore: '', sheetPath: null, sheetName: null, sheetSize: null, updatedAt: null };
    }
    renderSheet();
    renderLore();
  }

  function fact(label: string, value: string): HTMLElement {
    return h('div', { class: 'char-fact' }, h('dt', null, label), h('dd', null, value));
  }

  function onUpdate(next: Character): void {
    c = next;
    store.upsertCharacter(next);
    render();
  }

  async function remove(ev: Event): Promise<void> {
    const ok = await confirmDialog('Excluir personagem', `${c.name}, seu retrato e todo o histórico de XP serão apagados permanentemente.`, 'Excluir', true);
    if (!ok) return;
    await withBusy(ev.currentTarget as HTMLButtonElement, async () => {
      await store.repo.deleteCharacter(c.id);
      store.removeCharacter(c.id);
      toast('Personagem excluído.');
      window.location.hash = '#/personagens';
    });
  }

  render();
  void loadPrivate();
  const unsub = store.subscribe((s) => {
    const fresh = s.characters.find((x) => x.id === c.id);
    if (fresh && fresh !== c && !document.querySelector('.modal')) { c = fresh; render(); }
  });

  return { el, title: c.name, destroy() { unsub(); core?.destroy(); } };
}
