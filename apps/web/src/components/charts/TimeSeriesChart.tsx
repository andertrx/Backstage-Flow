import { type KeyboardEvent, type PointerEvent, useEffect, useMemo, useRef, useState } from "react";
import { xLabelIndexes, yTicks } from "./scale.ts";

export interface ChartLine {
  key: string;
  label: string;
  /** Cor da linha (a identidade vem também da legenda e do texto do tooltip). */
  color: string;
  values: (number | null)[];
}

interface TimeSeriesChartProps {
  lines: ChartLine[];
  /** Rótulo curto de cada ponto no eixo X (ex.: "07/09", "set/26"). */
  xLabels: string[];
  /** Título completo de cada ponto no tooltip (ex.: "Semana de 07/09 a 13/09"). */
  pointTitles: string[];
  formatValue: (v: number) => string;
  formatAxis: (v: number) => string;
  /** Descrição para leitores de tela. */
  ariaLabel: string;
  height?: number;
}

const M = { top: 12, right: 16, bottom: 28, left: 64 };

/**
 * Gráfico de linha no tempo (SVG): linha de 2px, área clara quando há uma só
 * linha, grade discreta, linha interrompida onde não há dados, linha vertical
 * que acompanha o mouse e mostra os valores exatos (também pelo teclado: ← →).
 */
export function TimeSeriesChart({ lines, xLabels, pointTitles, formatValue, formatAxis, ariaLabel, height = 260 }: TimeSeriesChartProps) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  const [active, setActive] = useState<number | null>(null);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.max(260, Math.floor(entry.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const count = xLabels.length;
  const innerW = width - M.left - M.right;
  const innerH = height - M.top - M.bottom;
  const max = Math.max(0, ...lines.flatMap((l) => l.values.filter((v): v is number => v != null)));
  const ticks = useMemo(() => yTicks(max), [max]);
  const top = ticks[ticks.length - 1] || 1;
  const x = (i: number) => M.left + (count <= 1 ? innerW / 2 : (i * innerW) / (count - 1));
  const y = (v: number) => M.top + innerH - (v / top) * innerH;

  /** Caminho da linha, interrompido nos pontos sem dados. */
  const pathOf = (values: (number | null)[]) => {
    let d = "";
    let pen = false;
    values.forEach((v, i) => {
      if (v == null) { pen = false; return; }
      d += `${pen ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
      pen = true;
    });
    return d;
  };
  /** Área clara sob a linha (só com uma linha), por trecho contínuo. */
  const areaOf = (values: (number | null)[]) => {
    const parts: string[] = [];
    let run: number[] = [];
    const flush = () => {
      if (run.length > 1) {
        const top = run.map((i, k) => `${k ? "L" : "M"}${x(i).toFixed(1)},${y(values[i]!).toFixed(1)}`).join("");
        parts.push(`${top}L${x(run[run.length - 1]).toFixed(1)},${y(0)}L${x(run[0]).toFixed(1)},${y(0)}Z`);
      }
      run = [];
    };
    values.forEach((v, i) => (v == null ? flush() : run.push(i)));
    flush();
    return parts.join("");
  };
  /** Pontos visíveis: poucos pontos, pontos isolados e o último de cada linha. */
  const markerIndexes = (values: (number | null)[]) => {
    const last = values.reduce<number>((acc, v, i) => (v != null ? i : acc), -1);
    return values.map((_, i) => i).filter((i) =>
      values[i] != null && (count <= 16 || i === last || (values[i - 1] == null && values[i + 1] == null))
    );
  };

  const indexFromPointer = (e: PointerEvent<SVGRectElement>) => {
    const rect = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
    const px = e.clientX - rect.left;
    if (count <= 1) return 0;
    return Math.min(count - 1, Math.max(0, Math.round(((px - M.left) / innerW) * (count - 1))));
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "ArrowRight") { e.preventDefault(); setActive((a) => Math.min(count - 1, (a ?? -1) + 1)); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); setActive((a) => Math.max(0, (a ?? count) - 1)); }
    else if (e.key === "Escape") setActive(null);
  };

  const labeled = xLabelIndexes(count, width < 480 ? 4 : 6);
  const tipLeft = active == null ? 0 : x(active);
  const tipOnLeft = active != null && tipLeft > width * 0.6;

  return (
    <div ref={boxRef} className="relative w-full select-none">
      <svg width={width} height={height} role="img" aria-label={ariaLabel} className="block overflow-visible">
        {/* Grade e eixo Y */}
        {ticks.map((t) => (
          <g key={t}>
            <line x1={M.left} x2={width - M.right} y1={y(t)} y2={y(t)} stroke="#e2e8f0" strokeWidth={1} shapeRendering="crispEdges" />
            <text x={M.left - 8} y={y(t)} textAnchor="end" dominantBaseline="middle" fontSize={11} fill="#64748b">{formatAxis(t)}</text>
          </g>
        ))}
        {/* Eixo X */}
        {labeled.map((i) => (
          <text key={i} x={x(i)} y={height - 8} textAnchor={count > 1 && i === 0 ? "start" : count > 1 && i === count - 1 ? "end" : "middle"} fontSize={11} fill="#64748b">
            {xLabels[i]}
          </text>
        ))}
        {/* Área (uma linha só) */}
        {lines.length === 1 && <path d={areaOf(lines[0].values)} fill={lines[0].color} fillOpacity={0.1} />}
        {/* Linhas */}
        {lines.map((l) => (
          <path key={l.key} d={pathOf(l.values)} fill="none" stroke={l.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" data-testid={`line-${l.key}`} />
        ))}
        {/* Pontos */}
        {lines.map((l) => markerIndexes(l.values).map((i) => (
          <circle key={`${l.key}-${i}`} cx={x(i)} cy={y(l.values[i]!)} r={4} fill={l.color} stroke="#ffffff" strokeWidth={2} />
        )))}
        {/* Linha vertical e destaque do ponto ativo */}
        {active != null && (
          <g pointerEvents="none">
            <line x1={x(active)} x2={x(active)} y1={M.top} y2={M.top + innerH} stroke="#94a3b8" strokeWidth={1} shapeRendering="crispEdges" />
            {lines.map((l) => l.values[active] != null && (
              <circle key={l.key} cx={x(active)} cy={y(l.values[active]!)} r={5} fill={l.color} stroke="#ffffff" strokeWidth={2} />
            ))}
          </g>
        )}
        {/* Área de leitura (maior que a linha: basta apontar para a data) */}
        <rect
          x={M.left - 8} y={M.top} width={innerW + 16} height={innerH} fill="transparent" tabIndex={0}
          aria-label="Ler valores: use as setas para a esquerda e para a direita"
          className="cursor-crosshair outline-none focus-visible:outline-2 focus-visible:outline-brand-600"
          onPointerMove={(e) => setActive(indexFromPointer(e))}
          onPointerDown={(e) => setActive(indexFromPointer(e))}
          onPointerLeave={() => setActive(null)}
          onFocus={() => setActive((a) => a ?? count - 1)}
          onBlur={() => setActive(null)}
          onKeyDown={onKey}
        />
      </svg>

      {active != null && (
        <div
          role="tooltip"
          data-testid="chart-tooltip"
          className="pointer-events-none absolute z-20 min-w-44 rounded-lg bg-white px-3 py-2 text-xs shadow-lg ring-1 ring-slate-200"
          style={{ top: M.top, left: tipOnLeft ? undefined : tipLeft + 12, right: tipOnLeft ? width - tipLeft + 12 : undefined }}
        >
          <p className="mb-1 font-medium text-slate-500">{pointTitles[active]}</p>
          <ul className="space-y-1">
            {lines.map((l) => (
              <li key={l.key} className="flex items-center gap-2">
                <span className="inline-block h-0.5 w-3 rounded" style={{ backgroundColor: l.color }} aria-hidden />
                <span className="font-semibold text-slate-900" data-testid="tooltip-value">
                  {l.values[active] == null ? "sem dados" : formatValue(l.values[active]!)}
                </span>
                {lines.length > 1 && <span className="text-slate-500">{l.label}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
