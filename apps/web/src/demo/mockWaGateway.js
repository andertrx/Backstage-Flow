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
    waMarcacoes: [],
    waParticipantes: {},
    waAuto: [],
    waDisparos: [],
    waAvisosCfg: { ativo: false, grupo_id: null, grupo_nome: null, tipos: ["sem_saldo", "saldo_baixo", "conta_restrita", "pagamento_pendente", "erro_api", "envio_aprovar"],
      silencio_inicio: 22, silencio_fim: 7, repetir_horas: 12, sem_gasto_inicio: 8, sem_gasto_fim: 22, sem_gasto_minutos: 60 },
    waSemGasto: [],
    waAvisos: [],
    gcal: { configured: true, conexao: null, estados: [], falhar: null },
  };
}

export function handleWaGateway({ db, url, parse, role, res, opsPerms = [] }) {
  const g = db.waGw;
  const isRest = url.includes("/rest/v1/wa_gateway_settings");
  const isRpc = url.includes("/rest/v1/rpc/wa_gateway_");
  const isFn = url.includes("/functions/v1/wa-gateway");
  const isGrupos = url.includes("/rest/v1/wa_grupos");
  const isGrupoRpc = url.includes("/rest/v1/rpc/wa_grupo_");
  const isMarc = url.includes("/rest/v1/wa_marcacoes");
  const isMarcRpc = url.includes("/rest/v1/rpc/wa_marcacao_");
  const podeEnvios = role === "admin" || (opsPerms.includes("ops.access") && opsPerms.includes("ops.envios"));
  const isCfg = url.includes("/rest/v1/wa_envio_config");
  const isDisp = url.includes("/rest/v1/wa_disparos");
  const isDispRpc = url.includes("/rest/v1/rpc/wa_envio_");
  if (isCfg) return res(200, podeEnvios ? db.waAuto.map((id) => ({ envio_id: id, automatico: true })) : []);
  if (isDisp) return res(200, podeEnvios ? [...db.waDisparos].sort((a, b) => b.id - a.id) : []);
  if (isDispRpc) {
    const p = parse();
    db.rpcCalls.push({ fn: url.split("/rpc/")[1].split("?")[0], ...p });
    if (!podeEnvios) return res(403, { code: "42501", message: "Você não tem permissão para esta ação na Central de Operações." });
    const bad = (message) => res(400, { code: "22023", message });
    if (url.includes("/rpc/wa_envio_set_automatico")) {
      if (role !== "admin") return res(403, { code: "42501", message: "Só o administrador liga o envio automático." });
      if (p.p_on && !(g.enabled && g.connection_state === "conectado")) return bad("Ligue os envios automáticos em Configurações → Integrações (com o WhatsApp conectado).");
      db.waAuto = db.waAuto.filter((id) => id !== p.p_envio);
      if (p.p_on) db.waAuto.push(p.p_envio);
      return res(204);
    }
    if (url.includes("/rpc/wa_envio_reenviar")) {
      const ap = db.opsEnvioAprovacoes.find((a) => a.envio_id === p.p_envio && a.decisao === "aprovado");
      if (!db.waAuto.includes(p.p_envio)) return bad("Este envio não é automático.");
      if (!ap) return bad("Aprove o envio desta semana antes de reenviar.");
      let n = 0;
      for (const c of db.opsEnvioClientes.filter((x) => x.envio_id === p.p_envio && x.ativo && !x.removido_em)) {
        const meus = db.waDisparos.filter((d) => d.envio_id === p.p_envio && d.cliente_id === c.cliente_id && d.semana === ap.semana);
        if (meus.some((d) => d.status === "pendente" || d.status === "enviando")) continue;
        if (p.p_modo === "faltantes" && meus.some((d) => d.status === "enviado")) continue;
        if ((db.opsEnvioSemana ?? []).some((x) => x.envio_id === p.p_envio && x.cliente_id === c.cliente_id && !x.receber)) continue;
        db.waDisparos.push({ id: db.waDisparos.length + 100, envio_id: p.p_envio, cliente_id: c.cliente_id, semana: ap.semana, origem: "manual", status: "pendente", tentativas: 0, detalhe: null, enviado_em: null, atualizado_em: new Date().toISOString() });
        n++;
      }
      return res(200, { na_fila: n, sem_grupo: 0 });
    }
  }
  // Etapa 46.1 — Google Agenda de cada pessoa (função google-agenda simulada)
  if (url.includes("/functions/v1/google-agenda")) {
    const body = parse();
    db.functionCalls.push({ fn: "google-agenda", ...body });
    if (role === "cliente" || role === "vendedor") return res(403, { error: { code: "FORBIDDEN", message: "Você não tem permissão para esta ação." } });
    const g2 = db.gcal;
    if (body.action === "status") return res(200, { data: { configured: g2.configured, conexao: g2.conexao } });
    if (body.action === "start") {
      if (!g2.configured) return res(400, { error: { code: "INVALID_STATE", message: "O login do Google ainda não foi configurado no servidor (falta o cliente OAuth). Fale com o administrador." } });
      const state = "a".repeat(63) + String(g2.estados.length % 10);
      g2.estados.push({ state, redirectUri: body.redirectUri });
      return res(200, { data: { url: `${body.redirectUri}?code=codigo-de-teste-123456&state=${state}` } }); // o "Google" devolve direto
    }
    if (body.action === "complete") {
      const i = g2.estados.findIndex((e) => e.state === body.state && e.redirectUri === body.redirectUri);
      if (i < 0) return res(400, { error: { code: "INVALID_STATE", message: "Autorização inválida ou expirada. Tente conectar de novo." } });
      g2.estados.splice(i, 1);
      if (g2.falhar) return res(400, { error: { code: "INVALID_STATE", message: g2.falhar } });
      g2.conexao = { google_email: "ander@empresa.com.br", status: "conectada", connected_at: new Date().toISOString(), last_sync_at: null, last_error: null };
      return res(200, { data: { conexao: g2.conexao } });
    }
    if (body.action === "disconnect") {
      if (g2.conexao) g2.conexao = { ...g2.conexao, status: "desconectada" };
      return res(200, { data: { conexao: g2.conexao } });
    }
  }
  // Etapa 45.3 — avisos no WhatsApp (só administrador)
  if (url.includes("/rest/v1/wa_avisos_config")) return res(200, role === "admin" ? db.waAvisosCfg : null);
  if (url.includes("/rest/v1/wa_sem_gasto_silenciados")) return res(200, role === "admin" ? db.waSemGasto.map((cliente_id) => ({ cliente_id })) : []);
  if (url.includes("/rest/v1/wa_avisos")) return res(200, role === "admin" ? [...db.waAvisos].sort((a, b) => b.id - a.id).slice(0, 8) : []);
  if (url.includes("/rest/v1/rpc/wa_avisos_config_save") || url.includes("/rest/v1/rpc/wa_sem_gasto_")) {
    const p = parse();
    db.rpcCalls.push({ fn: url.split("/rpc/")[1].split("?")[0], ...p });
    if (role !== "admin") return res(403, { code: "42501", message: "Só o administrador configura os avisos no WhatsApp." });
    const bad = (message) => res(400, { code: "22023", message });
    const c = db.waAvisosCfg;
    if (url.includes("/rpc/wa_avisos_config_save")) {
      if (p.p_grupo_id != null && !/^[0-9A-Za-z._-]{5,60}@g\.us$/.test(p.p_grupo_id)) return bad("Grupo inválido. Escolha o grupo na lista do WhatsApp.");
      if (p.p_ativo && p.p_grupo_id == null) return bad("Escolha o grupo de avisos antes de ligar.");
      Object.assign(c, { ativo: p.p_ativo, grupo_id: p.p_grupo_id, grupo_nome: p.p_grupo_nome, tipos: p.p_tipos ?? [], silencio_inicio: p.p_ini, silencio_fim: p.p_fim, repetir_horas: p.p_repetir });
      return res(204);
    }
    if (url.includes("/rpc/wa_sem_gasto_config_save")) {
      if (p.p_fim <= p.p_ini || p.p_minutos < 30) return bad("Janela ou tempo inválidos (início antes do fim; tempo de 30 minutos a 12 horas).");
      Object.assign(c, { sem_gasto_inicio: p.p_ini, sem_gasto_fim: p.p_fim, sem_gasto_minutos: p.p_minutos });
      return res(204);
    }
    db.waSemGasto = db.waSemGasto.filter((id) => id !== p.p_cliente);
    if (p.p_silenciar) db.waSemGasto.push(p.p_cliente);
    return res(204);
  }
  if (isMarc) return res(200, role === "admin" ? db.waMarcacoes.map(({ cliente_id, nome, numero, ativo }) => ({ cliente_id, nome, numero, ativo: ativo !== false })) : []);
  if (isMarcRpc) {
    const p = parse();
    db.rpcCalls.push({ fn: url.split("/rpc/")[1].split("?")[0], ...p });
    if (role !== "admin") return res(403, { code: "42501", message: "Só o administrador liga pessoas aos números do WhatsApp." });
    const bad = (message) => res(400, { code: "22023", message });
    if (url.includes("/rpc/wa_marcacao_salvar")) {
      let dig = String(p.p_numero ?? "").replace(/\D/g, "");
      if (dig.length === 10 || dig.length === 11) dig = `55${dig}`;
      if (!/^[0-9]{12,15}$/.test(dig)) return bad("Número inválido.");
      if (!String(p.p_nome ?? "").trim()) return bad("Dê um nome (apelido) à pessoa, até 200 letras.");
      if (db.waMarcacoes.some((x) => x.cliente_id === p.p_cliente && x.numero === dig && x.nome !== p.p_nome)) return bad("Esse número já está ligado a outra pessoa deste cliente.");
      const ja = db.waMarcacoes.find((x) => x.cliente_id === p.p_cliente && x.nome === p.p_nome);
      if (ja) ja.numero = dig; else db.waMarcacoes.push({ cliente_id: p.p_cliente, nome: p.p_nome, numero: dig, ativo: true });
      return res(204);
    }
    if (url.includes("/rpc/wa_marcacao_ativar")) {
      const ja = db.waMarcacoes.find((x) => x.cliente_id === p.p_cliente && x.nome === p.p_nome);
      if (ja) ja.ativo = Boolean(p.p_ativo);
      return res(204);
    }
    db.waMarcacoes = db.waMarcacoes.filter((x) => !(x.cliente_id === p.p_cliente && x.nome === p.p_nome));
    return res(204);
  }
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
    if (body.action === "participants") return res(200, { data: { participants: db.waParticipantes?.[body.groupId] ?? [] } });
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
