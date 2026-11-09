import { MessageCircle, Search, Sparkles, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router";
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
  useWaConversations,
  useWaMarkSale,
  useWaMessages,
  useWaPersonSales,
  useWaSuggestionDiscard,
  WA_ORIGIN_LABEL,
  type WaConversation,
} from "./conversationsApi.ts";

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
  const [stageId, setStageId] = useState("");
  const [value, setValue] = useState("");
  const [currency, setCurrency] = useState("BRL");
  const [error, setError] = useState<string | null>(null);
  const chosen = stageId || stages[0]?.id || "";
  const amount = Number(value.replace(",", "."));
  const valid = Boolean(chosen) && Number.isFinite(amount) && amount >= 0 && value.trim() !== "";

  async function submit() {
    setError(null);
    try {
      const r = await mark.mutateAsync({ personId: person.person_id, stageId: chosen, value: amount, currency, suggestionId: person.suggestion_id });
      onDone(r.venda_meta === "sem_site" ? "Venda registrada. Não foi enviada ao Meta: o cliente não tem site no Tracking." : "Venda registrada. Ela entra na fila da API de Conversões do Meta.");
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <Modal title={`Marcar venda — ${person.push_name ?? formatWaPhone(person.phone, person.phone_tail)}`} open onClose={onClose}>
      <div className="space-y-4 text-sm text-slate-700" data-testid="mark-sale">
        <p>
          Registra a venda no Contato desta pessoa e a envia ao Meta pela API de Conversões. Vale também para quem veio <strong>sem anúncio</strong> (orgânico):
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
            <Field label="Valor da venda">
              {(id) => <Input id={id} inputMode="decimal" value={value} placeholder="297,00" onChange={(e) => setValue(e.target.value)} />}
            </Field>
            <Field label="Moeda">
              {(id) => <Select id={id} value={currency} onChange={(e) => setCurrency(e.target.value)}><option value="BRL">BRL (R$)</option><option value="USD">USD (US$)</option></Select>}
            </Field>
          </div>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button disabled={!valid || stages.length === 0} loading={mark.isPending} onClick={() => void submit()}>Marcar venda</Button>
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

function Chat({ clientId, person, canDelete, onDeleted }: { clientId: string; person: WaConversation; canDelete: boolean; onDeleted: () => void }) {
  const messages = useWaMessages(person.person_id);
  const del = useWaConversationDelete();
  const discard = useWaSuggestionDiscard();
  const [marking, setMarking] = useState(false);
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
              onClick={() => {
                if (!window.confirm("Apagar esta conversa do CRM? As mensagens e o telefone guardados somem para sempre. Isso fica no histórico, sem o texto.")) return;
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
        {messages.isPending ? <p className="p-4 text-sm text-slate-500">Carregando a conversa…</p>
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
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<number | null>(null);
  const list = useWaConversations(id, search);
  const people = (list.data?.pages ?? []).flat();
  const current = people.find((p) => p.person_id === selected) ?? null;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900"><MessageCircle className="size-5" aria-hidden /> Conversas do WhatsApp</h2>
        <p className="text-sm text-slate-600">
          Todas as conversas individuais do WhatsApp deste cliente, guardadas sem prazo. Veja de onde cada pessoa veio, confira o que a IA sugeriu e marque a venda.
          O telefone e as mensagens são dados pessoais: não compartilhe fora do CRM.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[22rem_1fr]">
        <Card className="space-y-3 p-3" data-testid="wa-conversations">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-slate-400" aria-hidden />
            <Input aria-label="Buscar por nome ou telefone" placeholder="Buscar por nome ou telefone" className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          {list.error ? <Alert tone="error">{errorMessage(list.error)}</Alert>
            : list.isPending ? <p className="p-3 text-sm text-slate-500">Carregando…</p>
            : people.length === 0 ? (
              <p className="p-3 text-sm text-slate-500" data-testid="wa-conversations-empty">
                {search ? "Nenhuma conversa encontrada." : "Ainda não há conversas guardadas. Ligue “Guardar as conversas” na aba WhatsApp deste cliente; as mensagens aparecem aqui daí para a frente."}
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
                        <Badge tone={p.from_ad ? "success" : "neutral"}>{p.from_ad ? "Anúncio" : p.origin === "site" ? "Site" : "Orgânico"}</Badge>
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

        <Card className="p-4">
          {current && id ? (
            <Chat key={current.person_id} clientId={id} person={current} canDelete={profile?.role === "admin"} onDeleted={() => setSelected(null)} />
          ) : (
            <p className="p-6 text-center text-sm text-slate-500" data-testid="wa-chat-empty">Escolha uma conversa na lista para ler.</p>
          )}
        </Card>
      </div>
    </div>
  );
}

/** Conversas de um cliente para quem não tem o Tracking (Account Manager): o banco só devolve se a pessoa for do cliente. */
export function ConversationsStandalone({ clientId }: { clientId: string }) {
  return <ConversationsPanel clientId={clientId} />;
}
