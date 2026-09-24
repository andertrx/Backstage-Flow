import { ENTITY_STATUS_LABELS, ENTITY_STATUS_TONE, type EntityStatus } from "@backstage/shared";
import { Badge } from "@/components/ui/badge.tsx";

export function CampaignStatusBadge({ status }: { status: EntityStatus }) {
  return <Badge tone={ENTITY_STATUS_TONE[status]}>{ENTITY_STATUS_LABELS[status]}</Badge>;
}
