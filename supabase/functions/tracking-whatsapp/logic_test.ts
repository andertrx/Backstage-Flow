import { assertEquals } from "jsr:@std/assert@1";
import { connectionSchema, webhookUrl } from "./logic.ts";

Deno.test("conexão da API oficial: IDs só com números; endereço do webhook por conexão", () => {
  const ok = connectionSchema.safeParse({ action: "connection_save", containerId: "00000000-0000-4000-8000-000000000001", phoneNumberId: "106540352242922", wabaId: "102290129340398", enabled: true });
  assertEquals(ok.success, true);
  assertEquals(connectionSchema.safeParse({ action: "connection_save", containerId: "00000000-0000-4000-8000-000000000001", phoneNumberId: "+55 45", wabaId: "1", enabled: true }).success, false);
  assertEquals(webhookUrl("https://x.supabase.co/", "abc"), "https://x.supabase.co/functions/v1/whatsapp-webhook?c=abc");
});
