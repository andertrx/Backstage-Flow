-- =============================================================================
-- Etapa 39.5 — Inteligência de Resultados: qualidade dos dados da planilha.
-- Olha a ÚLTIMA leitura inteira (sem período): como as linhas foram ligadas ao CRM,
-- quais valores de perfil ainda não têm regra e quais nomes de campanha/conjunto/
-- anúncio não foram encontrados ou são ambíguos — para o Ander saber o que corrigir.
-- Sem dados pessoais (nada de telefone, e-mail ou nome). Nenhuma tabela nova.
-- =============================================================================
create function private.ri_quality_impl(p_client_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v jsonb;
begin
  if p_client_id is null or not private.ri_can_view(p_client_id) then
    raise exception 'Sem permissão para ver os resultados deste cliente.' using errcode = '42501';
  end if;
  with r as (select * from private.ri_rows(p_client_id))
  select jsonb_build_object(
    'rows', (select count(*) from r),
    'contacts', (select count(distinct contact) from r),
    'origin_ad', (select count(*) from r where match_level = 'anuncio'),
    'origin_ad_group', (select count(*) from r where match_level = 'conjunto'),
    'origin_campaign', (select count(*) from r where match_level = 'campanha'),
    'origin_by_name', (select count(*) from r where match_method = 'nome'),
    'no_origin', (select count(*) from r where match_issue = 'sem_origem'),
    'not_found', (select count(*) from r where match_issue = 'nao_encontrada'),
    'ambiguous', (select count(*) from r where match_issue = 'nome_ambiguo'),
    'no_date', (select count(*) from r where contact_date is null),
    'empty_profile', (select count(*) from r where profile_value is null),
    -- valores da coluna de perfil que ainda não têm regra (contam como "não identificado" até ganhar uma)
    'unknown_profiles', coalesce((
      select jsonb_agg(jsonb_build_object('value', x.profile_value, 'rows', x.n) order by x.n desc, x.profile_value)
      from (select r.profile_value, count(*) n from r join public.ri_sources src on src.id = r.source_id
            where r.profile_value is not null and not (src.profile_rules ? r.profile_value)
            group by r.profile_value order by count(*) desc, r.profile_value limit 50) x), '[]'::jsonb),
    -- nomes da planilha que não ligaram a nada (não encontrados ou ambíguos)
    'unmatched_names', coalesce((
      select jsonb_agg(jsonb_build_object('campaign', x.sheet_campaign, 'adset', x.sheet_adset, 'ad', x.sheet_ad, 'issue', x.match_issue, 'rows', x.n)
                       order by x.n desc)
      from (select sheet_campaign, sheet_adset, sheet_ad, match_issue, count(*) n from r
            where match_issue in ('nao_encontrada', 'nome_ambiguo')
            group by 1, 2, 3, 4 order by count(*) desc limit 50) x), '[]'::jsonb),
    'sources', coalesce((
      select jsonb_agg(jsonb_build_object('source_id', s.source_id, 'read_at', s.read_at, 'trigger', s.trigger, 'row_count', s.row_count, 'stats', s.stats))
      from public.ri_snapshots s where s.client_id = p_client_id), '[]'::jsonb)
  ) into v;
  return v;
end;
$$;
revoke all on function private.ri_quality_impl(uuid) from public, anon;
grant execute on function private.ri_quality_impl(uuid) to authenticated;
create function public.ri_quality(p_client_id uuid)
returns jsonb language sql stable set search_path = ''
as $$ select private.ri_quality_impl(p_client_id) $$;
revoke all on function public.ri_quality(uuid) from public, anon;
grant execute on function public.ri_quality(uuid) to authenticated;
