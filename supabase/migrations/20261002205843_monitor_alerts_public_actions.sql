-- Etapa 37.3 — funções da tela (avaliar agora, configuração, situação, lista de alertas).
-- ------------------------------------------------------------ funções da tela

-- "Avaliar agora" (admin e gestor), no máximo uma vez a cada 2 minutos.
create or replace function private.monitor_evaluate_now_impl()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.monitor_can('rules') then
    raise exception 'Sem permissão para avaliar agora' using errcode = '42501';
  end if;
  if exists (select 1 from public.monitor_runs r where r.started_at > now() - interval '2 minutes') then
    raise exception 'Uma avaliação acabou de rodar. Aguarde 2 minutos para avaliar de novo.' using errcode = '22023';
  end if;
  return private.monitor_evaluate('manual', (select auth.uid()));
end;
$$;
revoke all on function private.monitor_evaluate_now_impl() from public, anon;
grant execute on function private.monitor_evaluate_now_impl() to authenticated;
create or replace function public.monitor_evaluate_now() returns jsonb language sql set search_path = ''
as $$ select private.monitor_evaluate_now_impl() $$;
revoke all on function public.monitor_evaluate_now() from public, anon;
grant execute on function public.monitor_evaluate_now() to authenticated;

-- Configuração (só o admin muda).
create or replace function private.monitor_settings_save_impl(p_enabled boolean, p_interval integer, p_stale_hours integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.monitor_can('admin') then
    raise exception 'Só o administrador muda a frequência do monitoramento' using errcode = '42501';
  end if;
  if p_interval is null or p_interval not in (15, 30, 60, 180, 360, 1440) then
    raise exception 'Frequência inválida.' using errcode = '22023';
  end if;
  if p_stale_hours is null or p_stale_hours not between 1 and 48 then
    raise exception 'O atraso tolerado precisa ser de 1 a 48 horas.' using errcode = '22023';
  end if;
  update public.monitor_settings set enabled = coalesce(p_enabled, true), eval_interval_minutes = p_interval,
         stale_hours = p_stale_hours, updated_at = now(), updated_by = (select auth.uid())
   where id = 1;
end;
$$;
revoke all on function private.monitor_settings_save_impl(boolean, integer, integer) from public, anon;
grant execute on function private.monitor_settings_save_impl(boolean, integer, integer) to authenticated;
create or replace function public.monitor_settings_save(p_enabled boolean, p_interval integer, p_stale_hours integer default 3)
returns void language sql set search_path = ''
as $$ select private.monitor_settings_save_impl(p_enabled, p_interval, p_stale_hours) $$;
revoke all on function public.monitor_settings_save(boolean, integer, integer) from public, anon;
grant execute on function public.monitor_settings_save(boolean, integer, integer) to authenticated;
