import { CHANNEL_LABELS, EVIDENCE_LABELS } from "@backstage/shared";
import { MessageCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge.tsx";
import { Card } from "@/components/ui/card.tsx";
import { formatDateTime, formatMoney } from "@/lib/format.ts";
import { type WaConversationSale, type WhatsAppClick, type WhatsAppConversation } from "./api.ts";
import { WA_CONVERSATION_STATUS_LABELS, WA_ORIGIN_LABELS, WA_STATUS_LABELS } from "./logic.ts";

const STATUS_TONE = { clicado: "neutral", conversa: "neutral", lead: "brand", venda: "success" } as const;
const ORIGIN_TONE = { anuncio_whatsapp: "success", site: "brand", desconhecida: "neutral" } as const;

/**
 * WhatsApp (acompanhamento, no Painel): cliques vindos do site e conversas recebidas. Ligar o número fica em Configurações → WhatsApp;
 * marcar venda, em Conversas.
 */
export function WhatsAppSection({ clicks, conversations, hasApi, siteName, sales = [] }: {
  clicks: WhatsAppClick[];
  conversations: WhatsAppConversation[];
  hasApi: boolean;
  siteName: (id: string) => string;
  /** Vendas marcadas por conversa (valor e nº do pedido). */
  sales?: WaConversationSale[];
}) {
  return (
    <section aria-label="WhatsApp" className="space-y-3">
      <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
        <MessageCircle className="size-4 text-emerald-600" aria-hidden /> WhatsApp
      </h2>
      {hasApi && <ConversationsCard conversations={conversations} siteName={siteName} sales={sales} />}

      <Card className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs text-slate-500">
            <tr>
              <th className="px-3 py-2 font-medium">Clique</th>
              <th className="px-3 py-2 font-medium">Código</th>
              <th className="px-3 py-2 font-medium">Site</th>
              <th className="px-3 py-2 font-medium">Origem</th>
              <th className="px-3 py-2 font-medium">Situação</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100" data-testid="wa-clicks">
            {clicks.map((c) => (
              <tr key={c.id} data-testid="wa-click-row">
                <td className="whitespace-nowrap px-3 py-2 text-slate-600">{formatDateTime(c.clicked_at)}</td>
                <td className="px-3 py-2 font-mono text-slate-900">{c.code}</td>
                <td className="px-3 py-2 text-slate-600">{siteName(c.container_id)}</td>
                <td className="px-3 py-2 text-slate-700">
                  {c.touch ? `${CHANNEL_LABELS[c.touch.channel]} · ${EVIDENCE_LABELS[c.touch.evidence]}${c.touch.utm_campaign ? ` · ${c.touch.utm_campaign}` : ""}` : "Origem desconhecida"}
                </td>
                <td className="px-3 py-2">
                  <Badge tone={STATUS_TONE[c.status]}>{WA_STATUS_LABELS[c.status]}{c.sales > 1 ? ` (${c.sales})` : ""}</Badge>
                </td>
              </tr>
            ))}
            {clicks.length === 0 && (
              <tr><td colSpan={5} className="px-3 py-6 text-center text-slate-500">Nenhum clique com código ainda. Ligue “Código de rastreio no WhatsApp” no código de instalação.</td></tr>
            )}
          </tbody>
        </table>
      </Card>
    </section>
  );
}

/** Conversas recebidas pela API oficial: a origem já vem pronta (marcar venda é só em Conversas). */
function ConversationsCard({ conversations, siteName, sales }: { conversations: WhatsAppConversation[]; siteName: (id: string) => string; sales: WaConversationSale[] }) {
  return (
    <Card className="overflow-x-auto">
      <div className="px-3 pt-3">
        <h3 className="text-sm font-semibold text-slate-900">Conversas recebidas (API oficial)</h3>
        <p className="text-xs text-slate-500">Chegam sozinhas pelo webhook do Meta. Aqui só o número em código (hash) é guardado; o texto das conversas só fica guardado se “Guardar as conversas” estiver ligado (Tracking → Painel → Conversas).</p>
      </div>
      <table className="mt-2 min-w-full text-sm">
        <thead className="bg-slate-50 text-left text-xs text-slate-500">
          <tr>
            <th className="px-3 py-2 font-medium">Última mensagem</th>
            <th className="px-3 py-2 font-medium">Site</th>
            <th className="px-3 py-2 font-medium">Origem</th>
            <th className="px-3 py-2 font-medium">Mensagens</th>
            <th className="px-3 py-2 font-medium">Situação</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100" data-testid="wa-conversations">
          {conversations.map((c) => (
            <ConversationRow key={c.id} c={c} sales={sales.filter((x) => x.conversation_id === c.id)} siteName={siteName} />
          ))}
          {conversations.length === 0 && (
            <tr><td colSpan={5} className="px-3 py-6 text-center text-slate-500">Nenhuma conversa recebida ainda. Confira a conexão em Configurações → WhatsApp.</td></tr>
          )}
        </tbody>
      </table>
    </Card>
  );
}

function ConversationRow({ c, sales, siteName }: { c: WhatsAppConversation; sales: WaConversationSale[]; siteName: (id: string) => string }) {
  return (
    <>
      <tr data-testid="wa-conversation-row">
        <td className="whitespace-nowrap px-3 py-2 text-slate-600">{formatDateTime(c.last_message_at)}</td>
        <td className="px-3 py-2 text-slate-600">{siteName(c.container_id)}</td>
        <td className="px-3 py-2 text-slate-700">
          <Badge tone={ORIGIN_TONE[c.origin]}>{WA_ORIGIN_LABELS[c.origin]}</Badge>
          <span className="block text-xs text-slate-500">
            {c.origin === "anuncio_whatsapp" && (c.ad_id ? `Anúncio ${c.ad_id} · confirmada` : "Confirmada")}
            {c.origin === "site" && c.touch && `${CHANNEL_LABELS[c.touch.channel]} · ${EVIDENCE_LABELS[c.touch.evidence]}${c.touch.utm_campaign ? ` · ${c.touch.utm_campaign}` : ""}`}
            {c.origin === "site" && c.click_code && <span className="font-mono"> · {c.click_code}</span>}
            {c.origin === "desconhecida" && "Sem anúncio nem código do site"}
          </span>
        </td>
        <td className="px-3 py-2 text-slate-600">{c.messages}</td>
        <td className="px-3 py-2">
          <Badge tone={STATUS_TONE[c.status]}>{WA_CONVERSATION_STATUS_LABELS[c.status]}{c.sales > 1 ? ` (${c.sales})` : ""}</Badge>
          {c.test && <> <Badge tone="warning">Teste</Badge></>}
          {sales.map((s, i) => (
            <span key={`${s.order_id}-${i}`} className="mt-1 block text-xs text-slate-600" data-testid="wa-conv-sale">
              {s.value != null ? formatMoney(s.value, s.currency ?? "BRL") : "Valor não informado"}
              {s.order_id ? ` · pedido ${s.order_id}` : ""} · {formatDateTime(s.at)}
            </span>
          ))}
        </td>
      </tr>
    </>
  );
}

