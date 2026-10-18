-- Testes das regras de autorização. Uso local:
--   psql -f supabase/tests/supabase_shim.sql -f supabase/schema.sql -f supabase/tests/rls_test.sql
\set ON_ERROR_STOP on
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'mestre@x.com', '{"display_name":"Mestre"}'),
  ('00000000-0000-0000-0000-00000000000b', 'ana@x.com', '{"display_name":"Ana"}'),
  ('00000000-0000-0000-0000-00000000000c', 'bruno@x.com', '{"display_name":"Bruno"}');
update public.profiles set role = 'master' where id = '00000000-0000-0000-0000-00000000000a';

create or replace function pg_temp.as_user(u text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', u, false);
  execute 'set role ' || case when u = '' then 'anon' else 'authenticated' end;
end $$;

do $$
declare ana uuid := '00000000-0000-0000-0000-00000000000b'; bruno uuid := '00000000-0000-0000-0000-00000000000c';
  c_ana uuid; c_bruno uuid; n int; ok boolean;
begin
  -- Ana cria personagem tentando trapacear XP/núcleos/dono: o trigger corrige
  perform pg_temp.as_user(ana::text);
  insert into public.characters (owner_id, name, xp, soul_cores) values (bruno, 'Iris', 99999, 7) returning id into c_ana;
  select count(*) into n from public.characters where id = c_ana and owner_id = ana and xp = 0 and soul_cores = 1;
  assert n = 1, 'insert de jogador deveria forçar dono/xp/núcleos';

  -- Ana não altera XP diretamente
  begin update public.characters set xp = 500 where id = c_ana; ok := false;
  exception when others then ok := true; end;
  assert ok, 'XP direto deveria falhar';

  -- Ana não concede XP via RPC (regra padrão)
  begin perform public.apply_xp(c_ana, 'add', 300, 'x'); ok := false;
  exception when others then ok := true; end;
  assert ok, 'jogador não deveria conceder XP por padrão';

  -- Ana não muda núcleos nem o próprio papel
  begin update public.characters set soul_cores = 3 where id = c_ana; ok := false;
  exception when others then ok := true; end;
  assert ok, 'jogador não deveria alterar núcleos';
  begin update public.profiles set role = 'master' where id = ana; ok := false;
  exception when others then ok := true; end;
  assert ok, 'jogador não deveria se promover';

  -- Ana edita cor do próprio personagem
  update public.characters set core_color = '#FF0000' where id = c_ana;

  -- Bruno cria um e Ana não consegue editá-lo (RLS filtra: 0 linhas)
  perform pg_temp.as_user(bruno::text);
  insert into public.characters (owner_id, name) values (bruno, 'Teo') returning id into c_bruno;
  perform pg_temp.as_user(ana::text);
  update public.characters set name = 'hack' where id = c_bruno;
  select count(*) into n from public.characters where id = c_bruno and name = 'Teo';
  assert n = 1, 'Ana não deveria editar personagem do Bruno';
  delete from public.characters where id = c_bruno;
  select count(*) into n from public.characters where id = c_bruno;
  assert n = 1, 'Ana não deveria excluir personagem do Bruno';

  -- Ana não vê histórico do Bruno, nem encontros, nem escreve textos do mundo
  begin insert into public.campaign_sections (key, title) values ('x', 'x'); ok := false;
  exception when others then ok := true; end;
  assert ok, 'jogador não deveria escrever seções';
  begin insert into public.encounters (name) values ('x'); ok := false;
  exception when others then ok := true; end;
  assert ok, 'jogador não deveria criar encontros';

  -- Storage: Ana só grava na própria pasta
  insert into storage.objects (bucket_id, name) values ('character-images', ana::text || '/' || c_ana::text || '/a.jpg');
  begin insert into storage.objects (bucket_id, name) values ('character-images', bruno::text || '/x/a.jpg'); ok := false;
  exception when others then ok := true; end;
  assert ok, 'Ana não deveria gravar na pasta do Bruno';

  -- Mestre concede XP com histórico, altera núcleos
  perform pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
  perform public.apply_xp(c_ana, 'add', 2850, 'Sessão 1');
  perform public.apply_xp(c_ana, 'correct', 2700, 'Ajuste');
  update public.characters set soul_cores = 2 where id = c_ana;
  select count(*) into n from public.characters where id = c_ana and xp = 2700 and soul_cores = 2;
  assert n = 1, 'mestre deveria administrar XP e núcleos';
  select count(*) into n from public.xp_events where character_id = c_ana;
  assert n = 2, 'histórico deveria ter 2 eventos';
  insert into public.encounters (name, data) values ('Emboscada', '{}');
  insert into public.creature_defaults (rank, cls, cr) values (3, 5, '8');

  -- Com a configuração liberada, Ana concede XP ao próprio personagem
  update public.campaign_settings set players_can_grant_xp = true where id = 1;
  perform pg_temp.as_user(ana::text);
  perform public.apply_xp(c_ana, 'add', 100, 'autoconcessão');
  begin perform public.apply_xp(c_bruno, 'add', 100, 'x'); ok := false;
  exception when others then ok := true; end;
  assert ok, 'Ana não deveria conceder XP ao Bruno';
  select count(*) into n from public.xp_events;
  assert n = 3, 'Ana deveria ver apenas o próprio histórico (3)';

  -- Memórias: Ana cria na própria personagem, não na do Bruno
  insert into public.memories (character_id, name) values (c_ana, 'Lâmina');
  begin insert into public.memories (character_id, name) values (c_bruno, 'Roubada'); ok := false;
  exception when others then ok := true; end;
  assert ok, 'Ana não deveria criar Memória no personagem do Bruno';

  -- Visitante (anon) vê personagens públicos e textos, nada mais
  perform pg_temp.as_user('');
  select count(*) into n from public.characters; assert n = 2, 'anon vê públicos';
  select count(*) into n from public.campaign_sections; assert n = 4, 'anon vê textos';
  select count(*) into n from public.encounters; assert n = 0, 'anon não vê encontros';
  select count(*) into n from public.memories; assert n = 1, 'anon vê Memórias de personagens públicos';
  reset role;
  raise notice 'TODOS OS TESTES DE RLS PASSARAM';
end $$;
