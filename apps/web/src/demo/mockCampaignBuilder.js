// Fase 35.2 (passo 1) — Campaign Builder no servidor simulado (mesmas regras de private.builder_*_impl).
const findSecret = (text) => /EAA[A-Za-z0-9]{20,}|eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.|(senha|password|token|secret|api[_-]?key)\s*[:=]\s*\S{4,}/i.test(text);

export function seedCampaignBuilder() {
  return { builderPerms: {}, builderDrafts: [], metaBuilder: {} };
}

export function handleCampaignBuilder({ db, url, parse, userId, role, res }) {
  // Edge Function meta-builder (Fase A): listas da conta e validação da campanha. Os testes ajustam db.metaBuilder.{lists,validation,calls}.
  if (url.includes("/functions/v1/meta-builder")) {
    const b = parse();
    (db.metaBuilder.calls ??= []).push(b);
    const isAdminOrPerm = () => role === "admin" || Boolean(db.builderPerms[userId]?.publicar);
    if (!["admin", "gestor", "operador"].includes(role)) return res(403, { error: { code: "FORBIDDEN", message: "Você não tem permissão para usar o Criar Campanhas." } });
    if (b.action === "account_lists") {
      return res(200, { data: db.metaBuilder.lists ?? { pixels: [{ id: "111222333", name: "Pixel da loja" }], customAudiences: [{ id: "9001", name: "Clientes que compraram", detail: "CUSTOM" }], savedAudiences: [{ id: "9002", name: "Mulheres 25-40 SP" }], failed: [] } });
    }
    if (b.action === "validate") {
      return res(200, { data: { ...(db.metaBuilder.validation ?? { ok: true, message: null, code: null, subcode: null, permission: false }), scope: "campaign" } });
    }
    if (b.action === "targeting_search") {
      if (db.metaBuilder.searchError) return res(502, { error: { code: "PLATFORM_UNAVAILABLE", message: db.metaBuilder.searchError } });
      return res(200, { data: { results: b.kind === "city"
        ? [{ key: "2673660", name: "Fortaleza", detail: "Ceará, Brasil" }, { key: "2673661", name: "Fortim", detail: "Ceará, Brasil" }]
        : [{ id: "6003107902433", name: "Academia", detail: "público de 1.200.000+" }, { id: "6003107902434", name: "Crossfit" }] } });
    }
    if (b.action === "lead_forms") {
      if (db.metaBuilder.formsError) return res(400, { error: { code: "LEAD_FORMS_UNAVAILABLE", message: db.metaBuilder.formsError } });
      return res(200, { data: { forms: db.metaBuilder.forms ?? [{ id: "555566677", name: "Cadastro Janeiro", status: "ACTIVE" }, { id: "555566688", name: "Cadastro antigo", status: "ARCHIVED" }] } });
    }
    if (b.action === "drive_list") {
      if (db.metaBuilder.driveError) return res(400, { error: { code: "DRIVE_NOT_SHARED", message: db.metaBuilder.driveError } });
      const root = { folder: { id: "pastaRaiz1234567", name: "Criativos Excalibur" }, folders: [{ id: "subpasta12345678", name: "Black Friday" }], images: [], others: 1 };
      const sub = { folder: { id: "subpasta12345678", name: "Black Friday" }, folders: [], images: [{ id: "imagemUm1234567", name: "ADS-01.png", mimeType: "image/png", size: 245000 }, { id: "imagemDois123456", name: "ADS-02.jpg", mimeType: "image/jpeg", size: 1400000 }], videos: [{ id: "videoUm12345678", name: "REELS-01.mp4", mimeType: "video/mp4", size: 18000000 }], others: 0 };
      return res(200, { data: String(b.folder).includes("subpasta12345678") ? sub : root });
    }
    if (b.action === "drive_thumb") return res(200, { data: { thumbnail: null } });
    if (b.action === "publish") {
      const can = isAdminOrPerm();
      if (!can) return res(403, { error: { code: "FORBIDDEN", message: "Você não tem permissão para publicar no Meta." } });
      const d = db.builderDrafts.find((x) => x.id === b.draftId);
      if (!d) return res(404, { error: { code: "NOT_FOUND", message: "Rascunho não encontrado ou sem acesso." } });
      db.metaBuilder.ops ??= [];
      const same = db.metaBuilder.ops.find((o) => o.operation_key === b.operationKey);
      if (same) return res(200, { data: { operation: { id: same.id, status: same.status }, repeated: true } });
      if (db.metaBuilder.ops.some((o) => o.draft_id === b.draftId && ["concluida", "parcial"].includes(o.status))) {
        return res(400, { error: { code: "INVALID_STATE", message: "Este rascunho já foi publicado. Confira no Gerenciador de Anúncios; para publicar de novo, duplique o rascunho." } });
      }
      const data = d.data ?? {};
      const names = [{ kind: "campanha", name: data.campaign?.name ?? "" }];
      for (const s of data.adSets ?? []) names.push({ kind: "conjunto", name: s.name });
      for (const a of data.ads ?? []) { names.push({ kind: "criativo", name: a.name }); names.push({ kind: "anuncio", name: a.name }); }
      const fail = db.metaBuilder.publishFail; // { position, message }
      let stopped = false;
      const items = names.map((n, i) => {
        if (stopped) return { ...n, position: i, local_id: String(i), status: "pulado", meta_id: null, confirmed: false, effective_status: null, error_code: null, error_message: null };
        if (fail && fail.position === i) { stopped = true; return { ...n, position: i, local_id: String(i), status: "falhou", meta_id: null, confirmed: false, effective_status: null, error_code: 100, error_message: fail.message }; }
        return { ...n, position: i, local_id: String(i), status: "criado", meta_id: String(1000 + i), confirmed: true, effective_status: "PAUSED", error_code: null, error_message: null };
      });
      const made = items.filter((i) => i.status === "criado").length;
      const status = made === 0 ? "falhou" : made === items.length ? "concluida" : "parcial";
      const op = { id: `op-${db.metaBuilder.ops.length + 1}`, draft_id: b.draftId, operation_key: b.operationKey, status, summary: { campanhas: 1, conjuntos: (data.adSets ?? []).length, anuncios: (data.ads ?? []).length },
        error_message: null, created_at: new Date().toISOString(), finished_at: new Date().toISOString(), publish_items: items };
      db.metaBuilder.ops.unshift(op);
      return res(200, { data: { operation: { id: op.id, status }, repeated: false } });
    }
    return res(400, { error: { code: "INVALID_INPUT", message: "Pedido inválido." } });
  }
  if (url.includes("/rest/v1/publish_operations")) {
    const draftId = new URL(url, "http://x").searchParams.get("draft_id")?.replace("eq.", "");
    return res(200, (db.metaBuilder.ops ?? []).filter((o) => !draftId || o.draft_id === draftId));
  }
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
  if (rpc("builder_draft_get")) {
    const d = db.builderDrafts.find((x) => x.id === p.p_id && !x.archived_at);
    if (!d) return bad("Rascunho não encontrado.");
    return res(200, { id: d.id, client_id: d.client_id, ad_account_id: d.ad_account_id, name: d.name, data: d.data, version: d.version, updated_at: d.updated_at });
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
  if (rpc("builder_draft_unarchive")) {
    if (!can("editar")) return denied("Você não tem permissão para desarquivar rascunhos.");
    const d = db.builderDrafts.find((x) => x.id === p.p_id && x.archived_at);
    if (!d) return bad("Rascunho não encontrado ou já está ativo.");
    d.archived_at = null;
    return res(204);
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
