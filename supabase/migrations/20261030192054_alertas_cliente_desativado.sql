-- Cliente desativado não gera mais alerta (pedido do Ander, 30/10/2026).
-- O sistema de Alertas (página Alertas, selo do menu) olhava todas as contas, inclusive as de cliente
-- desativado: como a sincronização está parada, aparecia "sincronização atrasada" (Abraço de Algodão, Look Oito Oito).
-- Agora: (1) a verificação ignora cliente desativado; (2) ao desativar, os alertas abertos dele são encerrados
-- (histórico mantido, motivo registrado); (3) ao reativar, a verificação volta a avaliar sozinha.
-- Ponto de volta: private.alert_candidates_antes_2026_10_30 (supabase/rollback/voltar_alertas_cliente_desativado_2026_10_30.sql).

alter function private.alert_candidates() rename to alert_candidates_antes_2026_10_30;
revoke all on function private.alert_candidates_antes_2026_10_30() from public, anon, authenticated;

create function private.alert_candidates()
returns table (
  alert_key text, type text, severity text, client_id uuid, platform_id text, ad_account_id uuid, campaign_id uuid,
  description text, recommended_action text, details jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  select c.*
    from private.alert_candidates_antes_2026_10_30() c
   where private.client_is_active(c.client_id)
$$;
revoke all on function private.alert_candidates() from public, anon, authenticated;

-- Encerra, sem apagar, os alertas abertos de clientes que já estão desativados.
update public.alerts a
   set status = 'resolvido', resolved_at = now(), resolution = 'automatica',
       details = a.details || jsonb_build_object('closed_reason', 'cliente_desativado')
 where a.status <> 'resolvido'
   and not private.client_is_active(a.client_id);

-- Ao desativar um cliente, os alertas abertos dele são encerrados na hora.
create function private.clients_status_alertas()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  if new.status = 'encerrado' and old.status <> 'encerrado' then
    update public.alerts a
       set status = 'resolvido', resolved_at = now(), resolution = 'automatica',
           details = a.details || jsonb_build_object('closed_reason', 'cliente_desativado')
     where a.client_id = new.id and a.status <> 'resolvido';
  end if;
  return new;
end;
$$;
revoke all on function private.clients_status_alertas() from public, anon, authenticated;
create trigger clients_status_alertas after update of status on public.clients
  for each row execute function private.clients_status_alertas();
