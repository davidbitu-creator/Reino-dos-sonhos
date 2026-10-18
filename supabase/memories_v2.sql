-- =====================================================================
-- REINO DOS SONHOS — Memórias: cor própria e imagem (atualização 2)
-- Execute uma vez no SQL Editor do Supabase (depois do memories.sql).
-- Pode ser executado de novo sem problema. Não apaga nenhum dado.
-- =====================================================================
alter table public.memories add column if not exists color text
  check (color is null or color ~ '^#[0-9A-Fa-f]{6}$');
alter table public.memories add column if not exists image_path text;
