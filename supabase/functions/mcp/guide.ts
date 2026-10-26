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
    "## Ferramentas de consulta disponíveis para você",
    ...tools.filter((t) => !t.write).map((t) => `- **${t.name}** — ${t.description}`),
    "",
    "## Ferramentas que mudam algo no CRM (Central de Operações)",
    ...(tools.some((t) => t.write) ? tools.filter((t) => t.write).map((t) => `- **${t.name}** — ${t.description}`) : ["- Nenhuma para o seu usuário."]),
    "",
    "## Regras",
    "- Escrita só na Central de Operações (tarefas e, para o administrador, setores, status, colunas e tipos de atividade), com as mesmas permissões do site e o histórico de sempre. Nada é apagado: arquivar e desativar são reversíveis.",
    "- Nenhuma ferramenta altera clientes, campanhas, orçamentos, saldos, usuários, permissões ou integrações, nem mexe no Meta ou no Google.",
    "- Antes de editar uma tarefa, leia a versão (backstage_get_task); se alguém mudou no meio, a edição é recusada.",
    "- Números só das APIs oficiais (Meta, Google) já guardados no CRM. Se faltar um dado: \"Informação não disponível pela API\". Nunca estimar.",
    "- Moedas separadas: BRL e USD nunca são somados.",
    "- Datas no horário de Brasília (AAAA-MM-DD).",
    `- Limites: 60 chamadas por minuto por pessoa; até ${MAX_DAYS} dias por consulta; até 100 itens por página; 20 segundos por consulta.`,
    "- Isolamento: clientes não liberados para você não aparecem, mesmo que o ID seja enviado.",
    "- Cada chamada fica registrada (ferramenta, pessoa, resultado e tempo; sem dados nem tokens) por 180 dias.",
  ].join("\n");
}
