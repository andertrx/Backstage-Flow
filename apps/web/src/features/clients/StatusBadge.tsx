import { CLIENT_STATUS_LABELS, type ClientStatus } from "@backstage/shared";
import { Badge } from "@/components/ui/badge.tsx";

const tones = { ativo: "success", pausado: "neutral", encerrado: "danger" } as const;

export function ClientStatusBadge({ status }: { status: ClientStatus }) {
  return <Badge tone={tones[status]}>{CLIENT_STATUS_LABELS[status]}</Badge>;
}
