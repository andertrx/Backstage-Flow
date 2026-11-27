import {
  AD_CTAS, applyGoal, applyObjective, BILLING_LABELS, billingFor, type CampaignDraft, checkDraft, type CheckItem, checkSummary, COUNTRIES, CUSTOM_EVENTS,
  type DraftAd, type DraftAdSet, duplicateAdSet, GOAL_LABELS, GOALS_BY_OBJECTIVE, newAd, newAdSet, normalizeDraft, OBJECTIVE_LABELS, type ObjectiveId,
  removeAdSet, SPECIAL_AD_CATEGORIES, type SpecialAdCategory, CATALOG_VERSION, GOAL_REQUIRES,
} from "@backstage/shared";
import { AlertTriangle, ArrowLeft, CheckCircle2, Copy, Plus, ShieldCheck, Trash2, XCircle } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router";
import { Alert } from "@/components/ui/alert.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Card } from "@/components/ui/card.tsx";
import { Field, Input, Select, Textarea } from "@/components/ui/field.tsx";
import { useAccountAssets } from "@/features/ads-builder/api.ts";
import { errorMessage } from "@/lib/errors.ts";
import { type AccountLists, saveDraftData, useAccountLists, useBuilderDraft, useBuilderPermissions, useDraftAccount, useValidateDraft } from "./api.ts";
import { confirmar } from "@/lib/confirmStore.ts";
import { toast } from "@/lib/toastStore.ts";

type SaveState = "salvo" | "salvando" | "pendente" | "erro" | "conflito" | "somente-leitura";

function Section({ n, title, hint, children }: { n: number; title: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <Card className="space-y-4 p-4 sm:p-5" data-testid={`cb-secao-${n}`}>
      <div className="flex items-start gap-3">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-blue-600 text-sm font-semibold text-white">{n}</span>
        <div>
          <h2 className="font-semibold text-slate-900">{title}</h2>
          {hint && <p className="text-xs text-slate-500">{hint}</p>}
        </div>
      </div>
      {children}
    </Card>
  );
}

const num = (v: string): number | null => {
  if (v.trim() === "") return null;
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n : null;
};

function AdForm({ ad, pages, instas, disabled, onChange, onRemove }: {
  ad: DraftAd; pages: { id: string; name: string }[]; instas: { id: string; name: string }[]; disabled: boolean; onChange: (a: DraftAd) => void; onRemove: () => void;
}) {
  const set = (p: Partial<DraftAd>) => onChange({ ...ad, ...p });
  return (
    <div className="space-y-3 rounded-xl bg-slate-50 p-3" data-testid="cb-anuncio">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-slate-700">Anúncio</p>
        <Button variant="ghost" className="text-xs" disabled={disabled} onClick={onRemove} aria-label={`Remover anúncio ${ad.name || ""}`}>
          <Trash2 className="size-3.5" aria-hidden /> Remover
        </Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Nome do anúncio">{(id) => <Input id={id} value={ad.name} disabled={disabled} maxLength={200} onChange={(e) => set({ name: e.target.value })} />}</Field>
        <Field label="Botão (CTA)">
          {(id) => (
            <Select id={id} value={ad.cta} disabled={disabled} onChange={(e) => set({ cta: e.target.value as DraftAd["cta"] })}>
              <option value="">Escolha...</option>
              {AD_CTAS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </Select>
          )}
        </Field>
        <Field label="Página do Facebook" hint={pages.length ? "Páginas da conta, lidas do Meta." : "Nenhuma página guardada para esta conta: digite o ID."}>
          {(id) => pages.length ? (
            <Select id={id} value={ad.pageId} disabled={disabled} onChange={(e) => set({ pageId: e.target.value })}>
              <option value="">Escolha...</option>
              {pages.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          ) : <Input id={id} value={ad.pageId} disabled={disabled} maxLength={40} onChange={(e) => set({ pageId: e.target.value })} />}
        </Field>
        <Field label="Perfil do Instagram (opcional)">
          {(id) => instas.length ? (
            <Select id={id} value={ad.instagramId} disabled={disabled} onChange={(e) => set({ instagramId: e.target.value })}>
              <option value="">Sem Instagram</option>
              {instas.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          ) : <Input id={id} value={ad.instagramId} disabled={disabled} maxLength={40} onChange={(e) => set({ instagramId: e.target.value })} />}
        </Field>
      </div>
      <Field label="Texto principal">{(id) => <Textarea id={id} rows={3} value={ad.primaryText} disabled={disabled} maxLength={2000} onChange={(e) => set({ primaryText: e.target.value })} />}</Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Título">{(id) => <Input id={id} value={ad.headline} disabled={disabled} maxLength={200} onChange={(e) => set({ headline: e.target.value })} />}</Field>
        <Field label="Descrição">{(id) => <Input id={id} value={ad.description} disabled={disabled} maxLength={400} onChange={(e) => set({ description: e.target.value })} />}</Field>
      </div>
      <Field label="Link de destino" hint="Precisa começar com https://">{(id) => <Input id={id} type="url" value={ad.link} disabled={disabled} maxLength={2000} placeholder="https://" onChange={(e) => set({ link: e.target.value })} />}</Field>
    </div>
  );
}

function AdSetCard({ draft, set, disabled, pages, instas, currency, lists, onChange, onDuplicate, onRemove, onAddAd, onAdChange, onAdRemove }: {
  draft: CampaignDraft; set: DraftAdSet; disabled: boolean; pages: { id: string; name: string }[]; instas: { id: string; name: string }[]; currency: string; lists: AccountLists | undefined;
  onChange: (s: DraftAdSet) => void; onDuplicate: () => void; onRemove: () => void; onAddAd: () => void; onAdChange: (a: DraftAd) => void; onAdRemove: (id: string) => void;
}) {
  const objective = draft.campaign.objective;
  const goals = objective ? GOALS_BY_OBJECTIVE[objective] : [];
  const need = set.optimizationGoal ? GOAL_REQUIRES[set.optimizationGoal] : undefined;
  const special = draft.campaign.specialAdCategories.length > 0;
  const patch = (p: Partial<DraftAdSet>) => onChange({ ...set, ...p });
  const ads = draft.ads.filter((a) => a.adSetId === set.id);
  return (
    <div className="space-y-4 rounded-2xl p-4 ring-1 ring-slate-200" data-testid="cb-conjunto">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold text-slate-800">{set.name.trim() || "Conjunto sem nome"}</h3>
        <div className="flex gap-1">
          <Button variant="secondary" className="px-3 py-1 text-xs" disabled={disabled} onClick={onDuplicate}><Copy className="size-3.5" aria-hidden /> Duplicar</Button>
          <Button variant="ghost" className="text-xs" disabled={disabled} onClick={onRemove} aria-label={`Remover conjunto ${set.name || ""}`}><Trash2 className="size-3.5" aria-hidden /> Remover</Button>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Nome do conjunto">{(id) => <Input id={id} value={set.name} disabled={disabled} maxLength={200} onChange={(e) => patch({ name: e.target.value })} />}</Field>
        <Field label="Meta de otimização" hint={objective ? undefined : "Escolha o objetivo da campanha primeiro."}>
          {(id) => (
            <Select id={id} value={set.optimizationGoal} disabled={disabled || !objective} onChange={(e) => onChange(applyGoal(set, e.target.value as DraftAdSet["optimizationGoal"]))}>
              <option value="">Escolha...</option>
              {goals.map((g) => <option key={g} value={g}>{GOAL_LABELS[g]}</option>)}
            </Select>
          )}
        </Field>
        <Field label="Cobrança">
          {(id) => (
            <Select id={id} value={set.billingEvent} disabled={disabled || !set.optimizationGoal} onChange={(e) => patch({ billingEvent: e.target.value as DraftAdSet["billingEvent"] })}>
              {!set.optimizationGoal && <option value="">Escolha a meta...</option>}
              {set.optimizationGoal && billingFor(set.optimizationGoal).map((b) => <option key={b} value={b}>{BILLING_LABELS[b]}</option>)}
            </Select>
          )}
        </Field>
        {draft.campaign.budgetLevel === "adset" && (
          <Field label={`Orçamento ${draft.campaign.budgetType === "daily" ? "diário" : "total"} (${currency})`}>
            {(id) => <Input id={id} inputMode="decimal" value={set.budgetAmount ?? ""} disabled={disabled} onChange={(e) => patch({ budgetAmount: num(e.target.value) })} />}
          </Field>
        )}
        <Field label="Início (opcional)">{(id) => <Input id={id} type="date" value={set.startDate} disabled={disabled} onChange={(e) => patch({ startDate: e.target.value })} />}</Field>
        <Field label={draft.campaign.budgetType === "lifetime" ? "Término (obrigatório no orçamento total)" : "Término (opcional)"}>
          {(id) => <Input id={id} type="date" value={set.endDate} disabled={disabled} onChange={(e) => patch({ endDate: e.target.value })} />}
        </Field>
      </div>
      {need && (
        <div className="grid gap-3 rounded-xl bg-amber-50 p-3 sm:grid-cols-3">
          {need.pixel && (
            <Field label={lists?.pixels.length ? "Pixel" : "Pixel (ID)"}>
              {(id) => lists?.pixels.length ? (
                <Select id={id} value={set.pixelId} disabled={disabled} onChange={(e) => patch({ pixelId: e.target.value })}>
                  <option value="">Escolha...</option>
                  {lists.pixels.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.id})</option>)}
                </Select>
              ) : <Input id={id} value={set.pixelId} disabled={disabled} maxLength={40} onChange={(e) => patch({ pixelId: e.target.value })} />}
            </Field>
          )}
          {need.customEvent && (
            <Field label="Evento de conversão">
              {(id) => (
                <Select id={id} value={set.customEvent} disabled={disabled} onChange={(e) => patch({ customEvent: e.target.value as DraftAdSet["customEvent"] })}>
                  <option value="">Escolha...</option>
                  {CUSTOM_EVENTS.map((c) => <option key={c} value={c}>{c}</option>)}
                </Select>
              )}
            </Field>
          )}
          {need.page && (
            <Field label="Página (ID)">
              {(id) => pages.length ? (
                <Select id={id} value={set.pageId} disabled={disabled} onChange={(e) => patch({ pageId: e.target.value })}>
                  <option value="">Escolha...</option>
                  {pages.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </Select>
              ) : <Input id={id} value={set.pageId} disabled={disabled} maxLength={40} onChange={(e) => patch({ pageId: e.target.value })} />}
            </Field>
          )}
        </div>
      )}
      <div className="space-y-3">
        <p className="text-sm font-medium text-slate-700">Público</p>
        <div className="grid gap-3 sm:grid-cols-4">
          <Field label="País">
            {(id) => (
              <Select id={id} value={set.countries[0] ?? ""} disabled={disabled} onChange={(e) => patch({ countries: e.target.value ? [e.target.value] : [] })}>
                <option value="">Escolha...</option>
                {COUNTRIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
              </Select>
            )}
          </Field>
          <Field label="Idade mínima">{(id) => <Input id={id} type="number" min={18} max={65} value={set.ageMin} disabled={disabled || special} onChange={(e) => patch({ ageMin: Number(e.target.value) })} />}</Field>
          <Field label="Idade máxima">{(id) => <Input id={id} type="number" min={18} max={65} value={set.ageMax} disabled={disabled || special} onChange={(e) => patch({ ageMax: Number(e.target.value) })} />}</Field>
          <Field label="Gênero">
            {(id) => (
              <Select id={id} value={set.gender} disabled={disabled || special} onChange={(e) => patch({ gender: e.target.value as DraftAdSet["gender"] })}>
                <option value="all">Todos</option>
                <option value="male">Homens</option>
                <option value="female">Mulheres</option>
              </Select>
            )}
          </Field>
        </div>
        {lists && (lists.customAudiences.length > 0 || lists.savedAudiences.length > 0) && (
          <fieldset className="space-y-1.5" data-testid="cb-publicos">
            <legend className="text-sm font-medium text-slate-700">Públicos da conta (opcional)</legend>
            <div className="max-h-40 space-y-1 overflow-y-auto rounded-xl bg-slate-50 p-2.5">
              {[...lists.customAudiences.map((a) => ({ ...a, kind: "Personalizado" })), ...lists.savedAudiences.map((a) => ({ ...a, kind: "Salvo" }))].map((a) => (
                <label key={a.id} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" disabled={disabled} checked={set.audienceIds.includes(a.id)}
                    onChange={(e) => patch({ audienceIds: e.target.checked ? [...set.audienceIds, a.id] : set.audienceIds.filter((x) => x !== a.id) })} />
                  <span className="min-w-0 flex-1 truncate">{a.name}</span>
                  <span className="text-xs text-slate-400">{a.kind}</span>
                </label>
              ))}
            </div>
          </fieldset>
        )}
        <p className="text-xs text-slate-500">Posicionamentos: automáticos (o Meta escolhe). Interesses e locais detalhados entram numa próxima fase.</p>
      </div>
      <div className="space-y-3">
        {ads.map((a) => <AdForm key={a.id} ad={a} pages={pages} instas={instas} disabled={disabled} onChange={onAdChange} onRemove={() => onAdRemove(a.id)} />)}
        <Button variant="secondary" disabled={disabled} onClick={onAddAd}><Plus className="size-4" aria-hidden /> Adicionar anúncio</Button>
      </div>
    </div>
  );
}

function ChecklistPanel({ items, validate }: { items: CheckItem[]; validate?: ReactNode }) {
  const s = checkSummary(items);
  return (
    <Card className="space-y-3 p-4" data-testid="cb-checklist">
      <h2 className="font-semibold text-slate-900">Conferência</h2>
      {s.ready ? (
        <p className="flex items-center gap-2 text-sm text-emerald-700"><CheckCircle2 className="size-4" aria-hidden /> Tudo preenchido{s.warnings ? `, com ${s.warnings} aviso(s)` : ""}.</p>
      ) : (
        <p className="text-sm text-slate-600">{s.errors} item(ns) para corrigir{s.warnings ? ` e ${s.warnings} aviso(s)` : ""}.</p>
      )}
      <ul className="max-h-96 space-y-1.5 overflow-y-auto text-xs">
        {items.map((i, k) => (
          <li key={k} className="flex gap-2" data-level={i.level}>
            {i.level === "erro" ? <XCircle className="mt-0.5 size-3.5 shrink-0 text-red-600" aria-hidden /> : <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-amber-600" aria-hidden />}
            <span className="text-slate-700">{i.message}</span>
          </li>
        ))}
      </ul>
      {validate}
      <p className="border-t border-slate-100 pt-2 text-xs text-slate-500">
        As regras de combinação seguem o catálogo da API {CATALOG_VERSION}. O <strong>Validar com o Meta</strong> confere só a campanha; os conjuntos e os anúncios o Meta confere na hora de publicar. Nada é criado no Meta.
      </p>
    </Card>
  );
}

export function DraftEditorPage() {
  const { id } = useParams();
  const perms = useBuilderPermissions();
  const loaded = useBuilderDraft(id);
  const account = useDraftAccount(loaded.data?.ad_account_id);
  const assets = useAccountAssets(loaded.data?.ad_account_id ?? null);
  const accountLists = useAccountLists(loaded.data?.ad_account_id);
  const validate = useValidateDraft();
  const [name, setName] = useState("");
  const [draft, setDraft] = useState<CampaignDraft | null>(null);
  const [state, setState] = useState<SaveState>("salvo");
  const [saveError, setSaveError] = useState<string | null>(null);
  const version = useRef(0);
  const dirty = useRef(false);
  const saving = useRef(false);
  const latest = useRef<{ name: string; draft: CampaignDraft | null }>({ name: "", draft: null });
  const canEdit = perms.data?.editar === true;

  useEffect(() => {
    if (!loaded.data || draft) return;
    setName(loaded.data.name);
    setDraft(normalizeDraft(loaded.data.data));
    version.current = loaded.data.version;
  }, [loaded.data, draft]);

  latest.current = { name, draft };

  async function flush() {
    if (!id || !dirty.current || saving.current || !latest.current.draft) return;
    saving.current = true;
    setState("salvando");
    const snapshot = latest.current;
    dirty.current = false;
    try {
      const r = await saveDraftData({ id, version: version.current, name: snapshot.name, data: snapshot.draft });
      version.current = r.version;
      setSaveError(null);
      setState(dirty.current ? "pendente" : "salvo");
    } catch (err) {
      dirty.current = true;
      setSaveError(errorMessage(err));
      setState((err as { conflict?: boolean }).conflict ? "conflito" : "erro");
    } finally {
      saving.current = false;
    }
  }

  // Salvamento automático: 1,2 s depois da última mudança.
  useEffect(() => {
    if (!dirty.current || state === "conflito") return;
    const t = setTimeout(() => void flush(), 1200);
    return () => clearTimeout(t);
  });

  function change(next: CampaignDraft) {
    if (!canEdit) return;
    dirty.current = true;
    setState("pendente");
    setDraft(next);
  }
  function rename(v: string) {
    if (!canEdit) return;
    dirty.current = true;
    setState("pendente");
    setName(v);
  }

  const items = useMemo(() => (draft ? checkDraft(draft) : []), [draft]);
  const pages = (assets.data ?? []).filter((a) => a.asset_type === "page").map((a) => ({ id: a.external_id, name: a.name ?? a.external_id }));
  const instas = (assets.data ?? []).filter((a) => a.asset_type === "instagram").map((a) => ({ id: a.external_id, name: a.name ?? a.external_id }));
  const currency = account.data?.currency ?? "";

  if (loaded.isLoading || perms.isLoading) return <p className="text-sm text-slate-500">Carregando...</p>;
  if (loaded.error) return <Alert tone="error">{errorMessage(loaded.error)}</Alert>;
  if (!draft) return null;
  const disabled = !canEdit || state === "conflito";
  const c = draft.campaign;
  const stateText: Record<SaveState, string> = {
    salvo: "Salvo", salvando: "Salvando...", pendente: "Alterações a salvar...", erro: "Não salvou", conflito: "Conflito", "somente-leitura": "Somente leitura",
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link to="/criar/campanhas" className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900"><ArrowLeft className="size-4" aria-hidden /> Rascunhos</Link>
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-500" data-testid="cb-estado" role="status">{canEdit ? stateText[state] : stateText["somente-leitura"]}</span>
          {canEdit && <Button variant="secondary" onClick={() => void flush()} disabled={state === "salvando" || state === "salvo" || state === "conflito"}>Salvar agora</Button>}
        </div>
      </div>

      {!canEdit && <Alert tone="info">Você pode ver este rascunho, mas não tem permissão para editar.</Alert>}
      {saveError && (
        <Alert tone="error">
          {saveError}
          {state === "conflito" && <> <button type="button" className="font-semibold underline" onClick={() => window.location.reload()}>Recarregar</button></>}
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <Section n={1} title="Campanha" hint={account.data ? `Conta: ${account.data.name} (${currency})` : undefined}>
            <Field label="Nome do rascunho">{(i) => <Input id={i} value={name} disabled={disabled} maxLength={120} onChange={(e) => rename(e.target.value)} />}</Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Nome da campanha">{(i) => <Input id={i} value={c.name} disabled={disabled} maxLength={200} onChange={(e) => change({ ...draft, campaign: { ...c, name: e.target.value } })} />}</Field>
              <Field label="Objetivo">
                {(i) => (
                  <Select id={i} value={c.objective} disabled={disabled} onChange={(e) => change(applyObjective(draft, e.target.value as ObjectiveId | ""))}>
                    <option value="">Escolha...</option>
                    {(Object.keys(OBJECTIVE_LABELS) as ObjectiveId[]).map((o) => <option key={o} value={o}>{OBJECTIVE_LABELS[o]}</option>)}
                  </Select>
                )}
              </Field>
              <Field label="Status ao publicar" hint="Escolha. Não vem preenchido: publicar gasta verba.">
                {(i) => (
                  <Select id={i} value={c.status} disabled={disabled} onChange={(e) => change({ ...draft, campaign: { ...c, status: e.target.value as typeof c.status } })}>
                    <option value="">Escolha...</option>
                    <option value="PAUSED">Pausada (recomendado para conferir antes)</option>
                    <option value="ACTIVE">Ativa (começa a gastar)</option>
                  </Select>
                )}
              </Field>
              <Field label="Onde fica o orçamento">
                {(i) => (
                  <Select id={i} value={c.budgetLevel} disabled={disabled} onChange={(e) => change({ ...draft, campaign: { ...c, budgetLevel: e.target.value as typeof c.budgetLevel } })}>
                    <option value="adset">Em cada conjunto</option>
                    <option value="campaign">Na campanha</option>
                  </Select>
                )}
              </Field>
              <Field label="Tipo de orçamento">
                {(i) => (
                  <Select id={i} value={c.budgetType} disabled={disabled} onChange={(e) => change({ ...draft, campaign: { ...c, budgetType: e.target.value as typeof c.budgetType } })}>
                    <option value="daily">Diário</option>
                    <option value="lifetime">Total (vitalício)</option>
                  </Select>
                )}
              </Field>
              {c.budgetLevel === "campaign" && (
                <Field label={`Orçamento da campanha (${currency})`}>
                  {(i) => <Input id={i} inputMode="decimal" value={c.budgetAmount ?? ""} disabled={disabled} onChange={(e) => change({ ...draft, campaign: { ...c, budgetAmount: num(e.target.value) } })} />}
                </Field>
              )}
            </div>
            <fieldset className="space-y-1.5">
              <legend className="text-sm font-medium text-slate-700">Categoria especial de anúncio (se houver)</legend>
              <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                {SPECIAL_AD_CATEGORIES.map((s) => (
                  <label key={s.id} className="flex items-center gap-1.5 text-sm">
                    <input
                      type="checkbox"
                      checked={c.specialAdCategories.includes(s.id as SpecialAdCategory)}
                      disabled={disabled}
                      onChange={(e) => change({ ...draft, campaign: { ...c, specialAdCategories: e.target.checked ? [...c.specialAdCategories, s.id as SpecialAdCategory] : c.specialAdCategories.filter((x) => x !== s.id) } })}
                    />
                    {s.label}
                  </label>
                ))}
              </div>
            </fieldset>
          </Section>

          <Section n={2} title="Conjuntos e anúncios" hint="Cada conjunto tem o seu público, e cada conjunto tem os seus anúncios.">
            {draft.adSets.map((s) => (
              <AdSetCard
                key={s.id}
                draft={draft}
                set={s}
                disabled={disabled}
                pages={pages}
                instas={instas}
                currency={currency}
                lists={accountLists.data}
                onChange={(n) => change({ ...draft, adSets: draft.adSets.map((x) => (x.id === n.id ? n : x)) })}
                onDuplicate={() => change(duplicateAdSet(draft, s.id))}
                onRemove={async () => { if ((await confirmar("Remover este conjunto e os anúncios dele do rascunho?"))) { change(removeAdSet(draft, s.id)); toast.success("Conjunto removido do rascunho."); } }}
                onAddAd={() => change({ ...draft, ads: [...draft.ads, newAd(s.id, { pageId: pages[0]?.id ?? "" })] })}
                onAdChange={(a) => change({ ...draft, ads: draft.ads.map((x) => (x.id === a.id ? a : x)) })}
                onAdRemove={(adId) => change({ ...draft, ads: draft.ads.filter((x) => x.id !== adId) })}
              />
            ))}
            <Button variant="secondary" disabled={disabled} onClick={() => change({ ...draft, adSets: [...draft.adSets, newAdSet()] })}><Plus className="size-4" aria-hidden /> Adicionar conjunto</Button>
          </Section>

          <details className="rounded-xl bg-slate-50 p-4 text-sm" data-testid="cb-avancado">
            <summary className="cursor-pointer font-medium text-slate-800">Modo avançado (JSON)</summary>
            <p className="mt-2 text-xs text-slate-500">Para propriedades da API que o editor ainda não tem. O Meta valida no passo seguinte; não há garantia de que ele aceite.</p>
            <Textarea aria-label="JSON avançado" rows={6} className="mt-2 font-mono text-xs" value={draft.advancedJson} disabled={disabled} onChange={(e) => change({ ...draft, advancedJson: e.target.value })} />
          </details>
        </div>
        <aside className="lg:sticky lg:top-4 lg:self-start space-y-3">
          <ChecklistPanel items={items} validate={canEdit ? (
            <div className="space-y-2 border-t border-slate-100 pt-3" data-testid="cb-validar">
              <Button variant="secondary" className="w-full" loading={validate.isPending} disabled={state === "conflito" || !loaded.data?.ad_account_id}
                onClick={async () => { if (!id) return; await flush(); validate.mutate(id); }}>
                <ShieldCheck className="size-4" aria-hidden /> Validar com o Meta
              </Button>
              {!loaded.data?.ad_account_id && <p className="text-xs text-slate-500">Este rascunho não tem conta de anúncio escolhida.</p>}
              {validate.error && <Alert tone="error">{errorMessage(validate.error)}</Alert>}
              {validate.data?.ok && <Alert tone="success"><span data-testid="cb-validou-ok">O Meta aceitou a campanha. Nada foi criado.</span></Alert>}
              {validate.data && !validate.data.ok && (
                <Alert tone="error">
                  <span data-testid="cb-validou-erro">
                    {validate.data.permission ? "O token do Meta não tem permissão para criar campanhas (ads_management). " : "O Meta recusou a campanha: "}
                    {validate.data.message}
                  </span>
                </Alert>
              )}
            </div>
          ) : undefined} />
          {accountLists.data && accountLists.data.failed.length > 0 && (
            <Alert tone="warning">Não consegui ler {accountLists.data.failed.map((f) => ({ pixels: "os pixels", customAudiences: "os públicos personalizados", savedAudiences: "os públicos salvos" })[f]).join(", ")} da conta no Meta. Confira as permissões do token.</Alert>
          )}
        </aside>
      </div>
    </div>
  );
}
