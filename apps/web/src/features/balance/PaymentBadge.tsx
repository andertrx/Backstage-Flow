import { PAYMENT_LABELS, type PaymentInput, paymentKind } from "@backstage/shared";
import { CreditCard, HelpCircle, Landmark, Wallet } from "lucide-react";
import { cn } from "@/lib/cn.ts";

/**
 * Forma de pagamento EM USO na conta (correção de 28/09/2026): deixa claro se o
 * valor mostrado é saldo real (PIX/boleto) ou se a conta é paga no cartão
 * (sem dinheiro na conta). Com as duas formas, mostra os dois ícones.
 */
export function PaymentBadge({ b, className }: { b: PaymentInput; className?: string }) {
  const kind = paymentKind(b);
  const tone = kind === "pre_pago" ? "bg-emerald-50 text-emerald-800 ring-emerald-200"
    : kind === "cartao" ? "bg-slate-100 text-slate-700 ring-slate-200"
    : kind === "cartao_pre_pago" ? "bg-blue-50 text-blue-800 ring-blue-200"
    : kind === "orcamento" ? "bg-sky-50 text-sky-800 ring-sky-200"
    : "bg-slate-50 text-slate-500 ring-slate-200";
  // Cartão: mostra o final do cartão que a plataforma informa (ex.: "Mastercard *2596").
  const card = kind === "cartao" || kind === "cartao_pre_pago" ? b.funding_description : null;
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset", tone, className)}
      data-testid="payment-badge" data-kind={kind}>
      {(kind === "cartao" || kind === "cartao_pre_pago") && <CreditCard className="size-3.5" aria-hidden />}
      {(kind === "pre_pago" || kind === "cartao_pre_pago") && <Wallet className="size-3.5" aria-hidden />}
      {kind === "orcamento" && <Landmark className="size-3.5" aria-hidden />}
      {kind === "nao_informado" && <HelpCircle className="size-3.5" aria-hidden />}
      {PAYMENT_LABELS[kind]}
      {card && <span className="font-normal opacity-80">· {card}</span>}
    </span>
  );
}
