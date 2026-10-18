-- =====================================================================
-- REINO DOS SONHOS — Memórias dos personagens (atualização)
-- Execute uma vez no SQL Editor do Supabase. Pode ser executado de novo sem problema.
-- =====================================================================
create table if not exists public.memories (
  id uuid primary key default gen_random_uuid(),
  character_id uuid not null references public.characters (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  kind text not null default '',
  rank int not null default 0 check (rank between 0 and 7),
  tier int not null default 0 check (tier between 0 and 3),
  description text not null default '' check (char_length(description) <= 2000),
  enchantments text not null default '' check (char_length(enchantments) <= 1000),
  created_at timestamptz not null default now()
);
create index if not exists memories_character_idx on public.memories (character_id, created_at);

alter table public.memories enable row level security;

-- Leitura: quem pode ver o personagem vê as Memórias dele.
drop policy if exists memories_select on public.memories;
create policy memories_select on public.memories for select to anon, authenticated
  using (exists (select 1 from public.characters c where c.id = character_id
                 and (c.is_public or c.owner_id = auth.uid() or public.is_master())));

-- Escrita: só o dono do personagem e o mestre.
drop policy if exists memories_write on public.memories;
create policy memories_write on public.memories for all to authenticated
  using (exists (select 1 from public.characters c where c.id = character_id
                 and (c.owner_id = auth.uid() or public.is_master())))
  with check (exists (select 1 from public.characters c where c.id = character_id
                 and (c.owner_id = auth.uid() or public.is_master())));

grant select on public.memories to anon;
grant select, insert, update, delete on public.memories to authenticated;
