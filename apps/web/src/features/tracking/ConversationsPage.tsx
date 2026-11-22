import { ArrowLeft, MessageCircle, Search, Sparkles, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { Alert } from "@/components/ui/alert.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Card } from "@/components/ui/card.tsx";
import { Field, Input, Select } from "@/components/ui/field.tsx";
import { Modal } from "@/components/ui/modal.tsx";
import { useAuth } from "@/features/auth/AuthProvider.tsx";
import { useContactSetup } from "@/features/contacts/api.ts";
import { errorMessage } from "@/lib/errors.ts";
import { formatDateTime, formatRelative } from "@/lib/format.ts";
import {
  formatWaPhone,
  useWaConversationDelete,
  type ConversationRange,
  useWaConversations,
  useWaMarkSale,
  useWaMessages,
  useWaPersonSales,
  useWaSuggestionDiscard,
  WA_ORIGIN_LABEL,
  type WaConversation,
} from "./conversationsApi.ts";
import { LimparDadosDoClienteCard } from "./WhatsAppServerModal.tsx";
import { ChatSkeleton, ListSkeleton } from "@/components/ui/skeleton.tsx";
import { findTargetConversation, targetFromParams } from "./conversationTarget.ts";
import { confirmar } from "@/lib/confirmStore.ts";

const CONFIDENCE: Record<string, string> = { alta: "alta", media: "média", baixa: "baixa" };

function MarkSaleModal({ clientId, person, onClose, onDone }: {
  clientId: string;
  person: WaConversation;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const setup = useContactSetup(clientId);
  const mark = useWaMarkSale();
  const already = useWaPersonSales(person.person_id).data ?? 0;
  const stages = (setup.data?.stages ?? []).filter((s) => s.kind === "ganha" && !s.archived_at);
  // Sem valor (22/11/2026): em vez de bloquear, marca só "Qualificado" e envia apenas o LeadQualificado (mesma regra do banco: etapa aberta, com evento, nome "Qualificad…").
  const qualStage = (setup.data?.stages ?? []).find((s) => s.kind === "aberta" && !s.archived_at && s.meta_event && /^qualificad/i.test(s.name));
  const [stageId, setStageId] = useState("");
  const [value, setValue] = useState("");
  const [currency, setCurrency] = useState("BRL");
  const [order, setOrder] = useState("");
  const [error, setError] = useState<string | null>(null);
  const chosen = stageId || stages[0]?.id || "";
  const amount = Number(value.replace(",", "."));
  const validOrder = order.trim() === "" || /^[A-Za-z0-9_.:/#-]{1,100}$/.test(order.trim());
  const semValor = value.trim() === "";
  const validVenda = Boolean(chosen) && Number.isFinite(amount) && amount >= 0 && !semValor && validOrder;
  // Só qualificar: sem valor, existe a etapa Qualificado, e a pessoa ainda não tem venda (senão a etapa "voltaria" de Venda para Qualificado).
  const validQualificar = semValor && Boolean(qualStage) && already === 0;
  const valid = semValor ? validQualificar : validVenda;

  async function submit() {
    setError(null);
    try {
      if (semValor && qualStage) {
        // Só LeadQualificado, sem venda. A sugestão da IA continua pendente (venda ainda não marcada).
        const q = await mark.mutateAsync({ personId: person.person_id, stageId: qualStage.id, value: null, currency, order: null, suggestionId: null });
        onDone(
          !q.etapa ? "Esta pessoa já estava como Qualificado; nada novo foi enviado."
            : q.venda_meta === "sem_site" ? "Marcado como Qualificado. Não foi enviado ao Meta: o cliente não tem site no Tracking."
              : q.pixel_ok === false ? "Marcado como Qualificado. Atenção: este cliente ainda não tem pixel do Meta ligado, então NÃO foi enviado ao Meta. Ligue o pixel em Tracking → Clientes."
                : q.venda_meta == null ? "Marcado como Qualificado. Esta pessoa já tinha sido enviada como lead qualificado antes, então não foi enviada de novo."
                  : "Marcado como Qualificado, sem venda. O lead qualificado entra na fila da API de Conversões do Meta.",
        );
        return;
      }
      const r = await mark.mutateAsync({ personId: person.person_id, stageId: chosen, value: amount, currency, order, suggestionId: person.suggestion_id });
      onDone(
        r.venda_meta === "sem_site" ? "Venda registrada. Não foi enviada ao Meta: o cliente não tem site no Tracking."
          : r.pixel_ok === false ? "Venda registrada. Atenção: este cliente ainda não tem pixel do Meta ligado, então ela NÃO foi enviada ao Meta. Ligue o pixel em Tracking → Clientes."
            : "Venda registrada. A compra e o lead qualificado entram na fila da API de Conversões do Meta.",
      );
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <Modal title={`Marcar venda — ${person.push_name ?? formatWaPhone(person.phone, person.phone_tail)}`} open onClose={onClose}>
      <div className="space-y-4 text-sm text-slate-700" data-testid="mark-sale">
        <p>
          Registra a venda no Contato desta pessoa e a envia ao Meta pela API de Conversões. Vale também para quem veio <strong>sem anúncio identificado</strong>:
          o Meta só atribui se esse telefone casar com alguém que viu o anúncio, mas a venda fica registrada aqui de qualquer jeito.
        </p>
        {error && <Alert tone="error">{error}</Alert>}
        {already > 0 && (
          <Alert tone="warning">
            <span data-testid="mark-sale-already">Esta pessoa <strong>já tem {already} venda(s) marcada(s)</strong> (em Contatos ou em Tracking → WhatsApp). Se for a mesma venda, <strong>não marque de novo</strong>: o Meta contaria duas compras.</span>
          </Alert>
        )}
        {setup.isPending ? <p className="text-slate-500">Carregando as etapas…</p> : stages.length === 0 ? (
          <Alert tone="warning">Este cliente não tem uma etapa de venda (“ganha”). Cadastre em Contatos → Etapas antes de marcar a venda.</Alert>
        ) : (
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Etapa">
              {(id) => <Select id={id} value={chosen} onChange={(e) => setStageId(e.target.value)}>{stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select>}
            </Field>
            <Field label="Valor da venda" hint="Sem valor? Deixe vazio: marca só “Qualificado” e envia o LeadQualificado ao Meta, sem registrar venda.">
              {(id) => <Input id={id} inputMode="decimal" value={value} placeholder="297,00" onChange={(e) => setValue(e.target.value)} />}
            </Field>
            <Field label="Moeda">
              {(id) => <Select id={id} value={currency} onChange={(e) => setCurrency(e.target.value)}><option value="BRL">BRL (R$)</option><option value="USD">USD (US$)</option></Select>}
            </Field>
            <div className="sm:col-span-3">
              <Field label="Nº do pedido (opcional)" hint={validOrder ? "Se deixar em branco, o CRM cria um nº sozinho. O mesmo nº não pode ser usado duas vezes." : "Use só letras, números e - _ . : / # (até 100 caracteres)."}>
                {(id) => <Input id={id} value={order} maxLength={100} placeholder="Ex.: PED-1042" onChange={(e) => setOrder(e.target.value)} data-testid="mark-sale-order" />}
              </Field>
            </div>
          </div>
        )}
        {semValor && !qualStage && !setup.isPending && <p className="text-xs text-amber-700" data-testid="mark-sale-sem-qualificado">Este cliente não tem a etapa “Qualificado” com evento. Informe o valor para marcar a venda, ou cadastre a etapa em Contatos → Etapas.</p>}
        {semValor && qualStage && already > 0 && <p className="text-xs text-amber-700">Esta pessoa já tem venda: para marcar outra, informe o valor. Sem valor não há o que qualificar.</p>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button disabled={!valid || (!semValor && stages.length === 0)} loading={mark.isPending} onClick={() => void submit()} data-testid="mark-sale-submit">
            {semValor ? "Só qualificar (sem venda)" : "Marcar venda"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function Bubble({ direction, at, body }: { direction: "recebida" | "enviada"; at: string; body: string }) {
  const mine = direction === "enviada";
  return (
    <div className={`flex ${mine ? "justify-end" : "justify-start"}`} data-testid={`wa-msg-${direction}`}>
      <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${mine ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-900"}`}>
        <p className="whitespace-pre-wrap break-words">{body}</p>
        <p className={`mt-1 text-[11px] ${mine ? "text-blue-100" : "text-slate-500"}`}>{mine ? "Atendente" : "Cliente"} · {formatDateTime(at)}</p>
      </div>
    </div>
  );
}

function Chat({ clientId, person, canDelete, onDeleted, startMarking = false }: { clientId: string; person: WaConversation; canDelete: boolean; onDeleted: () => void; startMarking?: boolean }) {
  const messages = useWaMessages(person.person_id);
  const del = useWaConversationDelete();
  const discard = useWaSuggestionDiscard();
  const [marking, setMarking] = useState(startMarking);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Cada página vem das mais novas para as mais antigas; a tela mostra em ordem de leitura.
  const ordered = useMemo(() => (messages.data?.pages ?? []).flat().slice().reverse(), [messages.data]);

  return (
    <div className="flex min-h-96 flex-col gap-3" data-testid="wa-chat">
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-100 pb-3">
        <div className="min-w-0">
          <h2 className="truncate text-base font-semibold text-slate-900">{person.push_name ?? "Sem nome no WhatsApp"}</h2>
          <p className="text-sm text-slate-600" data-testid="wa-chat-phone">{formatWaPhone(person.phone, person.phone_tail)}</p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <Badge tone={person.from_ad ? "success" : "neutral"}>{WA_ORIGIN_LABEL[person.origin]}</Badge>
            {person.ad_id && <span className="text-xs text-slate-500">Anúncio {person.ad_id}</span>}
            {(person.contact_sales ?? 0) > 0 && <Badge tone="success">{person.contact_sales} venda(s) marcada(s)</Badge>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => { setNotice(null); setMarking(true); }} data-testid="wa-mark-sale">Marcar venda</Button>
          {person.contact_id != null && (
            <Link to={`/clientes/${clientId}?aba=contatos`} className="inline-flex items-center rounded-lg bg-white px-3 py-2 text-sm font-medium text-slate-700 ring-1 ring-inset ring-slate-200 hover:text-blue-700">Ver em Contatos</Link>
          )}
          {canDelete && (
            <Button variant="danger" loading={del.isPending} aria-label="Apagar esta conversa"
              onClick={async () => {
                if (!(await confirmar("Apagar esta conversa do CRM? As mensagens e o telefone guardados somem para sempre. Isso fica no histórico, sem o texto."))) return;
                setError(null);
                del.mutate(person.person_id, { onSuccess: onDeleted, onError: (e) => setError(errorMessage(e)) });
              }}>
              <Trash2 className="size-4" aria-hidden /> Apagar
            </Button>
          )}
        </div>
      </div>

      {person.suggestion_id && (
        <Alert tone="info">
          <div className="space-y-2" data-testid="wa-chat-suggestion">
            <p className="flex items-start gap-2"><Sparkles className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span><strong>A IA acha que houve venda</strong> (confiança {CONFIDENCE[person.suggestion_confidence ?? "media"]}): {person.suggestion_reason}</span></p>
            <p className="text-xs">Confira a conversa abaixo. A IA só sugere: quem marca a venda é você.</p>
            <Button variant="secondary" className="px-3 py-1.5 text-xs" loading={discard.isPending}
              onClick={() => discard.mutate(person.suggestion_id!, { onError: (e) => setError(errorMessage(e)) })}>Não houve venda (descartar)</Button>
          </div>
        </Alert>
      )}
      {notice && <Alert tone="success">{notice}</Alert>}
      {error && <Alert tone="error">{error}</Alert>}

      <div className="max-h-[32rem] flex-1 space-y-2 overflow-y-auto rounded-xl bg-white p-1" data-testid="wa-messages">
        {messages.hasNextPage && (
          <div className="flex justify-center">
            <Button variant="ghost" className="text-xs" loading={messages.isFetchingNextPage} onClick={() => void messages.fetchNextPage()}>Carregar mensagens mais antigas</Button>
          </div>
        )}
        {messages.isPending ? <ChatSkeleton />
          : messages.error ? <Alert tone="error">{errorMessage(messages.error)}</Alert>
          : ordered.length === 0 ? <p className="p-4 text-sm text-slate-500">Nenhuma mensagem guardada.</p>
          : ordered.map((m) => <Bubble key={m.id} direction={m.direction} at={m.at} body={m.body} />)}
      </div>

      {marking && (
        <MarkSaleModal clientId={clientId} person={person} onClose={() => setMarking(false)}
          onDone={(message) => { setMarking(false); setNotice(message); }} />
      )}
    </div>
  );
}

/**
 * Conversas do WhatsApp do cliente (Tracking T5.7): lista de pessoas, a conversa inteira, de onde vieram, o que a IA sugeriu
 * e o botão "Marcar venda". Só administrador, gestor e o Account Manager do cliente leem (o banco confere); só o administrador apaga.
 */
export function ConversationsPanel({ clientId }: { clientId: string }) {
  const id = clientId;
  const { profile } = useAuth();
  // Vindo de "Abrir a conversa e marcar a venda" (sugestão da IA): o endereço traz quem é; a lista já filtra por essa pessoa e a conversa abre sozinha.
  const [qs] = useSearchParams();
  const alvo = useMemo(() => targetFromParams((k) => qs.get(k)), [qs]);
  const [search, setSearch] = useState(alvo?.final ?? alvo?.nome ?? "");
  const [veioDaSugestao, setVeioDaSugestao] = useState(Boolean(alvo));
  const [alvoFeito, setAlvoFeito] = useState(false);
  const abrirMarcar = qs.get("marcar") === "1";
  const [alvoPessoa, setAlvoPessoa] = useState<number | null>(null);
  const [vendasNaChegada, setVendasNaChegada] = useState(0); // vendas já marcadas quando a pessoa foi aberta (a lista atualiza depois de marcar)
  const [selected, setSelected] = useState<number | null>(null);
  const [preset, setPreset] = useState<PeriodPreset>("tudo");
  const [dayFrom, setDayFrom] = useState("");
  const [dayTo, setDayTo] = useState("");
  const range = useMemo(() => conversationRange(preset, dayFrom, dayTo, new Date()), [preset, dayFrom, dayTo]);
  const list = useWaConversations(id, search, range);
  const people = (list.data?.pages ?? []).flat().filter((p) => (!range.from || p.last_at >= range.from) && (!range.to || p.last_at <= range.to));
  const current = people.find((p) => p.person_id === selected) ?? null;
  useEffect(() => {
    if (!alvo || alvoFeito || list.isPending) return;
    const achou = findTargetConversation(people, alvo);
    if (achou) { setAlvoFeito(true); setSelected(achou.person_id); setAlvoPessoa(achou.person_id); setVendasNaChegada(achou.contact_sales ?? 0); }
    else if (!list.hasNextPage) setAlvoFeito(true); // procurou em tudo: não achou, a tela avisa
  }, [alvo, alvoFeito, people, list.isPending, list.hasNextPage]);
  // No celular, ao abrir uma conversa a tela vai direto para ela (sem isso o texto ficava lá embaixo, depois do cabeçalho do Tracking).
  const chatRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (selected !== null && window.matchMedia("(max-width: 1023px)").matches) chatRef.current?.scrollIntoView({ block: "start" });
  }, [selected]);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900"><MessageCircle className="size-5" aria-hidden /> Conversas do WhatsApp</h2>
        <p className="text-sm text-slate-600">
          Todas as conversas individuais do WhatsApp deste cliente, guardadas sem prazo. Veja de onde cada pessoa veio, confira o que a IA sugeriu e marque a venda.
          O telefone e as mensagens são dados pessoais: não compartilhe fora do CRM.
        </p>
      </div>

      <LimparDadosDoClienteCard clientId={id} />

      {veioDaSugestao && (
        <Alert tone="info">
          <div className="flex flex-wrap items-center gap-2" data-testid="wa-from-suggestion">
            <span>{current ? "Conversa da sugestão da IA aberta." : "Procurando a conversa da sugestão da IA…"}{!current && alvoFeito && !list.isPending ? " Não achamos essa conversa na lista (o telefone ou o nome podem ter mudado)." : ""}</span>
            <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => { setVeioDaSugestao(false); setSearch(""); }}>Ver todas as conversas</Button>
          </div>
        </Alert>
      )}

      <div className="grid gap-4 lg:grid-cols-[22rem_1fr]">
        {/* No celular é uma coisa de cada vez: a lista OU a conversa aberta (antes a conversa aparecia embaixo da lista, longe do toque). */}
        <Card className={`space-y-3 p-3 ${current ? "hidden lg:block" : ""}`} data-testid="wa-conversations">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-slate-400" aria-hidden />
            <Input aria-label="Buscar por nome ou telefone" placeholder="Buscar por nome ou telefone" className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="space-y-2" data-testid="wa-conversations-period">
            <label className="flex items-center gap-2 text-xs text-slate-600">
              <span className="shrink-0 font-medium">Período:</span>
              <select className="w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-sm" aria-label="Período das conversas" value={preset}
                onChange={(e) => setPreset(e.target.value as PeriodPreset)}>
                {(Object.keys(CONVERSATION_PERIODS) as PeriodPreset[]).map((k) => <option key={k} value={k}>{CONVERSATION_PERIODS[k]}</option>)}
              </select>
            </label>
            {preset === "datas" && (
              <div className="grid grid-cols-2 gap-2 text-xs text-slate-600">
                <label>De<Input type="date" aria-label="Conversas a partir de" value={dayFrom} max={dayTo || undefined} onChange={(e) => setDayFrom(e.target.value)} /></label>
                <label>Até<Input type="date" aria-label="Conversas até" value={dayTo} min={dayFrom || undefined} onChange={(e) => setDayTo(e.target.value)} /></label>
              </div>
            )}
          </div>
          {list.error ? <Alert tone="error">{errorMessage(list.error)}</Alert>
            : list.isPending ? <ListSkeleton label="Carregando as conversas" card={false} rows={4} />
            : people.length === 0 ? (
              <p className="p-3 text-sm text-slate-500" data-testid="wa-conversations-empty">
                {search || preset !== "tudo" ? "Nenhuma conversa encontrada neste filtro." : "Ainda não há conversas guardadas. Ligue “Guardar as conversas” na aba WhatsApp deste cliente; as mensagens aparecem aqui daí para a frente."}
              </p>
            ) : (
              <ul className="max-h-[36rem] divide-y divide-slate-100 overflow-y-auto">
                {people.map((p) => (
                  <li key={p.person_id}>
                    <button type="button" data-testid="wa-conversation" aria-current={p.person_id === selected}
                      onClick={() => setSelected(p.person_id)}
                      className={`w-full space-y-1 rounded-lg px-3 py-2 text-left hover:bg-slate-50 ${p.person_id === selected ? "bg-blue-50" : ""}`}>
                      <span className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-medium text-slate-900">{p.push_name ?? formatWaPhone(p.phone, p.phone_tail)}</span>
                        <span className="shrink-0 text-xs text-slate-500">{formatRelative(p.last_at)}</span>
                      </span>
                      <span className="block truncate text-xs text-slate-600">{p.last_direction === "enviada" ? "Você: " : ""}{p.last_preview}</span>
                      <span className="flex flex-wrap gap-1">
                        <Badge tone={p.from_ad ? "success" : "neutral"}>{p.from_ad ? "Anúncio" : p.origin === "site" ? "Site" : "Sem origem identificada"}</Badge>
                        {p.suggestion_id && <Badge tone="warning">IA sugere venda</Badge>}
                        {(p.contact_sales ?? 0) > 0 && <Badge tone="success">Venda marcada</Badge>}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          {list.hasNextPage && (
            <Button variant="ghost" className="w-full text-xs" loading={list.isFetchingNextPage} onClick={() => void list.fetchNextPage()}>Carregar mais conversas</Button>
          )}
        </Card>

        <div ref={chatRef} className={`scroll-mt-3 ${current ? "" : "hidden lg:block"}`}>
        <Card className="p-4">
          {current && (
            <button type="button" data-testid="wa-chat-voltar" onClick={() => setSelected(null)}
              className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-blue-700 hover:underline lg:hidden">
              <ArrowLeft className="size-4" aria-hidden /> Voltar às conversas
            </button>
          )}
          {current && id ? (
            <>
              {abrirMarcar && alvoPessoa === current.person_id && vendasNaChegada > 0 && (
                <Alert tone="info">Esta pessoa já tinha venda marcada ({vendasNaChegada}). Não abri a marcação para não enviar a compra duas vezes ao Meta; se for outra venda, use “Marcar venda” abaixo.</Alert>
              )}
              <Chat key={current.person_id} clientId={id} person={current} canDelete={profile?.role === "admin"} onDeleted={() => setSelected(null)}
                startMarking={abrirMarcar && alvoPessoa === current.person_id && vendasNaChegada === 0} />
            </>
          ) : (
            <p className="p-6 text-center text-sm text-slate-500" data-testid="wa-chat-empty">Escolha uma conversa na lista para ler.</p>
          )}
        </Card>
        </div>
      </div>
    </div>
  );
}

/** Conversas de um cliente para quem não tem o Tracking (Account Manager): o banco só devolve se a pessoa for do cliente. */
export function ConversationsStandalone({ clientId }: { clientId: string }) {
  return <ConversationsPanel clientId={clientId} />;
}

type PeriodPreset = "tudo" | "hoje" | "7" | "30" | "90" | "180" | "datas";
const CONVERSATION_PERIODS: Record<PeriodPreset, string> = {
  tudo: "Todas", hoje: "Hoje", "7": "Últimos 7 dias", "30": "Últimos 30 dias", "90": "Últimos 90 dias", "180": "Últimos 6 meses", datas: "Escolher datas…",
};

/** Converte o período escolhido em limites (início e fim do dia, no fuso do navegador). */
function conversationRange(preset: PeriodPreset, dayFrom: string, dayTo: string, now: Date): ConversationRange {
  const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
  if (preset === "tudo") return { from: null, to: null };
  if (preset === "hoje") return { from: startOf(now).toISOString(), to: null };
  if (preset === "datas") {
    const from = dayFrom ? new Date(`${dayFrom}T00:00:00`) : null;
    const to = dayTo ? new Date(`${dayTo}T23:59:59.999`) : null;
    return { from: from && !Number.isNaN(from.getTime()) ? from.toISOString() : null, to: to && !Number.isNaN(to.getTime()) ? to.toISOString() : null };
  }
  const start = startOf(now);
  start.setDate(start.getDate() - Number(preset));
  return { from: start.toISOString(), to: null };
}
