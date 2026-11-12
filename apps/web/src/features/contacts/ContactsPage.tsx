import { can, CHANNEL_LABELS, type Channel, EVIDENCE_LABELS, type Evidence, hashUserData, normalizeLeadPhone } from "@backstage/shared";
import { Archive, ClipboardList, MessageSquareText, Plus, Search, Settings2, Store } from "lucide-react";
import { type FormEvent, useMemo, useState } from "react";
import { Alert } from "@/components/ui/alert.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Card } from "@/components/ui/card.tsx";
import { Field, Input, Select } from "@/components/ui/field.tsx";
import { Modal } from "@/components/ui/modal.tsx";
import { useAuth } from "@/features/auth/AuthProvider.tsx";
import { normalizeWaCode, parseMoneyInput } from "@/features/tracking/logic.ts";
import { cn } from "@/lib/cn.ts";
import { errorMessage } from "@/lib/errors.ts";
import { formatDateTime, formatMoney, formatRelative } from "@/lib/format.ts";
import { useSearchParamsUpdater } from "@/lib/useSearchParamsUpdater.ts";
import {
  type ContactProfile,
  type ContactRow,
  type ContactStage,
  findContacts,
  useArchiveContact,
  useContactClients,
  useContactHistory,
  useContactRastreio,
  useContacts,
  useContactSetup,
  useCreateContact,
  type UpdateResult,
  useUpdateContact,
} from "./api.ts";
import { LeadFormsModal } from "./LeadFormsModal.tsx";
import { SalesSystemsModal } from "./SalesSystemsModal.tsx";
import { WhatsAppPhrasesModal } from "./WhatsAppPhrasesModal.tsx";
import { SetupModal } from "./SetupModal.tsx";

const ORIGIN_LABELS: Record<ContactRow["origin"], string> = { site: "Site", whatsapp: "WhatsApp", manual: "Manual", sistema: "Sistema de vendas" };
const STAGE_TONE: Record<ContactStage["kind"], "neutral" | "success" | "danger"> = { aberta: "neutral", ganha: "success", perdida: "danger" };

/** O que a marcação fez, em português (sem prometer envio: o Meta só recebe se o Meta CAPI do site estiver ligado). */
function metaMessage(r: UpdateResult): string | null {
  const parts: string[] = [];
  const note = (res: string | null | undefined) =>
    res === "sem_site" ? " Não foi para o Meta: o cliente não tem site no Tracking."
      : res === "cliente_desativado" ? " Cliente desativado: nada foi para o Meta." : "";
  if (r.perfil) {
    parts.push(r.perfil_meta == null ? `Perfil ${r.perfil} salvo.`
      : `Perfil ${r.perfil} salvo.${note(r.perfil_meta) || " Evento preparado para o Meta (sai pelo Meta CAPI do site)."}`);
  }
  if (r.etapa) parts.push(r.venda_meta == null ? `Etapa ${r.etapa} salva.` : `Venda registrada.${note(r.venda_meta)}`);
  return parts.length ? parts.join(" ") : null;
}

/** Contatos dos clientes (Tracking T3.1): no lugar da planilha. Equipe da agência e vendedor do cliente. */
/** `fixedClientId`: dentro da ficha do cliente (aba Contatos e vendas) a tela vale só para aquele cliente. */
export function ContactsPage({ fixedClientId }: { fixedClientId?: string } = {}) {
  const { profile } = useAuth();
  const canMark = can(profile?.role, "contacts.mark");
  const canSetup = can(profile?.role, "contacts.setup");
  const isSeller = profile?.role === "vendedor";
  const clients = useContactClients();
  const [params, update] = useSearchParamsUpdater();
  const clientId = fixedClientId ?? params.get("cliente") ?? clients.data?.[0]?.id ?? null;
  const client = clients.data?.find((c) => c.id === clientId) ?? null;
  const setup = useContactSetup(clientId);
  const [stageFilter, setStageFilter] = useState<string | null>(null);
  const list = useContacts(clientId, { stageId: stageFilter });
  const create = useCreateContact();
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<ContactRow[] | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<number | null>(null);
  const [creatingPhone, setCreatingPhone] = useState<string | null>(null);
  const [showSetup, setShowSetup] = useState(false);
  const [showSales, setShowSales] = useState(false);
  const [showLeadForms, setShowLeadForms] = useState(false);
  const [showPhrases, setShowPhrases] = useState(false);

  const stages = useMemo(() => (setup.data?.stages ?? []).filter((s) => !s.archived_at), [setup.data]);
  const profiles = useMemo(() => (setup.data?.profiles ?? []).filter((p) => !p.archived_at), [setup.data]);
  const stageOf = (id: string | null) => setup.data?.stages.find((s) => s.id === id);
  const profileOf = (id: string | null) => setup.data?.profiles.find((p) => p.id === id);
  const rows = found ?? list.data ?? [];
  const opened = rows.find((r) => r.id === openId) ?? list.data?.find((r) => r.id === openId) ?? null;

  async function onSearch(e: FormEvent) {
    e.preventDefault();
    setSearchError(null);
    setFound(null);
    setCreatingPhone(null);
    if (!clientId || !query.trim()) return;
    try {
      const code = normalizeWaCode(query);
      if (code) {
        const rows = await findContacts(clientId, { code });
        if (rows.length) return openRow(rows);
        if (!canMark) return setFound([]);
        // Código de um clique no WhatsApp que ainda não virou contato: cria com a origem do clique.
        const id = await create.mutateAsync({ clientId, code });
        setOpenId(id);
        return;
      }
      const phone = normalizeLeadPhone(query);
      if (!phone) return setSearchError("Digite o código da mensagem (ex.: K7Q2M9) ou o telefone com DDD.");
      const { ph } = await hashUserData({ phone: query });
      const rows = await findContacts(clientId, { phHash: ph });
      if (rows.length) return openRow(rows);
      setFound([]);
      if (canMark) setCreatingPhone(query);
    } catch (err) {
      setSearchError(errorMessage(err));
    }
  }
  function openRow(rows: ContactRow[]) {
    setFound(rows);
    setOpenId(rows[0].id);
  }
  async function createFromPhone() {
    if (!clientId || !creatingPhone) return;
    try {
      const { ph } = await hashUserData({ phone: creatingPhone });
      const id = await create.mutateAsync({ clientId, phHash: ph });
      setCreatingPhone(null);
      setFound(null);
      setQuery("");
      setOpenId(id);
    } catch (err) {
      setSearchError(errorMessage(err));
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          {fixedClientId ? <h2 className="text-lg font-semibold text-slate-900">Contatos e vendas</h2> : <h1 className="text-2xl font-semibold tracking-tight">Contatos</h1>}
          <p className="mt-1 text-sm text-slate-500">
            Quem chamou ou se cadastrou, de onde veio e em que etapa está. Marcar Lojista ou Venda avisa o Meta, para ele trazer mais gente assim.
          </p>
        </div>
        {canSetup && clientId && (
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => setShowPhrases(true)}>
              <MessageSquareText className="size-4" aria-hidden /> Frases do WhatsApp
            </Button>
            <Button variant="secondary" onClick={() => setShowLeadForms(true)}>
              <ClipboardList className="size-4" aria-hidden /> Formulários de outros sistemas
            </Button>
            <Button variant="secondary" onClick={() => setShowSales(true)}>
              <Store className="size-4" aria-hidden /> Sistemas de venda
            </Button>
            <Button variant="secondary" onClick={() => setShowSetup(true)}>
              <Settings2 className="size-4" aria-hidden /> Perfis e etapas
            </Button>
          </div>
        )}
      </div>

      {clients.error && <Alert tone="error">{errorMessage(clients.error)}</Alert>}
      {clients.data && clients.data.length === 0 && (
        <Alert tone="info">{isSeller ? "Nenhum cliente liberado para você ainda. Fale com a agência." : "Nenhum cliente disponível."}</Alert>
      )}

      {!fixedClientId && clients.data && clients.data.length > 1 && (
        <Field label="Cliente">
          {(id) => (
            <Select id={id} value={clientId ?? ""} onChange={(e) => {
              update((p) => { p.set("cliente", e.target.value); return p; });
              setFound(null); setStageFilter(null); setOpenId(null);
            }}>
              {clients.data.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          )}
        </Field>
      )}

      {clientId && (
        <>
          {client && !client.has_site && (
            <Alert tone="warning">
              Este cliente ainda não tem site no Tracking: as marcações ficam salvas aqui, mas só vão ao Meta depois que o site (com o Pixel) for cadastrado.
            </Alert>
          )}

          <Card className="space-y-3 p-4">
            <form className="flex flex-col gap-2 sm:flex-row" onSubmit={onSearch}>
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-slate-400" aria-hidden />
                <Input aria-label="Código da mensagem ou telefone" className="pl-9" placeholder="Código da mensagem (ref. K7Q2M9) ou telefone"
                  value={query} onChange={(e) => { setQuery(e.target.value); if (!e.target.value) { setFound(null); setCreatingPhone(null); } }} />
              </div>
              <Button type="submit" loading={create.isPending}>Buscar</Button>
            </form>
            <p className="text-xs text-slate-500">O telefone é cifrado aqui mesmo, antes de sair do aparelho. Nome e conversa nunca são guardados.</p>
            {searchError && <Alert tone="error">{searchError}</Alert>}
            {found && found.length === 0 && (
              <div className="flex flex-wrap items-center gap-2 text-sm text-slate-700" data-testid="contact-not-found">
                Nenhum contato com isso.
                {creatingPhone && (
                  <Button variant="secondary" className="px-3 py-1.5 text-xs" onClick={createFromPhone} data-testid="contact-create-phone">
                    <Plus className="size-3.5" aria-hidden /> Criar contato com este telefone
                  </Button>
                )}
              </div>
            )}
          </Card>

          <div className="flex flex-wrap gap-1" role="tablist" aria-label="Etapa">
            {[{ id: null as string | null, name: "Todos" }, ...stages].map((s) => (
              <button key={s.id ?? "todos"} type="button" role="tab" aria-selected={stageFilter === s.id}
                onClick={() => { setStageFilter(s.id); setFound(null); }}
                className={cn("rounded-lg px-3 py-1.5 text-sm font-medium", stageFilter === s.id ? "bg-brand-600 text-white" : "text-slate-600 hover:bg-slate-100")}>
                {s.name}
              </button>
            ))}
          </div>

          {list.error && <Alert tone="error">{errorMessage(list.error)}</Alert>}
          {list.isLoading ? (
            <div className="h-32 animate-pulse rounded-xl bg-slate-100" aria-label="Carregando contatos" />
          ) : rows.length === 0 && !found ? (
            <Alert tone="info">Nenhum contato ainda. Eles chegam sozinhos pelo site e pelo WhatsApp com código, ou busque um código/telefone acima.</Alert>
          ) : (
            <ul className="space-y-2" data-testid="contacts-list">
              {rows.map((r) => {
                const st = stageOf(r.stage_id);
                const pf = profileOf(r.profile_id);
                return (
                  <li key={r.id}>
                    <button type="button" onClick={() => setOpenId(r.id)} data-testid="contact-row"
                      className="w-full rounded-xl bg-white p-3 text-left text-sm shadow-sm ring-1 ring-slate-200 hover:ring-brand-400">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-medium text-slate-900">
                          Contato #{r.id} · {ORIGIN_LABELS[r.origin]}{r.ref_code ? ` (ref. ${r.ref_code})` : ""}
                        </span>
                        <span className="flex flex-wrap gap-1">
                          {pf && <Badge tone="brand">{pf.name}</Badge>}
                          {st && <Badge tone={STAGE_TONE[st.kind]}>{st.name}</Badge>}
                          {r.archived && <Badge>Arquivado</Badge>}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-slate-500">
                        {r.channel ? CHANNEL_LABELS[r.channel as Channel] ?? r.channel : "Origem não identificada"}
                        {r.campaign ? ` · ${r.campaign}` : ""} · {formatRelative(r.last_change_at)}
                        {r.sales > 0 ? ` · ${r.sales} venda${r.sales === 1 ? "" : "s"}` : ""}
                      </p>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}

      {opened && (
        <ContactModal contact={opened} profiles={profiles} stages={stages} canMark={canMark} canArchive={canMark && !isSeller}
          stageOf={stageOf} profileOf={profileOf} onClose={() => setOpenId(null)} />
      )}
      {showPhrases && clientId && setup.data && (
        <WhatsAppPhrasesModal clientId={clientId} profiles={setup.data.profiles} stages={setup.data.stages} onClose={() => setShowPhrases(false)} />
      )}
      {showLeadForms && clientId && <LeadFormsModal clientId={clientId} onClose={() => setShowLeadForms(false)} />}
      {showSales && clientId && <SalesSystemsModal clientId={clientId} onClose={() => setShowSales(false)} />}
      {showSetup && clientId && setup.data && (
        <SetupModal clientId={clientId} profiles={setup.data.profiles} stages={setup.data.stages} onClose={() => setShowSetup(false)} />
      )}
    </div>
  );
}

/**
 * T5.35: ficha de rastreio do contato — de onde ele veio (o que o tracker.ads mostra no "Rastreio do contato").
 * Tudo aqui já estava gravado pelo tracking: a tela só reúne. Nenhum dado pessoal (e-mail e telefone nunca saem em claro).
 */
function RastreioContato({ contactId }: { contactId: number }) {
  const { data, isLoading, error } = useContactRastreio(contactId);
  if (isLoading) return <div className="h-16 animate-pulse rounded-lg bg-slate-100" aria-label="Carregando o rastreio" />;
  if (error) return <Alert tone="error">{errorMessage(error)}</Alert>;
  if (!data) return null;

  const canal = data.canal ? CHANNEL_LABELS[data.canal as Channel] ?? data.canal : "Origem não identificada";
  const confianca = data.evidence ? EVIDENCE_LABELS[data.evidence as Evidence] ?? data.evidence : "—";
  const pago = data.pago === true ? "Pago" : data.pago === false ? "Orgânico" : "Não dá para saber";
  const utms = [
    ["utm_source", data.utm_source], ["utm_medium", data.utm_medium],
    ["utm_campaign", data.utm_campaign], ["utm_content", data.utm_content],
    ["fbclid", data.fbclid], ["gclid", data.gclid],
  ].filter(([, v]) => v) as [string, string][];

  const Item = ({ rotulo, valor }: { rotulo: string; valor: string | null | undefined }) => (
    <div>
      <dt className="text-[11px] uppercase tracking-wide text-slate-400">{rotulo}</dt>
      <dd className="break-words text-sm text-slate-900">{valor || "—"}</dd>
    </div>
  );

  const bloco = (titulo: string, children: React.ReactNode) => (
    <div className="space-y-1.5 rounded-lg bg-white p-3 ring-1 ring-slate-200">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{titulo}</p>
      <dl className="grid grid-cols-2 gap-2 text-xs text-slate-500">{children}</dl>
    </div>
  );

  return (
    <section className="space-y-2" data-testid="contact-rastreio">
      <p className="text-sm font-semibold text-slate-900">Rastreio do contato</p>

      {bloco("Resumo", <>
        <Item rotulo="Canal de captura" valor={canal} />
        <Item rotulo="Método" valor={data.metodo} />
        <Item rotulo="Plataforma do anúncio" valor={data.plataforma} />
        <Item rotulo="Confiança" valor={confianca} />
        <Item rotulo="Origem do anúncio" valor={pago} />
        <Item rotulo="Site" valor={data.site} />
      </>)}

      {(data.url_origem || data.ad_ad_id || data.ad_campaign_id || data.ad_adset_id) && bloco("Dados do anúncio (capturados no clique)", <>
        {data.url_origem && <div className="col-span-2"><dt className="text-[11px] uppercase tracking-wide text-slate-400">URL de origem</dt><dd className="break-all text-sm text-slate-900">{data.url_origem}</dd></div>}
        <Item rotulo="ID do anúncio" valor={data.ad_ad_id} />
        <Item rotulo="ID do conjunto" valor={data.ad_adset_id} />
        <Item rotulo="ID da campanha" valor={data.ad_campaign_id} />
      </>)}

      {(data.campanha || data.conjunto || data.plataforma) && bloco("Campanha e conjunto", <>
        <Item rotulo="Campanha" valor={data.campanha} />
        <Item rotulo="Conjunto" valor={data.conjunto} />
        <Item rotulo="Plataforma" valor={data.plataforma} />
        <Item rotulo="Origem do clique" valor={data.referrer} />
      </>)}

      {(data.ctwa_clid || data.waba_id || data.numero) && bloco("Clique to WhatsApp (técnico)", <>
        <Item rotulo="ctwa_clid" valor={data.ctwa_clid} />
        <Item rotulo="waba_id" valor={data.waba_id} />
        <Item rotulo="Número" valor={data.numero} />
        <Item rotulo="Código da mensagem" valor={data.ref_code} />
      </>)}

      {(data.capi_eventos != null || (data.meta_enviado?.length ?? 0) > 0) && bloco("Conversões (API de Conversões do Meta)", <>
        <Item rotulo="Eventos enviados" valor={data.capi_eventos != null ? String(data.capi_eventos) : null} />
        <Item rotulo="Último envio" valor={data.capi_quando ? formatDateTime(data.capi_quando) : null} />
        <Item rotulo="Já foi ao Meta" valor={(data.meta_enviado?.length ?? 0) > 0 ? data.meta_enviado!.join(", ") : null} />
        <Item rotulo="Erro" valor={data.capi_erro} />
      </>)}

      {utms.length > 0 && bloco("Parâmetros capturados na visita", utms.map(([k, v]) => (
        <Item key={k} rotulo={k} valor={v} />
      )))}

      {data.motivo && <p className="text-xs text-slate-500">Como a origem foi identificada: {data.motivo}.</p>}
    </section>
  );
}

function ContactModal({ contact: c, profiles, stages, canMark, canArchive, stageOf, profileOf, onClose }: {
  contact: ContactRow;
  profiles: ContactProfile[];
  stages: ContactStage[];
  canMark: boolean;
  canArchive: boolean;
  stageOf: (id: string | null) => ContactStage | undefined;
  profileOf: (id: string | null) => ContactProfile | undefined;
  onClose: () => void;
}) {
  const history = useContactHistory(c.id);
  const save = useUpdateContact();
  const archive = useArchiveContact();
  const [saleStage, setSaleStage] = useState<ContactStage | null>(null);
  const [value, setValue] = useState("");
  const [currency, setCurrency] = useState("BRL");
  const [orderId, setOrderId] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const editable = canMark && !c.archived;

  const mark = (input: { profileId?: string; stageId?: string; value?: number; currency?: string; orderId?: string }) => {
    setMessage(null);
    save.mutate({ id: c.id, ...input }, {
      onSuccess: (r) => { setMessage(metaMessage(r)); setSaleStage(null); setValue(""); setOrderId(""); },
    });
  };
  const sale = parseMoneyInput(value);

  return (
    <Modal title={`Contato #${c.id}`} open onClose={onClose}>
      <div className="space-y-4 text-sm" data-testid="contact-modal">
        <dl className="grid grid-cols-2 gap-2 text-xs text-slate-500">
          <div><dt>Chegou por</dt><dd className="text-sm text-slate-900">{ORIGIN_LABELS[c.origin]}{c.ref_code ? ` (ref. ${c.ref_code})` : ""}</dd></div>
          <div><dt>Origem</dt><dd className="text-sm text-slate-900">{c.channel ? CHANNEL_LABELS[c.channel as Channel] ?? c.channel : "Não identificada"}</dd></div>
          <div className="col-span-2"><dt>Campanha</dt><dd className="text-sm text-slate-900">{c.campaign ?? "—"}</dd></div>
          <div><dt>Contato guardado</dt><dd className="text-sm text-slate-900">{[c.has_phone && "telefone", c.has_email && "e-mail"].filter(Boolean).join(" e ") ? `${[c.has_phone && "telefone", c.has_email && "e-mail"].filter(Boolean).join(" e ")} (cifrado)` : "Só o código da mensagem"}</dd></div>
          <div><dt>Desde</dt><dd className="text-sm text-slate-900">{formatDateTime(c.created_at)}</dd></div>
        </dl>

        <RastreioContato contactId={c.id} />

        <section className="space-y-2">
          <h3 className="font-semibold text-slate-900">Perfil</h3>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Perfil">
            {profiles.map((p) => (
              <button key={p.id} type="button" disabled={!editable || save.isPending} aria-pressed={c.profile_id === p.id}
                onClick={() => mark({ profileId: p.id })}
                className={cn("rounded-lg px-3 py-2 text-sm font-medium ring-1 ring-inset",
                  c.profile_id === p.id ? "bg-blue-600 text-white ring-blue-600" : "bg-white text-slate-700 ring-slate-200 hover:ring-blue-400 disabled:opacity-60")}>
                {p.name}{p.meta_event ? " ★" : ""}
              </button>
            ))}
          </div>
          <p className="text-xs text-slate-500">★ = vai ao Meta (uma vez por pessoa).</p>
        </section>

        <section className="space-y-2">
          <h3 className="font-semibold text-slate-900">Etapa</h3>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Etapa do contato">
            {stages.map((s) => (
              <button key={s.id} type="button" disabled={!editable || save.isPending} aria-pressed={c.stage_id === s.id}
                onClick={() => (s.kind === "ganha" ? setSaleStage(s) : mark({ stageId: s.id }))}
                className={cn("rounded-lg px-3 py-2 text-sm font-medium ring-1 ring-inset",
                  c.stage_id === s.id ? "bg-slate-900 text-white ring-slate-900" : "bg-white text-slate-700 ring-slate-200 hover:ring-blue-400 disabled:opacity-60")}>
                {s.name}{s.meta_event ? " ★" : ""}
              </button>
            ))}
          </div>
          {saleStage && (
            <form className="space-y-2 rounded-lg bg-emerald-50 p-3" data-testid="sale-form" onSubmit={(e) => {
              e.preventDefault();
              if (sale == null) return;
              mark({ stageId: saleStage.id, value: sale, currency, orderId: orderId.trim() || undefined });
            }}>
              <p className="font-medium text-emerald-900">Registrar venda</p>
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2"><Field label="Valor">{(id) => <Input id={id} inputMode="decimal" placeholder="297,00" value={value} onChange={(e) => setValue(e.target.value)} />}</Field></div>
                <Field label="Moeda">{(id) => <Select id={id} value={currency} onChange={(e) => setCurrency(e.target.value)}><option>BRL</option><option>USD</option><option>EUR</option></Select>}</Field>
              </div>
              <Field label="Nº do pedido (opcional)" hint="Evita contar a mesma venda duas vezes.">
                {(id) => <Input id={id} value={orderId} onChange={(e) => setOrderId(e.target.value)} />}
              </Field>
              {value && sale == null && <p className="text-xs text-red-700">Valor inválido.</p>}
              <div className="flex justify-end gap-2">
                <Button type="button" variant="secondary" onClick={() => setSaleStage(null)}>Cancelar</Button>
                <Button type="submit" disabled={sale == null} loading={save.isPending} data-testid="sale-confirm">Confirmar venda</Button>
              </div>
            </form>
          )}
        </section>

        {save.error && <Alert tone="error">{errorMessage(save.error)}</Alert>}
        {message && <Alert tone="success"><span data-testid="contact-message">{message}</span></Alert>}

        <section className="space-y-2">
          <h3 className="font-semibold text-slate-900">Histórico</h3>
          <ul className="space-y-1 text-xs text-slate-600" data-testid="contact-history">
            {(history.data ?? []).map((h) => (
              <li key={h.id}>
                <span className="text-slate-400">{formatDateTime(h.at)}</span>{" · "}
                {h.kind === "criado" && "Contato criado"}
                {h.kind === "perfil" && `Perfil: ${profileOf(h.profile_id)?.name ?? "—"}`}
                {h.kind === "etapa" && `Etapa: ${stageOf(h.stage_id)?.name ?? "—"}`}
                {h.kind === "venda" && `Venda: ${h.value_micros != null && h.currency ? formatMoney(h.value_micros / 1_000_000, h.currency) : "—"}${h.order_id ? ` (pedido ${h.order_id})` : ""}`}
                {h.kind === "arquivado" && "Arquivado"}
                {h.meta_event && <span className="text-emerald-700"> · evento para o Meta: {h.meta_event}</span>}
                {h.meta_note && <span className="text-slate-400"> · {h.meta_note}</span>}
              </li>
            ))}
          </ul>
        </section>

        {canArchive && !c.archived && (
          <div className="flex justify-end">
            <Button variant="ghost" className="text-xs" loading={archive.isPending} onClick={() => {
              if (window.confirm("Arquivar este contato? Ele sai da lista de trabalho, mas o histórico continua guardado.")) archive.mutate(c.id, { onSuccess: onClose });
            }}>
              <Archive className="size-3.5" aria-hidden /> Arquivar
            </Button>
          </div>
        )}
        {archive.error && <Alert tone="error">{errorMessage(archive.error)}</Alert>}
      </div>
    </Modal>
  );
}
