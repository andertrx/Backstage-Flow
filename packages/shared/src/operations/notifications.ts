/**
 * Central de Operações (Etapa 36.6): notificações (sino) e repetição de
 * tarefas e reuniões. As regras valem no banco; aqui ficam os nomes e a
 * prévia das próximas datas (mesma regra de private.ops_recurrence_matches).
 */
export const OPS_NOTIFICATION_KINDS = [
  "tarefa.atribuida", "tarefa.mencao", "tarefa.comentario", "tarefa.concluida", "tarefa.prazo", "tarefa.atrasada",
  "reuniao.convite", "reuniao.hoje", "reuniao.item", "cliente.am", "lead.responsavel",
] as const;
export type OpsNotificationKind = (typeof OPS_NOTIFICATION_KINDS)[number];
export const OPS_NOTIFICATION_LABELS: Record<OpsNotificationKind, string> = {
  "tarefa.atribuida": "Entrei numa tarefa",
  "tarefa.mencao": "Fui mencionado num comentário",
  "tarefa.comentario": "Comentário numa tarefa minha",
  "tarefa.concluida": "Tarefa que criei foi concluída",
  "tarefa.prazo": "Prazo amanhã",
  "tarefa.atrasada": "Tarefa atrasada",
  "reuniao.convite": "Fui chamado para uma reunião",
  "reuniao.hoje": "Reunião hoje",
  "reuniao.item": "Pendência para mim numa reunião",
  "cliente.am": "Virei Account Manager de um cliente",
  "lead.responsavel": "Um lead ficou comigo",
};

export const OPS_RECURRENCE_FREQUENCIES = ["diaria", "dias_uteis", "semanal", "mensal"] as const;
export type OpsRecurrenceFrequency = (typeof OPS_RECURRENCE_FREQUENCIES)[number];
export const OPS_RECURRENCE_LABELS: Record<OpsRecurrenceFrequency, string> = {
  diaria: "Todo dia",
  dias_uteis: "Dias úteis (segunda a sexta)",
  semanal: "Toda semana",
  mensal: "Todo mês",
};
/** 0 = domingo … 6 = sábado (igual ao banco). */
export const OPS_WEEKDAY_SHORT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"] as const;

export interface OpsRecurrenceRule {
  frequency: OpsRecurrenceFrequency;
  weekdays?: readonly number[] | null;
  month_day?: number | null;
}

const dayOf = (d: string) => { const [y, m, dd] = d.split("-").map(Number); return new Date(Date.UTC(y, m - 1, dd)); };
const iso = (d: Date) => d.toISOString().slice(0, 10);

/** A data (AAAA-MM-DD) entra na regra? Mês curto: "dia 31" vira o último dia. */
export function opsRecurrenceMatches(rule: OpsRecurrenceRule, day: string): boolean {
  const d = dayOf(day);
  const dow = d.getUTCDay();
  switch (rule.frequency) {
    case "diaria": return true;
    case "dias_uteis": return dow >= 1 && dow <= 5;
    case "semanal": return (rule.weekdays ?? []).includes(dow);
    case "mensal": {
      const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
      return d.getUTCDate() === Math.min(rule.month_day ?? 0, last);
    }
    default: return false;
  }
}

/** Próximas `count` datas a partir de `from` (inclusive), até `until` se houver. */
export function opsNextOccurrences(rule: OpsRecurrenceRule, from: string, count: number, until?: string | null): string[] {
  const out: string[] = [];
  const d = dayOf(from);
  for (let i = 0; i < 800 && out.length < count; i++) {
    const s = iso(d);
    if (until && s > until) break;
    if (opsRecurrenceMatches(rule, s)) out.push(s);
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

/** "Toda semana: Seg, Qua" / "Todo mês, no dia 5". */
export function opsRecurrenceText(rule: OpsRecurrenceRule): string {
  if (rule.frequency === "semanal") {
    const days = [...(rule.weekdays ?? [])].sort((a, b) => a - b).map((d) => OPS_WEEKDAY_SHORT[d]);
    return `Toda semana: ${days.join(", ")}`;
  }
  if (rule.frequency === "mensal") return `Todo mês, no dia ${rule.month_day}`;
  return OPS_RECURRENCE_LABELS[rule.frequency];
}
