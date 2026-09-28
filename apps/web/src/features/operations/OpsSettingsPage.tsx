import { RequireOps } from "./OpsLayout.tsx";
import { SectorsSettingsPage } from "./SectorsSettingsPage.tsx";
import { StatusSettings } from "./StatusSettings.tsx";
import { ActivityTypesSettings, ClientStagesSettings, QueueSettings } from "./FlowSettings.tsx";

/**
 * Configurações da Central (só admin). 36.1: setores; 36.2: status das tarefas;
 * 36.3: etapas do onboarding (com regras de avanço), filas por setor e tipos de atividade.
 * As colunas comerciais entram na 36.4.
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
      </div>
    </RequireOps>
  );
}
