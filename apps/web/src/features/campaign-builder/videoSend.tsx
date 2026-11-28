/**
 * Fases J.4 e J.6 — envio de vídeo do Drive para o Meta EM PARTES, usado pela esteira e pelo Criar campanha.
 * Cada chamada ao servidor avança um pouco; se a página fechar, o próximo clique continua de onde parou.
 */
import { videoUploadStep } from "./api.ts";
import { errorMessage } from "@/lib/errors.ts";

export const mb = (n: number) => `${(n / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;

export interface SendProgress { done: number; total: number; name: string; pct: number | null; note: string }

export type SendResult = { ok: true; videoId: string; thumbnail: string } | { ok: false; error: string };

/** Envia UM vídeo até ficar pronto no Meta. `onStep` recebe a porcentagem e o texto do andamento. */
export async function sendVideo(draftId: string, file: { fileId: string; name: string }, onStep: (pct: number, note: string) => void): Promise<SendResult> {
  try {
    for (let step = 0; step < 400; step++) {
      const r = await videoUploadStep(draftId, file.fileId);
      if (r.status === "pronto" && r.videoId && r.thumbnail) return { ok: true, videoId: r.videoId, thumbnail: r.thumbnail };
      if (r.status === "falhou" || r.error) return { ok: false, error: `"${file.name}": ${r.error ?? "o Meta não aceitou o vídeo."} Clique de novo para continuar de onde parou.` };
      onStep(r.total ? Math.round((r.sent / r.total) * 100) : 0, r.status === "processando" ? "O Meta está processando o vídeo..." : `${mb(r.sent)} de ${mb(r.total)}`);
      if (r.status === "processando") await new Promise((res) => setTimeout(res, 4000));
    }
    return { ok: false, error: `"${file.name}": o envio está demorando mais que o normal. Clique de novo para continuar.` };
  } catch (e) {
    return { ok: false, error: `"${file.name}": ${errorMessage(e)}` };
  }
}

/** Andamento do envio: qual arquivo, quanto já foi e a barra. */
export function SendProgressView({ sending, testId }: { sending: SendProgress; testId: string }) {
  return (
    <div className="space-y-1 text-xs text-slate-600" role="status" data-testid={`${testId}-andamento`}>
      <p>Enviando {sending.done + 1} de {sending.total}: {sending.name}{sending.note ? ` (${sending.note})` : ""}.</p>
      {sending.pct !== null && (
        <div className="h-1.5 overflow-hidden rounded-full bg-slate-100" aria-label={`${sending.pct}% enviado`}>
          <div className="h-full rounded-full bg-blue-600 transition-[width] duration-300" style={{ width: `${sending.pct}%` }} data-testid={`${testId}-barra`} />
        </div>
      )}
      <p className="text-slate-400">Vídeos vão em partes (até 500 MB): pode fechar a página, o envio continua de onde parou quando você voltar e clicar de novo.</p>
    </div>
  );
}
