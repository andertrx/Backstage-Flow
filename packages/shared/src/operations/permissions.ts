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
  "ops.envios",
] as const;

/** "ops.admin": só o admin. "ops.am": Account Manager de algum cliente (vem do banco, não é marcada à mão). */
export type OpsPermission = (typeof OPS_PERMISSIONS)[number] | "ops.admin" | "ops.am";

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
  "ops.envios": "Envios semanais: configurar mensagens para grupos e ver o histórico",
};

/** Marcadas ao colocar alguém na Central (o admin ajusta). */
export const OPS_DEFAULT_PERMISSIONS: (typeof OPS_PERMISSIONS)[number][] = [
  "ops.access", "ops.kanban.view", "ops.tasks.create", "ops.tasks.edit", "ops.cards.move", "ops.dashboard.view",
];

/**
 * Modelos de função (43.3): só PRÉ-MARCAM as permissões da Central na tela da equipe; o administrador confere e salva.
 * Não mudam o papel do sistema (o papel sugerido é só uma dica) e não mexem no banco.
 */
export interface OpsRoleTemplate {
  id: "gestor_trafego" | "operacao" | "comercial" | "administrador";
  label: string;
  description: string;
  /** Papel do sistema que costuma combinar (dica; quem muda o papel é a aba Usuários). */
  suggestedRole: "admin" | "gestor" | "operador" | "equipe";
  permissions: (typeof OPS_PERMISSIONS)[number][];
}

export const OPS_ROLE_TEMPLATES: readonly OpsRoleTemplate[] = [
  {
    id: "gestor_trafego", label: "Gestor de tráfego", suggestedRole: "gestor",
    description: "Cuida das contas e campanhas: tarefas, ficha dos clientes, reuniões, painel e envios semanais.",
    permissions: ["ops.access", "ops.kanban.view", "ops.tasks.create", "ops.tasks.edit", "ops.tasks.assign", "ops.cards.move", "ops.clients.view",
      "ops.history.edit", "ops.meetings.manage", "ops.dashboard.view", "ops.envios"],
  },
  {
    id: "operacao", label: "Operação", suggestedRole: "equipe",
    description: "Executa as tarefas do dia: Kanban, tarefas, ficha dos clientes, histórico e reuniões.",
    permissions: ["ops.access", "ops.kanban.view", "ops.tasks.create", "ops.tasks.edit", "ops.cards.move", "ops.clients.view", "ops.history.edit", "ops.meetings.manage"],
  },
  {
    id: "comercial", label: "Comercial", suggestedRole: "equipe",
    description: "Cuida dos leads e da conversão em cliente, com tarefas e reuniões.",
    permissions: ["ops.access", "ops.kanban.view", "ops.tasks.create", "ops.tasks.edit", "ops.cards.move", "ops.commercial", "ops.clients.view", "ops.meetings.manage"],
  },
  {
    id: "administrador", label: "Administrador", suggestedRole: "admin",
    description: "Todas as permissões da Central. Setores, equipe e configurações só funcionam para quem tem o papel Administrador.",
    permissions: [...OPS_PERMISSIONS],
  },
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
