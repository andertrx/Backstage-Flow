-- Teste da Etapa 44.2 — grupos do WhatsApp ligados aos clientes. Transação desfeita: termina com "R: N verificações OK".
do $$
declare
  v_admin uuid; v_sem uuid; v_c1 uuid; v_c2 uuid; v_ok int := 0; v_id uuid; v_n int;
begin
  select id into v_admin from public.profiles where role = 'admin' and active order by created_at limit 1;
  select p.id into v_sem from public.profiles p where p.active and p.role not in ('admin', 'cliente') and not exists (select 1 from public.ops_member_permissions x where x.user_id = p.id and x.permission = 'ops.envios') order by p.created_at limit 1;
  select id into v_c1 from public.clients where excluded_at is null order by name limit 1;
  select id into v_c2 from public.clients where excluded_at is null order by name offset 1 limit 1;
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_sem, 'role', 'authenticated')::text, true);
  begin perform public.wa_grupo_vincular(v_c1, '120363000000000001@g.us', 'Grupo A'); raise exception 'sem permissão ligou';
  exception when insufficient_privilege then null; end;
  begin perform public.wa_grupo_desvincular(v_c1); raise exception 'sem permissão desligou';
  exception when insufficient_privilege then null; end;
  v_ok := v_ok + 1;

  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  begin perform public.wa_grupo_vincular(v_c1, '5511987654321@s.whatsapp.net', 'x'); raise exception 'aceitou telefone';
  exception when sqlstate '22023' then null; end;
  begin perform public.wa_grupo_vincular(v_c1, 'abc', 'x'); raise exception 'aceitou lixo';
  exception when sqlstate '22023' then null; end;
  begin perform public.wa_grupo_vincular(gen_random_uuid(), '120363000000000001@g.us', 'x'); raise exception 'aceitou cliente inexistente';
  exception when sqlstate '22023' then null; end;
  v_ok := v_ok + 1;

  v_id := public.wa_grupo_vincular(v_c1, '120363000000000001@g.us', 'Grupo A');
  if public.wa_grupo_vincular(v_c1, '120363000000000001@g.us', 'Grupo A (renomeado)') <> v_id then raise exception 'duplicou'; end if;
  select count(*) into v_n from public.wa_grupos where cliente_id = v_c1 and desvinculado_em is null;
  if v_n <> 1 then raise exception 'mais de um ativo'; end if;
  perform public.wa_grupo_vincular(v_c1, '120363000000000002@g.us', 'Grupo B');
  if (select count(*) from public.wa_grupos where cliente_id = v_c1) <> 2 or (select count(*) from public.wa_grupos where cliente_id = v_c1 and desvinculado_em is null) <> 1
     or (select grupo_id from public.wa_grupos where cliente_id = v_c1 and desvinculado_em is null) <> '120363000000000002@g.us' then raise exception 'troca de grupo errada'; end if;
  v_ok := v_ok + 1;

  begin perform public.wa_grupo_vincular(v_c2, '120363000000000002@g.us', 'Grupo B'); raise exception 'grupo em dois clientes';
  exception when sqlstate '22023' then null; end;
  perform public.wa_grupo_desvincular(v_c1);
  if exists (select 1 from public.wa_grupos where cliente_id = v_c1 and desvinculado_em is null) then raise exception 'não desligou'; end if;
  if (select count(*) from public.wa_grupos where cliente_id = v_c1) <> 2 then raise exception 'histórico perdido'; end if;
  perform public.wa_grupo_vincular(v_c2, '120363000000000002@g.us', 'Grupo B');
  v_ok := v_ok + 1;

  select count(*) into v_n from public.wa_grupos;
  if v_n < 3 then raise exception 'admin não enxerga: %', v_n; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_sem, 'role', 'authenticated')::text, true);
  select count(*) into v_n from public.wa_grupos;
  if v_n <> 0 then raise exception 'sem permissão enxerga'; end if;
  perform set_config('role', 'postgres', true);
  if (select count(*) from public.audit_logs where action like 'wa_grupo.%' and actor_id = v_admin) < 4 then raise exception 'auditoria incompleta'; end if;
  v_ok := v_ok + 1;

  raise exception 'R: % verificações OK', v_ok;
end $$;
