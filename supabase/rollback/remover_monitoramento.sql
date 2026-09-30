-- =============================================================================
-- REMOÇÃO do Monitoramento de Desempenho (Etapa 37).
--
-- 37.1: apaga as regras e limites (monitor_rules, com o histórico delas), as
-- funções do módulo e os campos do criativo nos anúncios (creative_external_id,
-- preview_link — voltam a ser preenchidos se o módulo for reinstalado).
-- NÃO mexe em clientes, usuários, métricas, campanhas nem anúncios.
-- Só rodar com decisão explícita, no SQL Editor. Depois: reverter os commits da
-- Etapa 37 no GitHub e publicar de novo a Edge Function "sync".
-- (As fases seguintes acrescentam seus trechos aqui.)
-- =============================================================================
begin;

drop function if exists public.monitor_rule_archive(uuid);
drop function if exists private.monitor_rule_archive_impl(uuid);
drop function if exists public.monitor_rule_save(uuid, text, uuid, text, text, numeric, numeric, integer, boolean, text);
drop function if exists private.monitor_rule_save_impl(uuid, text, uuid, text, text, numeric, numeric, integer, boolean, text);
drop function if exists public.monitor_rules_list(boolean);
drop function if exists private.monitor_rules_list_impl(boolean);
drop function if exists private.monitor_scope_name(text, uuid);
drop function if exists private.monitor_scope_client(text, uuid);
drop table if exists public.monitor_rules;
drop function if exists private.monitor_can(text);

drop index if exists public.ads_creative_idx;
alter table public.ads drop column if exists creative_external_id;
alter table public.ads drop column if exists preview_link;

-- Conferência: nada do módulo pode sobrar.
do $$ begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname in ('public', 'private') and p.proname like 'monitor%')
     or exists (select 1 from information_schema.tables where table_schema = 'public' and table_name like 'monitor%') then
    raise exception 'Sobrou algo do Monitoramento: confira antes de concluir.';
  end if;
end $$;

commit;
