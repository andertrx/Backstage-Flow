-- Teste da Etapa 51.1 — Ficha do cliente no Onboarding. Transação desfeita: termina com "R: N verificações OK".
do $$
declare
  v_admin uuid; v_am uuid; v_vis uuid; v_cli uuid; v_lead_cli uuid; v_lead uuid; v_ver int; v_ok int := 0; v_d jsonb; v_b jsonb; v_k bigint; v_err text;
  s_am uuid;
begin
  select id into v_admin from public.profiles where role = 'admin' and active order by created_at limit 1;
  -- pessoa da Central (não admin, sem "Atribuir responsáveis") que é Account Manager por estar no setor "Account Manager"
  select p.id into v_am from public.profiles p
   where p.active and p.role not in ('admin', 'gestor', 'cliente')
     and exists (select 1 from public.ops_member_permissions x where x.user_id = p.id and x.permission = 'ops.access')
     and not exists (select 1 from public.ops_member_permissions x where x.user_id = p.id and x.permission = 'ops.tasks.assign')
     and not exists (select 1 from public.ops_client_ops o where o.am_user_id = p.id)
   order by p.created_at limit 1;
  select id into s_am from public.ops_sectors where lower(btrim(name)) = 'account manager';
  if v_am is null then raise exception 'teste precisa de uma pessoa da Central que não seja admin'; end if;
  insert into public.ops_member_sectors (user_id, sector_id, is_primary) values (v_am, s_am, false) on conflict do nothing;
  -- para conferir a recusa, o setor muda de nome dentro da transação (desfeito no fim)
  update public.ops_sectors set name = 'AM (teste 51.1)' where id = s_am;

  -- 1) sem setor Account Manager e sem cliente: não pode cadastrar cliente novo
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_am, 'role', 'authenticated')::text, true);
  begin perform public.ops_client_create_start('{"name":"Cliente 51.1 sem permissão"}'::jsonb); raise exception 'cadastrou sem ser AM';
  exception when sqlstate '42501' then null; end;
  v_ok := v_ok + 1;

  -- 2) no setor Account Manager: cadastra cliente novo, entra no onboarding e vira o AM dele
  perform set_config('role', 'postgres', true);
  update public.ops_sectors set name = 'Account Manager' where id = s_am;
  perform set_config('role', 'authenticated', true);
  v_cli := public.ops_client_create_start('{"name":"Cliente teste 51.1","company":"Empresa 51.1 Ltda","owner_name":"Maria",
            "phone":"(11) 98765-4321","email":"Maria@Exemplo.com.br"}'::jsonb);
  perform set_config('role', 'postgres', true);
  if (select stage_id from public.ops_client_ops where client_id = v_cli) <> 'onboarding_pendente' then raise exception 'não entrou em Pendente'; end if;
  if (select am_user_id from public.ops_client_ops where client_id = v_cli) <> v_am then raise exception 'AM não ficou com o cliente'; end if;
  if (select phone from public.clients where id = v_cli) <> '5511987654321' then raise exception 'telefone não foi limpo'; end if;
  if (select email from public.clients where id = v_cli) <> 'maria@exemplo.com.br' then raise exception 'e-mail não foi limpo'; end if;
  if not exists (select 1 from public.ops_activity where client_id = v_cli and action = 'cliente.fluxo_iniciado' and after ->> 'cadastro' like 'direto%') then
    raise exception 'sem histórico do cadastro direto';
  end if;
  v_ok := v_ok + 1;

  -- 3) nome repetido e telefone inválido são recusados
  perform set_config('role', 'authenticated', true);
  begin perform public.ops_client_create_start('{"name":"cliente TESTE 51.1"}'::jsonb); raise exception 'aceitou nome repetido';
  exception when sqlstate '22023' then get stacked diagnostics v_err = message_text; end;
  if v_err not like 'Já existe o cliente%' then raise exception 'mensagem de duplicado errada: %', v_err; end if;
  begin perform public.ops_client_create_start('{"name":"Outro 51.1","phone":"123"}'::jsonb); raise exception 'aceitou telefone inválido';
  exception when sqlstate '22023' then null; end;
  v_ok := v_ok + 1;

  -- 4) dados: lê (só pelo site) e edita; histórico guarda só os nomes dos campos
  v_d := public.ops_client_data_get(v_cli);
  if v_d ->> 'owner_name' <> 'Maria' or (v_d ->> 'can_edit')::boolean is not true then raise exception 'dados/permissão errados: %', v_d; end if;
  perform public.ops_client_data_save(v_cli, '{"name":"Cliente teste 51.1","company":"Empresa 51.1 Ltda","owner_name":"Maria Souza",
            "cnpj":"12.abc.345/01de-35","phone":"(11) 98765-4321","email":"maria@exemplo.com.br"}'::jsonb);
  perform set_config('role', 'postgres', true);
  if (select owner_name from public.clients where id = v_cli) <> 'Maria Souza' then raise exception 'não salvou o responsável'; end if;
  if (select cnpj from public.clients where id = v_cli) <> '12ABC34501DE35' then raise exception 'CNPJ alfanumérico não foi aceito/limpo'; end if;
  if not exists (select 1 from public.ops_activity where client_id = v_cli and action = 'cliente.dados' and after -> 'campos' = '["CNPJ", "responsável"]'::jsonb) then
    raise exception 'histórico dos dados errado';
  end if;
  if exists (select 1 from public.ops_activity where client_id = v_cli and (after::text like '%Souza%' or after::text like '%98765%')) then
    raise exception 'valor pessoal foi para o histórico';
  end if;
  v_ok := v_ok + 1;

  -- 5) a ficha geral (que o MCP lê) não tem telefone, e-mail nem CNPJ
  perform set_config('role', 'authenticated', true);
  v_d := public.ops_client_get(v_cli);
  if v_d::text like '%98765%' or v_d::text like '%maria@%' then raise exception 'contato do cliente vazou na ficha geral'; end if;
  if (v_d -> 'can' ->> 'contact')::boolean is not true then raise exception 'AM sem permissão de registrar contato'; end if;
  v_ok := v_ok + 1;

  -- 6) contatos do onboarding: registra, ordena (mais recente primeiro), aparece no cartão, retira (só quem registrou ou admin)
  perform public.ops_client_onb_contact_add(v_cli, 'nao_atendeu', 'Liguei, não atendeu', now() - interval '2 hours');
  v_k := public.ops_client_onb_contact_add(v_cli, 'reagendado', 'Falei com a Maria, remarcamos para amanhã', now() - interval '1 hour');
  begin perform public.ops_client_onb_contact_add(v_cli, 'xx', 'teste', null); raise exception 'aceitou tipo inválido';
  exception when sqlstate '22023' then null; end;
  v_d := public.ops_client_get(v_cli);
  if v_d -> 'onboarding' -> 'contacts' -> 0 ->> 'kind' <> 'reagendado' or jsonb_array_length(v_d -> 'onboarding' -> 'contacts') <> 2 then
    raise exception 'ordem/contagem dos contatos errada: %', v_d -> 'onboarding' -> 'contacts';
  end if;
  v_b := public.ops_client_board('{}'::jsonb);
  if not exists (select 1 from jsonb_array_elements(v_b -> 'clients') c where c ->> 'client_id' = v_cli::text and c -> 'last_contact' ->> 'kind' = 'reagendado') then
    raise exception 'cartão sem último contato';
  end if;
  if (v_b -> 'can' ->> 'create_client')::boolean is not true then raise exception 'quadro não libera cadastro para o AM'; end if;
  perform public.ops_client_onb_contact_remove(v_k);
  if jsonb_array_length(public.ops_client_get(v_cli) -> 'onboarding' -> 'contacts') <> 1 then raise exception 'não retirou o contato'; end if;
  perform set_config('role', 'postgres', true);
  if (select removed_at from public.ops_client_onb_contacts where id = v_k) is null then raise exception 'retirar apagou em vez de marcar'; end if;
  v_ok := v_ok + 1;

  -- 7) observações: salva com controle de versão e guarda antes/depois no histórico
  perform set_config('role', 'authenticated', true);
  select version into v_ver from public.ops_client_ops where client_id = v_cli;
  v_ver := public.ops_client_onb_notes_save(v_cli, v_ver, 'Cliente prefere contato à tarde.');
  begin perform public.ops_client_onb_notes_save(v_cli, v_ver - 1, 'versão velha'); raise exception 'aceitou versão velha';
  exception when sqlstate '40001' then null; end;
  if public.ops_client_get(v_cli) -> 'onboarding' ->> 'notes' <> 'Cliente prefere contato à tarde.' then raise exception 'observações não salvas'; end if;
  perform set_config('role', 'postgres', true);
  if not exists (select 1 from public.ops_activity where client_id = v_cli and action = 'cliente.observacoes' and after ->> 'texto' like 'Cliente prefere%') then
    raise exception 'observações sem histórico';
  end if;
  v_ok := v_ok + 1;

  -- 8) resumo do Comercial: cliente vindo de lead mostra observações e contatos do lead (sem telefone/e-mail do lead)
  select id, client_id into v_lead, v_lead_cli from public.ops_leads where client_id is not null order by converted_at desc nulls last limit 1;
  if v_lead_cli is not null then
    perform set_config('role', 'authenticated', true);
    perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
    v_d := public.ops_client_get(v_lead_cli);
    if v_d -> 'onboarding' -> 'lead' is null or v_d -> 'onboarding' -> 'lead' = 'null'::jsonb then raise exception 'cliente do Comercial sem resumo do lead'; end if;
    if (v_d -> 'onboarding' -> 'lead') ? 'phone' or (v_d -> 'onboarding' -> 'lead') ? 'email' then raise exception 'resumo trouxe contato do lead'; end if;
    -- cliente cadastrado direto não tem lead
    if (public.ops_client_get(v_cli) -> 'onboarding' -> 'lead') <> 'null'::jsonb then raise exception 'cliente direto com lead'; end if;
  end if;
  v_ok := v_ok + 1;

  -- 9) a tabela de contatos não aceita gravação direta pelo site
  perform set_config('role', 'authenticated', true);
  begin
    insert into public.ops_client_onb_contacts (client_id, kind, body) values (v_cli, 'contato', 'direto');
    raise exception 'gravou direto na tabela';
  exception when insufficient_privilege then null; end;
  v_ok := v_ok + 1;

  raise exception 'R: % verificações OK', v_ok;
end;
$$;
