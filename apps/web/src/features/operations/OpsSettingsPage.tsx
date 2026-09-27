import { RequireOps } from "./OpsLayout.tsx";
import { SectorsSettingsPage } from "./SectorsSettingsPage.tsx";

/**
 * Configurações da Central (só admin). 36.1: setores. As colunas comerciais,
 * etapas operacionais, filas, status e demais listas entram nas próximas fases.
 */
export function OpsSettingsPage() {
  return (
    <RequireOps permission="ops.admin">
      <SectorsSettingsPage />
    </RequireOps>
  );
}
