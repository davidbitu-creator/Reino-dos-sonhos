/** Formulário de criação/edição de personagem (campos permitidos conforme o papel). */
import { h, uid } from '../core/dom.js';
import { store } from '../core/store.js';
import { isMaster } from '../data/permissions.js';
import type { Character, CharacterPatch, NewCharacter } from '../data/types.js';
import { colorPicker } from './colorPicker.js';
import { openModal, toast, withBusy } from './feedback.js';

export const DND_CLASSES = ['Bárbaro', 'Bardo', 'Bruxo', 'Clérigo', 'Druida', 'Feiticeiro', 'Guerreiro', 'Ladino', 'Mago', 'Monge', 'Paladino', 'Patrulheiro'];

function textField(label: string, name: string, value: string, opts: { required?: boolean; max?: number; list?: string; help?: string } = {}): HTMLElement {
  const id = uid('f');
  return h('label', { class: 'field', for: id },
    h('span', { class: 'field-label' }, label, opts.required ? h('span', { class: 'req', 'aria-hidden': 'true' }, ' *') : null),
    h('input', { class: 'input', id, name, value, required: opts.required, maxlength: String(opts.max ?? 80), list: opts.list, autocomplete: 'off' }),
    opts.help ? h('span', { class: 'field-help' }, opts.help) : null);
}

export function openCharacterForm(existing: Character | null, onSaved: (c: Character) => void): void {
  const session = store.state.session;
  const master = isMaster(session);
  const listId = uid('classes');
  const picker = colorPicker(existing?.coreColor ?? '#8FD3FF', () => {});

  const bioId = uid('bio');
  const publicId = uid('pub');
  const coresId = uid('cores');
  const ownerId = uid('owner');

  const ownerField = master
    ? h('label', { class: 'field', for: ownerId },
      h('span', { class: 'field-label' }, 'Dono (conta do jogador)'),
      h('select', { class: 'input', id: ownerId, name: 'ownerId' }, h('option', { value: '' }, 'Carregando…')))
    : null;

  const form = h('form', { class: 'form', novalidate: true },
    h('div', { class: 'form-grid' },
      textField('Nome do personagem', 'name', existing?.name ?? '', { required: true }),
      textField('Nome do jogador', 'playerName', existing?.playerName ?? session?.profile.displayName ?? ''),
      textField('Epíteto', 'epithet', existing?.epithet ?? '', { max: 80, help: 'Uma linha curta que aparece sob o nome.' }),
      textField('Classe de D&D', 'dndClass', existing?.dndClass ?? '', { list: listId, max: 40 }),
      textField('Rank na campanha', 'campaignRank', existing?.campaignRank ?? 'Adormecido', { max: 40 }),
      master ? h('label', { class: 'field', for: coresId },
        h('span', { class: 'field-label' }, 'Núcleos da Alma'),
        h('input', { class: 'input', type: 'number', id: coresId, name: 'soulCores', min: '0', max: '7', step: '1', value: String(existing?.soulCores ?? 1) }),
        h('span', { class: 'field-help' }, 'Mecânica separada do nível; só o mestre altera.')) : null,
      ownerField),
    h('datalist', { id: listId }, DND_CLASSES.map((c) => h('option', { value: c }))),
    h('label', { class: 'field', for: bioId },
      h('span', { class: 'field-label' }, 'Sobre o personagem'),
      h('textarea', { class: 'input textarea', id: bioId, name: 'bio', rows: '5', maxlength: '2000' }, existing?.bio ?? '')),
    h('fieldset', { class: 'fieldset' }, h('legend', { class: 'field-label' }, 'Cor do Núcleo da Alma'), picker.el),
    h('label', { class: 'check', for: publicId },
      h('input', { type: 'checkbox', id: publicId, name: 'isPublic', checked: existing?.isPublic ?? true }),
      h('span', null, 'Visível na galeria para todos')),
    h('p', { class: 'form-error', role: 'alert' }),
    h('div', { class: 'modal-actions' },
      h('button', { type: 'button', class: 'btn btn-ghost', 'data-cancel': true }, 'Cancelar'),
      h('button', { type: 'submit', class: 'btn btn-primary' }, existing ? 'Salvar alterações' : 'Criar personagem')));

  const modal = openModal({ title: existing ? `Editar ${existing.name}` : 'Novo personagem', content: form, wide: true });
  form.querySelector('[data-cancel]')!.addEventListener('click', () => modal.close());

  if (master && ownerField) {
    const sel = ownerField.querySelector('select')!;
    store.repo.listProfiles().then((profiles) => {
      sel.replaceChildren(...profiles.map((p) =>
        h('option', { value: p.id, selected: (existing?.ownerId ?? session?.profile.id) === p.id }, `${p.displayName}${p.role === 'master' ? ' (mestre)' : ''}`)));
    }).catch(() => sel.replaceChildren(h('option', { value: existing?.ownerId ?? session?.profile.id ?? '' }, 'Atual')));
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const err = form.querySelector('.form-error')!;
    const name = String(fd.get('name') ?? '').trim();
    if (!name) {
      err.textContent = 'Dê um nome ao personagem.';
      (form.querySelector('[name="name"]') as HTMLInputElement).focus();
      return;
    }
    err.textContent = '';
    const base = {
      name,
      playerName: String(fd.get('playerName') ?? '').trim(),
      epithet: String(fd.get('epithet') ?? '').trim(),
      dndClass: String(fd.get('dndClass') ?? '').trim(),
      campaignRank: String(fd.get('campaignRank') ?? '').trim(),
      bio: String(fd.get('bio') ?? '').trim(),
      coreColor: picker.value,
      isPublic: (form.querySelector(`#${publicId}`) as HTMLInputElement).checked,
    };
    const btn = form.querySelector<HTMLButtonElement>('button[type="submit"]');
    void withBusy(btn, async () => {
      let saved: Character;
      if (existing) {
        const patch: CharacterPatch = { ...base };
        if (master) {
          patch.soulCores = Math.max(0, Math.min(7, Number(fd.get('soulCores') ?? existing.soulCores) | 0));
          const owner = String(fd.get('ownerId') ?? '');
          if (owner && owner !== existing.ownerId) patch.ownerId = owner;
        }
        saved = await store.repo.updateCharacter(existing.id, patch);
        toast('Personagem salvo.');
      } else {
        const input: NewCharacter = { ...base, focusX: 50, focusY: 30, zoom: 1 };
        if (master) {
          input.soulCores = Math.max(0, Math.min(7, Number(fd.get('soulCores') ?? 1) | 0));
          const owner = String(fd.get('ownerId') ?? '');
          if (owner) input.ownerId = owner;
        }
        saved = await store.repo.createCharacter(input);
        toast('Personagem criado.');
      }
      store.upsertCharacter(saved);
      modal.close();
      onSaved(saved);
    });
  });
}
