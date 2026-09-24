import { AD_ACCOUNT_STATUS_LABELS, AD_ACCOUNT_STATUS_SEVERITY, type AdAccountStatus } from "@backstage/shared";
import { Badge } from "@/components/ui/badge.tsx";

const tone = { ok: "success", warning: "warning", danger: "danger", neutral: "neutral" } as const;

export function AccountStatusBadge({ status, raw }: { status: AdAccountStatus; raw?: string | null }) {
  const label = status === "desconhecida" && raw ? `${AD_ACCOUNT_STATUS_LABELS[status]} (${raw})` : AD_ACCOUNT_STATUS_LABELS[status];
  return <Badge tone={tone[AD_ACCOUNT_STATUS_SEVERITY[status]]}>{label}</Badge>;
}
