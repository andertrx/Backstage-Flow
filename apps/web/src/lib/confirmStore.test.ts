import { describe, expect, it } from "vitest";
import { answerConfirm, confirmar, getConfirm, montarPergunta } from "./confirmStore.ts";

describe("confirmação no visual do sistema", () => {
  it("pergunta vira título, o resto vira explicação, e o botão leva o verbo", () => {
    expect(montarPergunta("Arquivar este contato? Ele sai da lista de trabalho, mas o histórico continua guardado.")).toEqual({
      title: "Arquivar este contato?", message: "Ele sai da lista de trabalho, mas o histórico continua guardado.", confirmLabel: "Arquivar", tone: "default",
    });
  });
  it("ações difíceis de desfazer ficam em vermelho", () => {
    expect(montarPergunta("Desconectar o WhatsApp? Os envios automáticos desligam.").tone).toBe("danger");
    expect(montarPergunta("Apagar esta conversa do CRM? Some para sempre.").confirmLabel).toBe("Apagar");
    expect(montarPergunta("Trocar a chave? A atual para de valer.").tone).toBe("danger");
    expect(montarPergunta("Publicar as regras? O site usa em 5 minutos.").tone).toBe("default");
  });
  it("'Deseja desativar Fulano?' usa o segundo verbo", () => {
    const r = montarPergunta("Deseja desativar Maria?");
    expect(r.confirmLabel).toBe("Desativar");
    expect(r.tone).toBe("danger");
    expect(r.message).toBeUndefined();
  });
  it("responde sim ou não e fecha", async () => {
    const p = confirmar("Arquivar? ok");
    expect(getConfirm()?.title).toBe("Arquivar?");
    answerConfirm(true);
    await expect(p).resolves.toBe(true);
    expect(getConfirm()).toBeNull();
    const p2 = confirmar("Remover?");
    answerConfirm(false);
    await expect(p2).resolves.toBe(false);
  });
  it("nova pergunta cancela a anterior (nunca fica uma pendurada)", async () => {
    const p1 = confirmar("Arquivar A?");
    const p2 = confirmar("Arquivar B?");
    await expect(p1).resolves.toBe(false);
    answerConfirm(true);
    await expect(p2).resolves.toBe(true);
  });
});
