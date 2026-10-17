import { h, replace, uid } from '../core/dom.js';
import { store } from '../core/store.js';
import type { ViewInstance } from '../core/router.js';
import { toast, withBusy } from '../ui/feedback.js';

export function loginView(): ViewInstance {
  const box = h('div', { class: 'auth-box' });
  const el = h('div', { class: 'page page-auth' }, box);
  let mode: 'in' | 'up' = 'in';

  function field(label: string, attrs: Record<string, string>): HTMLElement {
    const id = uid('a');
    return h('label', { class: 'field', for: id }, h('span', { class: 'field-label' }, label), h('input', { class: 'input', id, ...attrs }));
  }

  function render(): void {
    const s = store.state.session;
    if (s) {
      const nameId = uid('n');
      const name = h('input', { class: 'input', id: nameId, value: s.profile.displayName, maxlength: '60' });
      const save = h('button', { class: 'btn btn-primary', type: 'submit' }, 'Salvar nome');
      const form = h('form', { class: 'form' },
        h('label', { class: 'field', for: nameId }, h('span', { class: 'field-label' }, 'Nome exibido'), name),
        h('div', { class: 'modal-actions' }, save));
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        void withBusy(save, async () => {
          await store.repo.updateDisplayName(name.value);
          store.set({ session: await store.repo.getSession() });
          toast('Nome salvo.');
        });
      });
      replace(box,
        h('h1', { class: 'page-title' }, 'Sua conta'),
        h('p', { class: 'page-lede' }, `${s.email ? s.email + ' · ' : ''}${s.profile.role === 'master' ? 'Mestre da campanha' : 'Jogador'}`),
        form,
        h('a', { class: 'btn btn-ghost', href: '#/personagens' }, 'Ir para os personagens'));
      return;
    }

    if (store.repo.mode === 'demo') {
      const profiles: [string, string, string][] = [
        ['demo-master', 'Mestre', 'Vê e controla tudo: XP, encontros, regras, membros.'],
        ['demo-ana', 'Ana', 'Jogadora de Iris Valen. Edita só a própria personagem.'],
        ['demo-bruno', 'Bruno', 'Jogador de Teodoro Kael.'],
        ['demo-caio', 'Caio', 'Jogador de Lis Moreau.'],
      ];
      replace(box,
        h('h1', { class: 'page-title' }, 'Entrar'),
        h('p', { class: 'page-lede' }, 'Este site está em modo demonstração: não há contas nem senhas. Escolha um perfil fictício para ver o que cada papel pode fazer.'),
        h('ul', { class: 'demo-profiles' }, profiles.map(([id, name, desc]) => {
          const b = h('button', { class: 'demo-profile', type: 'button' }, h('span', { class: 'demo-profile-name' }, name), h('span', { class: 'demo-profile-desc' }, desc));
          b.addEventListener('click', () => void withBusy(b, async () => {
            await store.repo.demoSignInAs!(id);
            toast(`Vendo o site como ${name}.`, 'info');
            window.location.hash = '#/personagens';
          }));
          return h('li', null, b);
        })),
        h('p', { class: 'field-help' }, 'Para contas reais com e-mail e senha, configure o Supabase (veja o README do projeto).'));
      return;
    }

    const err = h('p', { class: 'form-error', role: 'alert' });
    const submit = h('button', { class: 'btn btn-primary btn-block', type: 'submit' }, mode === 'in' ? 'Entrar' : 'Criar conta');
    const form = h('form', { class: 'form', novalidate: true },
      mode === 'up' ? field('Seu nome', { name: 'name', required: 'true', maxlength: '60', autocomplete: 'nickname' }) : null,
      field('E-mail', { name: 'email', type: 'email', required: 'true', autocomplete: 'email' }),
      field('Senha', { name: 'password', type: 'password', required: 'true', minlength: '8', autocomplete: mode === 'in' ? 'current-password' : 'new-password' }),
      mode === 'up' ? h('p', { class: 'field-help' }, 'Mínimo de 8 caracteres. Você pode precisar confirmar o e-mail.') : null,
      err, submit);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      const email = String(fd.get('email') ?? '').trim();
      const password = String(fd.get('password') ?? '');
      const name = String(fd.get('name') ?? '').trim();
      if (!/^\S+@\S+\.\S+$/.test(email)) { err.textContent = 'Informe um e-mail válido.'; return; }
      if (password.length < 8) { err.textContent = 'A senha precisa ter ao menos 8 caracteres.'; return; }
      if (mode === 'up' && !name) { err.textContent = 'Informe seu nome.'; return; }
      err.textContent = '';
      void withBusy(submit, async () => {
        if (mode === 'in') {
          await store.repo.signIn(email, password);
          toast('Bem-vindo de volta ao Reino.');
          window.location.hash = '#/personagens';
        } else {
          const r = await store.repo.signUp(email, password, name);
          if (r.needsConfirmation) {
            replace(box, h('h1', { class: 'page-title' }, 'Confirme seu e-mail'),
              h('p', { class: 'page-lede' }, `Enviamos um link para ${email}. Abra-o para ativar sua conta e depois entre.`));
          } else {
            toast('Conta criada.');
            window.location.hash = '#/personagens';
          }
        }
      }).catch(() => undefined);
    });
    const switcher = h('button', { class: 'btn-text', type: 'button' }, mode === 'in' ? 'Ainda não tem conta? Criar conta' : 'Já tem conta? Entrar');
    switcher.addEventListener('click', () => { mode = mode === 'in' ? 'up' : 'in'; render(); });
    replace(box,
      h('h1', { class: 'page-title' }, mode === 'in' ? 'Entrar' : 'Criar conta'),
      h('p', { class: 'page-lede' }, 'Jogadores gerenciam os próprios personagens. O mestre concede XP e cuida das regras.'),
      form, switcher);
  }

  render();
  const unsub = store.subscribe(() => { if (!box.querySelector('form input:focus')) render(); });
  return { el, title: 'Entrar', destroy: unsub };
}
