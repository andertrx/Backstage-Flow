import { type AdAccountStatus, assessBalance, describeForecast, formatAccountId } from "@backstage/shared";
import { RefreshCw, Settings2 } from "lucide-react";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Card } from "@/components/ui/card.tsx";
import { InfoTooltip } from "@/components/ui/tooltip.tsx";
import { AccountStatusBadge } from "@/features/ad-accounts/AccountStatusBadge.tsx";
import { formatMoney } from "@/lib/format.ts";
import type { AccountBalance } from "./types.ts";

export const NOT_AVAILABLE = "Informação não disponível pela API.";
const PLATFORM = { meta: "Meta Ads", google: "Google Ads" } as Record<string, string>;
const BASIS = {
  meta_spend_cap: "Limite de gastos da conta − valor já gasto.",
  google_account_budget: "Orçamento da conta − valor já veiculado.",
};

function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5">
      <dt className="flex items-center gap-1 text-slate-500">
        {label}
        {hint && <InfoTooltip label={`Sobre ${label}`}>{hint}</InfoTooltip>}
      </dt>
      <dd className="text-right font-medium text-slate-900">{children}</dd>
    </div>
  );
}

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
  const checked = b.captured_at != null;

  return (
    <Card className="flex flex-col gap-3 p-4" role="group" aria-label={`Saldo ${b.name}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-medium text-slate-900">{b.name}</p>
          <p className="text-xs text-slate-500">
            {b.client_name} · {PLATFORM[b.platform_id] ?? b.platform_id} · {formatAccountId(b.platform_id, b.external_id)}
          </p>
        </div>
        <AccountStatusBadge status={b.status as AdAccountStatus} />
      </div>

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
        <dl className="divide-y divide-slate-100 text-sm">
          <Row label="Valor disponível" hint={b.available_basis ? BASIS[b.available_basis] : "Só aparece quando a plataforma informa o limite e o quanto já foi usado. Saldo pré-pago do Meta não tem valor numérico na API."}>
            {money(b.available_micros)}
          </Row>
          <Row label="Valor gasto" hint="Gasto contado contra o limite, como a plataforma informa.">{money(b.amount_spent_micros)}</Row>
          <Row label="Orçamento" hint="Orçamento da conta (Google Ads, faturamento mensal).">
            {b.budget_micros == null ? <Missing /> : (
              <>
                {money(b.budget_micros)}
                {b.budget_end_at && <span className="block text-xs font-normal text-slate-500">até {dateTime(b.budget_end_at)}</span>}
              </>
            )}
          </Row>
          <Row label="Limite" hint="Meta: limite de gastos da conta. Google: limite do orçamento da conta.">{money(b.spend_cap_micros)}</Row>
          <Row label="Crédito disponível" hint="Linhas de crédito não são informadas pelas APIs usadas.">
            <Missing />
          </Row>
          {b.platform_id === "meta" && (
            <Row label="Valor devido" hint="Valor que o Meta informa como devido na próxima cobrança (balance).">{money(b.amount_due_micros)}</Row>
          )}
          {b.platform_id === "meta" && (
            <Row label="Forma de pagamento" hint="Texto informado pelo Meta, exibido exatamente como veio.">
              {b.funding_description ?? <Missing />}
            </Row>
          )}
          <Row label="Gasto médio por dia" hint="Média dos últimos 7 dias completos com dados (hoje não conta).">
            {a.avgDailySpendMicros == null ? <Missing text="Sem histórico de gasto." /> : formatMoney(a.avgDailySpendMicros / 1_000_000, currency)}
          </Row>
          <Row label="Previsão de duração" hint="Valor disponível ÷ gasto médio por dia.">
            {a.forecastDays != null ? describeForecast(a.forecastDays) : (
              <Missing text={b.available_micros == null ? "Sem valor disponível para calcular." : "Sem gasto recente para calcular."} />
            )}
          </Row>
          <Row label="Última atualização">
            {dateTime(b.captured_at!)}
            {a.stale && <span className="block text-xs font-normal text-amber-700">há mais de 24 horas</span>}
          </Row>
        </dl>
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
