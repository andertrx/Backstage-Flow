export function Logo({ inverted = false, compact = false }: { inverted?: boolean; compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <img src="/favicon.svg" alt={compact ? "Backstage Flow" : ""} className="size-8" />
      {!compact && (
        <span className={inverted ? "font-semibold tracking-tight text-white" : "font-semibold tracking-tight text-slate-900"}>Backstage Flow</span>
      )}
    </div>
  );
}
