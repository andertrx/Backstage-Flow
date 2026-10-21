-- Correção (21/10/2026): campanha escrita na planilha que não existe no CRM passa a ser
-- "origem não encontrada" (antes aparecia como "nome ambíguo" quando o nome do anúncio se repetia).
-- Ponto de volta: a versão anterior é a da migração 20261021205854_ri_ids_na_coluna_de_nome.sql.

create or replace function private.ri_rows(p_client uuid)
returns table(source_id uuid, row_number integer, record_key text, contact text, contact_date date, profile_value text, profile text,
              sheet_campaign text, sheet_adset text, sheet_ad text, campaign_id uuid, ad_group_id uuid, ad_id uuid,
              match_level text, match_method text, match_issue text, sale_status text, sale_date date, sale_value numeric)
language sql
stable security definer
set search_path to ''
as $$
  with
  r0 as (
    select s.source_id, src.profile_rules, x.e,
           btrim(coalesce(x.e ->> 'cn', '')) cn0, btrim(coalesce(x.e ->> 'sn', '')) sn0, btrim(coalesce(x.e ->> 'an', '')) an0
    from public.ri_snapshots s
    join public.ri_sources src on src.id = s.source_id
    cross join lateral jsonb_array_elements(s.rows) x(e)
    where s.client_id = p_client
  ),
  -- ID colado na coluna do nome (utm_campaign={{campaign.id}}): vira ID.
  r as (
    select r0.source_id, r0.profile_rules, r0.e,
           coalesce(nullif(r0.e ->> 'cid', ''), case when r0.cn0 ~ '^[0-9]{6,}$' then r0.cn0 end) e_cid,
           coalesce(nullif(r0.e ->> 'sid', ''), case when r0.sn0 ~ '^[0-9]{6,}$' then r0.sn0 end) e_sid,
           coalesce(nullif(r0.e ->> 'aid', ''), case when r0.an0 ~ '^[0-9]{6,}$' then r0.an0 end) e_aid,
           case when r0.cn0 ~ '^[0-9]{6,}$' then null else r0.e ->> 'cn' end e_cn,
           case when r0.sn0 ~ '^[0-9]{6,}$' then null else r0.e ->> 'sn' end e_sn,
           case when r0.an0 ~ '^[0-9]{6,}$' then null else r0.e ->> 'an' end e_an
    from r0
  ),
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
  s1 as (
    select r.*,
           r.e_aid aid, r.e_sid sid, r.e_cid cid,
           private.ri_name(r.e_cn) cn, private.ri_name(r.e_sn) sn, private.ri_name(r.e_an) an_,
           ai.id ai_id, ai.ad_group_id ai_g, ai.campaign_id ai_c,
           si.id si_id, si.campaign_id si_c,
           ci.id ci_id
    from r
    left join lateral (select a.id, a.ad_group_id, a.campaign_id from public.ads a
                       where a.client_id = p_client and a.external_id = r.e_aid order by a.last_seen_at desc limit 1) ai on true
    left join lateral (select g.id, g.campaign_id from public.ad_groups g
                       where g.client_id = p_client and g.external_id = r.e_sid order by g.last_seen_at desc limit 1) si on true
    left join lateral (select c.id from public.campaigns c
                       where c.client_id = p_client and c.external_id = r.e_cid order by c.last_seen_at desc limit 1) ci on true
  ),
  s2 as (
    select s1.*,
           coalesce(ai_c, si_c, ci_id, case when cnm.n = 1 then cnm.id end) c2,
           (coalesce(ai_c, si_c, ci_id) is null and cnm.n > 1) c_amb
    from s1 left join camp_names cnm on cnm.nn = s1.cn and s1.cn is not null
  ),
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
         coalesce(nullif(btrim(f.e ->> 'cn'), ''), nullif(f.e ->> 'cid', '')),
         coalesce(nullif(btrim(f.e ->> 'sn'), ''), nullif(f.e ->> 'sid', '')),
         coalesce(nullif(btrim(f.e ->> 'an'), ''), nullif(f.e ->> 'aid', '')),
         f.cf, f.gf, f.a4,
         case when f.a4 is not null then 'anuncio' when f.gf is not null then 'conjunto' when f.cf is not null then 'campanha' end,
         case when f.a4 is null and f.gf is null and f.cf is null then null when f.by_id then 'id' else 'nome' end,
         case when not f.has_origin then 'sem_origem'
              -- Campanha escrita na planilha que não existe no CRM: "não encontrada", mesmo que o nome do anúncio se repita.
              when f.a4 is null and f.gf is null and f.cf is null and (f.cid is not null or f.cn is not null) and not coalesce(f.c_amb, false) then 'nao_encontrada'
              when f.a4 is null and f.gf is null and f.cf is null and (f.c_amb or f.g_amb or f.a_amb) then 'nome_ambiguo'
              when f.a4 is null and f.gf is null and f.cf is null then 'nao_encontrada'
              when (f.a4 is null and f.an_ is not null and f.a_amb) or (f.gf is null and f.sn is not null and f.g_amb) then 'nome_ambiguo'
         end,
         f.e ->> 'st',
         case when (f.e ->> 'sd') ~ '^\d{4}-\d{2}-\d{2}$' then (f.e ->> 'sd')::date end,
         case when jsonb_typeof(f.e -> 'sv') = 'number' then (f.e ->> 'sv')::numeric end
  from f
$$;
