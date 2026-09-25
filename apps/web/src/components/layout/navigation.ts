import { can, type Permission, type Role } from "@backstage/shared";
import {
  Bell,
  Building2,
  FileBarChart,
  LayoutDashboard,
  type LucideIcon,
  Megaphone,
  RefreshCw,
  ScrollText,
  Search,
  Settings,
  Target,
  Wallet,
} from "lucide-react";

export type NavGroup = "Visão geral" | "Anúncios" | "Análise" | "Sistema";

export interface NavItem {
  label: string;
  path: string;
  icon: LucideIcon;
  /** Grupo no menu lateral (os grupos seguem a ordem do menu, sem mudá-la). */
  group: NavGroup;
  /** Sem permissão = qualquer usuário ativo vê. */
  permission?: Permission;
}

/** Menu lateral, na ordem pedida na Etapa 21. */
export const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", path: "/", icon: LayoutDashboard, group: "Visão geral" },
  { label: "Clientes", path: "/clientes", icon: Building2, group: "Visão geral", permission: "clients.view" },
  { label: "Contas", path: "/contas", icon: Wallet, group: "Visão geral", permission: "internal.view" },
  { label: "Meta Ads", path: "/meta-ads", icon: Megaphone, group: "Anúncios", permission: "internal.view" },
  { label: "Google Ads", path: "/google-ads", icon: Search, group: "Anúncios", permission: "internal.view" },
  { label: "Campanhas", path: "/campanhas", icon: Target, group: "Anúncios", permission: "internal.view" },
  { label: "Relatórios", path: "/relatorios", icon: FileBarChart, group: "Análise", permission: "reports.generate" },
  { label: "Alertas", path: "/alertas", icon: Bell, group: "Análise", permission: "internal.view" },
  { label: "Sincronização", path: "/sincronizacao", icon: RefreshCw, group: "Sistema", permission: "internal.view" },
  { label: "Logs", path: "/logs", icon: ScrollText, group: "Sistema", permission: "logs.view" },
  { label: "Configurações", path: "/configuracoes", icon: Settings, group: "Sistema", permission: "users.manage" },
];

export function navItemsFor(role: Role | null | undefined): NavItem[] {
  return NAV_ITEMS.filter((item) => !item.permission || can(role, item.permission));
}

/** Itens visíveis agrupados, mantendo a ordem do menu. Grupos vazios somem. */
export function navGroupsFor(role: Role | null | undefined): { group: NavGroup; items: NavItem[] }[] {
  const groups: { group: NavGroup; items: NavItem[] }[] = [];
  for (const item of navItemsFor(role)) {
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
