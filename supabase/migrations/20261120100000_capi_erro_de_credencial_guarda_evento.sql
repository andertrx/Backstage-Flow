-- Envio ao Meta: erro de CREDENCIAL (token inválido/expirado, sem permissão, Pixel não encontrado, sem token) não gasta as 6 tentativas.
-- Antes: o evento tentava 6 vezes em ~9 h e virava "descartado" (perdido) mesmo que a pessoa trocasse o token a tempo.
-- Agora: o evento fica guardado como "erro", sem gastar tentativa, e tenta de novo a cada 30 min até a pessoa corrigir o token.
-- A regra de 7 dias continua valendo (evento com mais de 7 dias é descartado antes do envio).
create or replace function public.tracking_capi_finish(p_results jsonb)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.tracking_capi_queue q
     set status = case when (r ->> 'ok')::boolean then 'enviado'
                       when coalesce((r ->> 'auth')::boolean, false) then 'erro'
                       when q.attempts >= 6 then 'descartado' else 'erro' end,
         attempts = case when not (r ->> 'ok')::boolean and coalesce((r ->> 'auth')::boolean, false) then greatest(q.attempts - 1, 0) else q.attempts end,
         sent_at = case when (r ->> 'ok')::boolean then now() else q.sent_at end,
         last_error = case when (r ->> 'ok')::boolean then null else left(r ->> 'error', 500) end,
         next_attempt_at = now() + case when not (r ->> 'ok')::boolean and coalesce((r ->> 'auth')::boolean, false) then interval '30 minutes'
                                        else case q.attempts when 1 then interval '1 minute' when 2 then interval '5 minutes'
                                                             when 3 then interval '30 minutes' when 4 then interval '2 hours' else interval '6 hours' end end,
         locked_until = null,
         ip_address = case when (r ->> 'ok')::boolean or (q.attempts >= 6 and not coalesce((r ->> 'auth')::boolean, false)) then null else q.ip_address end,
         user_agent = case when (r ->> 'ok')::boolean or (q.attempts >= 6 and not coalesce((r ->> 'auth')::boolean, false)) then null else q.user_agent end
    from jsonb_array_elements(p_results) r
   where q.id = (r ->> 'id')::bigint and q.status = 'enviando'
$$;
revoke all on function public.tracking_capi_finish(jsonb) from public, anon, authenticated;
grant execute on function public.tracking_capi_finish(jsonb) to service_role;
