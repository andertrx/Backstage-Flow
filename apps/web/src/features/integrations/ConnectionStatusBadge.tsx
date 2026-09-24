import { CONNECTION_STATUS_LABELS, type ConnectionStatus } from "@backstage/shared";
import { Badge } from "@/components/ui/badge.tsx";

const tone = { ativa: "success", erro: "danger", revogada: "neutral" } as const;

export function ConnectionStatusBadge({ status }: { status: ConnectionStatus }) {
  return <Badge tone={tone[status]}>{CONNECTION_STATUS_LABELS[status]}</Badge>;
}
