import { eventLabel } from "@backstage/shared";
import { type FormEvent, useState } from "react";
import { Alert } from "@/components/ui/alert.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Field, Input } from "@/components/ui/field.tsx";
import { Modal } from "@/components/ui/modal.tsx";
import { errorMessage } from "@/lib/errors.ts";
import { formatDateTime, formatRelative } from "@/lib/format.ts";
import { type CapiOverview, type Destination, type TrackingContainer, useCapiLog, useDestinationAction } from "./api.ts";
import { CAPI_EVENT_OPTIONS, capiStatus, DEFAULT_CAPI_EVENTS } from "./logic.ts";

const TONE = { neutral: "neutral", warning: "warning", danger: "danger", success: "success" } as const;

export function MetaCapiModal({ container, destination, overview, canManage, onClose }: {
  container: TrackingContainer;
  destination: Destination | undefined;
  overview: CapiOverview | undefined;
  canManage: boolean;
  onClose: () => void;
}) {
  const action = useDestinationAction();
  const log = useCapiLog(destination?.id ?? null);
  const [pixelId, setPixelId] = useState(destination?.pixel_id ?? "");
  const [token, setToken] = useState("");
  const [testCode, setTestCode] = useState(destination?.test_event_code ?? "");
  const [events, setEvents] = useState<string[]>(destination?.send_events ?? DEFAULT_CAPI_EVENTS);
  const [enabled, setEnabled] = useState(destination?.enabled ?? false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const status = capiStatus(destination, overview);

  const toggleEvent = (name: string) => setEvents((list) => (list.includes(name) ? list.filter((e) => e !== name) : [...list, name]));

  /** ok() devolve a mensagem de sucesso, ou { error } quando o Meta respondeu mas recusou. */
  async function run(body: Parameters<typeof action.mutateAsync>[0], ok: (r: Record<string, unknown>) => string | { error: string }) {
    setError(null);
    setNotice(null);
    try {
      const r = await action.mutateAsync(body);
      const msg = ok(r);
      if (typeof msg === "string") setNotice(msg);
      else setError(msg.error);
      setToken("");
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  function onSave(e: FormEvent) {
    e.preventDefault();
    if (!/^\d{5,20}$/.test(pixelId.trim())) return setError("O ID do Pixel tem só números (5 a 20). Fica no Gerenciador de Eventos, abaixo do nome do Pixel.");
    if (events.length === 0) return setError("Escolha pelo menos um evento para enviar.");
    void run(
      { action: "save", containerId: container.id, pixelId: pixelId.trim(), token: token.trim() || undefined, testEventCode: testCode.trim() || null, sendEvents: events, enabled },
      () => (enabled ? "Salvo. O envio ao Meta está ligado." : "Salvo. O envio ao Meta está desligado."),
    );
  }

  return (
    <Modal title={`Meta — API de Conversões — ${container.name}`} open onClose={onClose} size="lg">
      <div className="space-y-4 text-sm">
        <div className="flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 p-3" data-testid="capi-status">
          <Badge tone={TONE[status.tone]}>{status.label}</Badge>
          <span className="text-slate-600">{status.detail}</span>
          {destination?.last_success_at && <span className="text-xs text-slate-500">Último envio com sucesso {formatRelative(destination.last_success_at)}.</span>}
        </div>

        {overview && (
          <dl className="grid grid-cols-2 gap-2 text-center text-xs text-slate-500 sm:grid-cols-4" data-testid="capi-numbers">
            <div className="rounded-lg bg-slate-50 p-2"><dt>Na fila</dt><dd className="text-base font-semibold text-slate-900">{overview.pending}</dd></div>
            <div className="rounded-lg bg-slate-50 p-2"><dt>Enviados (24 h)</dt><dd className="text-base font-semibold text-slate-900">{overview.sent_24h}</dd></div>
            <div className="rounded-lg bg-slate-50 p-2"><dt>Com erro</dt><dd className="text-base font-semibold text-slate-900">{overview.errors_24h}</dd></div>
            <div className="rounded-lg bg-slate-50 p-2"><dt>Não enviados (24 h)</dt><dd className="text-base font-semibold text-slate-900">{overview.discarded_24h}</dd></div>
          </dl>
        )}

        {error && <Alert tone="error">{error}</Alert>}
        {notice && <Alert tone="success">{notice}</Alert>}

        {canManage ? (
          <form onSubmit={onSave} className="space-y-4" noValidate>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="ID do Pixel (conjunto de dados) *" hint="Gerenciador de Eventos → seu Pixel → número abaixo do nome.">
                {(id) => <Input id={id} value={pixelId} onChange={(e) => setPixelId(e.target.value)} inputMode="numeric" placeholder="123456789012345" />}
              </Field>
              <Field
                label={destination?.has_token ? "Token da API de Conversões (salvo)" : "Token da API de Conversões *"}
                hint="Gerenciador de Eventos → Configurações → API de Conversões → Gerar token. Fica guardado no cofre e nunca aparece de novo."
              >
                {(id) => (
                  <Input id={id} type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)}
                    placeholder={destination?.has_token ? "•••••• salvo (deixe vazio para manter)" : "Cole o token aqui"} />
                )}
              </Field>
              <Field label="Código de teste (opcional)" hint="Gerenciador de Eventos → Testar eventos. Com ele, nada conta como conversão real.">
                {(id) => <Input id={id} value={testCode} onChange={(e) => setTestCode(e.target.value)} placeholder="TEST12345" />}
              </Field>
              <label className="flex items-start gap-2 self-end rounded-lg bg-slate-50 p-3">
                <input type="checkbox" className="mt-0.5" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
                <span>
                  <span className="font-medium text-slate-800">Enviar eventos ao Meta</span>
                  <span className="block text-xs text-slate-500">Os eventos escolhidos abaixo vão para o Pixel pelo servidor, a cada minuto.</span>
                </span>
              </label>
            </div>
            <fieldset>
              <legend className="mb-2 font-medium text-slate-700">Eventos enviados</legend>
              <div className="flex flex-wrap gap-2">
                {CAPI_EVENT_OPTIONS.map((name) => (
                  <label key={name} className="flex items-center gap-1.5 rounded-lg bg-slate-50 px-2.5 py-1.5">
                    <input type="checkbox" checked={events.includes(name)} onChange={() => toggleEvent(name)} />
                    {eventLabel(name)}
                  </label>
                ))}
              </div>
              <p className="mt-1 text-xs text-slate-500">
                Site em modo teste só envia com código de teste. Página vista gera muito volume: ligue só se precisar.
              </p>
            </fieldset>
            <div className="flex flex-wrap justify-between gap-2 pt-1">
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="secondary" disabled={!destination?.has_token || action.isPending}
                  onClick={() => run({ action: "test", containerId: container.id }, (r) =>
                    r.ok ? `Evento de teste recebido pelo Meta (${r.eventsReceived ?? 1}). Confira em “Testar eventos”.` : { error: String(r.message ?? "O Meta recusou o teste.") })}>
                  Enviar evento de teste
                </Button>
                {destination?.has_token && (
                  <Button type="button" variant="ghost" disabled={action.isPending}
                    onClick={() => run({ action: "remove_token", containerId: container.id }, () => "Token apagado. O envio foi desligado.")}>
                    Apagar token
                  </Button>
                )}
              </div>
              <Button type="submit" loading={action.isPending}>Salvar</Button>
            </div>
          </form>
        ) : (
          <p className="text-slate-500">Só administradores e gestores configuram o envio ao Meta.</p>
        )}

        {destination && (
          <section aria-label="Últimas chamadas ao Meta" className="space-y-2">
            <h3 className="font-medium text-slate-800">Últimas chamadas ao Meta</h3>
            <ul className="divide-y divide-slate-100 rounded-lg ring-1 ring-slate-200" data-testid="capi-log">
              {(log.data ?? []).map((l) => (
                <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-xs">
                  <span className="flex items-center gap-2">
                    <Badge tone={l.error_message ? "danger" : "success"}>{l.error_message ? "Erro" : "OK"}</Badge>
                    {l.kind === "teste" ? "Teste" : `${l.events_count} ${l.events_count === 1 ? "evento" : "eventos"}`}
                    {l.test && l.kind !== "teste" && " (código de teste)"}
                    {l.error_message && <span className="text-red-700">{l.error_message}</span>}
                  </span>
                  <span className="text-slate-500">{formatDateTime(l.requested_at)}</span>
                </li>
              ))}
              {(log.data ?? []).length === 0 && <li className="px-3 py-3 text-center text-xs text-slate-500">Nenhuma chamada ainda.</li>}
            </ul>
          </section>
        )}
        <div className="flex justify-end">
          <Button type="button" variant="secondary" onClick={onClose}>Fechar</Button>
        </div>
      </div>
    </Modal>
  );
}
