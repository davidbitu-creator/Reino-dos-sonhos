/** Pequeno utilitário para montar DOM de forma declarativa, sem framework. */
export type Child = Node | string | number | null | undefined | false | Child[];

type Handler = (ev: any) => void;
export interface Props {
  [key: string]: unknown;
  class?: string | (string | false | null | undefined)[];
  style?: string | Partial<Record<string, string | number>>;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
const SVG_TAGS = new Set(['svg', 'path', 'circle', 'g', 'line', 'polyline', 'rect', 'defs', 'radialGradient', 'linearGradient', 'stop', 'ellipse', 'title']);

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props?: Props | null, ...children: Child[]): HTMLElementTagNameMap[K];
export function h(tag: string, props?: Props | null, ...children: Child[]): HTMLElement;
export function h(tag: string, props?: Props | null, ...children: Child[]): Element {
  const el = SVG_TAGS.has(tag) ? document.createElementNS(SVG_NS, tag) : document.createElement(tag);
  if (props) applyProps(el, props);
  append(el, children);
  return el;
}

function applyProps(el: Element, props: Props): void {
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'class') {
      const cls = Array.isArray(value) ? value.filter(Boolean).join(' ') : String(value);
      if (cls) el.setAttribute('class', cls);
    } else if (key === 'style') {
      if (typeof value === 'string') el.setAttribute('style', value);
      else for (const [k, v] of Object.entries(value as Record<string, string | number>)) {
        if (v !== undefined && v !== null) (el as HTMLElement).style.setProperty(k.startsWith('--') ? k : k.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase()), String(v));
      }
    } else if (key.startsWith('on') && typeof value === 'function') {
      el.addEventListener(key.slice(2).toLowerCase(), value as Handler);
    } else if (key === 'ref' && typeof value === 'function') {
      (value as (e: Element) => void)(el);
    } else if (key === 'value' && 'value' in el) {
      (el as HTMLInputElement).value = String(value);
    } else if (key === 'checked' && 'checked' in el) {
      (el as HTMLInputElement).checked = !!value;
    } else if (key === 'html') {
      el.innerHTML = String(value);
    } else if (value === true) {
      el.setAttribute(key, '');
    } else {
      el.setAttribute(key, String(value));
    }
  }
}

export function append(parent: Element | DocumentFragment, children: Child[]): void {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    if (Array.isArray(c)) append(parent, c);
    else parent.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

export function clear(el: Element): void {
  while (el.firstChild) el.removeChild(el.firstChild);
}

export function replace(el: Element, ...children: Child[]): void {
  clear(el);
  append(el, children);
}

export function fmt(n: number): string {
  return Math.round(n).toLocaleString('pt-BR');
}

export function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch {
    return iso;
  }
}

let idSeq = 0;
export function uid(prefix = 'rds'): string {
  idSeq += 1;
  return `${prefix}-${idSeq}`;
}

export function prefersReducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

/** Ícones de linha fina (SVG inline). */
export function icon(name: 'close' | 'arrow-left' | 'edit' | 'image' | 'plus' | 'trash' | 'save' | 'eye-off' | 'check' | 'chevron' | 'sea', label?: string): SVGElement {
  const paths: Record<string, string> = {
    close: 'M5 5l14 14M19 5L5 19',
    'arrow-left': 'M19 12H5m6-6l-6 6 6 6',
    edit: 'M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4',
    image: 'M4 5h16v14H4zM4 16l5-5 4 4 3-3 4 4M15 9.5a1.5 1.5 0 1 0 0-.01',
    plus: 'M12 5v14M5 12h14',
    trash: 'M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13',
    save: 'M5 13l4 4L19 7',
    'eye-off': 'M3 3l18 18M10.6 6.1A9 9 0 0 1 21 12a10 10 0 0 1-2.4 3.4M6.4 6.5A10 10 0 0 0 3 12a9 9 0 0 0 12.3 5.4',
    check: 'M5 13l4 4L19 7',
    chevron: 'M7 10l5 5 5-5',
    sea: 'M12 4a8 8 0 1 0 0.01 0M12 9a3 3 0 1 0 0.01 0',
  };
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', 'icon');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.4');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  if (label) {
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', label);
  } else svg.setAttribute('aria-hidden', 'true');
  const p = document.createElementNS(SVG_NS, 'path');
  p.setAttribute('d', paths[name]);
  svg.appendChild(p);
  return svg;
}
