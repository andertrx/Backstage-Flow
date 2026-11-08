import { CLIENT_STATUS_LABELS, type ClientStatus } from "@backstage/shared";
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge.tsx";

const tones: Record<ClientStatus, StatusTone> = { ativo: "success", pausado: "neutral", encerrado: "danger" };

export function ClientStatusBadge({ status }: { status: ClientStatus }) {
  return <StatusBadge tone={tones[status]}>{CLIENT_STATUS_LABELS[status]}</StatusBadge>;
}
