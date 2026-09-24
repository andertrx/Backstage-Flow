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
