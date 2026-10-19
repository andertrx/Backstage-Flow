import {
  customKey, customParams, parseSpreadsheetId, RI_FIELD_LABELS, RI_FIELDS, RI_MAX_CUSTOM, RI_PROFILE_LABELS, RI_PROFILES, type RiCustomKey,
  type RiField, type RiMapping, type RiProfile, suggestMapping, suggestProfile,
} from "@backstage/shared";
import { FileSpreadsheet, ListChecks, Plus, Search, Table2, Trash2 } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Alert } from "@/components/ui/alert.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Card } from "@/components/ui/card.tsx";
import { Field, Input, Select } from "@/components/ui/field.tsx";
import { errorMessage } from "@/lib/errors.ts";
import { callSheets, type ColumnValue, type RiSource, type SheetTab, useSaveRiSource } from "./api.ts";

const NONE = "";

function Step({ n, title, icon, children }: { n: number; title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <Card className="space-y-4 p-5" data-testid={`ri-step-${n}`}>
      <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
        <span className="grid size-6 place-items-center rounded-full bg-blue-50 text-xs font-semibold text-blue-700">{n}</span>
        {icon} {title}
      </h2>
      {children}
    </Card>
  );
}

/**
 * Assistente (Etapa 39.1): link da planilha → aba e cabeçalho → prévia →
 * colunas → regras dos perfis → salvar. A prévia só aparece na tela; nada da
 * planilha é guardado aqui, só a configuração.
 */
export function SourceSetup({ clientId, source, onDone }: { clientId: string; source: RiSource | null; onDone: () => void }) {
  const save = useSaveRiSource();
  const [url, setUrl] = useState(source ? `https://docs.google.com/spreadsheets/d/${source.spreadsheet_id}` : "");
  const [spreadsheetId, setSpreadsheetId] = useState(source?.spreadsheet_id ?? null);
  const [title, setTitle] = useState(source?.spreadsheet_title ?? null);
  const [tabs, setTabs] = useState<SheetTab[] | null>(null);
  const [sheet, setSheet] = useState(source?.sheet_name ?? "");
  const [headerRow, setHeaderRow] = useState(String(source?.header_row ?? 1));
  const [preview, setPreview] = useState<{ headers: string[]; rows: string[][] } | null>(null);
  const [mapping, setMapping] = useState<RiMapping>(source?.mapping ?? {});
  const [values, setValues] = useState<{ totalRows: number; values: ColumnValue[] } | null>(null);
  const [rules, setRules] = useState<Record<string, RiProfile | "">>(source?.profile_rules ?? {});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const row = Number(headerRow);
  const rowOk = Number.isInteger(row) && row >= 1 && row <= 50;

  async function step<T>(name: string, fn: () => Promise<T>): Promise<T | null> {
    setBusy(name);
    setError(null);
    try { return await fn(); } catch (err) { setError(errorMessage(err)); return null; } finally { setBusy(null); }
  }

  async function openSheet() {
    if (!parseSpreadsheetId(url)) return setError("Link não reconhecido. Abra a planilha no navegador e copie o endereço inteiro.");
    const info = await step("inspect", () => callSheets<{ spreadsheetId: string; title: string; tabs: SheetTab[] }>({ action: "inspect", clientId, url }));
    if (!info) return;
    setSpreadsheetId(info.spreadsheetId);
    setTitle(info.title);
    setTabs(info.tabs);
    setPreview(null);
    setValues(null);
    if (!info.tabs.some((t) => t.title === sheet)) setSheet(info.tabs[0]?.title ?? "");
  }

  async function readColumns() {
    if (!spreadsheetId || !sheet || !rowOk) return setError("Escolha a aba e a linha do cabeçalho (1 a 50).");
    const p = await step("preview", () => callSheets<{ headers: string[]; rows: string[][] }>({ action: "preview", clientId, spreadsheetId, sheet, headerRow: row }));
    if (!p) return;
    if (!p.headers.some(Boolean)) return setError(`A linha ${row} da aba "${sheet}" está vazia. Informe a linha em que ficam os nomes das colunas.`);
    setPreview(p);
    setValues(null);
    // Mantém o que já estava ligado (se a coluna ainda existe) e sugere o resto.
    const kept = Object.fromEntries(Object.entries(mapping).filter(([, h]) => p.headers.includes(h ?? ""))) as RiMapping;
    setMapping({ ...suggestMapping(p.headers.filter((h) => !Object.values(kept).includes(h))), ...kept });
  }

  async function readProfiles() {
    const column = mapping.profile;
    if (!spreadsheetId || !column) return setError("Escolha primeiro a coluna SQL.");
    const v = await step("values", () => callSheets<{ totalRows: number; values: ColumnValue[] }>({ action: "column_values", clientId, spreadsheetId, sheet, headerRow: row, column }));
    if (!v) return;
    setValues(v);
    setRules((old) => {
      const next = { ...old };
      for (const item of v.values) if (item.value && !(item.value in next)) next[item.value] = suggestProfile(item.value) ?? "";
      return next;
    });
  }

  async function submit() {
    if (!spreadsheetId || !sheet || !rowOk) return setError("Abra a planilha e escolha a aba.");
    if (!mapping.profile) return setError("Escolha a coluna SQL (perfil: lojista, sacoleiro ou consumidor final).");
    const profileRules = Object.fromEntries(Object.entries(rules).filter(([k, v]) => k && v)) as Record<string, RiProfile>;
    const ok = await step("save", () => save.mutateAsync({
      id: source?.id ?? null, clientId, spreadsheetId, spreadsheetTitle: title, sheetName: sheet, headerRow: row,
      mapping: Object.fromEntries(Object.entries(mapping).filter(([, h]) => h)) as RiMapping, profileRules,
    }));
    if (ok) onDone();
  }

  const setField = (field: RiField, header: string) => setMapping((m) => {
    const next = { ...m };
    if (header) next[field] = header; else delete next[field];
    return next;
  });
  // Parâmetros personalizados ("+ Adicionar parâmetro"): nome dado aqui → coluna da planilha.
  const custom = customParams(mapping);
  const [newName, setNewName] = useState("");
  const [newColumn, setNewColumn] = useState("");
  const addCustom = () => {
    const key = customKey(newName);
    if (!key) return setError("Dê um nome ao parâmetro (até 40 letras).");
    if (key in mapping) return setError("Já existe um parâmetro com esse nome.");
    if (!newColumn) return setError("Escolha a coluna da planilha para o parâmetro.");
    if (custom.length >= RI_MAX_CUSTOM) return setError(`No máximo ${RI_MAX_CUSTOM} parâmetros personalizados.`);
    setError(null);
    setMapping((m) => ({ ...m, [key]: newColumn }));
    setNewName("");
    setNewColumn("");
  };
  const removeCustom = (key: RiCustomKey) => setMapping((m) => {
    const next = { ...m };
    delete next[key];
    return next;
  });
  const headers = preview?.headers.filter(Boolean) ?? [];
  const ruleValues = values?.values ?? Object.keys(rules).map((v) => ({ value: v, example: v, count: 0 }));
  const unclassified = values ? values.values.filter((v) => !rules[v.value] || rules[v.value] === "nao_identificado").reduce((t, v) => t + v.count, 0) : null;

  return (
    <div className="space-y-4" data-testid="ri-setup">
      <Step n={1} title="Planilha" icon={<FileSpreadsheet className="size-4 text-emerald-600" aria-hidden />}>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="flex-1">
            <Field label="Link da planilha do Google Sheets" hint="Abra a planilha no navegador e copie o endereço. Ela precisa estar compartilhada com o e-mail da conta do Google do CRM (Configurações → Integrações).">
              {(id) => <Input id={id} value={url} placeholder="https://docs.google.com/spreadsheets/d/..." onChange={(e) => setUrl(e.target.value)} />}
            </Field>
          </div>
          <Button type="button" variant="secondary" loading={busy === "inspect"} onClick={openSheet}>
            <Search className="size-4" aria-hidden /> Abrir planilha
          </Button>
        </div>
        {title && <p className="text-sm text-slate-700" data-testid="ri-sheet-title">Planilha encontrada: <strong>{title}</strong></p>}
        {(tabs || source) && (
          <div className="grid gap-3 sm:grid-cols-[1fr_12rem_auto] sm:items-end">
            <Field label="Aba com os contatos">
              {(id) => (
                <Select id={id} value={sheet} onChange={(e) => { setSheet(e.target.value); setPreview(null); setValues(null); }}>
                  {(tabs ?? [{ title: sheet, rowCount: 0, columnCount: 0 }]).map((t) => (
                    <option key={t.title} value={t.title}>{t.title}{t.rowCount ? ` (${t.rowCount.toLocaleString("pt-BR")} linhas)` : ""}</option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Linha do cabeçalho" hint="Onde ficam os nomes das colunas.">
              {(id) => <Input id={id} type="number" min={1} max={50} value={headerRow} onChange={(e) => { setHeaderRow(e.target.value); setPreview(null); }} />}
            </Field>
            <Button type="button" variant="secondary" loading={busy === "preview"} onClick={readColumns}>
              <Table2 className="size-4" aria-hidden /> Ler colunas
            </Button>
          </div>
        )}
      </Step>

      {preview && (
        <Step n={2} title="Prévia e colunas" icon={<Table2 className="size-4 text-blue-600" aria-hidden />}>
          <p className="text-xs text-slate-500">Primeiras linhas da aba, só para conferir. A prévia não é guardada no CRM.</p>
          <div className="max-h-64 overflow-auto rounded-lg ring-1 ring-slate-200" data-testid="ri-preview">
            <table className="min-w-full text-xs">
              <thead className="sticky top-0 bg-slate-50 text-left text-slate-600">
                <tr>{preview.headers.map((h, i) => <th key={i} className="whitespace-nowrap px-2 py-1.5 font-medium">{h || "—"}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {preview.rows.slice(0, 5).map((r, i) => (
                  <tr key={i}>{preview.headers.map((_, j) => <td key={j} className="max-w-48 truncate whitespace-nowrap px-2 py-1 text-slate-700">{r[j] ?? ""}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>
          {preview.rows.length === 0 && <Alert tone="info">A aba só tem o cabeçalho por enquanto. Dá para configurar mesmo assim.</Alert>}

          <div className="space-y-3" data-testid="ri-mapping">
            <p className="text-sm text-slate-600">Ligue cada informação à coluna da planilha. O CRM sugeriu pelo nome; confira e ajuste. O que não existir na planilha, deixe "não usar".</p>
            {(["Contato", "Origem", "Outros"] as const).map((group) => (
              <fieldset key={group} className="grid gap-3 sm:grid-cols-2">
                <legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{group === "Origem" ? "Origem (UTMs e IDs)" : group === "Outros" ? "Outros (opcional)" : group}</legend>
                {RI_FIELDS.filter((f) => RI_FIELD_LABELS[f].group === group).map((f) => (
                  <Field key={f} label={`${RI_FIELD_LABELS[f].label}${f === "profile" ? " (obrigatório)" : ""}`} hint={RI_FIELD_LABELS[f].hint || undefined}>
                    {(id) => (
                      <Select id={id} value={mapping[f] ?? NONE} onChange={(e) => setField(f, e.target.value)}>
                        <option value={NONE}>— não usar —</option>
                        {headers.map((h) => <option key={h} value={h}>{h}</option>)}
                      </Select>
                    )}
                  </Field>
                ))}
              </fieldset>
            ))}
            <fieldset className="space-y-2" data-testid="ri-custom">
              <legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Parâmetros personalizados</legend>
              {custom.length > 0 && (
                <ul className="divide-y divide-slate-100 rounded-lg ring-1 ring-slate-200">
                  {custom.map((c) => (
                    <li key={c.key} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                      <span><strong className="text-slate-900">{c.label}</strong> <span className="text-slate-500">→ coluna “{c.column}”</span></span>
                      <button type="button" className="text-slate-400 hover:text-red-600" aria-label={`Remover o parâmetro ${c.label}`} onClick={() => removeCustom(c.key)}>
                        <Trash2 className="size-4" aria-hidden />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex flex-wrap items-end gap-2">
                <div className="w-full sm:w-56">
                  <Field label="Nome do parâmetro">{(id) => <Input id={id} value={newName} maxLength={40} placeholder="Ex.: Cidade" onChange={(e) => setNewName(e.target.value)} />}</Field>
                </div>
                <div className="w-full sm:w-56">
                  <Field label="Coluna da planilha">
                    {(id) => (
                      <Select id={id} value={newColumn} onChange={(e) => setNewColumn(e.target.value)}>
                        <option value="">Escolha a coluna</option>
                        {headers.map((h) => <option key={h} value={h}>{h}</option>)}
                      </Select>
                    )}
                  </Field>
                </div>
                <Button type="button" variant="secondary" onClick={addCustom}><Plus className="size-4" aria-hidden /> Adicionar parâmetro</Button>
              </div>
              <p className="text-xs text-slate-500">O valor do parâmetro aparece nos registros de cada contato. Não use para dados pessoais (CPF, endereço etc.).</p>
            </fieldset>
            {!mapping.record_id && (
              <Alert tone="info">Sem a coluna "ID do contato" (nem o Número), cada linha da planilha conta como um contato. Se a planilha tiver um ID do lead, ligue aqui: é o jeito mais seguro de não contar o mesmo contato duas vezes.</Alert>
            )}
          </div>
        </Step>
      )}

      {(preview || source) && (
        <Step n={3} title="Perfis comerciais" icon={<ListChecks className="size-4 text-violet-600" aria-hidden />}>
          <p className="text-sm text-slate-600">
            Diga a que perfil corresponde cada valor da coluna SQL (<strong>{mapping.profile ?? "ainda não escolhida"}</strong>). Só os nomes exatos
            (Lojista, Sacoleiro, Consumidor final) vêm marcados; variações como "Sacoleira" só contam se você escolher.
            O que ficar sem perfil conta como <strong>Não identificado</strong>.
          </p>
          <Button type="button" variant="secondary" loading={busy === "values"} disabled={!mapping.profile || !spreadsheetId} onClick={readProfiles}>
            <ListChecks className="size-4" aria-hidden /> Ler os valores da coluna SQL
          </Button>
          {values && <p className="text-xs text-slate-500" data-testid="ri-values-total">{values.totalRows.toLocaleString("pt-BR")} linhas lidas na planilha.</p>}
          {ruleValues.length > 0 && (
            <ul className="divide-y divide-slate-100 rounded-lg ring-1 ring-slate-200" data-testid="ri-rules">
              {ruleValues.map((v) => (
                <li key={v.value || "(vazio)"} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                  <span className="min-w-0">
                    {v.value ? <strong className="font-medium text-slate-900">{v.example}</strong> : <span className="text-slate-500">(vazio)</span>}
                    {v.count > 0 && <span className="ml-2 text-xs text-slate-500">{v.count.toLocaleString("pt-BR")} linha(s)</span>}
                  </span>
                  {v.value ? (
                    <Select aria-label={`Perfil de ${v.example}`} className="w-48" value={rules[v.value] ?? ""}
                      onChange={(e) => setRules((r) => ({ ...r, [v.value]: e.target.value as RiProfile | "" }))}>
                      <option value="">— sem perfil —</option>
                      {RI_PROFILES.map((p) => <option key={p} value={p}>{RI_PROFILE_LABELS[p]}</option>)}
                    </Select>
                  ) : (
                    <span className="text-xs text-slate-500">Não identificado</span>
                  )}
                </li>
              ))}
            </ul>
          )}
          {unclassified != null && unclassified > 0 && (
            <p className="text-xs text-amber-700" data-testid="ri-unclassified">
              {unclassified.toLocaleString("pt-BR")} linha(s) ficariam como Não identificado com estas regras.
            </p>
          )}
        </Step>
      )}

      {error && <Alert tone="error">{error}</Alert>}
      <div className="flex flex-wrap justify-end gap-2">
        {source && <Button type="button" variant="secondary" onClick={onDone}>Cancelar</Button>}
        <Button type="button" loading={busy === "save"} disabled={!spreadsheetId || !mapping.profile || (!preview && !source)} onClick={submit}>
          Salvar configuração
        </Button>
      </div>
    </div>
  );
}

/** Texto curto das regras: "lojista → Lojista · sacoleira → Sacoleiro". */
export function rulesSummary(rules: Record<string, RiProfile>): string {
  const list = Object.entries(rules).filter(([, p]) => p !== "nao_identificado");
  return list.length ? list.map(([v, p]) => `${v} → ${RI_PROFILE_LABELS[p]}`).join(" · ") : "Nenhuma regra";
}

