// Etapa 42 — Criador de Anúncios no servidor simulado (mesmas regras de private.ads_builder_*_impl).
// Versão curta da regra do banco (private.ads_builder_sem_segredo): token, chave, senha.
const findSecret = (text) => /EAA[A-Za-z0-9]{20,}|eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.|(senha|password|token|secret|api[_-]?key)\s*[:=]\s*\S{4,}/i.test(text);

export function seedAdsBuilder() {
  return { adsModelos: [], adsPedidos: [] };
}

export function handleAdsBuilder({ db, url, parse, userId, role, res }) {
  if (!url.includes("/rest/v1/rpc/ads_builder_")) return null;
  const rpc = (fn) => url.includes(`/rest/v1/rpc/${fn}`) && !url.includes(`/rest/v1/rpc/${fn}_`);
  const p = parse();
  db.rpcCalls.push({ fn: url.split("/rpc/")[1].split("?")[0], ...p });
  if (!["admin", "gestor", "operador"].includes(role)) return res(403, { code: "42501", message: "Sem permissão para o Criador de Anúncios." });
  const bad = (message) => res(400, { code: "22023", message });
  const name = (id) => db.profiles.find((x) => x.id === id)?.full_name ?? null;
  const secret = (text) => (findSecret(text) ? bad("Parece que há uma senha, token ou chave num dos campos. Não coloque senhas, tokens nem dados de pagamento.") : null);
  const t = new Date().toISOString();

  if (rpc("ads_builder_modelos")) {
    return res(200, db.adsModelos.filter((m) => !m.arquivado_em).sort((a, b) => a.nome.localeCompare(b.nome))
      .map((m) => ({ id: m.id, nome: m.nome, dados: m.dados, updated_at: m.updated_at, atualizado_por_nome: name(m.atualizado_por) })));
  }
  if (rpc("ads_builder_modelo_save")) {
    const nome = String(p.p_nome ?? "").trim();
    if (nome.length < 2) return bad("Dê um nome ao modelo (2 a 120 letras).");
    const s = secret(JSON.stringify(p.p_dados) + " " + nome);
    if (s) return s;
    let m = p.p_id ? db.adsModelos.find((x) => x.id === p.p_id) : db.adsModelos.find((x) => !x.arquivado_em && x.nome.trim().toLowerCase() === nome.toLowerCase());
    if (m) Object.assign(m, { nome, dados: p.p_dados, atualizado_por: userId, updated_at: t });
    else { m = { id: crypto.randomUUID(), nome, dados: p.p_dados, criado_por: userId, atualizado_por: userId, arquivado_em: null, created_at: t, updated_at: t }; db.adsModelos.push(m); }
    return res(200, m.id);
  }
  if (rpc("ads_builder_modelo_archive")) {
    const m = db.adsModelos.find((x) => x.id === p.p_id && !x.arquivado_em);
    if (!m) return bad("Modelo não encontrado.");
    m.arquivado_em = t;
    return res(204);
  }
  if (rpc("ads_builder_pedido_add")) {
    const d = p.p_dados ?? {};
    if (!String(d.conta ?? "").trim() || !String(d.campanha ?? "").trim() || !String(d.conjunto ?? "").trim()) return bad("Informe a conta, a campanha e o conjunto.");
    if (!String(p.p_texto ?? "").trim()) return bad("O pedido está vazio.");
    const s = secret(p.p_texto + " " + JSON.stringify(d));
    if (s) return s;
    const id = db.adsPedidos.length + 1;
    db.adsPedidos.push({ id, tipo: "anuncios", conta: d.conta.trim(), campanha: d.campanha.trim(), conjunto: d.conjunto.trim(), dados: d, texto: p.p_texto,
      origem_pedido_id: p.p_origem ?? null, criado_por: userId, created_at: t });
    return res(200, id);
  }
  if (rpc("ads_builder_pedidos")) {
    const q = String(p.f?.busca ?? "").trim().toLowerCase();
    return res(200, [...db.adsPedidos].reverse()
      .filter((r) => !q || [r.conta, r.campanha, r.conjunto].some((x) => x.toLowerCase().includes(q)))
      .map((r) => ({ ...r, criado_por_nome: name(r.criado_por) })));
  }
  return null;
}
