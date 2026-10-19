-- =====================================================================
-- REINO DOS SONHOS — História e ficha do personagem (atualização 3)
-- Só o DONO do personagem e o MESTRE conseguem ler ou alterar.
-- Execute uma vez no SQL Editor do Supabase. Pode repetir sem problema.
-- =====================================================================
create table if not exists public.character_private (
  character_id uuid primary key references public.characters (id) on delete cascade,
  lore text not null default '' check (char_length(lore) <= 20000),
  sheet_path text,
  sheet_name text,
  sheet_size bigint,
  updated_at timestamptz not null default now()
);

alter table public.character_private enable row level security;

drop policy if exists private_owner_master on public.character_private;
create policy private_owner_master on public.character_private for all to authenticated
  using (exists (select 1 from public.characters c where c.id = character_id
                 and (c.owner_id = auth.uid() or public.is_master())))
  with check (exists (select 1 from public.characters c where c.id = character_id
                 and (c.owner_id = auth.uid() or public.is_master())));

grant select, insert, update, delete on public.character_private to authenticated;

-- Bucket PRIVADO para as fichas (até 10 MB). Caminho: <id do dono>/<id do personagem>/<arquivo>
insert into storage.buckets (id, name, public, file_size_limit)
values ('character-sheets', 'character-sheets', false, 10485760)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;

drop policy if exists "rds sheets read" on storage.objects;
create policy "rds sheets read" on storage.objects for select to authenticated
  using (bucket_id = 'character-sheets' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_master()));

drop policy if exists "rds sheets insert" on storage.objects;
create policy "rds sheets insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'character-sheets' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_master()));

drop policy if exists "rds sheets update" on storage.objects;
create policy "rds sheets update" on storage.objects for update to authenticated
  using (bucket_id = 'character-sheets' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_master()));

drop policy if exists "rds sheets delete" on storage.objects;
create policy "rds sheets delete" on storage.objects for delete to authenticated
  using (bucket_id = 'character-sheets' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_master()));
