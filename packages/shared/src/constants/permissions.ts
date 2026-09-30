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
  "tracking.view",
  "tracking.manage",
  "tracking.whatsapp",
  "monitor.view",
  "monitor.handle",
  "monitor.rules",
  "monitor.admin",
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
    "tracking.view",
    "tracking.manage",
    "tracking.whatsapp",
    "monitor.view",
    "monitor.handle",
    "monitor.rules",
  ],
  operador: ["clients.view", "sync.run", "alerts.manage", "reports.generate", "internal.view", "tracking.view", "tracking.whatsapp", "monitor.view", "monitor.handle"],
  visualizador: ["clients.view", "internal.view", "tracking.view", "monitor.view"],
  // Etapa 36: só a Central de Operações (permissões próprias, por pessoa).
  equipe: [],
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
  "tracking.view": "Ver o Tracking (visitas, origens e eventos dos sites dos clientes)",
  "tracking.manage": "Configurar o Tracking (containers, domínios autorizados e código de instalação)",
  "tracking.whatsapp": "Marcar conversas do WhatsApp como Lead ou Venda (pelo código de rastreio)",
  "monitor.view": "Ver o Monitoramento de Desempenho (variações, alertas de desempenho e histórico)",
  "monitor.handle": "Tratar alertas de desempenho (atribuir, comentar, registrar providência, resolver, virar tarefa)",
  "monitor.rules": "Gerenciar as regras e os limites do monitoramento (as que valem para todos: só o administrador)",
  "monitor.admin": "Administrar o Monitoramento (regras globais e notificações de outras pessoas)",
};

/** Quais clientes cada papel enxerga (a regra que o banco aplica em toda consulta). */
export const ROLE_SCOPE: Record<Role, string> = {
  admin: "Todos os clientes",
  gestor: "Só os clientes liberados para ele",
  operador: "Só os clientes liberados para ele",
  visualizador: "Só os clientes liberados para ele",
  equipe: "Nenhum pelos módulos de anúncios; na Central, só o necessário para as tarefas",
  cliente: "Só a própria empresa, sem informações internas",
};
