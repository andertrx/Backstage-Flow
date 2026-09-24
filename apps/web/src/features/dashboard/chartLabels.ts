// Textos do eixo X e do tooltip do gráfico.
import type { Bucket, Granularity } from "@backstage/shared";

const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const MONTHS_FULL = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const WEEKDAYS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

const ddmm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

/** Rótulo curto no eixo X. */
export function bucketAxisLabel(b: Bucket, g: Granularity): string {
  if (g === "month") return `${MONTHS[Number(b.key.slice(5, 7)) - 1]}/${b.key.slice(2, 4)}`;
  return ddmm(g === "week" ? b.from : b.key);
}

/** Título completo no tooltip e na tabela. */
export function bucketTitle(b: Bucket, g: Granularity): string {
  if (g === "day") {
    const wd = WEEKDAYS[new Date(`${b.key}T00:00:00Z`).getUTCDay()];
    return `${ddmm(b.key)}/${b.key.slice(0, 4)} (${wd})`;
  }
  if (g === "week") return `Semana de ${ddmm(b.from)} a ${ddmm(b.to)}`;
  const name = `${MONTHS_FULL[Number(b.key.slice(5, 7)) - 1]} de ${b.key.slice(0, 4)}`;
  const monthEnd = new Date(Date.UTC(Number(b.key.slice(0, 4)), Number(b.key.slice(5, 7)), 0)).toISOString().slice(0, 10);
  const partial = b.from !== b.key || b.to !== monthEnd;
  return partial ? `${name[0].toUpperCase()}${name.slice(1)} (${ddmm(b.from)} a ${ddmm(b.to)})` : `${name[0].toUpperCase()}${name.slice(1)}`;
}
