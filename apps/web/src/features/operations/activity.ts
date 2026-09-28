/** Nomes das ações do histórico da Central (tarefas e clientes), em português. */
export const ACTION_LABELS: Record<string, string> = {
  "tarefa.criada": "Criou a tarefa",
  "tarefa.editada": "Editou",
  "tarefa.status": "Mudou o status",
  "tarefa.fila": "Moveu na fila do setor",
  "tarefa.pessoas": "Mudou as pessoas",
  "tarefa.arquivada": "Arquivou",
  "tarefa.desarquivada": "Desarquivou",
  "tarefa.dependencia_incluida": "Incluiu dependência",
  "tarefa.dependencia_retirada": "Retirou dependência",
  "tarefa.comentario": "Comentou",
  "tarefa.comentario_retirado": "Retirou um comentário",
  "tarefa.anexo_incluido": "Anexou arquivo",
  "tarefa.anexo_retirado": "Retirou anexo",
  "cliente.fluxo_iniciado": "Colocou o cliente no fluxo operacional",
  "cliente.etapa": "Mudou a etapa do cliente",
  "cliente.am": "Trocou o Account Manager",
  "cliente.atividade_retirada": "Retirou uma atividade registrada",
  "demanda.liberada": "Liberou uma demanda",
  "cliente.convertido": "Veio do Comercial (lead convertido)",
};

const FIELD_LABELS: Record<string, string> = {
  titulo: "título", descricao: "descrição", cliente: "cliente", setor: "setor", status: "status", prioridade: "prioridade",
  inicio: "início", prazo: "prazo", esforco: "esforço", visibilidade: "quem vê", etiquetas: "etiquetas",
  etapa: "etapa do onboarding", obrigatoria: "obrigatória",
};

export interface ActivityNames {
  status: (id: string) => string;
  stage?: (id: string) => string;
  person?: (id: string) => string;
}

/** Detalhe curto de cada ação ("De → Para", nº da demanda, arquivo…). */
export function activityText(a: { action: string; before: Record<string, unknown> | null; after: Record<string, unknown> | null }, names: ActivityNames): string {
  const before = a.before ?? {};
  const after = a.after ?? {};
  const stage = names.stage ?? ((id: string) => id);
  const person = names.person ?? (() => "pessoa");
  switch (a.action) {
    case "tarefa.status": return `${names.status(String(before.status))} → ${names.status(String(after.status))}`;
    case "tarefa.fila": return `${before.coluna ? `${String(before.coluna)} → ` : ""}${String(after.coluna ?? "")}`;
    case "tarefa.editada": return `Mudou: ${Object.keys(after).map((k) => FIELD_LABELS[k] ?? k).join(", ")}`;
    case "tarefa.dependencia_incluida": return `Depende de #${String(after.depende_de)}`;
    case "tarefa.dependencia_retirada": return `Não depende mais de #${String(before.depende_de)}`;
    case "tarefa.anexo_incluido": return String(after.arquivo ?? "");
    case "tarefa.anexo_retirado": return String(before.arquivo ?? "");
    case "cliente.fluxo_iniciado": return `Etapa: ${stage(String(after.etapa))}`;
    case "cliente.etapa": return `${stage(String(before.etapa))} → ${stage(String(after.etapa))}${after.regra ? ` (${String(after.regra)})` : ""}`;
    case "cliente.am": return `${before.am ? person(String(before.am)) : "ninguém"} → ${after.am ? person(String(after.am)) : "ninguém"}`;
    case "cliente.atividade_retirada": return String(before.titulo ?? "");
    case "cliente.convertido": return `Lead #${String(after.lead)} ${String(after.empresa ?? "")}${after.novo ? " · cliente criado" : " · vinculado"}`;
    case "demanda.liberada": return `#${String(after.demanda)} ${String(after.titulo ?? "")} (${String(after.tarefas ?? 0)} tarefa(s))`;
    default: return "";
  }
}
