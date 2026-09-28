import { describe, expect, it } from "vitest";
import { OPS_NOTIFICATION_KINDS, OPS_NOTIFICATION_LABELS, opsNextOccurrences, opsRecurrenceMatches, opsRecurrenceText } from "./notifications.ts";

describe("Repetição de tarefas e reuniões", () => {
  it("dias úteis pulam sábado e domingo", () => {
    // 2026-10-02 é sexta-feira.
    expect(opsNextOccurrences({ frequency: "dias_uteis" }, "2026-10-02", 3)).toEqual(["2026-10-02", "2026-10-05", "2026-10-06"]);
  });

  it("semanal só nos dias escolhidos", () => {
    expect(opsNextOccurrences({ frequency: "semanal", weekdays: [1, 3] }, "2026-09-28", 4)).toEqual(["2026-09-28", "2026-09-30", "2026-10-05", "2026-10-07"]);
    expect(opsRecurrenceText({ frequency: "semanal", weekdays: [3, 1] })).toBe("Toda semana: Seg, Qua");
  });

  it("mensal no dia 31 cai no último dia dos meses curtos", () => {
    expect(opsNextOccurrences({ frequency: "mensal", month_day: 31 }, "2026-09-01", 3)).toEqual(["2026-09-30", "2026-10-31", "2026-11-30"]);
    expect(opsRecurrenceMatches({ frequency: "mensal", month_day: 31 }, "2027-02-28")).toBe(true);
  });

  it("respeita a data final", () => {
    expect(opsNextOccurrences({ frequency: "diaria" }, "2026-09-28", 10, "2026-09-30")).toEqual(["2026-09-28", "2026-09-29", "2026-09-30"]);
  });

  it("todo tipo de notificação tem nome", () => {
    expect(OPS_NOTIFICATION_KINDS.every((k) => OPS_NOTIFICATION_LABELS[k].length > 3)).toBe(true);
  });
});
