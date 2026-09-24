/**
 * Papéis de usuário do sistema.
 *
 * A lista precisa ser igual ao tipo `public.user_role` do banco
 * (supabase/migrations/*_auth_profiles.sql). O banco é quem garante a regra;
 * este arquivo serve para a interface e para as Edge Functions.
 */
export const ROLES = ["admin", "gestor", "operador", "visualizador", "cliente"] as const;

export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  admin: "Administrador",
  gestor: "Gestor",
  operador: "Operador",
  visualizador: "Visualizador",
  cliente: "Cliente",
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  admin: "Acesso total, incluindo usuários, conexões e configurações.",
  gestor: "Gerencia os clientes autorizados: cadastro, contas, sincronização e alertas.",
  operador: "Acompanha os clientes autorizados e executa tarefas operacionais.",
  visualizador: "Somente leitura dos clientes autorizados.",
  cliente: "Vê apenas os dados da própria empresa, na visão simplificada.",
};

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}
