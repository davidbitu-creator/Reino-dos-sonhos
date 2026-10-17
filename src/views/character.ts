import { fmt, h, icon, prefersReducedMotion, replace } from '../core/dom.js';
import { store } from '../core/store.js';
import type { ViewInstance } from '../core/router.js';
import { SoulCore } from '../anim/soulCore.js';
import { canEditCharacter, canViewCharacter } from '../data/permissions.js';
import type { Character } from '../data/types.js';
import { progressFor } from '../rules/xp.js';
import { openCharacterForm } from '../ui/characterForm.js';
import { confirmDialog, toast, withBusy } from '../ui/feedback.js';
import { openImageManager } from '../ui/imageFramer.js';
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
        fact('Núcleos da Alma', String(c.soulCores))),
      h('div', { class: 'char-progress' },
        h('p', { class: 'char-progress-line' },
          prog.isMax ? `${fmt(prog.xp)} XP — nível máximo` : `${fmt(prog.xp)} / ${fmt(prog.next!)} XP`),
        xpBar(prog.ratio, `Progresso até o nível ${prog.level + 1}`)),
      c.bio ? h('div', { class: 'char-bio' }, c.bio.split(/\n{2,}/).map((p) => h('p', null, p))) : null,
      h('a', { class: 'sea-door', href: `#/mar-da-alma/${encodeURIComponent(c.id)}` },
        h('span', { class: 'sea-door-core' }, coreCanvas),
        h('span', { class: 'sea-door-text' },
          h('span', { class: 'sea-door-title' }, 'Entrar no Mar da Alma'),
          h('span', { class: 'sea-door-sub' }, `Núcleo ${c.coreColor} · intensidade de nível ${prog.level}`))),
      editable ? h('div', { class: 'char-actions' },
        h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => openCharacterForm(c, onUpdate) }, icon('edit'), 'Editar informações'),
        h('button', { class: 'btn btn-ghost btn-quiet', type: 'button', onClick: remove }, icon('trash'), 'Excluir personagem')) : null);

    requestAnimationFrame(() => {
      if (!coreCanvas.isConnected) return;
      core = new SoulCore(coreCanvas, { color: c.coreColor, level: prog.level, progress: prog.ratio, compact: true, scale: 0.3, reducedMotion: prefersReducedMotion() });
      core.start();
    });
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
  const unsub = store.subscribe((s) => {
    const fresh = s.characters.find((x) => x.id === c.id);
    if (fresh && fresh !== c && !document.querySelector('.modal')) { c = fresh; render(); }
  });

  return { el, title: c.name, destroy() { unsub(); core?.destroy(); } };
}
