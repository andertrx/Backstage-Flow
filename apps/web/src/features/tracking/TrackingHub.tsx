import { can } from "@backstage/shared";
import { MessageCircle, Radar, Settings2, Sparkles, Wallet } from "lucide-react";
import { useEffect } from "react";
import { useLocation } from "react-router";
import { Alert } from "@/components/ui/alert.tsx";
import { Card } from "@/components/ui/card.tsx";
import { Select } from "@/components/ui/field.tsx";
import { useAuth } from "@/features/auth/AuthProvider.tsx";
import { useActiveClients } from "@/features/clients/api.ts";
import { ContactsPage } from "@/features/contacts/ContactsPage.tsx";
import { cn } from "@/lib/cn.ts";
import { useSearchParamsUpdater } from "@/lib/useSearchParamsUpdater.ts";
import { useWaSuggestions } from "./api.ts";
import { ConfigSection, SectionIndex } from "@/components/ui/section.tsx";
import { ConversationsPanel } from "./ConversationsPage.tsx";
import { WaAiCard } from "./SuggestionsSection.tsx";
import { TrackingPage, type TrackingTab } from "./TrackingPage.tsx";

type PainelTab = "conversas" | "contatos" | "site" | "whatsapp" | "sugestoes";

const SITE_PARTS: TrackingTab[] = ["resumo", "origens", "leads", "saude"];

/**
 * Tracking (T5.10): duas partes.
 *  - Painel: o dia a dia, de todos os clientes juntos ou de um cliente só — conversas, contatos e vendas,
 *    site e origem, WhatsApp e vendas sugeridas.
 *  - Configurações: o que se mexe de vez em quando — sites (código de instalação, Meta, regras), teste de link e chave da IA.
 * O cliente escolhido e a aba ficam no endereço (`cliente`, `aba`, `secao`).
 */
export function TrackingHub() {
  const { profile } = useAuth();
  const { hash } = useLocation();
  const [params, update] = useSearchParamsUpdater();
  const { data: clients = [] } = useActiveClients();
  const suggestions = useWaSuggestions(true);
  const pending = (suggestions.data ?? []).filter((x) => x.status === "pendente").length;

  const role = profile?.role;
  const section: "painel" | "config" = params.get("secao") === "config" ? "config" : "painel";
  const clientParam = params.get("cliente");
  const clientId = clients.some((c) => c.id === clientParam) ? clientParam : null;
  const canConversations = can(role, "tracking.manage");
  const tabs: { id: PainelTab; label: string; icon: typeof Radar; show: boolean }[] = [
    { id: "conversas", label: "Conversas", icon: MessageCircle, show: canConversations },
    { id: "contatos", label: "Contatos e vendas", icon: Wallet, show: can(role, "contacts.view") },
    { id: "site", label: "Site e origem", icon: Radar, show: true },
    { id: "whatsapp", label: "WhatsApp", icon: MessageCircle, show: true },
    { id: "sugestoes", label: pending > 0 ? `Vendas sugeridas (${pending})` : "Vendas sugeridas", icon: Sparkles, show: can(role, "tracking.suggestions") },
  ];
  const shown = tabs.filter((t) => t.show);
  const asked = params.get("aba");
  // Compatibilidade com endereços antigos (?aba=sites|origens|saude|leads vira Site e origem).
  const legacy = ["sites", "origens", "saude", "leads"].includes(asked ?? "") ? "site" : asked;
  const tab = shown.find((t) => t.id === legacy)?.id ?? shown.find((t) => t.id === "site")!.id;

  const set = (changes: Record<string, string | null>) =>
    update((p) => {
      for (const [k, v] of Object.entries(changes)) {
        if (v) p.set(k, v);
        else p.delete(k);
      }
      return p;
    });

  // Link com âncora (ex.: "Ligar ou configurar o WhatsApp" no Painel): rola até a seção depois de desenhar.
  useEffect(() => {
    if (section !== "config" || !hash) return;
    const t = window.setTimeout(() => document.getElementById(hash.slice(1))?.scrollIntoView({ block: "start" }), 250);
    return () => window.clearTimeout(t);
  }, [section, hash]);

  const needsClient = tab === "conversas" || tab === "contatos";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Tracking</h1>
          <p className="mt-1 text-sm text-slate-500">
            Conversas, contatos, vendas, origens e eventos dos sites dos clientes. Os dados do site são coletados pelo nosso script (sem dados pessoais).
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-200 pb-3">
        <div className="flex gap-2" role="tablist" aria-label="Partes do Tracking">
          {([["painel", "Painel", Radar], ["config", "Configurações", Settings2]] as const).map(([id, label, Icon]) => (
            <button key={id} type="button" role="tab" aria-selected={section === id} data-testid={`tracking-section-${id}`}
              onClick={() => set({ secao: id === "painel" ? null : id, sub: null })}
              className={cn("inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-all",
                section === id ? "bg-gradient-to-br from-blue-600 to-sky-500 text-white shadow-[0_0_20px_rgba(37,99,235,0.35)]"
                  : "bg-white text-slate-600 ring-1 ring-inset ring-slate-200 hover:text-blue-700 hover:ring-blue-400")}>
              <Icon className="size-4" aria-hidden />{label}
            </button>
          ))}
        </div>
        <label className="text-sm">
          <span className="sr-only">Cliente</span>
          <Select value={clientId ?? ""} onChange={(e) => set({ cliente: e.target.value || null, sub: null })} data-testid="tracking-client" aria-label="Cliente">
            <option value="">Todos os clientes</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </label>
      </div>

      {section === "config" ? (
        <div className="space-y-8" data-testid="tracking-config">
          <SectionIndex items={[
            { id: "cfg-sites", label: "Sites" },
            { id: "cfg-whatsapp", label: "WhatsApp" },
            { id: "cfg-link", label: "Ferramentas" },
            ...(profile?.role === "admin" ? [{ id: "cfg-ia", label: "IA de vendas" }] : []),
          ]} />
          <TrackingPage clientId={clientId} tabs={["sites"]} />
          {profile?.role === "admin" && (
            <ConfigSection id="cfg-ia" title="IA de vendas sugeridas" description="A IA lê as conversas do dia e sugere onde pode ter havido venda. Quem decide é você.">
              <WaAiCard />
            </ConfigSection>
          )}
        </div>
      ) : (
        <>
          <nav className="flex flex-wrap gap-2" aria-label="Abas do painel" data-testid="tracking-tabs">
            {shown.map(({ id, label, icon: Icon }) => (
              <button key={id} type="button" onClick={() => set({ aba: id === "site" ? null : id, sub: null })} aria-pressed={tab === id} data-testid={`tracking-panel-tab-${id}`}
                className={cn("inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-all",
                  tab === id ? "bg-gradient-to-br from-blue-600 to-sky-500 text-white shadow-[0_0_20px_rgba(37,99,235,0.35)]"
                    : "bg-white text-slate-600 ring-1 ring-inset ring-slate-200 hover:text-blue-700 hover:ring-blue-400")}>
                <Icon className="size-4" aria-hidden />{label}
              </button>
            ))}
          </nav>

          {needsClient && !clientId ? (
            <Card className="p-6 text-sm text-slate-600" data-testid="tracking-pick-client">
              <p className="font-medium text-slate-900">Escolha um cliente</p>
              <p className="mt-1">
                {tab === "conversas" ? "As conversas do WhatsApp" : "Os contatos e as vendas"} são de um cliente por vez. Escolha o cliente no campo acima.
              </p>
            </Card>
          ) : (
            <>
              {tab === "conversas" && clientId && <ConversationsPanel clientId={clientId} />}
              {tab === "contatos" && clientId && <ContactsPage fixedClientId={clientId} />}
              {tab === "site" && <TrackingPage clientId={clientId} tabs={SITE_PARTS} />}
              {tab === "whatsapp" && <TrackingPage clientId={clientId} tabs={["whatsapp"]} />}
              {tab === "sugestoes" && <TrackingPage clientId={clientId} tabs={["sugestoes"]} />}
            </>
          )}
        </>
      )}
      {section === "config" && !can(role, "tracking.manage") && (
        <Alert tone="info">Só administrador e gestor mudam as configurações; aqui você consegue consultar.</Alert>
      )}
    </div>
  );
}
