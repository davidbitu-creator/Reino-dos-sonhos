-- =====================================================================
-- REINO DOS SONHOS — esquema Supabase (Postgres) com Row Level Security
-- Execute este arquivo inteiro no SQL Editor do seu projeto Supabase.
-- É idempotente: pode ser executado novamente para atualizar políticas.
-- =====================================================================

-- ---------- Perfis ----------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default 'Adormecido',
  role text not null default 'player' check (role in ('player', 'master')),
  created_at timestamptz not null default now()
);

-- Verifica se o usuário atual é mestre (security definer evita recursão de RLS).
create or replace function public.is_master()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'master');
$$;

-- Cria o perfil automaticamente quando alguém se cadastra.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Somente o mestre muda papéis (o SQL Editor, sem auth.uid(), também pode).
create or replace function public.guard_profile_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then return new; end if;
  if new.role is distinct from old.role and not public.is_master() then
    raise exception 'Apenas o mestre pode alterar papéis.' using errcode = '42501';
  end if;
  if new.role is distinct from old.role and old.id = auth.uid() and new.role <> 'master'
     and (select count(*) from public.profiles where role = 'master') <= 1 then
    raise exception 'A campanha precisa de ao menos um mestre.' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_profile_update on public.profiles;
create trigger guard_profile_update before update on public.profiles
  for each row execute function public.guard_profile_update();

-- ---------- Configurações da campanha ---------------------------------
create table if not exists public.campaign_settings (
  id int primary key default 1 check (id = 1),
  players_can_grant_xp boolean not null default false,
  players_can_create_characters boolean not null default true,
  reward_rules text not null default '',
  updated_at timestamptz not null default now()
);
insert into public.campaign_settings (id) values (1) on conflict (id) do nothing;

-- ---------- Textos do mundo -------------------------------------------
create table if not exists public.campaign_sections (
  key text primary key,
  title text not null,
  body text not null default '',
  sort int not null default 0,
  updated_at timestamptz not null default now()
);

insert into public.campaign_sections (key, title, body, sort) values
  ('feitico', 'O Feitiço do Pesadelo',
   'No ano de 2301, jovens de todo o mundo são infectados pelo Feitiço do Pesadelo. Ninguém escolhe ser marcado. Um dia, simplesmente, o sono deixa de ser descanso.', 1),
  ('adormecidos', 'Os Adormecidos',
   'Quem sobrevive ao Primeiro Pesadelo desperta diferente: um Adormecido, portador de poderes que não pertencem ao mundo desperto.', 2),
  ('solsticio', 'O Solstício de Inverno',
   'Com a chegada do Solstício de Inverno, os Adormecidos são arrancados de casa e levados ao Reino dos Sonhos. Não há aviso que baste, nem preparo suficiente.', 3),
  ('gateways', 'Os Gateways',
   'Para voltar ao mundo real, é preciso encontrar um Gateway. Encontrá-lo é apenas a primeira prova. Sobreviver até lá é a segunda.', 4)
on conflict (key) do nothing;

-- ---------- Personagens -----------------------------------------------
create table if not exists public.characters (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  player_name text not null default '',
  epithet text not null default '',
  dnd_class text not null default '',
  campaign_rank text not null default 'Adormecido',
  bio text not null default '',
  xp int not null default 0 check (xp between 0 and 10000000),
  soul_cores int not null default 1 check (soul_cores between 0 and 7),
  core_color text not null default '#7FB4FF' check (core_color ~ '^#[0-9A-Fa-f]{6}$'),
  image_path text,
  image_focus_x real not null default 50 check (image_focus_x between 0 and 100),
  image_focus_y real not null default 30 check (image_focus_y between 0 and 100),
  image_zoom real not null default 1 check (image_zoom between 1 and 3),
  is_public boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists characters_owner_idx on public.characters (owner_id);

-- Regras que o RLS sozinho não expressa (proteção de colunas):
--  * XP só muda pela função apply_xp (que registra histórico);
--  * Núcleos da Alma e dono só mudam pelo mestre;
--  * jogadores criam personagens sempre com XP 0, 1 núcleo e para si mesmos.
create or replace function public.guard_character_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at := now();
  if auth.uid() is null then return new; end if; -- SQL Editor / service role

  if tg_op = 'INSERT' then
    if not public.is_master() then
      new.owner_id := auth.uid();
      new.xp := 0;
      new.soul_cores := 1;
    end if;
    return new;
  end if;

  if new.xp is distinct from old.xp and coalesce(current_setting('rds.xp_rpc', true), '') <> 'on' then
    raise exception 'O XP só pode ser alterado pela função apply_xp.' using errcode = '42501';
  end if;
  if not public.is_master() then
    if new.soul_cores is distinct from old.soul_cores then
      raise exception 'Apenas o mestre altera a quantidade de Núcleos da Alma.' using errcode = '42501';
    end if;
    if new.owner_id is distinct from old.owner_id then
      raise exception 'Apenas o mestre transfere personagens.' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists guard_character_write on public.characters;
create trigger guard_character_write before insert or update on public.characters
  for each row execute function public.guard_character_write();

-- ---------- Histórico de XP -------------------------------------------
create table if not exists public.xp_events (
  id uuid primary key default gen_random_uuid(),
  character_id uuid not null references public.characters (id) on delete cascade,
  kind text not null check (kind in ('add', 'correct')),
  delta int not null,
  previous_xp int not null,
  new_xp int not null,
  reason text not null default '',
  created_by uuid references public.profiles (id) on delete set null,
  created_by_name text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists xp_events_character_idx on public.xp_events (character_id, created_at desc);

-- Concede ou corrige XP de forma atômica e auditada.
create or replace function public.apply_xp(p_character uuid, p_kind text, p_value int, p_reason text default '')
returns public.xp_events
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.characters;
  s public.campaign_settings;
  next_xp int;
  ev public.xp_events;
begin
  if auth.uid() is null then raise exception 'Faça login.' using errcode = '42501'; end if;
  select * into c from public.characters where id = p_character for update;
  if not found then raise exception 'Personagem não encontrado.'; end if;
  select * into s from public.campaign_settings where id = 1;

  if not public.is_master() and not (c.owner_id = auth.uid() and s.players_can_grant_xp) then
    raise exception 'Somente o mestre pode conceder XP nesta campanha.' using errcode = '42501';
  end if;

  if p_kind = 'add' then
    next_xp := c.xp + p_value;
  elsif p_kind = 'correct' then
    next_xp := p_value;
  else
    raise exception 'Tipo inválido: %', p_kind;
  end if;
  next_xp := greatest(0, least(10000000, next_xp));

  perform set_config('rds.xp_rpc', 'on', true);
  update public.characters set xp = next_xp where id = c.id;
  perform set_config('rds.xp_rpc', 'off', true);

  insert into public.xp_events (character_id, kind, delta, previous_xp, new_xp, reason, created_by, created_by_name)
  values (c.id, p_kind, next_xp - c.xp, c.xp, next_xp, left(coalesce(p_reason, ''), 280), auth.uid(),
          coalesce((select display_name from public.profiles where id = auth.uid()), ''))
  returning * into ev;
  return ev;
end;
$$;

revoke all on function public.apply_xp(uuid, text, int, text) from public, anon;
grant execute on function public.apply_xp(uuid, text, int, text) to authenticated;

-- ---------- Criaturas: padrões por Rank × Classe ----------------------
-- Não existe conversão oficial Shadow Slave → CR. Estes são valores da campanha.
create table if not exists public.creature_defaults (
  rank int not null check (rank between 1 and 7),
  cls int not null check (cls between 1 and 7),
  cr text,
  xp int check (xp is null or xp >= 0),
  reward text not null default '',
  shards int not null default 0 check (shards >= 0),
  updated_at timestamptz not null default now(),
  primary key (rank, cls)
);

-- ---------- Encontros salvos ------------------------------------------
create table if not exists public.encounters (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  data jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- =====================================================================
-- ROW LEVEL SECURITY
-- =====================================================================
alter table public.profiles enable row level security;
alter table public.campaign_settings enable row level security;
alter table public.campaign_sections enable row level security;
alter table public.characters enable row level security;
alter table public.xp_events enable row level security;
alter table public.creature_defaults enable row level security;
alter table public.encounters enable row level security;

-- Perfis
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated using (true);
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid() or public.is_master()) with check (id = auth.uid() or public.is_master());

-- Configurações
drop policy if exists settings_select on public.campaign_settings;
create policy settings_select on public.campaign_settings for select to anon, authenticated using (true);
drop policy if exists settings_update on public.campaign_settings;
create policy settings_update on public.campaign_settings for update to authenticated
  using (public.is_master()) with check (public.is_master());

-- Textos do mundo
drop policy if exists sections_select on public.campaign_sections;
create policy sections_select on public.campaign_sections for select to anon, authenticated using (true);
drop policy if exists sections_write on public.campaign_sections;
create policy sections_write on public.campaign_sections for all to authenticated
  using (public.is_master()) with check (public.is_master());

-- Personagens
drop policy if exists characters_select on public.characters;
create policy characters_select on public.characters for select to anon, authenticated
  using (is_public or owner_id = auth.uid() or public.is_master());
drop policy if exists characters_insert on public.characters;
create policy characters_insert on public.characters for insert to authenticated
  with check (
    public.is_master()
    or (owner_id = auth.uid() and (select players_can_create_characters from public.campaign_settings where id = 1))
  );
drop policy if exists characters_update on public.characters;
create policy characters_update on public.characters for update to authenticated
  using (owner_id = auth.uid() or public.is_master())
  with check (owner_id = auth.uid() or public.is_master());
drop policy if exists characters_delete on public.characters;
create policy characters_delete on public.characters for delete to authenticated
  using (owner_id = auth.uid() or public.is_master());

-- Histórico de XP: leitura pelo dono e pelo mestre; escrita só via apply_xp.
drop policy if exists xp_events_select on public.xp_events;
create policy xp_events_select on public.xp_events for select to authenticated
  using (public.is_master() or exists (select 1 from public.characters c where c.id = character_id and c.owner_id = auth.uid()));

-- Padrões de criaturas
drop policy if exists defaults_select on public.creature_defaults;
create policy defaults_select on public.creature_defaults for select to authenticated using (true);
drop policy if exists defaults_write on public.creature_defaults;
create policy defaults_write on public.creature_defaults for all to authenticated
  using (public.is_master()) with check (public.is_master());

-- Encontros: exclusivos do mestre
drop policy if exists encounters_all on public.encounters;
create policy encounters_all on public.encounters for all to authenticated
  using (public.is_master()) with check (public.is_master());

-- =====================================================================
-- STORAGE — imagens dos personagens
-- Caminho: <id do dono>/<id do personagem>/<arquivo>
-- =====================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('character-images', 'character-images', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "rds images read" on storage.objects;
create policy "rds images read" on storage.objects for select to anon, authenticated
  using (bucket_id = 'character-images');

drop policy if exists "rds images insert" on storage.objects;
create policy "rds images insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'character-images' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_master()));

drop policy if exists "rds images update" on storage.objects;
create policy "rds images update" on storage.objects for update to authenticated
  using (bucket_id = 'character-images' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_master()));

drop policy if exists "rds images delete" on storage.objects;
create policy "rds images delete" on storage.objects for delete to authenticated
  using (bucket_id = 'character-images' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_master()));

-- =====================================================================
-- DEPOIS DE CRIAR SUA CONTA NO SITE, torne-se mestre executando:
--   update public.profiles set role = 'master'
--   where id = (select id from auth.users where email = 'seu-email@exemplo.com');
-- =====================================================================
