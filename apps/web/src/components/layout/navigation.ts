import { can, opsCan, type OpsPermission, type Permission, PLATFORMS, type Role } from "@backstage/shared";
import {
  Activity,
  Bell,
  Building2,
  CalendarDays,
  ChartPie,
  ContactRound,
  Handshake,
  FileBarChart,
  FilePlus2,
  Gauge,
  KanbanSquare,
  LayoutDashboard,
  type LucideIcon,
  Radar,
  Send,
  Settings,
  Target,
  UserRoundCheck,
  Wallet,
  Wand2,
} from "lucide-react";
import { platformLook } from "@/features/platforms/look.ts";

export type NavGroup = "Visão geral" | "Operações" | "Anúncios" | "Análise" | "Sistema";

export interface NavItem {
  label: string;
  path: string;
  icon: LucideIcon;
  /** Grupo no menu lateral (os grupos seguem a ordem do menu, sem mudá-la). */
  group: NavGroup;
  /** Sem permissão = qualquer usuário ativo vê. */
  permission?: Permission;
  /** Papéis que não veem o item (ex.: Equipe não vê o Dashboard de anúncios). */
  hiddenFor?: Role[];
  /** Central de Operações (Etapa 36): aparece para quem tem a permissão dela, conferida no banco. */
  ops?: boolean;
  /** 43.6: módulo separado da Central (Comercial, Envios semanais): aparece para quem tem esta permissão da Central. */
  opsPermission?: OpsPermission;
  /** Configurações unificadas: aparece para quem pode abrir pelo menos uma aba. */
  anySettingsTab?: boolean;
}

export interface SettingsTab {
  to: string;
  label: string;
}

/** Abas de Configurações que a pessoa pode abrir (cada aba mantém a permissão que a tela já exigia). */
export function settingsTabsFor(role: Role | null | undefined, opsPermissions?: readonly string[] | null): SettingsTab[] {
  const tabs: SettingsTab[] = [];
  if (can(role, "settings.manage")) {
    tabs.push({ to: "/configuracoes/usuarios", label: "Usuários" }, { to: "/configuracoes/integracoes", label: "Integrações" }, { to: "/configuracoes/permissoes", label: "Papéis e permissões" });
  }
  if (role === "admin" || (role !== "cliente" && role !== "vendedor" && opsCan(opsPermissions, "ops.admin"))) tabs.push({ to: "/configuracoes/central", label: "Central de Operações" });
  if (can(role, "internal.view")) tabs.push({ to: "/configuracoes/sincronizacao", label: "Sincronização" });
  if (can(role, "logs.view")) tabs.push({ to: "/configuracoes/logs", label: "Logs" });
  return tabs;
}

/** Menu lateral, na ordem pedida na Etapa 21. */
export const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", path: "/", icon: LayoutDashboard, group: "Visão geral", hiddenFor: ["equipe", "vendedor"] },
  { label: "Clientes", path: "/clientes", icon: Building2, group: "Visão geral", permission: "clients.view" },
  { label: "Contas de anúncio", path: "/contas", icon: Wallet, group: "Visão geral", permission: "internal.view" },
  // 21/11/2026 (aprovado pelo Ander): Operações na ordem do dia a dia; "Painel" virou "Painel operacional" (não confundir com o Dashboard de anúncios);
  // Contatos ganhou item próprio (antes só se achava dentro do Tracking). O Vendedor continua sem menu (entra direto nos Contatos).
  { label: "Painel operacional", path: "/painel", icon: Gauge, group: "Operações", opsPermission: "ops.dashboard.view" },
  { label: "Central de Operações", path: "/operacoes", icon: KanbanSquare, group: "Operações", ops: true },
  { label: "Reuniões", path: "/reunioes", icon: CalendarDays, group: "Operações", opsPermission: "ops.access" },
  { label: "Onboarding", path: "/onboarding", icon: UserRoundCheck, group: "Operações", opsPermission: "ops.access" },
  { label: "Comercial", path: "/comercial", icon: Handshake, group: "Operações", opsPermission: "ops.commercial" },
  { label: "Contatos", path: "/contatos", icon: ContactRound, group: "Operações", permission: "contacts.view", hiddenFor: ["vendedor"] },
  { label: "Envios semanais", path: "/envios", icon: Send, group: "Operações", opsPermission: "ops.envios" },
  { label: "Notificações", path: "/notificacoes", icon: Bell, group: "Operações", opsPermission: "ops.access" },
  // T5.6: só para quem não tem o Tracking (papel Equipe): as vendas sugeridas dos clientes em que é Account Manager. Os demais veem na aba do Tracking.
  { label: "Vendas sugeridas", path: "/vendas-sugeridas", icon: Handshake, group: "Operações", permission: "tracking.suggestions", hiddenFor: ["admin", "gestor", "operador", "visualizador"] },
  // Uma tela por plataforma do catálogo (Meta Ads, Google Ads...), na ordem do catálogo.
  ...PLATFORMS.map((p): NavItem => ({ label: p.name, path: p.path, icon: platformLook(p.id).icon, group: "Anúncios", permission: "internal.view" })),
  { label: "Campanhas", path: "/campanhas", icon: Target, group: "Anúncios", permission: "internal.view" },
  // Fase 35.2: rascunhos de campanha do Campaign Builder (aprovado pelo Ander em 16/11/2026: logo depois de Campanhas). Nada é criado no Meta aqui.
  { label: "Criar campanhas", path: "/criar-campanhas", icon: FilePlus2, group: "Anúncios", permission: "ads.builder" },
  // Etapa 42: monta o pedido em texto para o Claude criar anúncios no Meta (a página não cria nada no Meta).
  { label: "Criador de Anúncios", path: "/criador-de-anuncios", icon: Wand2, group: "Anúncios", permission: "ads.builder" },
  { label: "Relatórios", path: "/relatorios", icon: FileBarChart, group: "Análise", permission: "reports.generate" },
  { label: "Monitoramento", path: "/monitoramento", icon: Activity, group: "Análise", permission: "monitor.view" },
  { label: "Resultados", path: "/inteligencia-resultados", icon: ChartPie, group: "Análise", permission: "results.view" },
  { label: "Alertas", path: "/alertas", icon: Bell, group: "Análise", permission: "internal.view" },
  { label: "Tracking", path: "/tracking", icon: Radar, group: "Análise", permission: "tracking.view" },
  // 21/11/2026 (aprovado pelo Ander): Configurações unificada. Sincronização, Logs e Configurações da Central viraram abas aqui dentro.
  // Aparece para quem pode abrir pelo menos uma das abas (ver settingsTabsFor).
  { label: "Configurações", path: "/configuracoes", icon: Settings, group: "Sistema", anySettingsTab: true },
];

/** opsPermissions = permissões da Central (Etapa 36) de quem está logado. */
export function navItemsFor(role: Role | null | undefined, opsPermissions?: readonly string[] | null): NavItem[] {
  return NAV_ITEMS.filter((item) => {
    if (role && item.hiddenFor?.includes(role)) return false;
    if (item.ops) return role === "admin" || (role !== "cliente" && role !== "vendedor" && opsCan(opsPermissions, "ops.access"));
    if (item.opsPermission) return role === "admin" || (role !== "cliente" && role !== "vendedor" && opsCan(opsPermissions, item.opsPermission));
    if (item.anySettingsTab) return settingsTabsFor(role, opsPermissions).length > 0;
    return !item.permission || can(role, item.permission);
  });
}

/** Itens visíveis agrupados, mantendo a ordem do menu. Grupos vazios somem. */
export function navGroupsFor(role: Role | null | undefined, opsPermissions?: readonly string[] | null): { group: NavGroup; items: NavItem[] }[] {
  const groups: { group: NavGroup; items: NavItem[] }[] = [];
  for (const item of navItemsFor(role, opsPermissions)) {
    const last = groups.at(-1);
    if (last?.group === item.group) last.items.push(item);
    else groups.push({ group: item.group, items: [item] });
  }
  return groups;
}

/** Item do menu que corresponde ao endereço atual (o mais específico). */
export function navItemForPath(pathname: string): NavItem | undefined {
  if (pathname === "/") return NAV_ITEMS[0];
  return NAV_ITEMS.filter((i) => i.path !== "/" && (pathname === i.path || pathname.startsWith(`${i.path}/`)))
    .sort((a, b) => b.path.length - a.path.length)[0];
}

/**
 * 43.3 (D): o que cada papel vê no menu, para a tela "Papéis e permissões".
 * `central`: o item da Central de Operações só aparece para quem tem a permissão dela (por pessoa), então fica à parte.
 */
export function menuPorPapel(role: Role): { groups: { group: NavGroup; items: string[] }[]; central: "sempre" | "com_permissao" | "nunca" } {
  const sem = navGroupsFor(role, []).map((g) => ({ group: g.group, items: g.items.filter((i) => !i.ops && !i.opsPermission).map((i) => i.label) })).filter((g) => g.items.length > 0);
  const com = navItemsFor(role, ["ops.access"]).some((i) => i.ops);
  const sempre = navItemsFor(role, []).some((i) => i.ops);
  return { groups: sem, central: sempre ? "sempre" : com ? "com_permissao" : "nunca" };
}

/**
 * 43.3 (A): grupos do menu que começam recolhidos para cada papel (a pessoa abre e fecha quando quiser; o navegador lembra).
 * Nada é retirado e a ordem dos grupos não muda; o grupo da tela aberta nunca fica escondido.
 * Quem acompanha anúncios (gestor, operador, visualizador) começa com "Sistema" recolhido; os demais veem tudo aberto.
 */
export function gruposRecolhidosPadrao(role: Role | null | undefined): NavGroup[] {
  return role === "gestor" || role === "operador" || role === "visualizador" ? ["Sistema"] : [];
}
