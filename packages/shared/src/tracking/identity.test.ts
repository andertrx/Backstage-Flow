import { describe, expect, it } from "vitest";
import { hashUserData, normalizeLeadEmail, normalizeLeadName, normalizeLeadPhone, sha256Hex, splitFullName } from "./identity.ts";

describe("normalização (padrão do Meta)", () => {
  it("e-mail minúsculo e sem espaços", () => {
    expect(normalizeLeadEmail("  Ana.Souza@Gmail.COM ")).toBe("ana.souza@gmail.com");
    expect(normalizeLeadEmail("sem-arroba")).toBeNull();
    expect(normalizeLeadEmail("")).toBeNull();
  });

  it("telefone brasileiro ganha o 55; estrangeiro fica como está", () => {
    expect(normalizeLeadPhone("(45) 99999-8888")).toBe("5545999998888");
    expect(normalizeLeadPhone("045 3333-4444")).toBe("554533334444");
    expect(normalizeLeadPhone("+55 45 99999-8888")).toBe("5545999998888");
    expect(normalizeLeadPhone("+1 (415) 555-2671")).toBe("14155552671");
    expect(normalizeLeadPhone("123")).toBeNull();
  });

  it("nome minúsculo, só letras, acentos mantidos", () => {
    expect(normalizeLeadName(" João-Pedro ")).toBe("joãopedro");
    expect(normalizeLeadName("123")).toBeNull();
    expect(splitFullName("Ana Maria Souza")).toEqual({ first: "Ana", last: "Souza" });
    expect(splitFullName("Ana")).toEqual({ first: "Ana", last: null });
  });
});

describe("hash", () => {
  it("SHA-256 conhecido", async () => {
    expect(await sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });

  it("só o hash sai; campo inválido fica de fora", async () => {
    const h = await hashUserData({ email: "Ana@X.com", phone: "12", firstName: "Ana" });
    expect(Object.keys(h)).toEqual(["em", "fn"]);
    expect(h.em).toBe(await sha256Hex("ana@x.com"));
    expect(JSON.stringify(h)).not.toContain("ana@");
  });
});
