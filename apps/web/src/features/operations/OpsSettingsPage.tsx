import { Building2, Users } from "lucide-react";
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
            <SectorsSettingsPage />
            <StatusSettings />
            <ClientStagesSettings />
            <OnboardingTemplatesSettings />
            <QueueSettings />
            <ActivityTypesSettings />
            <MeetingCategoriesSettings />
          </div>
        )}
      </div>
    </RequireOps>
  );
}
