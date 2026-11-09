/**
 * Regras puras da conexão da API oficial do WhatsApp (Etapas 34.5-W2 e T4.2).
 * (A marcação de Lead/Venda por código ou por conversa saiu daqui em T5.19: hoje é feita pelo contato, em Conversas.)
 */
import { z } from "npm:zod@4";

const HASH = z.string().regex(/^[0-9a-f]{64}$/);
const containerId = z.string().uuid("Site inválido.");

export const connectionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("connection_save"),
    containerId,
    phoneNumberId: z.string().trim().regex(/^\d{5,30}$/, "O ID do número de telefone tem só números (fica em WhatsApp → Configuração da API)."),
    wabaId: z.string().trim().regex(/^\d{5,30}$/, "O ID da conta do WhatsApp Business tem só números."),
    appSecret: z.string().trim().regex(/^[A-Za-z0-9]{16,128}$/, "O segredo do app parece incompleto (Configurações do app → Básico → Chave secreta do app).").optional(),
    enabled: z.boolean(),
  }),
  z.object({ action: z.literal("connection_reveal"), containerId }),
  z.object({ action: z.literal("connection_remove"), containerId }),
]);
export type ConnectionInput = z.infer<typeof connectionSchema>;

/** Endereço do webhook que se cola no painel do Meta (um por conexão). */
export function webhookUrl(supabaseUrl: string, connectionId: string): string {
  return `${supabaseUrl.replace(/\/$/, "")}/functions/v1/whatsapp-webhook?c=${connectionId}`;
}
