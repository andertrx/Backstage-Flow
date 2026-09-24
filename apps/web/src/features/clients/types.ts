import type { ClientStatus, Role } from "@backstage/shared";

/** Linha da tabela public.clients. */
export interface Client {
  id: string;
  name: string;
  company: string | null;
  cnpj: string | null;
  owner_name: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
  status: ClientStatus;
  timezone: string;
  is_demo: boolean;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

/** Colunas que o site pode gravar (as demais são protegidas no banco). */
export type ClientInput = Pick<
  Client,
  "name" | "company" | "cnpj" | "owner_name" | "phone" | "email" | "notes" | "status" | "timezone"
>;

export interface ClientAccess {
  user_id: string;
  created_at: string;
  profile: { full_name: string; email: string; role: Role; active: boolean } | null;
}
