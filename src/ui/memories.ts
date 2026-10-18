/** Memórias do personagem: lista, criação, edição e exclusão. */
import { h, icon, replace, uid } from '../core/dom.js';
import { store } from '../core/store.js';
import type { Memory, MemoryInput } from '../data/types.js';
import { RANKS } from '../rules/nightmare.js';
import { prepareImage } from '../data/images.js';
import { colorPicker } from './colorPicker.js';
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
  // Cor do mini-núcleo
  const coreColor = store.character(characterId)?.coreColor ?? '#8FD3FF';
  let useCustom = !!existing?.color;
  const picker = colorPicker(existing?.color ?? coreColor, () => { useCustom = true; sameColor.checked = false; });
  const sameId = uid('ms');
  const sameColor = h('input', { type: 'checkbox', id: sameId, checked: !useCustom });
  sameColor.addEventListener('change', () => { useCustom = !sameColor.checked; if (!useCustom) picker.set(coreColor); });

  // Imagem
  let pendingImage: File | null = null;
  let removeImage = false;
  const fileId = uid('mf');
  const fileInput = h('input', { type: 'file', id: fileId, accept: 'image/jpeg,image/png,image/webp', class: 'sr-only' });
  const preview = h('div', { class: 'memory-img-preview' });
  const pickLabel = h('label', { class: 'btn btn-ghost', for: fileId, tabindex: '0', role: 'button' });
  const clearBtn = h('button', { class: 'btn btn-ghost btn-quiet', type: 'button' }, 'Remover imagem');
  function renderImage(): void {
    let src: string | null = null;
    if (pendingImage) src = URL.createObjectURL(pendingImage);
    else if (!removeImage && existing?.imageUrl) src = existing.imageUrl;
    preview.replaceChildren(...(src ? [h('img', { src, alt: 'Imagem da Memória' })] : [h('span', { class: 'muted' }, 'Sem imagem')]));
    pickLabel.textContent = src ? 'Trocar imagem' : 'Escolher imagem';
    clearBtn.hidden = !src;
  }
  fileInput.addEventListener('change', () => {
    const f = fileInput.files?.[0];
    if (f) { pendingImage = f; removeImage = false; renderImage(); }
  });
  pickLabel.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); } });
  clearBtn.addEventListener('click', () => { pendingImage = null; removeImage = true; fileInput.value = ''; renderImage(); });
  renderImage();

  const err = h('p', { class: 'form-error', role: 'alert' });
  const save = h('button', { class: 'btn btn-primary', type: 'submit' }, existing ? 'Salvar Memória' : 'Adicionar Memória');
  const cancel = h('button', { class: 'btn btn-ghost', type: 'button' }, 'Cancelar');

  const form = h('form', { class: 'form', novalidate: true },
    f('Nome', name),
    h('div', { class: 'form-grid form-grid-3' }, f('Tipo', kind), f('Rank', rank), f('Tier', tier)),
    f('Descrição', desc),
    f('Encantamentos', ench, 'Opcional. Um por linha.'),
    h('fieldset', { class: 'fieldset' }, h('legend', { class: 'field-label' }, 'Imagem'),
      h('div', { class: 'memory-img-field' }, preview,
        h('div', { class: 'memory-img-actions' }, pickLabel, fileInput, clearBtn,
          h('span', { class: 'field-help' }, 'JPG, PNG ou WebP. Aparece na descrição da Memória.')))),
    h('fieldset', { class: 'fieldset' }, h('legend', { class: 'field-label' }, 'Cor do mini-núcleo'),
      h('label', { class: 'check', for: sameId }, sameColor, h('span', null, 'Usar a cor do Núcleo da Alma')),
      picker.el),
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
      color: useCustom ? picker.value : null,
    };
    void withBusy(save, async () => {
      const saved = await store.repo.saveMemory(input);
      if (pendingImage) {
        const blob = await prepareImage(pendingImage, store.repo.mode === 'demo' ? 900 : 1400, store.repo.mode === 'demo' ? 0.8 : 0.86);
        await store.repo.setMemoryImage(saved, blob);
      } else if (removeImage && existing?.imagePath) {
        await store.repo.setMemoryImage(saved, null);
      }
      toast(existing ? 'Memória salva.' : 'Memória adicionada. Um novo mini-núcleo orbita a sua alma.');
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
      m.imageUrl ? h('img', { class: 'memory-img', src: m.imageUrl, alt: `Imagem de ${m.name}`, loading: 'lazy' }) : null,
      m.description ? h('p', { class: 'memory-desc' }, m.description) : null,
      m.enchantments ? h('p', { class: 'memory-ench' }, m.enchantments) : null,
      !m.description && !m.enchantments && !m.imageUrl ? h('p', { class: 'muted' }, 'Sem descrição.') : null,
      editable ? h('div', { class: 'memory-actions' },
        h('button', { class: 'btn-text', type: 'button', onClick: () => openMemoryForm(characterId, m, load) }, icon('edit'), 'Editar'),
        h('button', { class: 'btn-text', type: 'button', onClick: async (ev: Event) => {
          if (!(await confirmDialog('Excluir Memória', `“${m.name}” será removida e seu mini-núcleo deixará de orbitar a alma.`, 'Excluir', true))) return;
          await withBusy(ev.currentTarget as HTMLButtonElement, async () => {
            await store.repo.deleteMemory(m.id);
            toast('Memória excluída.');
            await load();
          });
        } }, icon('trash'), 'Excluir')) : null);
    const head = h('button', { class: 'memory-head', type: 'button', 'aria-expanded': 'false' },
      h('span', { class: 'memory-star', 'aria-hidden': 'true', style: { '--mem': m.color ?? store.character(characterId)?.coreColor ?? '#F5F5F5' } }),
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
        : h('li', { class: 'memory-empty' }, editable ? 'Nenhuma Memória ainda. Cada Memória adicionada vira um pequeno núcleo orbitando o seu.' : 'Nenhuma Memória registrada.'));
      onChange?.(list);
    } catch (e) {
      reportError(e);
    }
  }

  void load();
  return root;
}
