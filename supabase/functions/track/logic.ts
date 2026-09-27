/**
 * Regras puras do endpoint público de tracking (Etapa 34.1): validar o que o
 * script do site mandou e montar o pacote para `tracking_ingest`. Sem banco e
 * sem rede, para ser testado à parte.
 *
 * Privacidade: nenhum dado pessoal é gravado. Da URL da página ficam só o
 * endereço e os parâmetros de campanha (o resto da "?..." é descartado, porque
 * formulários às vezes põem e-mail ou telefone ali). Do site de origem fica só
 * o domínio. IP e navegador não são gravados.
 */
import { z } from "npm:zod@4";
import {
  AD_ID_KEYS,
  captureParams,
  CLICK_ID_KEYS,
  classifyTouch,
  isHostAllowed,
  UTM_KEYS,
} from "../../../packages/shared/src/tracking/params.ts";

export const MAX_BODY_BYTES = 8 * 1024;
/** Eventos com horário fora desta janela ficam com o horário do servidor. */
export const MAX_PAST_MS = 3 * 24 * 60 * 60 * 1000 - 60 * 60 * 1000;
export const MAX_FUTURE_MS = 30 * 60 * 1000;

const ID = /^[A-Za-z0-9_-]{8,64}$/;

/** O que o script `t.js` envia (nomes curtos para caber no beacon). */
export const beaconSchema = z.object({
  k: z.string().regex(/^bf_[0-9a-f]{24}$/),
  v: z.string().regex(ID),
  s: z.string().regex(ID),
  e: z.string().regex(/^[A-Za-z0-9_.:-]{8,80}$/),
  n: z.string().regex(/^[A-Za-z][A-Za-z0-9_]{1,49}$/),
  t: z.number().int().positive(),
  u: z.string().max(2000).regex(/^https?:\/\//i).url(),
  r: z.string().max(2000).optional(),
  /** Primeira página da sessão ou chegada de nova campanha: registrar a origem. */
  nt: z.boolean().optional(),
  c: z.enum(["concedido"]).optional(),
  cv: z.string().max(40).optional(),
  cd: z.record(z.string().max(50), z.union([z.string().max(500), z.number(), z.boolean(), z.null()])).optional(),
});
export type Beacon = z.infer<typeof beaconSchema>;

export class TrackError extends Error {
  constructor(public readonly status: number, public readonly code: string) {
    super(code);
  }
}

/** Lê o corpo (texto ou JSON) com limite de tamanho. */
export function parseBeacon(body: string): Beacon {
  if (new TextEncoder().encode(body).length > MAX_BODY_BYTES) throw new TrackError(413, "PAYLOAD_TOO_LARGE");
  let raw: unknown;
  try {
    raw = JSON.parse(body);
  } catch {
    throw new TrackError(400, "INVALID_JSON");
  }
  const parsed = beaconSchema.safeParse(raw);
  if (!parsed.success) throw new TrackError(400, "INVALID_INPUT");
  if (parsed.data.cd && JSON.stringify(parsed.data.cd).length > 3000) throw new TrackError(400, "INVALID_INPUT");
  return parsed.data;
}

export function hostOf(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:" ? u.hostname.toLowerCase() : null;
  } catch {
    return null;
  }
}

const KEEP_PARAMS = new Set<string>([...UTM_KEYS, ...CLICK_ID_KEYS, ...Object.keys(AD_ID_KEYS)]);

/** URL sem dados pessoais: endereço + só os parâmetros de campanha. */
export function sanitizeUrl(url: string): { url: string; path: string } {
  const u = new URL(url);
  const kept = new URLSearchParams();
  for (const [k, v] of u.searchParams) if (KEEP_PARAMS.has(k)) kept.append(k, v);
  const q = kept.toString();
  const path = u.pathname.slice(0, 1000);
  return { url: `${u.origin}${u.pathname}${q ? `?${q}` : ""}`.slice(0, 2000), path };
}

export function deviceFromUserAgent(ua: string | null): "mobile" | "tablet" | "desktop" | "desconhecido" {
  if (!ua) return "desconhecido";
  if (/iPad|Tablet|Nexus 7|Nexus 10|SM-T|Kindle|Silk/i.test(ua) || (/Android/i.test(ua) && !/Mobile/i.test(ua))) return "tablet";
  if (/Mobi|iPhone|iPod|Android|Windows Phone|Opera Mini/i.test(ua)) return "mobile";
  if (/Windows|Macintosh|Linux|CrOS|X11/i.test(ua)) return "desktop";
  return "desconhecido";
}

export interface Container {
  id: string;
  client_id: string;
  allowed_domains: string[];
  status: string;
  test_mode: boolean;
  consent_mode: string;
}

/** Domínio de onde veio o envio: cabeçalho Origin (o navegador preenche, a página não controla). */
export function checkOrigin(originHeader: string | null, pageUrl: string, container: Container): string {
  const originHost = hostOf(originHeader);
  const pageHost = hostOf(pageUrl);
  if (!originHost || !pageHost) throw new TrackError(403, "ORIGIN_REQUIRED");
  if (!isHostAllowed(originHost, container.allowed_domains) || !isHostAllowed(pageHost, container.allowed_domains)) {
    throw new TrackError(403, "DOMAIN_NOT_ALLOWED");
  }
  return originHeader!;
}

/** Horário do evento: o do navegador, salvo quando o relógio dele está muito errado. */
export function eventTime(clientMs: number, nowMs: number): string {
  const ok = clientMs >= nowMs - MAX_PAST_MS && clientMs <= nowMs + MAX_FUTURE_MS;
  return new Date(ok ? clientMs : nowMs).toISOString();
}

/** Monta o pacote de `tracking_ingest`. A origem é recalculada aqui, no servidor. */
export function buildIngest(b: Beacon, container: Container, opts: { nowMs: number; userAgent: string | null }) {
  const page = sanitizeUrl(b.u);
  const referrerHost = hostOf(b.r);
  let touch: Record<string, unknown> | null = null;
  if (b.nt) {
    const params = captureParams(b.u);
    const cls = classifyTouch({ params, referrer: b.r ?? null, pageUrl: b.u });
    if (cls) {
      const other: Record<string, string> = {};
      for (const k of ["msclkid", "ttclid", "li_fat_id"] as const) if (params.clickIds[k]) other[k] = params.clickIds[k]!;
      touch = {
        channel: cls.channel,
        paid: cls.paid,
        evidence: cls.evidence,
        reason: cls.reason.slice(0, 300),
        ...params.utm,
        source_normalized: cls.sourceNormalized,
        fbclid: params.clickIds.fbclid ?? null,
        gclid: params.clickIds.gclid ?? null,
        wbraid: params.clickIds.wbraid ?? null,
        gbraid: params.clickIds.gbraid ?? null,
        other_click_ids: other,
        ad_campaign_id: params.adIds.campaign ?? null,
        ad_adset_id: params.adIds.adset ?? null,
        ad_ad_id: params.adIds.ad ?? null,
      };
    }
  }
  return {
    container_id: container.id,
    client_id: container.client_id,
    visitor_id: b.v,
    session_id: b.s,
    test: container.test_mode,
    device_type: deviceFromUserAgent(opts.userAgent),
    consent_status: b.c === "concedido" ? "concedido" : "nao_exigido",
    consent_version: b.cv ?? null,
    event: {
      event_id: b.e,
      name: b.n,
      occurred_at: eventTime(b.t, opts.nowMs),
      page_url: page.url,
      page_path: page.path,
      referrer_host: referrerHost,
      custom_data: b.cd ?? {},
    },
    touch,
  };
}

/** Cifra o IP com um "sal" que muda todo dia: serve só para o limite, não identifica ninguém. */
export async function ipBucket(ip: string, salt: string, day: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${salt}|${day}|${ip}`));
  return "ip:" + Array.from(new Uint8Array(bytes).slice(0, 16), (x) => x.toString(16).padStart(2, "0")).join("");
}

export const LIMITS = {
  container: { max: 600, windowSeconds: 60 },
  ip: { max: 120, windowSeconds: 60 },
} as const;
