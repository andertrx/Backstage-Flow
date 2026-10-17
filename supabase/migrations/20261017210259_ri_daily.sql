-- =============================================================================
-- Etapa 39.4 — Inteligência de Resultados: contatos por dia (gráfico da tela).
-- Contatos únicos de cada perfil em cada dia (data do contato na planilha), com os
-- mesmos recortes do ranking (campanha, conjunto, anúncio). Nenhuma tabela nova.
-- =============================================================================
create function private.ri_daily_impl(
  p_client_id uuid, p_from date, p_to date, p_campaign_id uuid, p_ad_group_id uuid, p_ad_id uuid)
returns table (day date, contacts bigint, lojista bigint, sacoleiro bigint, consumidor_final bigint, nao_identificado bigint)
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
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 400 then
    raise exception 'Período inválido (máximo de 400 dias).' using errcode = '22023';
  end if;
  return query
  select x.contact_date,
         count(distinct x.contact),
         count(distinct x.contact) filter (where x.profile = 'lojista'),
         count(distinct x.contact) filter (where x.profile = 'sacoleiro'),
         count(distinct x.contact) filter (where x.profile = 'consumidor_final'),
         count(distinct x.contact) filter (where x.profile = 'nao_identificado')
  from private.ri_rows(p_client_id) x
  where x.contact_date between p_from and p_to
    and (p_campaign_id is null or x.campaign_id = p_campaign_id)
    and (p_ad_group_id is null or x.ad_group_id = p_ad_group_id)
    and (p_ad_id is null or x.ad_id = p_ad_id)
  group by x.contact_date
  order by x.contact_date;
end;
$$;
revoke all on function private.ri_daily_impl(uuid, date, date, uuid, uuid, uuid) from public, anon;
grant execute on function private.ri_daily_impl(uuid, date, date, uuid, uuid, uuid) to authenticated;
create function public.ri_daily(
  p_client_id uuid, p_from date, p_to date, p_campaign_id uuid default null, p_ad_group_id uuid default null, p_ad_id uuid default null)
returns table (day date, contacts bigint, lojista bigint, sacoleiro bigint, consumidor_final bigint, nao_identificado bigint)
language sql stable set search_path = ''
as $$ select * from private.ri_daily_impl(p_client_id, p_from, p_to, p_campaign_id, p_ad_group_id, p_ad_id) $$;
revoke all on function public.ri_daily(uuid, date, date, uuid, uuid, uuid) from public, anon;
grant execute on function public.ri_daily(uuid, date, date, uuid, uuid, uuid) to authenticated;
