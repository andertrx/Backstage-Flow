/** Deve ser igual ao tipo public.client_status do banco. */
export const CLIENT_STATUSES = ["ativo", "pausado", "encerrado"] as const;

export type ClientStatus = (typeof CLIENT_STATUSES)[number];

export const CLIENT_STATUS_LABELS: Record<ClientStatus, string> = {
  ativo: "Ativo",
  pausado: "Pausado",
  encerrado: "Encerrado",
};

export const DEFAULT_CLIENT_TIMEZONE = "America/Sao_Paulo";
