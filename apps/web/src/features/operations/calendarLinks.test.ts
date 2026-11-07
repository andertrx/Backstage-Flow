import { describe, expect, it } from "vitest";
import { buildIcs, googleCalendarUrl, icsDate } from "./calendarLinks.ts";

const ev = { title: "Daily, time; 1", startsAt: "2026-11-09T12:30:00.000Z", durationMin: 45, location: "https://meet.google.com/abc-defg-hij", details: "Pauta\nlinha 2", uid: "r-12" };

describe("Reunião → agenda", () => {
  it("data em UTC no formato da agenda", () => {
    expect(icsDate("2026-11-09T12:30:00.000Z")).toBe("20261109T123000Z");
  });
  it("link do Google Agenda com título, início, fim, local e detalhes", () => {
    const u = new URL(googleCalendarUrl(ev));
    expect(u.origin + u.pathname).toBe("https://calendar.google.com/calendar/render");
    expect(u.searchParams.get("action")).toBe("TEMPLATE");
    expect(u.searchParams.get("text")).toBe("Daily, time; 1");
    expect(u.searchParams.get("dates")).toBe("20261109T123000Z/20261109T131500Z");
    expect(u.searchParams.get("location")).toBe("https://meet.google.com/abc-defg-hij");
    expect(u.searchParams.get("details")).toBe("Pauta\nlinha 2");
  });
  it("sem local nem detalhes não manda os campos vazios", () => {
    const u = new URL(googleCalendarUrl({ ...ev, location: null, details: " " }));
    expect(u.searchParams.has("location")).toBe(false);
    expect(u.searchParams.has("details")).toBe(false);
  });
  it(".ics válido: escapa vírgula, ponto e vírgula e quebra de linha, e usa fim = início + duração", () => {
    const ics = buildIcs(ev, new Date("2026-11-01T00:00:00Z"));
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics).toContain("UID:r-12@backstageflow.com.br");
    expect(ics).toContain("DTSTART:20261109T123000Z");
    expect(ics).toContain("DTEND:20261109T131500Z");
    expect(ics).toContain("SUMMARY:Daily\\, time\; 1");
    expect(ics).toContain("DESCRIPTION:Pauta\\nlinha 2");
  });
  it("linhas longas são quebradas em até 75 bytes", () => {
    const ics = buildIcs({ ...ev, details: "x".repeat(300) });
    for (const l of ics.split("\r\n")) expect(new TextEncoder().encode(l).length).toBeLessThanOrEqual(75);
  });
});
