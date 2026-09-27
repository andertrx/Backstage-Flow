-- =============================================================================
-- Etapa 19.2 (ajuste) — limite de consultas do link secreto com contador
-- próprio (o limitador geral, private.rate_limits, só aceita usuários logados).
-- =============================================================================

alter table public.client_portal
  add column link_window_start timestamptz,
  add column link_window_hits integer not null default 0;

create or replace function public.client_report_public(p_token text, p_period text default null, p_from date default null, p_to date default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_portal public.client_portal;
  v_client public.clients;
  v_settings jsonb;
  v_period text;
  v_today date;
  v_from date;
  v_to date;
  v_hits integer;
begin
  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{43}$' then
    raise exception 'Link inválido ou desativado.' using errcode = 'P0002';
  end if;
  select * into v_portal from public.client_portal
   where link_token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
     and link_enabled and (link_expires_at is null or link_expires_at > now());
  if not found then raise exception 'Link inválido ou desativado.' using errcode = 'P0002'; end if;
  -- No máximo 300 consultas a cada 10 minutos por link (contador próprio:
  -- o limitador geral só aceita usuários logados).
  update public.client_portal
     set link_window_start = case when link_window_start is null or link_window_start <= now() - interval '10 minutes' then now() else link_window_start end,
         link_window_hits = case when link_window_start is null or link_window_start <= now() - interval '10 minutes' then 1 else link_window_hits + 1 end,
         link_last_used_at = now(), link_uses = link_uses + 1
   where client_id = v_portal.client_id
   returning link_window_hits into v_hits;
  if v_hits > 300 then
    raise exception 'Muitas consultas seguidas. Tente de novo em alguns minutos.' using errcode = '54000';
  end if;

  select * into v_client from public.clients where id = v_portal.client_id;
  select to_jsonb(s) - 'client_id' - 'updated_by' into v_settings from public.client_report_settings s where s.client_id = v_client.id;
  v_today := (now() at time zone v_client.timezone)::date;

  if p_from is not null or p_to is not null then
    if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 400 or p_to > v_today then
      raise exception 'Período inválido (até 400 dias, sem datas futuras).' using errcode = '22023';
    end if;
    v_period := 'custom'; v_from := p_from; v_to := p_to;
  else
    v_period := coalesce(p_period, v_settings ->> 'default_period', 'last_7_days');
    case v_period
      when 'last_7_days' then v_from := v_today - 7; v_to := v_today - 1;
      when 'last_14_days' then v_from := v_today - 14; v_to := v_today - 1;
      when 'last_30_days' then v_from := v_today - 30; v_to := v_today - 1;
      when 'this_month' then v_from := date_trunc('month', v_today)::date; v_to := v_today;
      when 'last_month' then v_from := (date_trunc('month', v_today) - interval '1 month')::date; v_to := date_trunc('month', v_today)::date - 1;
      else raise exception 'Período inválido.' using errcode = '22023';
    end case;
  end if;

  return jsonb_build_object(
    'client', jsonb_build_object('name', v_client.name, 'timezone', v_client.timezone),
    'settings', v_settings,
    'period', v_period, 'from', v_from, 'to', v_to, 'today', v_today,
    'accounts', coalesce((select jsonb_agg(to_jsonb(a)) from public.client_report_accounts(v_client.id, v_from, v_to) a), '[]'::jsonb),
    'daily', coalesce((select jsonb_agg(to_jsonb(d)) from public.client_report_daily(v_client.id, v_from, v_to) d), '[]'::jsonb),
    'campaigns', coalesce((select jsonb_agg(to_jsonb(c)) from public.client_report_campaigns(v_client.id, v_from, v_to) c), '[]'::jsonb));
end;
$$;
revoke all on function public.client_report_public(text, text, date, date) from public;
grant execute on function public.client_report_public(text, text, date, date) to anon, authenticated;
