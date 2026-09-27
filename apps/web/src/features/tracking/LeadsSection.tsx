import { CHANNEL_LABELS, EVIDENCE_LABELS, eventLabel } from "@backstage/shared";
import { Mail, Phone, Route, ShoppingBag, UserRound } from "lucide-react";
import { useState } from "react";
import { Alert } from "@/components/ui/alert.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Card } from "@/components/ui/card.tsx";
import { Modal } from "@/components/ui/modal.tsx";
import { errorMessage } from "@/lib/errors.ts";
import { formatDateTime, formatMoney } from "@/lib/format.ts";
import { type JourneyItem, type LeadRow, type TouchSummary, useLeadJourney } from "./api.ts";

const touchText = (t: TouchSummary | null) =>
  t ? `${CHANNEL_LABELS[t.channel]} · ${EVIDENCE_LABELS[t.evidence]}${t.utm_campaign ? ` · ${t.utm_campaign}` : t.ad_campaign_id ? ` · ID ${t.ad_campaign_id}` : ""}` : "Origem desconhecida";

export function LeadsSection({ leads, siteName }: { leads: LeadRow[]; siteName: (containerId: string) => string }) {
  const [open, setOpen] = useState<LeadRow | null>(null);
  return (
    <section aria-label="Leads" className="space-y-3">
      <h2 className="text-base font-semibold text-slate-900">Leads (quem converteu)</h2>
      <Card className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs text-slate-500">
            <tr>
              <th className="px-3 py-2 font-medium">Última conversão</th>
              <th className="px-3 py-2 font-medium">Site</th>
              <th className="px-3 py-2 font-medium">Contato</th>
              <th className="px-3 py-2 font-medium">Primeira origem</th>
              <th className="px-3 py-2 font-medium">Última origem</th>
              <th className="px-3 py-2 font-medium">Conversões</th>
              <th className="px-3 py-2 font-medium"><span className="sr-only">Jornada</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100" data-testid="leads">
            {leads.map((l) => (
              <tr key={l.id} data-testid="lead-row">
                <td className="whitespace-nowrap px-3 py-2 text-slate-600">{formatDateTime(l.last_converted_at)}</td>
                <td className="px-3 py-2 text-slate-600">{siteName(l.container_id)}</td>
                <td className="px-3 py-2">
                  <span className="flex flex-wrap gap-1">
                    {l.has_email && <Badge tone="brand"><Mail className="mr-1 size-3" aria-hidden />E-mail</Badge>}
                    {l.has_phone && <Badge tone="brand"><Phone className="mr-1 size-3" aria-hidden />Telefone</Badge>}
                    {!l.has_email && !l.has_phone && <Badge>Anônimo</Badge>}
                    {l.test && <Badge tone="warning">Teste</Badge>}
                  </span>
                </td>
                <td className="px-3 py-2 text-slate-700">{touchText(l.first_touch)}</td>
                <td className="px-3 py-2 text-slate-700">{touchText(l.last_touch)}</td>
                <td className="whitespace-nowrap px-3 py-2 text-slate-700">
                  {l.conversions}
                  {l.purchases > 0 && <span className="text-slate-500"> · {l.purchases} {l.purchases === 1 ? "compra" : "compras"}</span>}
                </td>
                <td className="px-3 py-2 text-right">
                  <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => setOpen(l)} aria-label={`Ver jornada do lead ${l.id}`}>
                    <Route className="size-3.5" aria-hidden /> Jornada
                  </Button>
                </td>
              </tr>
            ))}
            {leads.length === 0 && (
              <tr><td colSpan={7} className="px-3 py-6 text-center text-slate-500">Nenhum lead ainda. Aparecem aqui quando alguém envia um formulário ou compra.</td></tr>
            )}
          </tbody>
        </table>
      </Card>
      <p className="text-xs text-slate-500">
        E-mail, telefone e nome chegam cifrados (hash) e não podem ser lidos: a tela mostra só se foram informados. A mesma pessoa em
        outro aparelho é reconhecida pelo mesmo e-mail ou telefone.
      </p>
      {open && <JourneyModal lead={open} onClose={() => setOpen(null)} />}
    </section>
  );
}

function JourneyModal({ lead, onClose }: { lead: LeadRow; onClose: () => void }) {
  const { data = [], isLoading, error } = useLeadJourney(lead.id);
  const devices = new Map<string, number>();
  for (const item of data) if (!devices.has(item.visitor_id)) devices.set(item.visitor_id, devices.size + 1);
  return (
    <Modal title="Jornada do lead" open onClose={onClose} size="lg">
      <div className="space-y-3 text-sm">
        <p className="text-slate-600">
          Primeira origem: <strong>{touchText(lead.first_touch)}</strong>. Última: <strong>{touchText(lead.last_touch)}</strong>.
          {devices.size > 1 && ` Visto em ${devices.size} aparelhos/navegadores.`}
        </p>
        {error && <Alert tone="error">{errorMessage(error)}</Alert>}
        {isLoading ? (
          <div className="h-24 animate-pulse rounded-lg bg-slate-100" aria-label="Carregando" />
        ) : (
          <ol className="relative space-y-3 border-l border-slate-200 pl-5" data-testid="journey">
            {data.map((item, i) => (
              <li key={i} className="relative" data-testid="journey-item" data-kind={item.kind}>
                <span className="absolute -left-[27px] top-0.5 flex size-5 items-center justify-center rounded-full bg-white ring-1 ring-slate-200">
                  {item.kind === "origem" ? <Route className="size-3 text-brand-600" aria-hidden /> : item.kind === "compra" ? <ShoppingBag className="size-3 text-emerald-600" aria-hidden /> : <UserRound className="size-3 text-slate-400" aria-hidden />}
                </span>
                <p className="text-slate-900"><JourneyText item={item} /></p>
                <p className="text-xs text-slate-500">
                  {formatDateTime(item.occurred_at)}
                  {devices.size > 1 && ` · aparelho ${devices.get(item.visitor_id)}`}
                  {item.test && " · teste"}
                </p>
              </li>
            ))}
          </ol>
        )}
        <div className="flex justify-end pt-2">
          <Button type="button" onClick={onClose}>Fechar</Button>
        </div>
      </div>
    </Modal>
  );
}

function JourneyText({ item }: { item: JourneyItem }) {
  if (item.kind === "origem") {
    return (
      <>
        Chegou por <strong>{item.channel ? CHANNEL_LABELS[item.channel] : "origem desconhecida"}</strong>
        {item.evidence && <> · {EVIDENCE_LABELS[item.evidence]}</>}
        {item.campaign && <> · {item.campaign}</>}
      </>
    );
  }
  if (item.kind === "compra") {
    return (
      <>
        <strong>Compra</strong> de {item.value_micros != null && item.currency ? formatMoney(item.value_micros / 1_000_000, item.currency) : "valor não informado"}
        {item.transaction_id && <> · pedido {item.transaction_id}</>}
      </>
    );
  }
  return (
    <>
      <strong>{eventLabel(item.name ?? "")}</strong>
      {item.page_path && <span className="text-slate-500"> em {item.page_path}</span>}
    </>
  );
}
