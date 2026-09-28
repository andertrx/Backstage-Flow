import { describe, expect, it } from "vitest";
import {
  opsGroupMeetingsByDay, opsMeetingDay, opsMeetingIsoToLocal, opsMeetingItemMakesTask, opsMeetingLocalToIso, opsMeetingSpan, opsMeetingTime,
} from "./meetings.ts";

describe("Dailies e reuniões", () => {
  it("lê e mostra o horário sempre em Brasília", () => {
    expect(opsMeetingLocalToIso("2026-09-28T09:00")).toBe("2026-09-28T12:00:00.000Z");
    expect(opsMeetingIsoToLocal("2026-09-28T12:00:00.000Z")).toBe("2026-09-28T09:00");
    // 01:30 UTC ainda é o dia anterior em Brasília.
    expect(opsMeetingDay("2026-09-29T01:30:00Z")).toBe("2026-09-28");
    expect(opsMeetingTime("2026-09-29T01:30:00Z")).toBe("22:30");
    expect(() => opsMeetingLocalToIso("28/09/2026 09:00")).toThrow();
  });

  it("calcula o término pela duração", () => {
    expect(opsMeetingSpan("2026-09-28T12:00:00Z", 15)).toBe("09:00 – 09:15");
    expect(opsMeetingSpan("2026-09-28T12:50:00Z", 30)).toBe("09:50 – 10:20");
  });

  it("agrupa a agenda por dia de Brasília", () => {
    const g = opsGroupMeetingsByDay([
      { id: 1, starts_at: "2026-09-28T12:00:00Z" }, { id: 2, starts_at: "2026-09-29T01:30:00Z" }, { id: 3, starts_at: "2026-09-29T12:00:00Z" },
    ]);
    expect(g.map((d) => [d.day, d.items.map((i) => i.id)])).toEqual([["2026-09-28", [1, 2]], ["2026-09-29", [3]]]);
  });

  it("só pendência e bloqueio viram tarefa", () => {
    expect(["objetivo", "pendencia", "decisao", "bloqueio"].filter(opsMeetingItemMakesTask)).toEqual(["pendencia", "bloqueio"]);
  });
});
