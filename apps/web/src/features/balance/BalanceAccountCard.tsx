import { type AdAccountStatus, assessBalance, describeForecast, formatAccountId, getPlatform, paymentKind, platformName, shownAvailableMicros } from "@backstage/shared";
import { RefreshCw, Settings2 } from "lucide-react";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Card } from "@/components/ui/card.tsx";
import { InfoTooltip } from "@/components/ui/tooltip.tsx";
import { AccountStatusBadge } from "@/features/ad-accounts/AccountStatusBadge.tsx";
import { cn } from "@/lib/cn.ts";
import { formatMoney } from "@/lib/format.ts";
import { PaymentBadge } from "./PaymentBadge.tsx";
import type { AccountBalance } from "./types.ts";

export const NOT_AVAILABLE = "Informação não disponível pela API.";
const BASIS = {
  meta_prepaid_balance: "Saldo pré-pago (recargas por PIX ou boleto), exatamente como o Meta informa.",
  meta_card: "Conta paga no cartão de crédito: não há dinheiro na conta. O limite do cartão ou de gastos não é saldo.",
  google_account_budget: "Orçamento da conta − valor já veiculado.",
};

function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5">
      <dt className="flex shrink-0 items-center gap-1 text-slate-500">
        {label}
        {hint && <InfoTooltip label={`Sobre ${label}`}>{hint}</InfoTooltip>}
      </dt>
      <dd className="text-right font-medium text-slate-900">{children}</dd>
    </div>
  );
}

/** "A, B e C" */
const joinPt = (items: string[]) => (items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} e ${items.at(-1)}`);

const Missing = ({ text = NOT_AVAILABLE }: { text?: string }) => <span className="font-normal text-slate-400">{text}</span>;
const dateTime = (iso: string) => new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });

interface Props {
  balance: AccountBalance;
  canManage: boolean;
  refreshing: boolean;
  onRefresh: () => void;
  onSettings: () => void;
}

export function BalanceAccountCard({ balance: b, canManage, refreshing, onRefresh, onSettings }: Props) {
  const currency = b.currency ?? "BRL";
  const money = (v: number | null) => (v == null ? <Missing /> : formatMoney(v / 1_000_000, currency));
  const a = assessBalance(b);
  const kind = paymentKind(b);
  const available = shownAvailableMicros(b);
  const checked = b.captured_at != null;
  const isSaldo = getPlatform(b.platform_id)?.money === "saldo";
  // Campos que a API informa viram linhas; os que ela não informa ficam juntos numa nota só (sem inventar valor).
  const rows: { label: string; hint: string; value: ReactNode | null }[] = [
    { label: "Valor gasto", hint: "Gasto contado contra o limite, como a plataforma informa.", value: b.amount_spent_micros == null ? null : money(b.amount_spent_micros) },
    {
      label: "Orçamento", hint: "Orçamento da conta (Google Ads, faturamento mensal).",
      value: b.budget_micros == null ? null : (
        <>
          {money(b.budget_micros)}
          {b.budget_end_at && <span className="block text-xs font-normal text-slate-500">até {dateTime(b.budget_end_at)}</span>}
        </>
      ),
    },
    {
      label: isSaldo ? "Limite de gastos" : "Limite",
      hint: "Teto de gastos definido na plataforma (Meta: limite de gastos da conta; Google: limite do orçamento). Não é dinheiro disponível.",
      value: b.spend_cap_micros == null ? null : money(b.spend_cap_micros),
    },
    { label: "Crédito disponível", hint: "Linhas de crédito não são informadas pelas APIs usadas.", value: null },
    ...(isSaldo
      ? [
          { label: "Valor devido", hint: `Valor que o ${platformName(b.platform_id)} informa como devido na próxima cobrança.`, value: b.amount_due_micros == null ? null : money(b.amount_due_micros) },
          { label: "Forma de pagamento", hint: `Texto informado pelo ${platformName(b.platform_id)}, exibido exatamente como veio.`, value: b.funding_description ?? null },
        ]
      : []),
  ];
  const missing = [...(available == null ? ["Valor disponível"] : []), ...rows.filter((r) => r.value == null).map((r) => r.label)];

  return (
    <Card
      className={cn(
        "flex flex-col gap-3 p-4",
        a.alerts.some((x) => x.severity === "critical") ? "border-l-4 border-l-red-500" : a.alerts.length > 0 ? "border-l-4 border-l-amber-400" : "",
      )}
      role="group"
      aria-label={`Saldo ${b.name}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-medium text-slate-900">{b.name}</p>
          <p className="text-xs text-slate-500">
            {b.client_name} · {platformName(b.platform_id)} · {formatAccountId(b.platform_id, b.external_id)}
          </p>
        </div>
        <AccountStatusBadge status={b.status as AdAccountStatus} />
      </div>
      {checked && <PaymentBadge b={b} className="self-start" />}

      {a.alerts.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="Alertas de saldo">
          {a.alerts.map((alert) => (
            <li key={alert.code}>
              <Badge tone={alert.severity === "critical" ? "danger" : "warning"}>{alert.label}</Badge>
            </li>
          ))}
        </ul>
      )}

      {!checked ? (
        <p className="text-sm text-slate-500">Saldo ainda não verificado. Clique em "Atualizar saldo" para consultar a plataforma.</p>
      ) : (
        <>
          {/* O que mais importa em destaque: quanto sobra e quanto tempo dura. */}
          <div className="grid grid-cols-2 gap-2 rounded-lg bg-slate-50 p-3" data-testid="balance-highlight">
            <div>
              <p className="flex items-center gap-1 text-xs text-slate-500">
                Valor disponível
                <InfoTooltip label="Sobre Valor disponível">
                  {kind === "cartao_pre_pago"
                    ? "A conta tem cartão e saldo pré-pago. O saldo real só aparece quando a plataforma informa; o limite do cartão nunca é mostrado como saldo."
                    : b.available_basis ? BASIS[b.available_basis] : "Só aparece quando a plataforma informa o dinheiro disponível na conta (saldo pré-pago ou orçamento)."}
                </InfoTooltip>
              </p>
              <p className={cn("text-lg font-semibold tabular-nums", available == null ? "text-slate-400" : "text-slate-900")} data-testid="balance-available">
                {available == null ? "—" : formatMoney(available / 1_000_000, currency)}
              </p>
              {kind === "cartao" && <p className="text-xs text-slate-500">Pago no cartão: sem saldo em conta.</p>}
            </div>
            <div>
              <p className="flex items-center gap-1 text-xs text-slate-500">
                Previsão de duração
                <InfoTooltip label="Sobre Previsão de duração">Valor disponível ÷ gasto médio por dia dos 2 dias anteriores (ontem e anteontem).</InfoTooltip>
              </p>
              <p className={cn("text-lg font-semibold", a.forecastDays == null ? "text-slate-400" : a.alerts.length > 0 ? "text-amber-700" : "text-slate-900")}>
                {a.forecastDays != null ? describeForecast(a.forecastDays) : "—"}
              </p>
              {a.forecastDays == null && (
                <p className="text-xs text-slate-400">
                  {kind === "cartao" ? "Pago no cartão: não se aplica." : b.available_micros == null ? "Sem valor disponível para calcular." : "Sem gasto recente para calcular."}
                </p>
              )}
            </div>
          </div>

          <dl className="divide-y divide-slate-100 text-sm">
            {rows.filter((r) => r.value != null).map((r) => (
              <Row key={r.label} label={r.label} hint={r.hint}>{r.value}</Row>
            ))}
            <Row label="Gasto médio por dia" hint="Média dos 2 dias anteriores: ontem e anteontem (hoje não conta, ainda está incompleto).">
              {a.avgDailySpendMicros == null ? <Missing text="Sem histórico de gasto." /> : formatMoney(a.avgDailySpendMicros / 1_000_000, currency)}
            </Row>
            <Row label="Última atualização">
              {dateTime(b.captured_at!)}
              {a.stale && <span className="block text-xs font-normal text-amber-700">há mais de 24 horas</span>}
            </Row>
          </dl>
          {missing.length > 0 && (
            <p className="text-xs text-slate-400" data-testid="balance-missing">
              {joinPt(missing)}: {NOT_AVAILABLE}
            </p>
          )}
        </>
      )}

      {canManage && (
        <div className="mt-auto flex flex-wrap gap-2 pt-1">
          <Button variant="secondary" className="px-3 py-1.5 text-xs" loading={refreshing} onClick={onRefresh}>
            {!refreshing && <RefreshCw className="size-3.5" aria-hidden />} Atualizar saldo
          </Button>
          <Button variant="ghost" className="px-3 py-1.5 text-xs" onClick={onSettings} aria-label={`Alerta de saldo baixo de ${b.name}`}>
            <Settings2 className="size-3.5" aria-hidden /> Alerta de saldo baixo
          </Button>
        </div>
      )}
    </Card>
  );
}
