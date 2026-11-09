-- T5.22: marcar pessoas (@) por número, escolhido por cliente. 8 verificações numa transação desfeita.
-- Resultado esperado: erro "T5.22: 8 verificações OK (desfeito)". Qualquer outro erro "FALHOU: ..." é falha.
do $$
declare
  v_admin uuid; v_nonadmin uuid; v_cli uuid; v_envio uuid;
  v_res text[]; v_json jsonb; v_cnt int;
begin
  select id into v_admin from public.profiles where role = 'admin' and active limit 1;
  select id into v_nonadmin from public.profiles where role <> 'admin' and active limit 1;
  select c.cliente_id, c.envio_id into v_cli, v_envio from public.ops_envio_clientes c
   where c.removido_em is null and c.ativo and not exists (select 1 from public.wa_marcacoes m where m.cliente_id = c.cliente_id) limit 1;
  if v_cli is null then raise exception 'FALHOU: sem cliente de teste sem marcações'; end if;

  -- 1) administrador liga duas pessoas com apelido livre (símbolos e 11 dígitos viram 55...)
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.wa_marcacao_salvar(v_cli, 'Dono', '+55 (45) 99999-1111');
  perform public.wa_marcacao_salvar(v_cli, 'Sócia', '45 98888-2222');
  select count(*) into v_cnt from public.wa_marcacoes where cliente_id = v_cli;
  if v_cnt <> 2 then raise exception 'FALHOU: esperava 2 números, veio %', v_cnt; end if;
  -- 2) número inválido e número repetido para outra pessoa
  begin perform public.wa_marcacao_salvar(v_cli, 'Dono', '123'); raise exception 'FALHOU: aceitou número inválido';
  exception when sqlstate '22023' then null; end;
  begin perform public.wa_marcacao_salvar(v_cli, 'Outro', '5545999991111'); raise exception 'FALHOU: aceitou número repetido';
  exception when sqlstate '22023' then null; end;
  reset role;

  -- 3) quem não é administrador não lê nem grava
  if v_nonadmin is not null then
    perform set_config('request.jwt.claims', json_build_object('sub', v_nonadmin, 'role', 'authenticated')::text, true);
    set local role authenticated;
    select count(*) into v_cnt from public.wa_marcacoes;
    if v_cnt <> 0 then raise exception 'FALHOU: não administrador leu % números', v_cnt; end if;
    begin perform public.wa_marcacao_salvar(v_cli, 'Dono', '5545999990000'); raise exception 'FALHOU: não administrador gravou';
    exception when sqlstate '42501' then null; end;
    begin perform public.wa_marcacao_ativar(v_cli, 'Dono', false); raise exception 'FALHOU: não administrador desligou';
    exception when sqlstate '42501' then null; end;
    reset role;
  end if;

  -- 4) o envio marca as duas, na ordem de cadastro
  v_res := private.wa_marcacoes_do_envio(v_envio, v_cli);
  if v_res <> array['5545999991111', '5545988882222'] then raise exception 'FALHOU: marcações erradas: %', v_res; end if;

  -- 5) desligar uma pessoa tira só ela
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.wa_marcacao_ativar(v_cli, 'Dono', false);
  reset role;
  v_res := private.wa_marcacoes_do_envio(v_envio, v_cli);
  if v_res <> array['5545988882222'] then raise exception 'FALHOU: pessoa desligada ainda marcada: %', v_res; end if;

  -- 6) remover a ligação
  set local role authenticated;
  perform public.wa_marcacao_remover(v_cli, 'Sócia');
  reset role;
  v_res := private.wa_marcacoes_do_envio(v_envio, v_cli);
  if cardinality(v_res) <> 0 then raise exception 'FALHOU: depois de remover/desligar, esperava vazio: %', v_res; end if;

  -- 7) religar a primeira
  set local role authenticated;
  perform public.wa_marcacao_ativar(v_cli, 'Dono', true);
  reset role;
  v_res := private.wa_marcacoes_do_envio(v_envio, v_cli);
  if v_res <> array['5545999991111'] then raise exception 'FALHOU: religar não voltou: %', v_res; end if;

  -- 8) texto do disparo: mensagem + linha em branco + @número; `mentioned` igual
  insert into public.wa_envio_config (envio_id, automatico) values (v_envio, true) on conflict (envio_id) do update set automatico = true;
  insert into public.ops_envio_aprovacoes (envio_id, semana, decisao, versao_envio, origem)
  select v_envio, (private.envio_hoje() ->> 'semana')::date, 'aprovado', e.versao, 'sistema' from public.ops_envios e where e.id = v_envio
  on conflict (envio_id, semana) do update set decisao = 'aprovado', versao_envio = excluded.versao_envio, decidido_em = now();
  update public.ops_envios set ativo = true, arquivado_em = null where id = v_envio;
  insert into public.wa_disparos (envio_id, cliente_id, grupo_id, semana, origem, status, versao_envio)
  select v_envio, v_cli, '120363000000000001@g.us', current_date, 'automatico', 'pendente', e.versao from public.ops_envios e where e.id = v_envio;
  update public.wa_disparos set created_at = now() - interval '1 year' where cliente_id = v_cli and status = 'pendente' and grupo_id = '120363000000000001@g.us';
  update public.wa_disparos set status = 'pulado' where status = 'pendente' and id not in (select id from public.wa_disparos where cliente_id = v_cli and grupo_id = '120363000000000001@g.us');
  update public.wa_disparos set enviado_em = now() - interval '1 day', atualizado_em = now() - interval '1 day' where status in ('enviando','enviado');
  v_json := private.wa_disparo_proximo();
  if v_json is null then raise exception 'INCONCLUSIVO: próximo disparo vazio (ritmo/limite/aprovação) — item 8 não conferido'; end if;
  if (v_json ->> 'mensagem') not like '%' || E'\n\n@5545999991111' or (v_json -> 'mentioned') <> '["5545999991111"]'::jsonb then
    raise exception 'FALHOU: texto/mentioned errados: %', v_json;
  end if;

  raise exception 'T5.22: 8 verificações OK (desfeito)';
end $$;
