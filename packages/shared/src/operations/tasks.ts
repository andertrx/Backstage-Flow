/**
 * Central de Operações (Etapa 36.2): tarefas. Nomes em português e as regras
 * de agrupamento da tela "Minhas tarefas". As regras de acesso ficam no banco.
 */
export const OPS_PRIORITIES = ["baixa", "media", "alta", "urgente"] as const;
export type OpsPriority = (typeof OPS_PRIORITIES)[number];
export const OPS_PRIORITY_LABELS: Record<OpsPriority, string> = { baixa: "Baixa", media: "Média", alta: "Alta", urgente: "Urgente" };

export const OPS_VISIBILITIES = ["setor", "participantes", "equipe"] as const;
export type OpsVisibility = (typeof OPS_VISIBILITIES)[number];
export const OPS_VISIBILITY_LABELS: Record<OpsVisibility, string> = {
  setor: "Setor da tarefa e pessoas dela",
  participantes: "Só as pessoas da tarefa",
  equipe: "Toda a Central",
};

/** Grupo fixo de cada status: é ele que os painéis usam (nome e cor são livres). */
export const OPS_STATUS_CATEGORIES = [
  "aberto", "andamento", "aguardando_cliente", "aguardando_interno", "bloqueado", "revisao", "concluido", "cancelado",
] as const;
export type OpsStatusCategory = (typeof OPS_STATUS_CATEGORIES)[number];
export const OPS_STATUS_CATEGORY_LABELS: Record<OpsStatusCategory, string> = {
  aberto: "Não iniciado",
  andamento: "Em andamento",
  aguardando_cliente: "Aguardando cliente",
  aguardando_interno: "Aguardando interno",
  bloqueado: "Bloqueado",
  revisao: "Em revisão",
  concluido: "Concluído",
  cancelado: "Cancelado",
};
export const opsIsClosed = (category: string) => category === "concluido" || category === "cancelado";

export const OPS_PERSON_ROLES = ["principal", "adicional", "aprovador", "observador"] as const;
export type OpsPersonRole = (typeof OPS_PERSON_ROLES)[number];
export const OPS_PERSON_ROLE_LABELS: Record<OpsPersonRole, string> = {
  principal: "Responsável principal",
  adicional: "Responsável adicional",
  aprovador: "Aprovador",
  observador: "Observador",
};

/** Data de hoje (AAAA-MM-DD) no fuso da operação. */
export function opsToday(now: Date = new Date(), timeZone = "America/Sao_Paulo"): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export function opsAddDays(day: string, days: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export interface OpsMyTaskInput {
  category: string;
  due_date: string | null;
  completed_at: string | null;
  blockers: number;
  people: { user_id: string; role: string }[];
}

export const OPS_MY_SECTIONS = [
  "atrasadas", "hoje", "minha_acao", "terceiros", "andamento", "proximos", "outras", "concluidas",
] as const;
export type OpsMySection = (typeof OPS_MY_SECTIONS)[number];
export const OPS_MY_SECTION_LABELS: Record<OpsMySection, string> = {
  atrasadas: "Atrasadas",
  hoje: "Para hoje",
  minha_acao: "Aguardando minha ação",
  terceiros: "Aguardando terceiros",
  andamento: "Em andamento",
  proximos: "Próximos prazos (7 dias)",
  outras: "Outras abertas",
  concluidas: "Concluídas recentemente (7 dias)",
};

/**
 * Em qual seção de "Minhas tarefas" a tarefa aparece (uma só, na ordem acima).
 * "Minha ação": sou aprovador e está em revisão, ou sou responsável e não começou.
 * "Terceiros": aguardando cliente/interno, bloqueada ou dependendo de outra tarefa.
 * null = não entra (cancelada ou concluída há mais de 7 dias).
 */
export function opsMySection(t: OpsMyTaskInput, me: string, today: string): OpsMySection | null {
  if (t.category === "cancelado") return null;
  if (t.category === "concluido") {
    const done = t.completed_at?.slice(0, 10);
    return done && done >= opsAddDays(today, -7) ? "concluidas" : null;
  }
  const roles = t.people.filter((p) => p.user_id === me).map((p) => p.role);
  if (t.due_date && t.due_date < today) return "atrasadas";
  if (t.due_date === today) return "hoje";
  if ((t.category === "revisao" && roles.includes("aprovador"))
      || (t.category === "aberto" && t.blockers === 0 && (roles.includes("principal") || roles.includes("adicional")))) return "minha_acao";
  if (["aguardando_cliente", "aguardando_interno", "bloqueado"].includes(t.category) || t.blockers > 0) return "terceiros";
  if (t.category === "andamento") return "andamento";
  if (t.due_date && t.due_date <= opsAddDays(today, 7)) return "proximos";
  return "outras";
}
