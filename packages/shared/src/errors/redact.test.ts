import { describe, expect, it } from "vitest";
import { errorSourceLabel, redactSecrets } from "./redact.ts";

describe("redactSecrets", () => {
  it("apaga tokens da URL e mantém o resto", () => {
    const out = redactSecrets("https://graph.facebook.com/v23.0/act_1?access_token=EAABxyz&fields=name");
    expect(out).toBe("https://graph.facebook.com/v23.0/act_1?access_token=[oculto]&fields=name");
  });

  it("apaga senhas, Bearer, tokens soltos e JWT", () => {
    const out = redactSecrets(
      '{"senha":"Abc123!"} Authorization: Bearer ya29.xyz EAAG1234567890abcdefghijKL eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N',
    );
    for (const secret of ["Abc123", "ya29.xyz", "EAAG1234567890", "dozjgNryP4J3"]) expect(out).not.toContain(secret);
  });

  it("não mexe em texto comum", () => {
    expect(redactSecrets("Cannot read properties of undefined (reading 'id')")).toBe("Cannot read properties of undefined (reading 'id')");
  });
});

describe("errorSourceLabel", () => {
  it("traduz a origem", () => {
    expect(errorSourceLabel("sincronizacao")).toBe("Sincronização");
    expect(errorSourceLabel("outro")).toBe("outro");
  });
});
