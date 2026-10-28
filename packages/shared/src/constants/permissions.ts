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
  "results.view",
  "results.manage",
  "contacts.view",
  "contacts.mark",
  "contacts.setup",
  "ads.builder",
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
    "results.view",
    "results.manage",
    "contacts.view",
    "contacts.mark",
    "contacts.setup",
    "ads.builder",
  ],
  operador: ["clients.view", "sync.run", "alerts.manage", "reports.generate", "internal.view", "tracking.view", "tracking.whatsapp", "monitor.view", "monitor.handle", "results.view", "contacts.view", "contacts.mark", "ads.builder"],
  visualizador: ["clients.view", "internal.view", "tracking.view", "monitor.view", "results.view", "contacts.view"],
  // Etapa 36: só a Central de Operações (permissões próprias, por pessoa).
  equipe: [],
  // T3.1: equipe de vendas do cliente — só os contatos (o banco confere quais clientes).
  vendedor: ["contacts.view", "contacts.mark"],
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
  "results.view": "Ver a Inteligência de Resultados (perfis comerciais por campanha, conjunto e anúncio, vindos da planilha do cliente)",
  "results.manage": "Conectar e configurar a planilha do Google Sheets de cada cliente (colunas e regras dos perfis)",
  "contacts.view": "Ver os contatos dos clientes (de onde veio, perfil, etapa e vendas)",
  "contacts.mark": "Marcar contatos: perfil (Lojista...), etapa e venda — o que vai ao Meta",
  "contacts.setup": "Configurar os perfis e as etapas dos contatos de cada cliente (e o que vai ao Meta)",
  "ads.builder": "Usar o Criador de Anúncios (montar pedidos para o Claude criar anúncios no Meta)",
};

/** Quais clientes cada papel enxerga (a regra que o banco aplica em toda consulta). */
export const ROLE_SCOPE: Record<Role, string> = {
  admin: "Todos os clientes",
  gestor: "Só os clientes liberados para ele",
  operador: "Só os clientes liberados para ele",
  visualizador: "Só os clientes liberados para ele",
  equipe: "Nenhum pelos módulos de anúncios; na Central, só o necessário para as tarefas",
  vendedor: "Só os contatos dos clientes liberados para ele (nada mais do CRM)",
  cliente: "Só a própria empresa, sem informações internas",
};
