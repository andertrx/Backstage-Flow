import { nextScheduledRead } from "@backstage/shared";
import { CheckCircle2, Clock, Loader2, PauseCircle, RefreshCw, XCircle } from "lucide-react";
import { useState } from "react";
import { Alert } from "@/components/ui/alert.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Card } from "@/components/ui/card.tsx";
import { errorMessage } from "@/lib/errors.ts";
import { formatDateTime } from "@/lib/format.ts";
import { type RiSource, useReadNow, useRiReadInfo, useSetSourceEnabled } from "./api.ts";

type Situation = "lendo" | "ok" | "erro" | "desativada" | "nunca";

const SITUATIONS: Record<Situation, { label: string; tone: string; Icon: typeof CheckCircle2 }> = {
  lendo: { label: "Lendo a planilha…", tone: "bg-blue-50 text-blue-800 ring-blue-200", Icon: Loader2 },
  ok: { label: "Atualizado", tone: "bg-emerald-50 text-emerald-800 ring-emerald-200", Icon: CheckCircle2 },
  erro: { label: "Falha na última leitura", tone: "bg-red-50 text-red-800 ring-red-200", Icon: XCircle },
  desativada: { label: "Leitura automática desligada", tone: "bg-slate-100 text-slate-700 ring-slate-200", Icon: PauseCircle },
  nunca: { label: "Aguardando a primeira leitura", tone: "bg-amber-50 text-amber-800 ring-amber-200", Icon: Clock },
};

export function situationOf(s: Pick<RiSource, "read_status" | "enabled">): Situation {
  if (s.read_status === "lendo") return "lendo";
  if (s.read_status === "erro") return "erro";
  if (!s.enabled) return "desativada";
  return s.read_status === "ok" ? "ok" : "nunca";
}

const fmtTime = (d: Date) => d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "short", hour: "2-digit", minute: "2-digit" });

/**
 * Etapa 39.2 — situação da leitura da planilha: última leitura boa, próxima
 * leitura automática (8h, 12h e 16h de Brasília), falhas e o botão "Atualizar agora".
 */
export function ReadStatusCard({ source, canRead, canManage }: { source: RiSource; canRead: boolean; canManage: boolean }) {
  const read = useRiReadInfo(source.id, source.last_success_at);
  const readNow = useReadNow(source.client_id);
  const setEnabled = useSetSourceEnabled(source.client_id);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const situation = situationOf(source);
  const look = SITUATIONS[situation];
  const info = read.data;
  const st = info?.stats ?? {};
  const stale = source.consecutive_failures >= 2 && source.last_success_at != null;

  async function run(fn: () => Promise<string>) {
    setMessage(null);
    try { setMessage({ tone: "success", text: await fn() }); } catch (err) { setMessage({ tone: "error", text: errorMessage(err) }); }
  }

  const quality: [string, number | undefined][] = [
    ["sem perfil preenchido", st.noProfile],
    ["sem campanha, conjunto ou anúncio", st.noOrigin],
    ["sem data", st.noDate],
    ["com data inválida", st.invalidDates],
    ["com ID repetido (contou uma vez)", st.duplicates],
    ["com ID de anúncio inválido", st.invalidIds],
  ];

  return (
    <Card className="space-y-4 p-5" data-testid="ri-read-status">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <span className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${look.tone}`} data-testid="ri-situation" data-situation={situation}>
            <look.Icon className={`size-3.5 ${situation === "lendo" ? "animate-spin" : ""}`} aria-hidden /> {look.label}
          </span>
          <p className="text-sm text-slate-700" data-testid="ri-last-read">
            {source.last_success_at
              ? <>Dados da planilha de <strong>{formatDateTime(source.last_success_at)}</strong>{info && <> · {info.row_count.toLocaleString("pt-BR")} linha(s) · {info.trigger === "manual" ? "atualizada pelo botão" : "leitura automática"}</>}</>
              : "A planilha ainda não foi lida."}
          </p>
          <p className="text-xs text-slate-500" data-testid="ri-next-read">
            {source.enabled
              ? <>Próxima leitura automática: {fmtTime(nextScheduledRead())} (todos os dias às 8h, 12h e 16h, horário de Brasília).</>
              : "A leitura automática está desligada. Os dados só mudam pelo botão \"Atualizar agora\"."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canRead && (
            <Button type="button" variant="secondary" loading={readNow.isPending} disabled={situation === "lendo"}
              onClick={() => run(async () => `Planilha lida agora: ${(await readNow.mutateAsync(source.id)).rows.toLocaleString("pt-BR")} linha(s).`)}>
              {!readNow.isPending && <RefreshCw className="size-4" aria-hidden />} Atualizar agora
            </Button>
          )}
          {canManage && (
            <Button type="button" variant="ghost" loading={setEnabled.isPending}
              onClick={() => run(async () => {
                await setEnabled.mutateAsync({ id: source.id, enabled: !source.enabled });
                return source.enabled ? "Leitura automática desligada." : "Leitura automática ligada (8h, 12h e 16h).";
              })}>
              {source.enabled ? "Desligar leitura automática" : "Ligar leitura automática"}
            </Button>
          )}
        </div>
      </div>

      {source.read_status === "erro" && source.last_error && (
        <Alert tone="error">
          <span data-testid="ri-last-error">{source.last_error}</span>
          {source.last_success_at && <span className="block text-xs">Os números continuam os da última leitura boa ({formatDateTime(source.last_success_at)}).</span>}
        </Alert>
      )}
      {stale && (
        <Alert tone="warning">
          <span data-testid="ri-stale">Dados desatualizados: as últimas {source.consecutive_failures} leituras falharam.</span>
        </Alert>
      )}
      {/* A falha da leitura já aparece no aviso acima; não repete o mesmo texto. */}
      {message && !(message.tone === "error" && message.text === source.last_error) && <Alert tone={message.tone}>{message.text}</Alert>}

      {info && (
        <div className="space-y-1 text-sm" data-testid="ri-read-quality">
          <p className="font-medium text-slate-700">Qualidade da última leitura</p>
          <ul className="grid gap-x-6 gap-y-0.5 text-slate-600 sm:grid-cols-2">
            <li>{(st.total ?? info.row_count).toLocaleString("pt-BR")} linha(s) com conteúdo na planilha</li>
            {quality.filter(([, n]) => (n ?? 0) > 0).map(([label, n]) => (
              <li key={label}><strong className="text-slate-800">{n!.toLocaleString("pt-BR")}</strong> {label}</li>
            ))}
          </ul>
          {(st.missingColumns?.length ?? 0) > 0 && (
            <p className="text-xs text-amber-700">Colunas configuradas que não existem mais na planilha: {st.missingColumns!.join(", ")}. Confira a configuração.</p>
          )}
        </div>
      )}
    </Card>
  );
}
