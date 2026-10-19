-- =============================================================================
-- Parâmetros da planilha refeitos (pedido do Ander, 19/10/2026) — Inteligência de Resultados.
-- Novos campos para escolher a coluna: Nome, utm_source, utm_medium, gclid e fbclid,
-- além dos que já existiam (Número, SQL, Data, utm_campaign/content/term, IDs).
-- Parâmetros personalizados: chave "x:<nome>" no mapeamento (até 20 por planilha).
-- Continua SEM guardar dados pessoais: o Nome só é reconhecido, nunca guardado; o
-- Número continua virando só a impressão digital (hash). Nenhuma tabela nova.
-- =============================================================================

create or replace function private.ri_mapping_fields()
returns text[]
language sql
immutable
set search_path = ''
as $$ select array['record_id', 'contact_date', 'contact_key', 'contact_name', 'profile', 'account_id',
                   'utm_source', 'utm_medium', 'campaign_id', 'campaign_name', 'adset_id', 'adset_name', 'ad_id', 'ad_name',
                   'gclid', 'fbclid', 'status', 'sale_date', 'sale_value'] $$;

create or replace function private.ri_source_save_impl(
  p_id uuid, p_client_id uuid, p_spreadsheet_id text, p_spreadsheet_title text, p_sheet_name text,
  p_header_row integer, p_mapping jsonb, p_profile_rules jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_client uuid;
  v_key text;
  v_val jsonb;
begin
  v_client := coalesce((select client_id from public.ri_sources where id = p_id), p_client_id);
  if p_id is not null and not exists (select 1 from public.ri_sources where id = p_id) then
    raise exception 'Planilha não encontrada.' using errcode = '22023';
  end if;
  if v_client is null or not private.can_edit_client(v_client) then
    raise exception 'Sem permissão para configurar a planilha deste cliente.' using errcode = '42501';
  end if;
  if p_spreadsheet_id is null or p_spreadsheet_id !~ '^[A-Za-z0-9_-]{20,100}$' then
    raise exception 'Link ou ID da planilha inválido.' using errcode = '22023';
  end if;
  if coalesce(btrim(p_sheet_name), '') = '' or char_length(p_sheet_name) > 100 then
    raise exception 'Escolha a aba da planilha.' using errcode = '22023';
  end if;
  if p_header_row is null or p_header_row not between 1 and 50 then
    raise exception 'A linha do cabeçalho deve ficar entre 1 e 50.' using errcode = '22023';
  end if;
  if p_mapping is null or jsonb_typeof(p_mapping) <> 'object' then
    raise exception 'Mapeamento inválido.' using errcode = '22023';
  end if;
  for v_key, v_val in select * from jsonb_each(p_mapping) loop
    -- campos do CRM ou parâmetros personalizados ("x:" + nome dado pelo Ander, até 40 letras)
    if not (v_key = any (private.ri_mapping_fields()) or v_key ~ '^x:[^[:space:]].{0,39}$')
       or jsonb_typeof(v_val) <> 'string' or char_length(v_val #>> '{}') not between 1 and 200 then
      raise exception 'Mapeamento inválido (campo %).', left(v_key, 50) using errcode = '22023';
    end if;
  end loop;
  if (select count(*) from jsonb_object_keys(p_mapping) k where k like 'x:%') > 20 then
    raise exception 'Parâmetros personalizados demais (máximo 20).' using errcode = '22023';
  end if;
  if coalesce(p_mapping ->> 'profile', '') = '' then
    raise exception 'Escolha a coluna SQL (perfil: lojista, sacoleiro ou consumidor final).' using errcode = '22023';
  end if;
  if p_profile_rules is null or jsonb_typeof(p_profile_rules) <> 'object' then
    raise exception 'Regras dos perfis inválidas.' using errcode = '22023';
  end if;
  if (select count(*) from jsonb_object_keys(p_profile_rules)) > 500 then
    raise exception 'Regras demais (máximo 500 valores).' using errcode = '22023';
  end if;
  for v_key, v_val in select * from jsonb_each(p_profile_rules) loop
    if char_length(v_key) not between 1 and 200
       or jsonb_typeof(v_val) <> 'string'
       or (v_val #>> '{}') not in ('lojista', 'sacoleiro', 'consumidor_final', 'nao_identificado') then
      raise exception 'Regra de perfil inválida (%).', left(v_key, 50) using errcode = '22023';
    end if;
  end loop;

  if p_id is null then
    if exists (select 1 from public.ri_sources where client_id = v_client and spreadsheet_id = p_spreadsheet_id and sheet_name = btrim(p_sheet_name)) then
      raise exception 'Esta aba desta planilha já está conectada a este cliente.' using errcode = '23505';
    end if;
    insert into public.ri_sources (client_id, spreadsheet_id, spreadsheet_title, sheet_name, header_row, mapping, profile_rules, created_by, updated_by)
    values (v_client, p_spreadsheet_id, left(p_spreadsheet_title, 300), btrim(p_sheet_name), p_header_row, p_mapping, p_profile_rules,
            (select auth.uid()), (select auth.uid()))
    returning id into v_id;
  else
    update public.ri_sources
       set spreadsheet_id = p_spreadsheet_id, spreadsheet_title = left(p_spreadsheet_title, 300), sheet_name = btrim(p_sheet_name),
           header_row = p_header_row, mapping = p_mapping, profile_rules = p_profile_rules, updated_by = (select auth.uid())
     where id = p_id;
    v_id := p_id;
  end if;
  insert into public.audit_logs (actor_id, action, target_type, target_id, details)
  values ((select auth.uid()), case when p_id is null then 'ri_source.create' else 'ri_source.update' end, 'ri_source', v_id::text,
          jsonb_build_object('cliente', v_client, 'planilha', p_spreadsheet_id, 'aba', btrim(p_sheet_name),
                             'colunas', (select count(*) from jsonb_object_keys(p_mapping)),
                             'regras', (select count(*) from jsonb_object_keys(p_profile_rules))));
  return v_id;
end;
$$;

-- Parâmetros extras de cada linha (utm_source, utm_medium, clique Google/Meta e os
-- personalizados), para a janela de registros. Sem dados pessoais.
create function private.ri_records_extra_impl(p_client_id uuid, p_rows integer[])
returns table (row_number integer, utm_source text, utm_medium text, click text, custom jsonb)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  if p_client_id is null or not private.ri_can_view(p_client_id) then
    raise exception 'Sem permissão para ver os resultados deste cliente.' using errcode = '42501';
  end if;
  if p_rows is null or cardinality(p_rows) > 500 then
    raise exception 'Linhas demais (máximo 500).' using errcode = '22023';
  end if;
  return query
  select (x.e ->> 'n')::integer, x.e ->> 'us', x.e ->> 'um',
         case when (x.e ->> 'gc')::boolean then 'google' when (x.e ->> 'fb')::boolean then 'meta' end,
         coalesce(x.e -> 'x', '{}'::jsonb)
  from public.ri_snapshots s
  cross join lateral jsonb_array_elements(s.rows) x(e)
  where s.client_id = p_client_id and (x.e ->> 'n')::integer = any (p_rows);
end;
$$;
revoke all on function private.ri_records_extra_impl(uuid, integer[]) from public, anon;
grant execute on function private.ri_records_extra_impl(uuid, integer[]) to authenticated;
create function public.ri_records_extra(p_client_id uuid, p_rows integer[])
returns table (row_number integer, utm_source text, utm_medium text, click text, custom jsonb)
language sql stable set search_path = ''
as $$ select * from private.ri_records_extra_impl(p_client_id, p_rows) $$;
revoke all on function public.ri_records_extra(uuid, integer[]) from public, anon;
grant execute on function public.ri_records_extra(uuid, integer[]) to authenticated;
