/** Gerenciador de retrato: enviar, trocar, remover e ajustar enquadramento (foco + zoom). */
import { h, icon } from '../core/dom.js';
import { store } from '../core/store.js';
import type { Character } from '../data/types.js';
import { prepareImage } from '../data/images.js';
import { confirmDialog, openModal, toast, withBusy } from './feedback.js';
import { applyFraming, initials } from './portrait.js';

export function openImageManager(character: Character, onChange: (c: Character) => void): void {
  let c = character;
  let fx = c.focusX;
  let fy = c.focusY;
  let zoom = c.zoom;

  const frame = h('div', { class: 'framer-frame', tabindex: '0', role: 'group',
    'aria-label': 'Área de enquadramento. Arraste a imagem ou use as setas do teclado para ajustar.' });
  const zoomInput = h('input', { type: 'range', min: '1', max: '3', step: '0.01', value: String(zoom), class: 'range', id: 'framer-zoom' });
  const fileInput = h('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp', class: 'sr-only', id: 'framer-file' });
  const uploadLabel = h('label', { class: 'btn btn-ghost', for: 'framer-file', tabindex: '0', role: 'button' }, icon('image'), h('span', null));
  const removeBtn = h('button', { type: 'button', class: 'btn btn-ghost btn-quiet' }, icon('trash'), 'Remover imagem');
  const saveBtn = h('button', { type: 'button', class: 'btn btn-primary' }, 'Salvar enquadramento');
  const status = h('p', { class: 'framer-status', 'aria-live': 'polite' });
  const controls = h('div', { class: 'framer-controls' },
    h('label', { class: 'field', for: 'framer-zoom' }, h('span', { class: 'field-label' }, 'Aproximação'), zoomInput),
    h('p', { class: 'field-help' }, 'Arraste a imagem para escolher o ponto de foco. Setas do teclado movem 2%; com Shift, 10%.'));

  function render(): void {
    frame.replaceChildren();
    (uploadLabel.lastChild as HTMLElement).textContent = c.imageUrl ? 'Trocar imagem' : 'Enviar imagem';
    removeBtn.hidden = !c.imageUrl;
    controls.hidden = !c.imageUrl;
    saveBtn.hidden = !c.imageUrl;
    if (c.imageUrl) {
      const img = h('img', { class: 'portrait-img', src: c.imageUrl, alt: `Retrato de ${c.name}`, draggable: 'false' });
      applyFraming(img, fx, fy, zoom);
      frame.append(img, h('span', { class: 'framer-grid', 'aria-hidden': 'true' }));
    } else {
      frame.append(h('div', { class: 'portrait portrait-empty', style: { '--core': c.coreColor } },
        h('span', { class: 'portrait-monogram' }, initials(c.name))),
      h('p', { class: 'framer-empty' }, 'Nenhuma imagem ainda. Envie uma ilustração ou fotografia (JPG, PNG ou WebP).'));
    }
  }

  function update(): void {
    const img = frame.querySelector('img');
    if (img) applyFraming(img, fx, fy, zoom);
  }

  // Arrastar para reposicionar o foco
  let drag: { x: number; y: number; fx: number; fy: number } | null = null;
  frame.addEventListener('pointerdown', (e) => {
    if (!c.imageUrl) return;
    drag = { x: e.clientX, y: e.clientY, fx, fy };
    frame.setPointerCapture(e.pointerId);
    frame.classList.add('is-dragging');
  });
  frame.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const r = frame.getBoundingClientRect();
    const k = 100 / zoom;
    fx = Math.max(0, Math.min(100, drag.fx - ((e.clientX - drag.x) / r.width) * k * 1.4));
    fy = Math.max(0, Math.min(100, drag.fy - ((e.clientY - drag.y) / r.height) * k * 1.4));
    update();
  });
  const end = (): void => { drag = null; frame.classList.remove('is-dragging'); };
  frame.addEventListener('pointerup', end);
  frame.addEventListener('pointercancel', end);
  frame.addEventListener('keydown', (e) => {
    if (!c.imageUrl) return;
    const step = e.shiftKey ? 10 : 2;
    const map: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    const d = map[e.key];
    if (!d) return;
    e.preventDefault();
    fx = Math.max(0, Math.min(100, fx + d[0]));
    fy = Math.max(0, Math.min(100, fy + d[1]));
    update();
  });
  zoomInput.addEventListener('input', () => { zoom = Number(zoomInput.value); update(); });

  uploadLabel.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); }
  });

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    fileInput.value = '';
    if (!file) return;
    status.textContent = 'Preparando e enviando a imagem…';
    frame.classList.add('is-loading');
    await withBusy(saveBtn, async () => {
      const blob = await prepareImage(file, store.repo.mode === 'demo' ? 900 : 1600, store.repo.mode === 'demo' ? 0.8 : 0.86);
      let next = await store.repo.uploadImage(c, blob);
      next = await store.repo.updateCharacter(c.id, { focusX: 50, focusY: 30, zoom: 1 });
      c = next;
      fx = 50; fy = 30; zoom = 1;
      zoomInput.value = '1';
      onChange(c);
      render();
      toast('Imagem enviada. Ajuste o enquadramento se quiser.');
    });
    frame.classList.remove('is-loading');
    status.textContent = '';
  });

  removeBtn.addEventListener('click', async () => {
    const ok = await confirmDialog('Remover imagem', `A imagem de ${c.name} será apagada. O card passará a exibir o monograma.`, 'Remover', true);
    if (!ok) return;
    await withBusy(removeBtn, async () => {
      c = await store.repo.removeImage(c);
      onChange(c);
      render();
      toast('Imagem removida.');
    });
  });

  saveBtn.addEventListener('click', () =>
    withBusy(saveBtn, async () => {
      c = await store.repo.updateCharacter(c.id, { focusX: Math.round(fx * 10) / 10, focusY: Math.round(fy * 10) / 10, zoom: Math.round(zoom * 100) / 100 });
      onChange(c);
      toast('Enquadramento salvo.');
      modal.close();
    }));

  const modal = openModal({
    title: 'Retrato',
    wide: true,
    content: h('div', { class: 'framer' },
      h('div', { class: 'framer-preview' }, frame, status),
      h('div', { class: 'framer-side' },
        h('p', { class: 'modal-text' }, 'A imagem é exibida no formato 3:4 em toda a galeria, sem distorção. O ponto de foco define o que fica visível.'),
        h('div', { class: 'framer-actions' }, uploadLabel, fileInput, removeBtn),
        controls,
        h('div', { class: 'modal-actions' }, saveBtn))),
  });
  render();
}
