/**
 * Etapa 41 — Envios semanais (Central de Operações). O CRM só guarda a configuração e o histórico;
 * quem envia é um agente externo (Claude, pelo MCP). Regras iguais às do banco (private.ops_envio_save_impl).
 */

/** 0 = domingo … 6 = sábado (igual ao banco e ao Date.getDay). */
export const ENVIO_WEEKDAYS = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"] as const;

export const ENVIO_STATUSES = ["enviado", "falhou", "pulado"] as const;
export type EnvioStatus = (typeof ENVIO_STATUSES)[number];
export const ENVIO_STATUS_LABELS: Record<EnvioStatus, string> = { enviado: "Enviado", falhou: "Falhou", pulado: "Pulado" };

export const ENVIO_LIMITS = { nome: 120, mensagem: 5000, grupo: 200, contato: 80, contatos: 20, observacao: 500, detalhe: 1000 } as const;

export interface EnvioClienteInput {
  cliente_id: string;
  nome_grupo: string;
  /** Todos os nomes, na ordem (ligados e desligados). */
  contatos_marcar: string[];
  /** 41.3: nomes da lista que estão desligados (guardados, mas não marcados). */
  contatos_desligados?: string[];
  ativo: boolean;
  observacao?: string | null;
}

export interface EnvioInput {
  nome: string;
  mensagem: string;
  dia_semana: number | null;
  horario: string;
  ativo: boolean;
  clientes: EnvioClienteInput[];
}

/** Nome com 8 dígitos ou mais tem cara de telefone: o módulo guarda só nomes. */
export const looksLikePhone = (name: string) => name.replace(/[^0-9]/g, "").length >= 8;

/** Nomes limpos, na ordem, sem vazios. */
export const cleanContacts = (names: readonly string[]) => names.map((n) => n.trim()).filter((n) => n !== "");

/** 41.3: quem será marcado de fato — os nomes ligados, na ordem. */
export const contatosLigados = (c: { contatos_marcar: readonly string[]; contatos_desligados?: readonly string[] }) => {
  const off = new Set((c.contatos_desligados ?? []).map((n) => n.trim()));
  return cleanContacts(c.contatos_marcar).filter((n) => !off.has(n));
};

/** 41.3: desligados válidos (só nomes que estão na lista), como o banco guarda. */
export const cleanDesligados = (names: readonly string[], off: readonly string[] = []) => {
  const set = new Set(off.map((n) => n.trim()));
  return cleanContacts(names).filter((n) => set.has(n));
};

export interface EnvioError {
  field: "nome" | "mensagem" | "dia_semana" | "horario" | "clientes" | `cliente:${string}`;
  message: string;
}

/** Valida o formulário como o banco valida. Lista vazia = pode salvar. */
export function validateEnvio(input: EnvioInput, clientName: (id: string) => string = () => "cliente"): EnvioError[] {
  const errors: EnvioError[] = [];
  const nome = input.nome.trim();
  if (nome.length < 2) errors.push({ field: "nome", message: "Dê um nome ao envio (mínimo 2 letras)." });
  else if (nome.length > ENVIO_LIMITS.nome) errors.push({ field: "nome", message: `Nome longo demais (máximo ${ENVIO_LIMITS.nome} letras).` });
  const msg = input.mensagem.trim();
  if (!msg) errors.push({ field: "mensagem", message: "Escreva a mensagem." });
  else if (msg.length > ENVIO_LIMITS.mensagem) errors.push({ field: "mensagem", message: "Mensagem longa demais (máximo 5.000 letras)." });
  if (input.dia_semana == null || !Number.isInteger(input.dia_semana) || input.dia_semana < 0 || input.dia_semana > 6) {
    errors.push({ field: "dia_semana", message: "Escolha o dia da semana." });
  }
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(input.horario)) errors.push({ field: "horario", message: "Escolha o horário." });
  if (input.clientes.length === 0) errors.push({ field: "clientes", message: "Escolha pelo menos um cliente." });
  else if (!input.clientes.some((c) => c.ativo)) errors.push({ field: "clientes", message: "Deixe pelo menos um cliente ativo no envio." });
  const seen = new Set<string>();
  for (const c of input.clientes) {
    const field = `cliente:${c.cliente_id}` as const;
    const who = clientName(c.cliente_id);
    if (seen.has(c.cliente_id)) errors.push({ field, message: `"${who}" aparece duas vezes no envio.` });
    seen.add(c.cliente_id);
    const grupo = c.nome_grupo.trim();
    if (!grupo) errors.push({ field, message: `Informe o nome do grupo de "${who}".` });
    else if (grupo.length > ENVIO_LIMITS.grupo) errors.push({ field, message: `Nome do grupo de "${who}" longo demais (máximo 200 letras).` });
    const names = cleanContacts(c.contatos_marcar);
    if (names.length > ENVIO_LIMITS.contatos) errors.push({ field, message: `No máximo ${ENVIO_LIMITS.contatos} pessoas para marcar em "${who}".` });
    if (names.some((n) => n.length > ENVIO_LIMITS.contato)) errors.push({ field, message: `Nome para marcar longo demais em "${who}" (máximo 80 letras).` });
    if (names.some(looksLikePhone)) errors.push({ field, message: `Em "Quem marcar" de "${who}" use só o nome como aparece no grupo, não o telefone.` });
    if ((c.observacao ?? "").length > ENVIO_LIMITS.observacao) errors.push({ field, message: `Observação de "${who}" longa demais (máximo 500 letras).` });
  }
  return errors;
}

export interface EnvioParaComando {
  nome: string;
  mensagem: string;
  dia_semana: number;
  horario: string;
  clientes: { cliente_nome: string; nome_grupo: string; contatos_marcar: readonly string[]; contatos_desligados?: readonly string[]; ativo: boolean }[];
}

/** Texto do botão "Copiar comando": para colar no Claude. Só os grupos ativos. */
export function buildEnvioCommand(e: EnvioParaComando, envioId?: string): string {
  const grupos = e.clientes.filter((c) => c.ativo);
  const lines = [
    "Envie esta mensagem nos grupos abaixo e marque as pessoas indicadas em uma segunda mensagem logo depois.",
    "",
    `Envio: ${e.nome} (${ENVIO_WEEKDAYS[e.dia_semana] ?? "?"}, ${e.horario}, horário de Brasília)`,
    "",
    "Mensagem (copie exatamente, com as quebras de linha):",
    "-----",
    e.mensagem.trim(),
    "-----",
    "",
    "Grupos:",
    ...grupos.map((c, i) => {
      const names = contatosLigados(c);
      return `${i + 1}. Grupo "${c.nome_grupo.trim()}" (cliente ${c.cliente_nome}): ${names.length ? `marcar ${names.map((n) => `@${n}`).join(" ")}` : "sem marcação"}`;
    }),
  ];
  lines.push("", envioId
    ? `Depois de cada grupo, registre o resultado (enviado, falhou ou pulado, com um detalhe) no Backstage Flow com a ferramenta backstage_registrar_execucao_envio (envio ${envioId}).`
    : "Depois de cada grupo, me diga o resultado (enviado, falhou ou pulado).");
  return lines.join("\n");
}

export type WaSegment = { text: string; bold?: boolean; italic?: boolean; strike?: boolean; mono?: boolean };

/** Pré-visualização no estilo do WhatsApp: *negrito*, _itálico_, ~riscado~, ```mono```. Uma lista de segmentos por linha. */
export function parseWhatsApp(text: string): WaSegment[][] {
  const pattern = /```([\s\S]+?)```|\*([^*\n]+)\*|_([^_\n]+)_|~([^~\n]+)~/g;
  const lines: WaSegment[][] = [];
  for (const line of text.split("\n")) {
    const out: WaSegment[] = [];
    let last = 0;
    for (const m of line.matchAll(pattern)) {
      if (m.index > last) out.push({ text: line.slice(last, m.index) });
      if (m[1] !== undefined) out.push({ text: m[1], mono: true });
      else if (m[2] !== undefined) out.push({ text: m[2], bold: true });
      else if (m[3] !== undefined) out.push({ text: m[3], italic: true });
      else out.push({ text: m[4], strike: true });
      last = m.index + m[0].length;
    }
    if (last < line.length) out.push({ text: line.slice(last) });
    lines.push(out);
  }
  return lines;
}

/**
 * Etapa 41.2/41.5: instrução da tarefa agendada no computador da pessoa (app do Claude + Claude no Chrome + WhatsApp Web
 * + conector do Backstage Flow). Uma tarefa por envio: a instrução leva o código do envio (ENV-001) e só trata dele.
 * Curta: se o envio não estiver liberado, para na primeira consulta (gasta pouco). O conteúdo vem sempre do CRM.
 */
export function envioAgentInstruction(codigo: string, nome: string): string {
  return [
    `Você é o agente do envio ${codigo} ("${nome}") dos Envios semanais do Backstage Flow. Siga exatamente estes passos:`,
    `1. Chame a ferramenta backstage_list_envios com envio = "${codigo}" e liberados_agora = true.`,
    "2. Se a lista vier vazia (total 0), responda apenas com o aviso que veio e pare. Não abra o navegador.",
    `3. Trate SOMENTE o envio ${codigo}. Para cada grupo dele: abra o WhatsApp Web (web.whatsapp.com) no Chrome, procure o grupo pelo nome exato (nome_grupo),`,
    "   cole a mensagem exatamente como veio (com as quebras de linha e emojis) e envie. Logo depois, numa SEGUNDA mensagem,",
    "   marque as pessoas de marcar_na_ordem, na ordem: digite @ e o nome e escolha a pessoa na lista que aparece. Envie.",
    "4. Depois de cada grupo, registre o resultado com backstage_registrar_execucao_envio (envio_id, cliente_id, status):",
    "   enviado; falhou (com o motivo, ex.: grupo não encontrado, pessoa não encontrada para marcar); ou pulado.",
    "5. Não envie nada que não esteja nessa lista, não responda nem leia outras conversas e não altere nada no WhatsApp.",
    `6. No fim, responda com um resumo curto do envio ${codigo}: quantos grupos enviados, falhados e pulados.`,
  ].join("\n");
}
