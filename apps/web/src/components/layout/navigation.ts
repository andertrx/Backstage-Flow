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

export interface NavItem {
  label: string;
  path: string;
  icon: LucideIcon;
  /** Etapa do projeto em que a página será construída (0 = já existe). */
  step: number;
  /** Sem permissão = qualquer usuário ativo vê. */
  permission?: Permission;
}

/** Menu lateral, na ordem pedida na Etapa 21. */
export const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", path: "/", icon: LayoutDashboard, step: 0 },
  { label: "Clientes", path: "/clientes", icon: Building2, step: 0, permission: "clients.view" },
  { label: "Contas", path: "/contas", icon: Wallet, step: 0, permission: "internal.view" },
  { label: "Meta Ads", path: "/meta-ads", icon: Megaphone, step: 0, permission: "internal.view" },
  { label: "Google Ads", path: "/google-ads", icon: Search, step: 0, permission: "internal.view" },
  { label: "Campanhas", path: "/campanhas", icon: Target, step: 0, permission: "internal.view" },
  { label: "Relatórios", path: "/relatorios", icon: FileBarChart, step: 18, permission: "internal.view" },
  { label: "Alertas", path: "/alertas", icon: Bell, step: 0, permission: "internal.view" },
  { label: "Sincronização", path: "/sincronizacao", icon: RefreshCw, step: 0, permission: "internal.view" },
  { label: "Logs", path: "/logs", icon: ScrollText, step: 17, permission: "logs.view" },
  { label: "Configurações", path: "/configuracoes", icon: Settings, step: 0, permission: "users.manage" },
];

export function navItemsFor(role: Role | null | undefined): NavItem[] {
  return NAV_ITEMS.filter((item) => !item.permission || can(role, item.permission));
}
