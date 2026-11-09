/**
 * Logo do Backstage Flow. No menu escuro usa a versão com "backstage" em
 * branco; recolhido, só o símbolo.
 */
export function Logo({ inverted = false, compact = false, size = "md" }: { inverted?: boolean; compact?: boolean; size?: "md" | "lg" }) {
  if (compact) return <img src="/brand/symbol.png" alt="Backstage Flow" className="h-7 w-auto" />;
  const h = size === "lg" ? "h-14 w-auto" : "h-8 w-auto";
  // No tema escuro entra a versão com "backstage" em branco (o CSS escolhe qual imagem aparece).
  return (
    <>
      <img src={inverted ? "/brand/logo-dark.png" : "/brand/logo.png"} alt="Backstage Flow" className={inverted ? h : `${h} dark:hidden`} />
      {!inverted && <img src="/brand/logo-dark.png" alt="" aria-hidden className={`${h} hidden dark:block`} />}
    </>
  );
}
