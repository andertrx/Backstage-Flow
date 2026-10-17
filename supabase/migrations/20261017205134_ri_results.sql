-- =============================================================================
-- Etapa 39.3 — Inteligência de Resultados: perfis e origem.
--
-- Cada linha da última leitura da planilha (ri_snapshots) é:
--   1. classificada no perfil comercial pelas regras do cliente (lojista, sacoleiro,
--      consumidor final; o que não tiver regra é "não identificado");
--   2. ligada à campanha, ao conjunto e ao anúncio do CRM:
--      ID do anúncio → ID do conjunto → ID da campanha; sem ID, pelo nome, mas só
--      quando existe UM ÚNICO item com aquele nome (dentro da campanha/conjunto já
--      encontrados). Mais de um → "nome ambíguo"; nada → "não encontrada".
-- Tudo é calculado na hora da consulta: mudar uma regra de perfil ou o CRM receber
-- um anúncio novo vale sem ler a planilha de novo. Nenhuma tabela nova.
-- Contato único = impressão digital (hash) do telefone/e-mail; sem ela, a própria linha.
-- Investimento: public.metrics_daily (Meta/Google), por moeda, nunca somando moedas.
-- =============================================================================

-- Busca por ID da plataforma dentro do cliente.
create index if not exists campaigns_client_external_idx on public.campaigns (client_id, external_id);
create index if not exists ad_groups_client_external_idx on public.ad_groups (client_id, external_id);
create index if not exists ads_client_external_idx on public.ads (client_id, external_id);

-- Nome para comparar: minúsculas e espaços simples (acentos e o resto precisam ser iguais).
create function private.ri_name(p text)
returns text
language sql
immutable
set search_path = ''
as $$ select nullif(lower(btrim(regexp_replace(coalesce(p, ''), '\s+', ' ', 'g'))), '') $$;
revoke all on function private.ri_name(text) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Linhas da última leitura de um cliente, classificadas e ligadas ao CRM.
-- Uso interno: quem chama confere a permissão.
-- -----------------------------------------------------------------------------
create function private.ri_rows(p_client uuid)
returns table (
  source_id uuid, row_number integer, record_key text, contact text, contact_date date,
  profile_value text, profile text,
  sheet_campaign text, sheet_adset text, sheet_ad text,
  campaign_id uuid, ad_group_id uuid, ad_id uuid,
  match_level text, match_method text, match_issue text,
  sale_status text, sale_date date, sale_value numeric
)
language sql
stable
security definer
set search_path = ''
as $$
  with
  r as (
    select s.source_id, src.profile_rules, x.e
    from public.ri_snapshots s
    join public.ri_sources src on src.id = s.source_id
    cross join lateral jsonb_array_elements(s.rows) x(e)
    where s.client_id = p_client
  ),
  -- Nomes do CRM deste cliente (com quantos itens têm o mesmo nome).
  camp_names as (
    select private.ri_name(c.name) nn, count(*) n, (array_agg(c.id))[1] id
    from public.campaigns c where c.client_id = p_client group by 1
  ),
  set_names as (
    select private.ri_name(g.name) nn, g.campaign_id, count(*) n, (array_agg(g.id))[1] id
    from public.ad_groups g where g.client_id = p_client
    group by grouping sets ((private.ri_name(g.name)), (private.ri_name(g.name), g.campaign_id))
  ),
  ad_names as (
    select private.ri_name(a.name) nn, a.campaign_id, a.ad_group_id, count(*) n,
           (array_agg(a.id))[1] id, (array_agg(a.ad_group_id))[1] g, (array_agg(a.campaign_id))[1] c
    from public.ads a where a.client_id = p_client
    group by grouping sets ((private.ri_name(a.name)), (private.ri_name(a.name), a.campaign_id), (private.ri_name(a.name), a.ad_group_id))
  ),
  -- 1) IDs
  s1 as (
    select r.*,
           nullif(r.e ->> 'aid', '') aid, nullif(r.e ->> 'sid', '') sid, nullif(r.e ->> 'cid', '') cid,
           private.ri_name(r.e ->> 'cn') cn, private.ri_name(r.e ->> 'sn') sn, private.ri_name(r.e ->> 'an') an_,
           ai.id ai_id, ai.ad_group_id ai_g, ai.campaign_id ai_c,
           si.id si_id, si.campaign_id si_c,
           ci.id ci_id
    from r
    left join lateral (select a.id, a.ad_group_id, a.campaign_id from public.ads a
                       where a.client_id = p_client and a.external_id = r.e ->> 'aid' order by a.last_seen_at desc limit 1) ai on true
    left join lateral (select g.id, g.campaign_id from public.ad_groups g
                       where g.client_id = p_client and g.external_id = r.e ->> 'sid' order by g.last_seen_at desc limit 1) si on true
    left join lateral (select c.id from public.campaigns c
                       where c.client_id = p_client and c.external_id = r.e ->> 'cid' order by c.last_seen_at desc limit 1) ci on true
  ),
  -- 2) campanha pelo nome (só se não veio pelo ID)
  s2 as (
    select s1.*,
           coalesce(ai_c, si_c, ci_id, case when cnm.n = 1 then cnm.id end) c2,
           (coalesce(ai_c, si_c, ci_id) is null and cnm.n > 1) c_amb
    from s1 left join camp_names cnm on cnm.nn = s1.cn and s1.cn is not null
  ),
  -- 3) conjunto pelo nome (dentro da campanha, se já se sabe qual)
  s3 as (
    select s2.*,
           coalesce(ai_g, si_id, case when snm.n = 1 then snm.id end) g3,
           (coalesce(ai_g, si_id) is null and snm.n > 1) g_amb
    from s2
    left join lateral (select x.n, x.id from set_names x
                       where s2.sn is not null and x.nn = s2.sn
                         and (case when s2.c2 is null then x.campaign_id is null else x.campaign_id = s2.c2 end)) snm on true
  ),
  s3b as (
    select s3.*, coalesce(s3.c2, (select g.campaign_id from public.ad_groups g where g.id = s3.g3)) c3 from s3
  ),
  -- 4) anúncio pelo nome (dentro do conjunto, ou da campanha, já encontrados)
  s4 as (
    select s3b.*,
           coalesce(ai_id, case when anm.n = 1 then anm.id end) a4,
           (ai_id is null and anm.n > 1) a_amb,
           anm.g an_g, anm.c an_c, anm.n an_n
    from s3b
    left join lateral (select x.n, x.id, x.g, x.c from ad_names x
                       where s3b.an_ is not null and x.nn = s3b.an_
                         and (case when s3b.g3 is not null then x.ad_group_id = s3b.g3 and x.campaign_id is null
                                   when s3b.c3 is not null then x.campaign_id = s3b.c3 and x.ad_group_id is null
                                   else x.campaign_id is null and x.ad_group_id is null end)) anm on true
  ),
  f as (
    select s4.*,
           coalesce(s4.g3, case when s4.an_n = 1 then s4.an_g end) gf,
           coalesce(s4.c3, case when s4.an_n = 1 then s4.an_c end) cf,
           (s4.aid is not null or s4.sid is not null or s4.cid is not null or s4.cn is not null or s4.sn is not null or s4.an_ is not null) has_origin,
           (s4.ai_id is not null or s4.si_id is not null or s4.ci_id is not null) by_id
    from s4
  )
  select f.source_id,
         (f.e ->> 'n')::integer,
         f.e ->> 'k',
         coalesce(nullif(f.e ->> 'h', ''), f.source_id::text || ':' || (f.e ->> 'k')),
         case when (f.e ->> 'd') ~ '^\d{4}-\d{2}-\d{2}$' then (f.e ->> 'd')::date end,
         nullif(f.e ->> 'p', ''),
         case when (f.profile_rules ->> (f.e ->> 'p')) in ('lojista', 'sacoleiro', 'consumidor_final')
              then f.profile_rules ->> (f.e ->> 'p') else 'nao_identificado' end,
         f.e ->> 'cn', f.e ->> 'sn', f.e ->> 'an',
         f.cf, f.gf, f.a4,
         case when f.a4 is not null then 'anuncio' when f.gf is not null then 'conjunto' when f.cf is not null then 'campanha' end,
         case when f.a4 is null and f.gf is null and f.cf is null then null when f.by_id then 'id' else 'nome' end,
         case when not f.has_origin then 'sem_origem'
              when f.a4 is null and f.gf is null and f.cf is null and (f.c_amb or f.g_amb or f.a_amb) then 'nome_ambiguo'
              when f.a4 is null and f.gf is null and f.cf is null then 'nao_encontrada'
              when (f.a4 is null and f.an_ is not null and f.a_amb) or (f.gf is null and f.sn is not null and f.g_amb) then 'nome_ambiguo'
         end,
         f.e ->> 'st',
         case when (f.e ->> 'sd') ~ '^\d{4}-\d{2}-\d{2}$' then (f.e ->> 'sd')::date end,
         case when jsonb_typeof(f.e -> 'sv') = 'number' then (f.e ->> 'sv')::numeric end
  from f
$$;
revoke all on function private.ri_rows(uuid) from public, anon, authenticated;

-- Quem pode ver os resultados de um cliente: equipe (não cliente nem Equipe da Central) com acesso a ele.
create function private.ri_can_view(p_client uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$ select coalesce(private.current_user_role() in ('admin', 'gestor', 'operador', 'visualizador'), false) and coalesce(private.can_view_client(p_client), false) $$;
revoke all on function private.ri_can_view(uuid) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Resultados (cards + ranking) de um cliente num período.
-- p_level: campaign | ad_group | ad. p_campaign_id / p_ad_group_id: abrir conjuntos/anúncios.
-- Contagens = contatos ÚNICOS. Linhas sem data ficam fora do período (contadas em "sem data").
-- -----------------------------------------------------------------------------
create function private.ri_results_impl(
  p_client_id uuid, p_from date, p_to date, p_level text, p_campaign_id uuid, p_ad_group_id uuid)
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
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 400 then
    raise exception 'Período inválido (máximo de 400 dias).' using errcode = '22023';
  end if;
  if p_level is null or p_level not in ('campaign', 'ad_group', 'ad') then
    raise exception 'Nível inválido.' using errcode = '22023';
  end if;

  with
  allr as (select * from private.ri_rows(p_client_id)),
  pr as (select * from allr where contact_date between p_from and p_to),
  -- recorte do ranking (abrir campanha → conjuntos → anúncios)
  scope as (
    select * from pr
    where (p_campaign_id is null or campaign_id = p_campaign_id)
      and (p_ad_group_id is null or ad_group_id = p_ad_group_id)
  ),
  lvl as (
    select s.*, case p_level when 'campaign' then s.campaign_id when 'ad_group' then s.ad_group_id else s.ad_id end ent
    from scope s
  ),
  counts as (
    select ent,
           count(distinct contact) contacts,
           count(distinct contact) filter (where profile = 'lojista') lojista,
           count(distinct contact) filter (where profile = 'sacoleiro') sacoleiro,
           count(distinct contact) filter (where profile = 'consumidor_final') consumidor_final,
           count(distinct contact) filter (where profile = 'nao_identificado') nao_identificado,
           count(*) filter (where match_method = 'nome') by_name
    from lvl where ent is not null group by ent
  ),
  spend as (
    select case p_level when 'campaign' then m.campaign_id when 'ad_group' then m.ad_group_id else m.ad_id end ent,
           m.currency, sum(m.spend_micros) spend_micros
    from public.metrics_daily m
    where m.client_id = p_client_id and m.date between p_from and p_to and not m.superseded
      and m.level = p_level::public.entity_level
      and case p_level when 'campaign' then m.campaign_id when 'ad_group' then m.ad_group_id else m.ad_id end in (select ent from counts)
    group by 1, 2
  ),
  items as (
    select jsonb_build_object(
             'id', k.ent,
             'name', coalesce(a.name, g.name, c.name),
             'status', coalesce(a.status, g.status, c.status),
             'platform_id', coalesce(a.platform_id, g.platform_id, c.platform_id),
             'campaign_id', coalesce(a.campaign_id, g.campaign_id, c.id),
             'campaign_name', cc.name,
             'ad_group_id', coalesce(a.ad_group_id, g.id),
             'ad_group_name', gg.name,
             'thumbnail_url', a.thumbnail_url,
             'contacts', k.contacts, 'lojista', k.lojista, 'sacoleiro', k.sacoleiro,
             'consumidor_final', k.consumidor_final, 'nao_identificado', k.nao_identificado,
             'by_name', k.by_name,
             'spend', coalesce((select jsonb_agg(jsonb_build_object('currency', sp.currency, 'spend_micros', sp.spend_micros) order by sp.currency)
                                from spend sp where sp.ent = k.ent), '[]'::jsonb)
           ) item, k.contacts
    from counts k
    left join public.campaigns c on p_level = 'campaign' and c.id = k.ent
    left join public.ad_groups g on p_level = 'ad_group' and g.id = k.ent
    left join public.ads a on p_level = 'ad' and a.id = k.ent
    left join public.campaigns cc on cc.id = coalesce(a.campaign_id, g.campaign_id, c.id)
    left join public.ad_groups gg on gg.id = coalesce(a.ad_group_id, g.id)
  )
  select jsonb_build_object(
    'read_at', (select max(read_at) from public.ri_snapshots where client_id = p_client_id),
    'sources', (select count(*) from public.ri_snapshots where client_id = p_client_id),
    'totals', (
      select jsonb_build_object(
        'rows', count(*),
        'contacts', count(distinct contact),
        'lojista', count(distinct contact) filter (where profile = 'lojista'),
        'sacoleiro', count(distinct contact) filter (where profile = 'sacoleiro'),
        'consumidor_final', count(distinct contact) filter (where profile = 'consumidor_final'),
        'nao_identificado', count(distinct contact) filter (where profile = 'nao_identificado'),
        'with_origin', count(distinct contact) filter (where match_level is not null),
        'origin_ad', count(*) filter (where match_level = 'anuncio'),
        'origin_ad_group', count(*) filter (where match_level = 'conjunto'),
        'origin_campaign', count(*) filter (where match_level = 'campanha'),
        'origin_by_name', count(*) filter (where match_method = 'nome'),
        'no_origin', count(*) filter (where match_issue = 'sem_origem'),
        'not_found', count(*) filter (where match_issue = 'nao_encontrada'),
        'ambiguous', count(*) filter (where match_issue = 'nome_ambiguo'))
      from pr),
    'outside', (select jsonb_build_object('no_date', count(*) filter (where contact_date is null),
                                          'all_rows', count(*)) from allr),
    'level', p_level,
    'scope_contacts', (select count(distinct contact) from scope),
    -- contatos do recorte que não têm nenhum item identificado neste nível
    'scope_without_level', (select count(distinct contact) from scope) - (select count(distinct contact) from lvl where ent is not null),
    'items', coalesce((select jsonb_agg(item order by contacts desc) from items), '[]'::jsonb)
  ) into v;
  return v;
end;
$$;
revoke all on function private.ri_results_impl(uuid, date, date, text, uuid, uuid) from public, anon;
grant execute on function private.ri_results_impl(uuid, date, date, text, uuid, uuid) to authenticated;
create function public.ri_results(
  p_client_id uuid, p_from date, p_to date, p_level text default 'campaign', p_campaign_id uuid default null, p_ad_group_id uuid default null)
returns jsonb language sql stable set search_path = ''
as $$ select private.ri_results_impl(p_client_id, p_from, p_to, p_level, p_campaign_id, p_ad_group_id) $$;
revoke all on function public.ri_results(uuid, date, date, text, uuid, uuid) from public, anon;
grant execute on function public.ri_results(uuid, date, date, text, uuid, uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- Registros usados nos números (sem dados pessoais: sem telefone, e-mail ou nome).
-- p_issue: sem_origem | nao_encontrada | nome_ambiguo | sem_data (filtra os problemas).
-- -----------------------------------------------------------------------------
create function private.ri_records_impl(
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
  if p_issue is distinct from 'sem_data' and (p_from is null or p_to is null or p_to < p_from or p_to - p_from > 400) then
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
  where (case when p_issue = 'sem_data' then x.contact_date is null else x.contact_date between p_from and p_to end)
    and (p_profile is null or x.profile = p_profile)
    and (p_campaign_id is null or x.campaign_id = p_campaign_id)
    and (p_ad_group_id is null or x.ad_group_id = p_ad_group_id)
    and (p_ad_id is null or x.ad_id = p_ad_id)
    and (p_issue is null or p_issue = 'sem_data' or x.match_issue = p_issue)
  order by x.contact_date desc nulls last, x.row_number desc
  limit p_limit offset coalesce(p_offset, 0);
end;
$$;
revoke all on function private.ri_records_impl(uuid, date, date, text, uuid, uuid, uuid, text, integer, integer) from public, anon;
grant execute on function private.ri_records_impl(uuid, date, date, text, uuid, uuid, uuid, text, integer, integer) to authenticated;
create function public.ri_records(
  p_client_id uuid, p_from date, p_to date, p_profile text default null, p_campaign_id uuid default null,
  p_ad_group_id uuid default null, p_ad_id uuid default null, p_issue text default null,
  p_limit integer default 100, p_offset integer default 0)
returns table (
  row_number integer, record_key text, contact_date date, profile_value text, profile text,
  sheet_campaign text, sheet_adset text, sheet_ad text,
  campaign_id uuid, campaign_name text, ad_group_id uuid, ad_group_name text, ad_id uuid, ad_name text,
  match_level text, match_method text, match_issue text, sale_status text, sale_date date, sale_value numeric,
  total_count bigint
)
language sql stable set search_path = ''
as $$ select * from private.ri_records_impl(p_client_id, p_from, p_to, p_profile, p_campaign_id, p_ad_group_id, p_ad_id, p_issue, p_limit, p_offset) $$;
revoke all on function public.ri_records(uuid, date, date, text, uuid, uuid, uuid, text, integer, integer) from public, anon;
grant execute on function public.ri_records(uuid, date, date, text, uuid, uuid, uuid, text, integer, integer) to authenticated;
