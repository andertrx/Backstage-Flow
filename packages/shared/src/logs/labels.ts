/**
 * Nomes em português para a tela Logs (auditoria).
 * Nada de jargão técnico: "Cadastrou cliente", "Status: Ativa → Pausada".
 */
import { AD_ACCOUNT_STATUS_LABELS, CONNECTION_STATUS_LABELS } from "../accounts/status.ts";
import { CLIENT_STATUS_LABELS } from "../clients/status.ts";
import { ROLE_LABELS } from "../constants/roles.ts";

/** Status em português conforme o tipo do registro (conta, cliente, conexão). */
const STATUS_LABELS: Record<string, string> = { ...CONNECTION_STATUS_LABELS, ...AD_ACCOUNT_STATUS_LABELS, ...CLIENT_STATUS_LABELS };

export const AUDIT_CATEGORIES = [
  { value: "auth", label: "Entradas e saídas (login)" },
  { value: "user", label: "Usuários" },
  { value: "client", label: "Clientes" },
  { value: "client_access", label: "Acesso a clientes" },
  { value: "ad_account", label: "Contas de anúncio" },
  { value: "connection", label: "Conexões com plataformas" },
] as const;

export type AuditCategory = (typeof AUDIT_CATEGORIES)[number]["value"];

const ACTION_LABELS: Record<string, string> = {
  "auth.login": "Entrou no sistema",
  "auth.logout": "Saiu do sistema",
  "user.bootstrap_admin": "Primeiro administrador criado",
  "user.create": "Criou usuário",
  "user.update": "Alterou usuário",
  "user.set_password": "Definiu uma nova senha",
  "client.insert": "Cadastrou cliente",
  "client.update": "Alterou cliente",
  "client_access.insert": "Liberou acesso ao cliente",
  "client_access.delete": "Removeu acesso ao cliente",
  "ad_account.insert": "Vinculou conta de anúncio",
  "ad_account.update": "Conta de anúncio alterada",
  "connection.insert": "Conectou plataforma",
  "connection.update": "Conexão alterada",
};

export function auditActionLabel(action: string): string {
  return ACTION_LABELS[action] ?? action;
}

const FIELD_LABELS: Record<string, string> = {
  name: "Nome",
  label: "Nome",
  full_name: "Nome",
  email: "E-mail",
  role: "Papel",
  active: "Acesso liberado",
  status: "Status",
  status_reason: "Motivo",
  company: "Empresa",
  cnpj: "CNPJ",
  owner_name: "Responsável",
  phone: "Telefone",
  notes: "Observações",
  timezone: "Fuso horário",
  currency: "Moeda",
  client_id: "Cliente",
  connection_id: "Conexão",
  unlinked_at: "Desvinculada em",
  low_balance_days: "Aviso de saldo (dias)",
  low_balance_amount_micros: "Aviso de saldo (valor)",
  is_prepay: "Pré-paga",
  is_test_account: "Conta de teste",
  last_error: "Último erro",
  raw_status: "Status na plataforma",
  external_user_name: "Usuário na plataforma",
};

export function auditFieldLabel(key: string): string {
  return FIELD_LABELS[key] ?? key;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}T/;

/** Um valor guardado no log, em texto curto. */
export function formatAuditValue(key: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return "vazio";
  if (typeof value === "boolean") return value ? "Sim" : "Não";
  if (key === "status" && typeof value === "string" && STATUS_LABELS[value]) return STATUS_LABELS[value];
  if (key === "role" && typeof value === "string" && value in ROLE_LABELS) return ROLE_LABELS[value as keyof typeof ROLE_LABELS];
  if (key.endsWith("_micros") && typeof value === "number") {
    return (value / 1_000_000).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  if (typeof value === "string" && ISO_DATE.test(value)) {
    return new Date(value).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
  }
  if (typeof value === "string") return value.length > 80 ? `${value.slice(0, 77)}…` : value;
  if (typeof value === "number") return value.toLocaleString("pt-BR");
  return JSON.stringify(value).slice(0, 80);
}

/** Campos que não ajudam a entender a ação (ids internos e datas automáticas). */
const HIDDEN = new Set(["id", "created_at", "updated_at", "created_by", "updated_by", "linked_at", "details_updated_at", "last_checked_at", "external_id", "external_user_id", "is_demo", "platform_id", "manager_customer_id", "business_id", "user_id", "granted_by", "token_expires_at"]);

/**
 * Texto com o que mudou, a partir de "details" do log:
 *  - alteração do banco: { campo: { before, after } }
 *  - alteração de usuário: { before: {...}, after: {...} }
 *  - cadastro: a linha criada (mostramos só os campos principais)
 */
export function describeAuditDetails(action: string, details: Record<string, unknown> | null | undefined): string[] {
  if (!details) return [];
  const lines: string[] = [];
  const change = (key: string, before: unknown, after: unknown) =>
    lines.push(`${auditFieldLabel(key)}: ${formatAuditValue(key, before)} → ${formatAuditValue(key, after)}`);

  const b = details.before, a = details.after;
  if (b && a && typeof b === "object" && typeof a === "object") {
    for (const [key, value] of Object.entries(a as Record<string, unknown>)) {
      const old = (b as Record<string, unknown>)[key];
      if (!HIDDEN.has(key) && JSON.stringify(old) !== JSON.stringify(value)) change(key, old, value);
    }
    return lines;
  }
  if (action.endsWith(".update")) {
    for (const [key, value] of Object.entries(details)) {
      if (HIDDEN.has(key) || !value || typeof value !== "object" || !("after" in value)) continue;
      const v = value as { before?: unknown; after?: unknown };
      change(key, v.before, v.after);
    }
    return lines;
  }
  for (const key of ["name", "label", "email", "role", "status", "currency", "external_user_name"]) {
    if (key in details && details[key] !== null && details[key] !== "") lines.push(`${auditFieldLabel(key)}: ${formatAuditValue(key, details[key])}`);
  }
  return lines;
}
