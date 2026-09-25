import { type FormEvent, useState } from "react";
import { Alert } from "@/components/ui/alert.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Field, Input } from "@/components/ui/field.tsx";
import { Modal } from "@/components/ui/modal.tsx";
import { errorMessage } from "@/lib/errors.ts";
import { useBalanceSettings } from "./api.ts";
import type { AccountBalance } from "./types.ts";

/** Quando avisar "saldo baixo": por dias restantes e/ou por valor mínimo. */
export function BalanceSettingsModal({ balance, onClose }: { balance: AccountBalance; onClose: () => void }) {
  const save = useBalanceSettings();
  const [days, setDays] = useState(String(balance.low_balance_days));
  const [amount, setAmount] = useState(
    balance.low_balance_amount_micros == null ? "" : String(balance.low_balance_amount_micros / 1_000_000).replace(".", ","),
  );
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const lowBalanceDays = Number(days);
    if (!Number.isInteger(lowBalanceDays) || lowBalanceDays < 1 || lowBalanceDays > 60) return setError("Informe de 1 a 60 dias.");
    const clean = amount.trim().replace(/\./g, "").replace(",", ".");
    const lowBalanceAmount = clean === "" ? null : Number(clean);
    if (lowBalanceAmount != null && (!Number.isFinite(lowBalanceAmount) || lowBalanceAmount < 0)) return setError("Valor mínimo inválido.");
    try {
      await save.mutateAsync({ adAccountId: balance.ad_account_id, lowBalanceDays, lowBalanceAmount });
      onClose();
    } catch (err) {
      setError(errorMessage(err, "Não conseguimos salvar."));
    }
  };

  return (
    <Modal title="Alerta de saldo baixo" open onClose={onClose}>
      <form onSubmit={submit} noValidate className="space-y-4">
        <p className="text-sm text-slate-600">
          Conta <strong>{balance.name}</strong>. O alerta aparece quando <strong>qualquer</strong> das regras abaixo for atingida.
        </p>
        <Field label="Avisar quando o saldo durar menos de (dias)" hint="Com base no gasto médio dos últimos 7 dias.">
          {(id) => <Input id={id} type="number" min={1} max={60} value={days} onChange={(e) => setDays(e.target.value)} />}
        </Field>
        <Field label={`Avisar quando o disponível for até (${balance.currency ?? "moeda da conta"})`} hint="Opcional. Deixe vazio para não usar.">
          {(id) => <Input id={id} inputMode="decimal" placeholder="Ex.: 200,00" value={amount} onChange={(e) => setAmount(e.target.value)} />}
        </Field>
        {error && <Alert tone="error">{error}</Alert>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" loading={save.isPending}>Salvar</Button>
        </div>
      </form>
    </Modal>
  );
}
