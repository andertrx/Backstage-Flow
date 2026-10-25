import { MAPPING_FIELDS, type SalesMapping, suggestSalesMapping } from "@backstage/shared";
import { Archive, Copy, KeyRound, Plus, Wand2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Alert } from "@/components/ui/alert.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Field, Input, Select } from "@/components/ui/field.tsx";
import { Modal } from "@/components/ui/modal.tsx";
import { errorMessage } from "@/lib/errors.ts";
import { formatDateTime, formatMoney } from "@/lib/format.ts";
import {
  type SalesLogRow,
  type SalesWebhook,
  salesWebhookUrl,
  useCreateSalesWebhook,
  useNewSalesWebhookKey,
  useSalesWebhookLog,
  useSalesWebhooks,
  useUpdateSalesWebhook,
} from "./api.ts";

const RESULT_LABELS: Record<SalesLogRow["result"], { label: string; tone: "success" | "neutral" | "warning" | "danger" | "brand" }> = {
  aceito: { label: "Venda registrada", tone: "success" },
  repetido: { label: "Repetido", tone: "neutral" },
  ignorado: { label: "Ignorado", tone: "warning" },
  recusado: { label: "Recusado", tone: "danger" },
  teste: { label: "Teste", tone: "brand" },
};

/**
 * Sistemas de venda do cliente (Tracking T3.2): cada sistema (loja virtual, plataforma de pagamento, ERP...)
 * ganha um endereço de webhook. A cada venda, ele avisa o CRM; o CRM lê o aviso pelo mapeamento abaixo,
 * liga ao contato (pelo telefone/e-mail cifrados) e manda a Compra ao Meta. Só admin e gestor.
 */
export function SalesSystemsModal({ clientId, onClose }: { clientId: string; onClose: () => void }) {
  const list = useSalesWebhooks(clientId);
  const create = useCreateSalesWebhook();
  const [name, setName] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<{ id: string; key: string } | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const hooks = list.data ?? [];
  const selected = hooks.find((h) => h.id === selectedId) ?? hooks[0] ?? null;

  async function onCreate() {
    setProblem(null);
    try {
      const r = await create.mutateAsync({ clientId, name: name.trim() });
      setRevealed(r);
      setSelectedId(r.id);
      setName("");
    } catch (err) {
      setProblem(errorMessage(err));
    }
  }

  return (
    <Modal title="Sistemas de venda" open size="lg" onClose={onClose}>
      <div className="space-y-5 text-sm" data-testid="sales-systems">
        <p className="text-slate-600">
          Quando o sistema de vendas do cliente (loja virtual, plataforma de pagamento, ERP…) avisa uma venda por <strong>webhook</strong>, o CRM
          registra a venda no contato e manda a <strong>Compra</strong> ao Meta, com o valor. Telefone e e-mail do comprador são cifrados na chegada:
          o CRM nunca guarda o número legível.
        </p>
        {list.error && <Alert tone="error">{errorMessage(list.error)}</Alert>}
        {problem && <Alert tone="error">{problem}</Alert>}

        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-48 flex-1">
            <Field label="Nome do sistema">
              {(id) => <Input id={id} value={name} maxLength={60} placeholder="Ex.: Loja virtual" onChange={(e) => setName(e.target.value)} />}
            </Field>
          </div>
          <Button onClick={onCreate} disabled={!name.trim()} loading={create.isPending}>
            <Plus className="size-4" aria-hidden /> Criar endereço
          </Button>
        </div>

        {hooks.length > 1 && (
          <div className="flex flex-wrap gap-2" role="tablist" aria-label="Sistemas">
            {hooks.map((h) => (
              <Button key={h.id} variant={h.id === selected?.id ? "primary" : "secondary"} className="px-3 py-1.5 text-xs"
                role="tab" aria-selected={h.id === selected?.id} onClick={() => setSelectedId(h.id)}>
                {h.name}
              </Button>
            ))}
          </div>
        )}
        {list.data && hooks.length === 0 && <Alert tone="info">Nenhum sistema de venda ligado a este cliente ainda.</Alert>}

        {selected && (
          <WebhookDetails key={selected.id} hook={selected} revealedKey={revealed?.id === selected.id ? revealed.key : null}
            onKey={(key) => setRevealed({ id: selected.id, key })} onProblem={setProblem} />
        )}
      </div>
    </Modal>
  );
}

function WebhookDetails({ hook, revealedKey, onKey, onProblem }: {
  hook: SalesWebhook;
  revealedKey: string | null;
  onKey: (key: string) => void;
  onProblem: (msg: string | null) => void;
}) {
  const update = useUpdateSalesWebhook();
  const newKey = useNewSalesWebhookKey();
  const log = useSalesWebhookLog(hook.id);
  const [mapping, setMapping] = useState<SalesMapping>(hook.mapping ?? {});
  const [statusText, setStatusText] = useState((hook.mapping?.status_values ?? []).join(", "));
  const [saved, setSaved] = useState(false);
  useEffect(() => setSaved(false), [mapping, statusText]);
  const url = salesWebhookUrl(hook.id);
  const keys = hook.last_keys ?? [];

  const run = async (values: Parameters<typeof update.mutateAsync>[0]["values"]) => {
    onProblem(null);
    try {
      await update.mutateAsync({ id: hook.id, values });
      return true;
    } catch (err) {
      onProblem(errorMessage(err));
      return false;
    }
  };
  const saveMapping = async () => {
    const status_values = statusText.split(",").map((s) => s.trim()).filter(Boolean);
    const clean = Object.fromEntries(Object.entries({ ...mapping, status_values }).filter(([, v]) => v !== "" && v !== undefined)) as SalesMapping;
    if (await run({ mapping: clean })) setSaved(true);
  };
  const changeKey = async () => {
    if (!window.confirm("Trocar a chave? A chave atual para de valer na hora: será preciso colar a nova no sistema de vendas.")) return;
    onProblem(null);
    try {
      onKey(await newKey.mutateAsync(hook.id));
    } catch (err) {
      onProblem(errorMessage(err));
    }
  };
  const ready = Boolean(mapping.order && mapping.value);

  return (
    <div className="space-y-5 rounded-xl ring-1 ring-slate-200 p-4" data-testid="sales-webhook">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold text-slate-900">{hook.name}</h3>
        <div className="flex flex-wrap gap-1.5">
          {!hook.enabled ? <Badge tone="neutral">Desligado</Badge> : hook.test_mode ? <Badge tone="brand">Modo teste</Badge> : <Badge tone="success">Registrando vendas</Badge>}
        </div>
      </div>

      <section className="space-y-2">
        <h4 className="font-medium text-slate-800">1. No sistema de vendas, cadastre o webhook</h4>
        <CopyLine label="Endereço (método POST)" text={url} />
        {revealedKey ? (
          <div className="space-y-2" data-testid="sales-key">
            <CopyLine label="Chave (cabeçalho x-webhook-key)" text={revealedKey} />
            <CopyLine label="Ou, se o sistema só aceita o endereço" text={`${url}&k=${revealedKey}`} />
            <Alert tone="warning">Copie agora: a chave aparece só desta vez. Se perder, gere uma nova.</Alert>
          </div>
        ) : (
          <p className="text-slate-600">Chave: ••••{hook.key_hint} (aparece só quando é criada).</p>
        )}
        <Button variant="secondary" className="px-3 py-1.5 text-xs" onClick={changeKey} loading={newKey.isPending}>
          <KeyRound className="size-3.5" aria-hidden /> Gerar nova chave
        </Button>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="font-medium text-slate-800">2. Diga onde está cada dado no aviso</h4>
          {keys.length > 0 && (
            <Button variant="secondary" className="px-3 py-1.5 text-xs" onClick={() => {
              const s = suggestSalesMapping(keys);
              setMapping((m) => ({ ...s, default_currency: m.default_currency ?? s.default_currency }));
            }}>
              <Wand2 className="size-3.5" aria-hidden /> Sugerir pelos campos recebidos
            </Button>
          )}
        </div>
        <p className="text-slate-600">
          {keys.length > 0
            ? `Campos do último aviso recebido (${keys.length}). Só os nomes dos campos são guardados, nunca os valores.`
            : "Nenhum aviso recebido ainda: faça uma venda de teste no sistema (com o modo teste ligado) para os campos aparecerem aqui. Ou digite o caminho (ex.: order.total)."}
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {MAPPING_FIELDS.map((f) => (
            <Field key={f.key} label={f.label}>
              {(id) => keys.length > 0 ? (
                <Select id={id} value={String(mapping[f.key] ?? "")} onChange={(e) => setMapping((m) => ({ ...m, [f.key]: e.target.value || undefined }))}>
                  <option value="">{f.required ? "— escolha —" : "— não usar —"}</option>
                  {keys.map((k) => <option key={k} value={k}>{k}</option>)}
                  {mapping[f.key] && !keys.includes(String(mapping[f.key])) && <option value={String(mapping[f.key])}>{String(mapping[f.key])}</option>}
                </Select>
              ) : (
                <Input id={id} value={String(mapping[f.key] ?? "")} placeholder={f.required ? "obrigatório" : "opcional"}
                  onChange={(e) => setMapping((m) => ({ ...m, [f.key]: e.target.value.trim() || undefined }))} />
              )}
            </Field>
          ))}
          <Field label="Moeda quando o aviso não diz">
            {(id) => (
              <Select id={id} value={mapping.default_currency ?? "BRL"} onChange={(e) => setMapping((m) => ({ ...m, default_currency: e.target.value }))}>
                <option value="BRL">Real (BRL)</option>
                <option value="USD">Dólar (USD)</option>
                <option value="EUR">Euro (EUR)</option>
              </Select>
            )}
          </Field>
          <Field label="Status que contam como venda" hint="Separe por vírgula (ex.: paid, aprovado). Vazio = todo aviso conta.">
            {(id) => <Input id={id} value={statusText} disabled={!mapping.status} onChange={(e) => setStatusText(e.target.value)} />}
          </Field>
        </div>
        <label className="flex items-center gap-2 text-slate-700">
          <input type="checkbox" checked={Boolean(mapping.value_in_cents)} onChange={(e) => setMapping((m) => ({ ...m, value_in_cents: e.target.checked }))} />
          O valor vem em centavos (ex.: 29750 = R$ 297,50)
        </label>
        <div className="flex items-center gap-3">
          <Button onClick={saveMapping} disabled={!ready} loading={update.isPending}>Salvar mapeamento</Button>
          {!ready && <span className="text-xs text-slate-500">Nº do pedido e valor são obrigatórios.</span>}
          {saved && <span className="text-xs text-emerald-700" role="status">Mapeamento salvo.</span>}
        </div>
      </section>

      <section className="space-y-2">
        <h4 className="font-medium text-slate-800">3. Teste e ligue</h4>
        <label className="flex items-start gap-2 text-slate-700">
          <input type="checkbox" className="mt-0.5" checked={hook.test_mode} onChange={(e) => run({ test_mode: e.target.checked })} aria-label="Modo teste" />
          <span>
            <span className="font-medium">Modo teste</span>
            <span className="block text-xs text-slate-500">Confere cada aviso e mostra abaixo o que aconteceria, sem registrar venda nem avisar o Meta.</span>
          </span>
        </label>
        <label className="flex items-center gap-2 text-slate-700">
          <input type="checkbox" checked={hook.enabled} onChange={(e) => run({ enabled: e.target.checked })} aria-label="Ligado" />
          <span className="font-medium">Ligado</span>
          <span className="text-xs text-slate-500">(desligado: os avisos são ignorados)</span>
        </label>
      </section>

      <section className="space-y-2">
        <h4 className="font-medium text-slate-800">Avisos recebidos</h4>
        {log.error && <Alert tone="error">{errorMessage(log.error)}</Alert>}
        {log.data && log.data.length === 0 && <p className="text-slate-500">Nenhum aviso recebido ainda.</p>}
        {log.data && log.data.length > 0 && (
          <ul className="divide-y divide-slate-100" data-testid="sales-log">
            {log.data.map((r) => (
              <li key={r.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2" data-testid="sales-log-row">
                <Badge tone={RESULT_LABELS[r.result].tone}>{RESULT_LABELS[r.result].label}</Badge>
                <span className="text-xs text-slate-500">{formatDateTime(r.received_at)}</span>
                {r.order_id && <span className="text-slate-700">pedido {r.order_id}</span>}
                {r.value_micros != null && r.currency && <span className="text-slate-700">{formatMoney(r.value_micros / 1e6, r.currency)}</span>}
                {r.reason && <span className="w-full text-xs text-slate-500">{r.reason}</span>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="flex justify-end">
        <Button variant="ghost" className="px-3 py-1.5 text-xs" onClick={() => {
          if (window.confirm(`Arquivar "${hook.name}"? O endereço para de receber avisos. O histórico das vendas continua.`)) run({ archived_at: new Date().toISOString() });
        }}>
          <Archive className="size-3.5" aria-hidden /> Arquivar
        </Button>
      </div>
    </div>
  );
}

function CopyLine({ label, text }: { label: string; text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-slate-600">{label}</p>
        <Button type="button" variant="ghost" className="px-2 py-1 text-xs" aria-label={`Copiar: ${label}`} onClick={async () => {
          try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { setCopied(false); }
        }}>
          <Copy className="size-3.5" aria-hidden /> {copied ? "Copiado" : "Copiar"}
        </Button>
      </div>
      <code className="block break-all rounded-lg bg-slate-50 px-3 py-2 font-mono text-xs text-slate-900">{text}</code>
    </div>
  );
}
