import { Check, Copy } from "lucide-react";
import { type FormEvent, useState } from "react";
import { Alert } from "@/components/ui/alert.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Field, Input, Select, Textarea } from "@/components/ui/field.tsx";
import { Modal } from "@/components/ui/modal.tsx";
import { errorMessage } from "@/lib/errors.ts";
import { type TrackingContainer, useSaveContainer } from "./api.ts";
import {
  CONSENT_EXAMPLE,
  CONSENT_LABELS,
  type ConsentMode,
  type ContainerFormValues,
  type ContainerStatus,
  emptyContainerForm,
  EVENT_EXAMPLE,
  GOOGLE_TRACKING_TEMPLATE,
  IDENTIFY_EXAMPLE,
  installSnippetWithOptions,
  META_URL_PARAMS,
  PURCHASE_EXAMPLE,
  parseContainerForm,
  RETENTION_LABELS,
  RETENTION_OPTIONS,
} from "./logic.ts";

export function ContainerFormModal({ container, clients, onClose, onSaved }: {
  container: TrackingContainer | null;
  clients: { id: string; name: string }[];
  onClose: () => void;
  onSaved?: (id: string) => void;
}) {
  const isNew = container === null;
  const save = useSaveContainer();
  const [values, setValues] = useState<ContainerFormValues>(
    container
      ? {
        client_id: container.client_id,
        name: container.name,
        domains: container.allowed_domains.join("\n"),
        status: container.status,
        test_mode: container.test_mode,
        consent_mode: container.consent_mode,
        retention_days: container.retention_days,
      }
      : { ...emptyContainerForm, client_id: clients.length === 1 ? clients[0].id : "" },
  );
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof ContainerFormValues>(key: K, value: ContainerFormValues[K]) => setValues((v) => ({ ...v, [key]: value }));

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const parsed = parseContainerForm(values);
    if ("error" in parsed) return setError(parsed.error);
    setError(null);
    try {
      const id = await save.mutateAsync({ id: container?.id, input: parsed.data });
      onSaved?.(id);
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <Modal title={isNew ? "Novo container de tracking" : "Editar container"} open onClose={onClose} size="lg">
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {error && <Alert tone="error">{error}</Alert>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Cliente *">
            {(id) => (
              <Select id={id} value={values.client_id} onChange={(e) => set("client_id", e.target.value)} disabled={!isNew}>
                <option value="">Escolha…</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            )}
          </Field>
          <Field label="Nome do site *">
            {(id) => <Input id={id} value={values.name} onChange={(e) => set("name", e.target.value)} maxLength={80} placeholder="Ex.: Loja virtual" />}
          </Field>
        </div>
        <Field label="Domínios autorizados *" hint="Um por linha. O domínio libera também os subdomínios (loja.com.br libera www.loja.com.br). Eventos de outros sites são recusados.">
          {(id) => <Textarea id={id} value={values.domains} onChange={(e) => set("domains", e.target.value)} placeholder="loja.com.br" className="min-h-20" />}
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Situação">
            {(id) => (
              <Select id={id} value={values.status} onChange={(e) => set("status", e.target.value as ContainerStatus)}>
                <option value="ativo">Ativo (recebendo eventos)</option>
                <option value="pausado">Pausado (eventos ignorados)</option>
              </Select>
            )}
          </Field>
          <Field label="Consentimento de cookies (LGPD)">
            {(id) => (
              <Select id={id} value={values.consent_mode} onChange={(e) => set("consent_mode", e.target.value as ConsentMode)}>
                {(Object.keys(CONSENT_LABELS) as ConsentMode[]).map((m) => <option key={m} value={m}>{CONSENT_LABELS[m]}</option>)}
              </Select>
            )}
          </Field>
          <Field label="Guardar eventos detalhados por" hint="A limpeza automática só será ligada com a sua aprovação.">
            {(id) => (
              <Select id={id} value={values.retention_days} onChange={(e) => set("retention_days", Number(e.target.value))}>
                {RETENTION_OPTIONS.map((d) => <option key={d} value={d}>{RETENTION_LABELS[d]}</option>)}
              </Select>
            )}
          </Field>
          <label className="flex items-start gap-2 self-end rounded-lg bg-slate-50 p-3 text-sm">
            <input type="checkbox" className="mt-0.5" checked={values.test_mode} onChange={(e) => set("test_mode", e.target.checked)} />
            <span>
              <span className="font-medium text-slate-800">Modo teste</span>
              <span className="block text-xs text-slate-500">Eventos ficam marcados como teste e não serão enviados às plataformas como reais.</span>
            </span>
          </label>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" loading={save.isPending}>{isNew ? "Criar container" : "Salvar"}</Button>
        </div>
      </form>
    </Modal>
  );
}

function CopyBlock({ label, text }: { label: string; text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-slate-700">{label}</p>
        <Button type="button" variant="ghost" className="px-2 py-1 text-xs" onClick={copy} aria-label={`Copiar: ${label}`}>
          {copied ? <Check className="size-3.5" aria-hidden /> : <Copy className="size-3.5" aria-hidden />} {copied ? "Copiado" : "Copiar"}
        </Button>
      </div>
      <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded-lg bg-slate-900 p-3 text-xs text-slate-100" data-testid="copy-block">{text}</pre>
    </div>
  );
}

export function InstallModal({ container, onClose }: { container: TrackingContainer; onClose: () => void }) {
  const [forms, setForms] = useState(false);
  const snippet = installSnippetWithOptions(container.public_key, container.consent_mode, { forms });
  return (
    <Modal title={`Instalar no site — ${container.name}`} open onClose={onClose} size="lg">
      <div className="space-y-5 text-sm text-slate-700">
        <label className="flex items-start gap-2 rounded-lg bg-slate-50 p-3">
          <input type="checkbox" className="mt-0.5" checked={forms} onChange={(e) => setForms(e.target.checked)} />
          <span>
            <span className="font-medium text-slate-800">Capturar formulários como Lead automaticamente</span>
            <span className="block text-xs text-slate-500">
              Todo formulário enviado com e-mail ou telefone vira Lead. E-mail, telefone e nome são cifrados no navegador (só o código vai).
            </span>
          </span>
        </label>
        <CopyBlock label="1. Cole este código antes de </head> em todas as páginas" text={snippet} />
        <ul className="list-disc space-y-1 pl-5 text-slate-600">
          <li><strong>Site próprio (HTML):</strong> cole no cabeçalho do modelo usado por todas as páginas.</li>
          <li><strong>WordPress:</strong> plugin “WPCode” → Header &amp; Footer → cole em “Header”.</li>
          <li><strong>Shopify:</strong> Loja virtual → Temas → Editar código → <code>theme.liquid</code>, antes de <code>&lt;/head&gt;</code>.</li>
          <li><strong>Google Tag Manager:</strong> nova tag “HTML personalizado” com o código, disparando em “All Pages”.</li>
        </ul>
        <p className="rounded-lg bg-slate-50 p-3 text-xs text-slate-500">
          A chave <code>{container.public_key}</code> é pública (não é senha): ela só identifica o site. Eventos de domínios fora da lista
          ({container.allowed_domains.join(", ")}) são recusados.
        </p>
        <CopyBlock label="2. Parâmetros de URL dos anúncios do Meta (campo “Parâmetros de URL” do anúncio)" text={META_URL_PARAMS} />
        <CopyBlock label="3. Modelo de rastreamento do Google Ads (conta → Configurações → URL)" text={GOOGLE_TRACKING_TEMPLATE} />
        <p className="text-slate-600">Cliques em links do WhatsApp (wa.me) já são registrados sozinhos como “Contato”.</p>
        <CopyBlock label="Opcional: registrar um evento (ex.: formulário enviado)" text={EVENT_EXAMPLE} />
        <CopyBlock label="Opcional: Lead com dados de contato (cifrados no navegador)" text={IDENTIFY_EXAMPLE} />
        <CopyBlock label="Compra (na página de obrigado do pedido)" text={PURCHASE_EXAMPLE} />
        {container.consent_mode === "aguardar_consentimento" && (
          <CopyBlock label="Consentimento: chame quando a pessoa aceitar os cookies" text={CONSENT_EXAMPLE} />
        )}
        <div className="flex justify-end">
          <Button type="button" onClick={onClose}>Fechar</Button>
        </div>
      </div>
    </Modal>
  );
}
