import { Bot, ExternalLink, KeyRound } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { Alert } from "@/components/ui/alert.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Card } from "@/components/ui/card.tsx";
import { Field, Input } from "@/components/ui/field.tsx";
import { errorMessage } from "@/lib/errors.ts";
import { formatDateTime, formatRelative } from "@/lib/format.ts";
import { useWaAiRemoveKey, useWaAiSave, useWaAiSettings, useWaSuggestionDecide, type WaSuggestion } from "./api.ts";

const CONF: Record<WaSuggestion["confidence"], { label: string; tone: "success" | "warning" | "neutral" }> = {
  alta: { label: "Confiança alta", tone: "success" },
  media: { label: "Confiança média", tone: "warning" },
  baixa: { label: "Confiança baixa", tone: "neutral" },
};

function AiCard() {
  const settings = useWaAiSettings(true);
  const save = useWaAiSave();
  const removeKey = useWaAiRemoveKey();
  const [key, setKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const s = settings.data;

  async function run(fn: () => Promise<unknown>, done?: () => void) {
    setError(null);
    try {
      await fn();
      done?.();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <Card className="space-y-3 p-4" data-testid="wa-ai-card">
      <div className="flex flex-wrap items-center gap-2">
        <Bot className="size-4 text-blue-600" aria-hidden />
        <h3 className="font-medium text-slate-900">IA que sugere vendas</h3>
        <Badge tone={s?.enabled ? "success" : "neutral"}>{s?.enabled ? "Ligada" : "Desligada"}</Badge>
      </div>
      <p className="text-sm text-slate-600">
        Uma vez por dia (3h da manhã), a IA lê as conversas do dia dos sites com “Guardar o texto por 2 dias” ligado e sugere onde pode ter havido venda.
        Ela <strong>só sugere</strong>: você confere a conversa no WhatsApp e marca a venda no Contato, como sempre.
      </p>
      {error && <Alert tone="error">{error}</Alert>}
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-64 flex-1">
          <Field label={s?.has_key ? "Trocar a chave da Anthropic" : "Chave da Anthropic (começa com sk-ant-)"}>
            {(id) => <Input id={id} type="password" autoComplete="off" value={key} placeholder={s?.has_key ? "•••••••• (já cadastrada)" : "sk-ant-..."} onChange={(e) => setKey(e.target.value)} />}
          </Field>
        </div>
        <Button loading={save.isPending} disabled={!key.trim()} onClick={() => run(() => save.mutateAsync({ apiKey: key.trim() }), () => setKey(""))}>
          <KeyRound className="size-4" aria-hidden /> Salvar chave
        </Button>
        {s?.has_key && (
          <Button variant="secondary" loading={removeKey.isPending}
            onClick={() => { if (window.confirm("Remover a chave? A IA para de rodar.")) void run(() => removeKey.mutateAsync()); }}>
            Remover chave
          </Button>
        )}
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={!!s?.enabled} disabled={!s?.has_key} aria-label="Ligar a IA"
          onChange={(e) => run(() => save.mutateAsync({ enabled: e.target.checked }))} />
        <span className="font-medium">Ligar a IA</span>
        {!s?.has_key && <span className="text-xs text-slate-500">(cole a chave primeiro)</span>}
      </label>
      {s?.last_run_at && (
        <p className="text-xs text-slate-500" data-testid="wa-ai-last">
          Última rodada {formatRelative(s.last_run_at)}: {s.last_run_ok ? `${s.last_run_count ?? 0} sugestão(ões) nova(s).` : s.last_run_error ?? "falhou."}
        </p>
      )}
      <p className="text-xs text-slate-500">A chave fica guardada no cofre do servidor e nunca volta para a tela. O texto das conversas fica 2 dias e é apagado sozinho.</p>
    </Card>
  );
}

function Row({ s, client, onDecide, busy, pending }: {
  s: WaSuggestion;
  client: string;
  onDecide: (status: "confirmada" | "descartada" | "pendente") => void;
  busy: boolean;
  pending: boolean;
}) {
  const who = [s.push_name, s.phone_tail ? `final ${s.phone_tail}` : null].filter(Boolean).join(" · ") || "Contato sem nome";
  return (
    <li className="space-y-2 p-4" data-testid="wa-suggestion">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium text-slate-900">{who}</span>
        <span className="text-xs text-slate-500">{client}</span>
        <Badge tone={CONF[s.confidence].tone}>{CONF[s.confidence].label}</Badge>
        {!pending && <Badge tone={s.status === "confirmada" ? "success" : "neutral"}>{s.status === "confirmada" ? "Venda confirmada" : "Descartada"}</Badge>}
        <span className="ml-auto text-xs text-slate-500">Conversa de {formatDateTime(`${s.day}T12:00:00`).split(",")[0]}</span>
      </div>
      <p className="text-sm text-slate-700">{s.reason}</p>
      <div className="flex flex-wrap items-center gap-2">
        {pending ? (
          <>
            <Button className="px-3 py-1.5 text-xs" loading={busy} onClick={() => onDecide("confirmada")}>Houve venda</Button>
            <Button variant="secondary" className="px-3 py-1.5 text-xs" loading={busy} onClick={() => onDecide("descartada")}>Descartar</Button>
          </>
        ) : (
          <>
            <Button variant="ghost" className="px-3 py-1.5 text-xs" loading={busy} onClick={() => onDecide("pendente")}>Voltar para pendente</Button>
            <span className="text-xs text-slate-500">{s.expires_at ? `Some sozinha ${formatRelative(s.expires_at)}.` : ""}</span>
          </>
        )}
        <Link to="/contatos" className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-blue-700 hover:underline">
          <ExternalLink className="size-3.5" aria-hidden /> Marcar a venda em Contatos
        </Link>
      </div>
    </li>
  );
}

/**
 * Vendas sugeridas pela IA (Tracking T5.6). A IA lê as conversas do dia e SUGERE; quem decide é a pessoa, depois de conferir
 * a conversa no WhatsApp. "Houve venda" só anota a decisão — a venda em si é marcada no Contato (que alimenta a API de Conversões).
 * Decidida, a sugestão some sozinha em 30 dias.
 */
export function SuggestionsSection({ suggestions, clientName, isAdmin }: {
  suggestions: WaSuggestion[];
  clientName: (id: string) => string;
  isAdmin: boolean;
}) {
  const decide = useWaSuggestionDecide();
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const pending = suggestions.filter((s) => s.status === "pendente");
  const decided = suggestions.filter((s) => s.status !== "pendente");

  async function onDecide(id: string, status: "confirmada" | "descartada" | "pendente") {
    setError(null);
    setBusyId(id);
    try {
      await decide.mutateAsync({ id, status });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-4" data-testid="wa-suggestions">
      {isAdmin && <AiCard />}
      {error && <Alert tone="error">{error}</Alert>}
      <Card className="overflow-hidden">
        <div className="border-b border-slate-100 p-4">
          <h3 className="font-medium text-slate-900">Para conferir ({pending.length})</h3>
          <p className="text-sm text-slate-600">Abra a conversa no WhatsApp. Se houve venda, clique em “Houve venda” e marque a venda no Contato.</p>
        </div>
        {pending.length === 0 ? (
          <p className="p-4 text-sm text-slate-500" data-testid="wa-suggestions-empty">Nenhuma sugestão pendente. A IA roda uma vez por dia, de madrugada.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {pending.map((s) => <Row key={s.id} s={s} client={clientName(s.client_id)} pending busy={busyId === s.id} onDecide={(st) => void onDecide(s.id, st)} />)}
          </ul>
        )}
      </Card>
      {decided.length > 0 && (
        <Card className="overflow-hidden">
          <div className="border-b border-slate-100 p-4">
            <h3 className="font-medium text-slate-900">Já decididas ({decided.length})</h3>
            <p className="text-sm text-slate-600">Ficam 30 dias depois da decisão e somem sozinhas.</p>
          </div>
          <ul className="divide-y divide-slate-100">
            {decided.map((s) => <Row key={s.id} s={s} client={clientName(s.client_id)} pending={false} busy={busyId === s.id} onDecide={(st) => void onDecide(s.id, st)} />)}
          </ul>
        </Card>
      )}
    </div>
  );
}
