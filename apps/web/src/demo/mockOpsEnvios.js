// Etapa 41 — Envios semanais no servidor simulado (mesmas regras de private.ops_envio_*_impl).
// O CRM só guarda a configuração e o histórico; quem envia é o agente (MCP).

export function seedOpsEnvios() {
  // envioAgora: relógio dos testes (ISO); vazio = agora.
  return { opsEnvios: [], opsEnvioClientes: [], opsEnvioExecucoes: [], opsEnvioAprovacoes: [], envioAgora: null };
}

const spNow = (iso) => {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "America/Sao_Paulo", weekday: "short", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(iso ? new Date(iso) : new Date()).map((p) => [p.type, p.value]));
  const dow = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(parts.weekday);
  const day = `${parts.year}-${parts.month}-${parts.day}`;
  const monday = new Date(`${day}T00:00:00-03:00`);
  monday.setUTCDate(monday.getUTCDate() - ((dow + 6) % 7));
  return { dow, weekStart: monday.toISOString(), semana: monday.toISOString().slice(0, 10),
    hora: `${parts.hour}:${parts.minute}` };
};
const digits = (t) => String(t ?? "").replace(/[^0-9]/g, "");

export function handleOpsEnvios({ db, url, parse, userId, opsPerms, res }) {
  if (!url.includes("/rest/v1/rpc/ops_envio")) return null;
  const rpc = (fn) => url.includes(`/rest/v1/rpc/${fn}`) && !url.includes(`/rest/v1/rpc/${fn}_`);
  const p = parse();
  db.rpcCalls.push({ fn: url.split("/rpc/")[1].split("?")[0], ...p });
  const can = opsPerms.includes("ops.admin") || (opsPerms.includes("ops.access") && opsPerms.includes("ops.envios"));
  if (!can) return res(403, { code: "42501", message: "Você não tem permissão para esta ação na Central de Operações." });
  const bad = (message) => res(400, { code: "22023", message });
  const name = (id) => db.profiles.find((x) => x.id === id)?.full_name ?? null;
  const clientName = (id) => db.clients.find((c) => c.id === id)?.name ?? null;
  const now = spNow(db.envioAgora);
  const aprovacaoDe = (e) => db.opsEnvioAprovacoes.find((a) => a.envio_id === e.id && a.semana === now.semana) ?? null;
  const situacao = (e) => {
    const a = aprovacaoDe(e);
    const valida = Boolean(a && a.decisao === "aprovado" && a.versao_envio === e.versao);
    const hoje = e.ativo && !e.arquivado_em && e.dia_semana === now.dow;
    const sit = !hoje ? "nao_hoje" : valida ? "aprovado" : a?.decisao === "recusado" ? "recusado" : now.hora >= e.horario ? "nao_aprovado_a_tempo"
      : now.hora >= (e.horario <= "07:00" ? "00:00" : "07:00") ? "aguardando_aprovacao" : "antes_da_janela";
    return { semana: now.semana, situacao_hoje: sit, pode_enviar_agora: hoje && valida && now.hora >= e.horario,
      aprovacao: a ? { decisao: a.decisao, versao_envio: a.versao_envio, decidido_em: a.decidido_em, decidido_por_nome: name(a.decidido_por), origem: a.origem, valida } : null };
  };

  const json = (e, soAtivos) => ({
    ...e, ...situacao(e), criado_por_nome: name(e.criado_por), atualizado_por_nome: name(e.atualizado_por), toca_hoje: e.dia_semana === now.dow,
    clientes: db.opsEnvioClientes.filter((c) => c.envio_id === e.id && !c.removido_em && (!soAtivos || c.ativo)).map((c) => {
      const ex = db.opsEnvioExecucoes.filter((x) => x.envio_id === e.id && x.cliente_id === c.cliente_id).sort((a, b) => b.executado_em.localeCompare(a.executado_em));
      return { ...c, cliente_nome: clientName(c.cliente_id),
        ultima_execucao: ex[0] ? { executado_em: ex[0].executado_em, status: ex[0].status, detalhe: ex[0].detalhe } : null,
        ja_enviado_nesta_semana: ex.some((x) => x.status === "enviado" && x.executado_em >= now.weekStart) };
    }).sort((a, b) => (a.cliente_nome ?? "").localeCompare(b.cliente_nome ?? "")),
  });

  if (rpc("ops_envio_list")) {
    const f = p.f ?? {};
    const out = db.opsEnvios.filter((e) => (f.arquivados ? e.arquivado_em : !e.arquivado_em) && (!f.so_ativos || e.ativo))
      .sort((a, b) => a.dia_semana - b.dia_semana || a.horario.localeCompare(b.horario) || a.nome.localeCompare(b.nome)).map((e) => json(e, f.so_ativos));
    return res(200, { hoje: { dia_semana: now.dow, inicio_semana: now.weekStart }, envios: out });
  }
  if (rpc("ops_envio_pendentes")) {
    return res(200, db.opsEnvios.filter((e) => situacao(e).situacao_hoje === "aguardando_aprovacao").map((e) => json(e, true)));
  }
  if (rpc("ops_envio_decidir")) {
    const e = db.opsEnvios.find((x) => x.id === p.p_id);
    if (!e) return bad("Envio não encontrado.");
    if (e.versao !== p.p_versao) return res(409, { code: "40001", message: "O envio foi alterado depois que você abriu. Confira de novo antes de aprovar." });
    if (!["aguardando_aprovacao", "aprovado", "recusado"].includes(situacao(e).situacao_hoje)) return bad("Este envio não está esperando aprovação agora (só no dia, até o horário do envio).");
    if (now.hora >= e.horario) return bad("Passou do horário do envio: a decisão desta semana já foi fechada.");
    const row = { envio_id: e.id, semana: now.semana, decisao: p.p_aprovar ? "aprovado" : "recusado", versao_envio: e.versao, decidido_por: userId,
      decidido_em: new Date().toISOString(), origem: "manual" };
    const ex = aprovacaoDe(e);
    if (ex) Object.assign(ex, row); else db.opsEnvioAprovacoes.push({ id: db.opsEnvioAprovacoes.length + 1, ...row });
    return res(200, situacao(e));
  }
  if (rpc("ops_envio_aprovacoes")) {
    const f = p.f ?? {};
    return res(200, db.opsEnvioAprovacoes.filter((a) => !f.envio_id || a.envio_id === f.envio_id).sort((a, b) => b.semana.localeCompare(a.semana) || b.id - a.id)
      .map((a) => ({ ...a, envio_nome: db.opsEnvios.find((e) => e.id === a.envio_id)?.nome, decidido_por_nome: name(a.decidido_por) })));
  }
  if (rpc("ops_envio_get")) {
    const e = db.opsEnvios.find((x) => x.id === p.p_id);
    return e ? res(200, json(e, false)) : bad("Envio não encontrado.");
  }
  if (rpc("ops_envio_save")) {
    const i = p.p ?? {};
    const nome = String(i.nome ?? "").trim();
    const msg = String(i.mensagem ?? "").trim();
    if (nome.length < 2) return bad("Dê um nome ao envio (mínimo 2 letras).");
    if (!msg) return bad("Escreva a mensagem.");
    if (!(Number.isInteger(i.dia_semana) && i.dia_semana >= 0 && i.dia_semana <= 6) || !/^\d{2}:\d{2}$/.test(i.horario ?? "")) return bad("Escolha o dia da semana e o horário.");
    const clientes = Array.isArray(i.clientes) ? i.clientes : [];
    const seen = new Set();
    for (const c of clientes) {
      if (!db.clients.some((x) => x.id === c.cliente_id)) return bad("Cliente não encontrado.");
      if (seen.has(c.cliente_id)) return bad("Um cliente aparece duas vezes no envio.");
      seen.add(c.cliente_id);
      if (!String(c.nome_grupo ?? "").trim()) return bad(`Informe o nome do grupo de "${clientName(c.cliente_id)}".`);
      const names = (c.contatos_marcar ?? []).map((n) => String(n).trim()).filter(Boolean);
      if (names.length > 20) return bad("No máximo 20 pessoas para marcar por grupo.");
      if (names.some((n) => digits(n).length >= 8)) return bad('Em "Quem marcar" use só o nome como aparece no grupo, não o telefone.');
    }
    if (!clientes.some((c) => c.ativo !== false)) return bad("Deixe pelo menos um cliente ativo no envio.");
    const t = new Date().toISOString();
    let e;
    if (!p.p_id) {
      e = { id: crypto.randomUUID(), nome, mensagem: msg, dia_semana: i.dia_semana, horario: i.horario, ativo: i.ativo !== false, arquivado_em: null, versao: 1,
        criado_por: userId, atualizado_por: userId, created_at: t, updated_at: t };
      db.opsEnvios.push(e);
    } else {
      e = db.opsEnvios.find((x) => x.id === p.p_id);
      if (!e) return bad("Envio não encontrado.");
      if (e.arquivado_em) return bad("Envio arquivado: desarquive para editar.");
      if (e.versao !== p.p_versao) return res(409, { code: "40001", message: "Alguém alterou este envio antes de você. Recarregue para ver a versão atual." });
      Object.assign(e, { nome, mensagem: msg, dia_semana: i.dia_semana, horario: i.horario, ativo: i.ativo !== false, versao: e.versao + 1, atualizado_por: userId, updated_at: t });
      for (const c of db.opsEnvioClientes) if (c.envio_id === e.id && !c.removido_em && !seen.has(c.cliente_id)) Object.assign(c, { removido_em: t, ativo: false });
    }
    for (const c of clientes) {
      const fields = { nome_grupo: c.nome_grupo.trim(), contatos_marcar: (c.contatos_marcar ?? []).map((n) => String(n).trim()).filter(Boolean),
        ativo: c.ativo !== false, observacao: c.observacao?.trim() || null, removido_em: null, updated_at: t };
      const ex = db.opsEnvioClientes.find((x) => x.envio_id === e.id && x.cliente_id === c.cliente_id);
      if (ex) Object.assign(ex, fields);
      else db.opsEnvioClientes.push({ id: crypto.randomUUID(), envio_id: e.id, cliente_id: c.cliente_id, created_at: t, ...fields });
    }
    return res(200, e.id);
  }
  if (rpc("ops_envio_archive")) {
    const e = db.opsEnvios.find((x) => x.id === p.p_id);
    if (!e) return bad("Envio não encontrado.");
    e.arquivado_em = p.p_arquivar === false ? null : new Date().toISOString();
    e.versao += 1;
    return res(204);
  }
  if (rpc("ops_envio_execucao_add")) {
    const e = db.opsEnvios.find((x) => x.id === p.p_envio);
    if (!e) return bad("Envio não encontrado.");
    if (e.arquivado_em) return bad("Envio arquivado: não recebe execuções.");
    if (!db.opsEnvioClientes.some((c) => c.envio_id === e.id && c.cliente_id === p.p_cliente && !c.removido_em)) return bad("Este cliente não faz parte deste envio.");
    if (!["enviado", "falhou", "pulado"].includes(p.p_status)) return bad("Status inválido: use enviado, falhou ou pulado.");
    const id = db.opsEnvioExecucoes.length + 1;
    db.opsEnvioExecucoes.push({ id, envio_id: e.id, cliente_id: p.p_cliente, executado_em: p.p_executado_em ?? new Date().toISOString(), status: p.p_status,
      detalhe: p.p_detalhe?.trim() || null, registrado_por: userId, origem: "manual" });
    return res(200, id);
  }
  if (rpc("ops_envio_historico")) {
    const f = p.f ?? {};
    const day = (iso) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(iso));
    const out = db.opsEnvioExecucoes.filter((x) => (!f.envio_id || x.envio_id === f.envio_id) && (!f.cliente_id || x.cliente_id === f.cliente_id)
      && (!f.status || x.status === f.status) && (!f.de || day(x.executado_em) >= f.de) && (!f.ate || day(x.executado_em) <= f.ate))
      .sort((a, b) => b.executado_em.localeCompare(a.executado_em) || b.id - a.id).slice(0, Math.min(f.limite ?? 200, 500))
      .map((x) => ({ ...x, envio_nome: db.opsEnvios.find((e) => e.id === x.envio_id)?.nome, cliente_nome: clientName(x.cliente_id),
        nome_grupo: db.opsEnvioClientes.find((c) => c.envio_id === x.envio_id && c.cliente_id === x.cliente_id)?.nome_grupo ?? null,
        registrado_por_nome: name(x.registrado_por) }));
    return res(200, out);
  }
  return null;
}
