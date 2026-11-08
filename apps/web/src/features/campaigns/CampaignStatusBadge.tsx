import { ENTITY_STATUS_LABELS, ENTITY_STATUS_TONE, type EntityStatus } from "@backstage/shared";
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge.tsx";

const TONE: Record<string, StatusTone> = { success: "success", warning: "warning", danger: "danger", neutral: "neutral", brand: "info" };

export function CampaignStatusBadge({ status }: { status: EntityStatus }) {
  return <StatusBadge tone={TONE[ENTITY_STATUS_TONE[status]] ?? "neutral"}>{ENTITY_STATUS_LABELS[status]}</StatusBadge>;
}
