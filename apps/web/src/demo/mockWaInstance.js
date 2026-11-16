// T5.38 — Edge Function wa-instance no servidor simulado (QR Code por cliente). Mesmas regras de private.wa_instance_*:
// quem pode (admin e gestor aqui), nome "bf-...", chave do aviso trocada a cada conexão, "conectado" liga sozinho.
// db.waInst: { connectAfter: nº de conferências até "ler o QR", webhookOk, polls, connectCalls, hookKeys }
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

export function seedWaInstance() {
  return { waInst: { connectAfter: 2, webhookOk: true, polls: 0, connectCalls: 0, hookKeys: [], serverHas: {} } };
}

export function handleWaInstance({ db, url, parse, role, res }) {
  if (!url.includes("/functions/v1/wa-instance")) return null;
  const p = parse();
  const sim = db.waInst;
  if (!["admin", "gestor"].includes(role)) return res(403, { error: { code: "FORBIDDEN", message: "Você não pode conectar o WhatsApp deste cliente." } });
  const c = db.whatsappConnections.find((x) => x.id === p.connectionId && x.mode === "nao_oficial");
  if (!c) return res(403, { error: { code: "FORBIDDEN", message: "Você não pode conectar o WhatsApp deste cliente." } });

  if (p.action === "connect") {
    sim.connectCalls += 1;
    c.instance_name = c.instance_name ?? `bf-${c.id.replace(/[^0-9a-f]/gi, "0").padEnd(12, "0").slice(0, 12)}`;
    c.inbound_key = Array.from({ length: 48 }, () => "0123456789abcdef"[Math.floor(Math.random() * 16)]).join("");
    c.inbound_key_hint = c.inbound_key.slice(-4);
    sim.hookKeys.push(c.inbound_key);
    if (sim.serverHas[c.instance_name] === "open") {
      c.gateway_state = "conectado";
      c.enabled = true;
      return res(200, { data: { state: "conectado", qr: null, pairingCode: null, webhookOk: sim.webhookOk, message: null } });
    }
    sim.polls = 0;
    sim.serverHas[c.instance_name] = "connecting";
    c.gateway_state = "aguardando_leitura";
    return res(200, { data: {
      state: "aguardando_leitura", qr: p.number ? null : PNG, pairingCode: p.number ? "ABCD-1234" : null, webhookOk: sim.webhookOk,
      message: sim.webhookOk ? null : "O servidor não aceitou o aviso automático. Mesmo conectando, as mensagens não chegam ao CRM.",
    } });
  }
  if (p.action === "status") {
    if (!c.instance_name) return res(200, { data: { state: "desconhecido", message: "Este número ainda não foi conectado por QR Code." } });
    if (c.gateway_state === "aguardando_leitura") {
      sim.polls += 1;
      if (sim.polls >= sim.connectAfter) {
        sim.serverHas[c.instance_name] = "open";
        c.gateway_state = "conectado";
        c.enabled = true;
      }
    }
    return res(200, { data: { state: c.gateway_state ?? "desconhecido", message: null } });
  }
  if (p.action === "logout") {
    if (c.instance_name) sim.serverHas[c.instance_name] = "close";
    c.gateway_state = "desconectado";
    c.enabled = false;
    return res(200, { data: { state: "desconectado" } });
  }
  if (p.action === "remove") {
    if (!c.instance_name) return res(200, { data: { removed: false } });
    delete sim.serverHas[c.instance_name];
    Object.assign(c, { instance_name: null, gateway_state: null, enabled: false });
    return res(200, { data: { removed: true } });
  }
  return res(400, { error: { code: "INVALID_INPUT", message: "Pedido inválido." } });
}
