/**
 * Central de Operações (Etapa 36.3): clientes no fluxo operacional e filas por
 * setor. As regras de acesso e de avanço ficam no banco; aqui só o que a tela
 * precisa calcular igual em todo lugar.
 */

export interface OpsQueueColumnLike {
  id: string;
  sector_id: string;
  status_id: string;
  position: number;
  active: boolean;
}

/**
 * Em qual coluna da fila a tarefa aparece:
 * 1) a coluna em que foi posta, se ainda for do setor, estiver ativa e o status bater;
 * 2) senão, a primeira coluna ativa do setor com o mesmo status;
 * 3) senão, nenhuma (a tela mostra em "Outros status").
 */
export function opsQueueColumnFor(
  task: { sector_id: string; status_id: string; queue_column_id: string | null },
  columns: readonly OpsQueueColumnLike[],
): string | null {
  const mine = columns.filter((c) => c.sector_id === task.sector_id && c.active).sort((a, b) => a.position - b.position);
  const chosen = mine.find((c) => c.id === task.queue_column_id);
  if (chosen && chosen.status_id === task.status_id) return chosen.id;
  return mine.find((c) => c.status_id === task.status_id)?.id ?? null;
}

/** Progresso operacional: só quando calculável (há tarefas obrigatórias). */
export function opsProgress(done: number, total: number): number | null {
  if (!total || total <= 0) return null;
  return Math.round((Math.min(done, total) / total) * 100);
}

export const OPS_OTHER_COLUMN = "__outros__";
