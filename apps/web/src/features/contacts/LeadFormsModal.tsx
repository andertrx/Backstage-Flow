import { LEAD_MAPPING_FIELDS, type LeadMapping, suggestLeadMapping } from "@backstage/shared";
import { Archive, KeyRound, Plus, Wand2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Alert } from "@/components/ui/alert.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Field, Input, Select } from "@/components/ui/field.tsx";
import { Modal } from "@/components/ui/modal.tsx";
import { useTrackingContainers } from "@/features/tracking/api.ts";
import { errorMessage } from "@/lib/errors.ts";
import { formatDateTime } from "@/lib/format.ts";
import {
  leadWebhookUrl,
  type SalesLogRow,
  type SalesWebhook,
  useCreateLeadWebhook,
  useNewSalesWebhookKey,
  useSalesWebhookLog,
  useSalesWebhooks,
  useUpdateSalesWebhook,
} from "./api.ts";
import { CopyLine } from "./SalesSystemsModal.tsx";

const RESULT_LABELS: Record<SalesLogRow["result"], { label: string; tone: "success" | "neutral" | "warning" | "danger" | "brand" }> = {
  aceito: { label: "Lead registrado", tone: "success" },
  repetido: { label: "Repetido", tone: "neutral" },
  ignorado: { label: "Ignorado", tone: "warning" },
  recusado: { label: "Recusado", tone: "danger" },
  teste: { label: "Teste", tone: "brand" },
};

/**
 * Formulários de outros sistemas (Tracking T5.2b): o formulário (ex.: Responde App) avisa o CRM por webhook a cada resposta.
 * O CRM lê o aviso pelo mapeamento, acha a origem da campanha nos parâmetros de URL que o formulário guardou, cifra telefone e
 * e-mail na chegada e registra o Lead (e avisa o Meta pelo servidor). Só admin e gestor.
 */
export function LeadFormsModal({ clientId, onClose }: { clientId: string; onClose: () => void }) {
  const list = useSalesWebhooks(clientId);
  const containers = useTrackingContainers();
  const create = useCreateLeadWebhook();
  const sites = (containers.data ?? []).filter((c) => c.client_id === clientId);
  const [name, setName] = useState("");
  const [siteId, setSiteId] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<{ id: string; key: string } | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const hooks = (list.data ?? []).filter((h) => h.purpose === "lead");
  const selected = hooks.find((h) => h.id === selectedId) ?? hooks[0] ?? null;
  const site = siteId || sites[0]?.id || "";

  async function onCreate() {
    setProblem(null);
    try {
      const r = await create.mutateAsync({ clientId, name: name.trim(), containerId: site });
      setRevealed(r);
      setSelectedId(r.id);
      setName("");
    } catch (err) {
      setProblem(errorMessage(err));
    }
  }

  return (
    <Modal title="Formulários de outros sistemas" open size="lg" onClose={onClose}>
      <div className="space-y-5 text-sm" data-testid="lead-forms">
        <p className="text-slate-600">
          Para formulários feitos em outro sistema (como o <strong>Responde App</strong>): quando alguém responde, o sistema avisa o CRM por <strong>webhook</strong>.
          O CRM registra o <strong>Lead</strong> com a origem da campanha (lida dos parâmetros de URL do formulário) e avisa o Meta pelo servidor.
          Telefone, e-mail e nome são cifrados na chegada: o CRM nunca guarda o texto legível.
        </p>
        {list.error && <Alert tone="error">{errorMessage(list.error)}</Alert>}
        {problem && <Alert tone="error">{problem}</Alert>}
        {containers.data && sites.length === 0 && (
          <Alert tone="warning">Este cliente ainda não tem site no Tracking. Crie um em Tracking → Novo container (o lead entra por ele).</Alert>
        )}

        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-48 flex-1">
            <Field label="Nome do formulário">
              {(id) => <Input id={id} value={name} maxLength={60} placeholder="Ex.: Formulário do Responde App" onChange={(e) => setName(e.target.value)} />}
            </Field>
          </div>
          <div className="min-w-48">
            <Field label="Site do Tracking que recebe o lead">
              {(id) => (
                <Select id={id} value={site} onChange={(e) => setSiteId(e.target.value)} disabled={sites.length === 0}>
                  {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </Select>
              )}
            </Field>
          </div>
          <Button onClick={onCreate} disabled={!name.trim() || !site} loading={create.isPending}>
            <Plus className="size-4" aria-hidden /> Criar endereço
          </Button>
        </div>

        {hooks.length > 1 && (
          <div className="flex flex-wrap gap-2" role="tablist" aria-label="Formulários">
            {hooks.map((h) => (
              <Button key={h.id} variant={h.id === selected?.id ? "primary" : "secondary"} className="px-3 py-1.5 text-xs"
                role="tab" aria-selected={h.id === selected?.id} onClick={() => setSelectedId(h.id)}>
                {h.name}
              </Button>
            ))}
          </div>
        )}
        {list.data && hooks.length === 0 && <Alert tone="info">Nenhum formulário de outro sistema ligado a este cliente ainda.</Alert>}

        {selected && (
          <LeadDetails key={selected.id} hook={selected} siteName={sites.find((s) => s.id === selected.container_id)?.name ?? "—"}
            siteConsent={sites.find((s) => s.id === selected.container_id)?.consent_mode === "aguardar_consentimento"}
            revealedKey={revealed?.id === selected.id ? revealed.key : null} onKey={(key) => setRevealed({ id: selected.id, key })} onProblem={setProblem} />
        )}
      </div>
    </Modal>
  );
}

function LeadDetails({ hook, siteName, siteConsent, revealedKey, onKey, onProblem }: {
  hook: SalesWebhook;
  siteName: string;
  siteConsent: boolean;
  revealedKey: string | null;
  onKey: (key: string) => void;
  onProblem: (msg: string | null) => void;
}) {
  const update = useUpdateSalesWebhook();
  const newKey = useNewSalesWebhookKey();
  const log = useSalesWebhookLog(hook.id);
  const [mapping, setMapping] = useState<LeadMapping>(hook.mapping ?? {});
  const [saved, setSaved] = useState(false);
  useEffect(() => setSaved(false), [mapping]);
  const url = leadWebhookUrl(hook.id);
  const keys = hook.last_keys ?? [];
  const ready = Boolean(mapping.phone || mapping.email);

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
    const clean = Object.fromEntries(Object.entries(mapping).filter(([, v]) => v !== "" && v !== undefined)) as LeadMapping;
    if (await run({ mapping: clean })) setSaved(true);
  };
  const changeKey = async () => {
    if (!window.confirm("Trocar a chave? A chave atual para de valer na hora: será preciso colar a nova no formulário.")) return;
    onProblem(null);
    try {
      onKey(await newKey.mutateAsync(hook.id));
    } catch (err) {
      onProblem(errorMessage(err));
    }
  };
  const field = (f: (typeof LEAD_MAPPING_FIELDS)[number]) => (
    <Field key={f.key} label={f.label}>
      {(id) => keys.length > 0 ? (
        <Select id={id} value={String(mapping[f.key] ?? "")} onChange={(e) => setMapping((m) => ({ ...m, [f.key]: e.target.value || undefined }))}>
          <option value="">— não usar —</option>
          {keys.map((k) => <option key={k} value={k}>{k}</option>)}
          {mapping[f.key] && !keys.includes(String(mapping[f.key])) && <option value={String(mapping[f.key])}>{String(mapping[f.key])}</option>}
        </Select>
      ) : (
        <Input id={id} value={String(mapping[f.key] ?? "")} placeholder="opcional"
          onChange={(e) => setMapping((m) => ({ ...m, [f.key]: e.target.value.trim() || undefined }))} />
      )}
    </Field>
  );

  return (
    <div className="space-y-5 rounded-xl p-4 ring-1 ring-slate-200" data-testid="lead-webhook">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-semibold text-slate-900">{hook.name}</h3>
          <p className="text-xs text-slate-500">Entra pelo site: {siteName}</p>
        </div>
        {!hook.enabled ? <Badge tone="neutral">Desligado</Badge> : hook.test_mode ? <Badge tone="brand">Modo teste</Badge> : <Badge tone="success">Registrando leads</Badge>}
      </div>
      {siteConsent && (
        <Alert tone="warning">
          Este site exige consentimento de cookies. Um formulário de outro sistema não informa isso, então os avisos serão <strong>ignorados</strong>.
          Se o consentimento é coletado no próprio formulário, troque o site para “não exigir” em Tracking → Editar.
        </Alert>
      )}

      <section className="space-y-2">
        <h4 className="font-medium text-slate-800">1. No formulário, cadastre o webhook</h4>
        <CopyLine label="Endereço (método POST)" text={url} />
        {revealedKey ? (
          <div className="space-y-2" data-testid="lead-key">
            <CopyLine label="Chave (cabeçalho x-webhook-key)" text={revealedKey} />
            <CopyLine label="Ou, se o formulário só aceita o endereço" text={`${url}&k=${revealedKey}`} />
            <Alert tone="warning">Copie agora: a chave aparece só desta vez. Se perder, gere uma nova.</Alert>
          </div>
        ) : (
          <p className="text-slate-600">Chave: ••••{hook.key_hint} (aparece só quando é criada).</p>
        )}
        <p className="text-xs text-slate-500">
          No formulário, ligue também a opção de <strong>guardar os parâmetros de URL</strong> (utm_source, utm_campaign, fbclid, bf_c…) e mande-os no webhook.
          Sem isso o lead entra, mas <strong>sem origem</strong> (nunca inventamos uma).
        </p>
        <Button variant="secondary" className="px-3 py-1.5 text-xs" onClick={changeKey} loading={newKey.isPending}>
          <KeyRound className="size-3.5" aria-hidden /> Gerar nova chave
        </Button>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="font-medium text-slate-800">2. Diga onde está cada dado no aviso</h4>
          {keys.length > 0 && (
            <Button variant="secondary" className="px-3 py-1.5 text-xs" onClick={() => setMapping(suggestLeadMapping(keys))}>
              <Wand2 className="size-3.5" aria-hidden /> Sugerir pelos campos recebidos
            </Button>
          )}
        </div>
        <p className="text-slate-600">
          {keys.length > 0
            ? `Campos do último aviso recebido (${keys.length}). Só os nomes dos campos são guardados, nunca os valores.`
            : "Nenhum aviso recebido ainda: envie uma resposta de teste pelo formulário (com o modo teste ligado) para os campos aparecerem aqui."}
        </p>
        <h5 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Contato</h5>
        <div className="grid gap-3 sm:grid-cols-3">{LEAD_MAPPING_FIELDS.filter((f) => f.group === "contato").map(field)}</div>
        <h5 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Origem da campanha</h5>
        <div className="grid gap-3 sm:grid-cols-2">{LEAD_MAPPING_FIELDS.filter((f) => f.group === "origem").map(field)}</div>
        <div className="flex items-center gap-3">
          <Button onClick={saveMapping} disabled={!ready} loading={update.isPending}>Salvar mapeamento</Button>
          {!ready && <span className="text-xs text-slate-500">Telefone ou e-mail é obrigatório.</span>}
          {saved && <span className="text-xs text-emerald-700" role="status">Mapeamento salvo.</span>}
        </div>
      </section>

      <section className="space-y-2">
        <h4 className="font-medium text-slate-800">3. Teste e ligue</h4>
        <label className="flex items-start gap-2 text-slate-700">
          <input type="checkbox" className="mt-0.5" checked={hook.test_mode} onChange={(e) => run({ test_mode: e.target.checked })} aria-label="Modo teste" />
          <span>
            <span className="font-medium">Modo teste</span>
            <span className="block text-xs text-slate-500">Confere cada aviso e mostra abaixo o que seria lido, sem registrar lead nem avisar o Meta.</span>
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
          <ul className="divide-y divide-slate-100" data-testid="lead-log">
            {log.data.map((r) => (
              <li key={r.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2" data-testid="lead-log-row">
                <Badge tone={RESULT_LABELS[r.result].tone}>{RESULT_LABELS[r.result].label}</Badge>
                <span className="text-xs text-slate-500">{formatDateTime(r.received_at)}</span>
                {r.reason && <span className="w-full text-xs text-slate-500">{r.reason}</span>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="flex justify-end">
        <Button variant="ghost" className="px-3 py-1.5 text-xs" onClick={() => {
          if (window.confirm(`Arquivar "${hook.name}"? O endereço para de receber avisos. Os leads já registrados continuam.`)) run({ archived_at: new Date().toISOString() });
        }}>
          <Archive className="size-3.5" aria-hidden /> Arquivar
        </Button>
      </div>
    </div>
  );
}
