-- Teste da Etapa 41.5 — código curto de cada envio (ENV-001…) e filtro por código. Transação desfeita (termina com "R: N verificações OK").
do $$
declare
  v_admin uuid; v_c1 uuid; e1 uuid; e2 uuid; v_ok integer := 0; v_j jsonb; c1 text; c2 text;
  mk jsonb;
begin
  select id into v_admin from public.profiles where role = 'admin' and active order by created_at limit 1;
  select id into v_c1 from public.clients c where excluded_at is null and not exists (select 1 from public.ops_envio_padroes p where p.cliente_id = c.id) order by name limit 1;
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  perform set_config('request.headers', '{}', true);
  mk := jsonb_build_array(jsonb_build_object('cliente_id', v_c1, 'nome_grupo', 'Grupo teste'));

  -- Cada envio novo ganha um código próprio, em sequência
  e1 := public.ops_envio_save(null, null, jsonb_build_object('nome', 'Teste segunda', 'mensagem', 'Oi', 'dia_semana', 1, 'horario', '09:00', 'clientes', mk));
  e2 := public.ops_envio_save(null, null, jsonb_build_object('nome', 'Teste terça', 'mensagem', 'Oi', 'dia_semana', 2, 'horario', '09:00', 'clientes', mk));
  c1 := public.ops_envio_get(e1) ->> 'codigo';
  c2 := public.ops_envio_get(e2) ->> 'codigo';
  if c1 !~ '^ENV-\d{3,}$' or c2 !~ '^ENV-\d{3,}$' or c1 = c2 then raise exception 'códigos: % %', c1, c2; end if;
  if substring(c2 from 5)::int <> substring(c1 from 5)::int + 1 then raise exception 'em sequência: % %', c1, c2; end if;
  v_ok := v_ok + 1;

  -- Filtro por código (maiúscula/minúscula) e pelo ID longo: só aquele envio
  v_j := public.ops_envio_list(jsonb_build_object('codigo', lower(c2)));
  if jsonb_array_length(v_j -> 'envios') <> 1 or v_j -> 'envios' -> 0 ->> 'id' <> e2::text then raise exception 'filtro por código: %', v_j; end if;
  v_j := public.ops_envio_list(jsonb_build_object('codigo', e1::text));
  if jsonb_array_length(v_j -> 'envios') <> 1 or v_j -> 'envios' -> 0 ->> 'codigo' <> c1 then raise exception 'filtro pelo ID'; end if;
  if jsonb_array_length(public.ops_envio_list(jsonb_build_object('codigo', 'ENV-999999')) -> 'envios') <> 0 then raise exception 'código inexistente'; end if;
  v_ok := v_ok + 1;

  -- Editar não muda o código
  perform public.ops_envio_save(e1, 1, jsonb_build_object('nome', 'Teste segunda 2', 'mensagem', 'Oi', 'dia_semana', 1, 'horario', '09:00', 'clientes', mk));
  if public.ops_envio_get(e1) ->> 'codigo' <> c1 then raise exception 'código fixo'; end if;
  v_ok := v_ok + 1;

  -- A sequência não volta com a transação desfeita: devolve o próximo número ao que era (sem buracos nos códigos reais)
  perform set_config('role', 'postgres', true);
  perform setval('public.ops_envios_codigo_seq', greatest(coalesce((select max(substring(codigo from 5)::int) from public.ops_envios where id not in (e1, e2)), 0), 1),
                 exists (select 1 from public.ops_envios where id not in (e1, e2)));

  raise exception 'R: % verificações OK', v_ok;
end $$;
