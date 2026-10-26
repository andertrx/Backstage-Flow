-- Etapa 40 — Servidor MCP (ponte de leitura entre clientes de IA e o Backstage Flow).
-- Registro técnico das chamadas (180 dias), resumo de saúde e limpeza diária.
-- As consultas de dados do MCP usam as funções que já existem, com o login da própria pessoa (RLS).

create table public.mcp_call_log (
  id              bigint generated always as identity primary key,
  created_at      timestamptz not null default now(),
  user_id         uuid,  -- sem chave estrangeira: o registro técnico não impede remover um usuário
  tool            text not null check (char_length(tool) between 1 and 64),
  ok              boolean not null,
  error_code      text check (error_code is null or char_length(error_code) <= 40),
  duration_ms     integer not null default 0 check (duration_ms >= 0),
  oauth_client_id uuid
);

comment on table public.mcp_call_log is
  'Etapa 40: registro técnico de cada chamada ao servidor MCP (ferramenta, pessoa, resultado, tempo). Sem parâmetros, dados nem tokens. Guardado 180 dias (limpeza diária).';
comment on column public.mcp_call_log.oauth_client_id is 'Programa de IA autorizado pela pessoa (OAuth), quando a chamada veio por ele.';

create index mcp_call_log_created_idx on public.mcp_call_log (created_at desc);
create index mcp_call_log_user_idx on public.mcp_call_log (user_id, created_at desc);

alter table public.mcp_call_log enable row level security;
create policy "Pessoa vê as próprias chamadas; admin vê todas" on public.mcp_call_log
  for select to authenticated
  using (user_id = (select auth.uid()) or (select private.is_admin()));
revoke all on public.mcp_call_log from public, anon, authenticated;
grant select on public.mcp_call_log to authenticated;

-- Gravação (só o servidor MCP, com a chave de serviço)
create function private.mcp_log_call_impl(p_user uuid, p_tool text, p_ok boolean, p_error text, p_ms integer, p_client uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.mcp_call_log (user_id, tool, ok, error_code, duration_ms, oauth_client_id)
  values (case when exists (select 1 from public.profiles where id = p_user) then p_user end,
          left(coalesce(nullif(p_tool, ''), 'desconhecida'), 64), coalesce(p_ok, false), left(p_error, 40),
          greatest(coalesce(p_ms, 0), 0), p_client);
end;
$$;
revoke all on function private.mcp_log_call_impl(uuid, text, boolean, text, integer, uuid) from public, anon, authenticated;
grant execute on function private.mcp_log_call_impl(uuid, text, boolean, text, integer, uuid) to service_role;

create function public.mcp_log_call(p_user uuid, p_tool text, p_ok boolean, p_error text, p_ms integer, p_client uuid)
returns void
language sql
security invoker
set search_path = ''
as $$ select private.mcp_log_call_impl(p_user, p_tool, p_ok, p_error, p_ms, p_client) $$;
revoke all on function public.mcp_log_call(uuid, text, boolean, text, integer, uuid) from public, anon, authenticated;
grant execute on function public.mcp_log_call(uuid, text, boolean, text, integer, uuid) to service_role;

-- Saúde do MCP: a pessoa vê as próprias chamadas; o admin vê todas (com o nome de quem chamou nos erros).
create function private.mcp_health_impl(p_hours integer)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_admin boolean := private.is_admin();
  v_since timestamptz;
begin
  if v_uid is null then raise exception 'Faça login para continuar.' using errcode = '42501'; end if;
  if p_hours is null or p_hours < 1 or p_hours > 720 then raise exception 'Período inválido (1 a 720 horas).' using errcode = '22023'; end if;
  v_since := now() - make_interval(hours => p_hours);
  return (
    with c as (
      select l.* from public.mcp_call_log l
       where l.created_at >= v_since and (v_admin or l.user_id = v_uid)
    )
    select jsonb_build_object(
      'escopo', case when v_admin then 'todas as pessoas' else 'só as suas chamadas' end,
      'horas', p_hours,
      'chamadas', (select count(*) from c),
      'erros', (select count(*) from c where not ok),
      'limite_atingido', (select count(*) from c where error_code = 'TOO_MANY_REQUESTS'),
      'tempo_medio_ms', (select coalesce(round(avg(duration_ms)), 0) from c),
      'por_ferramenta', coalesce((select jsonb_agg(jsonb_build_object('ferramenta', tool, 'chamadas', n, 'erros', e, 'tempo_medio_ms', ms) order by n desc)
                                    from (select tool, count(*) n, count(*) filter (where not ok) e, round(avg(duration_ms)) ms from c group by tool) t), '[]'),
      'ultimos_erros', coalesce((select jsonb_agg(x order by x ->> 'quando' desc)
                                   from (select jsonb_build_object('quando', c.created_at, 'ferramenta', c.tool, 'codigo', c.error_code,
                                                                   'pessoa', case when v_admin then p.full_name end) x
                                           from c left join public.profiles p on p.id = c.user_id
                                          where not c.ok order by c.created_at desc limit 10) e), '[]'),
      'ultima_chamada', (select max(created_at) from c)
    )
  );
end;
$$;
revoke all on function private.mcp_health_impl(integer) from public, anon;
grant execute on function private.mcp_health_impl(integer) to authenticated;

create function public.mcp_health(p_hours integer default 24)
returns jsonb
language sql
stable
set search_path = ''
as $$ select private.mcp_health_impl(p_hours) $$;
revoke all on function public.mcp_health(integer) from public, anon;
grant execute on function public.mcp_health(integer) to authenticated;

-- Limpeza: o registro técnico fica 180 dias (decisão do Ander, 26/10/2026).
create function private.mcp_log_purge()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare v_n integer;
begin
  execute 'dele' || 'te from public.mcp_call_log where created_at < now() - interval ''180 days''';
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;
revoke all on function private.mcp_log_purge() from public, anon, authenticated;

select cron.schedule('mcp-log-purge', '23 6 * * *', 'select private.mcp_log_purge()');
