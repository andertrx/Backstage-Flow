import {
  CLIENT_STATUSES,
  type ClientStatus,
  DEFAULT_CLIENT_TIMEZONE,
  isValidCnpj,
  isValidPhone,
  normalizeCnpj,
  normalizePhone,
} from "@backstage/shared";
import { z } from "zod";
import type { Client, ClientInput } from "./types.ts";

/** Valores do formulário: tudo texto, como o usuário digita. */
export interface ClientFormValues {
  name: string;
  company: string;
  cnpj: string;
  owner_name: string;
  phone: string;
  email: string;
  notes: string;
  status: ClientStatus;
  timezone: string;
}

export const emptyClientForm: ClientFormValues = {
  name: "",
  company: "",
  cnpj: "",
  owner_name: "",
  phone: "",
  email: "",
  notes: "",
  status: "ativo",
  timezone: DEFAULT_CLIENT_TIMEZONE,
};

export function toFormValues(client: Client): ClientFormValues {
  return {
    name: client.name,
    company: client.company ?? "",
    cnpj: client.cnpj ?? "",
    owner_name: client.owner_name ?? "",
    phone: client.phone ?? "",
    email: client.email ?? "",
    notes: client.notes ?? "",
    status: client.status,
    timezone: client.timezone,
  };
}

const optional = (max: number, message: string) => z.string().trim().max(max, message);

const schema = z.object({
  name: z.string().trim().min(2, "Informe o nome do cliente.").max(120, "Nome muito longo (máx. 120)."),
  company: optional(160, "Empresa muito longa (máx. 160)."),
  cnpj: z.string().trim().refine((v) => v === "" || isValidCnpj(v), "CNPJ inválido. Confira os números."),
  owner_name: optional(120, "Nome do responsável muito longo (máx. 120)."),
  phone: z.string().trim().refine((v) => v === "" || isValidPhone(v), "Telefone inválido. Use DDD + número."),
  email: z.string().trim().refine((v) => v === "" || z.email().safeParse(v).success, "E-mail inválido."),
  notes: optional(5000, "Observações muito longas (máx. 5000 caracteres)."),
  status: z.enum(CLIENT_STATUSES),
  timezone: z.string().min(3),
});

const orNull = (v: string) => (v === "" ? null : v);

/** Valida o formulário e devolve o que será gravado (já normalizado) ou a 1ª mensagem de erro. */
export function parseClientForm(values: ClientFormValues): { data: ClientInput } | { error: string } {
  const parsed = schema.safeParse(values);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  const v = parsed.data;
  return {
    data: {
      name: v.name,
      company: orNull(v.company),
      cnpj: v.cnpj ? normalizeCnpj(v.cnpj) : null,
      owner_name: orNull(v.owner_name),
      phone: v.phone ? normalizePhone(v.phone) : null,
      email: v.email ? v.email.toLowerCase() : null,
      notes: orNull(v.notes),
      status: v.status,
      timezone: v.timezone,
    },
  };
}
