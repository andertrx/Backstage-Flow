-- T5.35 (etapa 4): visão de marketing — o caminho até a venda.
--
-- A pergunta que o gestor de tráfego faz todo dia: "de onde veio cada venda e o que
-- eu ganhei com isso?". O CRM já tem o pedaço de volume (tracking_attribution: leads,
-- compras e receita por origem e por campanha). Faltava o pedaço de CAMINHO: quantas
-- origens a pessoa tocou antes de converter e quanto tempo levou.
--
-- Esta função é só LEITURA (nenhuma tabela nova, nada gravado, nada coletado do
-- cliente). Roda com a permissão de quem pergunta (security invoker): a RLS de
-- tracking_leads e tracking_touchpoints já garante que cada pessoa só veja os
-- clientes liberados para ela, e o papel "cliente" não vê nada.
--
--   tracking_journey_summary(de, até)
--     Por cliente: quantos leads e compras houve no período, como as origens se
--     distribuem (0, 1, 2-3, 4 ou mais toques antes de converter), a média de toques,
--     a média de dias entre a primeira origem e a conversão, o caminho mais curto e
--     quantos leads vieram de origem paga.
--
-- Um "toque" é uma origem registrada (tracking_touchpoints) da mesma pessoa, em qualquer
-- aparelho que ela usou, até o momento da conversão. Eventos de página (scroll, clique) NÃO contam:
-- o que interessa aqui é quantas vezes ela voltou por um caminho diferente.

create function public.tracking_journey_summary(p_from timestamptz, p_to timestamptz)
returns table (
  client_id        uuid,
  leads            bigint,
  purchases        bigint,
  toques_0         bigint,
  toques_1         bigint,
  toques_2_3       bigint,
  toques_4p        bigint,
  media_toques     numeric,
  media_dias       numeric,
  mais_rapido_dias integer,
  origem_paga      bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  with leads_periodo as (
    select l.id, l.client_id, l.container_id, l.first_converted_at, l.purchases
      from public.tracking_leads l
     where l.first_converted_at >= p_from
       and l.first_converted_at < p_to
  ),
  vis as (
    -- Todos os aparelhos/navegadores da pessoa (o lead é o mesmo, o aparelho pode mudar).
    select v.container_id, v.visitor_id, v.lead_id
      from public.tracking_visitors v
      join leads_periodo le on le.id = v.lead_id and le.container_id = v.container_id
  ),
  toques as (
    select le.id,
           le.client_id,
           le.purchases,
           le.first_converted_at,
           count(distinct t.id) as n_toques,
           min(t.occurred_at) as primeiro,
           coalesce(bool_or(t.paid), false) as pago
      from leads_periodo le
      left join vis on vis.lead_id = le.id
      left join public.tracking_touchpoints t
        on t.container_id = vis.container_id
       and t.visitor_id = vis.visitor_id
       and t.occurred_at <= le.first_converted_at
     group by le.id, le.client_id, le.purchases, le.first_converted_at
  )
  select x.client_id,
         count(*)::bigint,
         coalesce(sum(x.purchases), 0)::bigint,
         count(*) filter (where x.n_toques = 0),
         count(*) filter (where x.n_toques = 1),
         count(*) filter (where x.n_toques between 2 and 3),
         count(*) filter (where x.n_toques >= 4),
         round(avg(x.n_toques::numeric) filter (where x.n_toques > 0), 1),
         round(avg(extract(epoch from (x.first_converted_at - x.primeiro)) / 86400) filter (where x.primeiro is not null), 1),
         (min(extract(epoch from (x.first_converted_at - x.primeiro)) / 86400) filter (where x.primeiro is not null))::integer,
         count(*) filter (where x.pago)::bigint
    from toques x
   group by x.client_id
$$;
revoke all on function public.tracking_journey_summary(timestamptz, timestamptz) from public, anon;
grant execute on function public.tracking_journey_summary(timestamptz, timestamptz) to authenticated, service_role;

comment on function public.tracking_journey_summary(timestamptz, timestamptz) is
  'T5.35: caminho até a venda — quantas origens a pessoa tocou antes de converter e quanto tempo levou. Só leitura.';
