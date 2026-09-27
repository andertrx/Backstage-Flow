/**
 * Tarefas da Central (Etapa 36.2) no servidor simulado: mesmas regras das
 * funções ops_task_* do banco (quem vê, permissões, versão, dependências).
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
    if (t.visibility === "equipe") return true;
    if (t.visibility === "participantes") return onTask;
    return onTask || m.primary === t.sector_id || m.secondary.includes(t.sector_id);
  };
  const visible = (t) => visibleFor(t, userId, role);
  const blockers = (t) => db.opsDeps.filter((d) => d.task_id === t.id)
    .map((d) => db.opsTasks.find((o) => o.id === d.depends_on_id)).filter((o) => o && !o.archived_at && !closed(o)).length;
  const log = (t, action, before, after, origin = "manual") =>
    db.opsActivity.push({ id: db.opsActivity.length + 1, task_id: t.id, action, actor_id: userId, origin, before, after, created_at: new Date().toISOString() });
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
    const t = find(path.split("/")[0]);
    if (!t) return res(403, { statusCode: "403", error: "Unauthorized", message: "new row violates row-level security policy" });
    if (files[1]) return db.opsFiles[path] ? res(200, { signedURL: `/object/sign/ops-files/${path}?token=demo` }) : res(404, { message: "Object not found" });
    if (method === "POST" || method === "PUT") {
      db.opsFiles[path] = { size: rawBody?.length ?? 1 };
      return res(200, { Key: `ops-files/${path}` });
    }
    return res(405, { message: "not allowed" });
  }

  if (url.includes("/rest/v1/ops_statuses")) return res(200, opsPerms.includes("ops.access") ? [...db.opsStatuses].sort((a, b) => a.position - b.position) : []);
  if (!url.includes("/rest/v1/rpc/ops_task") && !url.includes("/rest/v1/rpc/ops_comment") && !url.includes("/rest/v1/rpc/ops_attachment")
      && !url.includes("/rest/v1/rpc/ops_directory") && !url.includes("/rest/v1/rpc/ops_team_counts") && !url.includes("/rest/v1/rpc/ops_status")) return null;
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
      && (!f.client_id || t.client_id === f.client_id) && (!f.sector_id || t.sector_id === f.sector_id)
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
    const fields = { title: input.title.trim(), description: input.description?.trim() || null, client_id: input.client_id || null, sector_id: input.sector_id,
      priority: input.priority || "media", start_date: input.start_date || null, due_date: input.due_date || null,
      effort_hours: input.effort_hours ? Number(input.effort_hours) : null, visibility: input.visibility || "setor", tags: tags(input.tags) };
    const now = new Date().toISOString();
    if (!t) {
      const status = statusOf(input.status_id || "nao_iniciado");
      if (!status?.active) return bad("Escolha um status ativo.");
      t = { id: crypto.randomUUID(), number: ++db.opsTaskSeq, ...fields, status_id: status.id, people: writePeople(input.people), version: 1, created_by: userId,
        created_at: now, updated_at: now, completed_at: status.category === "concluido" ? now : null, archived_at: null };
      db.opsTasks.push(t);
      log(t, "tarefa.criada", null, { titulo: t.title });
    } else {
      const changed = Object.keys(fields).filter((k) => JSON.stringify(fields[k]) !== JSON.stringify(t[k]));
      Object.assign(t, fields, { version: t.version + 1, updated_at: now });
      const map = { title: "titulo", description: "descricao", client_id: "cliente", sector_id: "setor", priority: "prioridade", start_date: "inicio",
        due_date: "prazo", effort_hours: "esforco", visibility: "visibilidade", tags: "etiquetas" };
      if (changed.length) log(t, "tarefa.editada", {}, Object.fromEntries(changed.map((k) => [map[k], fields[k]])));
    }
    return res(200, t.id);
  }
  if (rpc("ops_task_set_status")) {
    const t = find(p.p_id);
    if (!t) return bad("Tarefa não encontrada.");
    if (!(can("ops.cards.move") || can("ops.tasks.edit"))) return deny("Você não tem permissão para mudar o status desta tarefa.");
    if (t.archived_at) return bad("Tarefa arquivada: desarquive para mudar o status.");
    if (t.version !== p.p_version) return conflict();
    const s = statusOf(p.p_status);
    if (!s?.active) return bad("Status inválido ou desativado.");
    const n = blockers(t);
    if (s.category === "concluido" && n > 0) {
      return bad(`Esta tarefa depende de ${n} tarefa(s) ainda aberta(s). Conclua ou retire a dependência antes de finalizar.`);
    }
    if (t.status_id === s.id) return res(200, t.version);
    log(t, "tarefa.status", { status: t.status_id }, { status: s.id });
    Object.assign(t, { status_id: s.id, version: t.version + 1, completed_at: s.category === "concluido" ? new Date().toISOString() : null });
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
  return null;
}
