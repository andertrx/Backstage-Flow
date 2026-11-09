-- T5.20: marcar pessoas (@) nos envios. 7 verificações numa transação desfeita (rodar no SQL do Supabase).
-- Resultado esperado: erro "T5.20: 7 verificações OK (desfeito)". Qualquer outro erro "FALHOU: ..." é falha.
do $$
declare
  v_admin uuid; v_nonadmin uuid; v_cli uuid; v_envio uuid; v_nomes text[]; v_n1 text; v_n2 text;
  v_res text[]; v_json jsonb; v_cnt int;
begin
  select id into v_admin from public.profiles where role = 'admin' and active limit 1;
  select id into v_nonadmin from public.profiles where role <> 'admin' and active limit 1;
  select p.cliente_id, p.contatos_marcar into v_cli, v_nomes from public.ops_envio_padroes p
    join public.ops_envio_clientes c on c.cliente_id = p.cliente_id and c.removido_em is null and c.ativo
   where cardinality(p.contatos_marcar) >= 2 limit 1;
  select c.envio_id into v_envio from public.ops_envio_clientes c where c.cliente_id = v_cli and c.removido_em is null limit 1;
  if v_cli is null or v_envio is null then raise exception 'FALHOU: sem cliente de teste com 2 pessoas a marcar'; end if;
  v_n1 := v_nomes[1]; v_n2 := v_nomes[2];

  -- 1) como administrador: liga as duas pessoas (símbolos e 11 dígitos viram o formato com 55)
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.wa_marcacao_salvar(v_cli, v_n1, '+55 (45) 99999-1111');
  perform public.wa_marcacao_salvar(v_cli, v_n2, '45 98888-2222');
  select count(*) into v_cnt from public.wa_marcacoes where cliente_id = v_cli;
  if v_cnt <> 2 then raise exception 'FALHOU: esperava 2 números ligados, veio %', v_cnt; end if;
  -- 2) número inválido e pessoa fora da lista
  begin perform public.wa_marcacao_salvar(v_cli, v_n1, '123'); raise exception 'FALHOU: aceitou número inválido';
  exception when sqlstate '22023' then null; end;
  begin perform public.wa_marcacao_salvar(v_cli, 'Fulano Inexistente', '5545999990000'); raise exception 'FALHOU: aceitou pessoa fora da lista';
  exception when sqlstate '22023' then null; end;
  reset role;

  -- 3) quem não é administrador não lê nem grava
  if v_nonadmin is not null then
    perform set_config('request.jwt.claims', json_build_object('sub', v_nonadmin, 'role', 'authenticated')::text, true);
    set local role authenticated;
    select count(*) into v_cnt from public.wa_marcacoes;
    if v_cnt <> 0 then raise exception 'FALHOU: não administrador leu % números', v_cnt; end if;
    begin perform public.wa_marcacao_salvar(v_cli, v_n1, '5545999990000'); raise exception 'FALHOU: não administrador conseguiu gravar';
    exception when sqlstate '42501' then null; end;
    reset role;
  end if;

  -- 4) o envio marca as duas, na ordem da lista, com os números normalizados
  v_res := private.wa_marcacoes_do_envio(v_envio, v_cli);
  if v_res <> array['5545999991111', '5545988882222'] then raise exception 'FALHOU: marcações do envio erradas: %', v_res; end if;

  -- 5) desligar a primeira pessoa no padrão tira só ela do envio
  update public.ops_envio_padroes set contatos_desligados = array[v_n1] where cliente_id = v_cli;
  v_res := private.wa_marcacoes_do_envio(v_envio, v_cli);
  if v_res <> array['5545988882222'] then raise exception 'FALHOU: pessoa desligada ainda marcada: %', v_res; end if;
  update public.ops_envio_padroes set contatos_desligados = '{}' where cliente_id = v_cli;

  -- 6) remover a ligação
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.wa_marcacao_remover(v_cli, v_n2);
  reset role;
  v_res := private.wa_marcacoes_do_envio(v_envio, v_cli);
  if v_res <> array['5545999991111'] then raise exception 'FALHOU: depois de remover, esperava só a primeira: %', v_res; end if;

  -- 7) o texto do disparo: mensagem + linha em branco + @número; e `mentioned` na mesma ordem
  insert into public.wa_disparos (envio_id, cliente_id, grupo_id, semana, origem, status, versao_envio)
  select v_envio, v_cli, '120363000000000001@g.us', current_date, 'manual', 'pendente', e.versao from public.ops_envios e where e.id = v_envio;
  update public.wa_disparos set created_at = now() - interval '1 year' where cliente_id = v_cli and status = 'pendente' and grupo_id = '120363000000000001@g.us';
  v_json := private.wa_disparo_proximo();
  if v_json is null then raise exception 'INCONCLUSIVO: o próximo disparo voltou vazio (ritmo/limite do dia) — o item 7 não foi conferido'; end if;
  if (v_json ->> 'mensagem') not like '%' || E'\n\n@5545999991111' or (v_json -> 'mentioned') <> '["5545999991111"]'::jsonb then
    raise exception 'FALHOU: texto/mentioned do disparo errados: %', v_json;
  end if;

  raise exception 'T5.20: 7 verificações OK (desfeito)';
end $$;
