import { Outlet } from "react-router";
import { ScrollTabs } from "@/components/ui/scroll-tabs.tsx";

const TABS = [
  { to: "/criar/campanhas", label: "Criar campanhas" },
  { to: "/criar/anuncios", label: "Criador de Anúncios" },
];

/** Área "Criar" (21/11/2026): junta os rascunhos de campanha e o Criador de Anúncios, que eram dois itens do menu. As duas telas continuam como eram. */
export function CreateLayout() {
  return (
    <div className="space-y-6">
      <ScrollTabs label="Criar" tabs={TABS} />
      <Outlet />
    </div>
  );
}
