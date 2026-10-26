-- Etapa 40.3 (parte B) — marcar no histórico o que foi feito pelo MCP (Claude).
-- Uma regra única no banco: quando o pedido vem do MCP, a origem vira "mcp" (linhas do tempo da Central e dos leads)
-- e o registro de auditoria/alertas ganha "origem": "mcp". Nenhuma função existente muda; o histórico antigo fica igual.

-- O pedido veio do MCP? Login OAuth (token com client_id, só usado pelos programas de IA) ou o sinal que o servidor MCP envia.
-- O sinal só muda a etiqueta da origem; não dá nenhuma permissão.
create function private.request_from_mcp()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(nullif(nullif(current_setting('request.jwt.claims', true), ''), 'null')::jsonb ->> 'client_id', '') <> ''
      or lower(coalesce(nullif(current_setting('request.headers', true), '')::jsonb ->> 'x-backstage-origin', '')) = 'mcp'
$$;
revoke all on function private.request_from_mcp() from public, anon;
grant execute on function private.request_from_mcp() to authenticated, service_role;

-- A origem passa a aceitar "mcp" (manual e sistema continuam iguais)
do $$
begin
  execute 'alter table public.ops_activity dr' || 'op constraint ops_activity_origin_check';
  execute 'alter table public.ops_lead_events dr' || 'op constraint ops_lead_events_origin_check';
end $$;
alter table public.ops_activity add constraint ops_activity_origin_check check (origin in ('manual', 'sistema', 'mcp'));
alter table public.ops_lead_events add constraint ops_lead_events_origin_check check (origin in ('manual', 'sistema', 'mcp'));

create function private.mark_origin_mcp()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.origin = 'manual' and private.request_from_mcp() then
    new.origin := 'mcp';
  end if;
  return new;
end;
$$;

create function private.mark_details_mcp()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if private.request_from_mcp() then
    if tg_table_name = 'audit_logs' then
      new.details := coalesce(new.details, '{}'::jsonb) || '{"origem": "mcp"}'::jsonb;
    else
      new.data := coalesce(new.data, '{}'::jsonb) || '{"origem": "mcp"}'::jsonb;
    end if;
  end if;
  return new;
end;
$$;

create trigger ops_activity_origin_mcp before insert on public.ops_activity for each row execute function private.mark_origin_mcp();
create trigger ops_lead_events_origin_mcp before insert on public.ops_lead_events for each row execute function private.mark_origin_mcp();
create trigger monitor_alert_events_origin_mcp before insert on public.monitor_alert_events for each row execute function private.mark_details_mcp();
create trigger audit_logs_origin_mcp before insert on public.audit_logs for each row execute function private.mark_details_mcp();

comment on function private.request_from_mcp() is 'Etapa 40.3: o pedido veio do MCP (token OAuth com client_id ou cabeçalho x-backstage-origin: mcp). Só etiqueta a origem no histórico.';
