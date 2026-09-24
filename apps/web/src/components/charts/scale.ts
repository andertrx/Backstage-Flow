// Escala do eixo Y: números "redondos" (0, 50, 100, 150...) a partir do maior valor.

export function niceStep(max: number, ticks = 4): number {
  if (!(max > 0)) return 1;
  const raw = max / ticks;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const unit = raw / pow;
  const nice = unit <= 1 ? 1 : unit <= 2 ? 2 : unit <= 2.5 ? 2.5 : unit <= 5 ? 5 : 10;
  return nice * pow;
}

/** Marcas do eixo Y de 0 até um pouco acima do maior valor. */
export function yTicks(max: number, ticks = 4): number[] {
  const step = niceStep(max, ticks);
  const top = Math.max(step, Math.ceil(max / step) * step);
  const out: number[] = [];
  for (let v = 0; v <= top + step / 1000; v += step) out.push(Number(v.toFixed(10)));
  return out;
}

/** Quais posições do eixo X recebem rótulo (no máximo `max`, sempre incluindo a primeira e a última). */
export function xLabelIndexes(count: number, max = 6): number[] {
  if (count <= max) return Array.from({ length: count }, (_, i) => i);
  const step = (count - 1) / (max - 1);
  return [...new Set(Array.from({ length: max }, (_, i) => Math.round(i * step)))];
}
