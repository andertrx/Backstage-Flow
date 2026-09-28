/**
 * Tarefas da Central (Etapas 36.2 e 36.3) no servidor simulado: mesmas regras
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
    Object.assign(t, { status_id: s.id, version: t.version + 1, completed_at: s.category === "concluido" ? new Date().toISOString() : null });
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
  const prefixes = ["ops_task", "ops_comment", "ops_attachment", "ops_directory", "ops_team_counts", "ops_status", "ops_client", "ops_demand",
    "ops_queue", "ops_activity_type"];
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
  return null;
}
