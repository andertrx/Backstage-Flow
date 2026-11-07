// Etapa 44.1 — conexão do WhatsApp por API não oficial no servidor simulado (mesmas regras de private.wa_gateway_*_impl
// e da função wa-gateway). db.waSim.state = o que o "servidor de conexão" diria: close | connecting | open.
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

export function seedWaGateway() {
  return {
    waGw: { enabled: false, base_url: null, instance_name: "backstage", has_key: false, key_updated_at: null, risk_accepted_at: null,
      connection_state: "desconhecido", connected_at: null, last_check_at: null, last_error: null },
    waSim: { state: "close", exists: false, up: true, keyOk: true, groups: [] },
    waKey: null,
    waGrupos: [],
  };
}

export function handleWaGateway({ db, url, parse, role, res, opsPerms = [] }) {
  const g = db.waGw;
  const isRest = url.includes("/rest/v1/wa_gateway_settings");
  const isRpc = url.includes("/rest/v1/rpc/wa_gateway_");
  const isFn = url.includes("/functions/v1/wa-gateway");
  const isGrupos = url.includes("/rest/v1/wa_grupos");
  const isGrupoRpc = url.includes("/rest/v1/rpc/wa_grupo_");
  const podeEnvios = role === "admin" || (opsPerms.includes("ops.access") && opsPerms.includes("ops.envios"));
  if (isGrupos) return res(200, podeEnvios ? db.waGrupos.filter((x) => !x.desvinculado_em).map(({ cliente_id, grupo_id, grupo_nome }) => ({ cliente_id, grupo_id, grupo_nome })) : []);
  if (isGrupoRpc) {
    const p = parse();
    db.rpcCalls.push({ fn: url.split("/rpc/")[1].split("?")[0], ...p });
    if (!podeEnvios) return res(403, { code: "42501", message: "Você não tem permissão para esta ação na Central de Operações." });
    const bad = (message) => res(400, { code: "22023", message });
    if (url.includes("/rpc/wa_grupo_vincular")) {
      if (!db.clients.some((c) => c.id === p.p_cliente)) return bad("Cliente não encontrado.");
      if (!/^[0-9A-Za-z._-]{5,60}@g\.us$/.test(String(p.p_grupo_id ?? "").trim())) return bad("Identificador de grupo inválido. Escolha o grupo na lista do WhatsApp.");
      const outro = db.waGrupos.find((x) => !x.desvinculado_em && x.grupo_id === p.p_grupo_id && x.cliente_id !== p.p_cliente);
      if (outro) return bad(`Este grupo já está ligado a outro cliente (${db.clients.find((c) => c.id === outro.cliente_id)?.name}). Desligue lá primeiro.`);
      const mesmo = db.waGrupos.find((x) => !x.desvinculado_em && x.cliente_id === p.p_cliente && x.grupo_id === p.p_grupo_id);
      if (mesmo) { mesmo.grupo_nome = p.p_grupo_nome; return res(200, mesmo.id); }
      for (const x of db.waGrupos) if (!x.desvinculado_em && x.cliente_id === p.p_cliente) x.desvinculado_em = new Date().toISOString();
      const novo = { id: crypto.randomUUID(), cliente_id: p.p_cliente, grupo_id: p.p_grupo_id, grupo_nome: p.p_grupo_nome ?? null, desvinculado_em: null };
      db.waGrupos.push(novo);
      return res(200, novo.id);
    }
    for (const x of db.waGrupos) if (!x.desvinculado_em && x.cliente_id === p.p_cliente) x.desvinculado_em = new Date().toISOString();
    return res(204);
  }
  if (!isRest && !isRpc && !isFn) return null;
  if (isRest) return res(200, role === "admin" ? g : null);

  const deny = () => res(403, { code: "42501", message: "Só o administrador configura a conexão do WhatsApp." });
  const bad = (message) => res(400, { code: "22023", message });
  const reset = () => Object.assign(g, { enabled: false, connection_state: "desconhecido", connected_at: null });

  if (isRpc && url.includes("/rpc/wa_gateway_save")) {
    const p = parse();
    db.rpcCalls.push({ fn: "wa_gateway_save", ...p, p_api_key: p.p_api_key ? "***" : null });
    if (role !== "admin") return deny();
    const u = String(p.p_base_url ?? "").trim().toLowerCase().replace(/\/+$/, "");
    if (!/^https:\/\/([a-z0-9-]+\.)+[a-z]{2,}(:[0-9]{2,5})?$/.test(u)) return bad("Endereço inválido. Use o endereço seguro do seu servidor, começando com https:// (ex.: https://whats.seudominio.com.br).");
    const inst = String(p.p_instance ?? "").trim();
    if (!/^[A-Za-z0-9_-]{1,60}$/.test(inst)) return bad("O nome da instância só pode ter letras, números, - e _ (até 60).");
    if (p.p_api_key != null && !/^[A-Za-z0-9._~+/=-]{16,200}$/.test(p.p_api_key)) return bad("Chave de acesso inválida. Confira e cole de novo.");
    if (!g.risk_accepted_at && !p.p_accept_risk) return bad("Marque que você entende o risco desta conexão não oficial antes de salvar.");
    const changed = g.base_url !== u || g.instance_name !== inst || p.p_api_key != null;
    Object.assign(g, { base_url: u, instance_name: inst, last_error: null });
    if (p.p_api_key != null) { db.waKey = p.p_api_key; Object.assign(g, { has_key: true, key_updated_at: new Date().toISOString() }); }
    if (!g.risk_accepted_at && p.p_accept_risk) g.risk_accepted_at = new Date().toISOString();
    if (changed) reset();
    return res(204);
  }
  if (isRpc && url.includes("/rpc/wa_gateway_set_enabled")) {
    const p = parse();
    db.rpcCalls.push({ fn: "wa_gateway_set_enabled", ...p });
    if (role !== "admin") return deny();
    if (p.p_enabled && (!g.base_url || !g.has_key || !g.risk_accepted_at)) return bad("Configure o endereço e a chave e aceite o risco antes de ligar.");
    if (p.p_enabled && g.connection_state !== "conectado") return bad("O WhatsApp precisa estar conectado para ligar os envios automáticos.");
    g.enabled = Boolean(p.p_enabled);
    return res(204);
  }

  if (isFn) {
    const body = parse();
    db.functionCalls.push({ fn: "wa-gateway", ...body });
    if (role !== "admin") return res(403, { error: { code: "FORBIDDEN", message: "Você não tem permissão para esta ação." } });
    if (!g.base_url || !g.has_key) return res(400, { error: { code: "INVALID_STATE", message: "Salve o endereço do servidor e a chave de acesso antes de conectar." } });
    const sim = db.waSim;
    if (!sim.up) return res(502, { error: { code: "GATEWAY_ERROR", message: "Não consegui falar com o servidor do WhatsApp. Confira o endereço e se o servidor está ligado." } });
    if (!sim.keyOk) { Object.assign(g, { connection_state: "erro", last_check_at: new Date().toISOString() }); return res(200, { data: { state: "erro", message: "O servidor do WhatsApp recusou a chave de acesso. Confira a chave e salve de novo." } }); }
    const set = (state) => {
      if (state === "conectado" && g.connection_state !== "conectado") g.connected_at = new Date().toISOString();
      if (state !== "conectado") g.connected_at = null;
      if (state === "desconectado") g.enabled = false;
      Object.assign(g, { connection_state: state, last_check_at: new Date().toISOString(), last_error: null });
    };
    const mapState = () => (sim.state === "open" ? "conectado" : sim.state === "connecting" ? "aguardando_leitura" : sim.exists ? "desconectado" : "desconhecido");
    if (body.action === "status") { set(mapState()); return res(200, { data: { state: g.connection_state, message: null } }); }
    if (body.action === "groups") return res(200, { data: { groups: sim.groups ?? [] } });
    if (body.action === "logout") { sim.state = "close"; set("desconectado"); return res(200, { data: { state: "desconectado", message: null } }); }
    if (body.action === "connect") {
      const digits = String(body.number ?? "").replace(/\D/g, "");
      const number = digits.length === 10 || digits.length === 11 ? `55${digits}` : digits;
      if (body.number?.trim() && !/^\d{12,15}$/.test(number)) return res(400, { error: { code: "INVALID_INPUT", message: "Telefone inválido. Use o número do chip com DDD (ex.: 11 98765-4321)." } });
      if (sim.state === "open") { set("conectado"); return res(200, { data: { state: "conectado", qr: null, pairingCode: null, message: null } }); }
      sim.exists = true; sim.state = "connecting";
      set("aguardando_leitura");
      return res(200, { data: { state: "aguardando_leitura", qr: body.number?.trim() ? null : PNG, pairingCode: body.number?.trim() ? "WZYEH1YY" : null, message: null } });
    }
  }
  return null;
}
