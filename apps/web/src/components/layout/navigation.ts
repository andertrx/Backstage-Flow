import { can, opsCan, type Permission, PLATFORMS, type Role } from "@backstage/shared";
import {
  Bell,
  Building2,
  FileBarChart,
  KanbanSquare,
  LayoutDashboard,
  type LucideIcon,
  Radar,
  RefreshCw,
  ScrollText,
  Settings,
  Target,
  Wallet,
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
}

/** Menu lateral, na ordem pedida na Etapa 21. */
export const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", path: "/", icon: LayoutDashboard, group: "Visão geral", hiddenFor: ["equipe"] },
  { label: "Clientes", path: "/clientes", icon: Building2, group: "Visão geral", permission: "clients.view" },
  { label: "Contas", path: "/contas", icon: Wallet, group: "Visão geral", permission: "internal.view" },
  { label: "Central de Operações", path: "/operacoes", icon: KanbanSquare, group: "Operações", ops: true },
  // Uma tela por plataforma do catálogo (Meta Ads, Google Ads...), na ordem do catálogo.
  ...PLATFORMS.map((p): NavItem => ({ label: p.name, path: p.path, icon: platformLook(p.id).icon, group: "Anúncios", permission: "internal.view" })),
  { label: "Campanhas", path: "/campanhas", icon: Target, group: "Anúncios", permission: "internal.view" },
  { label: "Relatórios", path: "/relatorios", icon: FileBarChart, group: "Análise", permission: "reports.generate" },
  { label: "Alertas", path: "/alertas", icon: Bell, group: "Análise", permission: "internal.view" },
  { label: "Tracking (em construção)", path: "/tracking", icon: Radar, group: "Análise", permission: "tracking.view" },
  { label: "Sincronização", path: "/sincronizacao", icon: RefreshCw, group: "Sistema", permission: "internal.view" },
  { label: "Logs", path: "/logs", icon: ScrollText, group: "Sistema", permission: "logs.view" },
  { label: "Configurações", path: "/configuracoes", icon: Settings, group: "Sistema", permission: "users.manage" },
];

/** opsPermissions = permissões da Central (Etapa 36) de quem está logado. */
export function navItemsFor(role: Role | null | undefined, opsPermissions?: readonly string[] | null): NavItem[] {
  return NAV_ITEMS.filter((item) => {
    if (role && item.hiddenFor?.includes(role)) return false;
    if (item.ops) return role === "admin" || (role !== "cliente" && opsCan(opsPermissions, "ops.access"));
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
