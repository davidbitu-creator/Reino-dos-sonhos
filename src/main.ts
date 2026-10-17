/** Ponto de entrada: escolhe o repositório (Supabase ou demonstração), monta o layout e as rotas. */
import { h } from './core/dom.js';
import { Router } from './core/router.js';
import { store } from './core/store.js';
import { DemoRepository } from './data/demoRepo.js';
import { SupabaseRepository, type SupabaseConfig } from './data/supabaseRepo.js';
import type { Repository } from './data/types.js';
import { createDemoBanner, createFooter, createHeader } from './ui/chrome.js';
import { loader } from './ui/feedback.js';
import { adminView } from './views/admin.js';
import { characterView } from './views/character.js';
import { charactersView } from './views/characters.js';
import { encountersView } from './views/encounters.js';
import { homeView } from './views/home.js';
import { loginView } from './views/login.js';
import { nightmareView } from './views/nightmare.js';
import { notFoundView } from './views/notFound.js';
import { soulSeaIndexView, soulSeaView } from './views/soulSea.js';

declare global {
  interface Window { RDS_CONFIG?: Partial<SupabaseConfig> }
}

async function createRepository(): Promise<Repository> {
  const cfg = window.RDS_CONFIG ?? {};
  if (cfg.supabaseUrl && cfg.supabaseAnonKey) {
    return SupabaseRepository.create({
      supabaseUrl: cfg.supabaseUrl,
      supabaseAnonKey: cfg.supabaseAnonKey,
      supabaseModule: cfg.supabaseModule || 'https://esm.sh/@supabase/supabase-js@2.45.4',
      storageBucket: cfg.storageBucket || 'character-images',
    });
  }
  return new DemoRepository();
}

function fatal(root: HTMLElement, error: unknown): void {
  console.error(error);
  root.replaceChildren(h('div', { class: 'page page-empty' },
    h('h1', { class: 'page-title' }, 'O Reino não respondeu'),
    h('p', { class: 'page-lede' }, 'Não foi possível conectar ao Supabase. Confira supabaseUrl e supabaseAnonKey em config.js e se o esquema do banco foi aplicado.'),
    h('pre', { class: 'error-detail' }, error instanceof Error ? error.message : String(error)),
    h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => window.location.reload() }, 'Tentar novamente')));
}

async function boot(): Promise<void> {
  const root = document.getElementById('app')!;
  root.replaceChildren(h('div', { class: 'boot' }, loader('Adormecendo…')));

  let repo: Repository;
  try {
    repo = await createRepository();
    await store.init(repo);
  } catch (e) {
    fatal(root, e);
    return;
  }

  const main = h('main', { id: 'main', class: 'main', tabindex: '-1' });
  let router: Router;
  const header = createHeader(() => router?.path() ?? '/');
  const banner = createDemoBanner();
  root.replaceChildren(
    h('a', { class: 'skip-link', href: '#main', onClick: (e: Event) => { e.preventDefault(); main.focus(); } }, 'Pular para o conteúdo'),
    ...(banner ? [banner] : []), header.el, main, createFooter());
  document.body.classList.toggle('has-demo', !!banner);

  router = new Router(main, () => notFoundView());
  router
    .add('/', homeView)
    .add('/mundo', homeView)
    .add('/personagens', charactersView)
    .add('/personagens/:id', characterView)
    .add('/mar-da-alma', soulSeaIndexView)
    .add('/mar-da-alma/:id', soulSeaView)
    .add('/criaturas', nightmareView)
    .add('/encontros', encountersView)
    .add('/mestre', adminView)
    .add('/entrar', loginView);

  router.onChange((_path, view) => {
    document.body.classList.toggle('is-immersive', !!view.immersive);
    header.update();
  });

  // Ao trocar de sessão, re-renderiza a visão atual (permissões mudam o que aparece).
  let lastSession = store.state.session?.profile.id + '|' + store.state.session?.profile.role;
  store.subscribe((s) => {
    const key = s.session?.profile.id + '|' + s.session?.profile.role;
    if (key !== lastSession) {
      lastSession = key;
      void router.resolve();
    }
  });

  await router.resolve();
}

void boot();
