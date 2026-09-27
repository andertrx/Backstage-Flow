/**
 * Central de Operações (Etapa 36): permissões próprias, por pessoa.
 * A mesma lista é conferida no banco (private.ops_can). O admin pode tudo;
 * gerenciar setores, equipe e configurações é só do admin ("ops.admin").
 */
export const OPS_PERMISSIONS = [
  "ops.access",
  "ops.kanban.view",
  "ops.tasks.create",
  "ops.tasks.edit",
  "ops.tasks.archive",
  "ops.tasks.assign",
  "ops.tasks.sector",
  "ops.cards.move",
  "ops.clients.view",
  "ops.history.edit",
  "ops.meetings.manage",
  "ops.dashboard.view",
  "ops.commercial",
] as const;

export type OpsPermission = (typeof OPS_PERMISSIONS)[number] | "ops.admin";

export const OPS_PERMISSION_LABELS: Record<(typeof OPS_PERMISSIONS)[number], string> = {
  "ops.access": "Acessar a Central de Operações",
  "ops.kanban.view": "Ver o Kanban",
  "ops.tasks.create": "Criar tarefas",
  "ops.tasks.edit": "Editar tarefas",
  "ops.tasks.archive": "Arquivar ou excluir tarefas",
  "ops.tasks.assign": "Atribuir responsáveis",
  "ops.tasks.sector": "Mudar o setor das tarefas",
  "ops.cards.move": "Mover cartões no Kanban",
  "ops.clients.view": "Ver a ficha operacional dos clientes",
  "ops.history.edit": "Registrar atividades no histórico operacional",
  "ops.meetings.manage": "Criar reuniões e Dailies",
  "ops.dashboard.view": "Ver o dashboard operacional",
  "ops.commercial": "Comercial: leads e conversão em cliente",
};

/** Marcadas ao colocar alguém na Central (o admin ajusta). */
export const OPS_DEFAULT_PERMISSIONS: (typeof OPS_PERMISSIONS)[number][] = [
  "ops.access", "ops.kanban.view", "ops.tasks.create", "ops.tasks.edit", "ops.cards.move", "ops.dashboard.view",
];

export function opsCan(granted: readonly string[] | null | undefined, permission: OpsPermission): boolean {
  if (!granted) return false;
  if (granted.includes("ops.admin")) return true;
  return granted.includes("ops.access") && granted.includes(permission);
}

/** Paleta da Central (referência visual da Etapa 36), para setores e colunas. */
export const OPS_COLORS = ["#7C3AED", "#A855F7", "#06B6D4", "#22D3EE", "#10B981", "#F59E0B", "#EF4444", "#EC4899", "#3B82F6", "#64748B"] as const;

export const OPS_SECTOR_STATUS_LABELS = { ativo: "Ativo", inativo: "Inativo", arquivado: "Arquivado" } as const;
export type OpsSectorStatus = keyof typeof OPS_SECTOR_STATUS_LABELS;
