/**
 * Supabase SIMULADO, em memória (nenhum dado real é tocado).
 * Usado pelos testes de navegador (e2e/support.mjs) e pelo MODO DEMONSTRAÇÃO
 * do site (Etapa 27): as mesmas regras das funções do banco, em JavaScript.
 */
import { handleOpsTasks, seedOpsTasks } from "./mockOpsTasks.js";

export const USER_ID = "11111111-1111-1111-1111-111111111111";

const b64 = (o) => btoa(unescape(encodeURIComponent(JSON.stringify(o)))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

/** Lê um filtro PostgREST simples da URL (ex.: id=eq.123 → "123"). */
const eqParam = (url, column) => new URL(url).searchParams.get(column)?.replace(/^eq\./, "");

/** Resposta do servidor simulado (corpo já em JSON, ou nenhum). */
const res = (status, body) => ({ status, body: body === undefined ? undefined : JSON.stringify(body) });

/** "Banco" vazio, com o usuário logado e dois usuários de exemplo. */
export function createMockDb({ role = "admin", userId = USER_ID, email = "ander@teste.local", fullName = "Ander Rodrigues" } = {}) {
  return {
    profiles: [
      { id: userId, email, full_name: fullName, role, active: true, created_at: "2026-09-23T23:10:00Z", updated_at: "" },
      { id: "22222222-2222-2222-2222-222222222222", email: "gestor@agencia.com", full_name: "Maria Gestora", role: "gestor", active: true, created_at: "2026-09-24T10:00:00Z", updated_at: "" },
      { id: "33333333-3333-3333-3333-333333333333", email: "cliente@excalibur.com", full_name: "Excalibur Fitness", role: "cliente", active: false, created_at: "2026-09-24T11:00:00Z", updated_at: "" },
    ],
    clients: [],
    access: [],
    connections: [],
    adAccounts: [],
    /** Contas que a "API do Meta" simulada devolve. */
    metaAccounts: [
      { externalId: "1001", name: "Excalibur - Principal", currency: "BRL", timezone: "America/Sao_Paulo", status: "ativa", businessName: "BM Agência" },
      { externalId: "1002", name: "Excalibur - Remarketing", currency: "BRL", timezone: "America/Sao_Paulo", status: "pagamento_pendente", businessName: "BM Agência" },
    ],
    /** Contas que a "API do Google Ads" simulada devolve (uma via MCC, uma de teste). */
    googleAccounts: [
      { externalId: "1234567890", name: "Excalibur - Pesquisa", currency: "BRL", timezone: "America/Sao_Paulo", status: "ativa", businessName: "MCC Agência", managerId: "9998887776", isTestAccount: false },
      { externalId: "5556667778", name: "Conta de Teste", currency: "BRL", timezone: "America/Sao_Paulo", status: "ativa", businessName: null, managerId: null, isTestAccount: true },
    ],
    /** Segredos do Google que "faltam" no servidor simulado. */
    googleMissing: [],
    functionCalls: [],
    adAccountCalls: [],
    /** Campanhas e métricas diárias (como public.campaigns / public.metrics_daily). */
    campaigns: [],
    /** Conjuntos/grupos, anúncios e histórico de alterações. */
    adGroups: [],
    ads: [],
    entityChanges: [],
    metrics: [],
    rpcCalls: [],
    /** Última fotografia de saldo por conta; o que a "API" devolve ao atualizar; erros simulados. */
    snapshots: {},
    fundingApi: {},
    fundingErrors: {},
    /** Central de alertas (como public.alerts) e o que a próxima verificação encontra. */
    alerts: [],
    alertRefresh: null,
    /** Estado da sincronização por conta (como public.sync_state). */
    syncState: {},
    /** Log de sincronização (como public.sync_runs) e o que a próxima sincronização manual faz com cada conta. */
    syncRuns: [],
    syncOutcome: {},
    syncCalls: [],
    /** Auditoria (como public.audit_logs) e os logins/logouts registrados. */
    audit: [],
    authEvents: [],
    /** Cobertura do histórico por conta (como sync_state.history_from/to). */
    coverage: {},
    /** Erros técnicos (como public.error_logs) e respostas forçadas por função (Etapa 25). */
    errorLogs: [],
    rpcOverride: {},
    /** Tracking (Etapa 34): containers, chegadas com origem e eventos. */
    trackingContainers: [],
    trackingTouchpoints: [],
    trackingEvents: [],
    /** Leads (com first_touch/last_touch já resumidos), compras e jornada por lead. */
    trackingLeads: [],
    trackingPurchases: [],
    trackingJourneys: {},
    /** Meta CAPI (34.3): destinos (o "token" fica só aqui no servidor simulado), resumo e registro. */
    trackingDestinations: [],
    trackingCapiLog: [],
    capiTokens: {},
    capiTestResult: { ok: true, eventsReceived: 1, message: null },
    /** WhatsApp (34.5-W): cliques com código de rastreio. */
    whatsappClicks: [],
    /** WhatsApp pela API oficial (34.5-W2): conexões (segredos só aqui), conversas recebidas. */
    whatsappConnections: [],
    whatsappConversations: [],
    waSecrets: {},
    /** Atribuição (34.4): linhas prontas por modelo e qualidade por site. */
    trackingAttribution: { last: [], first: [] },
    trackingQuality: [],
    /** Dashboard do cliente (Etapa 19): modelo por cliente (como public.client_report_settings). */
    reportSettings: [],
    /** Acesso do cliente (Etapa 19.2): por cliente, e código do link → cliente (só no servidor). */
    portals: {},
    portalTokens: {},
    /** Divisões (Etapa 19.3): linhas por dia (como metrics_breakdown_daily) e cobertura por conta. */
    breakdowns: [],
    breakdownCoverage: [],
    /** Logo e e-mail semanal (Etapa 19.4): arquivos enviados, remetente (a chave fica só aqui), config e envios por cliente. */
    storageObjects: {},
    emailSettings: { from_name: "Backstage Flow", from_email: "relatorios@backstageflow.com.br", reply_to: null, has_key: false, key_updated_at: null,
      last_test_at: null, last_test_ok: null, last_test_error: null },
    emailKey: null,
    clientEmails: {},
    clientEmailLog: [],
    emailLinks: {},
    /** Resultado do "Resend" simulado: "ok" ou uma mensagem de erro. */
    emailResult: "ok",
    emailsSent: [],
    /** Central de Operações (Etapa 36): setores, pessoas (setores, cargo, permissões). */
    opsSectors: [
      ["Comercial", "#7C3AED"], ["Atendimento", "#06B6D4"], ["Account Manager", "#A855F7"], ["Operacional", "#10B981"],
      ["Design", "#F59E0B"], ["Copy", "#22D3EE"], ["Gestão de Tráfego", "#EF4444"], ["Social Media", "#EC4899"],
      ["Desenvolvimento (Dev)", "#3B82F6"], ["Áudio e Vídeo", "#64748B"],
    ].map(([name, color], i) => ({ id: `5ec70000-0000-4000-8000-0000000000${String(i + 10)}`, name, color, position: i + 1, status: "ativo" })),
    opsMembers: {},
    /** Tarefas da Central (Etapa 36.2). */
    ...seedOpsTasks(),
  };
}

/**
 * Servidor simulado: recebe { url, method, body } e devolve { status, body }.
 * password = null aceita qualquer senha (modo demonstração); os testes informam a senha certa.
 */
export function createMockBackend(db, { role = "admin", password = null, userId = USER_ID, email = "ander@teste.local", fullName = "Ander Rodrigues" } = {}) {
  const now = Math.floor(Date.now() / 1000);
  const jwt = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: userId, role: "authenticated", aud: "authenticated", exp: now + 3600 })}.sig`;
  const user = { id: userId, aud: "authenticated", role: "authenticated", email, app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() };

  /** Saldo de cada conta vinculada (mesma regra de public.account_balances). */
  function balanceRows(p) {
      const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
      const shift = (n) => new Date(Date.parse(`${today}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
      const rows = db.adAccounts
        .filter((a) => !a.unlinked_at && (!p.p_client_ids || p.p_client_ids.includes(a.client_id)) &&
          (!p.p_platforms || p.p_platforms.includes(a.platform_id)) && (!p.p_ad_account_ids || p.p_ad_account_ids.includes(a.id)))
        .map((a) => {
          const s = db.snapshots[a.id] ?? {};
          const spend = db.metrics.filter((m) => m.ad_account_id === a.id && m.level === "account" && m.date >= shift(-2) && m.date <= shift(-1));
          return {
            ad_account_id: a.id, client_id: a.client_id, client_name: db.clients.find((c) => c.id === a.client_id)?.name ?? "",
            platform_id: a.platform_id, external_id: a.external_id, name: a.name, currency: s.currency ?? a.currency, status: a.status ?? "ativa",
            is_prepay: a.is_prepay ?? null, low_balance_days: a.low_balance_days ?? 3, low_balance_amount_micros: a.low_balance_amount_micros ?? null,
            captured_at: s.captured_at ?? null, available_micros: s.available_micros ?? null, available_basis: s.available_basis ?? null,
            amount_spent_micros: s.amount_spent_micros ?? null, amount_due_micros: s.amount_due_micros ?? null,
            spend_cap_micros: s.spend_cap_micros ?? null, budget_micros: s.budget_micros ?? null, budget_end_at: s.budget_end_at ?? null,
            funding_description: s.funding_description ?? null, issues: s.issues ?? [],
            spend_last_7_days_micros: spend.length ? spend.reduce((t, m) => t + m.spend_micros, 0) : null, spend_days: spend.length,
          };
        });
      return rows;

  }


  /** Números do dashboard do cliente (mesmas regras das funções client_report_*). */
  function reportRpc(fn, p) {
      db.rpcCalls.push({ fn, ...p });
      const accts = db.adAccounts.filter((a) => a.client_id === p.p_client_id && !a.unlinked_at);
      const sumActions = (list) => {
        const out = {};
        for (const m of list) for (const a of m.raw_actions?.actions ?? []) out[a.action_type] = (out[a.action_type] ?? 0) + Number(a.value);
        return out;
      };
      const sum = (list, k) => (list.every((r) => r[k] == null) ? null : list.reduce((t, r) => t + (r[k] ?? 0), 0));
      const KEYS = ["spend_micros", "impressions", "clicks", "link_clicks", "leads", "messages", "conversions", "conversion_value_micros", "video_views"];
      const inRange = (m, from, to) => m.date >= from && m.date <= to;
      if (fn === "client_report_accounts") {
        const days = Math.round((Date.parse(p.p_to) - Date.parse(p.p_from)) / 86_400_000) + 1;
        const shift = (d, n) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
        const pf = shift(p.p_from, -days), pt = shift(p.p_from, -1);
        const reach = (a, from, to) => (db.reachRows ?? []).find((r) => r.ad_account_id === a.id && r.level === "account" &&
          r.entity_external_id === a.external_id && r.period_start === from && r.period_end === to);
        const totals = (a, from, to) => {
          const list = db.metrics.filter((m) => m.ad_account_id === a.id && m.level === "account" && inRange(m, from, to));
          if (!list.length) return null;
          const r = reach(a, from, to);
          const withActions = list.filter((m) => m.raw_actions);
          return { ...Object.fromEntries(KEYS.map((k) => [k, sum(list, k)])), days: list.length, reach: r?.reach ?? null, frequency: r?.frequency ?? null,
            actions: withActions.length ? sumActions(withActions) : {} };
        };
        const out = accts.map((a) => ({
          ad_account_id: a.id, platform_id: a.platform_id, name: a.name, external_id: a.external_id, currency: a.currency,
          cur: totals(a, p.p_from, p.p_to), prev: totals(a, pf, pt), prev_from: pf, prev_to: pt, last_synced_at: db.lastSyncedAt ?? "2026-09-23T22:10:00Z",
        })).sort((x, y) => (y.cur?.spend_micros ?? 0) - (x.cur?.spend_micros ?? 0));
        return out;
      }
      if (fn === "client_report_daily") {
        const ids = new Set(accts.map((a) => a.id));
        return (db.metrics.filter((m) => ids.has(m.ad_account_id) && m.level === "account" && inRange(m, p.p_from, p.p_to))
          .map((m) => ({ ad_account_id: m.ad_account_id, date: m.date, ...Object.fromEntries(KEYS.slice(0, 8).map((k) => [k, m[k] ?? null])),
            actions: m.raw_actions ? sumActions([m]) : null }))
          .sort((x, y) => x.ad_account_id.localeCompare(y.ad_account_id) || x.date.localeCompare(y.date)));
      }
      if (fn === "client_report_campaigns") {
        const ids = new Set(accts.map((a) => a.id));
        const rows = db.metrics.filter((m) => ids.has(m.ad_account_id) && m.level === "campaign" && inRange(m, p.p_from, p.p_to));
        const out = [...Map.groupBy(rows, (m) => m.campaign_id)].map(([cid, list]) => {
          const c = db.campaigns.find((x) => x.id === cid);
          const withActions = list.filter((m) => m.raw_actions);
          return { campaign_id: cid, ad_account_id: c.ad_account_id, name: c.name, status: c.status, objective: c.objective,
            ...Object.fromEntries(KEYS.slice(0, 8).map((k) => [k, sum(list, k)])), actions: withActions.length ? sumActions(withActions) : null };
        }).filter((r) => r.spend_micros > 0 || r.leads > 0 || r.messages > 0 || r.conversions > 0)
          .sort((x, y) => (y.spend_micros ?? 0) - (x.spend_micros ?? 0)).slice(0, 200);
        return out;
      }
      if (fn === "client_report_breakdowns") {
        const ids = new Set(accts.map((a) => a.id));
        const rows = db.breakdowns.filter((b) => ids.has(b.ad_account_id) && inRange(b, p.p_from, p.p_to));
        return [...Map.groupBy(rows, (b) => `${b.ad_account_id}|${b.dimension}|${b.value}`).values()].map((list) => {
          const withActions = list.filter((b) => b.actions);
          const acts = {};
          for (const b of withActions) for (const [k, v] of Object.entries(b.actions)) acts[k] = (acts[k] ?? 0) + v;
          return {
            ad_account_id: list[0].ad_account_id, dimension: list[0].dimension, value: list[0].value,
            ...Object.fromEntries(KEYS.slice(0, 8).map((k) => [k, sum(list, k)])), actions: withActions.length ? acts : null,
          };
        });
      }
      if (fn === "client_report_breakdown_coverage") {
        const ids = new Set(accts.map((a) => a.id));
        return db.breakdownCoverage.filter((c) => ids.has(c.ad_account_id));
      }
      return [];
  }

  return async function handle({ url, method, body: rawBody }) {
    const parse = () => (rawBody ? JSON.parse(rawBody) : {});
    if (method === "OPTIONS") return res(200);

    // --- Respostas forçadas (Etapa 25: erro do banco, dado estranho)
    const forced = Object.entries(db.rpcOverride).find(([fn]) => url.includes(`/rest/v1/rpc/${fn}`));
    if (forced) return res(forced[1].status ?? 200, forced[1].body);

    // --- Auth
    if (url.includes("/auth/v1/token")) {
      // Link de recuperação (PKCE): troca o código por uma sessão.
      if (url.includes("grant_type=pkce")) {
        db.pkceExchanges = (db.pkceExchanges ?? 0) + 1;
        return res(200, { access_token: jwt, token_type: "bearer", expires_in: 3600, expires_at: now + 3600, refresh_token: "r1", user });
      }
      if (password != null && parse().password !== password) {
        return res(400, { code: 400, error_code: "invalid_credentials", msg: "Invalid login credentials" });
      }
      return res(200, { access_token: jwt, token_type: "bearer", expires_in: 3600, expires_at: now + 3600, refresh_token: "r1", user });
    }
    if (url.includes("/auth/v1/logout")) return res(204);
    if (url.includes("/auth/v1/user")) return res(200, user);

    // --- Perfis
    if (url.includes("/rest/v1/profiles")) {
      const id = eqParam(url, "id");
      return id ? res(200, db.profiles.find((p) => p.id === id)) : res(200, db.profiles);
    }

    // --- Dashboard do cliente (Etapa 19; mesmas regras das funções client_report_*)
    if (url.includes("/rest/v1/client_report_settings")) {
      const clientId = eqParam(url, "client_id");
      if (method === "GET") return res(200, db.reportSettings.find((r) => r.client_id === clientId) ?? null);
      if (!["admin", "gestor"].includes(role)) return res(403, { code: "42501", message: "new row violates row-level security policy" });
      if (method === "POST") {
        // upsert: só as colunas enviadas mudam (a logo continua)
        const row = parse();
        const old = db.reportSettings.find((r) => r.client_id === row.client_id);
        db.reportSettings = db.reportSettings.filter((r) => r.client_id !== row.client_id);
        db.reportSettings.push({ ...old, ...row, updated_at: new Date().toISOString() });
        return res(201);
      }
      if (method === "PATCH") {
        const row = db.reportSettings.find((r) => r.client_id === clientId);
        if (row) Object.assign(row, parse(), { updated_at: new Date().toISOString() });
        return res(204);
      }
    }
    // --- Logo (Storage público client-logos; só admin/gestor enviam e apagam)
    if (url.includes("/storage/v1/object") && !url.includes("/ops-files/")) {
      const path = decodeURIComponent(new URL(url).pathname.replace(/^.*\/storage\/v1\/object\/(public\/)?client-logos\/?/, ""));
      if (method === "GET") return db.storageObjects[path] ? { status: 200, body: undefined } : res(404, { message: "Object not found" });
      if (!["admin", "gestor"].includes(role)) return res(403, { statusCode: "403", error: "Unauthorized", message: "new row violates row-level security policy" });
      if (method === "POST" || method === "PUT") {
        db.storageObjects[path] = { size: rawBody?.length ?? 0 };
        return res(200, { Key: `client-logos/${path}` });
      }
      if (method === "DELETE") {
        const prefixes = parse().prefixes ?? [];
        for (const p of prefixes) delete db.storageObjects[p];
        return res(200, prefixes.map((name) => ({ name })));
      }
    }
    // --- Central de Operações (Etapa 36; mesmas regras de private.ops_can)
    const OPS_ALL = ["ops.access", "ops.kanban.view", "ops.tasks.create", "ops.tasks.edit", "ops.tasks.archive", "ops.tasks.assign",
      "ops.tasks.sector", "ops.cards.move", "ops.clients.view", "ops.history.edit", "ops.meetings.manage", "ops.dashboard.view", "ops.commercial"];
    const me = db.opsMembers[userId];
    const opsBase = role === "admin" ? [...OPS_ALL, "ops.admin"]
      : role !== "cliente" && me?.active && me.permissions.includes("ops.access") ? me.permissions : [];
    // "ops.am": Account Manager de algum cliente no fluxo (Etapa 36.3; vem do banco).
    const opsPerms = role !== "admin" && opsBase.length && Object.values(db.opsClientOps ?? {}).some((o) => o.am_user_id === userId)
      ? [...opsBase, "ops.am"] : opsBase;
    const opsDeny = (msg = "Só o administrador pode mudar a configuração da Central de Operações.") => res(403, { code: "42501", message: msg });
    const opsBad = (message) => res(400, { code: "22023", message });
    if (url.includes("/rest/v1/rpc/ops_my_permissions")) return res(200, opsPerms);
    const opsTask = handleOpsTasks({ db, url, method, parse, rawBody, role, userId, opsPerms, res });
    if (opsTask) return opsTask;
    if (url.includes("/rest/v1/ops_sectors")) {
      return res(200, opsPerms.includes("ops.access") ? [...db.opsSectors].sort((a, b) => a.position - b.position) : []);
    }
    if (url.includes("/rest/v1/rpc/ops_team")) {
      if (!opsPerms.includes("ops.access")) return res(200, []);
      return res(200, db.profiles.filter((p) => p.role !== "cliente" && (db.opsMembers[p.id] || role === "admin")).map((p) => {
        const m = db.opsMembers[p.id];
        return { user_id: p.id, full_name: p.full_name, email: p.email, role: p.role, profile_active: p.active, in_ops: Boolean(m),
          job_title: m?.job_title ?? null, member_active: m?.active ?? false, joins_meetings: m?.joins_meetings ?? false,
          primary_sector_id: m?.primary ?? null, secondary_sector_ids: m?.secondary ?? [], permissions: role === "admin" ? (m?.permissions ?? []) : null };
      }).sort((a, b) => a.full_name.localeCompare(b.full_name)));
    }
    if (url.includes("/rest/v1/rpc/ops_sector_save")) {
      const p = parse();
      if (role !== "admin") return opsDeny();
      if (db.opsSectors.some((x) => x.status !== "arquivado" && x.name.toLowerCase() === p.p_name.trim().toLowerCase() && x.id !== p.p_id)) {
        return opsBad("Já existe um setor com esse nome.");
      }
      db.rpcCalls.push({ fn: "ops_sector_save", ...p });
      if (p.p_id) Object.assign(db.opsSectors.find((x) => x.id === p.p_id), { name: p.p_name.trim(), color: p.p_color });
      else {
        const id = crypto.randomUUID();
        db.opsSectors.push({ id, name: p.p_name.trim(), color: p.p_color, position: Math.max(0, ...db.opsSectors.map((x) => x.position)) + 1, status: "ativo" });
        return res(200, id);
      }
      return res(200, p.p_id);
    }
    if (url.includes("/rest/v1/rpc/ops_sector_reorder")) {
      if (role !== "admin") return opsDeny();
      parse().p_ids.forEach((id, i) => { const x = db.opsSectors.find((y) => y.id === id); if (x) x.position = i + 1; });
      return res(204);
    }
    if (url.includes("/rest/v1/rpc/ops_sector_set_status")) {
      const p = parse();
      if (role !== "admin") return opsDeny();
      const members = Object.values(db.opsMembers).filter((m) => m.primary === p.p_id || m.secondary.includes(p.p_id));
      if (p.p_status !== "ativo" && members.length) {
        if (!p.p_move_to) return opsBad(`Este setor tem ${members.length} pessoa(s). Escolha para qual setor elas vão antes de desativar.`);
        for (const m of members) {
          if (m.primary === p.p_id) { m.primary = p.p_move_to; m.secondary = m.secondary.filter((s) => s !== p.p_move_to); }
          else m.secondary = [...new Set(m.secondary.map((s) => (s === p.p_id ? p.p_move_to : s)))].filter((s) => s !== m.primary);
        }
      }
      db.opsSectors.find((x) => x.id === p.p_id).status = p.p_status;
      db.rpcCalls.push({ fn: "ops_sector_set_status", ...p });
      return res(204);
    }
    if (url.includes("/rest/v1/rpc/ops_member_save")) {
      const p = parse();
      if (role !== "admin") return opsDeny();
      const prof = db.profiles.find((x) => x.id === p.p_user_id);
      if (!prof) return opsBad("Usuário não encontrado.");
      if (prof.role === "cliente") return opsBad("Usuários com papel Cliente não entram na Central de Operações.");
      if (!p.p_primary_sector) return opsBad("Escolha o setor principal.");
      db.opsMembers[p.p_user_id] = { primary: p.p_primary_sector, secondary: (p.p_secondary ?? []).filter((s) => s !== p.p_primary_sector),
        job_title: p.p_job_title, active: p.p_active, joins_meetings: p.p_joins_meetings, permissions: p.p_permissions ?? [] };
      db.rpcCalls.push({ fn: "ops_member_save", ...p });
      return res(204);
    }
    // --- E-mail semanal (Etapa 19.4)
    const canEditEmail = ["admin", "gestor"].includes(role);
    if (url.includes("/rest/v1/email_settings")) return res(200, role === "admin" ? db.emailSettings : null);
    if (url.includes("/rest/v1/rpc/email_settings_save")) {
      const p = parse();
      db.rpcCalls.push({ fn: "email_settings_save", ...p, p_api_key: p.p_api_key ? "***" : null });
      if (role !== "admin") return res(403, { code: "42501", message: "Só o administrador configura o envio de e-mails." });
      if (p.p_api_key != null && !/^re_[A-Za-z0-9_]{10,200}$/.test(p.p_api_key)) return res(400, { code: "22023", message: 'A chave do Resend começa com "re_". Confira e cole de novo.' });
      Object.assign(db.emailSettings, { from_name: p.p_from_name, from_email: p.p_from_email.toLowerCase(), reply_to: p.p_reply_to || null });
      if (p.p_api_key) {
        db.emailKey = p.p_api_key;
        Object.assign(db.emailSettings, { has_key: true, key_updated_at: new Date().toISOString(), last_test_at: null, last_test_ok: null, last_test_error: null });
      }
      return res(204);
    }
    if (url.includes("/rest/v1/rpc/email_settings_remove_key")) {
      if (role !== "admin") return res(403, { code: "42501", message: "Só o administrador configura o envio de e-mails." });
      db.emailKey = null;
      Object.assign(db.emailSettings, { has_key: false, key_updated_at: new Date().toISOString(), last_test_at: null, last_test_ok: null, last_test_error: null });
      return res(204);
    }
    if (url.includes("/rest/v1/client_report_email_log")) {
      const clientId = eqParam(url, "client_id");
      return res(200, db.clientEmailLog.filter((l) => l.client_id === clientId).sort((a, b) => b.id - a.id).slice(0, 10));
    }
    if (url.includes("/rest/v1/client_report_email")) {
      const clientId = eqParam(url, "client_id");
      if (method === "GET") return res(200, role === "cliente" ? null : db.clientEmails[clientId] ?? null);
      if (!canEditEmail) return res(403, { code: "42501", message: "new row violates row-level security policy" });
      const row = parse();
      if ((row.recipients ?? []).length > 10) return res(400, { code: "23514", message: "violates check constraint" });
      if (method === "POST") db.clientEmails[row.client_id] = { last_sent_at: null, ...row };
      else Object.assign(db.clientEmails[clientId], row);
      return res(method === "POST" ? 201 : 204);
    }
    const currentLink = (clientId) => {
      const t = db.emailLinks[clientId];
      const portal = db.portals[clientId];
      return t && portal?.link_enabled && portal.link_token === t && (!portal.link_expires_at || Date.parse(portal.link_expires_at) > Date.now()) ? t : null;
    };
    if (url.includes("/rest/v1/rpc/client_report_email_link_status")) {
      const p = parse();
      return res(200, !db.emailLinks[p.p_client_id] ? "sem_link" : currentLink(p.p_client_id) ? "ok" : "desatualizado");
    }
    if (url.includes("/rest/v1/rpc/client_report_email_set_link")) {
      const p = parse();
      if (!canEditEmail) return res(403, { code: "42501", message: "Sem permissão para mudar o e-mail deste cliente." });
      const token = (p.p_link ?? "").match(/\/r\/([A-Za-z0-9_-]{43})(?:[/?#].*)?$/)?.[1];
      if (!token) return res(400, { code: "22023", message: "Cole o link completo (…/r/código)." });
      const portal = db.portals[p.p_client_id];
      if (!portal?.link_enabled || portal.link_token !== token) {
        return res(400, { code: "22023", message: 'Este não é o link atual do cliente (ou o link está desligado). Gere/copie o link no card "Acesso do cliente".' });
      }
      db.emailLinks[p.p_client_id] = token;
      return res(204);
    }
    if (url.includes("/functions/v1/client-report-email")) {
      const b = parse();
      db.rpcCalls.push({ fn: "client-report-email", ...b });
      const fail = (status, code, message) => res(status, { error: { code, message } });
      if (b.action === "test_settings" ? role !== "admin" : !canEditEmail) return fail(403, "FORBIDDEN", "Você não tem permissão para esta ação.");
      if (!db.emailSettings.has_key) return fail(400, "EMAIL_NOT_CONFIGURED", "O envio de e-mails ainda não foi configurado (falta a chave do Resend em Configurações → Integrações).");
      const resend = (to, subject) => {
        if (db.emailResult !== "ok") return db.emailResult;
        db.emailsSent.push({ to, subject });
        return null;
      };
      if (b.action === "test_settings") {
        const err = resend(email, "Teste de envio · Backstage Flow");
        Object.assign(db.emailSettings, { last_test_at: new Date().toISOString(), last_test_ok: !err, last_test_error: err });
        return err ? fail(400, "EMAIL_SEND_FAILED", err) : res(200, { data: { sentTo: email } });
      }
      const client = db.clients.find((c) => c.id === b.clientId);
      if (!client) return fail(404, "NOT_FOUND", "Cliente não encontrado.");
      const today = new Intl.DateTimeFormat("en-CA", { timeZone: client.timezone }).format(new Date());
      const shift = (n) => new Date(Date.parse(`${today}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
      const week = { from: shift(-7), to: shift(-1) };
      const trigger = b.action === "test" ? "teste" : "manual";
      const log = (status, detail, n = 0) => {
        db.clientEmailLog.push({ id: db.clientEmailLog.length + 1, client_id: client.id, created_at: new Date().toISOString(), trigger, status,
          recipients: n, period_from: week.from, period_to: week.to, detail });
        return { status, detail, sent: n };
      };
      const cfg = db.clientEmails[client.id];
      const to = b.action === "test" ? [email] : (cfg?.recipients ?? []);
      if (!to.length) return res(200, { data: log("pulado", "Nenhum destinatário cadastrado.") });
      const hasData = reportRpc("client_report_accounts", { p_client_id: client.id, p_from: week.from, p_to: week.to }).some((a) => a.cur);
      if (!hasData) return res(200, { data: log("pulado", "Sem dados de anúncios nesta semana: nada foi enviado.") });
      const subject = `${b.action === "test" ? "[Teste] " : ""}${client.name}: resultados da semana`;
      const errors = to.map((t) => resend(t, subject)).filter(Boolean);
      const sent = to.length - errors.length;
      const r = log(sent ? "enviado" : "erro", errors.length ? `${sent} de ${to.length} enviados. ${errors[0]}` : `${sent} enviado(s).`, sent);
      return sent ? res(200, { data: r }) : fail(400, "EMAIL_SEND_FAILED", r.detail);
    }
    // Papel "cliente" só vê a empresa com o login ligado (Etapa 19.2).
    const clientVisible = (clientId) => role !== "cliente" ||
      (db.access.some((a) => a.user_id === userId && a.client_id === clientId) && Boolean(db.portals[clientId]?.login_enabled));
    // Link secreto (Edge Function client-report-link → public.client_report_public)
    if (url.includes("/functions/v1/client-report-link")) {
      const b = parse();
      const p = { p_token: b.token, p_period: b.period ?? null, p_from: b.from ?? null, p_to: b.to ?? null };
      db.rpcCalls.push({ fn: "client_report_public", ...p, p_token: p.p_token ? "***" : null });
      const clientId = db.portalTokens[p.p_token];
      const portal = clientId && db.portals[clientId];
      if (!portal || !portal.link_enabled || (portal.link_expires_at && Date.parse(portal.link_expires_at) <= Date.now())) {
        return res(404, { error: { code: "LINK_INVALID", message: "Este link não existe mais ou foi desativado. Peça um novo link para a agência." } });
      }
      const client = db.clients.find((c) => c.id === clientId);
      const settings = db.reportSettings.find((r) => r.client_id === clientId) ?? null;
      const today = new Intl.DateTimeFormat("en-CA", { timeZone: client.timezone }).format(new Date());
      const shift = (d, n) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
      let period, from, to;
      if (p.p_from || p.p_to) {
        if (!p.p_from || !p.p_to || p.p_to < p.p_from || p.p_to > today) {
          return res(400, { error: { code: "INVALID_PERIOD", message: "Período inválido (até 400 dias, sem datas futuras)." } });
        }
        period = "custom"; from = p.p_from; to = p.p_to;
      } else {
        period = p.p_period ?? settings?.default_period ?? "last_7_days";
        const month = `${today.slice(0, 7)}-01`;
        const prevMonth = new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 2, 1)).toISOString().slice(0, 10);
        [from, to] = { last_7_days: [shift(today, -7), shift(today, -1)], last_14_days: [shift(today, -14), shift(today, -1)],
          last_30_days: [shift(today, -30), shift(today, -1)], this_month: [month, today], last_month: [prevMonth, shift(month, -1)] }[period];
      }
      portal.link_uses += 1;
      portal.link_last_used_at = new Date().toISOString();
      const q = { p_client_id: clientId, p_from: from, p_to: to };
      const { client_id: _c, updated_by: _u, ...cleanSettings } = settings ?? {};
      return res(200, {
        client: { name: client.name, timezone: client.timezone }, settings: settings ? cleanSettings : null,
        period, from, to, today,
        accounts: reportRpc("client_report_accounts", q), daily: reportRpc("client_report_daily", q), campaigns: reportRpc("client_report_campaigns", q),
        breakdowns: reportRpc("client_report_breakdowns", q), breakdown_coverage: reportRpc("client_report_breakdown_coverage", { p_client_id: clientId }),
      });
    }
    if (url.includes("/rest/v1/rpc/client_report_")) {
      const p = parse();
      if (!clientVisible(p.p_client_id)) return res(200, []);
      return res(200, reportRpc(url.match(/rpc\/(client_report_\w+)/)[1], p));
    }
    if (url.includes("/rest/v1/client_portal")) {
      const clientId = eqParam(url, "client_id");
      if (role === "cliente") return res(200, null);
      const { link_token: _t, ...row } = db.portals[clientId] ?? {};
      return res(200, db.portals[clientId] ? row : null);
    }
    if (url.includes("/rest/v1/rpc/client_portal_set") || url.includes("/rest/v1/rpc/client_portal_new_link")) {
      const p = parse();
      if (!["admin", "gestor"].includes(role)) return res(403, { code: "42501", message: "Sem permissão para mudar o acesso deste cliente." });
      const portal = db.portals[p.p_client_id] ??= { client_id: p.p_client_id, login_enabled: false, link_enabled: false,
        link_created_at: null, link_expires_at: null, link_last_used_at: null, link_uses: 0 };
      if (url.includes("client_portal_set")) {
        db.rpcCalls.push({ fn: "client_portal_set", ...p });
        if (p.p_link_enabled && !portal.link_token) return res(400, { code: "22023", message: "Gere o link antes de ligá-lo." });
        if (p.p_login_enabled != null) portal.login_enabled = p.p_login_enabled;
        if (p.p_link_enabled != null) portal.link_enabled = p.p_link_enabled;
        return res(204);
      }
      db.rpcCalls.push({ fn: "client_portal_new_link", ...p });
      const bytes = crypto.getRandomValues(new Uint8Array(32));
      const token = btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
      if (portal.link_token) delete db.portalTokens[portal.link_token];
      db.portalTokens[token] = p.p_client_id;
      Object.assign(portal, { link_token: token, link_enabled: true, link_created_at: new Date().toISOString(), link_uses: 0, link_last_used_at: null,
        link_expires_at: p.p_valid_days ? new Date(Date.now() + p.p_valid_days * 86_400_000).toISOString() : null });
      return res(200, token);
    }

    // --- Clientes
    if (url.includes("/rest/v1/clients")) {
      const id = eqParam(url, "id");
      if (method === "GET") {
        if (id) return res(200, clientVisible(id) ? db.clients.find((c) => c.id === id) ?? null : null);
        return res(200, db.clients.filter((c) => clientVisible(c.id)).sort((a, b) => a.name.localeCompare(b.name)));
      }
      if (method === "POST") {
        const row = parse();
        if (row.cnpj && db.clients.some((c) => c.cnpj === row.cnpj)) {
          return res(409, { code: "23505", message: 'duplicate key value violates unique constraint "clients_cnpj_key"' });
        }
        db.clients.push({ is_demo: false, created_by: userId, created_at: new Date().toISOString(), updated_at: "", ...row });
        return res(201);
      }
      if (method === "PATCH") {
        const client = db.clients.find((c) => c.id === id);
        Object.assign(client, parse());
        return res(204);
      }
    }

    // --- Acessos
    if (url.includes("/rest/v1/user_client_access")) {
      const clientId = eqParam(url, "client_id");
      if (method === "GET") {
        return res(200, db.access.filter((a) => a.client_id === clientId).map((a) => ({
          user_id: a.user_id,
          created_at: a.created_at,
          profile: db.profiles.find((p) => p.id === a.user_id) ?? null,
        })));
      }
      if (method === "POST") {
        db.access.push({ ...parse(), created_at: new Date().toISOString() });
        return res(201);
      }
      if (method === "DELETE") {
        const userId = eqParam(url, "user_id");
        db.access = db.access.filter((a) => !(a.user_id === userId && a.client_id === clientId));
        return res(204);
      }
    }

    // --- Conexões (o site só lê)
    if (url.includes("/rest/v1/platform_connections")) {
      const platform = eqParam(url, "platform_id");
      return res(200, db.connections.filter((c) => !platform || c.platform_id === platform));
    }

    // --- Contas de anúncio (o site só lê)
    if (url.includes("/rest/v1/ad_accounts")) {
      const clientId = eqParam(url, "client_id");
      const platform = eqParam(url, "platform_id");
      return res(200, db.adAccounts.filter((a) => (!clientId || a.client_id === clientId) && (!platform || a.platform_id === platform) && !a.unlinked_at));
    }

    // --- Campanhas (o site só lê)
    if (url.includes("/rest/v1/campaigns")) {
      const id = eqParam(url, "id");
      if (id) return res(200, db.campaigns.find((c) => c.id === id) ?? null);
      const accountId = eqParam(url, "ad_account_id");
      const clientId = eqParam(url, "client_id");
      const platform = eqParam(url, "platform_id");
      return res(200, db.campaigns.filter((c) =>
        (!accountId || c.ad_account_id === accountId) && (!clientId || c.client_id === clientId) && (!platform || c.platform_id === platform)));
    }

    // --- Central de alertas
    if (url.includes("/rest/v1/rpc/refresh_alerts")) {
      db.rpcCalls.push({ fn: "refresh_alerts" });
      if (!["admin", "gestor", "operador"].includes(role)) return res(403, { code: "42501", message: "Sem permissão para verificar alertas" });
      const r = db.alertRefresh ? db.alertRefresh(db) : { created: 0, updated: db.alerts.filter((a) => a.status !== "resolvido").length, resolved: 0 };
      return res(200, { ...r, checked_at: new Date().toISOString() });
    }
    if (url.includes("/rest/v1/rpc/set_alert_status")) {
      const p = parse();
      db.rpcCalls.push({ fn: "set_alert_status", ...p });
      if (!["admin", "gestor", "operador"].includes(role)) return res(403, { code: "42501", message: "Sem permissão para alterar alertas" });
      const a = db.alerts.find((x) => x.id === p.p_id);
      if (!a) return res(404, { code: "P0002", message: "Alerta não encontrado" });
      if (a.status === "resolvido") return res(400, { code: "22023", message: "Alerta já resolvido" });
      const now = new Date().toISOString();
      if (p.p_status === "visto") Object.assign(a, { status: "visto", seen_at: now });
      if (p.p_status === "aberto") Object.assign(a, { status: "aberto", seen_at: null });
      if (p.p_status === "resolvido") Object.assign(a, { status: "resolvido", resolved_at: now, resolution: "manual" });
      return res(200, a);
    }
    if (url.includes("/rest/v1/alerts")) {
      const statusParam = new URL(url).searchParams.get("status");
      const allowed = !statusParam ? null : statusParam.startsWith("in.(") ? statusParam.slice(4, -1).split(",") : [statusParam.replace(/^eq\./, "")];
      const rows = db.alerts
        .filter((a) => !allowed || allowed.includes(a.status))
        .sort((x, y) => y.first_seen_at.localeCompare(x.first_seen_at))
        .map((a) => {
          const acc = db.adAccounts.find((x) => x.id === a.ad_account_id);
          return { ...a,
            clients: { name: db.clients.find((c) => c.id === a.client_id)?.name ?? "" },
            ad_accounts: acc ? { name: acc.name, external_id: acc.external_id } : null,
            campaigns: a.campaign_id ? { name: db.campaigns.find((c) => c.id === a.campaign_id)?.name ?? "" } : null };
        });
      return res(200, rows);
    }

    // --- Tracking (Etapa 34)
    if (url.includes("/rest/v1/tracking_containers")) {
      const withClient = (c) => ({ ...c, clients: { name: db.clients.find((x) => x.id === c.client_id)?.name ?? "" } });
      if (method === "GET") return res(200, db.trackingContainers.map(withClient));
      if (method === "POST") {
        const row = parse();
        if (!["admin", "gestor"].includes(role)) return res(403, { code: "42501", message: "new row violates row-level security policy" });
        const id = crypto.randomUUID();
        const key = "bf_" + Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, "0")).join("");
        const created = { id, public_key: key, created_at: new Date().toISOString(), ...row };
        db.trackingContainers.push(created);
        db.rpcCalls.push({ fn: "tracking_containers.insert", ...row });
        return res(201, { id });
      }
      if (method === "PATCH") {
        const c = db.trackingContainers.find((x) => x.id === eqParam(url, "id"));
        Object.assign(c, parse());
        db.rpcCalls.push({ fn: "tracking_containers.update", id: c.id });
        return res(204);
      }
    }
    if (url.includes("/rest/v1/rpc/tracking_overview")) {
      const p = parse();
      const inRange = (t) => t >= p.p_from && t < p.p_to;
      return res(200, db.trackingContainers.map((c) => {
        const ev = db.trackingEvents.filter((e) => e.container_id === c.id);
        const sessions = new Map();
        for (const e of ev) if (!sessions.has(e.session_id)) sessions.set(e.session_id, e);
        const started = [...sessions.values()].filter((e) => inRange(e.occurred_at));
        const touchOf = (e) => db.trackingTouchpoints.find((t) => t.id === e.touchpoint_id);
        return {
          container_id: c.id,
          sessions: started.length,
          visitors: new Set(started.map((e) => e.visitor_id)).size,
          pageviews: ev.filter((e) => e.event_name === "PageView" && inRange(e.occurred_at)).length,
          events: ev.filter((e) => inRange(e.occurred_at)).length,
          paid_sessions: started.filter((e) => touchOf(e)?.paid === true).length,
          unknown_origin_sessions: started.filter((e) => !touchOf(e) || touchOf(e).evidence === "desconhecida").length,
          last_event_at: ev.length ? ev.map((e) => e.occurred_at).sort().at(-1) : null,
        };
      }));
    }
    if (url.includes("/rest/v1/rpc/tracking_conversions_summary")) {
      const p = parse();
      const inRange = (t) => t >= p.p_from && t < p.p_to;
      const conv = ["Lead", "CompleteRegistration", "SubmitApplication", "Schedule", "Purchase"];
      const rows = [];
      for (const c of db.trackingContainers) {
        const ev = db.trackingEvents.filter((e) => e.container_id === c.id && conv.includes(e.event_name) && inRange(e.occurred_at));
        if (ev.length) rows.push({ container_id: c.id, currency: null, leads: ev.filter((e) => e.event_name === "Lead").length, conversions: ev.length, purchases: 0, revenue_micros: 0 });
        const byCur = new Map();
        for (const pu of db.trackingPurchases.filter((x) => x.container_id === c.id && inRange(x.occurred_at))) {
          const r = byCur.get(pu.currency) ?? { container_id: c.id, currency: pu.currency, leads: 0, conversions: 0, purchases: 0, revenue_micros: 0 };
          r.purchases += 1;
          r.revenue_micros += pu.value_micros;
          byCur.set(pu.currency, r);
        }
        rows.push(...byCur.values());
      }
      return res(200, rows);
    }
    if (url.includes("/rest/v1/rpc/tracking_lead_journey")) {
      return res(200, db.trackingJourneys[parse().p_lead_id] ?? []);
    }
    if (url.includes("/rest/v1/tracking_destinations")) {
      return res(200, db.trackingDestinations.map(({ token: _t, ...d }) => ({ ...d, has_token: db.capiTokens[d.id] != null })));
    }
    if (url.includes("/rest/v1/rpc/tracking_capi_overview")) {
      return res(200, db.trackingDestinations.map((d) => ({ destination_id: d.id, pending: d.pending ?? 0, sent_24h: d.sent_24h ?? 0, errors_24h: d.errors_24h ?? 0, discarded_24h: 0, last_sent_at: d.last_success_at ?? null })));
    }
    if (url.includes("/rest/v1/tracking_capi_log")) {
      const dest = eqParam(url, "destination_id");
      return res(200, db.trackingCapiLog.filter((l) => l.destination_id === dest).sort((a, b) => b.requested_at.localeCompare(a.requested_at)).slice(0, 10));
    }
    if (url.includes("/rest/v1/tracking_whatsapp_clicks")) {
      return res(200, [...db.whatsappClicks].sort((a, b) => b.clicked_at.localeCompare(a.clicked_at)).map((c) => ({ ...c, touch: c.touch ?? null })));
    }
    if (url.includes("/rest/v1/tracking_whatsapp_connections")) {
      return res(200, db.whatsappConnections.map((w) => ({ ...w, has_app_secret: db.waSecrets[w.id]?.app != null })));
    }
    if (url.includes("/rest/v1/tracking_whatsapp_conversations")) {
      return res(200, [...db.whatsappConversations].sort((a, b) => b.last_message_at.localeCompare(a.last_message_at)).map((c) => ({ ...c, touch: c.touch ?? null })));
    }
    if (url.includes("/rest/v1/rpc/tracking_attribution")) {
      const model = parse().p_model === "first" ? "first" : "last";
      return res(200, db.trackingAttribution[model] ?? []);
    }
    if (url.includes("/rest/v1/rpc/tracking_quality")) {
      return res(200, db.trackingQuality);
    }
    if (url.includes("/rest/v1/rpc/tracking_whatsapp_lookup")) {
      let code = String(parse().p_code ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
      if (code.length === 9 && code.startsWith("REF")) code = code.slice(3);
      const c = db.whatsappClicks.find((x) => x.code === code);
      if (!c) return res(200, []);
      const k = db.trackingContainers.find((x) => x.id === c.container_id);
      return res(200, [{ id: c.id, code: c.code, container_id: c.container_id, client_id: k?.client_id, container_name: k?.name ?? "", clicked_at: c.clicked_at,
        page_url: c.page_url ?? null, status: c.status, sales: c.sales, lead_marked_at: null, test: c.test,
        channel: c.touch?.channel ?? null, paid: c.touch?.paid ?? null, evidence: c.touch?.evidence ?? null, reason: c.touch?.reason ?? null, campaign: c.touch?.utm_campaign ?? null }]);
    }
    if (url.includes("/rest/v1/tracking_leads")) {
      return res(200, [...db.trackingLeads].sort((a, b) => b.last_converted_at.localeCompare(a.last_converted_at)).slice(0, 50));
    }
    if (url.includes("/rest/v1/tracking_touchpoints")) {
      return res(200, [...db.trackingTouchpoints].sort((a, b) => b.occurred_at.localeCompare(a.occurred_at)).slice(0, 50));
    }
    if (url.includes("/rest/v1/tracking_events")) {
      return res(200, [...db.trackingEvents].sort((a, b) => b.occurred_at.localeCompare(a.occurred_at)).slice(0, 50));
    }

    // --- Estrutura por plataforma (mesma regra de public.platform_structure)
    if (url.includes("/rest/v1/rpc/platform_structure")) {
      const p = parse();
      db.rpcCalls.push({ fn: "platform_structure", ...p });
      const accs = new Set(db.adAccounts.filter((a) => a.platform_id === p.p_platform && !a.unlinked_at &&
        (!p.p_client_ids || p.p_client_ids.includes(a.client_id)) && (!p.p_ad_account_ids || p.p_ad_account_ids.includes(a.id))).map((a) => a.id));
      const accountOf = (x) => x.ad_account_id ?? db.campaigns.find((c) => c.id === x.campaign_id)?.ad_account_id;
      const out = [];
      for (const [level, list] of [["campaign", db.campaigns], ["ad_group", db.adGroups], ["ad", db.ads]]) {
        const counts = {};
        for (const x of list) {
          const campaignId = level === "campaign" ? x.id : x.campaign_id;
          if (!accs.has(accountOf(x)) || (p.p_campaign_ids && !p.p_campaign_ids.includes(campaignId))) continue;
          counts[x.status] = (counts[x.status] ?? 0) + 1;
        }
        for (const [status, total] of Object.entries(counts)) out.push({ level, status, total });
      }
      return res(200, out);
    }

    // --- Alcance por período (tabela public.period_reach, lida direto com o RLS)
    if (url.includes("/rest/v1/period_reach")) {
      const f = (k) => eqParam(url, k);
      db.reachQueries = (db.reachQueries ?? 0) + 1;
      return res(200, (db.reachRows ?? []).filter((r) => r.ad_account_id === f("ad_account_id") && r.level === f("level") &&
        r.entity_external_id === f("entity_external_id") && r.period_start === f("period_start") && r.period_end === f("period_end")));
    }

    // --- Saldo das contas (mesma regra de public.account_balances)
    if (url.includes("/rest/v1/rpc/account_balances")) return res(200, balanceRows(parse()));

    // --- Saúde das contas (mesma regra de public.account_health)
    if (url.includes("/rest/v1/rpc/account_health")) {
      const p = parse();
      return res(200, balanceRows({ ...p, p_ad_account_ids: null }).map((b) => {
        const a = db.adAccounts.find((x) => x.id === b.ad_account_id);
        const sync = db.syncState[a.id] ?? { status: "pendente" };
        const conn = db.connections.find((c) => c.id === a.connection_id);
        return {
          ...b, raw_status: a.raw_status ?? null, status_reason: a.status_reason ?? null, is_test_account: a.is_test_account ?? null,
          details_updated_at: a.details_updated_at ?? null, sync_status: sync.status, last_attempt_at: sync.last_attempt_at ?? null,
          last_success_at: sync.last_success_at ?? null, last_error_message: sync.last_error_message ?? null,
          connection_id: a.connection_id ?? null, connection_status: conn?.status ?? null, connection_error: conn?.last_error ?? null,
        };
      }));
    }

    if (url.includes("/rest/v1/ad_groups")) {
      const id = eqParam(url, "id");
      return res(200, db.adGroups.find((g) => g.id === id) ?? null);
    }
    if (url.includes("/rest/v1/entity_changes")) {
      const level = eqParam(url, "entity_level");
      const id = eqParam(url, "entity_id");
      return res(200, db.entityChanges.filter((c) => c.entity_level === level && c.entity_id === id)
        .sort((a, b) => b.detected_at.localeCompare(a.detected_at)));
    }

    // --- Campanha, conjunto/grupo ou anúncio (mesma regra de public.entity_rows)
    if (url.includes("/rest/v1/rpc/entity_rows")) {
      const p = parse();
      db.rpcCalls.push({ fn: "entity_rows", ...p });
      const source = { campaign: db.campaigns, ad_group: db.adGroups, ad: db.ads }[p.p_level];
      const parentKey = { campaign: null, ad_group: "campaign_id", ad: "ad_group_id" }[p.p_level];
      const metricKey = { campaign: "campaign_id", ad_group: "ad_group_id", ad: "ad_id" }[p.p_level];
      const q = p.p_search?.trim().toLowerCase();
      const sum = (list, k) => (list.length && !list.every((m) => m[k] == null) ? list.reduce((t, m) => t + (m[k] ?? 0), 0) : null);
      const div = (a, b, f = 1) => (a != null && b ? (a * f) / b : null);
      let rows = source
        .filter((e) => (!p.p_ids || p.p_ids.includes(e.id)) && (!p.p_parent_id || e[parentKey] === p.p_parent_id) &&
          (!p.p_statuses || p.p_statuses.includes(e.status)) && (!q || e.name.toLowerCase().includes(q) || e.external_id === p.p_search.trim()))
        .map((e) => {
          const acc = db.adAccounts.find((a) => a.id === e.ad_account_id);
          const ms = db.metrics.filter((m) => m.level === p.p_level && m[metricKey] === e.id && m.date >= p.p_from && m.date <= p.p_to);
          const has = ms.length > 0;
          const t = Object.fromEntries(["spend_micros", "impressions", "clicks", "leads", "messages", "conversions", "conversion_value_micros"].map((k) => [k, has ? sum(ms, k) : null]));
          return {
            id: e.id, level: p.p_level, name: e.name, external_id: e.external_id, parent_id: parentKey ? e[parentKey] : null,
            campaign_id: p.p_level === "campaign" ? e.id : e.campaign_id, client_id: e.client_id, platform_id: e.platform_id,
            ad_account_id: e.ad_account_id, currency: acc?.currency ?? null, status: e.status, raw_status: null,
            detail: e.objective ?? e.optimization_goal ?? e.creative_type ?? null, review_status: e.review_status ?? null,
            thumbnail_url: e.thumbnail_url ?? null, budget_micros: e.budget_micros ?? null, budget_period: e.budget_period ?? null,
            has_data: has, ...t, reach: null, frequency: null,
            ctr: div(t.clicks, t.impressions, 100), cpc_micros: div(t.spend_micros, t.clicks), cpm_micros: div(t.spend_micros, t.impressions, 1000),
            cpl_micros: div(t.spend_micros, t.leads), cpa_micros: div(t.spend_micros, t.conversions),
            roas: t.conversion_value_micros ? div(t.conversion_value_micros, t.spend_micros) : null,
          };
        });
      const keyOf = { name: "name", status: "status", budget: "budget_micros", spend: "spend_micros", impressions: "impressions", clicks: "clicks",
        ctr: "ctr", cpc: "cpc_micros", cpm: "cpm_micros", leads: "leads", conversions: "conversions", cpl: "cpl_micros", cpa: "cpa_micros", roas: "roas" }[p.p_sort] ?? "spend_micros";
      const desc = p.p_desc ?? true;
      rows.sort((a, b) => {
        const x = a[keyOf], y = b[keyOf];
        if (x == null && y == null) return a.name.localeCompare(b.name);
        if (x == null) return 1;
        if (y == null) return -1;
        const cmp = typeof x === "string" ? x.toLowerCase().localeCompare(y.toLowerCase()) : x - y;
        return (desc ? -cmp : cmp) || a.name.localeCompare(b.name);
      });
      const total = rows.length;
      rows = rows.slice(p.p_offset ?? 0, (p.p_offset ?? 0) + (p.p_limit ?? 50)).map((r) => ({ ...r, total_count: total }));
      return res(200, rows);
    }

    // --- Tabela de campanhas (mesma regra de public.campaign_table)
    if (url.includes("/rest/v1/rpc/campaign_table")) {
      const p = parse();
      db.rpcCalls.push({ fn: "campaign_table", ...p });
      const q = p.p_search?.trim().toLowerCase();
      const sum = (list, k) => (list.length && !list.every((m) => m[k] == null) ? list.reduce((t, m) => t + (m[k] ?? 0), 0) : null);
      const div = (a, b, f = 1) => (a != null && b ? (a * f) / b : null);
      let rows = db.campaigns
        .filter((c) => (!p.p_client_ids || p.p_client_ids.includes(c.client_id)) && (!p.p_platforms || p.p_platforms.includes(c.platform_id)) &&
          (!p.p_ad_account_ids || p.p_ad_account_ids.includes(c.ad_account_id)) && (!p.p_statuses || p.p_statuses.includes(c.status)))
        .map((c) => {
          const acc = db.adAccounts.find((a) => a.id === c.ad_account_id);
          const client = db.clients.find((x) => x.id === c.client_id);
          const ms = db.metrics.filter((m) => m.level === "campaign" && m.campaign_id === c.id && m.date >= p.p_from && m.date <= p.p_to);
          const has = ms.length > 0;
          const t = Object.fromEntries(["spend_micros", "impressions", "clicks", "leads", "messages", "conversions", "conversion_value_micros"].map((k) => [k, has ? sum(ms, k) : null]));
          const reach = (db.periodReach ?? []).find((r) => r.campaign_id === c.id && r.period_start === p.p_from && r.period_end === p.p_to)?.reach ?? null;
          return {
            campaign_id: c.id, name: c.name, external_id: c.external_id ?? c.id, client_id: c.client_id, client_name: client?.name ?? "",
            platform_id: c.platform_id, ad_account_id: c.ad_account_id, account_name: acc?.name ?? "", currency: acc?.currency ?? null,
            objective: c.objective ?? null, status: c.status, raw_status: null, budget_micros: c.budget_micros ?? null, budget_period: c.budget_period ?? null,
            has_data: has, ...t, reach, frequency: reach ? t.impressions / reach : null,
            ctr: div(t.clicks, t.impressions, 100), cpc_micros: div(t.spend_micros, t.clicks), cpm_micros: div(t.spend_micros, t.impressions, 1000),
            cpl_micros: div(t.spend_micros, t.leads), cpa_micros: div(t.spend_micros, t.conversions),
            roas: t.conversion_value_micros ? div(t.conversion_value_micros, t.spend_micros) : null,
          };
        })
        .filter((r) => !q || r.name.toLowerCase().includes(q) || r.client_name.toLowerCase().includes(q) || r.external_id === p.p_search.trim());
      const keyOf = { name: "name", platform: "platform_id", objective: "objective", status: "status", budget: "budget_micros", spend: "spend_micros",
        impressions: "impressions", reach: "reach", frequency: "frequency", clicks: "clicks", ctr: "ctr", cpc: "cpc_micros", cpm: "cpm_micros",
        leads: "leads", messages: "messages", conversions: "conversions", cpl: "cpl_micros", cpa: "cpa_micros", roas: "roas" }[p.p_sort];
      rows.sort((a, b) => {
        const x = a[keyOf], y = b[keyOf];
        if (x == null && y == null) return a.name.localeCompare(b.name);
        if (x == null) return 1;
        if (y == null) return -1;
        const cmp = typeof x === "string" ? x.toLowerCase().localeCompare(y.toLowerCase()) : x - y;
        return (p.p_desc ? -cmp : cmp) || a.name.localeCompare(b.name);
      });
      const total = rows.length;
      rows = rows.slice(p.p_offset, p.p_offset + p.p_limit).map((r) => ({ ...r, total_count: total }));
      return res(200, rows);
    }

    // --- Série no tempo do gráfico (mesma regra de public.dashboard_timeseries)
    if (url.includes("/rest/v1/rpc/dashboard_timeseries")) {
      const p = parse();
      db.rpcCalls.push({ fn: "dashboard_timeseries", ...p });
      const byCampaign = Boolean(p.p_campaign_ids || p.p_campaign_statuses);
      const monday = (d) => { const t = new Date(`${d}T00:00:00Z`); t.setUTCDate(t.getUTCDate() - ((t.getUTCDay() + 6) % 7)); return t.toISOString().slice(0, 10); };
      const bucketOf = (d) => (p.p_granularity === "day" ? d : p.p_granularity === "week" ? monday(d) : `${d.slice(0, 7)}-01`);
      const rows = db.metrics.filter((m) => {
        const campaign = db.campaigns.find((c) => c.id === m.campaign_id);
        return m.level === (byCampaign ? "campaign" : "account") && m.date >= p.p_from && m.date <= p.p_to &&
          (!p.p_client_ids || p.p_client_ids.includes(m.client_id)) && (!p.p_platforms || p.p_platforms.includes(m.platform_id)) &&
          (!p.p_ad_account_ids || p.p_ad_account_ids.includes(m.ad_account_id)) && (!p.p_campaign_ids || p.p_campaign_ids.includes(m.campaign_id)) &&
          (!p.p_campaign_statuses || p.p_campaign_statuses.includes(campaign?.status));
      });
      const groups = Map.groupBy(rows, (m) => `${bucketOf(m.date)}|${p.p_by_platform ? m.platform_id : ""}|${m.currency}`);
      const sum = (list, k) => (list.every((r) => r[k] == null) ? null : list.reduce((t, r) => t + (r[k] ?? 0), 0));
      const out = [...groups].map(([key, list]) => {
        const [bucket, platform, currency] = key.split("|");
        const entities = new Set(list.map((m) => (byCampaign ? m.campaign_id : m.ad_account_id)));
        return {
          bucket, platform_id: platform || null, currency,
          ...Object.fromEntries(["spend_micros", "impressions", "clicks", "link_clicks", "leads", "messages", "conversions", "conversion_value_micros"].map((k) => [k, sum(list, k)])),
          reach: p.p_granularity === "day" && entities.size === 1 ? sum(list, "reach") : null,
          days_with_data: new Set(list.map((m) => m.date)).size,
        };
      }).sort((a, b) => a.bucket.localeCompare(b.bucket));
      return res(200, out);
    }

    // --- Resumo do dashboard (mesma regra de public.dashboard_summary)
    if (url.includes("/rest/v1/rpc/dashboard_summary")) {
      const p = parse();
      db.rpcCalls.push(p);
      const byCampaign = Boolean(p.p_campaign_ids || p.p_campaign_statuses);
      const rows = db.metrics.filter((m) => {
        const campaign = db.campaigns.find((c) => c.id === m.campaign_id);
        return m.level === (byCampaign ? "campaign" : "account") && m.date >= p.p_from && m.date <= p.p_to &&
          (!p.p_client_ids || p.p_client_ids.includes(m.client_id)) &&
          (!p.p_platforms || p.p_platforms.includes(m.platform_id)) &&
          (!p.p_ad_account_ids || p.p_ad_account_ids.includes(m.ad_account_id)) &&
          (!p.p_campaign_ids || p.p_campaign_ids.includes(m.campaign_id)) &&
          (!p.p_campaign_statuses || p.p_campaign_statuses.includes(campaign?.status));
      });
      const sum = (list, key) => (list.every((r) => r[key] == null) ? null : list.reduce((t, r) => t + (r[key] ?? 0), 0));
      const groups = Map.groupBy(rows, (r) => r.currency);
      const out = [...groups].map(([currency, list]) => ({
        currency, source_level: byCampaign ? "campaign" : "account",
        ...Object.fromEntries(["spend_micros", "impressions", "clicks", "link_clicks", "leads", "messages", "conversions", "conversion_value_micros"].map((k) => [k, sum(list, k)])),
        accounts: new Set(list.map((r) => r.ad_account_id)).size,
        campaigns: new Set(list.map((r) => r.campaign_id).filter(Boolean)).size,
        days_with_data: new Set(list.map((r) => r.date)).size,
        last_synced_at: db.lastSyncedAt ?? "2026-09-23T22:10:00Z",
      })).sort((a, b) => b.spend_micros - a.spend_micros);
      return res(200, out);
    }

    // --- Visão executiva (mesma regra de public.executive_breakdown)
    if (url.includes("/rest/v1/rpc/executive_breakdown")) {
      const p = parse();
      db.rpcCalls.push({ fn: "executive_breakdown", ...p });
      const rows = db.metrics.filter((m) => m.level === "account" && m.date >= p.p_from && m.date <= p.p_to &&
        (!p.p_client_ids || p.p_client_ids.includes(m.client_id)) &&
        (!p.p_platforms || p.p_platforms.includes(m.platform_id)));
      const sum = (list, key) => (list.every((r) => r[key] == null) ? null : list.reduce((t, r) => t + (r[key] ?? 0), 0));
      const groups = Map.groupBy(rows, (r) => `${r.client_id}|${r.platform_id}|${r.currency}`);
      const out = [...groups.values()].map((list) => ({
        client_id: list[0].client_id,
        client_name: db.clients.find((c) => c.id === list[0].client_id)?.name ?? "",
        platform_id: list[0].platform_id,
        currency: list[0].currency,
        ...Object.fromEntries(["spend_micros", "leads", "messages", "conversions", "conversion_value_micros"].map((k) => [k, sum(list, k)])),
        accounts: new Set(list.map((r) => r.ad_account_id)).size,
      })).sort((a, b) => b.spend_micros - a.spend_micros);
      return res(200, out);
    }

    // --- Sincronização
    if (url.includes("/rest/v1/rpc/sync_overview")) {
      db.rpcCalls.push({ fn: "sync_overview" });
      const rows = db.adAccounts.filter((a) => !a.unlinked_at).map((a) => {
        const s = db.syncState[a.id] ?? {};
        const r = db.syncRuns.filter((x) => x.ad_account_id === a.id).sort((x, y) => y.started_at.localeCompare(x.started_at))[0];
        return {
          ad_account_id: a.id, client_id: a.client_id, client_name: db.clients.find((c) => c.id === a.client_id)?.name ?? "",
          platform_id: a.platform_id, external_id: a.external_id, name: a.name,
          is_test_account: !!a.is_test_account, has_connection: !!a.connection_id,
          status: s.status ?? "pendente", last_attempt_at: s.last_attempt_at ?? null, last_success_at: s.last_success_at ?? null,
          next_run_at: s.next_run_at ?? null, last_error_message: s.last_error_message ?? null, running: !!s.running,
          run_status: r?.status ?? null, run_started_at: r?.started_at ?? null, run_finished_at: r?.finished_at ?? null,
          run_duration_ms: r?.duration_ms ?? null, run_records: r?.records_updated ?? null, run_trigger: r?.trigger ?? null, run_error: r?.error_message ?? null,
        };
      }).sort((x, y) => x.client_name.localeCompare(y.client_name) || x.platform_id.localeCompare(y.platform_id) || x.name.localeCompare(y.name));
      return res(200, rows);
    }
    if (url.includes("/rest/v1/sync_runs")) {
      const q = new URL(url).searchParams;
      const val = (k) => q.get(k)?.replace(/^(eq|gte|lt)\./, "");
      const limit = Number(q.get("limit") ?? 50);
      const byId = q.get("order")?.startsWith("id");
      const rows = [...db.syncRuns]
        .filter((x) => (!q.get("status") || x.status === val("status")) && (!q.get("client_id") || x.client_id === val("client_id")) &&
          (!q.get("started_at") || x.started_at >= val("started_at")) && (!q.get("id") || x.id < Number(val("id"))))
        .sort((x, y) => (byId ? y.id - x.id : y.started_at.localeCompare(x.started_at)))
        .slice(0, limit)
        .map((x) => {
          const acc = db.adAccounts.find((a) => a.id === x.ad_account_id);
          return { ...x, ad_accounts: acc ? { name: acc.name, external_id: acc.external_id } : null, clients: { name: db.clients.find((c) => c.id === x.client_id)?.name ?? "" } };
        });
      return res(200, rows);
    }
    // --- Logs (Etapa 17)
    if (url.includes("/rest/v1/rpc/log_auth_event")) {
      db.authEvents.push(parse().p_event);
      return res(200, null);
    }
    // --- Erros técnicos (Etapa 25): o site registra; só o administrador lê
    if (url.includes("/rest/v1/rpc/log_client_error")) {
      const p = parse();
      db.errorLogs.push({ id: 1000 + db.errorLogs.length, occurred_at: new Date().toISOString(), source: "site", code: p.p_code, user_message: p.p_user_message,
        technical: p.p_technical, context: p.p_context ?? {}, user_id: userId, user_name: fullName, ad_account_id: null, account_name: null, client_id: null, client_name: null });
      return res(200, true);
    }
    if (url.includes("/rest/v1/rpc/error_log_list")) {
      const p = parse();
      db.rpcCalls.push({ fn: "error_log_list", ...p });
      if (role !== "admin") return res(200, []);
      const rows = [...db.errorLogs]
        .filter((l) => (!p.p_from || l.occurred_at >= p.p_from) && (!p.p_source || l.source === p.p_source) && (!p.p_before_id || l.id < p.p_before_id))
        .sort((x, y) => y.id - x.id)
        .slice(0, p.p_limit ?? 100);
      return res(200, rows);
    }
    // --- Histórico (Etapa 23): até onde vai o histórico de cada conta
    if (url.includes("/rest/v1/rpc/history_coverage")) {
      const p = parse();
      db.rpcCalls.push({ fn: "history_coverage", ...p });
      const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
      const [y, mo] = today.split("-").map(Number);
      const t = y * 12 + (mo - 1) - 12;
      const target = `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}-01`;
      const rows = db.adAccounts
        .filter((a) => !a.unlinked_at && (!p.p_client_ids || p.p_client_ids.includes(a.client_id)) &&
          (!p.p_platforms || p.p_platforms.includes(a.platform_id)) && (!p.p_ad_account_ids || p.p_ad_account_ids.includes(a.id)))
        .map((a) => {
          const c = db.coverage[a.id] ?? {};
          return {
            ad_account_id: a.id, name: a.name, client_id: a.client_id, client_name: db.clients.find((x) => x.id === a.client_id)?.name ?? "",
            platform_id: a.platform_id, currency: a.currency, history_from: c.history_from ?? null, history_to: c.history_to ?? null,
            target, importing: c.importing ?? false, backfill_error: c.backfill_error ?? null,
          };
        });
      return res(200, rows);
    }
    // --- Busca global (Etapa 22): mesma regra de public.global_search
    if (url.includes("/rest/v1/rpc/global_search")) {
      const p = parse();
      db.rpcCalls.push({ fn: "global_search", ...p });
      if (role === "cliente") return res(200, []);
      const norm = (t) => (t ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
      const q = norm(p.p_query.trim());
      if (q.length < 2) return res(200, []);
      const id = p.p_query.trim().replace(/^act_/, "");
      const lim = Math.min(Math.max(p.p_limit ?? 5, 1), 20);
      const hit = (x) => norm(x.name).includes(q) || x.external_id === id;
      const clientName = (cid) => db.clients.find((c) => c.id === cid)?.name ?? "";
      const pick = (list) => list.filter(hit).slice(0, lim);
      const rows = [
        ...db.clients.filter((c) => norm(c.name).includes(q) || norm(c.company).includes(q)).slice(0, lim)
          .map((c) => ({ kind: "cliente", id: c.id, name: c.name, external_id: null, platform_id: null, client_id: c.id, client_name: c.name, parent_name: c.company, status: c.status })),
        ...pick(db.adAccounts.filter((a) => !a.unlinked_at))
          .map((a) => ({ kind: "conta", id: a.id, name: a.name, external_id: a.external_id, platform_id: a.platform_id, client_id: a.client_id, client_name: clientName(a.client_id), parent_name: null, status: a.status ?? "ativa" })),
        ...pick(db.campaigns)
          .map((x) => ({ kind: "campanha", id: x.id, name: x.name, external_id: x.external_id, platform_id: x.platform_id, client_id: x.client_id, client_name: clientName(x.client_id), parent_name: db.adAccounts.find((a) => a.id === x.ad_account_id)?.name ?? null, status: x.status })),
        ...pick(db.adGroups)
          .map((x) => ({ kind: "conjunto", id: x.id, name: x.name, external_id: x.external_id, platform_id: x.platform_id, client_id: x.client_id, client_name: clientName(x.client_id), parent_name: db.campaigns.find((c) => c.id === x.campaign_id)?.name ?? null, status: x.status })),
        ...pick(db.ads)
          .map((x) => ({ kind: "anuncio", id: x.id, name: x.name, external_id: x.external_id, platform_id: x.platform_id, client_id: x.client_id, client_name: clientName(x.client_id), parent_name: db.campaigns.find((c) => c.id === x.campaign_id)?.name ?? null, status: x.status })),
      ];
      return res(200, rows);
    }
    if (url.includes("/rest/v1/rpc/audit_log_list")) {
      const p = parse();
      db.rpcCalls.push({ fn: "audit_log_list", ...p });
      if (role !== "admin") return res(200, []);
      const rows = [...db.audit]
        .filter((l) => (!p.p_from || l.created_at >= p.p_from) && (!p.p_actor || l.actor_id === p.p_actor) &&
          (!p.p_before_id || l.id < p.p_before_id) &&
          (!p.p_category || (p.p_category === "auth" ? l.action.startsWith("auth.") : l.target_type === p.p_category && !l.action.startsWith("auth."))))
        .sort((x, y) => y.id - x.id)
        .slice(0, p.p_limit ?? 100)
        .map((l) => {
          const actor = db.profiles.find((x) => x.id === l.actor_id);
          return { ...l, actor_name: actor?.full_name || null, actor_email: actor?.email ?? null };
        });
      return res(200, rows);
    }
    if (url.includes("/functions/v1/sync")) {
      const body = parse();
      db.syncCalls.push(body);
      if (!["admin", "gestor", "operador"].includes(role)) return res(403, { error: { code: "FORBIDDEN", message: "Você não tem permissão para esta ação." } });
      const visible = db.adAccounts.filter((a) => !a.unlinked_at && a.connection_id && (!body.adAccountIds || body.adAccountIds.includes(a.id)));
      if (!visible.length) return res(404, { error: { code: "NOT_FOUND", message: "Nenhuma conta com conexão ativa para sincronizar." } });
      // Cache (mesma regra do servidor): < 10 min = recente; onlyStale = só > 90 min ou nunca.
      const age = (a) => { const t = db.syncState[a.id]?.last_success_at; return t ? (Date.now() - Date.parse(t)) / 60_000 : null; };
      const skip = (a) => (body.onlyStale ? age(a) != null && age(a) <= 90 : age(a) != null && age(a) < 10);
      const wanted = visible.filter((a) => !skip(a));
      const fresh = visible.length - wanted.length;
      const results = [];
      let runId = db.syncRuns.reduce((m, x) => Math.max(m, x.id), 0);
      for (const a of wanted) {
        const o = db.syncOutcome[a.id] ?? { status: "sucesso", records: 100, durationMs: 4000 };
        const end = new Date();
        const start = new Date(end.getTime() - o.durationMs).toISOString();
        db.syncRuns.push({ id: ++runId, ad_account_id: a.id, client_id: a.client_id, platform_id: a.platform_id, trigger: "manual", status: o.status,
          started_at: start, finished_at: end.toISOString(), duration_ms: o.durationMs, records_updated: o.records, error_message: o.error ?? null });
        const prev = db.syncState[a.id] ?? {};
        db.syncState[a.id] = { ...prev, status: o.status, running: false, last_attempt_at: start,
          last_success_at: o.status === "sucesso" ? end.toISOString() : prev.last_success_at ?? null,
          next_run_at: new Date(end.getTime() + (o.status === "sucesso" ? 60 : 30) * 60_000).toISOString(), last_error_message: o.error ?? null };
        results.push({ adAccountId: a.id, status: o.status, records: o.records, durationMs: o.durationMs, error: o.error ?? null });
      }
      return res(200, { data: { results, queued: 0, alreadyRunning: 0, fresh } });
    }

    // --- Edge Function ad-accounts (simula o servidor + API do Meta)
    if (url.includes("/functions/v1/ad-accounts")) {
      const body = parse();
      db.adAccountCalls.push(body);
      const now = new Date().toISOString();
      switch (body.action) {
        case "connect": {
          if (!body.accessToken.startsWith("EAA")) {
            return res(400, { error: { code: "AUTH_EXPIRED", message: "O token do Meta é inválido ou expirou. Gere um novo token e conecte novamente." } });
          }
          const connection = { id: "c0000000-0000-4000-8000-000000000001", platform_id: "meta", label: body.label, status: "ativa", external_user_id: "su1", external_user_name: "Backstage Flow (sistema)", last_checked_at: now, last_error: null, created_at: now };
          db.connections.push(connection);
          return res(200, { data: { connectionId: connection.id, ownerName: connection.external_user_name, renewed: false } });
        }
        case "google_status":
          return res(200, { data: { missing: db.googleMissing, callbackPath: "/configuracoes/integracoes/google/callback" } });
        case "google_start":
          return res(200, { data: { url: `https://accounts.google.com/o/oauth2/v2/auth?state=${"a".repeat(64)}&redirect_uri=${encodeURIComponent(body.redirectUri)}` } });
        case "google_complete": {
          if (body.code !== "codigo-valido") {
            return res(400, { error: { code: "INVALID_STATE", message: "Autorização inválida ou expirada. Tente conectar de novo." } });
          }
          const connection = { id: "c0000000-0000-4000-8000-000000000002", platform_id: "google", label: body.label, status: "ativa", external_user_id: "g1", external_user_name: "agencia@gmail.com", last_checked_at: now, last_error: null, created_at: now };
          db.connections.push(connection);
          return res(200, { data: { connectionId: connection.id, ownerName: connection.external_user_name, renewed: false } });
        }
        case "disconnect": {
          db.connections.find((c) => c.id === body.connectionId).status = "revogada";
          return res(200, { data: { connectionId: body.connectionId } });
        }
        case "list_available": {
          const platform = db.connections.find((c) => c.id === body.connectionId)?.platform_id;
          const source = platform === "google" ? db.googleAccounts : db.metaAccounts;
          return res(200, { data: { accounts: source.map((a) => ({ managerId: null, isTestAccount: null, ...a, linkedClientId: db.adAccounts.find((x) => x.external_id === a.externalId && !x.unlinked_at)?.client_id ?? null })) } });
        }
        case "link": {
          const platform = db.connections.find((c) => c.id === body.connectionId)?.platform_id ?? "meta";
          const found = (platform === "google" ? db.googleAccounts : db.metaAccounts).find((a) => a.externalId === body.externalId);
          const id = `a0000000-0000-4000-8000-${body.externalId.padStart(12, "0").slice(-12)}`;
          db.adAccounts.push({
            id, platform_id: platform, external_id: found.externalId, client_id: body.clientId, connection_id: body.connectionId,
            name: found.name, currency: found.currency, timezone: found.timezone, status: found.status,
            raw_status: platform === "google" ? "customer.status=ENABLED" : "account_status=1",
            status_reason: null, business_name: found.businessName, is_prepay: null,
            manager_customer_id: body.managerCustomerId ?? null, is_test_account: found.isTestAccount ?? null,
            linked_at: now, details_updated_at: now, unlinked_at: null,
            assets: platform === "meta"
              ? [{ asset_type: "page", external_id: "p1", name: "Excalibur Fitness" }, { asset_type: "instagram", external_id: "ig1", name: "@excaliburfitness" }]
              : [],
          });
          return res(200, { data: { adAccountId: id, warning: null } });
        }
        case "refresh":
          return res(200, { data: { adAccountId: body.adAccountId, warning: null } });
        case "refresh_balance": {
          const results = body.adAccountIds.map((id) => {
            // Cache: fotografia de menos de 10 minutos já responde.
            const snapAt = db.snapshots[id]?.captured_at;
            if (snapAt && Date.now() - Date.parse(snapAt) < 10 * 60_000) return { adAccountId: id, ok: true, cached: true };
            if (db.fundingErrors[id]) return { adAccountId: id, ok: false, error: db.fundingErrors[id] };
            db.snapshots[id] = { ...db.fundingApi[id], captured_at: now };
            const acc = db.adAccounts.find((a) => a.id === id);
            if (acc && db.fundingApi[id]?.status) acc.status = db.fundingApi[id].status;
            return { adAccountId: id, ok: true };
          });
          return res(200, { data: { results } });
        }
        case "balance_settings": {
          const account = db.adAccounts.find((a) => a.id === body.adAccountId);
          account.low_balance_days = body.lowBalanceDays;
          account.low_balance_amount_micros = body.lowBalanceAmount == null ? null : Math.round(body.lowBalanceAmount * 1_000_000);
          return res(200, { data: { adAccountId: body.adAccountId } });
        }
        case "unlink": {
          db.adAccounts.find((a) => a.id === body.adAccountId).unlinked_at = now;
          return res(200, { data: { adAccountId: body.adAccountId } });
        }
      }
    }

    // --- Edge Function tracking-destinations (Meta CAPI)
    if (url.includes("/functions/v1/tracking-destinations")) {
      const body = parse();
      db.functionCalls.push({ fn: "tracking-destinations", ...body });
      if (!["admin", "gestor"].includes(role)) return res(403, { error: { code: "FORBIDDEN", message: "Você não tem permissão para esta ação." } });
      let dest = db.trackingDestinations.find((d) => d.container_id === body.containerId);
      if (body.action === "save") {
        if (!dest) {
          dest = { id: crypto.randomUUID(), container_id: body.containerId, last_success_at: null, last_error_at: null, last_error_message: null };
          db.trackingDestinations.push(dest);
        }
        Object.assign(dest, { pixel_id: body.pixelId, test_event_code: body.testEventCode, send_events: body.sendEvents });
        if (body.token) db.capiTokens[dest.id] = body.token;
        if (body.enabled && !db.capiTokens[dest.id]) {
          return res(400, { error: { code: "INVALID_STATE", message: "Cole o token da API de Conversões antes de ligar o envio." } });
        }
        dest.enabled = body.enabled;
        return res(200, { data: { id: dest.id, hasToken: db.capiTokens[dest.id] != null, enabled: dest.enabled } });
      }
      if (body.action === "remove_token") {
        delete db.capiTokens[dest.id];
        dest.enabled = false;
        return res(200, { data: { removed: true } });
      }
      if (body.action === "test") {
        if (!dest?.test_event_code) return res(400, { error: { code: "INVALID_STATE", message: "Informe o código de teste do Meta (Gerenciador de Eventos → Testar eventos) para enviar um evento de teste." } });
        const r = db.capiTestResult;
        db.trackingCapiLog.push({ id: db.trackingCapiLog.length + 1, destination_id: dest.id, requested_at: new Date().toISOString(), kind: "teste", events_count: 1, test: true, http_status: r.ok ? 200 : 400, events_received: r.ok ? 1 : null, error_message: r.ok ? null : r.message });
        return res(200, { data: { ok: r.ok, eventsReceived: r.ok ? 1 : null, message: r.message, fbtraceId: "demo" } });
      }
    }

    // --- Edge Function tracking-whatsapp (marcar Lead/Venda)
    if (url.includes("/functions/v1/tracking-whatsapp")) {
      const body = parse();
      db.functionCalls.push({ fn: "tracking-whatsapp", ...body });
      if (String(body.action).startsWith("connection_")) {
        if (!["admin", "gestor"].includes(role)) return res(403, { error: { code: "FORBIDDEN", message: "Você não tem permissão para esta ação." } });
        let conn = db.whatsappConnections.find((w) => w.container_id === body.containerId);
        const webhookUrl = (id) => `https://demo.supabase.co/functions/v1/whatsapp-webhook?c=${id}`;
        if (body.action === "connection_save") {
          if (!/^\d{5,30}$/.test(body.phoneNumberId ?? "") || !/^\d{5,30}$/.test(body.wabaId ?? "")) {
            return res(400, { error: { code: "INVALID_INPUT", message: "O ID do número de telefone tem só números (fica em WhatsApp → Configuração da API)." } });
          }
          if (db.whatsappConnections.some((w) => w.phone_number_id === body.phoneNumberId && w.container_id !== body.containerId)) {
            return res(409, { error: { code: "INVALID_STATE", message: "Este número já está ligado a outro site." } });
          }
          if (!conn) {
            conn = { id: crypto.randomUUID(), container_id: body.containerId, enabled: false, last_webhook_at: null, last_error_at: null, last_error_message: null };
            db.whatsappConnections.push(conn);
            db.waSecrets[conn.id] = { verify: "demo" + conn.id.replace(/-/g, "").slice(0, 20) };
          }
          Object.assign(conn, { phone_number_id: body.phoneNumberId, waba_id: body.wabaId });
          if (body.appSecret) db.waSecrets[conn.id].app = body.appSecret;
          if (body.enabled && !db.waSecrets[conn.id].app) {
            return res(400, { error: { code: "INVALID_STATE", message: "Cole o segredo do app do Meta antes de ligar (sem ele não dá para conferir que o aviso veio mesmo do Meta)." } });
          }
          conn.enabled = body.enabled;
          return res(200, { data: { id: conn.id, enabled: conn.enabled, hasAppSecret: true, webhookUrl: webhookUrl(conn.id) } });
        }
        if (!conn) return res(404, { error: { code: "NOT_FOUND", message: "Salve a conexão primeiro." } });
        if (body.action === "connection_reveal") return res(200, { data: { webhookUrl: webhookUrl(conn.id), verifyToken: db.waSecrets[conn.id]?.verify ?? null } });
        db.waSecrets[conn.id] = {};
        conn.enabled = false;
        return res(200, { data: { removed: true } });
      }
      if (!["admin", "gestor", "operador"].includes(role)) return res(403, { error: { code: "FORBIDDEN", message: "Você não tem permissão para esta ação." } });
      const c = body.conversationId != null
        ? db.whatsappConversations.find((x) => x.id === body.conversationId)
        : db.whatsappClicks.find((x) => x.code === body.code);
      if (!c) return res(404, { error: { code: "NOT_FOUND", message: body.conversationId != null ? "Conversa não encontrada." : "Código não encontrado." } });
      if (body.kind === "lead") {
        if (c.status === "lead" || c.status === "venda") return res(200, { data: { status: "ja_marcado" } });
        c.status = "lead";
      } else {
        if (body.orderId && (c.orders ?? []).includes(body.orderId)) {
          return res(409, { error: { code: "INVALID_STATE", message: "Este nº de pedido já foi registrado para este site." } });
        }
        c.orders = [...(c.orders ?? []), body.orderId].filter(Boolean);
        c.status = "venda";
        c.sales = (c.sales ?? 0) + 1;
      }
      return res(200, { data: { status: "ok", leadId: 1 } });
    }

    // --- Edge Function admin-users
    if (url.includes("/functions/v1/admin-users")) {
      const body = parse();
      db.functionCalls.push(body);
      if (body.email === "repetido@agencia.com") {
        return res(409, { error: { code: "EMAIL_IN_USE", message: "Já existe um usuário com este e-mail." } });
      }
      if (body.action === "create") {
        const id = crypto.randomUUID();
        db.profiles.push({ id, email: body.email, full_name: body.fullName, role: body.role, active: true, created_at: new Date().toISOString(), updated_at: "" });
        return res(200, { data: { id } });
      }
      if (body.action === "update") {
        const p = db.profiles.find((x) => x.id === body.userId);
        if (p) Object.assign(p, body.fullName !== undefined ? { full_name: body.fullName } : {}, body.role ? { role: body.role } : {},
          body.active !== undefined ? { active: body.active } : {});
      }
      return res(200, { data: { id: body.userId ?? "x" } });
    }

    return res(404, {});
  };
}

