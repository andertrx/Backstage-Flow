-- Pedido 13/10/2026: frase do resumo do relatório editável por cliente.
-- Texto com marcadores ({investimento}, {resultados}, {custo_por_resultado}, {nome_resultado}, {comparacao})
-- que o sistema troca pelos números reais do período. Vazio = frase automática.
alter table public.client_report_settings add column summary_template text
  check (summary_template is null or char_length(summary_template) <= 500);
comment on column public.client_report_settings.summary_template is
  'Frase do resumo editável (marcadores trocados pelos números reais do período). Nulo = frase automática.';
