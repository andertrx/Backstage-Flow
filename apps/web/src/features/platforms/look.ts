// Aparência de cada plataforma (ícone e cor). É a única parte visual que
// depende da plataforma; uma plataforma nova sem entrada aqui usa o visual neutro.
import { type LucideIcon, Megaphone, Search, Store } from "lucide-react";

export interface PlatformLook {
  icon: LucideIcon;
  /** Fundo e cor do ícone. */
  className: string;
}

const LOOKS: Record<string, PlatformLook> = {
  meta: { icon: Megaphone, className: "bg-[#2a78d6]/10 text-[#2a78d6]" },
  google: { icon: Search, className: "bg-[#eb6834]/10 text-[#eb6834]" },
};

const NEUTRAL: PlatformLook = { icon: Store, className: "bg-slate-100 text-slate-600" };

export function platformLook(id: string): PlatformLook {
  return LOOKS[id] ?? NEUTRAL;
}
