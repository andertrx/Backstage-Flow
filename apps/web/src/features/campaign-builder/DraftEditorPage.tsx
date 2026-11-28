import {
  AD_CTAS, applyGoal, DESTINATION_LABELS, destinationsFor, leadsToWebsite, usesExistingPost, PUBLISH_UNSUPPORTED_GOALS, applyObjective, BILLING_LABELS, billingFor, type CampaignDraft, checkDraft, type CheckItem, checkSummary, COUNTRIES, CUSTOM_EVENTS,
  type DraftAd, type DraftAdSet, duplicateAdSet, GOAL_LABELS, GOALS_BY_OBJECTIVE, newAd, newAdSet, normalizeDraft, OBJECTIVE_LABELS, type ObjectiveId,
  removeAdSet, featureLabel, isEsteira, MANUAL_PLACEMENTS, SUGGESTED_URL_TAGS, urlTagsProblem, CITY_RADIUS_MAX, CITY_RADIUS_MIN, MAX_CITIES, MAX_INTERESTS, SPECIAL_AD_CATEGORIES, type SpecialAdCategory, CATALOG_VERSION, GOAL_REQUIRES, checkPublishable, publishCounts,
} from "@backstage/shared";
import { AlertTriangle, ArrowLeft, CheckCircle2, Copy, ExternalLink, Image as ImageIcon, Plus, Rocket, ShieldCheck, Trash2, XCircle } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useParams } from "react-router";
import { Alert } from "@/components/ui/alert.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Card } from "@/components/ui/card.tsx";
import { Field, Input, Select, Textarea } from "@/components/ui/field.tsx";
import { useAccountAssets } from "@/features/ads-builder/api.ts";
import { errorMessage } from "@/lib/errors.ts";
import { type AccountLists, type PublishOperationRow, saveDraftData, useAccountLists, useBuilderDraft, useBuilderPermissions, useDraftAccount, usePublishDraft, useLeadForms, usePublishHistory, useValidateDraft } from "./api.ts";
import { confirmar } from "@/lib/confirmStore.ts";
import { DrivePicker } from "./DrivePicker.tsx";
import { TargetingPicker } from "./TargetingPicker.tsx";
import { IgPostPicker } from "./IgPostPicker.tsx";
import { SaveTemplateModal } from "./Templates.tsx";
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

function AdForm({ ad, adAccountId, destination, pages, instas, disabled, onChange, onRemove }: {
  adAccountId: string | null | undefined; ad: DraftAd; destination: DraftAdSet["destinationType"]; pages: { id: string; name: string }[]; instas: { id: string; name: string }[]; disabled: boolean; onChange: (a: DraftAd) => void; onRemove: () => void;
}) {
  const set = (p: Partial<DraftAd>) => onChange({ ...ad, ...p });
  const [picker, setPicker] = useState(false);
  const website = leadsToWebsite(destination);
  const existing = usesExistingPost(destination);
  const [postPicker, setPostPicker] = useState(false);
  const forms = useLeadForms(adAccountId, ad.pageId, destination === "ON_AD");
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
        {website && !existing && (<Field label="Botão (CTA)">
          {(id) => (
            <Select id={id} value={ad.cta} disabled={disabled} onChange={(e) => set({ cta: e.target.value as DraftAd["cta"] })}>
              <option value="">Escolha...</option>
              {AD_CTAS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </Select>
          )}
        </Field>)}
        <Field label="Página do Facebook" hint={pages.length ? "Páginas da conta, lidas do Meta." : "Nenhuma página guardada para esta conta: digite o ID."}>
          {(id) => pages.length ? (
            <Select id={id} value={ad.pageId} disabled={disabled} onChange={(e) => set({ pageId: e.target.value })}>
              <option value="">Escolha...</option>
              {pages.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          ) : <Input id={id} value={ad.pageId} disabled={disabled} maxLength={40} onChange={(e) => set({ pageId: e.target.value })} />}
        </Field>
        <Field label={existing ? "Perfil do Instagram" : "Perfil do Instagram (opcional)"}>
          {(id) => instas.length ? (
            <Select id={id} value={ad.instagramId} disabled={disabled} onChange={(e) => set({ instagramId: e.target.value })}>
              <option value="">{existing ? "Escolha..." : "Sem Instagram"}</option>
              {instas.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          ) : <Input id={id} value={ad.instagramId} disabled={disabled} maxLength={40} onChange={(e) => set({ instagramId: e.target.value })} />}
        </Field>
      </div>
      {!existing && (<>
      <Field label="Texto principal">{(id) => <Textarea id={id} rows={3} value={ad.primaryText} disabled={disabled} maxLength={2000} onChange={(e) => set({ primaryText: e.target.value })} />}</Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Título">{(id) => <Input id={id} value={ad.headline} disabled={disabled} maxLength={200} onChange={(e) => set({ headline: e.target.value })} />}</Field>
        <Field label="Descrição">{(id) => <Input id={id} value={ad.description} disabled={disabled} maxLength={400} onChange={(e) => set({ description: e.target.value })} />}</Field>
      </div>
      </>)}
      {website && !existing && <Field label="Link de destino" hint="Precisa começar com https://">{(id) => <Input id={id} type="url" value={ad.link} disabled={disabled} maxLength={2000} placeholder="https://" onChange={(e) => set({ link: e.target.value })} />}</Field>}
      {destination && destination !== "WEBSITE" && destination !== "ON_AD" && !existing && (
        <p className="rounded-xl bg-white p-2.5 text-xs text-slate-600 ring-1 ring-slate-200" data-testid="cb-destino-mensagem">
          O botão e o destino ({DESTINATION_LABELS[destination]}) o Meta monta sozinho, como no Gerenciador de Anúncios. Não precisa de link.
        </p>
      )}
      {destination === "ON_AD" && (
        <Field label="ID do formulário de cadastro" hint={forms.isError ? errorMessage(forms.error) : "O formulário (de leads) que você já criou na página. O botão e o link o Meta monta."}>
          {(id) => forms.data?.length ? (
            <Select id={id} value={ad.leadFormId} disabled={disabled} onChange={(e) => set({ leadFormId: e.target.value })}>
              <option value="">Escolha...</option>
              {forms.data.map((f) => <option key={f.id} value={f.id}>{f.name}{f.status && f.status !== "ACTIVE" ? ` (${f.status.toLowerCase()})` : ""}</option>)}
            </Select>
          ) : <Input id={id} inputMode="numeric" value={ad.leadFormId} disabled={disabled} maxLength={30} onChange={(e) => set({ leadFormId: e.target.value.replace(/\D/g, "") })} />}
        </Field>
      )}
      {!existing && (
      <div className="space-y-2" data-testid="cb-imagem">
        <p className="text-sm font-medium text-slate-700">Imagem ou vídeo do anúncio</p>
        {ad.driveFileId ? (
          <div className="flex flex-wrap items-center gap-2 rounded-xl bg-white p-2.5 ring-1 ring-slate-200">
            <ImageIcon className="size-4 text-slate-500" aria-hidden />
            <span className="min-w-0 flex-1 truncate text-sm" data-testid="cb-drive-arquivo">{ad.driveFileName || (ad.driveKind === "video" ? "Vídeo do Drive" : "Imagem do Drive")}</span>
            <Button variant="secondary" className="px-3 py-1.5 text-xs" disabled={disabled} onClick={() => setPicker(true)}>Trocar</Button>
            <Button variant="ghost" className="px-3 py-1.5 text-xs" disabled={disabled} onClick={() => set({ driveFileId: "", driveFileName: "", driveKind: "image" })}>Remover</Button>
          </div>
        ) : (
          <>
            <Button variant="secondary" disabled={disabled} onClick={() => setPicker(true)} data-testid="cb-drive-escolher"><ImageIcon className="size-4" aria-hidden /> Escolher do Google Drive</Button>
            <Field label="ou o endereço da imagem" hint="Alternativa: endereço https:// de uma imagem já publicada.">
              {(id) => <Input id={id} type="url" value={ad.imageUrl} disabled={disabled} maxLength={2000} placeholder="https://" onChange={(e) => set({ imageUrl: e.target.value })} />}
            </Field>
          </>
        )}
        <DrivePicker open={picker} onClose={() => setPicker(false)} onPick={(f) => set({ driveFileId: f.id, driveFileName: f.name, driveKind: f.kind, imageUrl: "" })} />
      </div>
      )}
      {existing && (
        <div className="space-y-2" data-testid="cb-post-instagram">
          <p className="text-sm font-medium text-slate-700">Post do Instagram</p>
          <p className="text-xs text-slate-500">A imagem ou o vídeo, o texto e o botão vêm do próprio post. {destination === "INSTAGRAM_PROFILE" ? "O botão leva ao perfil do Instagram." : "O Meta conta curtidas, comentários e compartilhamentos do post."}</p>
          <div className="flex flex-wrap items-center gap-2 rounded-xl bg-white p-2.5 ring-1 ring-slate-200">
            <span className="min-w-0 flex-1 truncate text-sm" data-testid="cb-post-escolhido">{ad.igMediaId ? (ad.igMediaLabel || `Post ${ad.igMediaId}`) : "Nenhum post escolhido"}</span>
            <Button variant="secondary" className="px-3 py-1.5 text-xs" disabled={disabled || !ad.instagramId} onClick={() => setPostPicker(true)} data-testid="cb-post-escolher">{ad.igMediaId ? "Trocar" : "Escolher post"}</Button>
          </div>
          {!ad.instagramId && <p className="text-xs text-slate-500">Escolha antes o perfil do Instagram.</p>}
          <IgPostPicker open={postPicker} adAccountId={adAccountId} igUserId={ad.instagramId} onClose={() => setPostPicker(false)} onPick={(m) => set({ igMediaId: m.id, igMediaLabel: m.caption || `Post de ${m.date.slice(0, 10)}` })} />
        </div>
      )}
    </div>
  );
}

function AdSetCard({ adAccountId, draft, set, disabled, pages, instas, currency, lists, onChange, onDuplicate, onRemove, onAddAd, onAdChange, onAdRemove }: {
  adAccountId: string | null | undefined; draft: CampaignDraft; set: DraftAdSet; disabled: boolean; pages: { id: string; name: string }[]; instas: { id: string; name: string }[]; currency: string; lists: AccountLists | undefined;
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
            <Select id={id} value={set.optimizationGoal} disabled={disabled || !objective} onChange={(e) => onChange(applyGoal(set, e.target.value as DraftAdSet["optimizationGoal"], objective))}>
              <option value="">Escolha...</option>
              {goals.map((g) => <option key={g} value={g}>{GOAL_LABELS[g]}{PUBLISH_UNSUPPORTED_GOALS.includes(g) ? " (ainda não publica)" : ""}</option>)}
            </Select>
          )}
        </Field>
        {destinationsFor(set.optimizationGoal, objective).length > 0 && (
          <Field label="Onde as pessoas continuam" hint="As opções são as do Meta para essa meta.">
            {(id) => (
              <Select id={id} value={set.destinationType} disabled={disabled} onChange={(e) => patch({ destinationType: e.target.value as DraftAdSet["destinationType"] })}>
                <option value="">Escolha...</option>
                {destinationsFor(set.optimizationGoal, objective).map((d) => <option key={d} value={d}>{DESTINATION_LABELS[d]}</option>)}
              </Select>
            )}
          </Field>
        )}
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
        <TargetingPicker adAccountId={adAccountId} kind="city" title="Cidades (opcional)" hint="Digite uma cidade e clique em Buscar" disabled={disabled} max={MAX_CITIES}
          picked={set.cities.map((c) => ({ id: c.key, label: c.name }))}
          onAdd={(h) => patch({ cities: [...set.cities, { key: h.id, name: h.detail ? `${h.label} (${h.detail})` : h.label, radius: CITY_RADIUS_MIN }] })}
          onRemove={(key) => patch({ cities: set.cities.filter((c) => c.key !== key) })}
          renderPicked={(key) => (
            <input type="number" min={CITY_RADIUS_MIN} max={CITY_RADIUS_MAX} disabled={disabled} aria-label="Raio em km" title="Raio em km" className="w-12 rounded bg-white px-1 text-xs"
              value={set.cities.find((c) => c.key === key)?.radius ?? CITY_RADIUS_MIN}
              onChange={(e) => patch({ cities: set.cities.map((c) => (c.key === key ? { ...c, radius: Math.min(CITY_RADIUS_MAX, Math.max(CITY_RADIUS_MIN, Math.round(Number(e.target.value) || CITY_RADIUS_MIN))) } : c)) })} />
          )} />
        {set.cities.length > 0 && <p className="text-xs text-slate-500">Com cidades escolhidas, vale só o raio (em km, de {CITY_RADIUS_MIN} a {CITY_RADIUS_MAX}) em volta delas; o país sozinho não é usado.</p>}
        <TargetingPicker adAccountId={adAccountId} kind="interest" title="Interesses (opcional)" hint="Digite um interesse e clique em Buscar" disabled={disabled} max={MAX_INTERESTS}
          picked={set.interests.map((i) => ({ id: i.id, label: i.name }))}
          onAdd={(h) => patch({ interests: [...set.interests, { id: h.id, name: h.label }] })}
          onRemove={(iid) => patch({ interests: set.interests.filter((i) => i.id !== iid) })} />
        <label className="flex items-start gap-2 text-sm" data-testid="cb-advantage">
          <input type="checkbox" className="mt-0.5" disabled={disabled} checked={set.advantageAudience} onChange={(e) => patch({ advantageAudience: e.target.checked })} />
          <span><span className="font-medium text-slate-700">Público Advantage+</span><br /><span className="text-xs text-slate-500">O Meta pode ampliar o público além do que você definiu. Desligado por padrão: o público fica como você escolheu.</span></span>
        </label>
        <p className="text-xs text-slate-500">Posicionamentos: automáticos (o Meta escolhe).</p>
      </div>
      <div className="space-y-3">
        {ads.map((a) => <AdForm key={a.id} adAccountId={adAccountId} ad={a} destination={set.destinationType} pages={pages} instas={instas} disabled={disabled} onChange={onAdChange} onRemove={() => onAdRemove(a.id)} />)}
        <Button variant="secondary" disabled={disabled} onClick={onAddAd}><Plus className="size-4" aria-hidden /> Adicionar anúncio</Button>
      </div>
    </div>
  );
}

/** Resultado da leitura de volta no Meta: o que ficou ligado de verdade. */
export function AutomationsBadge({ check }: { check: NonNullable<PublishOperationRow["publish_items"][number]["automations_check"]> }) {
  if (check.kind === "criativo") {
    return check.ligadas.length === 0
      ? <span className="block text-emerald-700" data-testid="cb-automacoes-ok">Automações do criativo: todas desligadas (lido no Meta).</span>
      : <span className="block text-amber-700" data-testid="cb-automacoes-ligadas">O Meta deixou ligado: {check.ligadas.map(featureLabel).join(", ")}. Desligue no Gerenciador antes de ativar.</span>;
  }
  const problems = [check.advantageAudience ? "Público Advantage+ ligado" : "", check.placements === "automatic" ? "posicionamentos automáticos" : ""].filter(Boolean);
  return problems.length === 0
    ? <span className="block text-emerald-700" data-testid="cb-automacoes-ok">Conjunto: público como você definiu e posicionamentos escolhidos (lido no Meta).</span>
    : <span className="block text-amber-700" data-testid="cb-automacoes-ligadas">Conjunto: {problems.join(" e ")} (lido no Meta).</span>;
}

/** Painel "Configurações automáticas do Meta": tudo desligado por padrão. */
function ControlPanel({ draft, disabled, onChange }: { draft: CampaignDraft; disabled: boolean; onChange: (d: CampaignDraft) => void }) {
  const ctl = draft.campaign.control;
  const set = (p: Partial<typeof ctl>) => onChange({ ...draft, campaign: { ...draft.campaign, control: { ...ctl, ...p } } });
  const problem = urlTagsProblem(ctl.urlTags);
  const row = (id: string, checked: boolean, label: string, hint: string, onToggle: (v: boolean) => void) => (
    <label className="flex items-start gap-2 text-sm" data-testid={id}>
      <input type="checkbox" className="mt-0.5" disabled={disabled} checked={checked} onChange={(e) => onToggle(e.target.checked)} />
      <span><span className="font-medium text-slate-700">{label}</span><br /><span className="text-xs text-slate-500">{hint}</span></span>
    </label>
  );
  return (
    <fieldset className="space-y-3 rounded-xl bg-slate-50 p-3" data-testid="cb-controle">
      <legend className="flex items-center gap-1.5 px-1 text-sm font-semibold text-slate-800"><ShieldCheck className="size-4 text-brand-600" aria-hidden /> Configurações automáticas do Meta</legend>
      <p className="text-xs text-slate-500">Tudo vem <strong>desligado</strong>: o Meta só faz o que você escolheu. Depois de publicar, o CRM lê de volta no Meta e mostra se algo ficou ligado.</p>
      {row("cb-ctl-melhorias", ctl.enhancements, "Deixar o Meta aplicar melhorias automáticas", "Retoque de imagem, corte e descorte de vídeo, comentários em destaque, ajuste de texto, música, tradução e outras (84 no total).", (v) => set({ enhancements: v }))}
      {row("cb-ctl-multi", ctl.multiAdvertiser, "Deixar aparecer junto de anúncios de outros anunciantes", "Anúncios de vários anunciantes, que o Meta mostra em sequência.", (v) => set({ multiAdvertiser: v }))}
      {row("cb-ctl-posicionamentos", ctl.placements === "automatic", "Posicionamentos automáticos", `Desligado = só ${MANUAL_PLACEMENTS.facebook_positions.length + MANUAL_PLACEMENTS.instagram_positions.length} lugares: Feed, Stories e Reels do Facebook; Feed, Stories, Reels e Explorar do Instagram. Sem Audience Network, Messenger e Threads.`, (v) => set({ placements: v ? "automatic" : "manual" }))}
      <Field label="Parâmetros de rastreio (UTM) — opcional" hint={problem ?? "Vão no link de todos os anúncios. Ex.: utm_source=meta&utm_campaign={{campaign.name}}"}>
        {(id) => (
          <div className="flex gap-2">
            <Input id={id} value={ctl.urlTags} disabled={disabled} maxLength={500} placeholder="utm_source=meta&utm_medium=paid" onChange={(e) => set({ urlTags: e.target.value.trim() })} />
            {!ctl.urlTags && <Button variant="secondary" className="shrink-0 text-xs" disabled={disabled} onClick={() => set({ urlTags: SUGGESTED_URL_TAGS })}>Usar sugestão</Button>}
          </div>
        )}
      </Field>
    </fieldset>
  );
}

const OP_LABEL: Record<PublishOperationRow["status"], string> = { processando: "Em andamento", concluida: "Publicada (pausada)", parcial: "Publicada em parte", falhou: "Não publicou" };
const KIND_LABEL = { campanha: "Campanha", conjunto: "Conjunto", criativo: "Criativo", anuncio: "Anúncio" } as const;

function PublishPanel({ draftId, draft, canPublish, accountName, accountExternalId, flush, disabled }: {
  draftId: string; draft: CampaignDraft; canPublish: boolean; accountName: string; accountExternalId: string | null; flush: () => Promise<void>; disabled: boolean;
}) {
  const history = usePublishHistory(draftId);
  const publish = usePublishDraft();
  const key = useRef<string | null>(null);
  const blockers = useMemo(() => checkPublishable(draft), [draft]);
  const last = history.data?.[0];
  const already = last && (last.status === "concluida" || last.status === "parcial");
  const counts = publishCounts(draft);
  const campaignId = last?.publish_items.find((i) => i.kind === "campanha")?.meta_id;

  async function run() {
    const resume = `1 campanha, ${counts.adSets} conjunto(s) e ${counts.ads} anúncio(s) na conta "${accountName}"`;
    if (!(await confirmar(`Será criado no Meta: ${resume}. Tudo sai PAUSADO: nada gasta verba até você ativar no Gerenciador de Anúncios. Publicar agora?`))) return;
    if (!(await confirmar("Você tem certeza? Isso cria itens de verdade na conta de anúncios do cliente."))) return;
    await flush();
    key.current ??= (globalThis.crypto?.randomUUID?.() ?? `op-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    publish.mutate({ draftId, operationKey: key.current }, {
      onSuccess: () => { key.current = null; toast.success("Publicação feita no Meta. Tudo ficou pausado."); },
      onError: (e) => toast.error(errorMessage(e)),
    });
  }

  return (
    <div className="space-y-2 border-t border-slate-100 pt-3" data-testid="cb-publicar">
      {canPublish && !already && (
        <>
          <Button className="w-full" loading={publish.isPending} disabled={disabled || blockers.length > 0 || !accountExternalId} onClick={() => void run()}>
            <Rocket className="size-4" aria-hidden /> Publicar no Meta (pausado)
          </Button>
          <p className="text-xs text-slate-500">Cria a campanha, os conjuntos e os anúncios <strong>pausados</strong>. Só publica o que a Conferência aceita.</p>
          {blockers.length > 0 && (
            <ul className="space-y-1 text-xs text-amber-800" data-testid="cb-publicar-bloqueios">
              {blockers.slice(0, 4).map((b, i) => <li key={i}>• {b.message}</li>)}
              {blockers.length > 4 && <li>• e mais {blockers.length - 4}...</li>}
            </ul>
          )}
        </>
      )}
      {!canPublish && <p className="text-xs text-slate-500">Você não tem permissão para publicar. Peça ao administrador.</p>}
      {last && (
        <div className="space-y-1.5 rounded-xl bg-slate-50 p-3 text-xs" data-testid="cb-publicacao">
          <p className="font-semibold text-slate-800" data-testid="cb-publicacao-status">{OP_LABEL[last.status]}</p>
          {last.error_message && <p className="text-red-700">{last.error_message}</p>}
          <ul className="space-y-1">
            {last.publish_items.map((i) => (
              <li key={i.position} className="flex gap-1.5" data-status={i.status}>
                {i.status === "criado" ? <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-emerald-600" aria-hidden /> : i.status === "falhou" ? <XCircle className="mt-0.5 size-3.5 shrink-0 text-red-600" aria-hidden /> : <span className="mt-0.5 size-3.5 shrink-0 text-center text-slate-400" aria-hidden>·</span>}
                <span className="min-w-0 flex-1">
                  <span className="text-slate-700">{KIND_LABEL[i.kind]}: {i.name || "—"}</span>
                  {i.status === "criado" && <span className="text-slate-400"> · {i.confirmed ? "confirmado no Meta" : "não confirmado"}{i.effective_status ? ` (${i.effective_status})` : ""}</span>}
                  {i.status === "criado" && i.automations_check && <AutomationsBadge check={i.automations_check} />}
                  {i.status === "falhou" && <span className="block text-red-700">{i.error_message}</span>}
                  {i.status === "pulado" && <span className="text-slate-400"> · não criado (parou antes)</span>}
                </span>
              </li>
            ))}
          </ul>
          {campaignId && accountExternalId && (
            <a className="inline-flex items-center gap-1 font-medium text-brand-700 hover:underline" target="_blank" rel="noreferrer"
              href={`https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=${accountExternalId.replace(/^act_/, "")}&selected_campaign_ids=${campaignId}`}>
              <ExternalLink className="size-3.5" aria-hidden /> Abrir no Gerenciador de Anúncios
            </a>
          )}
          {last.status === "parcial" && <p className="text-slate-600">O que foi criado está pausado. Confira no Gerenciador; para tentar de novo, duplique o rascunho.</p>}
        </div>
      )}
    </div>
  );
}

function ChecklistPanel({ items, validate, publish }: { items: CheckItem[]; validate?: ReactNode; publish?: ReactNode }) {
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
      {publish}
      <p className="border-t border-slate-100 pt-2 text-xs text-slate-500">
        As regras de combinação seguem o catálogo da API {CATALOG_VERSION}. O <strong>Validar com o Meta</strong> confere só a campanha; os conjuntos e os anúncios o Meta confere na hora de publicar. Validar não cria nada; Publicar cria tudo pausado.
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
  const [saveTemplate, setSaveTemplate] = useState(false);

  useEffect(() => {
    if (!loaded.data || draft || isEsteira(loaded.data.data)) return;
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
  // Esteira de criativos tem o seu próprio editor: nunca abrir (e salvar por cima) aqui.
  if (loaded.data && isEsteira(loaded.data.data)) return <Navigate to={`/criar/esteira/${id}`} replace />;
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
          {perms.data?.criar && <Button variant="ghost" onClick={() => setSaveTemplate(true)} data-testid="cb-salvar-modelo">Salvar como modelo</Button>}
        </div>
      </div>

      {!canEdit && <Alert tone="info">Você pode ver este rascunho, mas não tem permissão para editar.</Alert>}
      {saveTemplate && <SaveTemplateModal open={saveTemplate} draft={draft} defaultName={name} onClose={() => setSaveTemplate(false)} />}
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
            <ControlPanel draft={draft} disabled={disabled} onChange={change} />
          </Section>

          <Section n={2} title="Conjuntos e anúncios" hint="Cada conjunto tem o seu público, e cada conjunto tem os seus anúncios.">
            {draft.adSets.map((s) => (
              <AdSetCard
                key={s.id}
                adAccountId={loaded.data?.ad_account_id}
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
          ) : undefined} publish={id ? <PublishPanel draftId={id} draft={draft} canPublish={perms.data?.publicar === true} accountName={account.data?.name ?? "da conta"} accountExternalId={account.data?.external_id ?? null} flush={flush} disabled={state === "conflito" || !canEdit} /> : undefined} />
          {accountLists.data && accountLists.data.failed.length > 0 && (
            <Alert tone="warning">Não consegui ler {accountLists.data.failed.map((f) => ({ pixels: "os pixels", customAudiences: "os públicos personalizados", savedAudiences: "os públicos salvos" })[f]).join(", ")} da conta no Meta. Confira as permissões do token.</Alert>
          )}
        </aside>
      </div>
    </div>
  );
}
