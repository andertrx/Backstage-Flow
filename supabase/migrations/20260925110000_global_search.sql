-- =============================================================================
-- ETAPA 22 — Busca global
--
-- public.global_search(texto): procura clientes, contas, campanhas,
-- conjuntos/grupos e anúncios pelo nome (ou pelo ID da plataforma).
--
--   * Sem diferença entre maiúsculas/minúsculas e acentos ("exCALIbur",
--     "promoção" = "promocao").
--   * Procura o texto em qualquer parte do nome ("calibur" acha "Excalibur").
--   * Roda com a permissão de quem pergunta (RLS): cada um só acha o que já
--     pode ver. O perfil "cliente" não usa a busca (retorna vazio).
--   * Resultado limitado por tipo (padrão 5, máximo 20): rápido mesmo com
--     dezenas de milhares de anúncios.
--
-- Nenhuma tabela nova. Só extensões (unaccent, pg_trgm), uma função de
-- normalização e índices de busca por trecho de texto.
-- =============================================================================

create extension if not exists unaccent with schema extensions;
create extension if not exists pg_trgm with schema extensions;

-- Texto normalizado para busca: minúsculo e sem acento.
-- (unaccent com dicionário explícito é seguro para marcar como immutable.)
create function private.search_norm(t text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select lower(extensions.unaccent('extensions.unaccent'::regdictionary, coalesce(t, '')))
$$;

revoke all on function private.search_norm(text) from public, anon;
grant execute on function private.search_norm(text) to authenticated, service_role;

-- Índices de busca por trecho (trigramas) nos nomes.
create index clients_name_search_idx   on public.clients   using gin (private.search_norm(name) extensions.gin_trgm_ops);
create index clients_company_search_idx on public.clients  using gin (private.search_norm(company) extensions.gin_trgm_ops);
create index ad_accounts_name_search_idx on public.ad_accounts using gin (private.search_norm(name) extensions.gin_trgm_ops);
create index campaigns_name_search_idx on public.campaigns using gin (private.search_norm(name) extensions.gin_trgm_ops);
create index ad_groups_name_search_idx on public.ad_groups using gin (private.search_norm(name) extensions.gin_trgm_ops);
create index ads_name_search_idx       on public.ads       using gin (private.search_norm(name) extensions.gin_trgm_ops);

-- Busca pelo ID da plataforma (ex.: colar o ID de uma campanha do Gerenciador).
create index ad_accounts_external_id_idx on public.ad_accounts (external_id);
create index campaigns_external_id_idx on public.campaigns (external_id);
create index ad_groups_external_id_idx on public.ad_groups (external_id);
create index ads_external_id_idx on public.ads (external_id);

create function public.global_search(p_query text, p_limit integer default 5)
returns table (
  kind text,            -- cliente | conta | campanha | conjunto | anuncio
  id uuid,
  name text,
  external_id text,
  platform_id text,
  client_id uuid,
  client_name text,
  parent_name text,     -- conta (da campanha), campanha (do conjunto/anúncio) ou empresa (do cliente)
  status text
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_role public.user_role := private.current_user_role();
  v_limit integer := least(greatest(coalesce(p_limit, 5), 1), 20);
  v_q text := private.search_norm(btrim(coalesce(p_query, '')));
  v_id text := regexp_replace(btrim(coalesce(p_query, '')), '^act_', '');
  v_cnpj text := upper(regexp_replace(coalesce(p_query, ''), '[^0-9A-Za-z]', '', 'g'));
  v_pat text;
begin
  if v_role is null or v_role = 'cliente' then
    return;
  end if;
  if char_length(v_q) < 2 or char_length(v_q) > 100 then
    return;
  end if;
  -- % e _ digitados valem como texto, não como curinga.
  v_pat := '%' || replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  if v_id !~ '^[0-9A-Za-z_-]{3,64}$' then
    v_id := null;
  end if;

  return query
  (
    select 'cliente'::text, c.id, c.name, null::text, null::text, c.id, c.name, c.company, c.status::text
    from public.clients c
    where private.search_norm(c.name) like v_pat or private.search_norm(c.company) like v_pat
       or (char_length(v_cnpj) = 14 and c.cnpj = v_cnpj)
    order by private.search_norm(c.name) = v_q desc, private.search_norm(c.name) like v_q || '%' desc,
             c.status = 'ativo' desc, c.name
    limit v_limit
  )
  union all
  (
    select 'conta'::text, a.id, a.name, a.external_id, a.platform_id, a.client_id, c.name, null::text, a.status::text
    from public.ad_accounts a
    join public.clients c on c.id = a.client_id
    where a.unlinked_at is null
      and (private.search_norm(a.name) like v_pat or a.external_id = v_id)
    order by a.external_id = v_id desc nulls last, private.search_norm(a.name) = v_q desc,
             private.search_norm(a.name) like v_q || '%' desc, a.status = 'ativa' desc, a.name
    limit v_limit
  )
  union all
  (
    select 'campanha'::text, x.id, x.name, x.external_id, x.platform_id, x.client_id, c.name, a.name, x.status::text
    from public.campaigns x
    join public.clients c on c.id = x.client_id
    join public.ad_accounts a on a.id = x.ad_account_id
    where private.search_norm(x.name) like v_pat or x.external_id = v_id
    order by x.external_id = v_id desc nulls last, private.search_norm(x.name) = v_q desc,
             x.status = 'ativa' desc, x.last_seen_at desc, x.name
    limit v_limit
  )
  union all
  (
    select 'conjunto'::text, x.id, x.name, x.external_id, x.platform_id, x.client_id, c.name, p.name, x.status::text
    from public.ad_groups x
    join public.clients c on c.id = x.client_id
    join public.campaigns p on p.id = x.campaign_id
    where private.search_norm(x.name) like v_pat or x.external_id = v_id
    order by x.external_id = v_id desc nulls last, private.search_norm(x.name) = v_q desc,
             x.status = 'ativa' desc, x.last_seen_at desc, x.name
    limit v_limit
  )
  union all
  (
    select 'anuncio'::text, x.id, x.name, x.external_id, x.platform_id, x.client_id, c.name, p.name, x.status::text
    from public.ads x
    join public.clients c on c.id = x.client_id
    join public.campaigns p on p.id = x.campaign_id
    where private.search_norm(x.name) like v_pat or x.external_id = v_id
    order by x.external_id = v_id desc nulls last, private.search_norm(x.name) = v_q desc,
             x.status = 'ativa' desc, x.last_seen_at desc, x.name
    limit v_limit
  );
end;
$$;

comment on function public.global_search(text, integer) is
  'Busca global (Etapa 22): clientes, contas, campanhas, conjuntos e anúncios. Respeita o RLS; perfil cliente recebe vazio.';

revoke all on function public.global_search(text, integer) from public, anon;
grant execute on function public.global_search(text, integer) to authenticated, service_role;
