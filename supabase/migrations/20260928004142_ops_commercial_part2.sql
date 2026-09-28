-- Etapa 36.4 (parte 2): funções do Kanban comercial.

-- -----------------------------------------------------------------------------
-- Possíveis duplicados (só avisa; nunca impede o cadastro)
-- p: {id, company_name, email, phone, cnpj}
-- -----------------------------------------------------------------------------
create function private.ops_lead_duplicates_impl(p jsonb)
returns jsonb language sql stable security definer set search_path = '' as $$
  with q as (
    select nullif(p ->> 'id', '')::uuid as id, private.ops_norm_name(p ->> 'company_name') as name,
           nullif(lower(btrim(p ->> 'email')), '') as email, nullif(regexp_replace(coalesce(p ->> 'phone', ''), '[^0-9]', '', 'g'), '') as phone,
           nullif(upper(regexp_replace(coalesce(p ->> 'cnpj', ''), '[^0-9A-Za-z]', '', 'g')), '') as cnpj
  )
  select case when not private.ops_can('ops.commercial') then null else jsonb_build_object(
    'leads', (select coalesce(jsonb_agg(x order by x ->> 'company_name'), '[]') from (
      select jsonb_build_object('id', l.id, 'number', l.number, 'company_name', l.company_name, 'stage_name', s.name,
        'archived', l.archived_at is not null,
        'reason', case when q.cnpj is not null and l.cnpj = q.cnpj then 'mesmo CNPJ'
                       when q.email is not null and lower(l.email) = q.email then 'mesmo e-mail'
                       when q.phone is not null and regexp_replace(coalesce(l.phone, ''), '[^0-9]', '', 'g') = q.phone then 'mesmo telefone'
                       when private.ops_norm_name(l.company_name) = q.name then 'mesmo nome'
                       else 'nome parecido' end) as x
        from public.ops_leads l join public.ops_lead_stages s on s.id = l.stage_id, q
       where l.id is distinct from q.id
         and ((q.cnpj is not null and l.cnpj = q.cnpj)
           or (q.email is not null and lower(l.email) = q.email)
           or (q.phone is not null and regexp_replace(coalesce(l.phone, ''), '[^0-9]', '', 'g') = q.phone)
           or (char_length(q.name) >= 3 and extensions.similarity(private.ops_norm_name(l.company_name), q.name) >= 0.6))
       limit 10) d),
    'clients', (select coalesce(jsonb_agg(x order by x ->> 'name'), '[]') from (
      select jsonb_build_object('id', c.id, 'name', c.name, 'status', c.status,
        'reason', case when q.cnpj is not null and c.cnpj = q.cnpj then 'mesmo CNPJ'
                       when q.email is not null and lower(c.email) = q.email then 'mesmo e-mail'
                       when q.phone is not null and regexp_replace(coalesce(c.phone, ''), '[^0-9]', '', 'g') = q.phone then 'mesmo telefone'
                       when private.ops_norm_name(c.name) = q.name or private.ops_norm_name(c.company) = q.name then 'mesmo nome'
                       else 'nome parecido' end) as x
        from public.clients c, q
       where not c.is_demo
         and ((q.cnpj is not null and c.cnpj = q.cnpj)
           or (q.email is not null and lower(c.email) = q.email)
           or (q.phone is not null and regexp_replace(coalesce(c.phone, ''), '[^0-9]', '', 'g') = q.phone)
           or (char_length(q.name) >= 3 and (extensions.similarity(private.ops_norm_name(c.name), q.name) >= 0.6
                                              or extensions.similarity(private.ops_norm_name(c.company), q.name) >= 0.6)))
       limit 10) d)) end
$$;
revoke all on function private.ops_lead_duplicates_impl(jsonb) from public, anon;
grant execute on function private.ops_lead_duplicates_impl(jsonb) to authenticated;
create function public.ops_lead_duplicates(p jsonb)
returns jsonb language sql stable set search_path = '' as $$ select private.ops_lead_duplicates_impl(p) $$;
revoke all on function public.ops_lead_duplicates(jsonb) from public, anon;
grant execute on function public.ops_lead_duplicates(jsonb) to authenticated;

-- -----------------------------------------------------------------------------
-- Criar / editar lead
-- p: {company_name, contact_name, phone, email, cnpj, segment, city, state, origin, service_interest,
--     owner_id, notes, potential_value, currency, priority, entered_at, next_action, next_action_date, stage_id (só ao criar)}
-- -----------------------------------------------------------------------------
create function private.ops_lead_save_impl(p_id uuid, p_version integer, p jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := p_id;
  v_old record;
  v_stage text;
  v_before jsonb;
  v_after jsonb;
  v_phone text := nullif(regexp_replace(coalesce(p ->> 'phone', ''), '[^0-9+]', '', 'g'), '');
  v_email text := nullif(lower(btrim(p ->> 'email')), '');
  v_cnpj text := nullif(upper(regexp_replace(coalesce(p ->> 'cnpj', ''), '[^0-9A-Za-z]', '', 'g')), '');
  v_state text := nullif(upper(btrim(p ->> 'state')), '');
  v_owner uuid := nullif(p ->> 'owner_id', '')::uuid;
  v_currency text := coalesce(nullif(upper(btrim(p ->> 'currency')), ''), 'BRL');
  v_private text[] := array['contato', 'telefone', 'email', 'cnpj'];
begin
  perform private.ops_need('ops.commercial');
  if char_length(btrim(coalesce(p ->> 'company_name', ''))) < 2 then raise exception 'Informe o nome da empresa.' using errcode = '22023'; end if;
  if v_phone is not null and v_phone !~ '^\+?[0-9]{10,15}$' then raise exception 'Telefone: use DDD + número (10 a 15 dígitos).' using errcode = '22023'; end if;
  if v_email is not null and v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'E-mail inválido.' using errcode = '22023'; end if;
  if v_cnpj is not null and not private.is_valid_cnpj(v_cnpj) then raise exception 'CNPJ inválido.' using errcode = '22023'; end if;
  if v_state is not null and v_state !~ '^[A-Z]{2}$' then raise exception 'Estado: use a sigla (ex.: SP).' using errcode = '22023'; end if;
  if v_currency not in ('BRL', 'USD', 'EUR') then raise exception 'Moeda inválida.' using errcode = '22023'; end if;
  if nullif(p ->> 'potential_value', '') is not null and (p ->> 'potential_value')::numeric < 0 then
    raise exception 'O valor potencial não pode ser negativo.' using errcode = '22023';
  end if;
  if v_owner is not null and not private.ops_member_ok(v_owner) then
    raise exception 'O responsável comercial precisa estar ativo na Central.' using errcode = '22023';
  end if;
  if nullif(p ->> 'next_action_date', '') is not null and nullif(btrim(p ->> 'next_action'), '') is null then
    raise exception 'Escreva qual é a próxima ação.' using errcode = '22023';
  end if;

  if p_id is null then
    v_stage := coalesce(nullif(p ->> 'stage_id', ''), (select id from public.ops_lead_stages where active and category = 'aberto' order by position limit 1));
    if not exists (select 1 from public.ops_lead_stages where id = v_stage and active and category = 'aberto') then
      raise exception 'Um lead novo entra numa etapa em aberto.' using errcode = '22023';
    end if;
    insert into public.ops_leads (company_name, contact_name, phone, email, cnpj, segment, city, state, origin, service_interest, owner_id, notes,
                                  potential_value, currency, priority, entered_at, next_action, next_action_date, stage_id, created_by, updated_by)
    values (btrim(p ->> 'company_name'), nullif(btrim(p ->> 'contact_name'), ''), v_phone, v_email, v_cnpj, nullif(btrim(p ->> 'segment'), ''),
            nullif(btrim(p ->> 'city'), ''), v_state, nullif(btrim(p ->> 'origin'), ''), nullif(btrim(p ->> 'service_interest'), ''), v_owner,
            nullif(btrim(p ->> 'notes'), ''), nullif(p ->> 'potential_value', '')::numeric, v_currency, coalesce(nullif(p ->> 'priority', ''), 'media'),
            coalesce(nullif(p ->> 'entered_at', '')::date, (now() at time zone 'America/Sao_Paulo')::date),
            nullif(btrim(p ->> 'next_action'), ''), nullif(p ->> 'next_action_date', '')::date, v_stage, (select auth.uid()), (select auth.uid()))
    returning id into v_id;
    perform private.ops_lead_log(v_id, 'lead.criado', null, jsonb_build_object('empresa', btrim(p ->> 'company_name'), 'etapa', v_stage, 'responsavel', v_owner));
  else
    select * into v_old from public.ops_leads where id = p_id;
    if v_old.id is null then raise exception 'Lead não encontrado.' using errcode = '22023'; end if;
    if v_old.archived_at is not null then raise exception 'Lead arquivado: desarquive para editar.' using errcode = '22023'; end if;
    if v_old.version <> coalesce(p_version, -1) then
      raise exception 'Alguém alterou este lead antes de você. Recarregue para ver a versão atual.' using errcode = '40001';
    end if;
    v_before := private.ops_lead_snapshot(p_id);
    update public.ops_leads set
      company_name = btrim(p ->> 'company_name'), contact_name = nullif(btrim(p ->> 'contact_name'), ''), phone = v_phone, email = v_email, cnpj = v_cnpj,
      segment = nullif(btrim(p ->> 'segment'), ''), city = nullif(btrim(p ->> 'city'), ''), state = v_state, origin = nullif(btrim(p ->> 'origin'), ''),
      service_interest = nullif(btrim(p ->> 'service_interest'), ''), owner_id = v_owner, notes = nullif(btrim(p ->> 'notes'), ''),
      potential_value = nullif(p ->> 'potential_value', '')::numeric, currency = v_currency, priority = coalesce(nullif(p ->> 'priority', ''), priority),
      entered_at = coalesce(nullif(p ->> 'entered_at', '')::date, entered_at), next_action = nullif(btrim(p ->> 'next_action'), ''),
      next_action_date = nullif(p ->> 'next_action_date', '')::date, version = version + 1, updated_by = (select auth.uid())
     where id = p_id;
    v_after := private.ops_lead_snapshot(p_id);
    if v_after is distinct from v_before then
      -- Dados de contato: só "alterado", nunca o valor.
      perform private.ops_lead_log(p_id, 'lead.editado',
        (select jsonb_object_agg(k, case when k = any(v_private) then null else v_before -> k end) from jsonb_object_keys(v_before) k
          where v_before -> k is distinct from v_after -> k),
        (select jsonb_object_agg(k, case when k = any(v_private) then to_jsonb('alterado'::text) else v_after -> k end) from jsonb_object_keys(v_after) k
          where v_before -> k is distinct from v_after -> k));
    end if;
    if v_owner is distinct from v_old.owner_id then
      perform private.ops_lead_log(p_id, 'lead.responsavel', jsonb_build_object('responsavel', v_old.owner_id), jsonb_build_object('responsavel', v_owner));
    end if;
  end if;
  return v_id;
end;
$$;
revoke all on function private.ops_lead_save_impl(uuid, integer, jsonb) from public, anon;
grant execute on function private.ops_lead_save_impl(uuid, integer, jsonb) to authenticated;
create function public.ops_lead_save(p_id uuid, p_version integer, p jsonb)
returns uuid language sql set search_path = '' as $$ select private.ops_lead_save_impl(p_id, p_version, p) $$;
revoke all on function public.ops_lead_save(uuid, integer, jsonb) from public, anon;
grant execute on function public.ops_lead_save(uuid, integer, jsonb) to authenticated;

-- -----------------------------------------------------------------------------
-- Mudar de coluna (com as regras de transição)
-- -----------------------------------------------------------------------------
create function private.ops_lead_move_impl(p_id uuid, p_version integer, p_stage text, p_loss_reason text, p_loss_note text)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_l record;
  v_from record;
  v_to record;
  v_prev text;
begin
  perform private.ops_need('ops.commercial');
  select * into v_l from public.ops_leads where id = p_id;
  if v_l.id is null then raise exception 'Lead não encontrado.' using errcode = '22023'; end if;
  if v_l.archived_at is not null then raise exception 'Lead arquivado: desarquive para mover.' using errcode = '22023'; end if;
  if v_l.version <> coalesce(p_version, -1) then
    raise exception 'Alguém alterou este lead antes de você. Recarregue para ver a versão atual.' using errcode = '40001';
  end if;
  select * into v_from from public.ops_lead_stages where id = v_l.stage_id;
  select * into v_to from public.ops_lead_stages where id = p_stage and active;
  if v_to.id is null then raise exception 'Escolha uma etapa ativa.' using errcode = '22023'; end if;
  if v_to.id = v_from.id then return v_l.version; end if;
  if v_l.client_id is not null and v_to.category <> 'ganho' then
    raise exception 'Este lead já virou cliente: ele fica na etapa de contrato pago.' using errcode = '22023';
  end if;
  if v_to.category = 'perdido' then
    if not exists (select 1 from public.ops_loss_reasons where id = p_loss_reason and active) then
      raise exception 'Escolha o motivo da perda.' using errcode = '22023';
    end if;
  end if;
  -- Regra: só entra vindo da etapa imediatamente anterior (para trás é livre).
  if v_to.require_previous and v_to.position > v_from.position then
    select id into v_prev from public.ops_lead_stages where active and position < v_to.position order by position desc limit 1;
    if v_prev is distinct from v_from.id then
      raise exception '"%" só recebe leads vindos da etapa anterior. Siga as etapas em ordem.', v_to.name using errcode = '22023';
    end if;
  end if;
  -- Regra: exige próxima ação com data.
  if v_to.require_next_action and v_to.category = 'aberto' and (v_l.next_action is null or v_l.next_action_date is null) then
    raise exception 'Para entrar em "%", preencha a próxima ação e a data dela.', v_to.name using errcode = '22023';
  end if;
  update public.ops_leads set
    stage_id = v_to.id, stage_since = now(), version = version + 1, updated_by = (select auth.uid()),
    loss_reason_id = case when v_to.category = 'perdido' then p_loss_reason end,
    loss_note = case when v_to.category = 'perdido' then nullif(btrim(p_loss_note), '') end,
    lost_at = case when v_to.category = 'perdido' then now() end
   where id = p_id;
  perform private.ops_lead_log(p_id, 'lead.etapa', jsonb_build_object('etapa', v_from.id),
    jsonb_build_object('etapa', v_to.id) || case when v_to.category = 'perdido'
      then jsonb_build_object('motivo', p_loss_reason, 'observacao', nullif(btrim(p_loss_note), '')) else '{}'::jsonb end);
  return v_l.version + 1;
end;
$$;
revoke all on function private.ops_lead_move_impl(uuid, integer, text, text, text) from public, anon;
grant execute on function private.ops_lead_move_impl(uuid, integer, text, text, text) to authenticated;
create function public.ops_lead_move(p_id uuid, p_version integer, p_stage text, p_loss_reason text default null, p_loss_note text default null)
returns integer language sql set search_path = '' as $$ select private.ops_lead_move_impl(p_id, p_version, p_stage, p_loss_reason, p_loss_note) $$;
revoke all on function public.ops_lead_move(uuid, integer, text, text, text) from public, anon;
grant execute on function public.ops_lead_move(uuid, integer, text, text, text) to authenticated;

-- Registrar contato, reunião, proposta, contrato ou observação.
create function private.ops_lead_note_add_impl(p_lead uuid, p_kind text, p_body text, p_happened_at timestamptz)
returns bigint language plpgsql security definer set search_path = '' as $$
declare
  v_id bigint;
begin
  perform private.ops_need('ops.commercial');
  if not exists (select 1 from public.ops_leads where id = p_lead) then raise exception 'Lead não encontrado.' using errcode = '22023'; end if;
  if p_kind not in ('contato', 'reuniao', 'proposta', 'contrato', 'observacao') then raise exception 'Tipo de registro inválido.' using errcode = '22023'; end if;
  if char_length(btrim(coalesce(p_body, ''))) < 2 then raise exception 'Escreva o que aconteceu.' using errcode = '22023'; end if;
  insert into public.ops_lead_events (lead_id, action, kind, body, happened_at, actor_id)
  values (p_lead, 'lead.interacao', p_kind, btrim(p_body), coalesce(p_happened_at, now()), (select auth.uid()))
  returning id into v_id;
  update public.ops_leads set last_interaction_at = greatest(coalesce(last_interaction_at, '-infinity'), coalesce(p_happened_at, now()))
   where id = p_lead;
  return v_id;
end;
$$;
revoke all on function private.ops_lead_note_add_impl(uuid, text, text, timestamptz) from public, anon;
grant execute on function private.ops_lead_note_add_impl(uuid, text, text, timestamptz) to authenticated;
create function public.ops_lead_note_add(p_lead uuid, p_kind text, p_body text, p_happened_at timestamptz default null)
returns bigint language sql set search_path = '' as $$ select private.ops_lead_note_add_impl(p_lead, p_kind, p_body, p_happened_at) $$;
revoke all on function public.ops_lead_note_add(uuid, text, text, timestamptz) from public, anon;
grant execute on function public.ops_lead_note_add(uuid, text, text, timestamptz) to authenticated;

create function private.ops_lead_archive_impl(p_id uuid, p_archived boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_l record;
begin
  perform private.ops_need('ops.commercial');
  select * into v_l from public.ops_leads where id = p_id;
  if v_l.id is null then raise exception 'Lead não encontrado.' using errcode = '22023'; end if;
  if (v_l.archived_at is not null) = p_archived then return; end if;
  update public.ops_leads set archived_at = case when p_archived then now() end, version = version + 1, updated_by = (select auth.uid()) where id = p_id;
  perform private.ops_lead_log(p_id, case when p_archived then 'lead.arquivado' else 'lead.desarquivado' end, null, null);
end;
$$;
revoke all on function private.ops_lead_archive_impl(uuid, boolean) from public, anon;
grant execute on function private.ops_lead_archive_impl(uuid, boolean) to authenticated;
create function public.ops_lead_archive(p_id uuid, p_archived boolean)
returns void language sql set search_path = '' as $$ select private.ops_lead_archive_impl(p_id, p_archived) $$;
revoke all on function public.ops_lead_archive(uuid, boolean) from public, anon;
grant execute on function public.ops_lead_archive(uuid, boolean) to authenticated;

-- -----------------------------------------------------------------------------
-- Converter em cliente: vincula a um cliente existente OU cria (sem duplicar).
-- Criar cliente segue a regra atual do cadastro: só admin e gestor.
-- -----------------------------------------------------------------------------
create function private.ops_lead_convert_impl(p_lead uuid, p_version integer, p_client uuid, p_start boolean, p_am uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_l record;
  v_client uuid := p_client;
  v_created boolean := false;
  v_onboarding text := 'nao';
  v_dup text;
begin
  perform private.ops_need('ops.commercial');
  select l.*, s.category into v_l from public.ops_leads l join public.ops_lead_stages s on s.id = l.stage_id where l.id = p_lead;
  if v_l.id is null then raise exception 'Lead não encontrado.' using errcode = '22023'; end if;
  if v_l.version <> coalesce(p_version, -1) then
    raise exception 'Alguém alterou este lead antes de você. Recarregue para ver a versão atual.' using errcode = '40001';
  end if;
  if v_l.archived_at is not null then raise exception 'Lead arquivado: desarquive para converter.' using errcode = '22023'; end if;
  if v_l.category <> 'ganho' then raise exception 'Só dá para converter quando o lead chega em Contrato Pago.' using errcode = '22023'; end if;
  if v_l.client_id is not null then raise exception 'Este lead já foi convertido em cliente.' using errcode = '22023'; end if;
  if p_start and not private.ops_can_manage_clients() then
    raise exception 'Iniciar o onboarding exige as permissões "Ver a ficha operacional dos clientes" e "Atribuir responsáveis".' using errcode = '42501';
  end if;

  if v_client is not null then
    if not exists (select 1 from public.clients where id = v_client and not is_demo) then raise exception 'Cliente não encontrado.' using errcode = '22023'; end if;
  else
    if private.current_user_role() not in ('admin', 'gestor') then
      raise exception 'Criar um cliente novo é só para administrador ou gestor. Peça a um deles, ou vincule a um cliente já cadastrado.' using errcode = '42501';
    end if;
    select c.name into v_dup from public.clients c
     where (v_l.cnpj is not null and c.cnpj = v_l.cnpj)
        or private.ops_norm_name(c.name) = private.ops_norm_name(v_l.company_name)
        or private.ops_norm_name(c.company) = private.ops_norm_name(v_l.company_name)
     limit 1;
    if v_dup is not null then
      raise exception 'Já existe o cliente "%" com este nome ou CNPJ. Vincule o lead a ele em vez de criar outro.', v_dup using errcode = '22023';
    end if;
    insert into public.clients (name, company, cnpj, owner_name, phone, email, notes, status)
    values (left(btrim(v_l.company_name), 120), left(v_l.company_name, 160), v_l.cnpj, left(v_l.contact_name, 120), v_l.phone, v_l.email,
            'Convertido do lead comercial #' || v_l.number || '.', 'ativo')
    returning id into v_client;
    v_created := true;
  end if;

  update public.ops_leads set client_id = v_client, converted_at = now(), converted_by = (select auth.uid()), version = version + 1,
         updated_by = (select auth.uid()) where id = p_lead;

  if p_start then
    if exists (select 1 from public.ops_client_ops where client_id = v_client) then
      v_onboarding := 'ja_estava';
    else
      perform private.ops_client_start_impl(v_client, null, p_am);
      v_onboarding := 'iniciado';
    end if;
  end if;

  perform private.ops_lead_log(p_lead, 'lead.convertido', null,
    jsonb_build_object('cliente', v_client, 'novo', v_created, 'onboarding', v_onboarding));
  perform private.ops_log(null, v_client, 'cliente.convertido', null,
    jsonb_build_object('lead', v_l.number, 'empresa', v_l.company_name, 'novo', v_created));
  return jsonb_build_object('client_id', v_client, 'created', v_created, 'onboarding', v_onboarding);
end;
$$;
revoke all on function private.ops_lead_convert_impl(uuid, integer, uuid, boolean, uuid) from public, anon;
grant execute on function private.ops_lead_convert_impl(uuid, integer, uuid, boolean, uuid) to authenticated;
create function public.ops_lead_convert(p_lead uuid, p_version integer, p_client uuid default null, p_start boolean default false, p_am uuid default null)
returns jsonb language sql set search_path = '' as $$ select private.ops_lead_convert_impl(p_lead, p_version, p_client, p_start, p_am) $$;
revoke all on function public.ops_lead_convert(uuid, integer, uuid, boolean, uuid) from public, anon;
grant execute on function public.ops_lead_convert(uuid, integer, uuid, boolean, uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- Leitura: quadro e detalhe
-- f: {q, owner_id, origin, priority, overdue, archived}
-- -----------------------------------------------------------------------------
create function private.ops_lead_board_impl(f jsonb)
returns jsonb language sql stable security definer set search_path = '' as $$
  with today as (select (now() at time zone 'America/Sao_Paulo')::date as d)
  select case when not private.ops_can('ops.commercial') then null else jsonb_build_object(
    'leads', (select coalesce(jsonb_agg(jsonb_build_object(
                'id', l.id, 'number', l.number, 'company_name', l.company_name, 'contact_name', l.contact_name, 'segment', l.segment,
                'owner_id', l.owner_id, 'owner_name', po.full_name, 'entered_at', l.entered_at, 'last_interaction_at', l.last_interaction_at,
                'next_action', l.next_action, 'next_action_date', l.next_action_date, 'priority', l.priority, 'potential_value', l.potential_value,
                'currency', l.currency, 'origin', l.origin, 'stage_id', l.stage_id, 'version', l.version, 'client_id', l.client_id,
                'archived_at', l.archived_at, 'loss_reason', lr.name,
                'overdue', s.category = 'aberto' and l.next_action_date < (select d from today)) order by l.next_action_date nulls last, l.number desc), '[]')
                from public.ops_leads l
                join public.ops_lead_stages s on s.id = l.stage_id
                left join public.profiles po on po.id = l.owner_id
                left join public.ops_loss_reasons lr on lr.id = l.loss_reason_id
               where (case when coalesce((f ->> 'archived')::boolean, false) then l.archived_at is not null else l.archived_at is null end)
                 and (nullif(f ->> 'q', '') is null or private.search_norm(l.company_name) like '%' || private.search_norm(f ->> 'q') || '%'
                      or private.search_norm(l.contact_name) like '%' || private.search_norm(f ->> 'q') || '%'
                      or private.search_norm(l.segment) like '%' || private.search_norm(f ->> 'q') || '%'
                      or l.number::text = ltrim(f ->> 'q', '#'))
                 and (nullif(f ->> 'owner_id', '') is null or (f ->> 'owner_id' = 'nenhum' and l.owner_id is null) or l.owner_id::text = f ->> 'owner_id')
                 and (nullif(f ->> 'origin', '') is null or l.origin = f ->> 'origin')
                 and (nullif(f ->> 'priority', '') is null or l.priority = f ->> 'priority')
                 and (not coalesce((f ->> 'overdue')::boolean, false) or (s.category = 'aberto' and l.next_action_date < (select d from today)))),
    'origins', (select coalesce(jsonb_agg(distinct l.origin), '[]') from public.ops_leads l where l.origin is not null),
    'can', jsonb_build_object('create_client', private.current_user_role() in ('admin', 'gestor'), 'onboarding', private.ops_can_manage_clients()))
  end
$$;
revoke all on function private.ops_lead_board_impl(jsonb) from public, anon;
grant execute on function private.ops_lead_board_impl(jsonb) to authenticated;
create function public.ops_lead_board(f jsonb default '{}')
returns jsonb language sql stable set search_path = '' as $$ select private.ops_lead_board_impl(f) $$;
revoke all on function public.ops_lead_board(jsonb) from public, anon;
grant execute on function public.ops_lead_board(jsonb) to authenticated;

create function private.ops_lead_get_impl(p_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select case when not private.ops_can('ops.commercial') then null else (
    select jsonb_build_object(
      'lead', to_jsonb(l) || jsonb_build_object('owner_name', po.full_name, 'stage_name', s.name, 'stage_color', s.color, 'category', s.category,
                                                'loss_reason', lr.name, 'client_name', c.name, 'converted_by_name', pc.full_name,
                                                'created_by_name', pcr.full_name,
                                                'overdue', s.category = 'aberto' and l.next_action_date < (now() at time zone 'America/Sao_Paulo')::date),
      'events', (select coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'action', e.action, 'kind', e.kind, 'body', e.body, 'happened_at', e.happened_at,
                   'actor', pe.full_name, 'origin', e.origin, 'before', e.before, 'after', e.after, 'created_at', e.created_at)
                   order by coalesce(e.happened_at, e.created_at) desc, e.id desc), '[]')
                   from public.ops_lead_events e left join public.profiles pe on pe.id = e.actor_id where e.lead_id = l.id),
      'can', jsonb_build_object('create_client', private.current_user_role() in ('admin', 'gestor'), 'onboarding', private.ops_can_manage_clients(),
                                'client_ops', l.client_id is not null and private.ops_client_visible(l.client_id)))
      from public.ops_leads l
      join public.ops_lead_stages s on s.id = l.stage_id
      left join public.profiles po on po.id = l.owner_id
      left join public.ops_loss_reasons lr on lr.id = l.loss_reason_id
      left join public.clients c on c.id = l.client_id
      left join public.profiles pc on pc.id = l.converted_by
      left join public.profiles pcr on pcr.id = l.created_by
     where l.id = p_id) end
$$;
revoke all on function private.ops_lead_get_impl(uuid) from public, anon;
grant execute on function private.ops_lead_get_impl(uuid) to authenticated;
create function public.ops_lead_get(p_id uuid)
returns jsonb language sql stable set search_path = '' as $$ select private.ops_lead_get_impl(p_id) $$;
revoke all on function public.ops_lead_get(uuid) from public, anon;
grant execute on function public.ops_lead_get(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- Configurações (só admin): colunas comerciais e motivos de perda
-- -----------------------------------------------------------------------------
create function private.ops_lead_stage_save_impl(p_id text, p_name text, p_color text, p_category text, p_require_previous boolean, p_require_next_action boolean)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_id text := p_id;
  v_before jsonb;
begin
  perform private.ops_require_admin();
  if p_category not in ('aberto', 'ganho', 'perdido') then raise exception 'Grupo inválido.' using errcode = '22023'; end if;
  if exists (select 1 from public.ops_lead_stages where lower(btrim(name)) = lower(btrim(p_name)) and id is distinct from p_id) then
    raise exception 'Já existe uma coluna com esse nome.' using errcode = '22023';
  end if;
  if p_id is null then
    insert into public.ops_lead_stages (name, color, category, require_previous, require_next_action, position, updated_by)
    values (btrim(p_name), p_color, p_category, coalesce(p_require_previous, false), coalesce(p_require_next_action, false),
            coalesce((select max(position) from public.ops_lead_stages), 0) + 1, (select auth.uid()))
    returning id into v_id;
  else
    select to_jsonb(s) into v_before from public.ops_lead_stages s where id = p_id;
    if v_before is null then raise exception 'Coluna não encontrada.' using errcode = '22023'; end if;
    if p_category is distinct from v_before ->> 'category' and exists (select 1 from public.ops_leads where stage_id = p_id) then
      raise exception 'Esta coluna já tem leads: o grupo não pode mudar. Crie uma coluna nova.' using errcode = '22023';
    end if;
    update public.ops_lead_stages set name = btrim(p_name), color = p_color, category = p_category,
           require_previous = coalesce(p_require_previous, false), require_next_action = coalesce(p_require_next_action, false),
           updated_at = now(), updated_by = (select auth.uid()) where id = p_id;
  end if;
  insert into public.audit_logs (actor_id, action, target_type, target_id, details)
  values ((select auth.uid()), case when p_id is null then 'ops.lead_stage.create' else 'ops.lead_stage.update' end, 'ops_lead_stage', v_id,
          jsonb_build_object('antes', v_before, 'depois', jsonb_build_object('nome', btrim(p_name), 'cor', p_color, 'grupo', p_category,
            'so_da_anterior', coalesce(p_require_previous, false), 'exige_proxima_acao', coalesce(p_require_next_action, false))));
  return v_id;
end;
$$;
revoke all on function private.ops_lead_stage_save_impl(text, text, text, text, boolean, boolean) from public, anon;
grant execute on function private.ops_lead_stage_save_impl(text, text, text, text, boolean, boolean) to authenticated;
create function public.ops_lead_stage_save(p_id text, p_name text, p_color text, p_category text, p_require_previous boolean, p_require_next_action boolean)
returns text language sql set search_path = '' as $$
  select private.ops_lead_stage_save_impl(p_id, p_name, p_color, p_category, p_require_previous, p_require_next_action) $$;
revoke all on function public.ops_lead_stage_save(text, text, text, text, boolean, boolean) from public, anon;
grant execute on function public.ops_lead_stage_save(text, text, text, text, boolean, boolean) to authenticated;

create function private.ops_lead_stage_reorder_impl(p_ids text[])
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.ops_require_admin();
  update public.ops_lead_stages s set position = o.ord, updated_at = now(), updated_by = (select auth.uid())
    from unnest(p_ids) with ordinality as o(id, ord) where s.id = o.id;
  insert into public.audit_logs (actor_id, action, target_type, target_id, details)
  values ((select auth.uid()), 'ops.lead_stage.reorder', 'ops_lead_stage', null, jsonb_build_object('ordem', to_jsonb(p_ids)));
end;
$$;
revoke all on function private.ops_lead_stage_reorder_impl(text[]) from public, anon;
grant execute on function private.ops_lead_stage_reorder_impl(text[]) to authenticated;
create function public.ops_lead_stage_reorder(p_ids text[])
returns void language sql set search_path = '' as $$ select private.ops_lead_stage_reorder_impl(p_ids) $$;
revoke all on function public.ops_lead_stage_reorder(text[]) from public, anon;
grant execute on function public.ops_lead_stage_reorder(text[]) to authenticated;

-- Desativar coluna com leads: vão para outra coluna do MESMO grupo (perdidos continuam perdidos).
create function private.ops_lead_stage_set_active_impl(p_id text, p_active boolean, p_move_to text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_s record;
  v_count integer;
begin
  perform private.ops_require_admin();
  select * into v_s from public.ops_lead_stages where id = p_id;
  if v_s.id is null then raise exception 'Coluna não encontrada.' using errcode = '22023'; end if;
  if not p_active then
    if not exists (select 1 from public.ops_lead_stages where active and category = 'aberto' and id <> p_id) then
      raise exception 'Precisa haver pelo menos uma coluna em aberto ativa.' using errcode = '22023';
    end if;
    select count(*) into v_count from public.ops_leads where stage_id = p_id;
    if v_count > 0 then
      if p_move_to is null or p_move_to = p_id
         or not exists (select 1 from public.ops_lead_stages where id = p_move_to and active and category = v_s.category) then
        raise exception 'Há % lead(s) nesta coluna. Escolha outra coluna do mesmo grupo para eles antes de desativar.', v_count using errcode = '22023';
      end if;
      insert into public.ops_lead_events (lead_id, action, actor_id, origin, before, after)
      select l.id, 'lead.etapa', (select auth.uid()), 'sistema', jsonb_build_object('etapa', p_id),
             jsonb_build_object('etapa', p_move_to, 'regra', 'Coluna desativada pelo administrador')
        from public.ops_leads l where l.stage_id = p_id;
      update public.ops_leads set stage_id = p_move_to, stage_since = now(), version = version + 1 where stage_id = p_id;
    end if;
  end if;
  update public.ops_lead_stages set active = p_active, updated_at = now(), updated_by = (select auth.uid()) where id = p_id;
  insert into public.audit_logs (actor_id, action, target_type, target_id, details)
  values ((select auth.uid()), 'ops.lead_stage.active', 'ops_lead_stage', p_id,
          jsonb_build_object('ativo', p_active, 'leads_movidos', coalesce(v_count, 0), 'destino', p_move_to));
end;
$$;
revoke all on function private.ops_lead_stage_set_active_impl(text, boolean, text) from public, anon;
grant execute on function private.ops_lead_stage_set_active_impl(text, boolean, text) to authenticated;
create function public.ops_lead_stage_set_active(p_id text, p_active boolean, p_move_to text default null)
returns void language sql set search_path = '' as $$ select private.ops_lead_stage_set_active_impl(p_id, p_active, p_move_to) $$;
revoke all on function public.ops_lead_stage_set_active(text, boolean, text) from public, anon;
grant execute on function public.ops_lead_stage_set_active(text, boolean, text) to authenticated;

create function private.ops_loss_reason_save_impl(p_id text, p_name text, p_active boolean)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_id text := p_id;
begin
  perform private.ops_require_admin();
  if exists (select 1 from public.ops_loss_reasons where lower(btrim(name)) = lower(btrim(p_name)) and id is distinct from p_id) then
    raise exception 'Já existe um motivo com esse nome.' using errcode = '22023';
  end if;
  if p_id is null then
    insert into public.ops_loss_reasons (name, position) values (btrim(p_name), coalesce((select max(position) from public.ops_loss_reasons), 0) + 1)
    returning id into v_id;
  else
    update public.ops_loss_reasons set name = btrim(p_name), active = coalesce(p_active, active) where id = p_id;
    if not found then raise exception 'Motivo não encontrado.' using errcode = '22023'; end if;
  end if;
  insert into public.audit_logs (actor_id, action, target_type, target_id, details)
  values ((select auth.uid()), case when p_id is null then 'ops.loss_reason.create' else 'ops.loss_reason.update' end, 'ops_loss_reason', v_id,
          jsonb_build_object('nome', btrim(p_name), 'ativo', coalesce(p_active, true)));
  return v_id;
end;
$$;
revoke all on function private.ops_loss_reason_save_impl(text, text, boolean) from public, anon;
grant execute on function private.ops_loss_reason_save_impl(text, text, boolean) to authenticated;
create function public.ops_loss_reason_save(p_id text, p_name text, p_active boolean default true)
returns text language sql set search_path = '' as $$ select private.ops_loss_reason_save_impl(p_id, p_name, p_active) $$;
revoke all on function public.ops_loss_reason_save(text, text, boolean) from public, anon;
grant execute on function public.ops_loss_reason_save(text, text, boolean) to authenticated;
