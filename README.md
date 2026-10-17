# Reino dos Sonhos

Plataforma da campanha **Reino dos Sonhos** — Dungeons & Dragons 5e (2024) com ambientação inspirada em *Shadow Slave*.

- Página inicial cinematográfica e textos do mundo editáveis pelo mestre
- Galeria de personagens com upload, troca, remoção e enquadramento de retratos
- **Mar da Alma**: Núcleo da Alma animado em Canvas, cor personalizável, XP oficial 2024, histórico e a sequência de ascensão
- Criaturas do Pesadelo: simulador das 49 combinações Rank × Classe e tabela 7×7
- Simulador de Encontros com o orçamento de XP do DMG 2024, recompensas, encontros salvos e concessão de XP
- Contas reais com Supabase (Auth + Postgres + Storage) e regras de acesso no banco (RLS)

---

## 1. Como o projeto está organizado

O site é **TypeScript puro, sem framework e sem dependências de runtime**. A única dependência de desenvolvimento é o compilador TypeScript. Isso torna a publicação trivial (qualquer hospedagem estática) e elimina atualizações de pacotes quebrando o site.

```
reino-dos-sonhos/
├── index.html                 Casca HTML (fontes, estilos, config, módulo principal)
├── config.js                  Configuração em tempo de execução (Supabase) — editável sem rebuild
├── public/                    Arquivos copiados como estão (favicon)
├── styles/
│   ├── base.css               Tokens (cores, tipografia), layout global, cabeçalho, rodapé
│   ├── components.css         Botões, campos, select, modal, toast, cards, seletor de cor
│   ├── pages.css              Início, galeria, personagem, criaturas, encontros, mestre, login
│   └── sea.css                Mar da Alma
├── src/
│   ├── main.ts                Entrada: escolhe o backend, monta layout e rotas
│   ├── rules/                 TABELAS DE REGRAS (sem DOM, testadas)
│   │   ├── xp.ts              XP por nível (PHB 2024), progresso dentro do nível
│   │   ├── nightmare.ts       7 Ranks × 7 Classes, nomes PT/EN com concordância, núcleos
│   │   └── encounter.ts       Orçamento DMG 2024, XP por CR, dificuldade, distribuição, recompensas
│   ├── anim/
│   │   ├── soulCore.ts        Renderizador do Núcleo da Alma (Canvas 2D) e ascensão
│   │   └── heroField.ts       Partículas ambientais da página inicial
│   ├── data/                  PERSISTÊNCIA E AUTENTICAÇÃO
│   │   ├── types.ts           Modelos e a interface Repository
│   │   ├── supabaseRepo.ts    Implementação real (Supabase)
│   │   ├── demoRepo.ts        Modo demonstração (localStorage, sem segurança — claramente sinalizado)
│   │   ├── permissions.ts     Espelho das regras de acesso para mostrar/ocultar controles
│   │   └── images.ts          Redimensionamento de imagens no navegador
│   ├── core/                  DOM declarativo, roteador por hash, estado global, cores
│   ├── ui/                    Componentes visuais reutilizáveis
│   └── views/                 Páginas
├── supabase/
│   ├── schema.sql             Tabelas, triggers, função apply_xp, RLS e Storage
│   └── tests/                 Testes das regras de acesso num Postgres local
├── tests/rules.test.mjs       Testes de XP, criaturas e encontros
├── scripts/                   Build e servidor local (Node, sem dependências)
└── .github/workflows/deploy.yml  Publicação automática no GitHub Pages
```

## 2. Rodar localmente

Requisitos: **Node.js 18+**.

```bash
npm install          # instala apenas o TypeScript
npm run dev          # compila, observa alterações e serve em http://localhost:5173
```

Outros comandos:

```bash
npm run build        # gera dist/ (pronto para publicar)
npm run serve        # serve dist/ sem recompilar
npm test             # compila e roda os testes de regras
npm run typecheck    # verificação de tipos
```

Sem Supabase configurado, o site abre em **modo demonstração**: uma faixa no topo avisa, os dados ficam só no navegador, e você escolhe um perfil fictício (Mestre, Ana, Bruno, Caio) para ver o que cada papel pode fazer. Personagens de demonstração exibem a etiqueta *Demo*.

## 3. Configurar o Supabase (contas reais, dados compartilhados)

1. Crie um projeto gratuito em [supabase.com](https://supabase.com).
2. Abra **SQL Editor → New query**, cole todo o conteúdo de `supabase/schema.sql` e execute. O script é idempotente: pode rodar de novo para atualizar.
3. Em **Authentication → URL Configuration**, defina **Site URL** como o endereço do site (ex.: `https://seu-usuario.github.io/reino-dos-sonhos/`) e adicione `http://localhost:5173` em **Redirect URLs** para testar localmente.
4. Em **Project Settings → API**, copie a **Project URL** e a chave **anon public**.
5. Preencha `config.js`:

   ```js
   window.RDS_CONFIG = {
     supabaseUrl: 'https://xxxx.supabase.co',
     supabaseAnonKey: 'eyJ...',
     supabaseModule: 'https://esm.sh/@supabase/supabase-js@2.45.4',
     storageBucket: 'character-images',
   };
   ```

   A chave *anon* é pública por design; a proteção real está nas políticas do banco.
6. Abra o site, vá em **Entrar → Criar conta** e cadastre-se.
7. Torne-se mestre executando no SQL Editor:

   ```sql
   update public.profiles set role = 'master'
   where id = (select id from auth.users where email = 'seu-email@exemplo.com');
   ```

   A partir daí, promova ou rebaixe outros membros em **Mestre → Membros**.

### O que o banco garante (não só a interface)

| Regra | Onde |
| --- | --- |
| Jogador só edita/exclui os próprios personagens | RLS em `characters` |
| XP só muda pela função `apply_xp`, que grava o histórico | trigger `guard_character_write` |
| Por padrão, só o mestre concede XP (configurável) | `apply_xp` + `campaign_settings` |
| Núcleos da Alma e transferência de dono: só o mestre | trigger |
| Jogador cria personagem sempre com XP 0, 1 núcleo, para si | trigger |
| Só o mestre muda papéis, textos do mundo, regras, padrões de criaturas e encontros | RLS + trigger em `profiles` |
| Histórico de XP visível ao dono e ao mestre | RLS em `xp_events` |
| Imagens: cada jogador grava só na própria pasta do Storage | políticas em `storage.objects` |
| Visitantes sem conta veem textos e personagens públicos | RLS para `anon` |

Para testar essas regras num Postgres local (sem Supabase):

```bash
createdb rds
psql -d rds -f supabase/tests/supabase_shim.sql -f supabase/schema.sql -f supabase/tests/rls_test.sql
# deve terminar com: TODOS OS TESTES DE RLS PASSARAM
```

## 4. Publicar

### GitHub Pages (recomendado, gratuito)

1. Crie um repositório e envie o projeto (`git push` para `main`).
2. Em **Settings → Secrets and variables → Actions**, crie `SUPABASE_URL` e `SUPABASE_ANON_KEY`.
3. Em **Settings → Pages**, escolha **Source: GitHub Actions**.
4. Cada push na `main` roda os testes, compila e publica. O `config.js` é gerado a partir dos secrets.
5. Atualize a **Site URL** do Supabase com o endereço final do Pages.

### Netlify, Vercel ou Cloudflare Pages

- Comando de build: `npm run build`
- Diretório de saída: `dist`
- Depois do primeiro deploy, edite `dist/config.js` (ou adicione um passo que o gere, como no workflow do GitHub).

As rotas usam `#/` (hash), então não é preciso configurar redirecionamentos.

## 5. Personalizar a campanha

- **Textos do mundo**: entre como mestre e use *Editar texto* em cada bloco da seção *O Mundo*. Os textos iniciais estão em `supabase/schema.sql` (e em `src/data/demoRepo.ts` para a demonstração).
- **Regras de progressão e recompensas**: *Mestre → Regras da campanha*.
- **CR/XP padrão por Rank × Classe**: *Mestre → Padrões de criaturas*. Não existe conversão oficial; os valores são seus.
- **Cores e tipografia**: tokens no topo de `styles/base.css` (`--abyss`, `--bone`, `--serif`, `--sans`…). As fontes (Bodoni Moda e Instrument Sans) vêm do Google Fonts em `index.html`.
- **Paleta sugerida dos núcleos**: `CORE_PRESETS` em `src/core/color.ts`. Qualquer cor hexadecimal também é aceita.
- **Favicon**: substitua `public/favicon.svg`.
- **Retratos**: cada jogador envia o seu pela página do personagem (JPG/PNG/WebP, até 15 MB; o navegador reduz para 1600 px antes do envio). O formato exibido é sempre 3:4, com ponto de foco e aproximação ajustáveis.
- **Dados de demonstração**: função `seed()` em `src/data/demoRepo.ts`.

## 6. Regras implementadas

- **XP por nível**: tabela oficial do Player's Handbook 2024 (0 → 355.000). A barra mede o progresso **dentro do intervalo** do nível atual.
- **Ascensão**: dispara apenas quando o XP cruza um marco para cima. Correções para baixo nunca disparam. XP concedido fora do Mar da Alma (por exemplo, pelo Simulador de Encontros) faz a ascensão acontecer na próxima visita ao Mar daquele personagem.
- **Intensidade do núcleo**: cresce com o nível (aura, partículas, filamentos, brilho da membrana). O anel interno de luz cresce com o progresso dentro do nível.
- **Núcleos da Alma do personagem**: atributo separado do nível, definido pelo mestre (0–7).
- **Encontros**: orçamento por personagem do DMG 2024 (Baixa/Moderada/Alta), somado nível a nível, comparado ao XP total das criaturas; sem multiplicadores de 2014. Acima do orçamento Alto, o simulador avisa "Acima de Alta". CR 0 vale 10 XP.
- **XP de cada criatura**: XP manual → CR informado → padrão da campanha (XP) → padrão da campanha (CR). Sem nenhum deles, o cálculo de dificuldade é bloqueado com a explicação.
- **Núcleos possuídos x recompensas**: os núcleos vêm da Classe (1–7) e aparecem como informação; fragmentos e recompensas são definidos à parte pelo mestre.

## 7. Limitações reais

- **Modo Supabase não foi executado contra um projeto Supabase real** durante o desenvolvimento (o ambiente de construção não tinha acesso). O esquema, os triggers, a função `apply_xp` e todas as políticas de RLS foram testados num PostgreSQL 16 com um simulador de `auth`/`storage` (`supabase/tests`); o cliente foi verificado por tipos e todo o restante do site foi testado no modo demonstração. Faça um teste com duas contas (mestre e jogador) antes da primeira sessão.
- O cliente `@supabase/supabase-js` é carregado do CDN `esm.sh` em tempo de execução. Se preferir não depender do CDN, baixe o módulo ESM e aponte `supabaseModule` para o arquivo local.
- O bucket de imagens é público para leitura: quem tiver o link de uma imagem consegue vê-la, inclusive de personagens marcados como privados.
- Não há fluxo de "esqueci minha senha" na interface. O mestre pode enviar um link de redefinição pelo painel do Supabase (*Authentication → Users*).
- O registro de "último nível visto" (que dispara a ascensão adiada) fica no navegador. Em um aparelho novo, uma subida de nível feita em outro lugar não é reencenada.
- Modo demonstração: sem segurança, sem contas e limitado ao armazenamento local do navegador (~5 MB, o que comporta poucos retratos).
- Atualizações em tempo real entre jogadores não estão ativas: os dados aparecem para os outros ao recarregar ou navegar.

## 8. Créditos e direitos

Projeto de fã, sem afiliação com os autores de *Shadow Slave*, a Wizards of the Coast ou a Critical Role. Nenhum asset de terceiros é incluído: ilustrações, núcleos e texturas são gerados por código. Use apenas imagens de personagens que vocês tenham direito de usar.
