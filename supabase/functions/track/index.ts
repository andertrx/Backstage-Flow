/**
 * Edge Function: track (Etapa 34.1)
 *
 * Endpoint PÚBLICO que recebe os eventos do script `t.js` instalado nos sites
 * dos clientes. Não usa login: cada site tem uma chave pública (não é segredo)
 * e só os domínios autorizados no container podem enviar.
 *
 * Proteções: tamanho máximo, validação de todos os campos, domínio autorizado
 * (cabeçalho Origin + endereço da página), container ativo, limite por
 * container e por IP cifrado, e event_id para não duplicar.
 * A origem da visita é recalculada aqui (o navegador não decide).
 *
 * Respostas: 204 (recebido/duplicado/ignorado), 400/403/404/413/429 (recusado).
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { adminClient } from "../_shared/auth.ts";
import { recordError } from "../_shared/errorlog.ts";
import { buildIngest, checkOrigin, type Container, ipBucket, LIMITS, parseBeacon, TrackError } from "./logic.ts";

const CACHE_MS = 60_000;
const cache = new Map<string, { at: number; container: Container | null }>();

async function findContainer(db: SupabaseClient, key: string): Promise<Container | null> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.container;
  const { data, error } = await db.rpc("tracking_container_by_key", { p_key: key });
  if (error) throw error;
  const container = (Array.isArray(data) ? data[0] : null) as Container | null ?? null;
  if (cache.size > 1000) cache.clear();
  cache.set(key, { at: Date.now(), container });
  return container;
}

function cors(origin: string | null): HeadersInit {
  return origin
    ? {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "content-type",
      "Access-Control-Max-Age": "86400",
      Vary: "Origin",
    }
    : {};
}

const reply = (status: number, origin: string | null, code?: string) =>
  new Response(code ? JSON.stringify({ error: code }) : null, {
    status,
    headers: { ...cors(origin), ...(code ? { "Content-Type": "application/json" } : {}) },
  });

async function allowed(db: SupabaseClient, bucket: string, rule: { max: number; windowSeconds: number }): Promise<boolean> {
  const { data, error } = await db.rpc("track_limit_hit", { p_bucket: bucket, p_max: rule.max, p_window_seconds: rule.windowSeconds });
  // Se o contador falhar, deixa passar: o limite nunca derruba o tracking.
  return error ? true : data !== false;
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(origin) });
  if (req.method !== "POST") return reply(405, null, "METHOD_NOT_ALLOWED");

  try {
    const beacon = parseBeacon(await req.text());
    const db = adminClient();
    const container = await findContainer(db, beacon.k);
    if (!container) throw new TrackError(404, "UNKNOWN_KEY");
    const allowOrigin = checkOrigin(origin, beacon.u, container);
    if (container.status !== "ativo") return reply(204, allowOrigin);
    // Consentimento exigido e não dado: não grava nada.
    if (container.consent_mode === "aguardar_consentimento" && beacon.c !== "concedido") return reply(204, allowOrigin);

    const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim();
    const checks = [allowed(db, `c:${container.id}`, LIMITS.container)];
    if (ip) {
      const salt = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
      checks.push(ipBucket(ip, salt, new Date().toISOString().slice(0, 10)).then((b) => allowed(db, b, LIMITS.ip)));
    }
    if ((await Promise.all(checks)).includes(false)) throw new TrackError(429, "TOO_MANY_REQUESTS");

    const payload = buildIngest(beacon, container, { nowMs: Date.now(), userAgent: req.headers.get("user-agent"), ip: ip || null });
    const { error } = await db.rpc("tracking_ingest", { p: payload });
    if (error) throw error;
    return reply(204, allowOrigin);
  } catch (err) {
    if (err instanceof TrackError) {
      // Só devolve CORS para sites autorizados; os demais nem leem a resposta.
      return reply(err.status, err.status === 429 ? origin : null, err.code);
    }
    await recordError({ source: "servidor", code: "TRACK_INGEST_FAILED", technical: err, context: { funcao: "track" } });
    return reply(500, null, "UNKNOWN");
  }
});
