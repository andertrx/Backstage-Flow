/** Deve ser igual ao tipo public.client_status do banco. */
export const CLIENT_STATUSES = ["ativo", "pausado", "encerrado"] as const;

export type ClientStatus = (typeof CLIENT_STATUSES)[number];

export const CLIENT_STATUS_LABELS: Record<ClientStatus, string> = {
  ativo: "Ativo",
  pausado: "Pausado",
  // "Encerrado" virou "Desativado" (23/10/2026): o CRM para de trabalhar para o cliente (ver docs/CLIENTE-DESATIVADO.md).
  encerrado: "Desativado",
};

export const DEFAULT_CLIENT_TIMEZONE = "America/Sao_Paulo";
