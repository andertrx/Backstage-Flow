-- =============================================================================
-- Testes da Etapa 28 — Preparação para novas plataformas
-- Garante que o banco aceita uma plataforma nova (TikTok, LinkedIn...) só com
-- uma linha em public.platforms, sem mudar tabelas.
-- Rodar inteiro no SQL Editor. Transação desfeita no final: nada fica gravado.
-- =============================================================================
begin;

do $$
declare
  v_list text;
  v_client uuid;
  v_account uuid;
begin
  -- 1) As plataformas de hoje, ativas e na ordem do menu.
  select string_agg(id, ',' order by sort_order) into v_list from public.platforms where enabled;
  if v_list is distinct from 'meta,google' then raise exception 'FALHOU: plataformas ativas = %', v_list; end if;

  -- 2) Toda coluna de plataforma aponta para public.platforms (nenhuma lista fixa).
  select string_agg(c.table_name || '.' || c.column_name, ', ') into v_list
    from information_schema.columns c
    join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name and t.table_type = 'BASE TABLE'
   where c.table_schema in ('public', 'private') and c.column_name in ('platform_id', 'provider', 'platform')
     and not exists (
       select 1 from pg_constraint k
        where k.contype = 'f' and k.conrelid = format('%I.%I', c.table_schema, c.table_name)::regclass
          and k.confrelid = 'public.platforms'::regclass
          and (select attname from pg_attribute where attrelid = k.conrelid and attnum = k.conkey[1]) = c.column_name);
  if v_list is not null then raise exception 'FALHOU: colunas de plataforma sem ligação com public.platforms: %', v_list; end if;

  -- 3) Nenhum tipo fixo (enum) com nome de plataforma.
  select string_agg(distinct t.typname, ', ') into v_list from pg_enum e join pg_type t on t.oid = e.enumtypid
   where e.enumlabel in ('meta', 'google');
  if v_list is not null then raise exception 'FALHOU: enum com plataforma fixa: %', v_list; end if;

  -- 4) Plataforma nova = uma linha. Conexão, conta e números passam a ser aceitos.
  insert into public.platforms (id, name, enabled, sort_order) values ('tiktok_teste', 'TikTok Ads (teste)', false, 99);
  insert into public.clients (name) values ('Cliente teste Etapa 28') returning id into v_client;
  insert into public.platform_connections (platform_id, label) values ('tiktok_teste', 'Conexão teste');
  insert into public.ad_accounts (platform_id, external_id, client_id, name, currency)
  values ('tiktok_teste', '7001', v_client, 'Conta teste', 'BRL') returning id into v_account;
  insert into public.metrics_daily (ad_account_id, platform_id, client_id, level, entity_external_id, date, currency, spend_micros, impressions, clicks, hash)
  values (v_account, 'tiktok_teste', v_client, 'account', '7001', current_date - 1, 'BRL', 1000000, 100, 5, 'teste');

  -- 5) Plataforma que não existe continua recusada.
  begin
    insert into public.ad_accounts (platform_id, external_id, client_id, name) values ('inexistente', '1', v_client, 'x');
    raise exception 'FALHOU: aceitou plataforma inexistente';
  exception when foreign_key_violation then null;
  end;

  -- 6) Id fora do padrão é recusado.
  begin
    insert into public.platforms (id, name) values ('TikTok Ads', 'x');
    raise exception 'FALHOU: aceitou id de plataforma fora do padrão';
  exception when check_violation then null;
  end;

  raise notice 'Etapa 28: TODOS OS TESTES PASSARAM';
end $$;

rollback;
