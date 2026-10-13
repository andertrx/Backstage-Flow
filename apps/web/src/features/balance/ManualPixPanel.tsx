import { Plus } from "lucide-react";
import { type FormEvent, useState } from "react";
import { Alert } from "@/components/ui/alert.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Field, Input, Select } from "@/components/ui/field.tsx";
import { Modal } from "@/components/ui/modal.tsx";
import { errorMessage } from "@/lib/errors.ts";
import { formatMoney } from "@/lib/format.ts";
import { useAddManualBalance, useManualBalance, useVoidManualBalance } from "./api.ts";
import type { AccountBalance, ManualBalanceEntry } from "./types.ts";

const dateTime = (iso: string) => new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
const KIND_LABEL = { recarga: "Recarga PIX", saldo: "Saldo atual (conferido no Meta)" } as const;

/**
 * Saldo PIX informado no CRM (correção de 13/10/2026). Só aparece em contas marcadas:
 * o Meta informa só o cartão cadastrado e não informa o saldo carregado por PIX.
 * Disponível = partida + recargas depois − gasto que o Meta informa depois.
 */
export function ManualPixPanel({ balance: b, canManage }: { balance: AccountBalance; canManage: boolean }) {
  const { data, error } = useManualBalance(b.ad_account_id, true);
  const [adding, setAdding] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const currency = b.currency ?? "BRL";
  const money = (v: number | null | undefined) => (v == null ? "—" : formatMoney(v / 1_000_000, currency));
  const canEdit = canManage && (data?.can_edit ?? false);
  const entries = data?.entries ?? [];
  const shown = showAll ? entries : entries.slice(0, 3);

  return (
    <div className="space-y-2 rounded-lg border border-emerald-100 bg-emerald-50/50 p-3 text-sm" data-testid="manual-pix">
      <p className="text-xs text-slate-600">
        O Meta informa só o cartão cadastrado ({b.funding_description ?? "cartão"}) e não informa o saldo carregado por PIX.
        Por isso o saldo desta conta é <strong>informado no CRM</strong>: a cada recarga, registre o valor; o sistema desconta o
        gasto que o Meta informa depois disso.
      </p>
      {error && <Alert tone="error">{errorMessage(error)}</Alert>}
      {data && data.anchor_at && (
        <p className="text-xs text-slate-700" data-testid="manual-pix-calc">
          Desde {dateTime(data.anchor_at)}:{" "}
          {data.anchor_kind === "saldo" && <>saldo informado {money(data.base_micros)} + </>}
          recargas {money(data.topups_micros)} − gasto {money(data.spent_micros)} = <strong>{money(data.available_micros)}</strong>
        </p>
      )}
      {data && !data.anchor_at && (
        <p className="text-xs font-medium text-amber-800">Nenhuma recarga informada ainda. Registre a última recarga PIX ou o saldo atual que aparece no Meta.</p>
      )}

      {entries.length > 0 && (
        <ul className="divide-y divide-emerald-100" aria-label="Recargas informadas">
          {shown.map((e) => <EntryRow key={e.id} e={e} money={money} canEdit={canEdit} />)}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {canEdit && (
          <Button variant="secondary" className="px-3 py-1.5 text-xs" onClick={() => setAdding(true)} data-testid="manual-pix-add">
            <Plus className="size-3.5" aria-hidden /> Registrar recarga PIX
          </Button>
        )}
        {entries.length > 3 && (
          <button type="button" className="text-xs text-blue-700 hover:underline" onClick={() => setShowAll((v) => !v)}>
            {showAll ? "Mostrar menos" : `Ver todas (${entries.length})`}
          </button>
        )}
      </div>
      {adding && <AddModal balance={b} onClose={() => setAdding(false)} />}
    </div>
  );
}

function EntryRow({ e, money, canEdit }: { e: ManualBalanceEntry; money: (v: number) => string; canEdit: boolean }) {
  const voidEntry = useVoidManualBalance();
  const [confirming, setConfirming] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const voided = e.voided_at != null;
  return (
    <li className="py-1.5" data-testid="manual-pix-entry">
      <div className="flex items-start justify-between gap-2">
        <div className={voided ? "text-slate-400 line-through" : "text-slate-800"}>
          <span className="font-medium">{e.kind === "recarga" ? "Recarga PIX" : "Saldo atual"}</span> {money(e.amount_micros)}
          <span className="block text-xs text-slate-500 no-underline">
            {dateTime(e.entered_at)}{e.created_by_name ? ` · ${e.created_by_name}` : ""}{e.note ? ` · ${e.note}` : ""}
          </span>
        </div>
        {voided ? (
          <span className="shrink-0 text-xs text-slate-500">Cancelado{e.void_reason ? `: ${e.void_reason}` : ""}</span>
        ) : canEdit && !confirming ? (
          <button type="button" className="shrink-0 text-xs text-slate-500 hover:text-red-700 hover:underline" onClick={() => setConfirming(true)}>
            Cancelar
          </button>
        ) : null}
      </div>
      {confirming && (
        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
          <span>Cancelar este registro? Ele fica no histórico como cancelado.</span>
          <Button variant="secondary" className="px-2 py-1 text-xs" loading={voidEntry.isPending}
            onClick={async () => {
              setErr(null);
              try { await voidEntry.mutateAsync({ entryId: e.id, reason: null }); setConfirming(false); }
              catch (x) { setErr(errorMessage(x)); }
            }}>Sim, cancelar</Button>
          <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => setConfirming(false)}>Não</Button>
          {err && <span className="text-red-700">{err}</span>}
        </div>
      )}
    </li>
  );
}

function AddModal({ balance: b, onClose }: { balance: AccountBalance; onClose: () => void }) {
  const add = useAddManualBalance();
  const [kind, setKind] = useState<"recarga" | "saldo">("recarga");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const clean = amount.trim().replace(/\./g, "").replace(",", ".");
    const value = Number(clean);
    if (clean === "" || !Number.isFinite(value) || value < 0 || (kind === "recarga" && value === 0)) return setError("Informe um valor válido.");
    if (note.trim().length > 200) return setError("Observação muito longa (máximo 200 caracteres).");
    try {
      await add.mutateAsync({ adAccountId: b.ad_account_id, kind, amountMicros: Math.round(value * 100) * 10_000, note: note.trim() || null });
      onClose();
    } catch (err) {
      setError(errorMessage(err, "Não conseguimos registrar."));
    }
  };

  return (
    <Modal title="Registrar recarga PIX" open onClose={onClose}>
      <form onSubmit={submit} noValidate className="space-y-4">
        <p className="text-sm text-slate-600">Conta <strong>{b.name}</strong>. O valor vale a partir de agora; o gasto de antes não é descontado.</p>
        <Field label="O que você vai informar" hint={kind === "recarga"
          ? "Soma ao saldo. Use a cada PIX carregado no Meta."
          : "Substitui o saldo pelo valor que aparece hoje no Meta (Cobrança e pagamentos). Bom para começar ou para acertar diferenças."}>
          {(id) => (
            <Select id={id} value={kind} onChange={(e) => setKind(e.target.value as "recarga" | "saldo")}>
              <option value="recarga">{KIND_LABEL.recarga}</option>
              <option value="saldo">{KIND_LABEL.saldo}</option>
            </Select>
          )}
        </Field>
        <Field label={`Valor (${b.currency ?? "BRL"})`}>
          {(id) => <Input id={id} inputMode="decimal" placeholder="Ex.: 500,00" value={amount} onChange={(e) => setAmount(e.target.value)} />}
        </Field>
        <Field label="Observação" hint="Opcional.">
          {(id) => <Input id={id} maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} />}
        </Field>
        {error && <Alert tone="error">{error}</Alert>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" loading={add.isPending}>Registrar</Button>
        </div>
      </form>
    </Modal>
  );
}
