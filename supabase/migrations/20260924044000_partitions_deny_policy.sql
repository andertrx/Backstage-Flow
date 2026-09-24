-- As gavetas mensais (history.metrics_daily_AAAA_MM) só podem ser lidas pela
-- tabela-mãe public.metrics_daily, que tem as regras RLS por cliente.
-- Esta política explícita de negação deixa a intenção clara (e zera o aviso
-- "RLS Enabled No Policy" do Supabase Advisor), inclusive nas gavetas futuras.
create or replace function private.ensure_metrics_partition(p_month date)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  first_day date := date_trunc('month', p_month)::date;
  next_day  date := (date_trunc('month', p_month) + interval '1 month')::date;
  part_name text := 'metrics_daily_' || to_char(first_day, 'YYYY_MM');
begin
  if to_regclass('history.' || part_name) is not null then return; end if;
  perform pg_advisory_xact_lock(hashtext(part_name)); -- evita duas criações ao mesmo tempo
  if to_regclass('history.' || part_name) is not null then return; end if;

  execute format('create table history.%I partition of public.metrics_daily for values from (%L) to (%L)', part_name, first_day, next_day);
  execute format('revoke all on table history.%I from public, anon, authenticated', part_name);
  execute format('alter table history.%I enable row level security', part_name);
  execute format('create policy "Acesso só pela tabela-mãe" on history.%I for all to anon, authenticated using (false) with check (false)', part_name);
end;
$$;

revoke all on function private.ensure_metrics_partition(date) from public, anon, authenticated;

-- Aplica a mesma política às gavetas que já existem.
do $$
declare
  part record;
begin
  for part in
    select c.relname
    from pg_inherits i
    join pg_class c on c.oid = i.inhrelid
    join pg_namespace n on n.oid = c.relnamespace
    where i.inhparent = 'public.metrics_daily'::regclass and n.nspname = 'history'
  loop
    if not exists (select 1 from pg_policies where schemaname = 'history' and tablename = part.relname) then
      execute format('create policy "Acesso só pela tabela-mãe" on history.%I for all to anon, authenticated using (false) with check (false)', part.relname);
    end if;
  end loop;
end $$;
