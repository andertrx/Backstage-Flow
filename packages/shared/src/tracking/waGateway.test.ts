import { describe, expect, it } from "vitest";
import { parseGatewayPayload, refCodeOf } from "./waGateway.ts";

const msg = (over: Record<string, unknown> = {}, key: Record<string, unknown> = {}) => ({
  event: "messages.upsert",
  instance: "cliente-x",
  data: { key: { remoteJid: "5545999998888@s.whatsapp.net", fromMe: false, id: "ABC123", ...key }, pushName: "Ana", messageTimestamp: 1762603200, ...over },
});

describe("mensagens do servidor de WhatsApp não oficial", () => {
  it("mensagem recebida com o código do botão do site", () => {
    const [r] = parseGatewayPayload(msg({ message: { conversation: "Olá! Quero saber mais (ref. K7Q2M9)" } }));
    expect(r).toMatchObject({ kind: "inbound", phone: "5545999998888", id: "ABC123", at: 1762603200000, ctwa: null });
    if (r.kind === "ignore") throw new Error("esperava mensagem");
    expect(refCodeOf(r.text)).toBe("K7Q2M9");
  });
  it("anúncio de clique para o WhatsApp: pega o ctwaClid, o id do anúncio e o endereço", () => {
    const [r] = parseGatewayPayload(msg({ message: { extendedTextMessage: { text: "Oi", contextInfo: { externalAdReply: {
      ctwaClid: "ARAk-teste", sourceId: "120210000000001", sourceType: "ad", sourceUrl: "https://fb.me/abc" } } } } }));
    expect(r).toMatchObject({ kind: "inbound", ctwa: "ARAk-teste", adId: "120210000000001", sourceType: "ad", sourceUrl: "https://fb.me/abc" });
  });
  it("mensagem que a agência mandou vira 'echo' (para achar frases); mensagem temporária também é lida", () => {
    const [r] = parseGatewayPayload(msg({ message: { ephemeralMessage: { message: { conversation: "Parabéns pela compra de R$ 297" } } } }, { fromMe: true }));
    expect(r).toMatchObject({ kind: "echo", phone: "5545999998888", text: "Parabéns pela compra de R$ 297" });
  });
  it("grupo, transmissão, status, outros eventos e mensagem sem número são ignorados", () => {
    expect(parseGatewayPayload(msg({}, { remoteJid: "1203630@g.us" }))[0]).toMatchObject({ kind: "ignore", reason: "grupo" });
    expect(parseGatewayPayload(msg({}, { remoteJid: "status@broadcast" }))[0].kind).toBe("ignore");
    expect(parseGatewayPayload({ event: "connection.update", data: {} })[0].kind).toBe("ignore");
    expect(parseGatewayPayload(msg({}, { remoteJid: "999999999999@lid" }))[0]).toMatchObject({ kind: "ignore" });
  });
  it("id '@lid' usa o telefone que o servidor informa em outro campo", () => {
    const [r] = parseGatewayPayload(msg({ message: { conversation: "oi" } }, { remoteJid: "999@lid", remoteJidAlt: "554588887777@s.whatsapp.net" }));
    expect(r).toMatchObject({ kind: "inbound", phone: "554588887777" });
  });
  it("aceita nome do evento em maiúsculas, lista de mensagens e hora em milissegundos", () => {
    const out = parseGatewayPayload({ event: "MESSAGES_UPSERT", data: { messages: [
      { key: { remoteJid: "5511999990000@s.whatsapp.net", fromMe: false, id: "A1" }, message: { conversation: "oi" }, messageTimestamp: 1762603200000 },
      { key: { remoteJid: "5511999991111@s.whatsapp.net", fromMe: false, id: "A2" }, message: { conversation: "oi" } },
    ] } });
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ kind: "inbound", at: 1762603200000 });
    expect(out[1]).toMatchObject({ kind: "inbound", at: null });
  });
  it("lixo não quebra", () => {
    expect(parseGatewayPayload(null)).toEqual([]);
    expect(parseGatewayPayload({ event: "messages.upsert", data: 5 })).toEqual([]);
    expect(refCodeOf("sem código")).toBeNull();
  });
});
