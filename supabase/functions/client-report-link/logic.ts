import { z } from "npm:zod@4";

/** O que o navegador pode pedir: o código do link e, opcionalmente, o período. */
export const requestSchema = z.object({
  token: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  period: z.enum(["last_7_days", "last_14_days", "last_30_days", "this_month", "last_month"]).optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
}).refine((v) => (v.from == null) === (v.to == null), { message: "Informe as duas datas." });

export type LinkRequest = z.infer<typeof requestSchema>;

/** Erro do banco → resposta amigável (sem detalhe técnico para o visitante). */
export function mapDbError(code: string | undefined): { status: number; code: string; message: string } {
  switch (code) {
    case "P0002":
      return { status: 404, code: "LINK_INVALID", message: "Este link não existe mais ou foi desativado. Peça um novo link para a agência." };
    case "22023":
      return { status: 400, code: "INVALID_PERIOD", message: "Período inválido (até 400 dias, sem datas futuras)." };
    case "54000":
      return { status: 429, code: "LINK_RATE_LIMITED", message: "Muitas consultas seguidas. Tente de novo em alguns minutos." };
    default:
      return { status: 500, code: "DB_ERROR", message: "Não conseguimos abrir o relatório agora. Tente de novo em instantes." };
  }
}
