import {
  AD_CTAS, COPY_SET_MAX_MESSAGES, type CopySet, type CopySetInput, copySetProblems, emptyCopySet, ESTEIRA_MAX_TEXTS,
} from "@backstage/shared";
import { Copy, Library, Pencil, Plus, Trash2 } from "lucide-react";
import { type FormEvent, useMemo, useState } from "react";
import { Alert } from "@/components/ui/alert.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Card } from "@/components/ui/card.tsx";
import { Field, Input, Select, Textarea } from "@/components/ui/field.tsx";
import { Modal } from "@/components/ui/modal.tsx";
import { useMetaAccounts } from "@/features/ads-builder/api.ts";
import { confirmar } from "@/lib/confirmStore.ts";
import { errorMessage } from "@/lib/errors.ts";
import { toast } from "@/lib/toastStore.ts";
import { useArchiveCopySet, useCopySets, useSaveCopySet } from "./api.ts";

/** Lista de textos (ou títulos, mensagens) com "mais uma opção" até o limite. */
export function TextList({ label, values, rows, max, limit = ESTEIRA_MAX_TEXTS, disabled, onChange, testid }: {
  label: string; values: string[]; rows?: number; max: number; limit?: number; disabled: boolean; onChange: (v: string[]) => void; testid: string;
}) {
  const list = values.length ? values : [""];
  return (
    <div className="space-y-1.5" data-testid={testid}>
      <p className="text-sm font-medium text-slate-700">{label}</p>
      {list.map((v, i) => (
        <div key={i} className="flex gap-2">
          {rows ? (
            <Textarea aria-label={`${label} ${i + 1}`} rows={rows} value={v} disabled={disabled} maxLength={max} onChange={(e) => onChange(list.map((x, k) => (k === i ? e.target.value : x)))} />
          ) : (
            <Input aria-label={`${label} ${i + 1}`} value={v} disabled={disabled} maxLength={max} onChange={(e) => onChange(list.map((x, k) => (k === i ? e.target.value : x)))} />
          )}
          {list.length > 1 && <Button variant="ghost" className="shrink-0 px-2" disabled={disabled} aria-label={`Tirar ${label} ${i + 1}`} onClick={() => onChange(list.filter((_, k) => k !== i))}><Trash2 className="size-3.5" aria-hidden /></Button>}
        </div>
      ))}
      {list.length < limit && <Button variant="ghost" className="text-xs" disabled={disabled} onClick={() => onChange([...list, ""])}><Plus className="size-3.5" aria-hidden /> Mais uma opção</Button>}
    </div>
  );
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success("Mensagem copiada.");
  } catch {
    toast.error("Não consegui copiar. Selecione o texto e copie à mão.");
  }
}

/** Mensagens de abordagem do pacote, com botão para copiar (para colar no Gerenciador do Meta). */
export function ApproachMessages({ messages }: { messages: string[] }) {
  if (!messages.length) return null;
  return (
    <div className="space-y-1.5 rounded-xl bg-slate-50 p-3" data-testid="pacote-mensagens">
      <p className="text-sm font-medium text-slate-700">Mensagens de abordagem do WhatsApp</p>
      <p className="text-xs text-slate-500">Guardadas aqui para você copiar. Elas ainda não vão sozinhas para o anúncio: o Meta guarda essas mensagens na conta do WhatsApp Business.</p>
      <ul className="space-y-1">
        {messages.map((m, i) => (
          <li key={i} className="flex items-start gap-2 rounded-lg bg-white p-2 text-sm ring-1 ring-slate-200">
            <span className="min-w-0 flex-1 whitespace-pre-wrap">{m}</span>
            <Button variant="ghost" className="shrink-0 px-2 py-1 text-xs" aria-label={`Copiar mensagem ${i + 1}`} onClick={() => void copyText(m)}><Copy className="size-3.5" aria-hidden /> Copiar</Button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Criar ou editar um pacote. */
export function CopySetModal({ open, clientId, editing, initial, onClose, onSaved }: {
  open: boolean; clientId: string; editing: CopySet | null; initial?: CopySetInput; onClose: () => void; onSaved?: (id: string) => void;
}) {
  const save = useSaveCopySet();
  const start = (): CopySetInput => editing
    ? { name: editing.name, bodies: editing.bodies.length ? editing.bodies : [""], titles: editing.titles.length ? editing.titles : [""], description: editing.description, link: editing.link, cta: editing.cta, url_tags: editing.url_tags, messages: editing.messages.length ? editing.messages : [""] }
    : (initial ?? emptyCopySet());
  const [v, setV] = useState<CopySetInput>(start);
  const [error, setError] = useState<string | null>(null);
  const [key, setKey] = useState<string | null>(null);
  const openKey = `${open}-${editing?.id ?? "novo"}-${editing?.version ?? 0}`;
  if (open && key !== openKey) { setKey(openKey); setV(start()); setError(null); }
  const problems = copySetProblems(v);
  const set = (p: Partial<CopySetInput>) => setV((x) => ({ ...x, ...p }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const r = await save.mutateAsync({ id: editing?.id ?? null, version: editing?.version ?? null, clientId, input: v });
      toast.success(editing ? "Pacote salvo." : "Pacote criado na biblioteca.");
      onSaved?.(r.id);
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <Modal title={editing ? "Editar pacote de textos" : "Novo pacote de textos"} open={open} size="lg" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4 p-5" noValidate data-testid="pacote-form">
        {error && <Alert tone="error">{error}</Alert>}
        <Field label="Nome do pacote">{(id) => <Input id={id} value={v.name} maxLength={120} placeholder="Ex.: Black Friday — WhatsApp" onChange={(e) => set({ name: e.target.value })} />}</Field>
        <TextList label="Texto principal" testid="pacote-textos" rows={3} max={2000} values={v.bodies} disabled={false} onChange={(bodies) => set({ bodies })} />
        <TextList label="Título" testid="pacote-titulos" max={255} values={v.titles} disabled={false} onChange={(titles) => set({ titles })} />
        <Field label="Descrição (opcional)">{(id) => <Input id={id} value={v.description} maxLength={400} onChange={(e) => set({ description: e.target.value })} />}</Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Link (só para conjuntos de site)" hint="Precisa começar com https://">{(id) => <Input id={id} type="url" value={v.link} maxLength={2000} placeholder="https://" onChange={(e) => set({ link: e.target.value })} />}</Field>
          <Field label="Botão (só para conjuntos de site)">
            {(id) => (
              <Select id={id} value={v.cta} onChange={(e) => set({ cta: e.target.value })}>
                <option value="">Nenhum</option>
                {AD_CTAS.filter((c) => c.id !== "NO_BUTTON").map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
              </Select>
            )}
          </Field>
        </div>
        <Field label="Parâmetros de rastreio (UTM) — opcional">{(id) => <Input id={id} value={v.url_tags} maxLength={500} placeholder="utm_source=meta&utm_campaign={{campaign.name}}" onChange={(e) => set({ url_tags: e.target.value.trim() })} />}</Field>
        <TextList label="Mensagem de abordagem" testid="pacote-mensagens-form" rows={2} max={1000} limit={COPY_SET_MAX_MESSAGES} values={v.messages} disabled={false} onChange={(messages) => set({ messages })} />
        {problems.length > 0 && <ul className="space-y-1 text-xs text-amber-800">{problems.map((p) => <li key={p}>• {p}</li>)}</ul>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" loading={save.isPending} disabled={problems.length > 0}>Salvar pacote</Button>
        </div>
      </form>
    </Modal>
  );
}

/** Cartão "Biblioteca de textos" na tela inicial do Criador. */
export function CopySetsCard({ canEdit }: { canEdit: boolean }) {
  const accounts = useMetaAccounts();
  const clients = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of accounts.data ?? []) if (a.client_id) m.set(a.client_id, a.client_name);
    return [...m.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  }, [accounts.data]);
  const [clientId, setClientId] = useState("");
  const sets = useCopySets(clientId || null);
  const archive = useArchiveCopySet();
  const [modal, setModal] = useState<{ open: boolean; editing: CopySet | null }>({ open: false, editing: null });
  const [error, setError] = useState<string | null>(null);

  async function doArchive(s: CopySet) {
    if (!(await confirmar(`Arquivar o pacote "${s.name}"? Ele sai da lista, mas continua guardado.`))) return;
    setError(null);
    try {
      await archive.mutateAsync({ id: s.id, archive: true });
      toast.success("Pacote arquivado.", { label: "Desfazer", onClick: () => archive.mutateAsync({ id: s.id, archive: false }).then(() => toast.success("Pacote de volta à biblioteca.")).catch((e) => toast.error(errorMessage(e))) });
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <Card className="space-y-3 p-5" data-testid="biblioteca">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <Library className="mt-0.5 size-5 text-brand-600" aria-hidden />
          <div>
            <h2 className="text-base font-semibold">Biblioteca de textos</h2>
            <p className="text-sm text-slate-500">Pacotes por cliente com textos, títulos e mensagens de abordagem. A esteira preenche tudo com um clique.</p>
          </div>
        </div>
        {canEdit && clientId && <Button variant="secondary" onClick={() => setModal({ open: true, editing: null })} data-testid="pacote-novo"><Plus className="size-4" aria-hidden /> Novo pacote</Button>}
      </div>
      <Field label="Cliente">
        {(id) => (
          <Select id={id} value={clientId} onChange={(e) => setClientId(e.target.value)}>
            <option value="">Escolha o cliente...</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        )}
      </Field>
      {error && <Alert tone="error">{error}</Alert>}
      {sets.error && <Alert tone="error">{errorMessage(sets.error)}</Alert>}
      {clientId && sets.data && sets.data.length === 0 && <p className="text-sm text-slate-500">Nenhum pacote para este cliente ainda.</p>}
      <ul className="divide-y divide-slate-100 rounded-lg ring-1 ring-slate-200 empty:hidden">
        {sets.data?.map((s) => (
          <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm" data-testid="pacote">
            <div className="min-w-0">
              <p className="font-medium">{s.name}</p>
              <p className="text-xs text-slate-500">{s.bodies.length} texto(s) · {s.titles.length} título(s) · {s.messages.length} mensagem(ns) de abordagem</p>
            </div>
            {canEdit && (
              <div className="flex gap-1">
                <Button variant="ghost" className="text-xs" onClick={() => setModal({ open: true, editing: s })} aria-label={`Editar ${s.name}`}><Pencil className="size-3.5" aria-hidden /> Editar</Button>
                <Button variant="ghost" className="text-xs" onClick={() => void doArchive(s)} aria-label={`Arquivar ${s.name}`}>Arquivar</Button>
              </div>
            )}
          </li>
        ))}
      </ul>
      {clientId && <CopySetModal open={modal.open} clientId={clientId} editing={modal.editing} onClose={() => setModal({ open: false, editing: null })} />}
    </Card>
  );
}
