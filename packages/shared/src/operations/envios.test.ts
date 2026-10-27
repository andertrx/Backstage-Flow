import { describe, expect, it } from "vitest";
import { buildEnvioCommand, cleanContacts, ENVIO_AGENT_INSTRUCTION, type EnvioInput, looksLikePhone, parseWhatsApp, validateEnvio } from "./envios.ts";

const base = (): EnvioInput => ({
  nome: "Feedback semanal",
  mensagem: "Oi! 👋\nComo foi a semana?",
  dia_semana: 5,
  horario: "10:30",
  ativo: true,
  clientes: [{ cliente_id: "c1", nome_grupo: "Loja A — Agência", contatos_marcar: ["Ana", "Bruno"], ativo: true }],
});
const msgs = (i: EnvioInput) => validateEnvio(i, (id) => (id === "c1" ? "Loja A" : "Loja B")).map((e) => e.message);

describe("validateEnvio (Etapa 41)", () => {
  it("aceita um envio completo", () => {
    expect(validateEnvio(base())).toEqual([]);
  });
  it("mensagem obrigatória (só espaços não vale)", () => {
    expect(msgs({ ...base(), mensagem: "  \n " })).toContain("Escreva a mensagem.");
  });
  it("pelo menos um cliente, e pelo menos um ativo", () => {
    expect(msgs({ ...base(), clientes: [] })).toContain("Escolha pelo menos um cliente.");
    expect(msgs({ ...base(), clientes: [{ ...base().clientes[0], ativo: false }] })).toContain("Deixe pelo menos um cliente ativo no envio.");
  });
  it("nome do grupo obrigatório, com o nome do cliente na mensagem", () => {
    const e = validateEnvio({ ...base(), clientes: [{ ...base().clientes[0], nome_grupo: " " }] }, () => "Loja A");
    expect(e).toEqual([{ field: "cliente:c1", message: 'Informe o nome do grupo de "Loja A".' }]);
  });
  it("nome, dia e horário", () => {
    expect(msgs({ ...base(), nome: "X" })).toContain("Dê um nome ao envio (mínimo 2 letras).");
    expect(msgs({ ...base(), dia_semana: null })).toContain("Escolha o dia da semana.");
    expect(msgs({ ...base(), dia_semana: 7 })).toContain("Escolha o dia da semana.");
    expect(msgs({ ...base(), horario: "25:00" })).toContain("Escolha o horário.");
    expect(msgs({ ...base(), horario: "" })).toContain("Escolha o horário.");
  });
  it("só nomes em quem marcar: telefone é recusado", () => {
    expect(msgs({ ...base(), clientes: [{ ...base().clientes[0], contatos_marcar: ["+55 11 91234-5678"] }] })[0]).toMatch(/não o telefone/);
    expect(looksLikePhone("Ana 2")).toBe(false);
    expect(looksLikePhone("11 98765-4321")).toBe(true);
  });
  it("no máximo 20 pessoas e cliente repetido", () => {
    expect(msgs({ ...base(), clientes: [{ ...base().clientes[0], contatos_marcar: Array.from({ length: 21 }, (_, i) => `P${i}`) }] })[0]).toMatch(/No máximo 20/);
    expect(msgs({ ...base(), clientes: [base().clientes[0], base().clientes[0]] })[0]).toMatch(/aparece duas vezes/);
  });
  it("limpa nomes vazios mantendo a ordem", () => {
    expect(cleanContacts([" Bruno ", "", "Ana", "  "])).toEqual(["Bruno", "Ana"]);
  });
});

describe("buildEnvioCommand", () => {
  const e = { nome: "Feedback", mensagem: "Oi! 👋\nTudo certo?", dia_semana: 5, horario: "10:30", clientes: [
    { cliente_nome: "Loja A", nome_grupo: "Loja A — Agência", contatos_marcar: ["Ana", "Bruno"], ativo: true },
    { cliente_nome: "Loja B", nome_grupo: "Loja B", contatos_marcar: [], ativo: true },
    { cliente_nome: "Loja C", nome_grupo: "Loja C", contatos_marcar: ["Caio"], ativo: false },
  ] };
  it("monta o texto com a mensagem inteira e os grupos ativos, na ordem dos nomes", () => {
    const t = buildEnvioCommand(e);
    expect(t.startsWith("Envie esta mensagem nos grupos abaixo e marque as pessoas indicadas em uma segunda mensagem logo depois.")).toBe(true);
    expect(t).toContain("Oi! 👋\nTudo certo?");
    expect(t).toContain('1. Grupo "Loja A — Agência" (cliente Loja A): marcar @Ana @Bruno');
    expect(t).toContain('2. Grupo "Loja B" (cliente Loja B): sem marcação');
    expect(t).not.toContain("Loja C");
    expect(t).toContain("Sexta-feira, 10:30");
  });
  it("com o ID do envio, pede para registrar pelo MCP", () => {
    expect(buildEnvioCommand(e, "abc")).toContain("backstage_registrar_execucao_envio (envio abc)");
  });
});

describe("parseWhatsApp", () => {
  it("negrito, itálico, riscado e quebras de linha", () => {
    expect(parseWhatsApp("Olá *time*!\n_obrigado_ ~x~")).toEqual([
      [{ text: "Olá " }, { text: "time", bold: true }, { text: "!" }],
      [{ text: "obrigado", italic: true }, { text: " " }, { text: "x", strike: true }],
    ]);
  });
  it("linha vazia continua sendo uma linha", () => {
    expect(parseWhatsApp("a\n\nb")).toEqual([[{ text: "a" }], [], [{ text: "b" }]]);
  });
});

describe("instrução da tarefa agendada (41.2)", () => {
  it("consulta só o liberado, para cedo quando não há nada e registra cada grupo", () => {
    expect(ENVIO_AGENT_INSTRUCTION).toContain("backstage_list_envios com liberados_agora = true");
    expect(ENVIO_AGENT_INSTRUCTION).toMatch(/vier vazia.*pare/);
    expect(ENVIO_AGENT_INSTRUCTION).toContain("SEGUNDA mensagem");
    expect(ENVIO_AGENT_INSTRUCTION).toContain("backstage_registrar_execucao_envio");
  });
});
