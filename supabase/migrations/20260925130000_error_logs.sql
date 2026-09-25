-- =============================================================================
-- ETAPA 25 — Tratamento de erros
--
-- Tabela nova: public.error_logs (explicada ao usuário antes de criar)
--   * Um registro por erro técnico: origem (site, servidor, sincronização,
--     importação do histórico), código curto, a mensagem AMIGÁVEL que a pessoa
--     viu e o detalhe TÉCNICO (sem tokens/senhas, até 4.000 letras), com o
--     contexto (página, ação, conta, função).
--   * Só o administrador lê. O site só registra, pela função log_client_error
--     (limite de 30 por pessoa a cada 10 minutos). O servidor grava direto.
--   * Retenção: permanente. Nada é apagado automaticamente.
-- =============================================================================

create table public.error_logs (
  id            bigint generated always as identity primary key,
  occurred_at   timestamptz not null default now(),
  source        text not null check (source in ('site', 'servidor', 'sincronizacao', 'historico')),
  code          text not null check (char_length(code) between 1 and 80),
  user_message  text check (user_message is null or char_length(user_message) <= 500),
  technical     text check (technical is null or char_length(technical) <= 4000),
  context       jsonb not null default '{}'::jsonb check (pg_column_size(context) <= 8000),
  user_id       uuid references auth.users (id) on delete set null,
  ad_account_id uuid references public.ad_accounts (id) on delete set null,
  client_id     uuid references public.clients (id) on delete set null
);

comment on table public.error_logs is 'Erros técnicos para análise do administrador (a pessoa vê só a mensagem amigável). Sem tokens/senhas. Permanente.';
comment on column public.error_logs.technical is 'Detalhe técnico já sem tokens, senhas e chaves (limpo antes de gravar).';

create index error_logs_time_idx on public.error_logs (occurred_at desc);
create index error_logs_source_time_idx on public.error_logs (source, occurred_at desc);
create index error_logs_account_idx on public.error_logs (ad_account_id) where ad_account_id is not null;
create index error_logs_client_idx on public.error_logs (client_id) where client_id is not null;
create index error_logs_user_idx on public.error_logs (user_id) where user_id is not null;

revoke all on public.error_logs from anon, authenticated;
grant select on public.error_logs to authenticated;
alter table public.error_logs enable row level security;
create policy "Administrador vê os erros técnicos" on public.error_logs for select to authenticated
  using ((select private.is_admin()));

-- Limpeza de segredos (a mesma regra do servidor): tokens, chaves e senhas nunca vão para o log.
create function private.redact_secrets(t text)
returns text
language sql
immutable
set search_path = ''
as $$
  select regexp_replace(
         regexp_replace(
         regexp_replace(
         regexp_replace(coalesce(t, ''),
           '((access_token|refresh_token|appsecret_proof|client_secret|developer[-_]token|password|senha|apikey|api_key|secret|token)["'']?\s*[=:]\s*["'']?)[^&"''\s,}]+', '\1[oculto]', 'gi'),
           '(Bearer\s+)[A-Za-z0-9._~+/=-]+', '\1[oculto]', 'gi'),
           'EAA[A-Za-z0-9]{20,}', '[token oculto]', 'g'),
           'eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}', '[jwt oculto]', 'g')
$$;

revoke all on function private.redact_secrets(text) from public, anon, authenticated;

-- O site registra um erro técnico (quem está logado; com limite contra excesso).
create function private.log_client_error_impl(p_code text, p_user_message text, p_technical text, p_context jsonb)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_recent integer;
begin
  if v_user is null or private.current_user_role() is null then return false; end if;
  select count(*) into v_recent from public.error_logs
   where user_id = v_user and source = 'site' and occurred_at > now() - interval '10 minutes';
  if v_recent >= 30 then return false; end if;

  insert into public.error_logs (source, code, user_message, technical, context, user_id)
  values (
    'site',
    left(coalesce(nullif(btrim(regexp_replace(p_code, '[^A-Za-z0-9_.:-]', '', 'g')), ''), 'SITE_ERROR'), 80),
    left(private.redact_secrets(p_user_message), 500),
    left(private.redact_secrets(p_technical), 4000),
    case when jsonb_typeof(p_context) = 'object' and pg_column_size(p_context) <= 4000
         then (select coalesce(jsonb_object_agg(k, to_jsonb(left(private.redact_secrets(v #>> '{}'), 300))), '{}'::jsonb)
                 from jsonb_each(p_context) as e(k, v))
         else '{}'::jsonb end,
    v_user
  );
  return true;
end;
$$;

revoke all on function private.log_client_error_impl(text, text, text, jsonb) from public, anon;
grant execute on function private.log_client_error_impl(text, text, text, jsonb) to authenticated;

create function public.log_client_error(p_code text, p_user_message text, p_technical text, p_context jsonb default '{}'::jsonb)
returns boolean
language sql
security invoker
set search_path = ''
as $$
  select private.log_client_error_impl(p_code, p_user_message, p_technical, p_context)
$$;

revoke all on function public.log_client_error(text, text, text, jsonb) from public, anon;
grant execute on function public.log_client_error(text, text, text, jsonb) to authenticated;

-- Lista para a tela de Logs (só o administrador recebe linhas: RLS).
create function public.error_log_list(
  p_from timestamptz default null,
  p_source text default null,
  p_before_id bigint default null,
  p_limit integer default 100
)
returns table (
  id bigint, occurred_at timestamptz, source text, code text, user_message text, technical text, context jsonb,
  user_id uuid, user_name text, ad_account_id uuid, account_name text, client_id uuid, client_name text
)
language sql
stable
security invoker
set search_path = ''
as $$
  select e.id, e.occurred_at, e.source, e.code, e.user_message, e.technical, e.context,
         e.user_id, coalesce(nullif(p.full_name, ''), p.email), e.ad_account_id, a.name, e.client_id, c.name
  from public.error_logs e
  left join public.profiles p on p.id = e.user_id
  left join public.ad_accounts a on a.id = e.ad_account_id
  left join public.clients c on c.id = e.client_id
  where (p_from is null or e.occurred_at >= p_from)
    and (p_source is null or e.source = p_source)
    and (p_before_id is null or e.id < p_before_id)
  order by e.id desc
  limit least(greatest(coalesce(p_limit, 100), 1), 200)
$$;

revoke all on function public.error_log_list(timestamptz, text, bigint, integer) from public, anon;
grant execute on function public.error_log_list(timestamptz, text, bigint, integer) to authenticated;
