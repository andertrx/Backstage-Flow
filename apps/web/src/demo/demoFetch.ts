/**
 * "Servidor" do modo demonstração: responde no próprio navegador, com os dados
 * fictícios de seed.ts. Nunca faz chamada de rede (nem ao banco, nem às APIs).
 */
type Handler = (req: { url: string; method: string; body?: string | null }) => Promise<{ status: number; body?: string }>;

let handler: Promise<Handler> | null = null;

async function load(): Promise<Handler> {
  const [{ createMockBackend }, { seedDemo, DEMO_USER }] = await Promise.all([import("./mockBackend.js"), import("./seed.ts")]);
  return createMockBackend(seedDemo(), { role: "admin", password: null, userId: DEMO_USER.id, email: DEMO_USER.email, fullName: DEMO_USER.name });
}

export const DEMO_BLOCKED_MESSAGE = "Esta ação não está disponível no modo demonstração.";

/** Ações que mexeriam em contas reais ou usuários: bloqueadas na demonstração. */
const BLOCKED_ACTIONS = new Set(["connect", "google_start", "google_complete", "disconnect", "link", "unlink"]);

function blocked(url: string, body: string | undefined): boolean {
  if (url.includes("/functions/v1/admin-users")) return true;
  if (!url.includes("/functions/v1/ad-accounts") || !body) return false;
  try {
    return BLOCKED_ACTIONS.has((JSON.parse(body) as { action?: string }).action ?? "");
  } catch {
    return false;
  }
}

export async function demoFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const req = new Request(input, init);
  const body = req.method === "GET" || req.method === "HEAD" ? undefined : await req.text();
  if (blocked(req.url, body)) {
    return new Response(JSON.stringify({ error: { code: "DEMO_MODE", message: DEMO_BLOCKED_MESSAGE } }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
  handler ??= load();
  const r = await (await handler)({ url: req.url, method: req.method, body });
  return new Response(r.body ?? null, {
    status: r.status,
    headers: r.body === undefined ? {} : { "Content-Type": "application/json" },
  });
}
