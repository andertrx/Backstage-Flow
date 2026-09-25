import type { Role } from "./roles.ts";

/**
 * Permissões usadas pela INTERFACE para mostrar ou esconder itens.
 *
 * Importante: isto não é a segurança do sistema. Quem realmente bloqueia o
 * acesso são as regras RLS do banco e as verificações das Edge Functions.
 */
export const PERMISSIONS = [
  "users.manage",
  "clients.view",
  "clients.edit",
  "accounts.connect",
  "sync.run",
  "alerts.manage",
  "reports.generate",
  "logs.view",
  "settings.manage",
  "internal.view",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  admin: PERMISSIONS,
  gestor: [
    "clients.view",
    "clients.edit",
    "sync.run",
    "alerts.manage",
    "reports.generate",
    "logs.view",
    "internal.view",
  ],
  operador: ["clients.view", "sync.run", "alerts.manage", "reports.generate", "internal.view"],
  visualizador: ["clients.view", "internal.view"],
  cliente: [],
};

export function can(role: Role | null | undefined, permission: Permission): boolean {
  if (!role) return false;
  return ROLE_PERMISSIONS[role].includes(permission);
}

/** O que cada permissão libera, em português simples (tela "Papéis e permissões"). */
export const PERMISSION_LABELS: Record<Permission, string> = {
  "internal.view": "Ver o painel interno (Dashboard completo, contas, campanhas, alertas e sincronização)",
  "clients.view": "Ver a lista de clientes",
  "clients.edit": "Cadastrar e editar clientes e vincular contas de anúncio",
  "accounts.connect": "Conectar e desconectar o Meta Ads e o Google Ads",
  "sync.run": "Sincronizar agora",
  "alerts.manage": "Tratar alertas (marcar como visto, resolver, verificar agora)",
  "reports.generate": "Gerar relatórios (CSV, Excel e PDF)",
  "logs.view": "Ver os logs (o gestor vê só as sincronizações)",
  "users.manage": "Criar usuários e mudar papéis e acessos",
  "settings.manage": "Abrir as Configurações",
};

/** Quais clientes cada papel enxerga (a regra que o banco aplica em toda consulta). */
export const ROLE_SCOPE: Record<Role, string> = {
  admin: "Todos os clientes",
  gestor: "Só os clientes liberados para ele",
  operador: "Só os clientes liberados para ele",
  visualizador: "Só os clientes liberados para ele",
  cliente: "Só a própria empresa, sem informações internas",
};
