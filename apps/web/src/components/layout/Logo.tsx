export function Logo({ inverted = false }: { inverted?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <img src="/favicon.svg" alt="" className="size-8" />
      <span className={inverted ? "font-semibold text-white" : "font-semibold text-slate-900"}>Backstage Flow</span>
    </div>
  );
}
