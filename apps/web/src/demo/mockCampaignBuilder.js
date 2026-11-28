// Fase 35.2 (passo 1) — Campaign Builder no servidor simulado (mesmas regras de private.builder_*_impl).
const findSecret = (text) => /EAA[A-Za-z0-9]{20,}|eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.|(senha|password|token|secret|api[_-]?key)\s*[:=]\s*\S{4,}/i.test(text);

export function seedCampaignBuilder() {
  return { builderPerms: {}, builderDrafts: [], builderCopySets: [], metaBuilder: {} };
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
    if (b.action === "ig_media") {
      if (db.metaBuilder.igError) return res(400, { error: { code: "IG_MEDIA_UNAVAILABLE", message: db.metaBuilder.igError } });
      return res(200, { data: { media: db.metaBuilder.igMedia ?? [
        { id: "17900000000001", caption: "Treino de segunda: peito e tríceps", type: "VIDEO", permalink: "https://www.instagram.com/p/a/", date: "2026-11-20T10:00:00+0000", thumbnail: "" },
        { id: "17900000000002", caption: "Aula experimental grátis", type: "IMAGE", permalink: "https://www.instagram.com/p/b/", date: "2026-11-18T10:00:00+0000", thumbnail: "" },
      ] } });
    }
    if (b.action === "lead_forms") {
      if (db.metaBuilder.formsError) return res(400, { error: { code: "LEAD_FORMS_UNAVAILABLE", message: db.metaBuilder.formsError } });
      return res(200, { data: { forms: db.metaBuilder.forms ?? [{ id: "555566677", name: "Cadastro Janeiro", status: "ACTIVE" }, { id: "555566688", name: "Cadastro antigo", status: "ARCHIVED" }] } });
    }
    if (b.action === "drive_list" && String(b.folder).includes("esteira")) {
      // Fase J.2: pasta com um par (vertical 9:16 + 4:5), um vídeo sem par e uma imagem quadrada.
      return res(200, { data: { folder: { id: "pastaEsteira1234", name: "Black semana 2" }, folders: [], others: 0,
        images: [{ id: "imgQuadrada12345", name: "OFERTA-03.jpg", mimeType: "image/jpeg", size: 300000, width: 1080, height: 1080 }],
        videos: [
          { id: "vidVertical12345", name: "OFERTA-01_9x16.mp4", mimeType: "video/mp4", size: 12000000, width: 1080, height: 1920 },
          { id: "vidFeed123456789", name: "OFERTA-01_4x5.mp4", mimeType: "video/mp4", size: 11000000, width: 1080, height: 1350 },
          { id: "vidSozinho123456", name: "OFERTA-02.mp4", mimeType: "video/mp4", size: 9000000, width: 1080, height: 1350 },
        ] } });
    }
    if (b.action === "adset_info") {
      const a = (db.metaBuilder.adsets ?? {})[b.adSetId] ?? { destinationType: "WHATSAPP", advantageAudience: true, placements: "automatic" };
      const g = (db.adGroups ?? []).find((x) => x.external_id === b.adSetId);
      const c = (db.campaigns ?? []).find((x) => x.id === g?.campaign_id);
      return res(200, { data: { id: b.adSetId, name: g?.name ?? "Conjunto", campaignId: c?.external_id ?? "", campaignName: c?.name ?? "", destinationType: a.destinationType, optimizationGoal: "CONVERSATIONS", effectiveStatus: "ACTIVE",
        check: { kind: "conjunto", advantageAudience: a.advantageAudience, placements: a.placements } } });
    }
    if (b.action === "ad_template") {
      return res(200, { data: db.metaBuilder.template ?? { pageId: "328104960376244", instagramId: "17841402908048736", bodies: ["Revenda moda masculina que gira rápido!", "Sua loja merece vender mais!", "Lojista, renove seu estoque!"],
        titles: ["Moda Masculina no Atacado", "Renove o estoque", "Converse conosco"], description: "", link: "https://api.whatsapp.com/send", cta: "WHATSAPP_MESSAGE", urlTags: "utm_source=meta&utm_campaign={{campaign.name}}" } });
    }
    if (b.action === "media_prepare") {
      (db.metaBuilder.prepared ??= []).push(b.fileId);
      if (db.metaBuilder.prepareFail === b.fileId) return res(400, { error: { code: "PLATFORM_BAD_REQUEST", message: "O Meta recusou o vídeo." } });
      return res(200, { data: b.fileId.startsWith("img") ? { kind: "image", hash: `hash${b.fileId.slice(0, 10)}` } : { kind: "video", id: String(7000 + db.metaBuilder.prepared.length), thumbnail: `https://scontent.example/${b.fileId}.jpg` } });
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
      const esteira = data.kind === "esteira";
      if (esteira) (db.metaBuilder.esteiraPublished ??= []).push(JSON.parse(JSON.stringify(data)));
      const names = esteira ? [] : [{ kind: "campanha", name: data.campaign?.name ?? "" }];
      for (const s of esteira ? [] : (data.adSets ?? [])) names.push({ kind: "conjunto", name: s.name });
      for (const a of esteira ? (data.items ?? []) : (data.ads ?? [])) { names.push({ kind: "criativo", name: a.name }); names.push({ kind: "anuncio", name: a.name }); }
      const fail = db.metaBuilder.publishFail; // { position, message }
      let stopped = false;
      const items = names.map((n, i) => {
        if (stopped) return { ...n, position: i, local_id: String(i), status: "pulado", meta_id: null, confirmed: false, effective_status: null, error_code: null, error_message: null };
        if (fail && fail.position === i) { stopped = true; return { ...n, position: i, local_id: String(i), status: "falhou", meta_id: null, confirmed: false, effective_status: null, error_code: 100, error_message: fail.message }; }
        // Leitura de volta das automações (Fase J.1): o teste pode simular o Meta ligando algo com db.metaBuilder.forcedOn = ["inline_comment"].
        const automations_check = n.kind === "criativo" ? { kind: "criativo", ligadas: db.metaBuilder.forcedOn ?? [] }
          : n.kind === "conjunto" ? { kind: "conjunto", advantageAudience: false, placements: (data.campaign?.control?.placements ?? "manual") } : null;
        return { ...n, position: i, local_id: String(i), status: "criado", meta_id: String(1000 + i), confirmed: true, effective_status: "PAUSED", error_code: null, error_message: null, automations_check };
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
  // Esteira (J.2): conjuntos da conta com a campanha, e anúncios de um conjunto.
  if (url.includes("/rest/v1/ad_groups") && decodeURIComponent(url).includes("campaign:campaigns")) {
    const acc = new URL(url, "http://x").searchParams.get("ad_account_id")?.replace("eq.", "");
    return res(200, (db.adGroups ?? []).filter((g) => g.ad_account_id === acc).map((g) => {
      const c = (db.campaigns ?? []).find((x) => x.id === g.campaign_id);
      return { id: g.id, external_id: g.external_id, name: g.name, effective_status: g.effective_status ?? "ACTIVE", campaign: c ? { external_id: c.external_id, name: c.name, effective_status: c.effective_status ?? "ACTIVE" } : null };
    }));
  }
  if (url.includes("/rest/v1/ads?") && url.includes("ad_group_id=eq.") && decodeURIComponent(url).includes("select=external_id,name,effective_status")) {
    const g = new URL(url, "http://x").searchParams.get("ad_group_id")?.replace("eq.", "");
    return res(200, (db.ads ?? []).filter((a) => a.ad_group_id === g).map((a) => ({ external_id: a.external_id, name: a.name, effective_status: a.effective_status ?? "ACTIVE" })));
  }
  // Biblioteca de textos (J.3): leitura direta pela tabela (RLS no banco real).
  if (url.includes("/rest/v1/builder_copy_sets")) {
    const u = new URL(url, "http://x");
    const client = u.searchParams.get("client_id")?.replace("eq.", "");
    const archived = (u.searchParams.get("archived_at") ?? "").startsWith("not.");
    return res(200, (db.builderCopySets ?? []).filter((x) => x.client_id === client && Boolean(x.archived_at) === archived).sort((a, b) => a.name.localeCompare(b.name)));
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
      name: d.name, version: d.version, updated_at: d.updated_at, updated_by_name: name(d.updated_by), kind: d.data?.kind === "esteira" ? "esteira" : "campanha",
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
  if (rpc("builder_copy_set_save")) {
    if (!can("editar")) return denied("Você não tem permissão para editar a biblioteca de textos.");
    const nome = String(p.p_name ?? "").trim();
    if (nome.length < 2) return bad("Dê um nome ao pacote (2 a 120 letras).");
    const v = p.p_data ?? {};
    if (findSecret(JSON.stringify(v) + " " + nome)) return bad("Parece que há uma senha, token ou chave num dos campos.");
    if (v.link && !/^https:\/\//.test(v.link)) return bad("O link precisa começar com https://.");
    const list = db.builderCopySets;
    const cur = p.p_id ? list.find((x) => x.id === p.p_id && !x.archived_at) : null;
    if (p.p_id && !cur) return bad("Pacote não encontrado.");
    if (cur && p.p_version !== cur.version) return res(409, { code: "40001", message: "Outra pessoa alterou este pacote. Recarregue antes de salvar." });
    const client = cur?.client_id ?? p.p_client;
    if (list.some((x) => x.client_id === client && !x.archived_at && x.name.toLowerCase() === nome.toLowerCase() && x.id !== p.p_id)) return bad("Já existe um pacote com esse nome para este cliente.");
    const fields = { name: nome, bodies: v.bodies ?? [], titles: v.titles ?? [], description: v.description ?? "", link: v.link ?? "", cta: v.cta ?? "", url_tags: v.url_tags ?? "", messages: v.messages ?? [], updated_at: t };
    if (cur) { Object.assign(cur, fields, { version: cur.version + 1 }); return res(200, { id: cur.id, version: cur.version }); }
    const n = { id: crypto.randomUUID(), client_id: client, ...fields, version: 1, archived_at: null };
    list.push(n);
    return res(200, { id: n.id, version: 1 });
  }
  if (rpc("builder_copy_set_archive")) {
    if (!can("editar")) return denied("Você não tem permissão para editar a biblioteca de textos.");
    const cur = db.builderCopySets.find((x) => x.id === p.p_id);
    if (!cur) return bad("Pacote não encontrado.");
    cur.archived_at = p.p_archive ? t : null;
    return res(204);
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
