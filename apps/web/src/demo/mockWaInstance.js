// T5.38 — Edge Function wa-instance no servidor simulado (QR Code por cliente). Mesmas regras de private.wa_instance_*:
// quem pode (admin e gestor aqui), nome "bf-...", chave do aviso trocada a cada conexão, "conectado" liga sozinho.
// db.waInst: { connectAfter: nº de conferências até "ler o QR", webhookOk, polls, connectCalls, hookKeys }
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

export function seedWaInstance() {
  // amClients: ids de clientes dos quais a pessoa logada é Account Manager (o banco usa ops_client_ops.am_user_id)
  return { waInst: { connectAfter: 2, webhookOk: true, polls: 0, connectCalls: 0, hookKeys: [], serverHas: {}, amClients: [] } };
}

export function handleWaInstance({ db, url, parse, role, res }) {
  const sim = db.waInst;
  const pode = (clientId) => role === "admin" || role === "gestor" || sim.amClients.includes(clientId);
  if (url.includes("/rest/v1/rpc/wa_instance_minha_conexao")) {
    const p = parse();
    db.rpcCalls.push({ fn: "wa_instance_minha_conexao", ...p });
    if (!pode(p.p_client)) return res(200, { pode: false, conexoes: [] });
    return res(200, { pode: true, conexoes: db.whatsappConnections.filter((c) => c.client_id === p.p_client && c.mode === "nao_oficial").map((c) => ({
      id: c.id, display_phone: c.display_phone, phone_number_id: c.phone_number_id, instance_name: c.instance_name ?? null,
      gateway_state: c.gateway_state ?? null, enabled: c.enabled, last_webhook_at: c.last_webhook_at ?? null })) });
  }
  if (!url.includes("/functions/v1/wa-instance")) return null;
  const p = parse();
  const c = db.whatsappConnections.find((x) => x.id === p.connectionId && x.mode === "nao_oficial");
  if (!c || !pode(c.client_id)) return res(403, { error: { code: "FORBIDDEN", message: "Você não pode conectar o WhatsApp deste cliente." } });

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
    sim.numbers = [...(sim.numbers ?? []), p.number ?? null];
    const semCodigo = Boolean(p.number) && sim.noCode;
    const num = p.number ? String(p.number).replace(/\D/g, "").replace(/^(\d{10,11})$/, "55$1") : null;
    return res(200, { data: {
      state: "aguardando_leitura", qr: p.number && !semCodigo ? null : PNG, pairingCode: p.number && !semCodigo ? "ABCD-1234" : null,
      pairingNumber: p.number && !semCodigo ? num : null, webhookOk: sim.webhookOk,
      message: semCodigo ? "O servidor não gerou o código para esse número. Tente com ou sem o 9, ou use o QR Code."
        : sim.webhookOk ? null : "O servidor não aceitou o aviso automático. Mesmo conectando, as mensagens não chegam ao CRM.",
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
    // Desconectar apaga de verdade: sai, apaga a instância no servidor e limpa o cadastro da instância.
    if (c.instance_name) delete sim.serverHas[c.instance_name];
    Object.assign(c, { instance_name: null, gateway_state: "desconectado", enabled: false });
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
