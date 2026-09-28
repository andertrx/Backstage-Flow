/**
 * Tarefas da Central (Etapas 36.2 a 36.5) no servidor simulado: mesmas regras
 * das funções ops_* do banco (quem vê, permissões, versão, dependências,
 * etapas do cliente com regras de avanço, filas por setor, demandas).
 * Devolve a resposta, ou null quando o endereço não é de tarefas.
 */
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
const addDays = (d, n) => { const x = new Date(`${d}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };

export function seedOpsTasks() {
  return {
    opsStatuses: [
      ["nao_iniciado", "Não Iniciado", "#06B6D4", "aberto"], ["em_andamento", "Em Andamento", "#F59E0B", "andamento"],
      ["aguardando_cliente", "Aguardando Cliente", "#EAB308", "aguardando_cliente"], ["aguardando_interno", "Aguardando Interno", "#64748B", "aguardando_interno"],
      ["bloqueado", "Bloqueado", "#EF4444", "bloqueado"], ["em_revisao", "Em Revisão", "#3B82F6", "revisao"],
      ["finalizado", "Finalizado", "#10B981", "concluido"], ["cancelado", "Cancelado", "#94A3B8", "cancelado"],
    ].map(([id, name, color, category], i) => ({ id, name, color, category, position: i + 1, active: true })),
    opsTasks: [],
    opsTaskSeq: 0,
    opsDeps: [],
    opsComments: [],
    opsAttachments: [],
    opsActivity: [],
    opsFiles: {},
    // 36.3
    opsClientStages: [
      ["contrato_pago", "Contrato Pago", "#10B981"], ["onboarding_pendente", "Onboarding Pendente", "#06B6D4"],
      ["coleta_acessos", "Coleta de Acessos e Materiais", "#22D3EE"], ["briefing", "Briefing", "#3B82F6"],
      ["configuracao_inicial", "Configuração Inicial", "#A855F7"], ["liberado_execucao", "Liberado para Execução", "#F59E0B"],
      ["operacao_andamento", "Operação em Andamento", "#EAB308"], ["acompanhamento", "Acompanhamento", "#EC4899"], ["concluido", "Concluído", "#64748B"],
    ].map(([id, name, color], i) => ({ id, name, color, position: i + 1, active: true, require_mandatory: true, auto_advance: false })),
    opsClientOps: {},
    // Setores do servidor simulado: Design = …14, Copy = …15, Gestão de Tráfego = …16, Dev = …18.
    opsQueueColumns: [
      ["14", "Criativos pendentes", "#06B6D4", "nao_iniciado"], ["14", "Criativos em produção", "#F59E0B", "em_andamento"],
      ["14", "Materiais em revisão", "#3B82F6", "em_revisao"], ["14", "Aguardando aprovação", "#EAB308", "aguardando_cliente"],
      ["14", "Entregas concluídas", "#10B981", "finalizado"],
      ["15", "Textos solicitados", "#06B6D4", "nao_iniciado"], ["15", "Textos em desenvolvimento", "#F59E0B", "em_andamento"],
      ["15", "Textos em revisão", "#3B82F6", "em_revisao"], ["15", "Aguardando aprovação", "#EAB308", "aguardando_cliente"],
      ["15", "Entregas concluídas", "#10B981", "finalizado"],
      ["16", "Configurações pendentes", "#06B6D4", "nao_iniciado"], ["16", "Campanhas em preparação", "#F59E0B", "em_andamento"],
      ["16", "Demandas de ajustes", "#EF4444", "em_andamento"], ["16", "Aguardando materiais", "#64748B", "aguardando_interno"],
      ["16", "Tarefas concluídas", "#10B981", "finalizado"],
      ["18", "Solicitações pendentes", "#06B6D4", "nao_iniciado"], ["18", "Em desenvolvimento", "#F59E0B", "em_andamento"],
      ["18", "Testes", "#A855F7", "em_revisao"], ["18", "Revisões", "#3B82F6", "em_revisao"], ["18", "Entregas concluídas", "#10B981", "finalizado"],
    ].map(([sec, name, color, status_id], i) => ({ id: `9c000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
      sector_id: `5ec70000-0000-4000-8000-0000000000${sec}`, name, color, status_id, position: (i % 5) + 1, active: true })),
    opsDemands: [],
    opsDemandSeq: 0,
    opsActivityTypes: [
      ["reuniao_cliente", "Reunião com cliente"], ["solicitacao", "Solicitação recebida"], ["ajuste_campanha", "Ajuste de campanha"],
      ["envio_criativos", "Envio de criativos"], ["aprovacao", "Aprovação de material"], ["alteracao", "Alteração operacional"], ["entrega", "Entrega realizada"],
    ].map(([id, name], i) => ({ id, name, position: i + 1, active: true })),
    opsClientNotes: [],
    // 36.4
    opsLeadStages: [
      ["prospeccao", "Prospecção", "#64748B", "aberto"], ["primeiro_contato", "Primeiro Contato", "#06B6D4", "aberto"],
      ["reuniao_agendada", "Reunião Agendada", "#22D3EE", "aberto"], ["reuniao_realizada", "Reunião Realizada", "#3B82F6", "aberto"],
      ["proposta_enviada", "Proposta Enviada", "#A855F7", "aberto"], ["negociacao", "Negociação", "#F59E0B", "aberto"],
      ["contrato_enviado", "Contrato Enviado", "#EAB308", "aberto"], ["contrato_assinado", "Contrato Assinado", "#EC4899", "aberto"],
      ["aguardando_pagamento", "Aguardando Pagamento", "#7C3AED", "aberto"], ["contrato_pago", "Contrato Pago", "#10B981", "ganho"],
      ["perdido", "Perdido", "#EF4444", "perdido"],
    ].map(([id, name, color, category], i) => ({ id, name, color, category, position: i + 1, active: true, require_previous: false, require_next_action: false })),
    opsLossReasons: [["sem_fit", "Sem fit com a empresa"], ["sem_interesse", "Sem interesse no plano"], ["valor", "Valor incompatível"],
      ["sem_retorno", "Sem retorno"], ["outros", "Outros motivos"]].map(([id, name], i) => ({ id, name, position: i + 1, active: true })),
    opsLeads: [],
    opsLeadSeq: 0,
    opsLeadEvents: [],
    // 36.5
    opsMeetingCategories: [["daily", "Daily", "#2563EB"], ["setor", "Reunião de setor", "#7C3AED"], ["cliente", "Reunião com cliente", "#10B981"],
      ["planejamento", "Planejamento", "#F59E0B"], ["alinhamento", "Alinhamento interno", "#06B6D4"], ["outra", "Outra", "#64748B"]]
      .map(([id, name, color], i) => ({ id, name, color, position: i + 1, active: true })),
    opsMeetings: [],
    opsMeetingSeq: 0,
    opsMeetingItems: [],
    // 36.6
    opsNotifications: [],
    opsNotificationPrefs: {},
    opsRecurrences: [],
    // 36.7
    opsSavedViews: [],
  };
}

export function handleOpsTasks({ db, url, method, parse, rawBody, role, userId, opsPerms, res }) {
  const can = (p) => opsPerms.includes("ops.admin") || (opsPerms.includes("ops.access") && opsPerms.includes(p));
  const bad = (message) => res(400, { code: "22023", message });
  const deny = (message = "Você não tem permissão para isso na Central de Operações.") => res(403, { code: "42501", message });
  const conflict = () => res(409, { code: "40001", message: "Alguém alterou esta tarefa antes de você. Recarregue para ver a versão atual." });
  const name = (id) => db.profiles.find((p) => p.id === id)?.full_name ?? null;
  const statusOf = (id) => db.opsStatuses.find((s) => s.id === id);
  const closed = (t) => ["concluido", "cancelado"].includes(statusOf(t.status_id)?.category);
  const memberOk = (id) => {
    const prof = db.profiles.find((p) => p.id === id);
    if (!prof?.active || prof.role === "cliente") return false;
    return prof.role === "admin" || (db.opsMembers[id]?.active && db.opsMembers[id].permissions.includes("ops.access"));
  };
  const visibleFor = (t, uid, r) => {
    if (r === "admin") return true;
    const m = db.opsMembers[uid];
    if (!m?.active || !m.permissions.includes("ops.access")) return false;
    const onTask = t.people.some((p) => p.user_id === uid);
    if (t.created_by === uid || t.visibility === "equipe") return true;
    // 36.3: o Account Manager do cliente vê as demandas de todos os setores (menos "só as pessoas da tarefa").
    if (t.visibility !== "participantes" && t.client_id && db.opsClientOps[t.client_id]?.am_user_id === uid) return true;
    if (t.visibility === "participantes") return onTask;
    return onTask || m.primary === t.sector_id || m.secondary.includes(t.sector_id);
  };
  const visible = (t) => visibleFor(t, userId, role);
  const blockers = (t) => db.opsDeps.filter((d) => d.task_id === t.id)
    .map((d) => db.opsTasks.find((o) => o.id === d.depends_on_id)).filter((o) => o && !o.archived_at && !closed(o)).length;
  const log = (t, action, before, after, origin = "manual") =>
    db.opsActivity.push({ id: db.opsActivity.length + 1, task_id: t.id, client_id: t.client_id ?? null, action, actor_id: userId, origin, before, after,
      created_at: new Date().toISOString() });
  const logClient = (clientId, action, before, after, origin = "manual") =>
    db.opsActivity.push({ id: db.opsActivity.length + 1, task_id: null, client_id: clientId, action, actor_id: userId, origin, before, after,
      created_at: new Date().toISOString() });
  /** 36.6: notificação (sem avisar quem fez, sem duplicar, respeitando as preferências). */
  const notify = (uid, kind, title, body, link, dedupe) => {
    if (!uid || uid === userId || !memberOk(uid)) return;
    if ((db.opsNotificationPrefs[uid] ?? []).includes(kind)) return;
    if (db.opsNotifications.some((n) => n.user_id === uid && n.dedupe_key === dedupe)) return;
    db.opsNotifications.push({ id: db.opsNotifications.length + 1, user_id: uid, kind, title, body, link, actor_id: userId, dedupe_key: dedupe,
      created_at: new Date().toISOString(), read_at: null });
  };
  const roleText = { principal: "Como responsável principal", adicional: "Como responsável adicional", aprovador: "Como aprovador", observador: "Como observador" };
  const notifyPeople = (t) => { for (const x of t.people) notify(x.user_id, "tarefa.atribuida", `Você entrou na tarefa #${t.number}: ${t.title}`, roleText[x.role], `/operacoes/tarefas?tarefa=${t.id}`, `atribuida:${t.id}:${x.user_id}`); };
  const stageOf = (id) => db.opsClientStages.find((x) => x.id === id);
  const isAm = (cid) => opsPerms.includes("ops.access") && db.opsClientOps[cid]?.am_user_id === userId;
  const clientVisible = (cid) => Boolean(cid) && (can("ops.clients.view") || isAm(cid));
  const canMoveClient = (cid) => role === "admin" || isAm(cid) || (can("ops.clients.view") && can("ops.cards.move"));
  const canManageClients = () => role === "admin" || (can("ops.clients.view") && can("ops.tasks.assign"));
  /** Obrigatórias abertas nas etapas de posição [de, até) que exigem obrigatórias. */
  const pending = (cid, from, to) => db.opsTasks.filter((t) => {
    const st = stageOf(t.client_stage_id);
    return t.client_id === cid && t.mandatory && !t.archived_at && st?.require_mandatory && st.position >= from && st.position < to && !closed(t);
  }).length;
  /** Avanço automático: só com a regra ligada, ao menos 1 obrigatória e todas concluídas. */
  const autoAdvance = (t) => {
    if (!t.mandatory || !t.client_id || !t.client_stage_id) return;
    const o = db.opsClientOps[t.client_id];
    const st = o && stageOf(o.stage_id);
    if (!o || o.stage_id !== t.client_stage_id || !st?.auto_advance) return;
    const inStage = db.opsTasks.filter((x) => x.client_id === t.client_id && x.client_stage_id === st.id && x.mandatory && !x.archived_at);
    if (!inStage.length || inStage.some((x) => !closed(x))) return;
    const next = db.opsClientStages.filter((x) => x.active && x.position > st.position).sort((a, b) => a.position - b.position)[0];
    if (!next) return;
    Object.assign(o, { stage_id: next.id, stage_since: new Date().toISOString(), version: o.version + 1 });
    logClient(t.client_id, "cliente.etapa", { etapa: st.id }, { etapa: next.id, regra: `Avanço automático: todas as tarefas obrigatórias de "${st.name}" concluídas` }, "sistema");
  };
  const setStatus = (t, version, statusId) => {
    if (!(can("ops.cards.move") || can("ops.tasks.edit"))) return deny("Você não tem permissão para mudar o status desta tarefa.");
    if (t.archived_at) return bad("Tarefa arquivada: desarquive para mudar o status.");
    if (t.version !== version) return conflict();
    const s = statusOf(statusId);
    if (!s?.active) return bad("Status inválido ou desativado.");
    const n = blockers(t);
    if (s.category === "concluido" && n > 0) {
      return bad(`Esta tarefa depende de ${n} tarefa(s) ainda aberta(s). Conclua ou retire a dependência antes de finalizar.`);
    }
    if (t.status_id === s.id) return null;
    log(t, "tarefa.status", { status: t.status_id }, { status: s.id });
    const wasDone = t.completed_at;
    Object.assign(t, { status_id: s.id, version: t.version + 1, completed_at: s.category === "concluido" ? new Date().toISOString() : null });
    if (!wasDone && t.completed_at) {
      notify(t.created_by, "tarefa.concluida", `Tarefa #${t.number} concluída: ${t.title}`, `Concluída por ${name(userId)}`, `/operacoes/tarefas?tarefa=${t.id}`, `concluida:${t.id}:${t.completed_at}`);
    }
    autoAdvance(t);
    return null;
  };
  const summary = (cid) => {
    const t0 = today();
    const ts = db.opsTasks.filter((t) => t.client_id === cid && !t.archived_at);
    const open = ts.filter((t) => !closed(t));
    const cat = (t) => statusOf(t.status_id).category;
    const acts = [...db.opsActivity.filter((a) => a.client_id === cid).map((a) => a.created_at),
      ...db.opsClientNotes.filter((n) => n.client_id === cid && !n.removed_at).map((n) => n.happened_at)].sort();
    return {
      abertas: open.length, concluidas: ts.filter((t) => cat(t) === "concluido").length,
      atrasadas: open.filter((t) => t.due_date && t.due_date < t0).length, urgentes: open.filter((t) => t.priority === "urgente").length,
      bloqueadas: open.filter((t) => cat(t) === "bloqueado" || blockers(t) > 0).length,
      aguardando_cliente: ts.filter((t) => cat(t) === "aguardando_cliente").length,
      proxima_entrega: open.map((t) => t.due_date).filter((d) => d && d >= t0).sort()[0] ?? null,
      obrigatorias: ts.filter((t) => t.mandatory).length, obrigatorias_concluidas: ts.filter((t) => t.mandatory && closed(t)).length,
      setores: [...new Set(open.map((t) => t.sector_id))], ultima_atividade: acts.at(-1) ?? null,
    };
  };
  const peopleJson = (t) => [...t.people].sort((a, b) => ["principal", "adicional", "aprovador", "observador"].indexOf(a.role)
    - ["principal", "adicional", "aprovador", "observador"].indexOf(b.role)).map((p) => ({ ...p, name: name(p.user_id) }));
  const writePeople = (input) => {
    const out = [];
    const add = (id, r) => { if (id && !out.some((p) => p.user_id === id)) out.push({ user_id: id, role: r }); };
    add(input?.principal, "principal");
    for (const id of input?.adicionais ?? []) add(id, "adicional");
    for (const id of input?.aprovadores ?? []) add(id, "aprovador");
    for (const id of input?.observadores ?? []) add(id, "observador");
    return out;
  };
  const tags = (list) => {
    const seen = new Set();
    return (list ?? []).map((x) => String(x).trim()).filter((x) => x && !seen.has(x.toLowerCase()) && seen.add(x.toLowerCase())).sort((a, b) => a.localeCompare(b));
  };
  const row = (t) => {
    const s = statusOf(t.status_id);
    return { ...t, client_name: db.clients.find((c) => c.id === t.client_id)?.name ?? null, status_name: s.name, status_color: s.color, category: s.category,
      people: peopleJson(t), blockers: blockers(t), comments: db.opsComments.filter((c) => c.task_id === t.id && !c.removed_at).length,
      attachments: db.opsAttachments.filter((a) => a.task_id === t.id && !a.removed_at).length,
      overdue: Boolean(t.due_date && t.due_date < today() && !closed(t)) };
  };
  const find = (id) => { const t = db.opsTasks.find((x) => x.id === id); return t && visible(t) ? t : null; };
  const rpc = (fn) => url.includes(`/rest/v1/rpc/${fn}`) && !url.includes(`/rest/v1/rpc/${fn}_`);

  // --- Arquivos (bucket privado ops-files: pasta = id da tarefa visível)
  const files = url.match(/\/storage\/v1\/object\/(sign\/)?ops-files\/(.+?)(\?|$)/);
  if (files) {
    const path = decodeURIComponent(files[2]);
    const folder = path.split("/")[0];
    const t = folder.startsWith("cliente-") ? (clientVisible(folder.slice(8)) && can("ops.history.edit") ? { id: folder } : null) : find(folder);
    if (!t) return res(403, { statusCode: "403", error: "Unauthorized", message: "new row violates row-level security policy" });
    if (files[1]) return db.opsFiles[path] ? res(200, { signedURL: `/object/sign/ops-files/${path}?token=demo` }) : res(404, { message: "Object not found" });
    if (method === "POST" || method === "PUT") {
      db.opsFiles[path] = { size: rawBody?.length ?? 1 };
      return res(200, { Key: `ops-files/${path}` });
    }
    return res(405, { message: "not allowed" });
  }

  const sorted = (list) => (opsPerms.includes("ops.access") ? [...list].sort((a, b) => a.position - b.position) : []);
  if (url.includes("/rest/v1/ops_statuses")) return res(200, sorted(db.opsStatuses));
  if (url.includes("/rest/v1/ops_client_stages")) return res(200, sorted(db.opsClientStages));
  if (url.includes("/rest/v1/ops_queue_columns")) return res(200, sorted(db.opsQueueColumns));
  if (url.includes("/rest/v1/ops_activity_types")) return res(200, sorted(db.opsActivityTypes));
  if (url.includes("/rest/v1/ops_lead_stages")) return res(200, can("ops.commercial") ? sorted(db.opsLeadStages) : []);
  if (url.includes("/rest/v1/ops_loss_reasons")) return res(200, can("ops.commercial") ? sorted(db.opsLossReasons) : []);
  if (url.includes("/rest/v1/ops_meeting_categories")) return res(200, sorted(db.opsMeetingCategories));
  if (url.includes("/rest/v1/ops_notification_prefs")) return res(200, db.opsNotificationPrefs[userId] ? { muted: db.opsNotificationPrefs[userId] } : null);
  if (url.includes("/rest/v1/ops_saved_views")) {
    const page = new URL(url, "http://x").searchParams.get("page")?.replace(/^eq\./, "");
    return res(200, db.opsSavedViews.filter((v) => v.user_id === userId && (!page || v.page === page)).sort((a, b) => a.name.localeCompare(b.name)));
  }
  const prefixes = ["ops_task", "ops_comment", "ops_attachment", "ops_directory", "ops_team_counts", "ops_status", "ops_client", "ops_demand",
    "ops_queue", "ops_activity_type", "ops_lead", "ops_loss_reason", "ops_meeting", "ops_notification", "ops_recurrence",
    "ops_saved_view", "ops_my_summary", "ops_dashboard", "ops_search"];
  if (!prefixes.some((x) => url.includes(`/rest/v1/rpc/${x}`))) return null;
  const p = parse();
  db.rpcCalls.push({ fn: url.split("/rpc/")[1].split("?")[0], ...p });

  if (rpc("ops_task_list")) {
    const f = p.f ?? {};
    const q = (f.q ?? "").toLowerCase();
    const t0 = today();
    const out = db.opsTasks.filter(visible).map(row).filter((t) =>
      (f.archived ? t.archived_at : !t.archived_at)
      && (!q || t.title.toLowerCase().includes(q) || (t.description ?? "").toLowerCase().includes(q) || String(t.number) === q.replace("#", "")
          || (t.client_name ?? "").toLowerCase().includes(q))
      && (!f.client_id || t.client_id === f.client_id) && (!f.sector_id || t.sector_id === f.sector_id) && (!f.demand_id || t.demand_id === f.demand_id)
      && (!f.status_ids?.length || f.status_ids.includes(t.status_id)) && (!f.priorities?.length || f.priorities.includes(t.priority))
      && (!f.categories?.length || f.categories.includes(t.category))
      && (!f.person_id || (f.person_id === "nenhum" ? !t.people.some((x) => x.role === "principal") : t.people.some((x) => x.user_id === f.person_id)))
      && (!f.mine || t.people.some((x) => x.user_id === userId))
      && (f.due === "atrasadas" ? t.overdue : f.due === "hoje" ? t.due_date === t0 : f.due === "semana" ? t.due_date && t.due_date >= t0 && t.due_date <= addDays(t0, 7)
        : f.due === "sem_prazo" ? !t.due_date : true));
    const pr = { urgente: 1, alta: 2, media: 3, baixa: 4 };
    out.sort((a, b) => (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999") || pr[a.priority] - pr[b.priority] || b.number - a.number);
    return res(200, out);
  }
  if (rpc("ops_task_get")) {
    const t = find(p.p_id);
    if (!t) return res(200, null);
    return res(200, {
      task: { ...row(t), created_by_name: name(t.created_by) },
      people: peopleJson(t),
      demand: (() => {
        const dm = db.opsDemands.find((x) => x.id === t.demand_id);
        return dm ? { id: dm.id, number: dm.number, title: dm.title, tasks: db.opsTasks.filter((o) => o.demand_id === dm.id).sort((a, b) => a.number - b.number)
          .map((o) => ({ id: o.id, number: o.number, sector_id: o.sector_id, title: visible(o) ? o.title : null, status_name: statusOf(o.status_id).name,
            status_color: statusOf(o.status_id).color, done: closed(o), visible: visible(o) })) } : null;
      })(),
      stage_name: stageOf(t.client_stage_id)?.name ?? null,
      tags: t.tags,
      depends_on: db.opsDeps.filter((d) => d.task_id === t.id).map((d) => {
        const o = db.opsTasks.find((x) => x.id === d.depends_on_id);
        const s = statusOf(o.status_id);
        return { id: o.id, number: o.number, title: o.title, status_name: s.name, status_color: s.color, done: closed(o), visible: visible(o) };
      }),
      dependents: db.opsDeps.filter((d) => d.depends_on_id === t.id).map((d) => db.opsTasks.find((x) => x.id === d.task_id)).filter(visible)
        .map((o) => ({ id: o.id, number: o.number, title: o.title })),
      comments: db.opsComments.filter((c) => c.task_id === t.id && !c.removed_at)
        .map((c) => ({ id: c.id, author_id: c.author_id, author: name(c.author_id), body: c.body, created_at: c.created_at, mentions: c.mentions.map(name) })),
      attachments: db.opsAttachments.filter((a) => a.task_id === t.id && !a.removed_at).map((a) => ({ ...a, uploader: name(a.uploaded_by) })),
      activity: db.opsActivity.filter((a) => a.task_id === t.id).reverse().map((a) => ({ ...a, actor: name(a.actor_id) })),
      can: { edit: can("ops.tasks.edit"), move: can("ops.cards.move") || can("ops.tasks.edit"), assign: can("ops.tasks.assign"),
        archive: can("ops.tasks.archive"), sector: can("ops.tasks.sector"), admin: role === "admin" },
    });
  }
  if (rpc("ops_directory")) {
    if (!opsPerms.includes("ops.access")) return res(200, null);
    return res(200, {
      people: db.profiles.filter((x) => memberOk(x.id)).map((x) => ({ user_id: x.id, name: x.full_name, sector_id: db.opsMembers[x.id]?.primary ?? null,
        sectors: db.opsMembers[x.id] ? [db.opsMembers[x.id].primary, ...db.opsMembers[x.id].secondary] : [] })).sort((a, b) => a.name.localeCompare(b.name)),
      clients: db.clients.filter((c) => (can("ops.tasks.create") && c.status !== "encerrado") || db.opsTasks.some((t) => t.client_id === c.id && visible(t)))
        .map((c) => ({ id: c.id, name: c.name, status: c.status ?? "ativo" })),
    });
  }
  if (rpc("ops_team_counts")) {
    if (!opsPerms.includes("ops.access")) return res(200, []);
    const t0 = today();
    const by = new Map();
    for (const t of db.opsTasks.filter((x) => !x.archived_at)) {
      const cat = statusOf(t.status_id).category;
      for (const person of t.people.filter((x) => x.role === "principal" || x.role === "adicional")) {
        const c = by.get(person.user_id) ?? { user_id: person.user_id, abertas: 0, em_andamento: 0, atrasadas: 0, concluidas_30d: 0, proxima_entrega: null };
        if (!closed(t)) {
          c.abertas++;
          if (t.due_date && t.due_date < t0) c.atrasadas++;
          if (t.due_date && t.due_date >= t0 && (!c.proxima_entrega || t.due_date < c.proxima_entrega)) c.proxima_entrega = t.due_date;
        }
        if (cat === "andamento") c.em_andamento++;
        if (cat === "concluido") c.concluidas_30d++;
        by.set(person.user_id, c);
      }
    }
    return res(200, [...by.values()]);
  }

  if (rpc("ops_task_save")) {
    const input = p.p ?? {};
    let t = null;
    if (!p.p_id) {
      if (!can("ops.tasks.create")) return deny();
      const people = writePeople(input.people);
      if (people.some((x) => x.user_id !== userId) && !can("ops.tasks.assign")) return deny("Você não tem permissão para atribuir outras pessoas.");
      if (people.some((x) => !memberOk(x.user_id))) return bad("Só pessoas ativas na Central podem entrar na tarefa.");
    } else {
      t = find(p.p_id);
      if (!t) return bad("Tarefa não encontrada.");
      if (!can("ops.tasks.edit")) return deny();
      if (t.archived_at) return bad("Tarefa arquivada: desarquive para editar.");
      if (t.version !== p.p_version) return conflict();
      if (input.sector_id !== t.sector_id && !can("ops.tasks.sector")) return deny("Você não tem permissão para mudar o setor da tarefa.");
    }
    if (!db.opsSectors.some((s) => s.id === input.sector_id && (s.status === "ativo" || s.id === t?.sector_id))) return bad("Escolha um setor ativo.");
    if ((input.title ?? "").trim().length < 3) return bad("Escreva o título (mínimo 3 letras).");
    if (input.client_stage_id) {
      if (!input.client_id) return bad("Etapa do onboarding só vale para tarefa de cliente.");
      const st = stageOf(input.client_stage_id);
      if (!st || (!st.active && st.id !== t?.client_stage_id)) return bad("Escolha uma etapa ativa do onboarding.");
    }
    const fields = { title: input.title.trim(), description: input.description?.trim() || null, client_id: input.client_id || null, sector_id: input.sector_id,
      priority: input.priority || "media", start_date: input.start_date || null, due_date: input.due_date || null,
      effort_hours: input.effort_hours ? Number(input.effort_hours) : null, visibility: input.visibility || "setor", tags: tags(input.tags),
      client_stage_id: input.client_id ? input.client_stage_id || null : null,
      mandatory: Boolean(input.client_id && input.client_stage_id && input.mandatory) };
    const now = new Date().toISOString();
    if (!t) {
      const status = statusOf(input.status_id || "nao_iniciado");
      if (!status?.active) return bad("Escolha um status ativo.");
      t = { id: crypto.randomUUID(), number: ++db.opsTaskSeq, ...fields, status_id: status.id, people: writePeople(input.people), version: 1, created_by: userId,
        created_at: now, updated_at: now, completed_at: status.category === "concluido" ? now : null, archived_at: null, demand_id: null, queue_column_id: null };
      db.opsTasks.push(t);
      log(t, "tarefa.criada", null, { titulo: t.title });
      notifyPeople(t);
    } else {
      const changed = Object.keys(fields).filter((k) => JSON.stringify(fields[k]) !== JSON.stringify(t[k]));
      Object.assign(t, fields, { version: t.version + 1, updated_at: now });
      const map = { title: "titulo", description: "descricao", client_id: "cliente", sector_id: "setor", priority: "prioridade", start_date: "inicio",
        due_date: "prazo", effort_hours: "esforco", visibility: "visibilidade", tags: "etiquetas", client_stage_id: "etapa", mandatory: "obrigatoria" };
      if (changed.length) log(t, "tarefa.editada", {}, Object.fromEntries(changed.map((k) => [map[k], fields[k]])));
    }
    return res(200, t.id);
  }
  if (rpc("ops_task_set_status")) {
    const t = find(p.p_id);
    if (!t) return bad("Tarefa não encontrada.");
    return setStatus(t, p.p_version, p.p_status) ?? res(200, t.version);
  }
  if (rpc("ops_task_move_queue")) {
    const t = find(p.p_id);
    if (!t) return bad("Tarefa não encontrada.");
    const c = db.opsQueueColumns.find((x) => x.id === p.p_column);
    if (!c || !c.active || c.sector_id !== t.sector_id) return bad("Esta coluna não é da fila do setor da tarefa.");
    const old = db.opsQueueColumns.find((x) => x.id === t.queue_column_id);
    if (t.status_id !== c.status_id) {
      const r = setStatus(t, p.p_version, c.status_id);
      if (r) return r;
    } else {
      if (!(can("ops.cards.move") || can("ops.tasks.edit"))) return deny("Você não tem permissão para mover esta tarefa.");
      if (t.archived_at) return bad("Tarefa arquivada: desarquive para mover.");
      if (t.version !== p.p_version) return conflict();
      t.version++;
    }
    if (t.queue_column_id !== c.id) log(t, "tarefa.fila", { coluna: old?.name ?? null }, { coluna: c.name });
    t.queue_column_id = c.id;
    return res(200, t.version);
  }
  if (rpc("ops_task_set_people")) {
    const t = find(p.p_id);
    if (!t) return bad("Tarefa não encontrada.");
    if (!can("ops.tasks.assign")) return deny();
    if (t.archived_at) return bad("Tarefa arquivada: desarquive para mudar as pessoas.");
    if (t.version !== p.p_version) return conflict();
    const people = writePeople(p.p_people);
    if (people.some((x) => !memberOk(x.user_id))) return bad("Só pessoas ativas na Central podem entrar na tarefa.");
    log(t, "tarefa.pessoas", { pessoas: t.people }, { pessoas: people });
    Object.assign(t, { people, version: t.version + 1 });
    notifyPeople(t);
    return res(200, t.version);
  }
  if (rpc("ops_task_archive")) {
    const t = find(p.p_id);
    if (!t) return bad("Tarefa não encontrada.");
    if (!can("ops.tasks.archive")) return deny();
    if (Boolean(t.archived_at) === Boolean(p.p_archived)) return res(204);
    t.archived_at = p.p_archived ? new Date().toISOString() : null;
    t.version++;
    log(t, p.p_archived ? "tarefa.arquivada" : "tarefa.desarquivada", null, null);
    autoAdvance(t);
    return res(204);
  }
  if (rpc("ops_task_dependency")) {
    const t = find(p.p_id);
    const o = find(p.p_depends_on);
    if (!t || !o) return bad("Tarefa não encontrada.");
    if (!can("ops.tasks.edit")) return deny();
    if (!p.p_add) {
      db.opsDeps = db.opsDeps.filter((d) => !(d.task_id === t.id && d.depends_on_id === o.id));
      log(t, "tarefa.dependencia_retirada", { depende_de: o.number }, null);
      return res(204);
    }
    if (t.id === o.id) return bad("Uma tarefa não pode depender dela mesma.");
    const reaches = (from, target, seen = new Set()) => from === target || db.opsDeps.filter((d) => d.task_id === from && !seen.has(d.depends_on_id))
      .some((d) => { seen.add(d.depends_on_id); return reaches(d.depends_on_id, target, seen); });
    if (reaches(o.id, t.id)) return bad("Isso criaria um ciclo (uma tarefa esperando a outra para sempre).");
    if (!db.opsDeps.some((d) => d.task_id === t.id && d.depends_on_id === o.id)) {
      db.opsDeps.push({ task_id: t.id, depends_on_id: o.id });
      log(t, "tarefa.dependencia_incluida", null, { depende_de: o.number });
    }
    return res(204);
  }
  if (rpc("ops_comment_add")) {
    const t = find(p.p_task);
    if (!t) return bad("Tarefa não encontrada.");
    if (!(p.p_body ?? "").trim()) return bad("Escreva o comentário.");
    const mentions = [...new Set(p.p_mentions ?? [])];
    for (const id of mentions) {
      const prof = db.profiles.find((x) => x.id === id);
      if (!prof || !memberOk(id) || !visibleFor(t, id, prof.role)) return bad("Uma das pessoas mencionadas não enxerga esta tarefa. Inclua a pessoa na tarefa antes de mencionar.");
    }
    const id = db.opsComments.length + 1;
    db.opsComments.push({ id, task_id: t.id, author_id: userId, body: p.p_body.trim(), mentions, created_at: new Date().toISOString(), removed_at: null });
    log(t, "tarefa.comentario", null, { comentario: p.p_body.trim().slice(0, 300) });
    for (const u of mentions) notify(u, "tarefa.mencao", `${name(userId)} mencionou você na tarefa #${t.number}`, p.p_body.trim().slice(0, 200), `/operacoes/tarefas?tarefa=${t.id}`, `mencao:${id}`);
    for (const u of new Set([...t.people.map((x) => x.user_id), t.created_by])) {
      if (!mentions.includes(u)) notify(u, "tarefa.comentario", `${name(userId)} comentou na tarefa #${t.number}: ${t.title}`, p.p_body.trim().slice(0, 200), `/operacoes/tarefas?tarefa=${t.id}`, `comentario:${id}`);
    }
    return res(200, id);
  }
  if (rpc("ops_comment_remove")) {
    const c = db.opsComments.find((x) => x.id === p.p_id);
    const t = c && find(c.task_id);
    if (!t) return bad("Comentário não encontrado.");
    if (c.author_id !== userId && role !== "admin") return deny("Só quem escreveu (ou o admin) pode retirar o comentário.");
    c.removed_at = new Date().toISOString();
    log(t, "tarefa.comentario_retirado", { comentario: c.body.slice(0, 300) }, null);
    return res(204);
  }
  if (rpc("ops_attachment_add")) {
    const t = find(p.p_task);
    if (!t) return bad("Tarefa não encontrada.");
    if (!String(p.p_path).startsWith(`${t.id}/`)) return bad("Arquivo fora da pasta da tarefa.");
    if (!db.opsFiles[p.p_path]) return bad("O arquivo não chegou ao armazenamento. Envie de novo.");
    const id = crypto.randomUUID();
    db.opsAttachments.push({ id, task_id: t.id, path: p.p_path, name: p.p_name, mime: "application/octet-stream", size_bytes: db.opsFiles[p.p_path].size,
      uploaded_by: userId, created_at: new Date().toISOString(), removed_at: null });
    log(t, "tarefa.anexo_incluido", null, { arquivo: p.p_name });
    return res(200, id);
  }
  if (rpc("ops_attachment_remove")) {
    const a = db.opsAttachments.find((x) => x.id === p.p_id);
    const t = a && find(a.task_id);
    if (!t) return bad("Anexo não encontrado.");
    if (a.uploaded_by !== userId && !can("ops.tasks.edit")) return deny("Só quem enviou ou quem edita tarefas pode retirar o anexo.");
    a.removed_at = new Date().toISOString();
    log(t, "tarefa.anexo_retirado", { arquivo: a.name }, null);
    return res(204);
  }

  // --- 36.3: clientes no fluxo, demandas e registro manual
  const boardRow = (cid) => {
    const o = db.opsClientOps[cid];
    const c = db.clients.find((x) => x.id === cid);
    const st = stageOf(o.stage_id);
    return { client_id: cid, name: c?.name ?? "", client_status: c?.status ?? "ativo", stage_id: o.stage_id, stage_since: o.stage_since, version: o.version,
      am_user_id: o.am_user_id, am_name: name(o.am_user_id), stage_pending: pending(cid, st.position, st.position + 1), can_move: canMoveClient(cid),
      summary: summary(cid) };
  };
  const clientConflict = () => res(409, { code: "40001", message: "Alguém alterou este cliente antes de você. Recarregue para ver a versão atual." });
  if (rpc("ops_client_board")) {
    if (!opsPerms.includes("ops.access")) return res(200, null);
    const f = p.f ?? {};
    const rows = Object.keys(db.opsClientOps).filter(clientVisible).map(boardRow)
      .filter((r) => (!f.mine || r.am_user_id === userId) && (!f.am_user_id || r.am_user_id === f.am_user_id)
        && (!f.q || r.name.toLowerCase().includes(String(f.q).toLowerCase())))
      .sort((a, b) => a.name.localeCompare(b.name));
    return res(200, {
      clients: rows,
      available: canManageClients() ? db.clients.filter((c) => c.status !== "encerrado" && !db.opsClientOps[c.id]).map((c) => ({ id: c.id, name: c.name })) : [],
      can: { manage: canManageClients(), release: can("ops.tasks.create"), note: can("ops.history.edit") },
    });
  }
  if (rpc("ops_client_get")) {
    const cid = p.p_client;
    const c = db.clients.find((x) => x.id === cid);
    if (!c || !clientVisible(cid)) return res(200, null);
    const o = db.opsClientOps[cid];
    const st = o && stageOf(o.stage_id);
    return res(200, {
      client: { id: c.id, name: c.name, status: c.status ?? "ativo" },
      ops: o ? { stage_id: o.stage_id, stage_since: o.stage_since, started_at: o.started_at, version: o.version, am_user_id: o.am_user_id,
        am_name: name(o.am_user_id), stage_pending: pending(cid, st.position, st.position + 1) } : null,
      summary: summary(cid),
      demands: db.opsDemands.filter((d) => d.client_id === cid).map((d) => {
        const ts = db.opsTasks.filter((t) => t.demand_id === d.id && !t.archived_at);
        return { id: d.id, number: d.number, title: d.title, created_at: d.created_at, total: ts.length, done: ts.filter(closed).length };
      }).reverse(),
      notes: db.opsClientNotes.filter((n) => n.client_id === cid && !n.removed_at).sort((a, b) => b.happened_at.localeCompare(a.happened_at)).map((n) => ({
        ...n, type_name: db.opsActivityTypes.find((x) => x.id === n.type_id)?.name ?? n.type_id, responsible: name(n.responsible_id), author: name(n.created_by) })),
      timeline: db.opsActivity.filter((a) => a.client_id === cid).slice().reverse().map((a) => {
        const t = a.task_id ? db.opsTasks.find((x) => x.id === a.task_id) : null;
        return { ...a, actor: name(a.actor_id), task_number: t?.number ?? null, task_visible: Boolean(t && visible(t)), task_title: t && visible(t) ? t.title : null,
          sector_id: t?.sector_id ?? null };
      }),
      can: { move: canMoveClient(cid), manage: canManageClients(), note: can("ops.history.edit"), release: can("ops.tasks.create"), admin: role === "admin" },
    });
  }
  if (rpc("ops_client_start")) {
    if (!canManageClients()) return deny("Você não tem permissão para colocar clientes no fluxo operacional.");
    if (!db.clients.some((c) => c.id === p.p_client)) return bad("Cliente não encontrado.");
    if (db.opsClientOps[p.p_client]) return bad("Este cliente já está no fluxo operacional.");
    const st = p.p_stage ? stageOf(p.p_stage) : db.opsClientStages.filter((x) => x.active).sort((a, b) => a.position - b.position)[0];
    if (!st?.active) return bad("Escolha uma etapa ativa.");
    if (p.p_am && !memberOk(p.p_am)) return bad("O Account Manager precisa estar ativo na Central.");
    const now = new Date().toISOString();
    db.opsClientOps[p.p_client] = { stage_id: st.id, am_user_id: p.p_am ?? null, started_at: now, stage_since: now, version: 1 };
    logClient(p.p_client, "cliente.fluxo_iniciado", null, { etapa: st.id, am: p.p_am ?? null });
    return res(204);
  }
  if (rpc("ops_client_set_am")) {
    if (!canManageClients()) return deny("Você não tem permissão para trocar o Account Manager.");
    const o = db.opsClientOps[p.p_client];
    if (!o) return bad("Este cliente ainda não está no fluxo operacional.");
    if (o.version !== p.p_version) return clientConflict();
    if (p.p_am && !memberOk(p.p_am)) return bad("O Account Manager precisa estar ativo na Central.");
    if ((p.p_am ?? null) === o.am_user_id) return res(200, o.version);
    logClient(p.p_client, "cliente.am", { am: o.am_user_id }, { am: p.p_am ?? null });
    Object.assign(o, { am_user_id: p.p_am ?? null, version: o.version + 1 });
    return res(200, o.version);
  }
  if (rpc("ops_client_stage_move")) {
    const o = db.opsClientOps[p.p_client];
    if (!o || !clientVisible(p.p_client)) return bad("Este cliente não está no fluxo operacional.");
    if (!canMoveClient(p.p_client)) return deny("Você não tem permissão para mudar a etapa deste cliente.");
    if (o.version !== p.p_version) return clientConflict();
    const to = stageOf(p.p_stage);
    if (!to?.active) return bad("Escolha uma etapa ativa.");
    if (to.id === o.stage_id) return res(200, o.version);
    const from = stageOf(o.stage_id);
    if (to.position > from.position) {
      const n = pending(p.p_client, from.position, to.position);
      if (n > 0) return bad(`Há ${n} tarefa(s) obrigatória(s) aberta(s) nesta etapa. Conclua antes de avançar o cliente.`);
    }
    logClient(p.p_client, "cliente.etapa", { etapa: from.id },
      { etapa: to.id, regra: to.position > from.position ? "Avanço manual: nenhuma tarefa obrigatória aberta" : "Retorno manual de etapa" });
    Object.assign(o, { stage_id: to.id, stage_since: new Date().toISOString(), version: o.version + 1 });
    return res(200, o.version);
  }
  if (rpc("ops_demand_release")) {
    const d = p.p ?? {};
    if (!can("ops.tasks.create")) return deny();
    if (!d.client_id || !db.clients.some((c) => c.id === d.client_id)) return bad("Escolha o cliente da demanda.");
    if ((d.title ?? "").trim().length < 3) return bad("Escreva o título da demanda.");
    const items = d.items ?? [];
    if (items.length < 1 || items.length > 12) return bad("Escolha de 1 a 12 setores.");
    if (items.some((i) => i.principal && i.principal !== userId) && !can("ops.tasks.assign")) return deny("Você não tem permissão para atribuir outras pessoas.");
    if (items.some((i, idx) => i.depends_on !== null && i.depends_on !== undefined && (i.depends_on < 0 || i.depends_on >= idx))) {
      return bad("Uma linha só pode depender de uma linha anterior.");
    }
    if (items.some((i) => !db.opsSectors.some((s) => s.id === i.sector_id && s.status === "ativo"))) return bad("Escolha um setor ativo.");
    const now = new Date().toISOString();
    const demand = { id: crypto.randomUUID(), number: ++db.opsDemandSeq, client_id: d.client_id, title: d.title.trim(), briefing: d.briefing || null, created_by: userId, created_at: now };
    db.opsDemands.push(demand);
    const ids = [];
    items.forEach((i) => {
      const sector = db.opsSectors.find((s) => s.id === i.sector_id);
      const t = { id: crypto.randomUUID(), number: ++db.opsTaskSeq, title: (i.title || "").trim() || `${demand.title} — ${sector.name}`,
        description: d.briefing || null, client_id: d.client_id, sector_id: i.sector_id, priority: i.priority || "media", start_date: null,
        due_date: i.due_date || null, effort_hours: null, visibility: "setor", tags: [], status_id: "nao_iniciado",
        people: i.principal ? [{ user_id: i.principal, role: "principal" }] : [], version: 1, created_by: userId, created_at: now, updated_at: now,
        completed_at: null, archived_at: null, demand_id: demand.id, client_stage_id: d.client_stage_id || null,
        mandatory: Boolean(d.client_stage_id && d.mandatory), queue_column_id: null };
      db.opsTasks.push(t);
      log(t, "tarefa.criada", null, { titulo: t.title });
      if (i.depends_on !== null && i.depends_on !== undefined) {
        db.opsDeps.push({ task_id: t.id, depends_on_id: ids[i.depends_on] });
        log(t, "tarefa.dependencia_incluida", null, { depende_de: db.opsTasks.find((x) => x.id === ids[i.depends_on]).number });
      }
      ids.push(t.id);
    });
    logClient(d.client_id, "demanda.liberada", null, { demanda: demand.number, titulo: demand.title, tarefas: ids.length });
    return res(200, { id: demand.id, number: demand.number, task_ids: ids });
  }
  if (rpc("ops_client_note_add")) {
    const n = p.p ?? {};
    if (!can("ops.history.edit")) return deny();
    if (!clientVisible(n.client_id)) return bad("Cliente não encontrado.");
    if (!db.opsActivityTypes.some((x) => x.id === n.type_id && x.active)) return bad("Escolha o tipo de atividade.");
    if (!n.happened_at) return bad("Informe a data e a hora.");
    if (n.responsible_id && !memberOk(n.responsible_id)) return bad("O responsável precisa estar ativo na Central.");
    if (n.attachment_path) {
      if (n.attachment_path.split("/")[0] !== `cliente-${n.client_id}`) return bad("Arquivo fora da pasta do cliente.");
      if (!db.opsFiles[n.attachment_path]) return bad("O arquivo não chegou ao armazenamento. Envie de novo.");
    }
    const id = crypto.randomUUID();
    db.opsClientNotes.push({ id, client_id: n.client_id, type_id: n.type_id, title: n.title.trim(), description: n.description || null, happened_at: n.happened_at,
      responsible_id: n.responsible_id || null, sector_id: n.sector_id || null, next_step: n.next_step || null, attachment_path: n.attachment_path || null,
      attachment_name: n.attachment_path ? n.attachment_name : null, created_by: userId, created_at: new Date().toISOString(), removed_at: null });
    return res(200, id);
  }
  if (rpc("ops_client_note_remove")) {
    const n = db.opsClientNotes.find((x) => x.id === p.p_id);
    if (!n || !clientVisible(n.client_id)) return bad("Atividade não encontrada.");
    if (n.created_by !== userId && role !== "admin") return deny("Só quem registrou (ou o admin) pode retirar a atividade.");
    n.removed_at = new Date().toISOString();
    logClient(n.client_id, "cliente.atividade_retirada", { titulo: n.title }, null);
    return res(204);
  }

  // --- 36.4: Kanban comercial (tudo exige "Comercial"; contato nunca vai para o histórico)
  const norm = (t) => String(t ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const digits = (t) => String(t ?? "").replace(/[^0-9]/g, "");
  // Mesmo formato do cadastro de clientes: só dígitos com DDI (BR sem DDI ganha "55").
  const normPhone = (t) => { const d = digits(t); if (!d) return null; if (String(t).trim().startsWith("+")) return d; return d.length === 10 || d.length === 11 ? `55${d}` : d; };
  const leadStage = (id) => db.opsLeadStages.find((x) => x.id === id);
  const leadLog = (l, action, before, after, extra = {}) =>
    db.opsLeadEvents.push({ id: db.opsLeadEvents.length + 1, lead_id: l.id, action, actor_id: userId, origin: "manual", before, after,
      created_at: new Date().toISOString(), kind: null, body: null, happened_at: null, ...extra });
  const leadConflict = () => res(409, { code: "40001", message: "Alguém alterou este lead antes de você. Recarregue para ver a versão atual." });
  const overdueLead = (l) => leadStage(l.stage_id).category === "aberto" && Boolean(l.next_action_date && l.next_action_date < today());
  const similar = (a, b) => a && b && (a === b || (a.length >= 3 && (a.includes(b) || b.includes(a))));
  if (url.includes("/rest/v1/rpc/ops_lead") || url.includes("/rest/v1/rpc/ops_loss_reason")) {
    const isConfig = rpc("ops_lead_stage_save") || rpc("ops_lead_stage_reorder") || rpc("ops_lead_stage_set_active") || rpc("ops_loss_reason_save");
    if (!isConfig) {
      if (rpc("ops_lead_board") || rpc("ops_lead_get") || rpc("ops_lead_duplicates")) { if (!can("ops.commercial")) return res(200, null); }
      else if (!can("ops.commercial")) return deny();
    }
  }
  if (rpc("ops_lead_duplicates")) {
    const q = p.p ?? {};
    const name = norm(q.company_name);
    const email = String(q.email ?? "").trim().toLowerCase();
    const phone = normPhone(q.phone) ?? "";
    const cnpj = String(q.cnpj ?? "").replace(/[^0-9A-Za-z]/g, "").toUpperCase();
    const why = (o) => (cnpj && o.cnpj === cnpj ? "mesmo CNPJ" : email && (o.email ?? "").toLowerCase() === email ? "mesmo e-mail"
      : phone && digits(o.phone) === phone ? "mesmo telefone" : norm(o.name ?? o.company_name) === name || (o.company && norm(o.company) === name) ? "mesmo nome" : "nome parecido");
    const hit = (o, nm) => (cnpj && o.cnpj === cnpj) || (email && (o.email ?? "").toLowerCase() === email) || (phone.length >= 10 && digits(o.phone) === phone)
      || (name.length >= 3 && nm.some((n) => similar(norm(n), name)));
    return res(200, {
      leads: db.opsLeads.filter((l) => l.id !== q.id && hit(l, [l.company_name])).slice(0, 10)
        .map((l) => ({ id: l.id, number: l.number, company_name: l.company_name, stage_name: leadStage(l.stage_id).name, archived: Boolean(l.archived_at), reason: why(l) })),
      clients: db.clients.filter((c) => !c.is_demo && hit(c, [c.name, c.company])).slice(0, 10)
        .map((c) => ({ id: c.id, name: c.name, status: c.status ?? "ativo", reason: why(c) })),
    });
  }
  if (rpc("ops_lead_save")) {
    const v = p.p ?? {};
    const phone = normPhone(v.phone);
    const email = String(v.email ?? "").trim().toLowerCase() || null;
    if (String(v.company_name ?? "").trim().length < 2) return bad("Informe o nome da empresa.");
    if (phone && !/^[0-9]{10,15}$/.test(phone)) return bad("Telefone: use DDD + número (10 a 15 dígitos).");
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return bad("E-mail inválido.");
    if (v.owner_id && !memberOk(v.owner_id)) return bad("O responsável comercial precisa estar ativo na Central.");
    if (v.next_action_date && !String(v.next_action ?? "").trim()) return bad("Escreva qual é a próxima ação.");
    const fields = { company_name: v.company_name.trim(), contact_name: v.contact_name?.trim() || null, phone, email,
      cnpj: String(v.cnpj ?? "").replace(/[^0-9A-Za-z]/g, "").toUpperCase() || null, segment: v.segment?.trim() || null, city: v.city?.trim() || null,
      state: v.state?.trim().toUpperCase() || null, origin: v.origin?.trim() || null, service_interest: v.service_interest?.trim() || null,
      owner_id: v.owner_id || null, notes: v.notes?.trim() || null, potential_value: v.potential_value === "" || v.potential_value == null ? null : Number(v.potential_value),
      currency: v.currency || "BRL", priority: v.priority || "media", entered_at: v.entered_at || today(), next_action: v.next_action?.trim() || null,
      next_action_date: v.next_action_date || null };
    const now = new Date().toISOString();
    if (!p.p_id) {
      const st = leadStage(v.stage_id) ?? db.opsLeadStages.filter((x) => x.active && x.category === "aberto").sort((a, b) => a.position - b.position)[0];
      if (!st?.active || st.category !== "aberto") return bad("Um lead novo entra numa etapa em aberto.");
      const l = { id: crypto.randomUUID(), number: ++db.opsLeadSeq, ...fields, stage_id: st.id, stage_since: now, last_interaction_at: null, loss_reason_id: null,
        loss_note: null, lost_at: null, client_id: null, converted_at: null, converted_by: null, archived_at: null, version: 1, created_by: userId, created_at: now };
      db.opsLeads.push(l);
      leadLog(l, "lead.criado", null, { empresa: l.company_name, etapa: st.id, responsavel: l.owner_id });
      return res(200, l.id);
    }
    const l = db.opsLeads.find((x) => x.id === p.p_id);
    if (!l) return bad("Lead não encontrado.");
    if (l.archived_at) return bad("Lead arquivado: desarquive para editar.");
    if (l.version !== p.p_version) return leadConflict();
    const map = { company_name: "empresa", segment: "segmento", city: "cidade", state: "uf", origin: "origem", service_interest: "servico", notes: "observacoes",
      potential_value: "valor", currency: "moeda", priority: "prioridade", entered_at: "entrada", next_action: "proxima_acao", next_action_date: "data_proxima_acao",
      contact_name: "contato", phone: "telefone", email: "email", cnpj: "cnpj" };
    const privateKeys = ["contact_name", "phone", "email", "cnpj"];
    const changed = Object.keys(map).filter((k) => fields[k] !== l[k]);
    if (changed.length) {
      leadLog(l, "lead.editado", Object.fromEntries(changed.map((k) => [map[k], privateKeys.includes(k) ? null : l[k]])),
        Object.fromEntries(changed.map((k) => [map[k], privateKeys.includes(k) ? "alterado" : fields[k]])));
    }
    if (fields.owner_id !== l.owner_id) leadLog(l, "lead.responsavel", { responsavel: l.owner_id }, { responsavel: fields.owner_id });
    Object.assign(l, fields, { version: l.version + 1 });
    return res(200, l.id);
  }
  if (rpc("ops_lead_move")) {
    const l = db.opsLeads.find((x) => x.id === p.p_id);
    if (!l) return bad("Lead não encontrado.");
    if (l.archived_at) return bad("Lead arquivado: desarquive para mover.");
    if (l.version !== p.p_version) return leadConflict();
    const from = leadStage(l.stage_id);
    const to = leadStage(p.p_stage);
    if (!to?.active) return bad("Escolha uma etapa ativa.");
    if (to.id === from.id) return res(200, l.version);
    if (l.client_id && to.category !== "ganho") return bad("Este lead já virou cliente: ele fica na etapa de contrato pago.");
    if (to.category === "perdido" && !db.opsLossReasons.some((r) => r.id === p.p_loss_reason && r.active)) return bad("Escolha o motivo da perda.");
    if (to.require_previous && to.position > from.position) {
      const prev = db.opsLeadStages.filter((x) => x.active && x.position < to.position).sort((a, b) => b.position - a.position)[0];
      if (prev?.id !== from.id) return bad(`"${to.name}" só recebe leads vindos da etapa anterior. Siga as etapas em ordem.`);
    }
    if (to.require_next_action && to.category === "aberto" && (!l.next_action || !l.next_action_date)) {
      return bad(`Para entrar em "${to.name}", preencha a próxima ação e a data dela.`);
    }
    const lost = to.category === "perdido";
    Object.assign(l, { stage_id: to.id, stage_since: new Date().toISOString(), version: l.version + 1, loss_reason_id: lost ? p.p_loss_reason : null,
      loss_note: lost ? p.p_loss_note || null : null, lost_at: lost ? new Date().toISOString() : null });
    leadLog(l, "lead.etapa", { etapa: from.id }, { etapa: to.id, ...(lost ? { motivo: p.p_loss_reason, observacao: p.p_loss_note || null } : {}) });
    return res(200, l.version);
  }
  if (rpc("ops_lead_note_add")) {
    const l = db.opsLeads.find((x) => x.id === p.p_lead);
    if (!l) return bad("Lead não encontrado.");
    if (String(p.p_body ?? "").trim().length < 2) return bad("Escreva o que aconteceu.");
    const when = p.p_happened_at ?? new Date().toISOString();
    leadLog(l, "lead.interacao", null, null, { kind: p.p_kind, body: p.p_body.trim(), happened_at: when });
    if (!l.last_interaction_at || when > l.last_interaction_at) l.last_interaction_at = when;
    return res(200, db.opsLeadEvents.length);
  }
  if (rpc("ops_lead_archive")) {
    const l = db.opsLeads.find((x) => x.id === p.p_id);
    if (!l) return bad("Lead não encontrado.");
    if (Boolean(l.archived_at) === Boolean(p.p_archived)) return res(204);
    l.archived_at = p.p_archived ? new Date().toISOString() : null;
    l.version++;
    leadLog(l, p.p_archived ? "lead.arquivado" : "lead.desarquivado", null, null);
    return res(204);
  }
  if (rpc("ops_lead_convert")) {
    const l = db.opsLeads.find((x) => x.id === p.p_lead);
    if (!l) return bad("Lead não encontrado.");
    if (l.version !== p.p_version) return leadConflict();
    if (leadStage(l.stage_id).category !== "ganho") return bad("Só dá para converter quando o lead chega em Contrato Pago.");
    if (l.client_id) return bad("Este lead já foi convertido em cliente.");
    if (p.p_start && !canManageClients()) return deny('Iniciar o onboarding exige as permissões "Ver a ficha operacional dos clientes" e "Atribuir responsáveis".');
    let clientId = p.p_client ?? null;
    let created = false;
    if (clientId) {
      if (!db.clients.some((c) => c.id === clientId && !c.is_demo)) return bad("Cliente não encontrado.");
    } else {
      if (!["admin", "gestor"].includes(role)) return deny("Criar um cliente novo é só para administrador ou gestor. Peça a um deles, ou vincule a um cliente já cadastrado.");
      const dup = db.clients.find((c) => (l.cnpj && c.cnpj === l.cnpj) || norm(c.name) === norm(l.company_name) || (c.company && norm(c.company) === norm(l.company_name)));
      if (dup) return bad(`Já existe o cliente "${dup.name}" com este nome ou CNPJ. Vincule o lead a ele em vez de criar outro.`);
      clientId = crypto.randomUUID();
      db.clients.push({ id: clientId, name: l.company_name.slice(0, 120), company: l.company_name, cnpj: l.cnpj, owner_name: l.contact_name, phone: l.phone,
        email: l.email, notes: `Convertido do lead comercial #${l.number}.`, status: "ativo", timezone: "America/Sao_Paulo", is_demo: false,
        created_at: new Date().toISOString(), updated_at: "", created_by: userId });
      if (role === "gestor") db.access.push({ user_id: userId, client_id: clientId, created_at: new Date().toISOString() });
      created = true;
    }
    Object.assign(l, { client_id: clientId, converted_at: new Date().toISOString(), converted_by: userId, version: l.version + 1 });
    let onboarding = "nao";
    if (p.p_start) {
      if (db.opsClientOps[clientId]) onboarding = "ja_estava";
      else {
        const st = db.opsClientStages.filter((x) => x.active).sort((a, b) => a.position - b.position)[0];
        const now = new Date().toISOString();
        db.opsClientOps[clientId] = { stage_id: st.id, am_user_id: p.p_am ?? null, started_at: now, stage_since: now, version: 1 };
        logClient(clientId, "cliente.fluxo_iniciado", null, { etapa: st.id, am: p.p_am ?? null });
        onboarding = "iniciado";
      }
    }
    leadLog(l, "lead.convertido", null, { cliente: clientId, novo: created, onboarding });
    logClient(clientId, "cliente.convertido", null, { lead: l.number, empresa: l.company_name, novo: created });
    return res(200, { client_id: clientId, created, onboarding });
  }
  if (rpc("ops_lead_board")) {
    const f = p.f ?? {};
    const q = norm(f.q);
    const leads = db.opsLeads.filter((l) => (f.archived ? l.archived_at : !l.archived_at)
      && (!q || norm(l.company_name).includes(q) || norm(l.contact_name).includes(q) || norm(l.segment).includes(q) || String(l.number) === String(f.q).replace("#", ""))
      && (!f.owner_id || (f.owner_id === "nenhum" ? !l.owner_id : l.owner_id === f.owner_id))
      && (!f.origin || l.origin === f.origin) && (!f.priority || l.priority === f.priority) && (!f.overdue || overdueLead(l)))
      .map((l) => ({ ...l, owner_name: name(l.owner_id), loss_reason: db.opsLossReasons.find((r) => r.id === l.loss_reason_id)?.name ?? null, overdue: overdueLead(l) }));
    return res(200, { leads, origins: [...new Set(db.opsLeads.map((l) => l.origin).filter(Boolean))],
      can: { create_client: ["admin", "gestor"].includes(role), onboarding: canManageClients() } });
  }
  if (rpc("ops_lead_get")) {
    const l = db.opsLeads.find((x) => x.id === p.p_id);
    if (!l) return res(200, null);
    const st = leadStage(l.stage_id);
    return res(200, {
      lead: { ...l, owner_name: name(l.owner_id), stage_name: st.name, stage_color: st.color, category: st.category,
        loss_reason: db.opsLossReasons.find((r) => r.id === l.loss_reason_id)?.name ?? null, client_name: db.clients.find((c) => c.id === l.client_id)?.name ?? null,
        converted_by_name: name(l.converted_by), created_by_name: name(l.created_by), overdue: overdueLead(l) },
      events: db.opsLeadEvents.filter((e) => e.lead_id === l.id).slice().reverse().map((e) => ({ ...e, actor: name(e.actor_id) })),
      can: { create_client: ["admin", "gestor"].includes(role), onboarding: canManageClients(), client_ops: Boolean(l.client_id && clientVisible(l.client_id)) },
    });
  }

  // --- 36.5: Dailies e reuniões (mesmas regras de ops_meeting_* no banco)
  const meetingVisible = (m) => opsPerms.includes("ops.access") && (can("ops.meetings.manage") || m.organizer_id === userId
    || m.people.some((x) => x.user_id === userId)
    || (m.sector_id && (db.opsMembers[userId]?.primary === m.sector_id || (db.opsMembers[userId]?.secondary ?? []).includes(m.sector_id)))
    || (m.client_id && clientVisible(m.client_id)));
  const meetingCanEdit = (m) => opsPerms.includes("ops.access") && (can("ops.meetings.manage") || m.organizer_id === userId);
  const meetingCanAdd = (m) => meetingCanEdit(m) || (opsPerms.includes("ops.access") && m.people.some((x) => x.user_id === userId));
  const findMeeting = (id) => { const m = db.opsMeetings.find((x) => x.id === id); return m && meetingVisible(m) ? m : null; };
  const meetingConflict = () => res(409, { code: "40001", message: "Alguém alterou esta reunião antes de você. Recarregue para ver a versão atual." });
  const logMeeting = (m, action, before, after) =>
    db.opsActivity.push({ id: db.opsActivity.length + 1, task_id: null, meeting_id: m.id, client_id: m.client_id ?? null, action, actor_id: userId, origin: "manual",
      before, after: { ...(after ?? {}), reuniao: m.number, titulo_reuniao: m.title }, created_at: new Date().toISOString() });
  const catOf = (id) => db.opsMeetingCategories.find((c) => c.id === id);
  const spTime = (iso) => new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }).format(new Date(iso));
  const notifyInvite = (m, u) => { if (m.status === "agendada") notify(u, "reuniao.convite", `Você foi chamado para a reunião #${m.number}: ${m.title}`, `${spTime(m.starts_at)} (horário de Brasília)`, `/operacoes/reunioes?reuniao=${m.id}`, `reuniao:${m.id}`); };
  const sectorName = (id) => db.opsSectors.find((s) => s.id === id)?.name ?? null;
  const spDay = (iso) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(iso));
  const meetingRow = (m) => {
    const c = catOf(m.category_id);
    const items = db.opsMeetingItems.filter((i) => i.meeting_id === m.id);
    return { id: m.id, number: m.number, title: m.title, category_id: m.category_id, category_name: c?.name, color: c?.color, status: m.status,
      starts_at: m.starts_at, duration_min: m.duration_min, sector_id: m.sector_id, sector_name: sectorName(m.sector_id), client_id: m.client_id,
      client_name: db.clients.find((x) => x.id === m.client_id)?.name ?? null, location: m.location, organizer_id: m.organizer_id, organizer_name: name(m.organizer_id),
      people_count: m.people.length, attended_count: m.people.filter((x) => x.attended).length,
      open_items: items.filter((i) => !i.removed_at && ["pendencia", "bloqueio"].includes(i.kind) && !i.task_id).length,
      tasks_count: items.filter((i) => i.task_id).length,
      i_participate: m.organizer_id === userId || m.people.some((x) => x.user_id === userId) };
  };
  if (rpc("ops_meeting_list")) {
    if (!opsPerms.includes("ops.access")) return res(200, null);
    const f = p.f ?? {};
    const q = (f.q ?? "").toLowerCase();
    const out = db.opsMeetings.filter(meetingVisible).filter((m) => (!f.from || spDay(m.starts_at) >= f.from) && (!f.to || spDay(m.starts_at) <= f.to)
      && (!f.category_id || m.category_id === f.category_id) && (!f.sector_id || m.sector_id === f.sector_id) && (!f.client_id || m.client_id === f.client_id)
      && (!f.status || m.status === f.status)
      && (!f.person_id || m.organizer_id === f.person_id || m.people.some((x) => x.user_id === f.person_id))
      && (!f.mine || m.organizer_id === userId || m.people.some((x) => x.user_id === userId))
      && (!q || m.title.toLowerCase().includes(q) || (m.agenda ?? "").toLowerCase().includes(q) || (m.notes ?? "").toLowerCase().includes(q) || String(m.number) === q.replace("#", "")))
      .sort((a, b) => (f.order === "asc" ? 1 : -1) * a.starts_at.localeCompare(b.starts_at)).slice(0, 300).map(meetingRow);
    return res(200, { meetings: out, can: { create: can("ops.meetings.manage") } });
  }
  if (rpc("ops_meeting_get")) {
    const m = findMeeting(p.p_id);
    if (!m) return res(200, null);
    return res(200, {
      meeting: { ...meetingRow(m), agenda: m.agenda, notes: m.notes, cancel_reason: m.cancel_reason, held_at: m.held_at, created_at: m.created_at, version: m.version },
      people: m.people.map((x) => ({ user_id: x.user_id, name: name(x.user_id), attended: x.attended })).sort((a, b) => a.name.localeCompare(b.name)),
      items: db.opsMeetingItems.filter((i) => i.meeting_id === m.id && !i.removed_at).map((i) => {
        const t = i.task_id ? db.opsTasks.find((x) => x.id === i.task_id) : null;
        const tv = Boolean(t && visible(t));
        return { ...i, owner_name: name(i.owner_id), sector_name: sectorName(i.sector_id), author: name(i.created_by), task_number: t?.number ?? null,
          task_visible: tv, task_title: tv ? t.title : null, task_status: tv ? statusOf(t.status_id).name : null, task_done: t ? closed(t) : null };
      }),
      events: db.opsActivity.filter((a) => a.meeting_id === m.id).slice().reverse().map((a) => ({ ...a, actor: name(a.actor_id) })),
      can: { edit: meetingCanEdit(m), add: meetingCanAdd(m), task: can("ops.tasks.create"), assign: can("ops.tasks.assign") },
    });
  }
  if (rpc("ops_meeting_save")) {
    const input = p.p ?? {};
    let m = null;
    if (!p.p_id) {
      if (!can("ops.meetings.manage")) return deny();
    } else {
      m = findMeeting(p.p_id);
      if (!m) return bad("Reunião não encontrada.");
      if (!meetingCanEdit(m)) return deny('Só quem organiza (ou tem "Criar reuniões e Dailies") altera a reunião.');
      if (m.status === "cancelada") return bad("Reunião cancelada não pode ser alterada.");
      if (m.version !== p.p_version) return meetingConflict();
    }
    if ((input.title ?? "").trim().length < 3) return bad("Dê um título à reunião (mínimo 3 letras).");
    const cat = catOf(input.category_id);
    if (!cat || (!cat.active && cat.id !== m?.category_id)) return bad("Escolha o tipo da reunião.");
    if (!input.starts_at) return bad("Informe a data e a hora.");
    if (input.sector_id && !db.opsSectors.some((s) => s.id === input.sector_id && (s.status === "ativo" || s.id === m?.sector_id))) return bad("Escolha um setor ativo.");
    const ids = [...new Set((input.people ?? []).filter(Boolean))];
    if (ids.some((id) => !memberOk(id))) return bad("Todos os participantes precisam estar ativos na Central.");
    const fields = { title: input.title.trim(), category_id: input.category_id, starts_at: new Date(input.starts_at).toISOString(),
      duration_min: Number(input.duration_min) || 30, sector_id: input.sector_id || null, client_id: input.client_id || null,
      location: input.location?.trim() || null, agenda: input.agenda?.trim() || null };
    const now = new Date().toISOString();
    if (!m) {
      m = { id: crypto.randomUUID(), number: ++db.opsMeetingSeq, ...fields, status: "agendada", notes: null, cancel_reason: null, held_at: null,
        organizer_id: userId, created_at: now, version: 1, people: ids.map((user_id) => ({ user_id, attended: null })) };
      db.opsMeetings.push(m);
      logMeeting(m, "reuniao.criada", null, { titulo: m.title });
      for (const x of m.people) notifyInvite(m, x.user_id);
    } else {
      const names = { title: "titulo", category_id: "tipo", starts_at: "inicio", duration_min: "duracao", sector_id: "setor", client_id: "cliente",
        location: "local", agenda: "pauta" };
      const changed = Object.keys(fields).filter((k) => fields[k] !== m[k]);
      const peopleChanged = JSON.stringify(ids.slice().sort()) !== JSON.stringify(m.people.map((x) => x.user_id).sort());
      const before = m.people.map((x) => x.user_id);
      Object.assign(m, fields, { version: m.version + 1, people: ids.map((user_id) => m.people.find((x) => x.user_id === user_id) ?? { user_id, attended: null }) });
      for (const u of ids.filter((u) => !before.includes(u))) notifyInvite(m, u);
      if (changed.length || peopleChanged) {
        logMeeting(m, "reuniao.editada", {}, { ...Object.fromEntries(changed.map((k) => [names[k], fields[k]])), ...(peopleChanged ? { participantes: ids.map(name) } : {}) });
      }
    }
    return res(200, m.id);
  }
  if (rpc("ops_meeting_record")) {
    const m = findMeeting(p.p_id);
    if (!m) return bad("Reunião não encontrada.");
    if (!meetingCanEdit(m)) return deny('Só quem organiza (ou tem "Criar reuniões e Dailies") registra a reunião.');
    if (m.status === "cancelada") return bad("Reunião cancelada não pode ser registrada.");
    if (m.version !== p.p_version) return meetingConflict();
    const att = p.p_attended ?? [];
    if (att.some((id) => !m.people.some((x) => x.user_id === id))) return bad("Presença só de quem está na lista de participantes.");
    const was = m.status;
    Object.assign(m, { status: "realizada", held_at: m.held_at ?? new Date().toISOString(), notes: p.p_notes?.trim() || null, version: m.version + 1 });
    for (const x of m.people) x.attended = att.includes(x.user_id);
    logMeeting(m, was === "realizada" ? "reuniao.ata_editada" : "reuniao.realizada", null,
      { ata: m.notes, presentes: m.people.filter((x) => x.attended).map((x) => name(x.user_id)).sort() });
    return res(204);
  }
  if (rpc("ops_meeting_cancel")) {
    const m = findMeeting(p.p_id);
    if (!m) return bad("Reunião não encontrada.");
    if (!meetingCanEdit(m)) return deny('Só quem organiza (ou tem "Criar reuniões e Dailies") cancela a reunião.');
    if (m.status !== "agendada") return bad("Só reunião agendada pode ser cancelada.");
    if (m.version !== p.p_version) return meetingConflict();
    if ((p.p_reason ?? "").trim().length < 3) return bad("Informe o motivo do cancelamento.");
    Object.assign(m, { status: "cancelada", cancel_reason: p.p_reason.trim(), version: m.version + 1 });
    logMeeting(m, "reuniao.cancelada", null, { motivo: m.cancel_reason });
    return res(204);
  }
  if (rpc("ops_meeting_item_add")) {
    const m = findMeeting(p.p_meeting);
    const input = p.p ?? {};
    if (!m) return bad("Reunião não encontrada.");
    if (!meetingCanAdd(m)) return deny("Só participantes e quem organiza registram itens na reunião.");
    if (m.status === "cancelada") return bad("Reunião cancelada não recebe itens.");
    if (!["objetivo", "pendencia", "decisao", "bloqueio"].includes(input.kind)) return bad("Escolha o tipo do item.");
    if ((input.body ?? "").trim().length < 2) return bad("Escreva o item.");
    if (input.owner_id && !memberOk(input.owner_id)) return bad("O responsável precisa estar ativo na Central.");
    const item = { id: crypto.randomUUID(), meeting_id: m.id, kind: input.kind, body: input.body.trim(), owner_id: input.owner_id || null,
      sector_id: input.sector_id || null, due_date: ["pendencia", "bloqueio"].includes(input.kind) ? input.due_date || null : null, task_id: null,
      created_by: userId, created_at: new Date().toISOString(), removed_at: null };
    db.opsMeetingItems.push(item);
    logMeeting(m, "reuniao.item", null, { tipo: item.kind, texto: item.body });
    if (item.owner_id) notify(item.owner_id, "reuniao.item", `${{ pendencia: "Pendência", bloqueio: "Bloqueio", decisao: "Decisão", objetivo: "Objetivo" }[item.kind]} para você na reunião #${m.number}: ${m.title}`, item.body.slice(0, 200), `/operacoes/reunioes?reuniao=${m.id}`, `item:${item.id}`);
    return res(200, item.id);
  }
  if (rpc("ops_meeting_item_remove")) {
    const i = db.opsMeetingItems.find((x) => x.id === p.p_id);
    const m = i && findMeeting(i.meeting_id);
    if (!m) return bad("Item não encontrado.");
    if (i.created_by !== userId && !meetingCanEdit(m)) return deny("Só quem registrou (ou quem organiza) retira o item.");
    if (i.task_id) return bad("Este item já virou tarefa. Arquive a tarefa se ela não for mais necessária.");
    if (!i.removed_at) { i.removed_at = new Date().toISOString(); logMeeting(m, "reuniao.item_retirado", { tipo: i.kind, texto: i.body }, null); }
    return res(204);
  }
  if (rpc("ops_meeting_item_to_task")) {
    const i = db.opsMeetingItems.find((x) => x.id === p.p_item);
    const m = i && !i.removed_at && findMeeting(i.meeting_id);
    if (!m) return bad("Item não encontrado.");
    if (i.task_id) return res(200, i.task_id);
    if (!["pendencia", "bloqueio"].includes(i.kind)) return bad("Só pendências e bloqueios viram tarefa.");
    if (m.status === "cancelada") return bad("Reunião cancelada: não gera tarefas.");
    const sector = i.sector_id ?? m.sector_id;
    if (!sector) return bad("Informe o setor da pendência (ou da reunião) para criar a tarefa.");
    if (!can("ops.tasks.create")) return deny();
    if (i.owner_id && i.owner_id !== userId && !can("ops.tasks.assign")) return deny("Você não tem permissão para atribuir outras pessoas.");
    const now = new Date().toISOString();
    const t = { id: crypto.randomUUID(), number: ++db.opsTaskSeq, title: (i.kind === "bloqueio" ? `Resolver bloqueio: ${i.body}` : i.body).slice(0, 200),
      description: `Criada a partir da reunião #${m.number} "${m.title}" de ${spDay(m.starts_at).split("-").reverse().join("/")}.`,
      client_id: m.client_id, sector_id: sector, priority: i.kind === "bloqueio" ? "alta" : "media", start_date: null, due_date: i.due_date, effort_hours: null,
      visibility: "setor", tags: [], client_stage_id: null, mandatory: false, status_id: "nao_iniciado",
      people: i.owner_id ? [{ user_id: i.owner_id, role: "principal" }] : [], version: 1, created_by: userId, created_at: now, updated_at: now,
      completed_at: null, archived_at: null, demand_id: null, queue_column_id: null };
    db.opsTasks.push(t);
    log(t, "tarefa.criada", null, { titulo: t.title });
    log(t, "tarefa.da_reuniao", null, { reuniao: m.number, titulo_reuniao: m.title });
    notifyPeople(t);
    i.task_id = t.id;
    logMeeting(m, "reuniao.tarefa_criada", null, { tarefa: t.number, texto: i.body });
    return res(200, t.id);
  }
  if (rpc("ops_meeting_category_save")) {
    if (role !== "admin") return deny("Só o administrador pode mudar a configuração da Central de Operações.");
    if ((p.p_name ?? "").trim().length < 2) return bad("Dê um nome ao tipo.");
    if (db.opsMeetingCategories.some((x) => x.id !== p.p_id && x.name.toLowerCase() === p.p_name.trim().toLowerCase())) return bad("Já existe um tipo com esse nome.");
    if (p.p_id) { Object.assign(db.opsMeetingCategories.find((x) => x.id === p.p_id), { name: p.p_name.trim(), color: p.p_color, active: p.p_active ?? true }); return res(200, p.p_id); }
    const id = crypto.randomUUID();
    db.opsMeetingCategories.push({ id, name: p.p_name.trim(), color: p.p_color, position: db.opsMeetingCategories.length + 1, active: true });
    return res(200, id);
  }

  // --- 36.7: painel, visões salvas, busca e resumo pessoal (mesmas regras de ops_dashboard/ops_search/ops_saved_view*/ops_my_summary)
  const PAGES = ["tarefas", "comercial", "reunioes", "painel"];
  if (rpc("ops_saved_view_save")) {
    if (!opsPerms.includes("ops.access")) return deny();
    const nm = (p.p_name ?? "").trim();
    if (!PAGES.includes(p.p_page)) return bad("Tela inválida.");
    if (nm.length < 1 || nm.length > 60) return bad("Dê um nome à visão (até 60 letras).");
    const filters = p.p_filters ?? {};
    if (typeof filters !== "object" || Array.isArray(filters)) return bad("Filtros inválidos.");
    const mineViews = db.opsSavedViews.filter((v) => v.user_id === userId && v.page === p.p_page);
    const same = mineViews.find((v) => v.name === nm);
    if (same) { Object.assign(same, { filters, updated_at: new Date().toISOString() }); return res(200, same.id); }
    if (mineViews.length >= 30) return bad("No máximo 30 visões por tela.");
    const id = crypto.randomUUID();
    db.opsSavedViews.push({ id, user_id: userId, page: p.p_page, name: nm, filters, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
    return res(200, id);
  }
  if (rpc("ops_saved_view_delete")) {
    if (!opsPerms.includes("ops.access")) return deny();
    const i = db.opsSavedViews.findIndex((v) => v.id === p.p_id && v.user_id === userId);
    if (i < 0) return bad("Visão não encontrada.");
    db.opsSavedViews.splice(i, 1);
    return res(204);
  }
  const spDate = (iso) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(iso));
  const lastMove = (t) => [t.updated_at, ...db.opsActivity.filter((a) => a.task_id === t.id).map((a) => a.created_at)].filter(Boolean).sort().at(-1);
  const dayDiff = (a, b) => Math.round((new Date(`${a}T12:00:00Z`) - new Date(`${b}T12:00:00Z`)) / 86400000);
  if (rpc("ops_my_summary")) {
    if (!opsPerms.includes("ops.access")) return res(200, null);
    const t0 = today();
    const mineT = db.opsTasks.filter((t) => !t.archived_at && !closed(t) && t.people.some((x) => x.user_id === userId && ["principal", "adicional"].includes(x.role)));
    return res(200, {
      unread: db.opsNotifications.filter((n) => n.user_id === userId && !n.read_at).length,
      abertas: mineT.length,
      atrasadas: mineT.filter((t) => t.due_date && t.due_date < t0).length,
      hoje: mineT.filter((t) => t.due_date === t0).length,
      reunioes_hoje: db.opsMeetings.filter((m) => m.status === "agendada" && spDate(m.starts_at) === t0
        && (m.organizer_id === userId || m.people.some((x) => x.user_id === userId))).length,
    });
  }
  if (rpc("ops_dashboard")) {
    if (!can("ops.dashboard.view")) return res(200, null);
    const f = p.f ?? {};
    const t0 = today();
    const from = f.from || addDays(t0, -29);
    const to = f.to || t0;
    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
    const d = db.opsTasks.filter((t) => !t.archived_at && visible(t)
      && (!f.sector_id || t.sector_id === f.sector_id) && (!f.client_id || t.client_id === f.client_id)
      && (!f.person_id || t.people.some((x) => x.user_id === f.person_id)))
      .map((t) => ({ ...t, category: statusOf(t.status_id).category, blockers: blockers(t), last_move: lastMove(t),
        principal: t.people.find((x) => x.role === "principal")?.user_id ?? null }));
    const open = d.filter((t) => !["concluido", "cancelado"].includes(t.category));
    const doneIn = d.filter((t) => t.category === "concluido" && t.completed_at && spDate(t.completed_at) >= from && spDate(t.completed_at) <= to);
    const isBlocked = (t) => t.category === "bloqueado" || t.blockers > 0;
    const late = (t) => t.due_date && t.due_date < t0;
    const stalled = open.filter((t) => t.last_move < weekAgo).sort((a, b) => a.last_move.localeCompare(b.last_move));
    const avg = doneIn.length ? Math.round((doneIn.reduce((s, t) => s + (new Date(t.completed_at) - new Date(t.created_at)) / 86400000, 0) / doneIn.length) * 10) / 10 : null;
    const bySector = [...new Set(d.map((t) => t.sector_id))].map((sid) => {
      const se = db.opsSectors.find((x) => x.id === sid);
      const inS = d.filter((t) => t.sector_id === sid);
      const o = inS.filter((t) => !["concluido", "cancelado"].includes(t.category));
      return se && { sector_id: sid, name: se.name, color: se.color, abertas: o.length, atrasadas: o.filter(late).length, bloqueadas: o.filter(isBlocked).length,
        concluidas: doneIn.filter((t) => t.sector_id === sid).length };
    }).filter(Boolean).sort((a, b) => a.name.localeCompare(b.name));
    const byStatus = db.opsStatuses.slice().sort((a, b) => a.position - b.position).map((st) => ({ status_id: st.id, name: st.name, color: st.color,
      n: open.filter((t) => t.status_id === st.id).length })).filter((x) => x.n > 0);
    const byPerson = [...new Set(open.map((t) => t.principal).filter(Boolean))].map((uid) => ({ user_id: uid, name: name(uid),
      abertas: open.filter((t) => t.principal === uid).length, atrasadas: open.filter((t) => t.principal === uid && late(t)).length }))
      .filter((x) => x.name).sort((a, b) => b.atrasadas - a.atrasadas || b.abertas - a.abertas || a.name.localeCompare(b.name)).slice(0, 15);
    const lastStage = Math.max(...db.opsClientStages.filter((x) => x.active).map((x) => x.position));
    const seesClients = can("ops.clients.view") || can("ops.am") || Object.values(db.opsClientOps).some((o) => o.am_user_id === userId);
    const leadsOk = can("ops.commercial");
    return res(200, {
      today: t0, from, to,
      cards: { abertas: open.length, andamento: open.filter((t) => t.category === "andamento").length, atrasadas: open.filter(late).length,
        vencem_hoje: open.filter((t) => t.due_date === t0).length, vencem_7d: open.filter((t) => t.due_date && t.due_date > t0 && t.due_date <= addDays(t0, 7)).length,
        bloqueadas: open.filter(isBlocked).length, aguardando_cliente: d.filter((t) => t.category === "aguardando_cliente").length,
        sem_responsavel: open.filter((t) => !t.principal).length, paradas: stalled.length, concluidas: doneIn.length, media_dias: avg },
      by_sector: bySector, by_status: byStatus, by_person: byPerson,
      stalled: stalled.slice(0, 10).map((t) => ({ id: t.id, number: t.number, title: t.title, dias: dayDiff(t0, spDate(t.last_move)) })),
      blocked: open.filter(isBlocked).sort((a, b) => (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999")).slice(0, 10)
        .map((t) => ({ id: t.id, number: t.number, title: t.title, dependencias: t.blockers })),
      clients_waiting: seesClients ? Object.entries(db.opsClientOps).map(([cid, o]) => ({ ...o, client_id: cid })).filter((o) => clientVisible(o.client_id) && o.stage_since
          && o.stage_since < new Date(Date.now() - 14 * 86400000).toISOString() && (stageOf(o.stage_id)?.position ?? lastStage) < lastStage
          && (!f.client_id || o.client_id === f.client_id))
        .sort((a, b) => a.stage_since.localeCompare(b.stage_since)).slice(0, 10)
        .map((o) => ({ client_id: o.client_id, name: db.clients.find((c) => c.id === o.client_id)?.name ?? "", stage: stageOf(o.stage_id)?.name ?? "",
          dias: dayDiff(t0, spDate(o.stage_since)) })) : null,
      meeting_pending: db.opsMeetingItems.filter((i) => !i.removed_at && !i.task_id && ["pendencia", "bloqueio"].includes(i.kind)
        && (() => { const m = db.opsMeetings.find((x) => x.id === i.meeting_id); return m && m.status !== "cancelada" && meetingVisible(m); })()).length,
      meetings_today: db.opsMeetings.filter((m) => m.status === "agendada" && spDate(m.starts_at) === t0 && meetingVisible(m)).length,
      leads_overdue: leadsOk ? db.opsLeads.filter((l) => !l.archived_at && overdueLead(l)).length : null,
    });
  }
  if (rpc("ops_search")) {
    const norm = (x) => (x ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
    const raw = (p.p_q ?? "").trim();
    const n = norm(raw);
    const num = raw.replace(/^#+/, "");
    if (!opsPerms.includes("ops.access") || n.length < 2) return res(200, []);
    const out = [
      ...db.opsTasks.filter((t) => !t.archived_at && (norm(t.title).includes(n) || String(t.number) === num) && visible(t)).sort((a, b) => b.number - a.number).slice(0, 8)
        .map((t) => { const c = db.clients.find((x) => x.id === t.client_id); return { kind: "tarefa", id: t.id, title: `#${t.number} ${t.title}`,
          detail: statusOf(t.status_id).name + (c ? ` · ${c.name}` : ""), link: `/operacoes/tarefas?tarefa=${t.id}` }; }),
      ...db.opsMeetings.filter((m) => (norm(m.title).includes(n) || String(m.number) === num) && meetingVisible(m)).sort((a, b) => b.starts_at.localeCompare(a.starts_at)).slice(0, 5)
        .map((m) => ({ kind: "reuniao", id: m.id, title: `#${m.number} ${m.title}`, detail: spTime(m.starts_at), link: `/operacoes/reunioes?reuniao=${m.id}` })),
      ...Object.entries(db.opsClientOps).map(([cid, o]) => ({ o: { ...o, client_id: cid }, c: db.clients.find((x) => x.id === cid) }))
        .filter(({ o, c }) => c && norm(c.name).includes(n) && clientVisible(o.client_id)).sort((a, b) => a.c.name.localeCompare(b.c.name)).slice(0, 5)
        .map(({ o, c }) => ({ kind: "cliente", id: c.id, title: c.name, detail: stageOf(o.stage_id)?.name ?? null, link: `/operacoes/clientes?cliente=${c.id}` })),
      ...(can("ops.commercial") ? db.opsLeads.filter((l) => !l.archived_at && (norm(l.company_name).includes(n) || String(l.number) === num))
        .sort((a, b) => b.number - a.number).slice(0, 5)
        .map((l) => ({ kind: "lead", id: l.id, title: `#${l.number} ${l.company_name}`, detail: leadStage(l.stage_id)?.name ?? null, link: `/operacoes/comercial?lead=${l.id}` })) : []),
    ];
    return res(200, out);
  }

  // --- 36.6: notificações (sino) e repetição (mesmas regras de ops_notification*/ops_recurrence* no banco)
  const KINDS = ["tarefa.atribuida", "tarefa.mencao", "tarefa.comentario", "tarefa.concluida", "tarefa.prazo", "tarefa.atrasada",
    "reuniao.convite", "reuniao.hoje", "reuniao.item", "cliente.am", "lead.responsavel"];
  const mine = () => db.opsNotifications.filter((n) => n.user_id === userId);
  if (rpc("ops_notifications_unread")) return res(200, opsPerms.includes("ops.access") ? mine().filter((n) => !n.read_at).length : 0);
  if (rpc("ops_notifications_list")) {
    if (!opsPerms.includes("ops.access")) return res(200, null);
    const items = mine().filter((n) => (!p.p_unread || !n.read_at) && (!p.p_kind || n.kind === p.p_kind))
      .sort((a, b) => b.id - a.id).slice(0, Math.min(Math.max(p.p_limit ?? 30, 1), 200))
      .map((n) => ({ id: n.id, kind: n.kind, title: n.title, body: n.body, link: n.link, actor: name(n.actor_id), created_at: n.created_at, read_at: n.read_at }));
    return res(200, { items, unread: mine().filter((n) => !n.read_at).length });
  }
  if (rpc("ops_notifications_read")) {
    if (!opsPerms.includes("ops.access")) return deny();
    let k = 0;
    for (const n of mine()) if (!n.read_at && (!p.p_ids?.length || p.p_ids.includes(n.id))) { n.read_at = new Date().toISOString(); k++; }
    return res(200, k);
  }
  if (rpc("ops_notification_prefs_save")) {
    if (!opsPerms.includes("ops.access")) return deny();
    if ((p.p_muted ?? []).some((k) => !KINDS.includes(k))) return bad("Tipo de notificação desconhecido.");
    db.opsNotificationPrefs[userId] = [...new Set(p.p_muted ?? [])].sort();
    return res(204);
  }
  const recMatches = (r, day) => {
    const d = new Date(`${day}T12:00:00Z`);
    const dow = d.getUTCDay();
    if (r.frequency === "diaria") return true;
    if (r.frequency === "dias_uteis") return dow >= 1 && dow <= 5;
    if (r.frequency === "semanal") return (r.weekdays ?? []).includes(dow);
    const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
    return d.getUTCDate() === Math.min(r.month_day, last);
  };
  /** Gera as ocorrências que faltam (tarefas no dia; reuniões com 7 dias de antecedência). */
  const recGenerate = (r) => {
    const t0 = today();
    const to = r.end_date && r.end_date < addDays(t0, r.kind === "tarefa" ? 0 : 6) ? r.end_date : addDays(t0, r.kind === "tarefa" ? 0 : 6);
    let d = [r.start_date, r.last_date ? addDays(r.last_date, 1) : r.start_date, t0].sort().at(-1);
    for (; d <= to; d = addDays(d, 1)) {
      if (!recMatches(r, d)) continue;
      if (r.kind === "reuniao") {
        const src = db.opsMeetings.find((x) => x.id === r.meeting_id);
        if (db.opsMeetings.some((x) => x.recurrence_id === r.id && x.occurrence_date === d)) continue;
        const time = new Intl.DateTimeFormat("en-GB", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(src.starts_at));
        const m = { ...src, id: crypto.randomUUID(), number: ++db.opsMeetingSeq, status: "agendada", notes: null, cancel_reason: null, held_at: null,
          starts_at: new Date(`${d}T${time}:00-03:00`).toISOString(), created_at: new Date().toISOString(), version: 1, recurrence_id: r.id, occurrence_date: d,
          people: src.people.filter((x) => memberOk(x.user_id)).map((x) => ({ user_id: x.user_id, attended: null })) };
        db.opsMeetings.push(m);
        db.opsActivity.push({ id: db.opsActivity.length + 1, task_id: null, meeting_id: m.id, client_id: m.client_id, action: "reuniao.criada", actor_id: null,
          origin: "sistema", before: null, after: { reuniao: m.number, titulo_reuniao: m.title, repeticao: src.number }, created_at: new Date().toISOString() });
        for (const x of m.people) notifyInvite(m, x.user_id);
      } else {
        const src = db.opsTasks.find((x) => x.id === r.task_id);
        if (db.opsTasks.some((x) => x.recurrence_id === r.id && x.occurrence_date === d)) continue;
        const offset = src.due_date ? (Date.parse(src.due_date) - Date.parse(src.start_date ?? src.due_date)) / 86_400_000 : 0;
        const t = { ...src, id: crypto.randomUUID(), number: ++db.opsTaskSeq, status_id: "nao_iniciado", start_date: d, due_date: addDays(d, offset),
          people: src.people.filter((x) => memberOk(x.user_id)).map((x) => ({ ...x })), version: 1, created_by: r.created_by, created_at: new Date().toISOString(),
          completed_at: null, archived_at: null, recurrence_id: r.id, occurrence_date: d };
        db.opsTasks.push(t);
        db.opsActivity.push({ id: db.opsActivity.length + 1, task_id: t.id, client_id: t.client_id, action: "tarefa.criada", actor_id: null, origin: "sistema",
          before: null, after: { titulo: t.title, repeticao: src.number }, created_at: new Date().toISOString() });
      }
    }
    if (to >= r.start_date) r.last_date = to;
  };
  const recView = (r, isSource) => ({ ...r, is_source: isSource, source_id: r.task_id ?? r.meeting_id,
    source_number: r.kind === "tarefa" ? db.opsTasks.find((x) => x.id === r.task_id)?.number : db.opsMeetings.find((x) => x.id === r.meeting_id)?.number,
    occurrences: (r.kind === "tarefa" ? db.opsTasks : db.opsMeetings).filter((x) => x.recurrence_id === r.id).length, created_by_name: name(r.created_by),
    can_stop: r.active && (r.created_by === userId || role === "admin" || (r.kind === "tarefa" ? can("ops.tasks.edit")
      : meetingCanEdit(db.opsMeetings.find((x) => x.id === r.meeting_id)))) });
  if (rpc("ops_recurrence_for")) {
    const isTask = p.p_kind === "tarefa";
    const item = isTask ? find(p.p_id) : findMeeting(p.p_id);
    if (!item) return res(200, null);
    const own = db.opsRecurrences.filter((r) => (isTask ? r.task_id : r.meeting_id) === item.id).sort((a, b) => Number(b.active) - Number(a.active))[0];
    const r = own ?? db.opsRecurrences.find((x) => x.id === item.recurrence_id);
    return res(200, r ? recView(r, Boolean(own)) : null);
  }
  if (rpc("ops_recurrence_save")) {
    const q = p.p ?? {};
    const isTask = q.kind === "tarefa";
    const item = isTask ? find(q.source_id) : findMeeting(q.source_id);
    if (!item) return bad(isTask ? "Tarefa não encontrada." : "Reunião não encontrada.");
    if (isTask) {
      if (!can("ops.tasks.create")) return deny();
      if (item.people.some((x) => x.user_id !== userId) && !can("ops.tasks.assign")) return deny();
      if (item.archived_at) return bad("Tarefa arquivada não pode ser repetida.");
    } else {
      if (!can("ops.meetings.manage")) return deny();
      if (item.status === "cancelada") return bad("Reunião cancelada não pode ser repetida.");
    }
    if (item.recurrence_id) return bad(`Esta ${isTask ? "tarefa" : "reunião"} já é uma repetição. Altere a repetição pela ${isTask ? "tarefa" : "reunião"} original.`);
    if (db.opsRecurrences.some((r) => r.active && (isTask ? r.task_id : r.meeting_id) === item.id)) return bad(`Esta ${isTask ? "tarefa" : "reunião"} já se repete. Pare a repetição atual antes de criar outra.`);
    if (!["diaria", "dias_uteis", "semanal", "mensal"].includes(q.frequency)) return bad("Escolha a frequência.");
    const weekdays = [...new Set((q.weekdays ?? []).map(Number))].sort();
    if (q.frequency === "semanal" && !weekdays.length) return bad("Escolha os dias da semana.");
    if (q.frequency === "mensal" && !(Number(q.month_day) >= 1 && Number(q.month_day) <= 31)) return bad("Escolha o dia do mês (1 a 31).");
    if (!q.start_date || q.start_date <= today()) return bad("A repetição começa a partir de amanhã.");
    if (q.end_date && q.end_date < q.start_date) return bad("A data final vem depois do início.");
    const r = { id: crypto.randomUUID(), kind: q.kind, task_id: isTask ? item.id : null, meeting_id: isTask ? null : item.id, frequency: q.frequency,
      weekdays: q.frequency === "semanal" ? weekdays : null, month_day: q.frequency === "mensal" ? Number(q.month_day) : null, start_date: q.start_date,
      end_date: q.end_date || null, active: true, stop_reason: null, last_date: null, created_by: userId };
    db.opsRecurrences.push(r);
    const info = { frequencia: r.frequency, dias: r.weekdays, dia_mes: r.month_day, inicio: r.start_date, fim: r.end_date };
    if (isTask) log(item, "tarefa.repeticao", null, info); else logMeeting(item, "reuniao.repeticao", null, info);
    recGenerate(r);
    return res(200, r.id);
  }
  if (rpc("ops_recurrence_stop")) {
    const r = db.opsRecurrences.find((x) => x.id === p.p_id);
    const item = r && (r.kind === "tarefa" ? find(r.task_id) : findMeeting(r.meeting_id));
    if (!item) return bad("Repetição não encontrada.");
    if (!r.active) return res(204);
    if (!recView(r, true).can_stop) return deny("Você não pode parar esta repetição.");
    Object.assign(r, { active: false, stop_reason: `Parada por ${name(userId)}.` });
    if (r.kind === "tarefa") log(item, "tarefa.repeticao_parada", null, null); else logMeeting(item, "reuniao.repeticao_parada", null, null);
    return res(204);
  }
  // --- Status (só admin)
  if (role !== "admin") return deny("Só o administrador pode mudar a configuração da Central de Operações.");
  if (rpc("ops_status_save")) {
    if (db.opsStatuses.some((s) => s.id !== p.p_id && s.name.toLowerCase() === p.p_name.trim().toLowerCase())) return bad("Já existe um status com esse nome.");
    if (p.p_id) {
      const s = statusOf(p.p_id);
      if (s.category !== p.p_category && db.opsTasks.some((t) => t.status_id === s.id)) {
        return bad("Este status já está em uso: o grupo não pode mudar. Crie um status novo.");
      }
      Object.assign(s, { name: p.p_name.trim(), color: p.p_color, category: p.p_category });
      return res(200, s.id);
    }
    const id = crypto.randomUUID();
    db.opsStatuses.push({ id, name: p.p_name.trim(), color: p.p_color, category: p.p_category, position: db.opsStatuses.length + 1, active: true });
    return res(200, id);
  }
  if (rpc("ops_status_reorder")) {
    p.p_ids.forEach((id, i) => { const s = statusOf(id); if (s) s.position = i + 1; });
    return res(204);
  }
  if (rpc("ops_status_set_active")) {
    const s = statusOf(p.p_id);
    const using = db.opsTasks.filter((t) => t.status_id === s.id);
    if (!p.p_active) {
      if (using.length && !p.p_move_to) return bad(`Há ${using.length} tarefa(s) neste status. Escolha para qual status elas vão antes de desativar.`);
      if (!db.opsStatuses.filter((x) => x.active && x.id !== s.id).length) return bad("Precisa haver pelo menos um status ativo.");
      for (const t of using) {
        log(t, "tarefa.status", { status: t.status_id }, { status: p.p_move_to }, "sistema");
        Object.assign(t, { status_id: p.p_move_to, version: t.version + 1 });
      }
    }
    s.active = p.p_active;
    return res(204);
  }
  if (rpc("ops_client_stage_save")) {
    if (db.opsClientStages.some((x) => x.id !== p.p_id && x.name.toLowerCase() === p.p_name.trim().toLowerCase())) return bad("Já existe uma etapa com esse nome.");
    const fields = { name: p.p_name.trim(), color: p.p_color, require_mandatory: p.p_require ?? true, auto_advance: p.p_auto ?? false };
    if (p.p_id) { Object.assign(stageOf(p.p_id), fields); return res(200, p.p_id); }
    const id = crypto.randomUUID();
    db.opsClientStages.push({ id, ...fields, position: db.opsClientStages.length + 1, active: true });
    return res(200, id);
  }
  if (rpc("ops_client_stage_reorder")) {
    p.p_ids.forEach((id, i) => { const x = stageOf(id); if (x) x.position = i + 1; });
    return res(204);
  }
  if (rpc("ops_client_stage_set_active")) {
    const st = stageOf(p.p_id);
    if (!st) return bad("Etapa não encontrada.");
    if (!p.p_active) {
      const inIt = Object.entries(db.opsClientOps).filter(([, o]) => o.stage_id === st.id);
      if (inIt.length) {
        const dest = stageOf(p.p_move_to);
        if (!dest?.active || dest.id === st.id) return bad(`Há ${inIt.length} cliente(s) nesta etapa. Escolha para qual etapa eles vão antes de desativar.`);
        for (const [cid, o] of inIt) {
          logClient(cid, "cliente.etapa", { etapa: st.id }, { etapa: dest.id, regra: "Etapa desativada pelo administrador" }, "sistema");
          Object.assign(o, { stage_id: dest.id, version: o.version + 1 });
        }
      }
    }
    st.active = p.p_active;
    return res(204);
  }
  if (rpc("ops_queue_column_save")) {
    if (!statusOf(p.p_status)?.active) return bad("Escolha um status ativo para a coluna.");
    if (db.opsQueueColumns.some((x) => x.sector_id === p.p_sector && x.id !== p.p_id && x.name.toLowerCase() === p.p_name.trim().toLowerCase())) {
      return bad("Este setor já tem uma coluna com esse nome.");
    }
    const fields = { name: p.p_name.trim(), color: p.p_color, status_id: p.p_status };
    if (p.p_id) { Object.assign(db.opsQueueColumns.find((x) => x.id === p.p_id), fields); return res(200, p.p_id); }
    const id = crypto.randomUUID();
    db.opsQueueColumns.push({ id, sector_id: p.p_sector, ...fields, position: db.opsQueueColumns.filter((x) => x.sector_id === p.p_sector).length + 1, active: true });
    return res(200, id);
  }
  if (rpc("ops_queue_column_reorder")) {
    p.p_ids.forEach((id, i) => { const x = db.opsQueueColumns.find((c) => c.id === id && c.sector_id === p.p_sector); if (x) x.position = i + 1; });
    return res(204);
  }
  if (rpc("ops_queue_column_set_active")) {
    const c = db.opsQueueColumns.find((x) => x.id === p.p_id);
    if (!c) return bad("Coluna não encontrada.");
    c.active = p.p_active;
    return res(204);
  }
  if (rpc("ops_activity_type_save")) {
    if (db.opsActivityTypes.some((x) => x.id !== p.p_id && x.name.toLowerCase() === p.p_name.trim().toLowerCase())) return bad("Já existe um tipo com esse nome.");
    if (p.p_id) { Object.assign(db.opsActivityTypes.find((x) => x.id === p.p_id), { name: p.p_name.trim(), active: p.p_active ?? true }); return res(200, p.p_id); }
    const id = crypto.randomUUID();
    db.opsActivityTypes.push({ id, name: p.p_name.trim(), position: db.opsActivityTypes.length + 1, active: true });
    return res(200, id);
  }
  if (rpc("ops_lead_stage_save")) {
    if (db.opsLeadStages.some((x) => x.id !== p.p_id && x.name.toLowerCase() === p.p_name.trim().toLowerCase())) return bad("Já existe uma coluna com esse nome.");
    const fields = { name: p.p_name.trim(), color: p.p_color, category: p.p_category, require_previous: Boolean(p.p_require_previous),
      require_next_action: Boolean(p.p_require_next_action) };
    if (p.p_id) {
      const st = leadStage(p.p_id);
      if (st.category !== p.p_category && db.opsLeads.some((l) => l.stage_id === st.id)) return bad("Esta coluna já tem leads: o grupo não pode mudar. Crie uma coluna nova.");
      Object.assign(st, fields);
      return res(200, st.id);
    }
    const id = crypto.randomUUID();
    db.opsLeadStages.push({ id, ...fields, position: db.opsLeadStages.length + 1, active: true });
    return res(200, id);
  }
  if (rpc("ops_lead_stage_reorder")) {
    p.p_ids.forEach((id, i) => { const x = leadStage(id); if (x) x.position = i + 1; });
    return res(204);
  }
  if (rpc("ops_lead_stage_set_active")) {
    const st = leadStage(p.p_id);
    if (!st) return bad("Coluna não encontrada.");
    if (!p.p_active) {
      const inIt = db.opsLeads.filter((l) => l.stage_id === st.id);
      if (inIt.length) {
        const dest = leadStage(p.p_move_to);
        if (!dest?.active || dest.id === st.id || dest.category !== st.category) {
          return bad(`Há ${inIt.length} lead(s) nesta coluna. Escolha outra coluna do mesmo grupo para eles antes de desativar.`);
        }
        for (const l of inIt) {
          db.opsLeadEvents.push({ id: db.opsLeadEvents.length + 1, lead_id: l.id, action: "lead.etapa", actor_id: userId, origin: "sistema", before: { etapa: st.id },
            after: { etapa: dest.id, regra: "Coluna desativada pelo administrador" }, created_at: new Date().toISOString(), kind: null, body: null, happened_at: null });
          Object.assign(l, { stage_id: dest.id, version: l.version + 1 });
        }
      }
    }
    st.active = p.p_active;
    return res(204);
  }
  if (rpc("ops_loss_reason_save")) {
    if (db.opsLossReasons.some((x) => x.id !== p.p_id && x.name.toLowerCase() === p.p_name.trim().toLowerCase())) return bad("Já existe um motivo com esse nome.");
    if (p.p_id) { Object.assign(db.opsLossReasons.find((x) => x.id === p.p_id), { name: p.p_name.trim(), active: p.p_active ?? true }); return res(200, p.p_id); }
    const id = crypto.randomUUID();
    db.opsLossReasons.push({ id, name: p.p_name.trim(), position: db.opsLossReasons.length + 1, active: true });
    return res(200, id);
  }
  return null;
}
