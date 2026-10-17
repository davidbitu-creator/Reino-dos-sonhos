/** Cabeçalho, navegação, faixa do modo demonstração e rodapé. */
import { h, replace } from '../core/dom.js';
import { store } from '../core/store.js';
import { isMaster } from '../data/permissions.js';
import { confirmDialog, reportError, toast } from './feedback.js';

interface NavItem { href: string; label: string; match: (p: string) => boolean; master?: boolean }

const NAV: NavItem[] = [
  { href: '#/', label: 'Início', match: (p) => p === '/' },
  { href: '#/mundo', label: 'O Mundo', match: (p) => p === '/mundo' },
  { href: '#/personagens', label: 'Personagens', match: (p) => p.startsWith('/personagens') },
  { href: '#/mar-da-alma', label: 'Mar da Alma', match: (p) => p.startsWith('/mar-da-alma') },
  { href: '#/criaturas', label: 'Criaturas do Pesadelo', match: (p) => p.startsWith('/criaturas') },
  { href: '#/encontros', label: 'Simulador de Encontros', match: (p) => p.startsWith('/encontros') },
  { href: '#/mestre', label: 'Mestre', match: (p) => p.startsWith('/mestre'), master: true },
];

export function createHeader(getPath: () => string): { el: HTMLElement; update(): void } {
  const links = h('ul', { class: 'nav-links', id: 'nav-links' });
  const account = h('div', { class: 'nav-account' });
  const toggle = h('button', { class: 'nav-toggle', type: 'button', 'aria-expanded': 'false', 'aria-controls': 'nav-panel' },
    h('span', { class: 'nav-toggle-bars', 'aria-hidden': 'true' }), h('span', { class: 'sr-only' }, 'Menu'));
  const panel = h('div', { class: 'nav-panel', id: 'nav-panel' }, links, account);
  const el = h('header', { class: 'site-header' },
    h('nav', { class: 'nav', 'aria-label': 'Principal' },
      h('a', { class: 'brand', href: '#/', 'aria-label': 'Reino dos Sonhos — início' },
        h('span', { class: 'brand-mark', 'aria-hidden': 'true' }), h('span', { class: 'brand-word' }, 'Reino dos Sonhos')),
      toggle, panel));

  function setOpen(v: boolean): void {
    // O painel começa logo abaixo do cabeçalho (que pode estar abaixo da faixa de demonstração)
    if (v) panel.style.top = `${Math.max(0, el.getBoundingClientRect().bottom)}px`;
    el.classList.toggle('is-open', v);
    toggle.setAttribute('aria-expanded', String(v));
    document.body.classList.toggle('nav-locked', v);
  }
  toggle.addEventListener('click', () => setOpen(!el.classList.contains('is-open')));
  panel.addEventListener('click', (e) => { if ((e.target as HTMLElement).closest('a')) setOpen(false); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && el.classList.contains('is-open')) { setOpen(false); toggle.focus(); } });

  window.addEventListener('scroll', () => el.classList.toggle('is-scrolled', window.scrollY > 24), { passive: true });

  function update(): void {
    const path = getPath();
    const s = store.state.session;
    replace(links, NAV.filter((n) => !n.master || isMaster(s)).map((n) =>
      h('li', null, h('a', { href: n.href, class: 'nav-link', 'aria-current': n.match(path) ? 'page' : undefined }, n.label))));
    if (s) {
      const out = h('button', { class: 'nav-link nav-signout', type: 'button' }, 'Sair');
      out.addEventListener('click', async () => {
        try {
          await store.repo.signOut();
          toast('Sessão encerrada.', 'info');
          window.location.hash = '#/';
        } catch (e) { reportError(e); }
      });
      replace(account,
        h('span', { class: 'nav-user' }, h('span', { class: 'nav-user-name' }, s.profile.displayName),
          h('span', { class: 'nav-user-role' }, s.profile.role === 'master' ? 'Mestre' : 'Jogador')),
        out);
    } else {
      replace(account, h('a', { class: 'nav-link nav-signin', href: '#/entrar', 'aria-current': path === '/entrar' ? 'page' : undefined }, 'Entrar'));
    }
  }
  store.subscribe(update);
  return { el, update };
}

export function createDemoBanner(): HTMLElement | null {
  if (store.repo.mode !== 'demo') return null;
  const select = h('select', { class: 'demo-select', 'aria-label': 'Ver o site como' });
  const reset = h('button', { class: 'demo-reset', type: 'button' }, 'Reiniciar demonstração');
  const el = h('div', { class: 'demo-banner', role: 'region', 'aria-label': 'Aviso de modo demonstração' },
    h('p', { class: 'demo-text' },
      h('strong', null, 'Modo demonstração.'),
      ' Os dados ficam só neste navegador e não há contas reais. Configure o Supabase para usar com o grupo.'),
    h('div', { class: 'demo-controls' }, h('span', { class: 'demo-label' }, 'Ver como'), select, reset));

  async function fill(): Promise<void> {
    const profiles = await store.repo.listProfiles().catch(() => []);
    const all = profiles.length ? profiles : [];
    const current = store.state.session?.profile.id ?? '';
    const options = [
      ...all.map((p) => h('option', { value: p.id, selected: p.id === current }, `${p.displayName}${p.role === 'master' ? ' · mestre' : ' · jogador'}`)),
      h('option', { value: '', selected: !current }, 'Visitante (sem login)'),
    ];
    select.replaceChildren(...options);
  }
  // listProfiles exige login; no modo demo usamos a lista fixa quando deslogado.
  select.addEventListener('change', async () => {
    try {
      if (select.value) await store.repo.demoSignInAs!(select.value);
      else await store.repo.signOut();
    } catch (e) { reportError(e); }
  });
  reset.addEventListener('click', async () => {
    if (!(await confirmDialog('Reiniciar demonstração', 'Todos os personagens, imagens, XP e encontros criados nesta demonstração serão apagados deste navegador.', 'Reiniciar', true))) return;
    await store.repo.resetDemo!();
    await store.refreshAll();
    toast('Demonstração reiniciada.');
    window.location.hash = '#/';
  });
  const refill = async (): Promise<void> => {
    if (store.state.session) await fill();
    else {
      // Deslogado: mostra a lista padrão de perfis fictícios
      select.replaceChildren(
        h('option', { value: '', selected: true }, 'Visitante (sem login)'),
        h('option', { value: 'demo-master' }, 'Mestre · mestre'),
        h('option', { value: 'demo-ana' }, 'Ana · jogador'),
        h('option', { value: 'demo-bruno' }, 'Bruno · jogador'),
        h('option', { value: 'demo-caio' }, 'Caio · jogador'));
    }
  };
  store.subscribe(() => void refill());
  void refill();
  return el;
}

export function createFooter(): HTMLElement {
  return h('footer', { class: 'site-footer' },
    h('div', { class: 'footer-inner' },
      h('p', { class: 'footer-brand' }, 'Reino dos Sonhos'),
      h('p', { class: 'footer-note' },
        'Campanha de fã para Dungeons & Dragons 5e (2024), inspirada na novel Shadow Slave. ',
        'Sem afiliação com os detentores dos direitos. Textos de ambientação definidos pelo mestre.')));
}
