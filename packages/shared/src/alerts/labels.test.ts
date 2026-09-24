import { describe, expect, it } from "vitest";
import { ALERT_SEVERITY_EMOJI, ALERT_TYPE_LABELS, ALERT_TYPES, compareAlerts, countOpenBySeverity, type SortableAlert } from "./labels.ts";

const a = (severity: SortableAlert["severity"], status: SortableAlert["status"], first_seen_at: string): SortableAlert => ({ severity, status, first_seen_at });

describe("alertas", () => {
  it("todo tipo tem nome em português", () => {
    for (const t of ALERT_TYPES) expect(ALERT_TYPE_LABELS[t].length).toBeGreaterThan(5);
  });
  it("símbolos de gravidade pedidos", () => {
    expect(ALERT_SEVERITY_EMOJI).toEqual({ critica: "🔴", alta: "🟠", media: "🟡" });
  });
  it("ordem: abertos, depois gravidade, depois mais recente", () => {
    const list = [
      a("media", "aberto", "2026-09-24T10:00:00Z"),
      a("critica", "resolvido", "2026-09-24T11:00:00Z"),
      a("critica", "visto", "2026-09-23T10:00:00Z"),
      a("critica", "aberto", "2026-09-24T09:00:00Z"),
      a("alta", "aberto", "2026-09-22T10:00:00Z"),
    ].sort(compareAlerts);
    expect(list.map((x) => `${x.severity}/${x.status}`)).toEqual(["critica/aberto", "critica/visto", "alta/aberto", "media/aberto", "critica/resolvido"]);
  });
  it("conta só os não resolvidos", () => {
    expect(countOpenBySeverity([a("critica", "aberto", ""), a("critica", "resolvido", ""), a("media", "visto", "")])).toEqual({ critica: 1, alta: 0, media: 1 });
  });
});
