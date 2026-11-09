import { useActiveClients } from "@/features/clients/api.ts";
import { SuggestionsSection } from "./SuggestionsSection.tsx";
import { useWaSuggestions } from "./api.ts";

/**
 * Vendas sugeridas pela IA para quem não tem o Tracking (papel Equipe): o Account Manager do cliente vê e decide.
 * O banco só devolve as sugestões dos clientes de que a pessoa é Account Manager (ou gestor/administrador).
 */
export function SuggestionsPage() {
  const suggestions = useWaSuggestions(true);
  const { data: clients = [] } = useActiveClients();
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Vendas sugeridas</h1>
        <p className="text-sm text-slate-600">A IA lê as conversas do dia e sugere onde pode ter havido venda. Confira no WhatsApp e decida. Aparecem só os seus clientes.</p>
      </div>
      <SuggestionsSection suggestions={suggestions.data ?? []} clientName={(id) => clients.find((c) => c.id === id)?.name ?? "Cliente"} />
    </div>
  );
}
