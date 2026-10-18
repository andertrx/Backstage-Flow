-- =============================================================================
-- Etapa 39.5 — registros da planilha também sem período (todas as datas), para a aba
-- Qualidade dos dados. Mesma função da 39.3; só muda a regra do período:
-- de e até vazios = todas as datas; um só preenchido continua inválido.
-- =============================================================================
create or replace function private.ri_records_impl(
  p_client_id uuid, p_from date, p_to date, p_profile text, p_campaign_id uuid, p_ad_group_id uuid, p_ad_id uuid,
  p_issue text, p_limit integer, p_offset integer)
returns table (
  row_number integer, record_key text, contact_date date, profile_value text, profile text,
  sheet_campaign text, sheet_adset text, sheet_ad text,
  campaign_id uuid, campaign_name text, ad_group_id uuid, ad_group_name text, ad_id uuid, ad_name text,
  match_level text, match_method text, match_issue text, sale_status text, sale_date date, sale_value numeric,
  total_count bigint
)
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
  -- Sem período (de e até vazios) = todas as datas (aba Qualidade dos dados, 39.5).
  if (p_from is null) <> (p_to is null) or (p_from is not null and (p_to < p_from or p_to - p_from > 400)) then
    raise exception 'Período inválido (máximo de 400 dias).' using errcode = '22023';
  end if;
  if p_profile is not null and p_profile not in ('lojista', 'sacoleiro', 'consumidor_final', 'nao_identificado') then
    raise exception 'Perfil inválido.' using errcode = '22023';
  end if;
  if p_issue is not null and p_issue not in ('sem_origem', 'nao_encontrada', 'nome_ambiguo', 'sem_data') then
    raise exception 'Filtro inválido.' using errcode = '22023';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 500 or coalesce(p_offset, 0) < 0 then
    raise exception 'Quantidade inválida (1 a 500).' using errcode = '22023';
  end if;
  return query
  select x.row_number, x.record_key, x.contact_date, x.profile_value, x.profile,
         x.sheet_campaign, x.sheet_adset, x.sheet_ad,
         x.campaign_id, c.name, x.ad_group_id, g.name, x.ad_id, a.name,
         x.match_level, x.match_method, x.match_issue, x.sale_status, x.sale_date, x.sale_value,
         count(*) over ()
  from private.ri_rows(p_client_id) x
  left join public.campaigns c on c.id = x.campaign_id
  left join public.ad_groups g on g.id = x.ad_group_id
  left join public.ads a on a.id = x.ad_id
  where (case when p_issue = 'sem_data' then x.contact_date is null
              when p_from is null then true
              else x.contact_date between p_from and p_to end)
    and (p_profile is null or x.profile = p_profile)
    and (p_campaign_id is null or x.campaign_id = p_campaign_id)
    and (p_ad_group_id is null or x.ad_group_id = p_ad_group_id)
    and (p_ad_id is null or x.ad_id = p_ad_id)
    and (p_issue is null or p_issue = 'sem_data' or x.match_issue = p_issue)
  order by x.contact_date desc nulls last, x.row_number desc
  limit p_limit offset coalesce(p_offset, 0);
end;
$$;
