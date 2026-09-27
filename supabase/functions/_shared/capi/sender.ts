import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { buildMetaEvent, chunk, eventsUrl, type MetaResult, parseMetaResponse, type QueueRow, requestBody } from "./meta.ts";

export const BATCH_SIZE = 200;
type FetchFn = (url: string, init: RequestInit) => Promise<Response>;

interface ItemResult {
  id: number;
  ok: boolean;
  error?: string;
}

/** Uma chamada ao Meta: registra no log (sem token) e devolve o resultado. */
export async function postToMeta(
  db: SupabaseClient,
  fetchFn: FetchFn,
  destinationId: string,
  pixelId: string,
  token: string,
  testEventCode: string | null,
  events: unknown[],
  kind: "envio" | "teste" = "envio",
): Promise<MetaResult> {
  const started = Date.now();
  let result: MetaResult;
  try {
    const res = await fetchFn(eventsUrl(pixelId), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: requestBody(events, token, testEventCode),
      signal: AbortSignal.timeout(20_000),
    });
    result = parseMetaResponse(res.status, await res.json().catch(() => ({})));
  } catch {
    result = { ok: false, httpStatus: 0, eventsReceived: null, fbtraceId: null, errorCode: "NETWORK", message: "Não conseguimos falar com o Meta agora. O envio tenta de novo sozinho.", invalidParameter: false, authProblem: false };
  }
  await db.rpc("tracking_capi_log_add", {
    p: {
      destination_id: destinationId, kind, ok: result.ok, events_count: events.length, test: testEventCode != null,
      http_status: result.httpStatus || null, events_received: result.eventsReceived, fbtrace_id: result.fbtraceId,
      error_code: result.errorCode, error_message: result.message, duration_ms: Date.now() - started,
    },
  });
  return result;
}

/**
 * Pega a fila da vez, envia por Pixel em lotes e registra o resultado.
 * Se o Meta recusar um lote por dado inválido, reenvia um a um para achar o culpado.
 */
export async function runSender(db: SupabaseClient, fetchFn: FetchFn = fetch, limit = 500) {
  const { data, error } = await db.rpc("tracking_capi_claim", { p_limit: limit });
  if (error) throw error;
  const rows = (data ?? []) as QueueRow[];
  const results: ItemResult[] = [];
  const byDest = new Map<string, QueueRow[]>();
  for (const r of rows) byDest.set(r.destination_id, [...(byDest.get(r.destination_id) ?? []), r]);

  for (const [destId, list] of byDest) {
    const { data: token } = await db.rpc("tracking_destination_secret_get", { p_destination_id: destId });
    if (typeof token !== "string" || !token) {
      for (const r of list) results.push({ id: r.id, ok: false, error: "Sem token do Meta configurado." });
      continue;
    }
    const { pixel_id: pixelId, test_event_code: testCode } = list[0];
    for (const part of chunk(list, BATCH_SIZE)) {
      const events = await Promise.all(part.map(buildMetaEvent));
      const res = await postToMeta(db, fetchFn, destId, pixelId, token, testCode, events);
      if (res.ok) {
        for (const r of part) results.push({ id: r.id, ok: true });
      } else if (res.invalidParameter && part.length > 1) {
        for (let i = 0; i < part.length; i++) {
          const one = await postToMeta(db, fetchFn, destId, pixelId, token, testCode, [events[i]]);
          results.push(one.ok ? { id: part[i].id, ok: true } : { id: part[i].id, ok: false, error: one.message ?? "Erro no envio." });
        }
      } else {
        for (const r of part) results.push({ id: r.id, ok: false, error: res.message ?? "Erro no envio." });
      }
    }
  }
  if (results.length) {
    const { error: finishError } = await db.rpc("tracking_capi_finish", { p_results: results });
    if (finishError) throw finishError;
  }
  return { claimed: rows.length, sent: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok).length };
}
