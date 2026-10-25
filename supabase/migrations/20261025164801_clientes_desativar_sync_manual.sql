-- Correção (25/10/2026): cliente desativado continuava sincronizando quando alguém clicava em
-- "Sincronizar agora" (a trava de 23/10 valia só para a sincronização automática).
-- Agora a trava de execução (usada pela sincronização manual) também pula cliente desativado.
create or replace function public.sync_lock(p_ad_account_ids uuid[], p_lock_minutes integer default 15)
returns setof uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.sync_state (ad_account_id, status)
  select a.id, 'pendente' from public.ad_accounts a
  where a.id = any (p_ad_account_ids) and a.unlinked_at is null
    and not exists (select 1 from public.sync_state s where s.ad_account_id = a.id);

  return query
  update public.sync_state s
     set locked_until = now() + make_interval(mins => p_lock_minutes), status = 'executando', last_attempt_at = now()
   where s.ad_account_id = any (p_ad_account_ids)
     and (s.locked_until is null or s.locked_until < now())
     and private.client_is_active((select a.client_id from public.ad_accounts a where a.id = s.ad_account_id))
  returning s.ad_account_id;
end;
$$;
