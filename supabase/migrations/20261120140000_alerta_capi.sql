-- Auditoria de 20/11/2026: o CAPI (API de Conversões do Meta) não era monitorado.
-- Um token vencido ou um Pixel errado fazia as conversões pararem de ir para o Meta
-- e ninguém era avisado: o aviso só aparecia se alguém abrisse a tela do Tracking.
--
-- Agora isso vira um alerta de verdade, no mesmo Alerts que a agência já usa:
--   * "Conversões do site não estão sendo enviadas ao Meta"
--   * some sozinho quando um envio volta a dar certo.
--
-- O alerta é por SITE (não por conta de anúncio), então a coluna ad_account_id
-- passa a aceitar nulo. A tela já tratava esse campo como opcional.

-- 1) O tipo novo de alerta e a conta de anúncio opcional.
alter table public.alerts drop constraint if exists alerts_type_check;
alter table public.alerts
  add constraint alerts_type_check check (type in (
    'sem_saldo', 'saldo_baixo', 'conta_restrita', 'conta_desativada', 'pagamento_pendente',
    'cobranca_problema', 'sem_forma_pagamento', 'sincronizacao_atrasada', 'erro_api',
    'campanha_sem_entrega', 'queda_resultados', 'capi_erro'));

alter table public.alerts alter column ad_account_id drop not null;

-- 2) Os candidatos do CAPI: um por destino com envio quebrado nas últimas 24 h.
--    "Quebrado" = o último erro é mais novo que o último acerto.
create or replace function private.alert_candidates_capi()
returns table (
  alert_key text, type text, severity text, client_id uuid, platform_id text, ad_account_id uuid, campaign_id uuid,
  description text, recommended_action text, details jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  select 'capi_erro:' || d.id,
         'capi_erro',
         case when p.descartados > 0 then 'critica' else 'alta' end,
         d.client_id,
         null::text,
         null::uuid,
         null::uuid,
         'As conversões do site "' || coalesce(c.name, 'sem nome') || '" não estão sendo enviadas ao Meta: '
           || coalesce(d.last_error_message, 'erro não informado'),
         'Tracking → Configurações → Meta CAPI: conferir o token da API de Conversões e o ID do Pixel deste site.',
         jsonb_build_object('destination_id', d.id, 'container_id', d.container_id, 'pixel_id', d.pixel_id,
                            'erro', d.last_error_message, 'ultimo_erro_em', d.last_error_at,
                            'ultimo_sucesso_em', d.last_success_at, 'eventos_descartados_24h', p.descartados)
    from public.tracking_destinations d
    join public.tracking_containers c on c.id = d.container_id
    left join lateral (
      select count(*)::int as descartados
        from public.tracking_capi_queue q
       where q.destination_id = d.id
         and q.status = 'descartado'
         and coalesce(q.discarded_at, q.created_at) > now() - interval '24 hours'
    ) p on true
   where d.enabled
     and d.last_error_at is not null
     and d.last_error_at > now() - interval '24 hours'
     -- O último erro tem que ser mais novo que o último acerto: senão já voltou a funcionar.
     and (d.last_success_at is null or d.last_error_at > d.last_success_at)
$$;
revoke all on function private.alert_candidates_capi() from public, anon, authenticated;

-- 3) Junta com os candidatos de sempre (o envelope já existia na 20261106223129).
create or replace function private.alert_candidates()
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
    from private.alert_candidates_base() c
   where private.client_is_active(c.client_id)
  union all
  select p.*
    from private.alert_candidates_capi() p
   where private.client_is_active(p.client_id)
$$;
revoke all on function private.alert_candidates() from public, anon, authenticated;
