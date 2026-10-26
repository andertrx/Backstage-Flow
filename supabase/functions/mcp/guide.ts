import type { Caller, ToolSpec } from "./tools.ts";
import { MAX_DAYS, MCP_VERSION } from "./tools.ts";

/** Etapa 40 — recurso "backstage://guia": o que o MCP faz, para quem, e as regras. Sem dados internos. */
export function guide(user: Caller, tools: ToolSpec[]): string {
  return [
    `# Backstage Flow — servidor MCP ${MCP_VERSION}`,
    "",
    "CRM de agência de tráfego pago: clientes, contas de anúncio (Meta Ads e Google Ads), métricas, saldos, Monitoramento de Desempenho, relatórios, tracking e Central de Operações.",
    "",
    `Você está conectado como **${user.name || "usuário"}** (papel: ${user.role}). Você vê aqui exatamente o que já vê no CRM.`,
    "",
    "## Ferramentas disponíveis para você (todas só de leitura)",
    ...tools.map((t) => `- **${t.name}** — ${t.description}`),
    "",
    "## Regras",
    "- Somente leitura: nenhuma ferramenta altera clientes, campanhas, orçamentos, saldos, usuários ou integrações.",
    "- Números só das APIs oficiais (Meta, Google) já guardados no CRM. Se faltar um dado: \"Informação não disponível pela API\". Nunca estimar.",
    "- Moedas separadas: BRL e USD nunca são somados.",
    "- Datas no horário de Brasília (AAAA-MM-DD).",
    `- Limites: 60 chamadas por minuto por pessoa; até ${MAX_DAYS} dias por consulta; até 100 itens por página; 20 segundos por consulta.`,
    "- Isolamento: clientes não liberados para você não aparecem, mesmo que o ID seja enviado.",
    "- Cada chamada fica registrada (ferramenta, pessoa, resultado e tempo; sem dados nem tokens) por 180 dias.",
  ].join("\n");
}
