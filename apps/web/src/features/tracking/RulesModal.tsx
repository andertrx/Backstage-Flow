import {
  CLICK_BY_LABELS,
  type ClickBy,
  describeRule,
  MATCH_OP_LABELS,
  type MatchOp,
  type MetaMode,
  pageMatches,
  RULE_EVENTS,
  RULE_KIND_LABELS,
  type RuleKind,
  type TrackingRuleInput,
  validateTrackingRule,
  type ValueMode,
} from "@backstage/shared";
import { ArrowDown, ArrowUp, Archive, Pencil, Plus, Rocket, RotateCcw } from "lucide-react";
import { type FormEvent, useMemo, useState } from "react";
import { Alert } from "@/components/ui/alert.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Field, Input, Select } from "@/components/ui/field.tsx";
import { Modal } from "@/components/ui/modal.tsx";
import { errorMessage } from "@/lib/errors.ts";
import { formatDateTime, formatRelative } from "@/lib/format.ts";
import { type TrackingContainer, type TrackingRule, useRuleAction, useRuleVersions, useTrackingRules } from "./api.ts";

const CURRENCIES = ["BRL", "USD", "EUR"];
const CUSTOM = "__personalizado__";

const emptyRule: TrackingRuleInput = {
  name: "", kind: "formulario", match_op: "contem", match_text: null, click_by: null, field_name: null, field_values: null,
  event_name: "Lead", meta_mode: "mesmo", meta_event: null, value_mode: "nenhum", value_fixed: null, value_selector: null,
  currency: null, order_param: null,
};

const inputOf = (r: TrackingRule): TrackingRuleInput => ({
  name: r.name, kind: r.kind, match_op: r.match_op, match_text: r.match_text, click_by: r.click_by, field_name: r.field_name,
  field_values: r.field_values, event_name: r.event_name, meta_mode: r.meta_mode, meta_event: r.meta_event, value_mode: r.value_mode,
  value_fixed: r.value_fixed == null ? null : Number(r.value_fixed), value_selector: r.value_selector, currency: r.currency, order_param: r.order_param,
});

/** Regras de eventos do site, sem Tag Manager (Tracking T2). Rascunho → Publicar → o site passa a usar. */
export function RulesModal({ container, canManage, onClose }: { container: TrackingContainer; canManage: boolean; onClose: () => void }) {
  const rules = useTrackingRules(container.id);
  const versions = useRuleVersions(container.id);
  const act = useRuleAction(container.id);
  const [editing, setEditing] = useState<TrackingRule | "new" | null>(null);
  const [testUrl, setTestUrl] = useState("");

  const all = useMemo(() => rules.data ?? [], [rules.data]);
  const draft = useMemo(() => all.filter((r) => !r.archived_at), [all]);
  const current = versions.data?.[0] ?? null;
  // Mudou algo (inclusive arquivar) depois da última publicação?
  const unpublished = all.some((r) => !current || r.updated_at > current.published_at) && (current != null || draft.length > 0);

  const move = (i: number, dir: -1 | 1) => {
    const a = draft[i], b = draft[i + dir];
    if (!a || !b) return;
    act.mutate({ action: "swap", first: { id: a.id, position: i + dir }, second: { id: b.id, position: i } });
  };

  let tested: TrackingRule[] | null = null;
  if (testUrl.trim()) {
    try {
      new URL(testUrl.trim());
      tested = draft.filter((r) => r.enabled && r.kind === "pagina" && pageMatches(r.match_op, r.match_text ?? "", testUrl.trim()));
    } catch {
      tested = null;
    }
  }

  if (editing) {
    return (
      <Modal title={editing === "new" ? "Nova regra" : "Editar regra"} open size="lg" onClose={() => setEditing(null)}>
        <RuleForm
          initial={editing === "new" ? emptyRule : inputOf(editing)}
          saving={act.isPending}
          error={act.error}
          onCancel={() => setEditing(null)}
          onSave={(input) => act.mutate(
            editing === "new" ? { action: "save", input, position: draft.length } : { action: "save", id: editing.id, input },
            { onSuccess: () => setEditing(null) },
          )}
        />
      </Modal>
    );
  }

  return (
    <Modal title={`Regras do site: ${container.name}`} open size="lg" onClose={onClose}>
      <div className="space-y-4 text-sm" data-testid="rules-modal">
        <p className="text-slate-600">
          Sem Tag Manager: diga aqui o que vira evento (página de obrigado, clique num botão, resposta do formulário) e como vai ao Meta.
          A primeira regra que bater, na ordem da lista, vale. O site só usa as regras depois de <strong>Publicar</strong>.
        </p>

        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 p-3" data-testid="rules-status">
          <div>
            {current
              ? <>Versão publicada: <strong>{current.version}</strong> ({current.rules_count} regra{current.rules_count === 1 ? "" : "s"}) · {formatRelative(current.published_at)}</>
              : "Nenhuma versão publicada: o site ainda usa só o automático (visitas, formulários e WhatsApp)."}
            {unpublished && <span className="ml-2"><Badge tone="warning">Mudanças não publicadas</Badge></span>}
          </div>
          {canManage && (
            <Button loading={act.isPending} disabled={!unpublished} data-testid="rules-publish" onClick={() => {
              if (window.confirm("Publicar as regras? O site passa a usar esta versão em até 5 minutos.")) act.mutate({ action: "publish" });
            }}>
              <Rocket className="size-4" aria-hidden /> Publicar
            </Button>
          )}
        </div>

        {act.error && <Alert tone="error">{errorMessage(act.error)}</Alert>}
        {rules.error && <Alert tone="error">{errorMessage(rules.error)}</Alert>}

        {draft.length === 0 ? (
          <Alert tone="info">Nenhuma regra ainda.{canManage ? " Comece por \"Nova regra\"." : ""}</Alert>
        ) : (
          <ol className="divide-y divide-slate-100 rounded-lg ring-1 ring-slate-200">
            {draft.map((r, i) => (
              <li key={r.id} className="flex flex-wrap items-start justify-between gap-2 p-3" data-testid="rule-row">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-slate-900">
                    {i + 1}. {r.name} {!r.enabled && <Badge>Desligada</Badge>}
                  </p>
                  <p className="text-xs text-slate-500" data-testid="rule-summary">{describeRule(inputOf(r))}</p>
                </div>
                {canManage && (
                  <div className="flex flex-wrap gap-1">
                    <Button variant="ghost" className="px-2 py-1 text-xs" aria-label={`Subir ${r.name}`} disabled={i === 0} onClick={() => move(i, -1)}>
                      <ArrowUp className="size-3.5" aria-hidden />
                    </Button>
                    <Button variant="ghost" className="px-2 py-1 text-xs" aria-label={`Descer ${r.name}`} disabled={i === draft.length - 1} onClick={() => move(i, 1)}>
                      <ArrowDown className="size-3.5" aria-hidden />
                    </Button>
                    <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => act.mutate({ action: "update", id: r.id, changes: { enabled: !r.enabled } })}>
                      {r.enabled ? "Desligar" : "Ligar"}
                    </Button>
                    <Button variant="ghost" className="px-2 py-1 text-xs" aria-label={`Editar ${r.name}`} onClick={() => setEditing(r)}>
                      <Pencil className="size-3.5" aria-hidden />
                    </Button>
                    <Button variant="ghost" className="px-2 py-1 text-xs" aria-label={`Arquivar ${r.name}`} onClick={() => {
                      if (window.confirm(`Arquivar a regra "${r.name}"? Ela sai da lista (as versões já publicadas continuam guardadas).`)) act.mutate({ action: "archive", id: r.id });
                    }}>
                      <Archive className="size-3.5" aria-hidden />
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ol>
        )}
        {canManage && (
          <Button variant="secondary" onClick={() => setEditing("new")} data-testid="rule-new">
            <Plus className="size-4" aria-hidden /> Nova regra
          </Button>
        )}

        <Field label="Testar endereço (regras de página do rascunho)">
          {(id) => <Input id={id} placeholder="https://loja.com.br/obrigado?pedido=123" value={testUrl} onChange={(e) => setTestUrl(e.target.value)} />}
        </Field>
        {tested && (
          <p className="text-slate-700" data-testid="rules-test-result">
            {tested.length ? <>Neste endereço dispara: <strong>{tested.map((r) => r.name).join(", ")}</strong>.</> : "Nenhuma regra de página dispara neste endereço."}
          </p>
        )}

        {(versions.data?.length ?? 0) > 0 && (
          <details className="rounded-lg ring-1 ring-slate-200">
            <summary className="cursor-pointer p-3 font-medium text-slate-700">Versões publicadas</summary>
            <ul className="divide-y divide-slate-100" data-testid="rule-versions">
              {versions.data!.map((v) => (
                <li key={v.version} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                  <span>
                    Versão {v.version} · {v.rules_count} regra{v.rules_count === 1 ? "" : "s"} · {formatDateTime(v.published_at)}
                    {v.restored_from != null && <span className="text-slate-500"> (volta da versão {v.restored_from})</span>}
                    {v.version === current?.version && <span className="ml-2"><Badge tone="success">No ar</Badge></span>}
                  </span>
                  {canManage && v.version !== current?.version && (
                    <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => {
                      if (window.confirm(`Voltar para a versão ${v.version}? As regras atuais vão para o arquivo e a versão ${v.version} é publicada de novo.`)) {
                        act.mutate({ action: "restore", version: v.version });
                      }
                    }}>
                      <RotateCcw className="size-3.5" aria-hidden /> Voltar para esta
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </Modal>
  );
}

function RuleForm({ initial, saving, error, onSave, onCancel }: {
  initial: TrackingRuleInput;
  saving: boolean;
  error: unknown;
  onSave: (input: TrackingRuleInput) => void;
  onCancel: () => void;
}) {
  const [r, setR] = useState<TrackingRuleInput>(initial);
  const [valuesText, setValuesText] = useState((initial.field_values ?? []).join(", "));
  const [withField, setWithField] = useState(initial.field_name != null);
  const [customEvent, setCustomEvent] = useState(!RULE_EVENTS.some((e) => e.name === initial.event_name));
  const [problems, setProblems] = useState<string[]>([]);
  const set = <K extends keyof TrackingRuleInput>(k: K, v: TrackingRuleInput[K]) => { setProblems([]); setR((old) => ({ ...old, [k]: v })); };
  const text = (v: string) => (v.trim() === "" ? null : v.trim());

  function submit(e: FormEvent) {
    e.preventDefault();
    const values = valuesText.split(",").map((v) => v.trim()).filter(Boolean);
    const input: TrackingRuleInput = {
      ...r,
      name: r.name.trim(),
      match_text: r.match_text?.trim() || null,
      click_by: r.kind === "clique" ? r.click_by ?? "texto" : null,
      field_name: r.kind === "formulario" && withField ? text(r.field_name ?? "") ?? "" : null,
      field_values: r.kind === "formulario" && withField ? values : null,
      meta_event: r.meta_mode === "personalizado" ? text(r.meta_event ?? "") : null,
      value_fixed: r.value_mode === "fixo" ? r.value_fixed : null,
      value_selector: r.value_mode === "pagina" ? text(r.value_selector ?? "") : null,
      currency: r.value_mode === "nenhum" ? null : r.currency ?? "BRL",
      order_param: text(r.order_param ?? ""),
    };
    const errs = validateTrackingRule(input);
    if (input.kind === "formulario" && withField && !input.field_name) errs.unshift("Informe o nome do campo (como aparece no formulário).");
    setProblems(errs);
    if (!errs.length) onSave(input);
  }

  return (
    <form className="space-y-4 text-sm" onSubmit={submit} data-testid="rule-form">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Nome da regra">{(id) => <Input id={id} value={r.name} maxLength={80} placeholder="Ex.: Lead lojista" onChange={(e) => set("name", e.target.value)} />}</Field>
        <Field label="Quando">
          {(id) => (
            <Select id={id} value={r.kind} onChange={(e) => set("kind", e.target.value as RuleKind)}>
              {Object.entries(RULE_KIND_LABELS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
            </Select>
          )}
        </Field>
      </div>

      {r.kind === "pagina" && (
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="O endereço">
            {(id) => (
              <Select id={id} value={r.match_op} onChange={(e) => set("match_op", e.target.value as MatchOp)}>
                {Object.entries(MATCH_OP_LABELS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
              </Select>
            )}
          </Field>
          <div className="sm:col-span-2">
            <Field label="Endereço (ou parte dele)" hint='Ex.: /obrigado, /checkout/sucesso, /produto/'>
              {(id) => <Input id={id} value={r.match_text ?? ""} onChange={(e) => set("match_text", e.target.value)} />}
            </Field>
          </div>
        </div>
      )}

      {r.kind === "clique" && (
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Como achar o botão">
            {(id) => (
              <Select id={id} value={r.click_by ?? "texto"} onChange={(e) => set("click_by", e.target.value as ClickBy)}>
                {Object.entries(CLICK_BY_LABELS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
              </Select>
            )}
          </Field>
          <div className="sm:col-span-2">
            <Field label="Texto, link ou seletor" hint='Ex.: "Agendar", "calendly.com", "#botao-orcamento"'>
              {(id) => <Input id={id} value={r.match_text ?? ""} onChange={(e) => set("match_text", e.target.value)} />}
            </Field>
          </div>
        </div>
      )}

      {r.kind === "formulario" && (
        <div className="space-y-3 rounded-lg bg-slate-50 p-3">
          <Field label="Qual formulário (opcional)" hint="Deixe vazio para qualquer formulário do site. Ou parte do id/nome do formulário.">
            {(id) => <Input id={id} value={r.match_text ?? ""} onChange={(e) => set("match_text", e.target.value)} />}
          </Field>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={withField} onChange={(e) => setWithField(e.target.checked)} />
            Só quando um campo tiver certa resposta (ex.: Tipo de cliente = Lojista)
          </label>
          {withField && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Nome do campo" hint="Como aparece no formulário (rótulo) ou o nome técnico.">
                {(id) => <Input id={id} value={r.field_name ?? ""} placeholder="Tipo de cliente" onChange={(e) => set("field_name", e.target.value)} />}
              </Field>
              <Field label="Respostas que contam" hint="Separe por vírgula. Maiúscula e acento não importam.">
                {(id) => <Input id={id} value={valuesText} placeholder="Lojista" onChange={(e) => setValuesText(e.target.value)} />}
              </Field>
            </div>
          )}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Evento">
          {(id) => (
            <Select id={id} value={customEvent ? CUSTOM : r.event_name} onChange={(e) => {
              if (e.target.value === CUSTOM) { setCustomEvent(true); set("event_name", ""); } else { setCustomEvent(false); set("event_name", e.target.value); }
            }}>
              {RULE_EVENTS.map((ev) => <option key={ev.name} value={ev.name}>{ev.label}</option>)}
              <option value={CUSTOM}>Outro (evento personalizado)</option>
            </Select>
          )}
        </Field>
        {customEvent && (
          <Field label="Nome do evento personalizado" hint="Letras, números e _ (ex.: LeadLojista).">
            {(id) => <Input id={id} value={r.event_name} onChange={(e) => set("event_name", e.target.value.trim())} />}
          </Field>
        )}
      </div>

      <fieldset className="space-y-2">
        <legend className="font-medium text-slate-700">No Meta</legend>
        {([["mesmo", "Enviar com o mesmo nome"], ["personalizado", "Enviar com outro nome (evento personalizado)"], ["nao_enviar", "Não enviar ao Meta (só registrar no CRM)"]] as const).map(([k, label]) => (
          <label key={k} className="flex items-center gap-2">
            <input type="radio" name="meta_mode" checked={r.meta_mode === k} onChange={() => set("meta_mode", k as MetaMode)} /> {label}
          </label>
        ))}
        {r.meta_mode === "personalizado" && (
          <Field label="Nome no Meta" hint='Ex.: "LeadOutros" para sacoleiro / cliente final: fica registrado, mas não treina a campanha de Lead.'>
            {(id) => <Input id={id} value={r.meta_event ?? ""} onChange={(e) => set("meta_event", e.target.value.trim())} />}
          </Field>
        )}
        {r.event_name === "Purchase" && r.meta_mode !== "nao_enviar" && (
          <p className="text-xs text-amber-700">Se a loja (Nuvemshop, Shopify…) já envia a compra ao Meta, escolha "Não enviar" para não contar duas vezes.</p>
        )}
      </fieldset>

      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Valor">
          {(id) => (
            <Select id={id} value={r.value_mode} onChange={(e) => set("value_mode", e.target.value as ValueMode)}>
              <option value="nenhum">Sem valor</option>
              <option value="fixo">Valor fixo</option>
              <option value="pagina">Ler da página</option>
            </Select>
          )}
        </Field>
        {r.value_mode !== "nenhum" && (
          <Field label="Moeda">
            {(id) => (
              <Select id={id} value={r.currency ?? "BRL"} onChange={(e) => set("currency", e.target.value)}>
                {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </Select>
            )}
          </Field>
        )}
        {r.value_mode === "fixo" && (
          <Field label="Valor fixo">
            {(id) => <Input id={id} type="number" min={0} step="0.01" value={r.value_fixed ?? ""} onChange={(e) => set("value_fixed", e.target.value === "" ? null : Number(e.target.value))} />}
          </Field>
        )}
        {r.value_mode === "pagina" && (
          <Field label="Onde está o valor" hint='Seletor CSS. Ex.: ".order-total"'>
            {(id) => <Input id={id} value={r.value_selector ?? ""} onChange={(e) => set("value_selector", e.target.value)} />}
          </Field>
        )}
      </div>
      {(r.event_name === "Purchase" || r.order_param) && (
        <Field label="Nº do pedido vem do parâmetro do endereço (opcional)" hint='Ex.: "pedido" em /obrigado?pedido=123. Evita contar a mesma compra duas vezes.'>
          {(id) => <Input id={id} value={r.order_param ?? ""} onChange={(e) => set("order_param", e.target.value)} />}
        </Field>
      )}

      {problems.length > 0 && <Alert tone="error"><ul className="space-y-0.5">{problems.map((p) => <li key={p}>{p}</li>)}</ul></Alert>}
      {error != null && <Alert tone="error">{errorMessage(error)}</Alert>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onCancel}>Cancelar</Button>
        <Button type="submit" loading={saving} data-testid="rule-save">Salvar regra</Button>
      </div>
    </form>
  );
}
