-- Fase J.1 — "Controle total": resultado da leitura de volta das automações do Meta em cada item publicado.
-- Criativo: {"kind":"criativo","ligadas":[...]} (melhorias que o Meta deixou ligadas; vazio = todas desligadas).
-- Conjunto: {"kind":"conjunto","advantageAudience":bool,"placements":"manual"|"automatic"}.
-- Só o servidor grava (service role). A leitura segue a política que já existe em publish_items (clientes que a pessoa enxerga).
alter table public.publish_items add column if not exists automations_check jsonb
  check (automations_check is null or (jsonb_typeof(automations_check) = 'object' and pg_column_size(automations_check) <= 20000));

comment on column public.publish_items.automations_check is 'Fase J.1: leitura de volta das automações do Meta (melhorias ligadas no criativo; Público Advantage+ e posicionamentos no conjunto). Permanente, como o item.';
