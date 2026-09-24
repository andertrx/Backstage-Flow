import { describe, expect, it } from "vitest";
import { bucketAxisLabel, bucketTitle } from "./chartLabels.ts";

describe("rótulos do gráfico", () => {
  it("dia, semana e mês", () => {
    expect(bucketAxisLabel({ key: "2026-09-23", from: "2026-09-23", to: "2026-09-23" }, "day")).toBe("23/09");
    expect(bucketTitle({ key: "2026-09-23", from: "2026-09-23", to: "2026-09-23" }, "day")).toBe("23/09/2026 (qua)");
    expect(bucketTitle({ key: "2026-09-07", from: "2026-09-10", to: "2026-09-13" }, "week")).toBe("Semana de 10/09 a 13/09");
    expect(bucketAxisLabel({ key: "2026-09-01", from: "2026-09-01", to: "2026-09-30" }, "month")).toBe("set/26");
    expect(bucketTitle({ key: "2026-09-01", from: "2026-09-01", to: "2026-09-30" }, "month")).toBe("Setembro de 2026");
    expect(bucketTitle({ key: "2026-09-01", from: "2026-09-01", to: "2026-09-23" }, "month")).toBe("Setembro de 2026 (01/09 a 23/09)");
  });
});
