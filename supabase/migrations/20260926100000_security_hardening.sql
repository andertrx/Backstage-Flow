-- =============================================================================
-- ETAPA 26 — Segurança
--
-- 1) Limite de requisições (rate limiting) para as ações sensíveis das Edge
--    Functions (sincronizar, consultar saldo, conectar contas, gerenciar
--    usuários). Tabela nova private.rate_limits (explicada ao usuário antes):
--      * uma linha por pessoa e ação, SOBRESCRITA a cada nova janela de tempo;
--      * não cresce e não guarda histórico (nada é apagado);
--      * schema private: o site não enxerga; só o servidor usa.
-- 2) Reforço: funções do schema private não executáveis por visitante (anon)
--    nem por PUBLIC; o mesmo vale para funções criadas no futuro.
-- =============================================================================

create table private.rate_limits (
  bucket       text not null check (char_length(bucket) between 1 and 60),
  subject      uuid not null references auth.users (id) on delete cascade,
  window_start timestamptz not null default now(),
  hits         integer not null default 0 check (hits >= 0),
  primary key (bucket, subject)
);

comment on table private.rate_limits is 'Contador de uso por pessoa e ação (limite de requisições). Uma linha por pessoa/ação, sobrescrita a cada janela. Só o servidor usa.';

alter table private.rate_limits enable row level security;
revoke all on private.rate_limits from public, anon, authenticated;

-- Registra uma tentativa e diz se ainda está dentro do limite.
-- true = pode seguir; false = passou do limite nesta janela.
create function private.rate_limit_hit_impl(p_bucket text, p_subject uuid, p_max integer, p_window_seconds integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hits integer;
begin
  if p_bucket is null or p_subject is null or p_max is null or p_max < 1
     or p_window_seconds is null or p_window_seconds < 1 or p_window_seconds > 86400 then
    raise exception 'rate_limit_hit: parâmetros inválidos' using errcode = '22023';
  end if;

  insert into private.rate_limits as r (bucket, subject, window_start, hits)
  values (left(p_bucket, 60), p_subject, now(), 1)
  on conflict (bucket, subject) do update
    set window_start = case when r.window_start <= now() - make_interval(secs => p_window_seconds) then now() else r.window_start end,
        hits = case when r.window_start <= now() - make_interval(secs => p_window_seconds) then 1 else r.hits + 1 end
  returning hits into v_hits;

  return v_hits <= p_max;
end;
$$;

revoke all on function private.rate_limit_hit_impl(text, uuid, integer, integer) from public, anon, authenticated;
grant execute on function private.rate_limit_hit_impl(text, uuid, integer, integer) to service_role;

-- Porta de entrada para as Edge Functions (só o servidor, com a chave de serviço).
create function public.rate_limit_hit(p_bucket text, p_subject uuid, p_max integer, p_window_seconds integer)
returns boolean
language sql
security invoker
set search_path = ''
as $$
  select private.rate_limit_hit_impl(p_bucket, p_subject, p_max, p_window_seconds)
$$;

revoke all on function public.rate_limit_hit(text, uuid, integer, integer) from public, anon, authenticated;
grant execute on function public.rate_limit_hit(text, uuid, integer, integer) to service_role;

-- Reforço: nada do schema private é executável por visitante/PUBLIC.
revoke execute on all functions in schema private from public, anon;
alter default privileges in schema private revoke execute on functions from public, anon;
