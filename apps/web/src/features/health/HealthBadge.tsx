import { HEALTH_LABELS, HEALTH_TONE, type HealthStatus } from "@backstage/shared";
import { AlertTriangle, CheckCircle2, CircleSlash, CreditCard, Lock, RefreshCwOff } from "lucide-react";
import { cn } from "@/lib/cn.ts";

const ICON = {
  ativa: CheckCircle2,
  atencao: AlertTriangle,
  restrita: Lock,
  desativada: CircleSlash,
  erro_sincronizacao: RefreshCwOff,
  pagamento_pendente: CreditCard,
} as const;

const TONE = {
  success: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  warning: "bg-amber-50 text-amber-800 ring-amber-200",
  danger: "bg-red-50 text-red-700 ring-red-200",
};

/** Selo de saúde com ícone + cor + texto (não depende só da cor). */
export function HealthBadge({ status }: { status: HealthStatus }) {
  const Icon = ICON[status];
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset", TONE[HEALTH_TONE[status]])}>
      <Icon className="size-3.5" aria-hidden />
      {HEALTH_LABELS[status]}
    </span>
  );
}
