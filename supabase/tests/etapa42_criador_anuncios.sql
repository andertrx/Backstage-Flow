-- Teste da Etapa 42 — Criador de Anúncios (modelos e histórico de pedidos). Transação desfeita (termina com "R: N verificações OK").
do $$
declare
  v_admin uuid; v_ok integer := 0; v_m uuid; v_m2 uuid; v_p bigint; v_p2 bigint; v_j jsonb;
  d jsonb := jsonb_build_object('tipo', 'anuncios', 'conta', 'Loja (act_1)', 'campanha', 'Camp', 'conjunto', 'Conj', 'textos', jsonb_build_array('Oi'),
                                'whatsapp_numero', '5511987654321');
begin
  select id into v_admin from public.profiles where role = 'admin' and active order by created_at limit 1;
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);

  -- Modelos: salvar, mesmo nome substitui, listar, arquivar (não apaga)
  v_m := public.ads_builder_modelo_save(null, 'Modelo Teste 42', d);
  v_m2 := public.ads_builder_modelo_save(null, '  modelo teste 42 ', d || jsonb_build_object('campanha', 'Outra'));
  if v_m2 <> v_m then raise exception 'mesmo nome substitui o modelo'; end if;
  select x into v_j from jsonb_array_elements(public.ads_builder_modelos()) x where x ->> 'id' = v_m::text;
  if v_j -> 'dados' ->> 'campanha' <> 'Outra' then raise exception 'modelo atualizado: %', v_j; end if;
  perform public.ads_builder_modelo_archive(v_m);
  if exists (select 1 from jsonb_array_elements(public.ads_builder_modelos()) x where x ->> 'id' = v_m::text)
     or not exists (select 1 from public.ads_builder_modelos where id = v_m and arquivado_em is not null) then raise exception 'arquivar não apaga'; end if;
  v_ok := v_ok + 1;

  -- Pedidos: guardar, duplicado aponta a origem, histórico com busca
  v_p := public.ads_builder_pedido_add(d, 'Crie anúncios no Meta Ads com os dados abaixo.', null);
  v_p2 := public.ads_builder_pedido_add(d || jsonb_build_object('conjunto', 'Conj 2'), 'Crie anúncios… conjunto 2', v_p);
  if (select origem_pedido_id from public.ads_builder_pedidos where id = v_p2) <> v_p then raise exception 'duplicado guarda a origem'; end if;
  v_j := public.ads_builder_pedidos(jsonb_build_object('busca', 'conj 2'));
  if jsonb_array_length(v_j) < 1 or (v_j -> 0 ->> 'id')::bigint <> v_p2 or v_j -> 0 ->> 'criado_por_nome' is null then raise exception 'histórico com busca: %', v_j; end if;
  v_ok := v_ok + 1;

  -- Validações: sem conta/campanha/conjunto, texto vazio, segredos (token, senha, cartão) recusados; telefone aceito
  begin perform public.ads_builder_pedido_add(d - 'conjunto', 'x', null); raise exception 'sem conjunto deveria ser recusado';
  exception when sqlstate '22023' then null; end;
  begin perform public.ads_builder_pedido_add(d, '  ', null); raise exception 'pedido vazio deveria ser recusado';
  exception when sqlstate '22023' then null; end;
  begin perform public.ads_builder_pedido_add(d || jsonb_build_object('observacoes', 'EAABwzLixnjYBAKZCZB1234567890abcdef'), 'x', null); raise exception 'token deveria ser recusado';
  exception when sqlstate '22023' then null; end;
  begin perform public.ads_builder_modelo_save(null, 'Com senha', d || jsonb_build_object('observacoes', 'senha: abc12345')); raise exception 'senha deveria ser recusada';
  exception when sqlstate '22023' then null; end;
  begin perform public.ads_builder_pedido_add(d, 'cartão 4111 1111 1111 1111', null); raise exception 'cartão deveria ser recusado';
  exception when sqlstate '22023' then null; end;
  begin perform public.ads_builder_pedido_add(d || jsonb_build_object('tipo', 'campanha'), 'x', null); raise exception 'tipo futuro ainda não disponível';
  exception when sqlstate '22023' then null; end;
  v_ok := v_ok + 1;

  -- Sem papel de anúncios (pessoa sem perfil): não lê nem grava; RLS esconde as tabelas
  perform set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'role', 'authenticated')::text, true);
  begin perform public.ads_builder_pedidos('{}'); raise exception 'sem permissão não deveria ler';
  exception when sqlstate '42501' then null; end;
  begin perform public.ads_builder_pedido_add(d, 'x', null); raise exception 'sem permissão não deveria gravar';
  exception when sqlstate '42501' then null; end;
  if exists (select 1 from public.ads_builder_pedidos) or exists (select 1 from public.ads_builder_modelos) then raise exception 'RLS: sem permissão não vê'; end if;
  v_ok := v_ok + 1;

  raise exception 'R: % verificações OK', v_ok;
end $$;
