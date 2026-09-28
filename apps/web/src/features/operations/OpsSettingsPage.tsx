import { RequireOps } from "./OpsLayout.tsx";
import { SectorsSettingsPage } from "./SectorsSettingsPage.tsx";
import { StatusSettings } from "./StatusSettings.tsx";
import { LeadStagesSettings, LossReasonsSettings } from "./CommercialSettings.tsx";
import { ActivityTypesSettings, ClientStagesSettings, QueueSettings } from "./FlowSettings.tsx";

/**
 * Configurações da Central (só admin). 36.1: setores; 36.2: status das tarefas;
 * 36.3: etapas do onboarding (com regras de avanço), filas por setor e tipos de atividade.
 * 36.4: colunas comerciais (com regras de transição) e motivos de perda.
 */
export function OpsSettingsPage() {
  return (
    <RequireOps permission="ops.admin">
      <div className="space-y-8">
        <SectorsSettingsPage />
        <StatusSettings />
        <ClientStagesSettings />
        <QueueSettings />
        <ActivityTypesSettings />
        <LeadStagesSettings />
        <LossReasonsSettings />
      </div>
    </RequireOps>
  );
}
