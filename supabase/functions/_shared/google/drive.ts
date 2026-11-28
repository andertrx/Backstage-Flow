/**
 * Google Drive (Criador de campanhas, Fase C): LEITURA das pastas de criativos com a mesma conta de serviço do Google das planilhas
 * (escopo drive.readonly). O CRM só enxerga o que foi compartilhado com o e-mail dela. Nunca grava nada no Drive.
 */
import { accessToken, type ServiceAccount, SheetsError } from "./sheets.ts";

export const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.readonly";
const DRIVE_URL = "https://www.googleapis.com/drive/v3";
const TIMEOUT_MS = 30_000;
type Fetch = typeof fetch;

/** Aceita o link da pasta (drive.google.com/drive/folders/ID) ou o próprio ID. */
export function parseDriveFolderId(input: string): string | null {
  const t = input.trim();
  const m = /\/folders\/([A-Za-z0-9_-]{10,})/.exec(t) ?? /[?&]id=([A-Za-z0-9_-]{10,})/.exec(t);
  if (m) return m[1];
  return /^[A-Za-z0-9_-]{10,}$/.test(t) ? t : null;
}

/** Erro da API do Drive → mensagem prática em português. */
export function driveApiError(status: number, body: { error?: { message?: string; status?: string } } | null, serviceEmail: string): SheetsError {
  const message = body?.error?.message ?? "";
  if (status === 403 && /has not been used|is disabled|SERVICE_DISABLED/i.test(`${message} ${body?.error?.status ?? ""}`)) {
    return new SheetsError(400, "DRIVE_API_DISABLED", "A API do Google Drive está desligada no projeto do Google Cloud. Ative \"Google Drive API\" e tente de novo.", body);
  }
  if (status === 403 || status === 404) {
    return new SheetsError(404, "DRIVE_NOT_SHARED", `Não achei essa pasta ou arquivo. No Google Drive, compartilhe a pasta com ${serviceEmail} como Leitor.`, body);
  }
  if (status === 429) return new SheetsError(429, "DRIVE_RATE_LIMITED", "O Google pediu uma pausa. Tente de novo em 1 minuto.", body);
  return new SheetsError(502, "DRIVE_ERROR", "O Google Drive não respondeu como esperado. Tente de novo em instantes.", { status, body });
}

export interface DriveFolder { id: string; name: string }
export interface DriveFile { id: string; name: string; mimeType: string; size: number | null }

/** Tipos que o anúncio aceita como imagem (o Meta aceita JPG e PNG). */
export const IMAGE_MIMES = ["image/jpeg", "image/png"] as const;
/** Limite de tamanho para baixar e enviar ao Meta (o servidor trabalha em memória). */
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
/** Vídeos: MP4 e MOV até 30 MB (o envio acontece em memória no servidor; acima disso, suba direto no Gerenciador). */
export const VIDEO_MIMES = ["video/mp4", "video/quicktime"] as const;
export const MAX_VIDEO_BYTES = 30 * 1024 * 1024;
export type MediaKind = "image" | "video";

export class DriveClient {
  constructor(private sa: ServiceAccount, private fetchFn: Fetch = fetch) {}

  private async req(url: string): Promise<Response> {
    const token = await accessToken(this.sa, this.fetchFn, DRIVE_SCOPE);
    try {
      return await this.fetchFn(url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(TIMEOUT_MS) });
    } catch (err) {
      throw new SheetsError(502, "DRIVE_UNREACHABLE", "Não conseguimos falar com o Google agora. Tente de novo em instantes.", err);
    }
  }

  private async json(url: string) {
    const res = await this.req(url);
    const body = await res.json().catch(() => null);
    if (!res.ok) throw driveApiError(res.status, body, this.sa.client_email);
    return body;
  }

  /** Subpastas e imagens de uma pasta (até 200 de cada). Só id, nome, tipo e tamanho. */
  async list(folderId: string): Promise<{ folders: DriveFolder[]; images: DriveFile[]; videos: DriveFile[]; others: number }> {
    const q = `'${folderId}' in parents and trashed = false`;
    const fields = "files(id,name,mimeType,size),nextPageToken";
    const body = await this.json(`${DRIVE_URL}/files?q=${encodeURIComponent(q)}&fields=${encodeURIComponent(fields)}&pageSize=200&orderBy=${encodeURIComponent("folder,name")}&supportsAllDrives=true&includeItemsFromAllDrives=true`);
    const items = (body?.files ?? []) as { id: string; name: string; mimeType: string; size?: string }[];
    const folders = items.filter((f) => f.mimeType === "application/vnd.google-apps.folder").map((f) => ({ id: f.id, name: f.name }));
    const images = items.filter((f) => (IMAGE_MIMES as readonly string[]).includes(f.mimeType))
      .map((f) => ({ id: f.id, name: f.name, mimeType: f.mimeType, size: f.size ? Number(f.size) : null }));
    const videos = items.filter((f) => (VIDEO_MIMES as readonly string[]).includes(f.mimeType))
      .map((f) => ({ id: f.id, name: f.name, mimeType: f.mimeType, size: f.size ? Number(f.size) : null }));
    return { folders, images, videos, others: items.length - folders.length - images.length - videos.length };
  }

  async meta(fileId: string): Promise<DriveFile> {
    const b = await this.json(`${DRIVE_URL}/files/${encodeURIComponent(fileId)}?fields=id,name,mimeType,size&supportsAllDrives=true`);
    return { id: String(b.id), name: String(b.name), mimeType: String(b.mimeType), size: b.size ? Number(b.size) : null };
  }

  /** Baixa uma imagem (recusa o que não é JPG/PNG ou passa de 8 MB, ANTES de baixar). */
  async downloadImage(fileId: string): Promise<{ bytes: Uint8Array; name: string; mimeType: string }> {
    const meta = await this.meta(fileId);
    if (!(IMAGE_MIMES as readonly string[]).includes(meta.mimeType)) {
      throw new SheetsError(400, "DRIVE_NOT_IMAGE", `"${meta.name}" não é JPG nem PNG. Escolha outro arquivo (vídeo vem na próxima etapa).`);
    }
    if ((meta.size ?? 0) > MAX_IMAGE_BYTES) {
      throw new SheetsError(400, "DRIVE_TOO_BIG", `"${meta.name}" tem mais de ${MAX_IMAGE_BYTES / 1024 / 1024} MB. Reduza a imagem e tente de novo.`);
    }
    const res = await this.req(`${DRIVE_URL}/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`);
    if (!res.ok) throw driveApiError(res.status, await res.json().catch(() => null), this.sa.client_email);
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.length > MAX_IMAGE_BYTES) throw new SheetsError(400, "DRIVE_TOO_BIG", `"${meta.name}" é grande demais. Reduza a imagem e tente de novo.`);
    return { bytes, name: meta.name, mimeType: meta.mimeType };
  }

  /** Baixa imagem OU vídeo (decide pelo tipo do arquivo). Recusa tipo errado ou arquivo grande ANTES de baixar. */
  async downloadMedia(fileId: string): Promise<{ kind: MediaKind; bytes: Uint8Array; name: string; mimeType: string }> {
    const meta = await this.meta(fileId);
    if ((IMAGE_MIMES as readonly string[]).includes(meta.mimeType)) return { kind: "image", ...(await this.downloadImage(fileId)) };
    if (!(VIDEO_MIMES as readonly string[]).includes(meta.mimeType)) {
      throw new SheetsError(400, "DRIVE_NOT_MEDIA", `"${meta.name}" não é imagem (JPG/PNG) nem vídeo (MP4/MOV). Escolha outro arquivo.`);
    }
    if ((meta.size ?? 0) > MAX_VIDEO_BYTES) {
      throw new SheetsError(400, "DRIVE_TOO_BIG", `"${meta.name}" tem mais de ${MAX_VIDEO_BYTES / 1024 / 1024} MB. Comprima o vídeo e tente de novo.`);
    }
    const res = await this.req(`${DRIVE_URL}/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`);
    if (!res.ok) throw driveApiError(res.status, await res.json().catch(() => null), this.sa.client_email);
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.length > MAX_VIDEO_BYTES) throw new SheetsError(400, "DRIVE_TOO_BIG", `"${meta.name}" é grande demais. Comprima o vídeo e tente de novo.`);
    return { kind: "video", bytes, name: meta.name, mimeType: meta.mimeType };
  }

  /** Miniatura pequena (data URL) para mostrar no CRM. Se o Drive não tiver miniatura, devolve null. */
  async thumbnail(fileId: string): Promise<string | null> {
    const b = await this.json(`${DRIVE_URL}/files/${encodeURIComponent(fileId)}?fields=thumbnailLink&supportsAllDrives=true`);
    const link = typeof b?.thumbnailLink === "string" ? b.thumbnailLink.replace(/=s\d+$/, "=s220") : "";
    if (!link.startsWith("https://")) return null;
    const res = await this.req(link);
    if (!res.ok) return null;
    const type = res.headers.get("content-type") ?? "";
    if (!/^image\/(jpeg|png|webp)/.test(type)) return null;
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.length > 120_000) return null;
    let bin = "";
    for (const x of buf) bin += String.fromCharCode(x);
    return `data:${type.split(";")[0]};base64,${btoa(bin)}`;
  }
}
