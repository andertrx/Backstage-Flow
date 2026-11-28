/**
 * Fase J.4 — Vídeos grandes: envio EM PARTES do Google Drive para o Meta (upload_phase start → transfer → finish),
 * um pedaço por vez, sem guardar o vídeo inteiro na memória. Cada chamada da tela avança o que der dentro do tempo e
 * devolve o andamento; se a página fechar, a próxima chamada continua de onde parou (o estado fica em builder_media_uploads).
 * Sem banco e sem rede aqui: quem chama passa as funções (o que permite testar com um Meta e um Drive simulados).
 */

export type UploadStatus = "enviando" | "processando" | "pronto" | "falhou";

export interface UploadState {
  status: UploadStatus;
  fileSize: number;
  uploadSessionId: string;
  metaVideoId: string;
  /** Próximo pedaço que o Meta pediu: [startOffset, endOffset). Quando os dois são iguais, acabou. */
  startOffset: number;
  endOffset: number;
  thumbnail: string;
  errorMessage: string;
}

export interface UploadDeps {
  /** Lê do Drive os bytes [start, end). */
  readRange(start: number, end: number): Promise<Uint8Array>;
  start(fileSize: number): Promise<{ uploadSessionId: string; videoId: string; startOffset: number; endOffset: number }>;
  transfer(uploadSessionId: string, startOffset: number, chunk: Uint8Array): Promise<{ startOffset: number; endOffset: number }>;
  finish(uploadSessionId: string): Promise<void>;
  /** Situação do processamento no Meta. */
  videoStatus(videoId: string): Promise<{ status: string; picture: string }>;
  now(): number;
}

/** Maior pedaço aceito (proteção da memória do servidor). O Meta costuma pedir bem menos. */
export const MAX_CHUNK_BYTES = 40 * 1024 * 1024;
/** Maior vídeo aceito nesta fase. */
export const MAX_BIG_VIDEO_BYTES = 500 * 1024 * 1024;

export function newUploadState(fileSize: number): UploadState {
  return { status: "enviando", fileSize, uploadSessionId: "", metaVideoId: "", startOffset: 0, endOffset: 0, thumbnail: "", errorMessage: "" };
}

/**
 * Avança o envio até `budgetMs` (ou até terminar). Devolve o estado novo para quem chama gravar.
 * Erros do Meta ou do Drive viram `errorMessage` mantendo a posição: tentar de novo continua do mesmo ponto.
 */
export async function uploadStep(deps: UploadDeps, state: UploadState, budgetMs = 45_000): Promise<UploadState> {
  const s: UploadState = { ...state, errorMessage: "" };
  const deadline = deps.now() + budgetMs;
  try {
    if (s.status === "enviando" && !s.uploadSessionId) {
      const r = await deps.start(s.fileSize);
      Object.assign(s, { uploadSessionId: r.uploadSessionId, metaVideoId: r.videoId, startOffset: r.startOffset, endOffset: r.endOffset });
    }
    while (s.status === "enviando" && deps.now() < deadline) {
      if (s.startOffset >= s.endOffset) {
        await deps.finish(s.uploadSessionId);
        s.status = "processando";
        break;
      }
      if (s.endOffset - s.startOffset > MAX_CHUNK_BYTES) throw new Error("O Meta pediu um pedaço grande demais para o servidor. Tente de novo em alguns minutos.");
      const chunk = await deps.readRange(s.startOffset, s.endOffset);
      if (chunk.length !== s.endOffset - s.startOffset) throw new Error("O Google Drive devolveu um pedaço incompleto do vídeo. Tente de novo.");
      const r = await deps.transfer(s.uploadSessionId, s.startOffset, chunk);
      s.startOffset = r.startOffset;
      s.endOffset = r.endOffset;
    }
    if (s.status === "processando") {
      const v = await deps.videoStatus(s.metaVideoId);
      if (v.status === "error") { s.status = "falhou"; s.errorMessage = "O Meta não conseguiu processar o vídeo. Tente outro arquivo (MP4 com H.264)."; }
      else if (v.status === "ready") {
        if (!v.picture.startsWith("https://")) s.errorMessage = "O Meta ainda não gerou a miniatura. Aguarde um pouco.";
        else { s.status = "pronto"; s.thumbnail = v.picture; }
      }
    }
  } catch (err) {
    s.errorMessage = (err instanceof Error ? err.message : "Erro no envio do vídeo.").slice(0, 400);
  }
  return s;
}

/** Quanto já foi enviado (0 a 1), para a barra de andamento. */
export function uploadProgress(s: UploadState): number {
  if (s.status === "pronto" || s.status === "processando") return 1;
  return s.fileSize > 0 ? Math.min(1, s.startOffset / s.fileSize) : 0;
}
