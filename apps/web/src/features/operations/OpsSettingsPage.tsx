import { Building2, Users } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn.ts";
import { useSearchParamsUpdater } from "@/lib/useSearchParamsUpdater.ts";
import { RequireOps } from "./OpsLayout.tsx";
import { TeamPage } from "./TeamPage.tsx";
import { SectorsSettingsPage } from "./SectorsSettingsPage.tsx";
import { StatusSettings } from "./StatusSettings.tsx";
import { Link } from "react-router";
import { Alert } from "@/components/ui/alert.tsx";
import { MeetingCategoriesSettings } from "./MeetingSettings.tsx";
import { OnboardingTemplatesSettings } from "./OnboardingTemplatesSettings.tsx";
import { SectionIndex } from "@/components/ui/section.tsx";
import { ActivityTypesSettings, ClientStagesSettings, QueueSettings } from "./FlowSettings.tsx";

/**
 * Configurações da Central (só admin). 36.1: setores; 36.2: status das tarefas;
 * 36.3: etapas do onboarding (com regras de avanço), filas por setor e tipos de atividade.
 * 36.5: tipos de reunião. Desde a 38.1, as colunas comerciais e os motivos de perda ficam em Comercial → Configurações do comercial.
 */
export function OpsSettingsPage() {
  const [params, update] = useSearchParamsUpdater();
  const part = params.get("ver") === "estrutura" ? "estrutura" : "equipe";
  const parts = [
    { id: "equipe" as const, label: "Equipe", icon: Users },
    { id: "estrutura" as const, label: "Setores, fluxos e tarefas padrão", icon: Building2 },
  ];
  return (
    <RequireOps permission="ops.admin">
      <div className="space-y-6">
        <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-3" role="tablist" aria-label="Partes das configurações da Central">
          {parts.map(({ id, label, icon: Icon }) => (
            <button key={id} type="button" role="tab" aria-selected={part === id} data-testid={`ops-settings-tab-${id}`}
              onClick={() => update((p) => { if (id === "equipe") p.delete("ver"); else p.set("ver", id); return p; })}
              className={cn("inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium",
                part === id ? "bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-200" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900")}>
              <Icon className="size-4" aria-hidden /> {label}
            </button>
          ))}
        </div>
        {part === "equipe" ? <TeamPage /> : (
          <div className="space-y-8">
            <Alert tone="info">
              As colunas do funil de vendas e os motivos de perda agora ficam em{" "}
              <Link to="/comercial?ver=config" className="font-medium underline">Comercial → Configurações do comercial</Link>.
            </Alert>
            <SectionIndex testId="ops-settings-index" items={[
              { id: "cfg-setores", label: "Setores" }, { id: "cfg-status", label: "Status das tarefas" }, { id: "cfg-etapas", label: "Etapas dos clientes" },
              { id: "cfg-modelos", label: "Tarefas padrão" }, { id: "cfg-filas", label: "Filas por setor" }, { id: "cfg-atividades", label: "Tipos de atividade" }, { id: "cfg-reunioes", label: "Tipos de reunião" },
            ]} />
            <Bloco id="cfg-setores"><SectorsSettingsPage /></Bloco>
            <Bloco id="cfg-status"><StatusSettings /></Bloco>
            <Bloco id="cfg-etapas"><ClientStagesSettings /></Bloco>
            <Bloco id="cfg-modelos"><OnboardingTemplatesSettings /></Bloco>
            <Bloco id="cfg-filas"><QueueSettings /></Bloco>
            <Bloco id="cfg-atividades"><ActivityTypesSettings /></Bloco>
            <Bloco id="cfg-reunioes"><MeetingCategoriesSettings /></Bloco>
          </div>
        )}
      </div>
    </RequireOps>
  );
}

/** Divisão entre os blocos desta tela: linha separadora e espaço, com âncora para o índice (cada bloco já traz o próprio título). */
function Bloco({ id, children }: { id: string; children: ReactNode }) {
  return <div id={id} className="scroll-mt-24 border-t border-slate-200 pt-8 first-of-type:border-t-0">{children}</div>;
}
