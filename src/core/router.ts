/** Roteador por hash (compatível com GitHub Pages e qualquer hospedagem estática). */
import { prefersReducedMotion } from './dom.js';

export interface ViewInstance {
  el: HTMLElement;
  title: string;
  /** Visões imersivas (Mar da Alma) escondem a navegação. */
  immersive?: boolean;
  destroy?(): void;
  /** Chamado depois que o elemento entrou no DOM. */
  mounted?(): void;
  /** Permite à visão animar a própria saída. */
  leave?(): Promise<void>;
}

export type ViewFactory = (params: Record<string, string>) => ViewInstance;

interface Route {
  pattern: RegExp;
  keys: string[];
  factory: ViewFactory;
}

export class Router {
  private routes: Route[] = [];
  private current: ViewInstance | null = null;
  private seq = 0;
  private listeners: ((path: string, view: ViewInstance) => void)[] = [];

  constructor(private outlet: HTMLElement, private notFound: ViewFactory) {
    window.addEventListener('hashchange', () => void this.resolve());
  }

  add(path: string, factory: ViewFactory): this {
    const keys: string[] = [];
    const pattern = new RegExp(
      '^' + path.replace(/\/:([a-zA-Z]+)/g, (_, k) => (keys.push(k), '/([^/]+)')) + '/?$',
    );
    this.routes.push({ pattern, keys, factory });
    return this;
  }

  onChange(fn: (path: string, view: ViewInstance) => void): void {
    this.listeners.push(fn);
  }

  path(): string {
    const raw = window.location.hash.replace(/^#/, '') || '/';
    return raw.split('?')[0];
  }

  go(path: string): void {
    if (this.path() === path) void this.resolve();
    else window.location.hash = path;
  }

  async resolve(): Promise<void> {
    const seq = ++this.seq;
    const path = this.path();
    let factory = this.notFound;
    let params: Record<string, string> = {};
    for (const r of this.routes) {
      const m = path.match(r.pattern);
      if (m) {
        factory = r.factory;
        params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
        break;
      }
    }

    const prev = this.current;
    if (prev) {
      if (prev.leave) await prev.leave();
      else if (!prefersReducedMotion()) {
        prev.el.classList.add('view-leave');
        await new Promise((r) => setTimeout(r, 180));
      }
      if (seq !== this.seq) return;
      prev.destroy?.();
    }

    const view = factory(params);
    this.current = view;
    view.el.classList.add('view');
    this.outlet.replaceChildren(view.el);
    document.title = view.title ? `${view.title} — Reino dos Sonhos` : 'Reino dos Sonhos';
    const scrollTarget = params.anchor ?? (path === '/mundo' ? 'mundo' : null);
    if (scrollTarget) {
      requestAnimationFrame(() => document.getElementById(scrollTarget)?.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth' }));
    } else {
      window.scrollTo({ top: 0 });
    }
    view.mounted?.();
    this.listeners.forEach((l) => l(path, view));
    // Move o foco para o conteúdo principal (leitores de tela anunciam a troca de página).
    if (prev) {
      const heading = view.el.querySelector<HTMLElement>('h1, [data-autofocus]');
      if (heading) {
        heading.setAttribute('tabindex', '-1');
        heading.focus({ preventScroll: true });
      }
    }
  }
}
