// Fase 35.2 (passo 1) — Campaign Builder no servidor simulado (mesmas regras de private.builder_*_impl).
const findSecret = (text) => /EAA[A-Za-z0-9]{20,}|eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.|(senha|password|token|secret|api[_-]?key)\s*[:=]\s*\S{4,}/i.test(text);

export function seedCampaignBuilder() {
  return { builderPerms: {}, builderDrafts: [] };
}

export function handleCampaignBuilder({ db, url, parse, userId, role, res }) {
  if (!url.includes("/rest/v1/rpc/builder_")) return null;
  const rpc = (fn) => url.includes(`/rest/v1/rpc/${fn}`) && !url.includes(`/rest/v1/rpc/${fn}_`);
  const p = parse();
  db.rpcCalls.push({ fn: url.split("/rpc/")[1].split("?")[0], ...p });
  const isAdmin = role === "admin";
  const sees = ["admin", "gestor", "operador"].includes(role);
  if (!sees) return res(403, { code: "42501", message: "Sem permissão para o Campaign Builder." });
  const can = (what) => isAdmin || Boolean(db.builderPerms[userId]?.[what]);
  const bad = (message) => res(400, { code: "22023", message });
  const denied = (message) => res(403, { code: "42501", message });
  const name = (id) => db.profiles.find((x) => x.id === id)?.full_name ?? null;
  const t = new Date().toISOString();

  if (rpc("builder_my_permissions")) return res(200, { ver: true, criar: can("criar"), editar: can("editar"), publicar: can("publicar") });
  if (rpc("builder_permissions_list")) {
    if (!isAdmin) return denied("Só o administrador vê quem pode o quê.");
    return res(200, db.profiles.filter((x) => x.active && ["gestor", "operador"].includes(x.role)).map((x) => ({
      user_id: x.id, nome: x.full_name, papel: x.role,
      criar: Boolean(db.builderPerms[x.id]?.criar), editar: Boolean(db.builderPerms[x.id]?.editar), publicar: Boolean(db.builderPerms[x.id]?.publicar),
    })));
  }
  if (rpc("builder_permission_save")) {
    if (!isAdmin) return denied("Só o administrador muda quem pode o quê.");
    if ((p.p_create || p.p_publish) && !p.p_edit) return bad("Para criar ou publicar, a pessoa também precisa poder editar.");
    db.builderPerms[p.p_user] = { criar: Boolean(p.p_create), editar: Boolean(p.p_edit), publicar: Boolean(p.p_publish) };
    return res(204);
  }
  if (rpc("builder_draft_list")) {
    return res(200, db.builderDrafts.filter((d) => !d.archived_at).sort((a, b) => b.updated_at.localeCompare(a.updated_at)).map((d) => ({
      id: d.id, client_id: d.client_id, client_name: db.clients.find((c) => c.id === d.client_id)?.name ?? "",
      ad_account_id: d.ad_account_id, ad_account_name: db.adAccounts.find((a) => a.id === d.ad_account_id)?.name ?? null,
      name: d.name, version: d.version, updated_at: d.updated_at, updated_by_name: name(d.updated_by),
    })));
  }
  if (rpc("builder_draft_save")) {
    const nome = String(p.p_name ?? "").trim();
    if (nome.length < 2) return bad("Dê um nome ao rascunho (2 a 120 letras).");
    if (findSecret(JSON.stringify(p.p_data ?? {}) + " " + nome)) return bad("Parece que há uma senha, token ou chave num dos campos. Não coloque senhas, tokens nem dados de pagamento.");
    if (p.p_id) {
      if (!can("editar")) return denied("Você não tem permissão para editar rascunhos.");
      const d = db.builderDrafts.find((x) => x.id === p.p_id && !x.archived_at);
      if (!d) return bad("Rascunho não encontrado.");
      if (p.p_version !== d.version) return res(409, { code: "40001", message: "Outra pessoa alterou este rascunho. Recarregue antes de salvar." });
      Object.assign(d, { name: nome, data: p.p_data ?? {}, version: d.version + 1, updated_by: userId, updated_at: t });
      return res(200, { id: d.id, version: d.version, updated_at: t });
    }
    if (!can("criar")) return denied("Você não tem permissão para criar rascunhos.");
    const acc = db.adAccounts.find((a) => a.id === p.p_account && a.client_id === p.p_client && a.platform_id === "meta" && !a.unlinked_at);
    if (p.p_account && !acc) return bad("Esta conta de anúncio não é do Meta ou não pertence ao cliente.");
    const d = { id: crypto.randomUUID(), client_id: p.p_client, ad_account_id: p.p_account ?? null, name: nome, data: p.p_data ?? {}, version: 1, archived_at: null, created_by: userId, updated_by: userId, created_at: t, updated_at: t };
    db.builderDrafts.push(d);
    return res(200, { id: d.id, version: 1, updated_at: t });
  }
  if (rpc("builder_draft_archive")) {
    if (!can("editar")) return denied("Você não tem permissão para arquivar rascunhos.");
    const d = db.builderDrafts.find((x) => x.id === p.p_id && !x.archived_at);
    if (!d) return bad("Rascunho não encontrado.");
    d.archived_at = t;
    return res(204);
  }
  return null;
}
