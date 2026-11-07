-- Teste da Etapa 46.1 — conexão do Google Agenda. Transação desfeita: termina com "R: N verificações OK".
do $$
declare v_admin uuid; v_other uuid; v_ok int := 0; v_n int; v_t text; v_id uuid;
begin
  select id into v_admin from public.profiles where role = 'admin' and active order by created_at limit 1;
  select id into v_other from public.profiles where active and role <> 'admin' order by created_at limit 1;
  insert into public.google_agenda_conexoes (user_id, google_email, google_sub, scopes) values (v_other, 'x@empresa.com.br', 'sub1', 'calendar.events');
  insert into public.google_agenda_conexoes (user_id, google_email, google_sub, scopes) values (v_admin, 'a@empresa.com.br', 'sub2', 'calendar.events');

  -- 1) cofre: a chave vai e volta pelo servidor; desconectar apaga
  perform public.gcal_secret_set(v_other, 'refresh-token-de-teste');
  if public.gcal_secret_get(v_other) <> 'refresh-token-de-teste' then raise exception 'cofre não devolveu a chave'; end if;
  if exists (select 1 from public.google_agenda_conexoes c where c.user_id = v_other and c.vault_secret_id is null) then raise exception 'sem vínculo com o cofre'; end if;
  v_ok := v_ok + 1;

  -- 2) cada pessoa vê só a sua; admin vê todas; ninguém lê a chave nem escreve direto
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_other, 'role', 'authenticated')::text, true);
  select count(*) into v_n from public.google_agenda_conexoes;
  if v_n <> 1 then raise exception 'pessoa vê % linhas', v_n; end if;
  begin perform vault_secret_id from public.google_agenda_conexoes; raise exception 'leu a coluna do cofre';
  exception when insufficient_privilege then null; end;
  begin update public.google_agenda_conexoes set status = 'erro'; raise exception 'escreveu direto';
  exception when insufficient_privilege then null; end;
  begin perform public.gcal_secret_get(v_other); raise exception 'chamou o cofre pelo site';
  exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  select count(*) into v_n from public.google_agenda_conexoes;
  if v_n < 2 then raise exception 'admin não vê todas'; end if;
  v_ok := v_ok + 1;

  -- 3) desconectar apaga a chave
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
  perform public.gcal_secret_delete(v_other);
  update public.google_agenda_conexoes set status = 'desconectada' where user_id = v_other;
  if public.gcal_secret_get(v_other) is not null then raise exception 'a chave continua no cofre'; end if;
  if exists (select 1 from vault.secrets where name = 'gcal:' || v_other::text) then raise exception 'sobrou segredo no vault'; end if;
  v_ok := v_ok + 1;

  raise exception 'R: % verificações OK', v_ok;
end $$;
