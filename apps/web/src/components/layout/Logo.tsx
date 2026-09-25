/**
 * Logo do Backstage Flow. No menu escuro usa a versão com "backstage" em
 * branco; recolhido, só o símbolo.
 */
export function Logo({ inverted = false, compact = false, size = "md" }: { inverted?: boolean; compact?: boolean; size?: "md" | "lg" }) {
  if (compact) return <img src="/brand/symbol.png" alt="Backstage Flow" className="h-9 w-auto" />;
  return (
    <img
      src={inverted ? "/brand/logo-dark.png" : "/brand/logo.png"}
      alt="Backstage Flow"
      className={size === "lg" ? "h-20 w-auto" : "h-10 w-auto"}
    />
  );
}
