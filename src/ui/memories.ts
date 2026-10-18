/** Memórias do personagem: lista, criação, edição e exclusão. */
import { h, icon, replace, uid } from '../core/dom.js';
import { store } from '../core/store.js';
import type { Memory, MemoryInput } from '../data/types.js';
import { RANKS } from '../rules/nightmare.js';
import { confirmDialog, openModal, reportError, toast, withBusy } from './feedback.js';

export const MEMORY_KINDS = ['Arma', 'Armadura', 'Ferramenta', 'Adorno', 'Outro'];

export function memoryRankLabel(m: Pick<Memory, 'rank' | 'tier'>): string {
  const rank = m.rank > 0 ? RANKS.find((r) => r.id === m.rank)?.pt ?? '' : '';
  const tier = m.tier > 0 ? `Tier ${m.tier}` : '';
  return [rank, tier].filter(Boolean).join(', ');
}

/** Abre o formulário de Memória. `onSaved` recebe a lista atualizada. */
export function openMemoryForm(characterId: string, existing: Memory | null, onSaved: () => void): void {
  const f = (label: string, control: HTMLElement, help?: string): HTMLElement =>
    h('label', { class: 'field', for: control.id }, h('span', { class: 'field-label' }, label), control,
      help ? h('span', { class: 'field-help' }, help) : null);

  const name = h('input', { class: 'input', id: uid('mn'), maxlength: '80', value: existing?.name ?? '', required: true, 'data-autofocus': true, placeholder: 'Ex.: Lâmina do Silêncio Branco' });
  const kind = h('select', { class: 'input', id: uid('mk') },
    MEMORY_KINDS.map((k) => h('option', { value: k, selected: (existing?.kind ?? 'Arma') === k }, k)));
  const rank = h('select', { class: 'input', id: uid('mr') },
    h('option', { value: '0', selected: !existing?.rank }, 'Desconhecido'),
    RANKS.map((r) => h('option', { value: String(r.id), selected: existing?.rank === r.id }, r.pt)));
  const tier = h('select', { class: 'input', id: uid('mt') },
    h('option', { value: '0', selected: !existing?.tier }, '—'),
    [1, 2, 3].map((t) => h('option', { value: String(t), selected: existing?.tier === t }, `Tier ${t}`)));
  const desc = h('textarea', { class: 'input textarea', id: uid('md'), rows: '4', maxlength: '2000', placeholder: 'Aparência, origem, como foi obtida…' }, existing?.description ?? '');
  const ench = h('textarea', { class: 'input textarea', id: uid('me'), rows: '3', maxlength: '1000', placeholder: 'Ex.: [Quietude] Passos não fazem som.' }, existing?.enchantments ?? '');
  const err = h('p', { class: 'form-error', role: 'alert' });
  const save = h('button', { class: 'btn btn-primary', type: 'submit' }, existing ? 'Salvar Memória' : 'Adicionar Memória');
  const cancel = h('button', { class: 'btn btn-ghost', type: 'button' }, 'Cancelar');

  const form = h('form', { class: 'form', novalidate: true },
    f('Nome', name),
    h('div', { class: 'form-grid form-grid-3' }, f('Tipo', kind), f('Rank', rank), f('Tier', tier)),
    f('Descrição', desc),
    f('Encantamentos', ench, 'Opcional. Um por linha.'),
    err,
    h('div', { class: 'modal-actions' }, cancel, save));

  const modal = openModal({ title: existing ? 'Editar Memória' : 'Nova Memória', content: form, wide: true });
  cancel.addEventListener('click', () => modal.close());
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!name.value.trim()) {
      err.textContent = 'Dê um nome à Memória.';
      name.focus();
      return;
    }
    const input: MemoryInput = {
      id: existing?.id, characterId, name: name.value.trim(), kind: kind.value,
      rank: Number(rank.value), tier: Number(tier.value),
      description: desc.value.trim(), enchantments: ench.value.trim(),
    };
    void withBusy(save, async () => {
      await store.repo.saveMemory(input);
      toast(existing ? 'Memória salva.' : 'Memória adicionada. Uma nova estrela orbita o núcleo.');
      modal.close();
      onSaved();
    });
  });
}

/**
 * Lista de Memórias. `onChange(lista)` é chamado sempre que a lista é carregada ou alterada
 * (o Mar da Alma usa isso para atualizar as estrelas).
 */
export function memoryList(characterId: string, editable: boolean, onChange?: (list: Memory[]) => void): HTMLElement {
  const listEl = h('ul', { class: 'memories' });
  const addBtn = editable
    ? h('button', { class: 'btn-text', type: 'button', onClick: () => openMemoryForm(characterId, null, load) }, icon('plus'), 'Adicionar Memória')
    : null;
  const root = h('div', { class: 'memories-wrap' }, listEl, addBtn);

  function item(m: Memory): HTMLElement {
    const meta = [m.kind, memoryRankLabel(m)].filter(Boolean).join(' · ');
    const body = h('div', { class: 'memory-body', hidden: true },
      m.description ? h('p', { class: 'memory-desc' }, m.description) : null,
      m.enchantments ? h('p', { class: 'memory-ench' }, m.enchantments) : null,
      !m.description && !m.enchantments ? h('p', { class: 'muted' }, 'Sem descrição.') : null,
      editable ? h('div', { class: 'memory-actions' },
        h('button', { class: 'btn-text', type: 'button', onClick: () => openMemoryForm(characterId, m, load) }, icon('edit'), 'Editar'),
        h('button', { class: 'btn-text', type: 'button', onClick: async (ev: Event) => {
          if (!(await confirmDialog('Excluir Memória', `“${m.name}” será removida e sua estrela deixará de orbitar o núcleo.`, 'Excluir', true))) return;
          await withBusy(ev.currentTarget as HTMLButtonElement, async () => {
            await store.repo.deleteMemory(m.id);
            toast('Memória excluída.');
            await load();
          });
        } }, icon('trash'), 'Excluir')) : null);
    const head = h('button', { class: 'memory-head', type: 'button', 'aria-expanded': 'false' },
      h('span', { class: 'memory-star', 'aria-hidden': 'true' }),
      h('span', { class: 'memory-title' }, h('span', { class: 'memory-name' }, m.name), meta ? h('span', { class: 'memory-meta' }, meta) : null),
      icon('chevron'));
    head.addEventListener('click', () => {
      const open = body.hidden;
      body.hidden = !open;
      head.setAttribute('aria-expanded', String(open));
    });
    return h('li', { class: 'memory' }, head, body);
  }

  async function load(): Promise<void> {
    try {
      const list = await store.repo.listMemories(characterId);
      replace(listEl, list.length
        ? list.map(item)
        : h('li', { class: 'memory-empty' }, editable ? 'Nenhuma Memória ainda. Cada Memória adicionada vira uma estrela orbitando o núcleo.' : 'Nenhuma Memória registrada.'));
      onChange?.(list);
    } catch (e) {
      reportError(e);
    }
  }

  void load();
  return root;
}
