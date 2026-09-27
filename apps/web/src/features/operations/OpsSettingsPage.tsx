import { RequireOps } from "./OpsLayout.tsx";
import { SectorsSettingsPage } from "./SectorsSettingsPage.tsx";
import { StatusSettings } from "./StatusSettings.tsx";

/**
 * Configurações da Central (só admin). 36.1: setores; 36.2: status das tarefas.
 * As colunas comerciais, etapas operacionais e demais listas entram nas próximas fases.
 */
export function OpsSettingsPage() {
  return (
    <RequireOps permission="ops.admin">
      <div className="space-y-8">
        <SectorsSettingsPage />
        <StatusSettings />
      </div>
    </RequireOps>
  );
}
