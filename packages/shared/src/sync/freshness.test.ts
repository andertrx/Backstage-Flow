import { describe, expect, it } from "vitest";
import { FRESH_MINUTES, freshness, isRecent, isStale, minutesSince, STALE_MINUTES } from "./freshness.ts";

const now = new Date("2026-09-25T12:00:00Z");
const ago = (min: number) => new Date(now.getTime() - min * 60_000).toISOString();

describe("cache: idade dos dados", () => {
  it("recente (< 10 min), em dia (até 90 min), desatualizada (> 90 min), nunca", () => {
    expect(freshness(ago(3), now)).toBe("recente");
    expect(freshness(ago(FRESH_MINUTES), now)).toBe("em_dia");
    expect(freshness(ago(60), now)).toBe("em_dia");
    expect(freshness(ago(STALE_MINUTES), now)).toBe("em_dia");
    expect(freshness(ago(STALE_MINUTES + 1), now)).toBe("desatualizada");
    expect(freshness(null, now)).toBe("nunca");
    expect(freshness("lixo", now)).toBe("nunca");
  });

  it("recente = usa o guardado; desatualizada ou nunca = busca de novo", () => {
    expect(isRecent(ago(5), now)).toBe(true);
    expect(isRecent(ago(30), now)).toBe(false);
    expect(isStale(ago(30), now)).toBe(false);
    expect(isStale(ago(120), now)).toBe(true);
    expect(isStale(null, now)).toBe(true);
  });

  it("minutos desde", () => {
    expect(minutesSince(ago(15), now)).toBe(15);
    expect(minutesSince(null, now)).toBeNull();
    expect(minutesSince(new Date(now.getTime() + 60_000).toISOString(), now)).toBe(0);
  });
});
