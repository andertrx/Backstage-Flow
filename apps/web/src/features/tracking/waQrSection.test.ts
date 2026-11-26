import { describe, expect, it } from "vitest";
import { altBrPhone, numeroComNove } from "./WaQrSection.tsx";

describe("numeroComNove (código de pareamento do WhatsApp)", () => {
  it("cadastro sem o 9 da frente ganha o 9 (o caso da Prata e Pérola)", () => {
    expect(numeroComNove("558198398622")).toBe("81998398622");
    expect(numeroComNove("(81) 9839-8622")).toBe("81998398622");
    expect(numeroComNove("8198398622")).toBe("81998398622");
  });
  it("número que já tem o 9 não muda", () => {
    expect(numeroComNove("5581995067876")).toBe("81995067876");
    expect(numeroComNove("81 99506-7876")).toBe("81995067876");
  });
  it("telefone fixo (começa com 2 a 5) e número de fora do Brasil não são mexidos", () => {
    expect(numeroComNove("558133334444")).toBe("558133334444");
    expect(numeroComNove("14155550123")).toBe("14155550123");
  });
  it("depois de ganhar o 9, o botão oferece tentar SEM o 9", () => {
    expect(altBrPhone(numeroComNove("558198398622"))).toBe("8198398622");
  });
});
