/**
 * Logo do Backstage Flow (símbolo + "BACKSTAGE" + "FLOW", horizontal). Há duas cores: preta (fundo claro) e branca (fundo escuro);
 * o CSS escolhe qual aparece conforme o tema. Recolhido, só o símbolo. `inverted`: sempre a branca (peças escuras fixas).
 */
export function Logo({ inverted = false, compact = false, size = "md" }: { inverted?: boolean; compact?: boolean; size?: "md" | "lg" | "xl" }) {
  const h = compact ? "h-8 w-auto" : size === "xl" ? "h-20 w-auto" : size === "lg" ? "h-14 w-auto" : "h-8 w-auto";
  const light = compact ? "/brand/symbol.png" : "/brand/logo.png";
  const dark = compact ? "/brand/symbol-dark.png" : "/brand/logo-dark.png";
  if (inverted) return <img src={dark} alt="Backstage Flow" className={h} />;
  return (
    <>
      <img src={light} alt="Backstage Flow" className={`${h} dark:hidden`} />
      <img src={dark} alt="" aria-hidden className={`${h} hidden dark:block`} />
    </>
  );
}
