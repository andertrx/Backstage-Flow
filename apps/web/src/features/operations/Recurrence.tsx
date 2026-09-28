import {
  OPS_RECURRENCE_FREQUENCIES, OPS_RECURRENCE_LABELS, OPS_WEEKDAY_SHORT, opsAddDays, opsCan, opsNextOccurrences, opsRecurrenceText, opsToday,
  type OpsPermission, type OpsRecurrenceFrequency,
} from "@backstage/shared";
import { Repeat } from "lucide-react";
import { type FormEvent, useState } from "react";
import { Alert } from "@/components/ui/alert.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Field, Input, Select } from "@/components/ui/field.tsx";
import { Modal } from "@/components/ui/modal.tsx";
import { cn } from "@/lib/cn.ts";
import { errorMessage } from "@/lib/errors.ts";
import { formatDate } from "@/lib/format.ts";
import { useMyOpsPermissions } from "./api.ts";
import { useRecurrence, useSaveRecurrence, useStopRecurrence } from "./notificationsApi.ts";

type Kind = "tarefa" | "reuniao";

function RecurrenceModal({ kind, sourceId, onClose }: { kind: Kind; sourceId: string; onClose: () => void }) {
  const tomorrow = opsAddDays(opsToday(), 1);
  const [frequency, setFrequency] = useState<OpsRecurrenceFrequency>("dias_uteis");
  const [weekdays, setWeekdays] = useState<number[]>([1]);
  const [monthDay, setMonthDay] = useState(tomorrow.slice(8, 10).replace(/^0/, ""));
  const [start, setStart] = useState(tomorrow);
  const [end, setEnd] = useState("");
  const [error, setError] = useState<string | null>(null);
  const save = useSaveRecurrence();
  const rule = { frequency, weekdays, month_day: Number(monthDay) || null };
  const preview = start ? opsNextOccurrences(rule, start, 5, end || null) : [];

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (frequency === "semanal" && weekdays.length === 0) return setError("Escolha os dias da semana.");
    if (frequency === "mensal" && !(Number(monthDay) >= 1 && Number(monthDay) <= 31)) return setError("Escolha o dia do mês (1 a 31).");
    if (!start || start <= opsToday()) return setError("A repetição começa a partir de amanhã.");
    try {
      await save.mutateAsync({ kind, source_id: sourceId, frequency, weekdays, month_day: monthDay, start_date: start, end_date: end });
      onClose();
    } catch (err) { setError(errorMessage(err)); }
  }

  return (
    <Modal title={kind === "tarefa" ? "Repetir esta tarefa" : "Repetir esta reunião"} open onClose={onClose}>
      <form onSubmit={submit} className="space-y-4" data-testid="ops-recurrence-form">
        <Field label="Frequência">
          {(id) => (
            <Select id={id} value={frequency} onChange={(e) => setFrequency(e.target.value as OpsRecurrenceFrequency)}>
              {OPS_RECURRENCE_FREQUENCIES.map((f) => <option key={f} value={f}>{OPS_RECURRENCE_LABELS[f]}</option>)}
            </Select>
          )}
        </Field>
        {frequency === "semanal" && (
          <fieldset className="space-y-1">
            <legend className="text-sm font-medium text-slate-700">Dias da semana</legend>
            <div className="flex flex-wrap gap-1.5">
              {OPS_WEEKDAY_SHORT.map((d, i) => (
                <label key={d} className={cn("cursor-pointer rounded-lg px-2.5 py-1 text-sm ring-1 ring-inset",
                  weekdays.includes(i) ? "bg-blue-600 text-white ring-blue-600" : "bg-white text-slate-700 ring-slate-200")}>
                  <input type="checkbox" className="sr-only" checked={weekdays.includes(i)}
                    onChange={() => setWeekdays((w) => (w.includes(i) ? w.filter((x) => x !== i) : [...w, i]))} />{d}
                </label>
              ))}
            </div>
          </fieldset>
        )}
        {frequency === "mensal" && (
          <Field label="Dia do mês" hint="Em meses mais curtos, vale o último dia.">
            {(id) => <Input id={id} type="number" min={1} max={31} value={monthDay} onChange={(e) => setMonthDay(e.target.value)} />}
          </Field>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Começa em">{(id) => <Input id={id} type="date" min={tomorrow} value={start} onChange={(e) => setStart(e.target.value)} />}</Field>
          <Field label="Termina em" hint="Opcional.">{(id) => <Input id={id} type="date" min={start} value={end} onChange={(e) => setEnd(e.target.value)} />}</Field>
        </div>
        <p className="rounded-lg bg-slate-50 p-2 text-sm text-slate-700" data-testid="ops-recurrence-preview">
          Próximas: {preview.length ? preview.map(formatDate).join(", ") : "nenhuma data nesse período"}
        </p>
        <p className="text-xs text-slate-500">
          {kind === "tarefa"
            ? "Cada dia vira uma tarefa própria, criada de madrugada, com as mesmas pessoas, setor, cliente e prazo relativo."
            : "Cada dia vira uma reunião própria, no mesmo horário e com os mesmos participantes. Aparece na agenda com 7 dias de antecedência."}
        </p>
        {error && <Alert tone="error">{error}</Alert>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" loading={save.isPending}>Repetir</Button>
        </div>
      </form>
    </Modal>
  );
}

/**
 * Repetição da tarefa/reunião: mostra a regra (no modelo ou numa ocorrência),
 * permite criar ("Repetir…") e parar. O banco confere quem pode.
 */
export function RecurrencePanel({ kind, id, blocked, permission }: { kind: Kind; id: string; blocked: boolean; permission: OpsPermission }) {
  const rec = useRecurrence(kind, id);
  const perms = useMyOpsPermissions();
  const stop = useStopRecurrence();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const r = rec.data;
  const canCreate = opsCan(perms.data, permission) && !blocked && !(r && (r.active || !r.is_source));
  if (rec.isLoading || (!r && !canCreate)) return null;

  async function doStop() {
    if (!r) return;
    setError(null);
    try { await stop.mutateAsync(r.id); } catch (err) { setError(errorMessage(err)); }
  }

  return (
    <section className="space-y-2 rounded-xl bg-slate-50 p-3" data-testid="ops-recurrence">
      <div className="flex flex-wrap items-center gap-2">
        <Repeat className="size-4 text-blue-600" aria-hidden />
        {r ? (
          <p className="min-w-0 flex-1 text-sm text-slate-700">
            {r.is_source ? "" : `Repetição da ${kind === "tarefa" ? "tarefa" : "reunião"} #${r.source_number} · `}
            <b>{opsRecurrenceText(r)}</b> · desde {formatDate(r.start_date)}{r.end_date ? ` até ${formatDate(r.end_date)}` : ""}
            {r.active ? ` · ${r.occurrences} criada(s)` : ` · ${r.stop_reason ?? "parada"}`}
          </p>
        ) : <p className="min-w-0 flex-1 text-sm text-slate-500">Não se repete.</p>}
        {r?.active && r.can_stop && (
          <Button variant="secondary" className="px-2.5 py-1 text-xs" loading={stop.isPending} onClick={doStop}>Parar de repetir</Button>
        )}
        {canCreate && <Button variant="secondary" className="px-2.5 py-1 text-xs" onClick={() => setOpen(true)}>Repetir…</Button>}
      </div>
      {error && <Alert tone="error">{error}</Alert>}
      {open && <div onMouseDown={(e) => e.stopPropagation()}><RecurrenceModal kind={kind} sourceId={id} onClose={() => setOpen(false)} /></div>}
    </section>
  );
}
