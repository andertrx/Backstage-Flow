/**
 * Fase J.2 — "Esteira de criativos": subir criativos novos num conjunto que JÁ EXISTE no Meta.
 *
 * Cada criativo pode ter até dois arquivos: um para o Feed e um vertical (9:16) para Stories e Reels, com até 5 textos e 5 títulos
 * (o Meta escolhe a combinação na entrega). O formato foi lido do anúncio "Moda Masculina no Atacado" (conta Vonks, 27/11/2026):
 * 2 vídeos + 3 textos + 3 títulos no mesmo criativo, com regras de posicionamento (docs 35.13).
 *
 * Fica guardado em builder_drafts.data com `kind: "esteira"`. Nada aqui fala com o Meta.
 */
import { type AutomationControl, DEFAULT_CONTROL, normalizeControl, urlTagsProblem } from "./automations.ts";
import { AD_CTAS, type AdCta } from "./catalog.ts";
import type { CheckItem } from "./checklist.ts";

export const ESTEIRA_SCHEMA = 1;
export const ESTEIRA_MAX_ITEMS = 20;
export const ESTEIRA_MAX_TEXTS = 5;

/** Arquivo do Drive usado num criativo. Depois de "preparado", guarda o código que o Meta deu (vídeo ou imagem) nesta conta. */
export interface EsteiraMedia {
  fileId: string;
  name: string;
  kind: "image" | "video";
  width: number | null;
  height: number | null;
  /** Vídeo já enviado e processado no Meta. */
  metaVideoId: string;
  metaThumb: string;
  /** Imagem já enviada ao Meta. */
  metaHash: string;
}

export interface EsteiraItem {
  id: string;
  /** Nome do anúncio (vem do nome do arquivo e pode ser trocado). */
  name: string;
  feed: EsteiraMedia | null;
  vertical: EsteiraMedia | null;
  bodies: string[];
  titles: string[];
  description: string;
}

/** Conjunto que já existe no Meta (códigos do Meta) e o destino dele, lido do Meta quando você escolhe. */
export interface EsteiraTarget {
  adSetId: string;
  adSetName: string;
  campaignId: string;
  campaignName: string;
  /** destination_type do conjunto ("WHATSAPP", "WEBSITE"...). Vazio = site. */
  destinationType: string;
}

export interface EsteiraDraft {
  kind: "esteira";
  schema: number;
  target: EsteiraTarget | null;
  pageId: string;
  instagramId: string;
  /** Só para conjuntos que levam ao site. */
  link: string;
  cta: AdCta | "";
  /** Textos padrão: entram em todo criativo novo; "Aplicar a todos" copia para os que já existem. */
  defaults: { bodies: string[]; titles: string[]; description: string };
  /** Controle total (J.1). Os posicionamentos não se aplicam: o conjunto existente não é alterado. */
  control: AutomationControl;
  items: EsteiraItem[];
}

export const MESSAGING_DESTINATIONS = ["WHATSAPP", "MESSENGER", "INSTAGRAM_DIRECT"] as const;
export const esteiraToWebsite = (dest: string) => dest === "" || dest === "WEBSITE" || dest === "UNDEFINED";
export const esteiraSupported = (dest: string) => esteiraToWebsite(dest) || (MESSAGING_DESTINATIONS as readonly string[]).includes(dest);

const newId = () => (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `id-${Math.random().toString(36).slice(2)}${Date.now()}`);

export function newEsteira(): EsteiraDraft {
  return {
    kind: "esteira", schema: ESTEIRA_SCHEMA, target: null, pageId: "", instagramId: "", link: "", cta: "",
    defaults: { bodies: ["", "", ""], titles: ["", "", ""], description: "" }, control: { ...DEFAULT_CONTROL }, items: [],
  };
}

export function newEsteiraItem(d: EsteiraDraft, over: Partial<EsteiraItem> = {}): EsteiraItem {
  return { id: newId(), name: "", feed: null, vertical: null, bodies: [...d.defaults.bodies], titles: [...d.defaults.titles], description: d.defaults.description, ...over };
}

export const isEsteira = (raw: unknown): boolean => !!raw && typeof raw === "object" && (raw as { kind?: unknown }).kind === "esteira";

const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");
const digits = (v: unknown, max = 30) => (/^\d{1,30}$/.test(str(v, max)) ? str(v, max) : "");
const texts = (v: unknown, max: number) => (Array.isArray(v) ? v.slice(0, ESTEIRA_MAX_TEXTS).map((x) => str(x, max)) : []);
const dim = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.round(v) : null);

function normalizeMedia(raw: unknown): EsteiraMedia | null {
  if (!raw || typeof raw !== "object") return null;
  const m = raw as Record<string, unknown>;
  const fileId = str(m.fileId, 100);
  if (!/^[A-Za-z0-9_-]{10,100}$/.test(fileId)) return null;
  const thumb = str(m.metaThumb, 1000);
  return {
    fileId, name: str(m.name, 200), kind: m.kind === "video" ? "video" : "image", width: dim(m.width), height: dim(m.height),
    metaVideoId: digits(m.metaVideoId), metaThumb: thumb.startsWith("https://") ? thumb : "", metaHash: /^[A-Za-z0-9]{8,64}$/.test(str(m.metaHash, 64)) ? str(m.metaHash, 64) : "",
  };
}

/** Lê o JSON salvo e devolve uma esteira completa e segura. */
export function normalizeEsteira(raw: unknown): EsteiraDraft {
  const base = newEsteira();
  if (!isEsteira(raw)) return base;
  const r = raw as Record<string, unknown>;
  const t = (r.target ?? null) as Record<string, unknown> | null;
  const target: EsteiraTarget | null = t && digits(t.adSetId)
    ? { adSetId: digits(t.adSetId), adSetName: str(t.adSetName, 300), campaignId: digits(t.campaignId), campaignName: str(t.campaignName, 300), destinationType: str(t.destinationType, 40).replace(/[^A-Z_]/g, "") }
    : null;
  const df = (r.defaults ?? {}) as Record<string, unknown>;
  const ctas = AD_CTAS.map((x) => x.id) as AdCta[];
  const items = (Array.isArray(r.items) ? r.items : []).slice(0, ESTEIRA_MAX_ITEMS).map((x): EsteiraItem => {
    const i = (x ?? {}) as Record<string, unknown>;
    return {
      id: str(i.id, 80) || newId(), name: str(i.name, 200), feed: normalizeMedia(i.feed), vertical: normalizeMedia(i.vertical),
      bodies: texts(i.bodies, 2000), titles: texts(i.titles, 255), description: str(i.description, 400),
    };
  });
  return {
    kind: "esteira", schema: ESTEIRA_SCHEMA, target, pageId: digits(r.pageId, 40), instagramId: digits(r.instagramId, 40), link: str(r.link, 2000),
    cta: ctas.includes(r.cta as AdCta) ? (r.cta as AdCta) : "",
    defaults: { bodies: texts(df.bodies, 2000), titles: texts(df.titles, 255), description: str(df.description, 400) },
    control: normalizeControl(r.control), items,
  };
}

/** Textos preenchidos (sem vazios nem repetidos). */
export const filledTexts = (list: string[]) => [...new Set(list.map((x) => x.trim()).filter(Boolean))];

// ---------------------------------------------------------------------------
// Pares do Drive: o formato real do arquivo decide; se não der, o nome decide.
// ---------------------------------------------------------------------------

export type Slot = "vertical" | "feed";
const VERTICAL_TOKEN = /(?:^|[\s._-])(9x16|9-16|stories|story|reels|reel|vertical|vert)(?=$|[\s._-])/i;
const FEED_TOKEN = /(?:^|[\s._-])(4x5|4-5|1x1|1-1|feed|quadrado|square|horizontal|16x9)(?=$|[\s._-])/i;

/** Vertical (9:16) vai para Stories e Reels; quadrado, 4:5 e horizontal vão para o Feed. */
export function slotOf(f: { name: string; width: number | null; height: number | null }): Slot | null {
  if (f.width && f.height) {
    const ratio = f.height / f.width;
    if (ratio >= 1.5) return "vertical";
    if (ratio <= 1.3) return "feed";
  }
  if (VERTICAL_TOKEN.test(f.name)) return "vertical";
  if (FEED_TOKEN.test(f.name)) return "feed";
  return null;
}

/** Nome-base do arquivo, sem extensão e sem as marcas de formato: "OFERTA-01_9x16.mp4" → "OFERTA-01". */
export function baseName(name: string): string {
  let b = name.replace(/\.[A-Za-z0-9]{2,5}$/, "");
  for (let i = 0; i < 3; i++) b = b.replace(new RegExp(`${VERTICAL_TOKEN.source}|${FEED_TOKEN.source}`, "ig"), "");
  return b.replace(/[\s._-]+$/g, "").replace(/^[\s._-]+/g, "").trim() || name;
}

export interface DriveMediaFile { id: string; name: string; kind: "image" | "video"; width: number | null; height: number | null }
export interface ProposedItem { name: string; feed: DriveMediaFile | null; vertical: DriveMediaFile | null; paired: boolean }

/**
 * Junta os arquivos em criativos. Dois arquivos com o mesmo nome-base, do mesmo tipo, um vertical e um de Feed, viram UM criativo.
 * O resto vira um criativo de um arquivo só (marcado "sem par"), para você juntar à mão se quiser.
 */
export function pairDriveFiles(files: DriveMediaFile[]): ProposedItem[] {
  const groups = new Map<string, DriveMediaFile[]>();
  for (const f of files) {
    const key = `${f.kind}|${baseName(f.name).toLowerCase()}`;
    groups.set(key, [...(groups.get(key) ?? []), f]);
  }
  const out: ProposedItem[] = [];
  for (const list of groups.values()) {
    const v = list.filter((f) => slotOf(f) === "vertical");
    const fd = list.filter((f) => slotOf(f) !== "vertical");
    if (list.length === 2 && v.length === 1 && fd.length === 1) {
      out.push({ name: baseName(fd[0].name), feed: fd[0], vertical: v[0], paired: true });
      continue;
    }
    for (const f of list) {
      const vertical = slotOf(f) === "vertical";
      out.push({ name: baseName(f.name), feed: vertical ? null : f, vertical: vertical ? f : null, paired: false });
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name, "pt-BR", { numeric: true }));
}

export function toMedia(f: DriveMediaFile): EsteiraMedia {
  return { fileId: f.id, name: f.name, kind: f.kind, width: f.width, height: f.height, metaVideoId: "", metaThumb: "", metaHash: "" };
}

export const mediaReady = (m: EsteiraMedia | null) => !m || (m.kind === "video" ? !!m.metaVideoId && !!m.metaThumb : !!m.metaHash);
/** Arquivos que ainda precisam ser enviados ao Meta (sem repetir o mesmo arquivo). */
export function mediaToPrepare(d: EsteiraDraft): EsteiraMedia[] {
  const seen = new Set<string>();
  const out: EsteiraMedia[] = [];
  for (const i of d.items) for (const m of [i.feed, i.vertical]) {
    if (m && !mediaReady(m) && !seen.has(m.fileId)) { seen.add(m.fileId); out.push(m); }
  }
  return out;
}

/** Depois de enviar um arquivo ao Meta, grava o código em TODOS os criativos que usam o mesmo arquivo. */
export function applyPrepared(d: EsteiraDraft, fileId: string, r: { videoId?: string; thumbnail?: string; hash?: string }): EsteiraDraft {
  const upd = (m: EsteiraMedia | null) => (m && m.fileId === fileId ? { ...m, metaVideoId: r.videoId ?? m.metaVideoId, metaThumb: r.thumbnail ?? m.metaThumb, metaHash: r.hash ?? m.metaHash } : m);
  return { ...d, items: d.items.map((i) => ({ ...i, feed: upd(i.feed), vertical: upd(i.vertical) })) };
}

// ---------------------------------------------------------------------------
// Conferência
// ---------------------------------------------------------------------------

const secret = /EAA[A-Za-z0-9]{20,}|eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.|(senha|password|token|secret|api[_-]?key)\s*[:=]\s*\S{4,}/i;
const isHttps = (u: string) => { try { return new URL(u).protocol === "https:"; } catch { return false; } };

export function checkEsteira(d: EsteiraDraft): CheckItem[] {
  const out: CheckItem[] = [];
  const err = (where: CheckItem["where"], message: string, refId?: string) => out.push({ level: "erro", where, message, refId });
  const warn = (where: CheckItem["where"], message: string, refId?: string) => out.push({ level: "aviso", where, message, refId });
  if (secret.test(JSON.stringify(d))) err("campanha", "Parece que há uma senha, token ou chave em algum campo. Retire antes de seguir.");
  if (!d.target) err("conjunto", "Escolha o conjunto que vai receber os criativos.");
  const dest = d.target?.destinationType ?? "";
  if (d.target && !esteiraSupported(dest)) err("conjunto", `Este conjunto leva para "${dest}". A esteira sobe criativos para conjuntos de site, WhatsApp, Messenger ou Direct. Para os outros, use o Gerenciador.`);
  if (!d.pageId) err("campanha", "Escolha a página do Facebook que publica os anúncios.");
  if (!d.instagramId) warn("campanha", "Sem Instagram, os anúncios saem só com a página do Facebook.");
  if (d.target && esteiraToWebsite(dest)) {
    if (!d.link.trim()) err("campanha", "Informe o link de destino.");
    else if (!isHttps(d.link.trim())) err("campanha", "O link precisa começar com https://.");
    if (!d.cta || d.cta === "NO_BUTTON") err("campanha", "Escolha o botão (CTA).");
  }
  const tags = urlTagsProblem(d.control.urlTags);
  if (tags) err("campanha", tags);
  if (d.control.enhancements) warn("campanha", "Melhorias automáticas do Meta ligadas: o Meta pode mexer em vídeo, imagem, texto e botão.");
  if (d.items.length === 0) err("anuncio", "Adicione pelo menos um criativo (leia a pasta do Drive).");
  if (d.items.length > ESTEIRA_MAX_ITEMS) err("anuncio", `Suba até ${ESTEIRA_MAX_ITEMS} criativos por vez.`);
  for (const i of d.items) {
    const label = i.name.trim() || "Criativo sem nome";
    if (i.name.trim().length < 2) err("anuncio", `${label}: dê um nome ao anúncio.`, i.id);
    if (!i.feed && !i.vertical) err("anuncio", `${label}: escolha pelo menos um arquivo.`, i.id);
    if (i.feed && i.vertical && i.feed.kind !== i.vertical.kind) err("anuncio", `${label}: os dois arquivos precisam ser do mesmo tipo (dois vídeos ou duas imagens).`, i.id);
    if (i.feed && i.vertical && i.feed.fileId === i.vertical.fileId) err("anuncio", `${label}: o arquivo do Feed e o vertical são o mesmo.`, i.id);
    const bodies = filledTexts(i.bodies);
    const titles = filledTexts(i.titles);
    if (bodies.length === 0) err("anuncio", `${label}: escreva pelo menos um texto principal.`, i.id);
    if (bodies.length > ESTEIRA_MAX_TEXTS || titles.length > ESTEIRA_MAX_TEXTS) err("anuncio", `${label}: o Meta aceita até ${ESTEIRA_MAX_TEXTS} textos e ${ESTEIRA_MAX_TEXTS} títulos.`, i.id);
    if (titles.some((t) => t.length > 40)) warn("anuncio", `${label}: título com mais de 40 letras pode ser cortado.`, i.id);
    if (i.feed && i.vertical && i.description.trim()) warn("anuncio", `${label}: com dois arquivos (Feed e vertical) a descrição não é enviada ao Meta.`, i.id);
    if (!i.vertical && i.feed) warn("anuncio", `${label}: sem arquivo vertical, o mesmo arquivo vai também para Stories e Reels.`, i.id);
    if (i.vertical && !i.feed) warn("anuncio", `${label}: só o arquivo vertical; ele vai para todos os posicionamentos.`, i.id);
  }
  return out;
}

/** O que impede de SUBIR (além da conferência): arquivos ainda não enviados ao Meta. */
export function esteiraPublishBlockers(d: EsteiraDraft): CheckItem[] {
  const out = checkEsteira(d).filter((x) => x.level === "erro");
  const pending = mediaToPrepare(d);
  if (pending.length) out.push({ level: "erro", where: "anuncio", message: `${pending.length} arquivo(s) ainda não foram enviados ao Meta. Clique em "Enviar arquivos ao Meta".` });
  return out;
}

/** Ordem de criação: para cada criativo, o criativo e o anúncio. */
export function esteiraPlan(d: EsteiraDraft): { kind: "criativo" | "anuncio"; localId: string; name: string; position: number }[] {
  return d.items.flatMap((i, k) => [
    { kind: "criativo" as const, localId: i.id, name: i.name, position: k * 2 },
    { kind: "anuncio" as const, localId: i.id, name: i.name, position: k * 2 + 1 },
  ]);
}
