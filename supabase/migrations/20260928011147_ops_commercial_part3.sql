-- Etapa 36.4 (parte 3): telefone do lead no mesmo formato do cadastro de clientes
-- (só dígitos, com DDI; número brasileiro sem DDI ganha o "55"). Assim a
-- conversão em cliente e a busca de duplicados comparam do mesmo jeito.
create function private.ops_norm_phone(t text)
returns text language sql immutable set search_path = '' as $$
  select case
    when nullif(regexp_replace(coalesce(t, ''), '[^0-9]', '', 'g'), '') is null then null
    when btrim(t) like '+%' then regexp_replace(t, '[^0-9]', '', 'g')
    when char_length(regexp_replace(t, '[^0-9]', '', 'g')) in (10, 11) then '55' || regexp_replace(t, '[^0-9]', '', 'g')
    else regexp_replace(t, '[^0-9]', '', 'g') end
$$;
revoke all on function private.ops_norm_phone(text) from public, anon;
grant execute on function private.ops_norm_phone(text) to authenticated;

update public.ops_leads set phone = private.ops_norm_phone(phone) where phone is not null;

create or replace function private.ops_lead_save_impl(p_id uuid, p_version integer, p jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := p_id;
  v_old record;
  v_stage text;
  v_before jsonb;
  v_after jsonb;
  v_phone text := private.ops_norm_phone(p ->> 'phone');
  v_email text := nullif(lower(btrim(p ->> 'email')), '');
  v_cnpj text := nullif(upper(regexp_replace(coalesce(p ->> 'cnpj', ''), '[^0-9A-Za-z]', '', 'g')), '');
  v_state text := nullif(upper(btrim(p ->> 'state')), '');
  v_owner uuid := nullif(p ->> 'owner_id', '')::uuid;
  v_currency text := coalesce(nullif(upper(btrim(p ->> 'currency')), ''), 'BRL');
  v_private text[] := array['contato', 'telefone', 'email', 'cnpj'];
begin
  perform private.ops_need('ops.commercial');
  if char_length(btrim(coalesce(p ->> 'company_name', ''))) < 2 then raise exception 'Informe o nome da empresa.' using errcode = '22023'; end if;
  if v_phone is not null and v_phone !~ '^[0-9]{10,15}$' then raise exception 'Telefone: use DDD + número (10 a 15 dígitos).' using errcode = '22023'; end if;
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

create or replace function private.ops_lead_duplicates_impl(p jsonb)
returns jsonb language sql stable security definer set search_path = '' as $$
  with q as (
    select nullif(p ->> 'id', '')::uuid as id, private.ops_norm_name(p ->> 'company_name') as name,
           nullif(lower(btrim(p ->> 'email')), '') as email, private.ops_norm_phone(p ->> 'phone') as phone,
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
