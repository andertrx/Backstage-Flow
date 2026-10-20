import {
  actionResultOptions, addDays, type ClientReportSettings, type MainResultSource, PERIOD_LABELS, REPORT_KPI_KEYS, REPORT_PERIODS,
  mainResultFor, REPORT_SECTION_LABELS, REPORT_SECTIONS, type ReportKpiKey, type ReportPeriod, reportKpiLabel, SUMMARY_MARKERS, summaryParts,
  summarySentence, todayIn,
} from "@backstage/shared";
import { ImagePlus, Trash2 } from "lucide-react";
import { type ChangeEvent, type FormEvent, useMemo, useRef, useState } from "react";
import { Alert } from "@/components/ui/alert.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Field, Input, Select, Textarea } from "@/components/ui/field.tsx";
import { Modal } from "@/components/ui/modal.tsx";
import { SortableList } from "@/components/ui/sortable-list.tsx";
import { errorMessage } from "@/lib/errors.ts";
import { logoFileProblem, logoPublicUrl, useReportAccounts, useSaveLogo, useSaveReportSettings } from "./api.ts";

const BASIC: Record<Exclude<MainResultSource, "action">, string> = {
  leads: "Leads",
  messages: "Conversas iniciadas",
  conversions: "Conversões",
};

/**
 * Logo do cliente (Etapa 19.4): vale na hora (não depende de "Salvar modelo").
 * Aparece no dashboard, no PDF, no link secreto e no e-mail semanal.
 */
function LogoField({ clientId, clientName, logoPath, hasRow }: { clientId: string; clientName: string; logoPath: string | null; hasRow: boolean }) {
  const save = useSaveLogo(clientId, clientName);
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const url = logoPublicUrl(logoPath);

  async function run(file: File | null) {
    setError(null);
    try { await save.mutateAsync({ file, current: logoPath, hasRow }); } catch (err) { setError(errorMessage(err)); }
  }
  function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const problem = logoFileProblem(file);
    if (problem) return setError(problem);
    void run(file);
  }

  return (
    <fieldset className="space-y-2" data-testid="logo-field">
      <legend className="text-sm font-medium text-slate-700">Logo do cliente</legend>
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex h-14 w-40 items-center justify-center rounded-lg bg-slate-50 ring-1 ring-slate-200">
          {url
            ? <img src={url} alt={`Logo ${clientName}`} className="max-h-12 max-w-36 object-contain" data-testid="logo-preview" />
            : <span className="text-xs text-slate-400">Sem logo</span>}
        </div>
        <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={onFile} aria-label="Arquivo da logo" />
        <Button type="button" variant="secondary" onClick={() => input.current?.click()} loading={save.isPending}>
          <ImagePlus className="size-4" aria-hidden /> {url ? "Trocar logo" : "Enviar logo"}
        </Button>
        {url && (
          <Button type="button" variant="secondary" onClick={() => run(null)} disabled={save.isPending}>
            <Trash2 className="size-4" aria-hidden /> Tirar logo
          </Button>
        )}
      </div>
      <p className="text-xs text-slate-500">PNG, JPG ou WebP, até 1 MB (de preferência com fundo transparente). Aparece no dashboard, no PDF, no link e no e-mail.</p>
      {error && <Alert tone="error">{error}</Alert>}
    </fieldset>
  );
}

/**
 * Frase do resumo editável (pedido de 13/10/2026). Os marcadores viram os números reais do período;
 * vazio = frase automática. Para tirar a frase, desmarque "Resumo em uma frase" em Partes do dashboard.
 */
function SummaryTemplateField({ value, onChange, preview }: {
  value: string;
  onChange: (v: string) => void;
  preview: { account: string; text: string } | null;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const insert = (marker: string) => {
    const el = ref.current;
    const at = el?.selectionStart ?? value.length;
    const next = `${value.slice(0, at)}${marker}${value.slice(el?.selectionEnd ?? at)}`.slice(0, 500);
    onChange(next);
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(at + marker.length, at + marker.length); });
  };
  return (
    <fieldset className="space-y-2" data-testid="summary-template">
      <legend className="text-sm font-medium text-slate-700">Frase do resumo</legend>
      <p className="text-xs text-slate-500">
        Deixe vazio para usar a frase automática. Para escrever a sua, use os marcadores: o sistema troca cada um pelo número real do período
        (nada é digitado à mão).
      </p>
      <Textarea ref={ref} value={value} maxLength={500} rows={2} aria-label="Frase do resumo"
        placeholder="Ex.: Investimos {investimento} e recebemos {resultados} contatos pelo formulário, a {custo_por_resultado} cada. {comparacao}"
        onChange={(e) => onChange(e.target.value)} />
      <div className="flex flex-wrap gap-1.5">
        {SUMMARY_MARKERS.map((m) => (
          <button key={m.key} type="button" title={m.hint} onClick={() => insert(m.key)}
            className="rounded-md bg-slate-100 px-2 py-0.5 font-mono text-xs text-slate-700 hover:bg-slate-200">{m.key}</button>
        ))}
        {value && (
          <button type="button" className="text-xs text-slate-500 hover:underline" onClick={() => onChange("")}>Voltar para a frase automática</button>
        )}
      </div>
      {preview && (
        <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700" data-testid="summary-preview">
          <span className="block text-xs text-slate-500">Prévia com os números reais dos últimos 90 dias ({preview.account}):</span>
          {preview.text}
        </p>
      )}
    </fieldset>
  );
}

/** Personalização do dashboard do cliente (admin e gestor). */
export function ReportSettingsModal({ clientId, clientName, timezone, initial, logoPath, hasRow, onClose }: {
  clientId: string;
  clientName: string;
  timezone: string;
  initial: ClientReportSettings;
  logoPath: string | null;
  hasRow: boolean;
  onClose: () => void;
}) {
  const [s, setS] = useState<ClientReportSettings>(initial);
  const [error, setError] = useState<string | null>(null);
  const save = useSaveReportSettings(clientId);

  // Ações que apareceram nos últimos 90 dias (para escolher o resultado principal).
  const today = todayIn(timezone);
  const last90 = useMemo(() => ({ from: addDays(today, -90), to: addDays(today, -1) }), [today]);
  const { data: accounts = [] } = useReportAccounts(clientId, last90);
  const actionOptions = useMemo(() => {
    const all: Record<string, number> = {};
    for (const a of accounts) for (const [k, v] of Object.entries(a.cur?.actions ?? {})) all[k] = (all[k] ?? 0) + v;
    const opts = actionResultOptions(all);
    const saved = initial.main_result.source === "action" ? initial.main_result.action_type : null;
    if (saved && !opts.some((o) => o.type === saved)) opts.push({ type: saved, label: `${initial.main_result.label} (sem dados recentes)` });
    return opts;
  }, [accounts, initial.main_result]);

  const mainValue = s.main_result.source === "action" ? `action:${s.main_result.action_type}` : s.main_result.source;
  const onMain = (v: string) => {
    if (v.startsWith("action:")) {
      const type = v.slice(7);
      setS({ ...s, main_result: { source: "action", action_type: type, label: (actionOptions.find((o) => o.type === type)?.label ?? type).slice(0, 60) } });
    } else {
      const src = v as Exclude<MainResultSource, "action">;
      setS({ ...s, main_result: { source: src, label: BASIC[src] } });
    }
  };

  const unused = REPORT_KPI_KEYS.filter((k) => !s.kpis.includes(k));
  const toggleKpi = (key: ReportKpiKey) =>
    setS({ ...s, kpis: s.kpis.includes(key) ? s.kpis.filter((k) => k !== key) : [...s.kpis, key] });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!s.title.trim()) return setError("Informe o título.");
    if (!s.main_result.label.trim()) return setError("Informe o nome do resultado principal.");
    if (s.kpis.length === 0) return setError("Escolha pelo menos uma métrica.");
    try {
      await save.mutateAsync(s);
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <Modal title="Personalizar o dashboard do cliente" open onClose={onClose} size="lg">
      <LogoField clientId={clientId} clientName={clientName} logoPath={logoPath} hasRow={hasRow} />
      <form onSubmit={submit} className="mt-5 space-y-5 border-t border-slate-100 pt-5" data-testid="report-settings-form">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Título">{(id) => <Input id={id} value={s.title} maxLength={120} onChange={(e) => setS({ ...s, title: e.target.value })} />}</Field>
          <Field label="Subtítulo (opcional)">{(id) => <Input id={id} value={s.subtitle ?? ""} maxLength={160} onChange={(e) => setS({ ...s, subtitle: e.target.value })} />}</Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Resultado principal" hint="No Google Ads o resultado é sempre Conversões.">
            {(id) => (
              <Select id={id} value={mainValue} onChange={(e) => onMain(e.target.value)}>
                {Object.entries(BASIC).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                {actionOptions.length > 0 && (
                  <optgroup label="Ações do Meta (últimos 90 dias)">
                    {actionOptions.map((o) => <option key={o.type} value={`action:${o.type}`}>{o.label}</option>)}
                  </optgroup>
                )}
              </Select>
            )}
          </Field>
          <Field label="Nome do resultado" hint="Como o cliente vê (ex.: Leads, Vendas, Agendamentos).">
            {(id) => <Input id={id} value={s.main_result.label} maxLength={60} onChange={(e) => setS({ ...s, main_result: { ...s.main_result, label: e.target.value } })} />}
          </Field>
        </div>

        <Field label="Período ao abrir" hint="O cliente pode trocar o período na tela.">
          {(id) => (
            <Select id={id} value={s.default_period} onChange={(e) => setS({ ...s, default_period: e.target.value as ReportPeriod })}>
              {REPORT_PERIODS.map((p) => <option key={p} value={p}>{PERIOD_LABELS[p]}</option>)}
            </Select>
          )}
        </Field>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-slate-700">Métricas dos cartões (arraste ⠿ para pôr na ordem)</legend>
          <SortableList items={s.kpis} onReorder={(kpis) => setS({ ...s, kpis })} label={(k) => reportKpiLabel(k, s.main_result)} testId="kpi-order">
            {(k) => (
              <>
                <input type="checkbox" checked onChange={() => toggleKpi(k)} aria-label={`Tirar ${reportKpiLabel(k, s.main_result)}`} />
                <span className="flex-1">{reportKpiLabel(k, s.main_result)}</span>
              </>
            )}
          </SortableList>
          {unused.length > 0 && (
            <div className="flex flex-wrap gap-x-4 gap-y-1 pt-1">
              {unused.map((k) => (
                <label key={k} className="flex items-center gap-1.5 text-sm text-slate-600">
                  <input type="checkbox" checked={false} onChange={() => toggleKpi(k)} /> {reportKpiLabel(k, s.main_result)}
                </label>
              ))}
            </div>
          )}
          <p className="text-xs text-slate-500">Métricas que a plataforma não informa ficam de fora do cartão e aparecem numa nota.</p>
        </fieldset>

        <fieldset className="space-y-1">
          <legend className="text-sm font-medium text-slate-700">Partes do dashboard</legend>
          {REPORT_SECTIONS.map((sec) => (
            <label key={sec} className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={s.sections[sec]} onChange={(e) => setS({ ...s, sections: { ...s.sections, [sec]: e.target.checked } })} />
              {REPORT_SECTION_LABELS[sec]}
            </label>
          ))}
        </fieldset>

        {s.sections.summary && (
          <SummaryTemplateField
            value={s.summary_template ?? ""}
            onChange={(v) => setS({ ...s, summary_template: v })}
            preview={(() => {
              const a = accounts.find((x) => x.cur);
              if (!a) return null;
              const main = mainResultFor(s.main_result, a.platform_id);
              return { account: a.name, text: summarySentence(summaryParts(a.cur, a.prev, main), main, a.currency, s.summary_template) };
            })()}
          />
        )}

        <Field label="Análise da agência (o cliente vê)">
          {(id) => <Textarea id={id} value={s.agency_notes ?? ""} maxLength={4000} onChange={(e) => setS({ ...s, agency_notes: e.target.value })} />}
        </Field>
        <Field label="Próximos passos (o cliente vê)">
          {(id) => <Textarea id={id} value={s.next_steps ?? ""} maxLength={4000} onChange={(e) => setS({ ...s, next_steps: e.target.value })} />}
        </Field>

        {error && <Alert tone="error">{error}</Alert>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" loading={save.isPending}>Salvar modelo</Button>
        </div>
      </form>
    </Modal>
  );
}
