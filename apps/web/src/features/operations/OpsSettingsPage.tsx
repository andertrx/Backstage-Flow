import { RequireOps } from "./OpsLayout.tsx";
import { SectorsSettingsPage } from "./SectorsSettingsPage.tsx";
import { StatusSettings } from "./StatusSettings.tsx";
import { Link } from "react-router";
import { Alert } from "@/components/ui/alert.tsx";
import { MeetingCategoriesSettings } from "./MeetingSettings.tsx";
import { ActivityTypesSettings, ClientStagesSettings, QueueSettings } from "./FlowSettings.tsx";

/**
 * Configurações da Central (só admin). 36.1: setores; 36.2: status das tarefas;
 * 36.3: etapas do onboarding (com regras de avanço), filas por setor e tipos de atividade.
 * 36.5: tipos de reunião. Desde a 38.1, as colunas comerciais e os motivos de perda ficam em Comercial → Configurações do comercial.
 */
export function OpsSettingsPage() {
  return (
    <RequireOps permission="ops.admin">
      <div className="space-y-8">
        <Alert tone="info">
          As colunas do funil de vendas e os motivos de perda agora ficam em{" "}
          <Link to="/operacoes/comercial?ver=config" className="font-medium underline">Comercial → Configurações do comercial</Link>.
        </Alert>
        <SectorsSettingsPage />
        <StatusSettings />
        <ClientStagesSettings />
        <QueueSettings />
        <ActivityTypesSettings />
        <MeetingCategoriesSettings />
      </div>
    </RequireOps>
  );
}
