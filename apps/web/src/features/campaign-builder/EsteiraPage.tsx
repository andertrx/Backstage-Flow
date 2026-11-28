import {
  AD_CTAS, applyPrepared, checkEsteira, checkSummary, type EsteiraDraft, type EsteiraItem, type EsteiraMedia, esteiraPublishBlockers, esteiraSupported,
  esteiraToWebsite, ESTEIRA_MAX_ITEMS, filledTexts, isEsteira, mediaToPrepare, newEsteiraItem, normalizeEsteira, pairDriveFiles,
  type ProposedItem, SUGGESTED_URL_TAGS, toMedia, urlTagsProblem, type AdCta, applyCopySet, copySetFromEsteira,
} from "@backstage/shared";
import { AlertTriangle, ArrowLeft, ArrowLeftRight, CheckCircle2, CloudUpload, ExternalLink, Film, Folder, Image as ImageIcon, Plus, Rocket, ShieldCheck, Trash2, Wand2, XCircle } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useParams } from "react-router";
import { Alert } from "@/components/ui/alert.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Card } from "@/components/ui/card.tsx";
import { Field, Input, Select } from "@/components/ui/field.tsx";
import { useAccountAssets } from "@/features/ads-builder/api.ts";
import { confirmar } from "@/lib/confirmStore.ts";
import { errorMessage } from "@/lib/errors.ts";
import { toast } from "@/lib/toastStore.ts";
import {
  type AdSetInfo, prepareMedia, videoUploadStep, saveDraftData, useAccountAdSets, useAdSetAds, useAdSetInfo, useAdTemplate, useBuilderDraft, useBuilderPermissions,
  useCopySets, useDraftAccount, useDriveList, useDriveThumb, usePublishDraft, usePublishHistory,
} from "./api.ts";
import { AutomationsBadge } from "./DraftEditorPage.tsx";
import { ApproachMessages, CopySetModal, TextList } from "./CopySets.tsx";

type SaveState = "salvo" | "salvando" | "pendente" | "erro" | "conflito";
const DEST_LABEL: Record<string, string> = { WHATSAPP: "WhatsApp", MESSENGER: "Messenger", INSTAGRAM_DIRECT: "Direct do Instagram", WEBSITE: "Site", "": "Site" };

function Section({ n, title, hint, children }: { n: number; title: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <Card className="space-y-4 p-4 sm:p-5" data-testid={`es-secao-${n}`}>
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

function MediaChip({ m, slot }: { m: EsteiraMedia | null; slot: string }) {
  const thumb = useDriveThumb(m?.fileId ?? null);
  const ready = m && (m.kind === "video" ? !!m.metaVideoId : !!m.metaHash);
  return (
    <div className="flex min-w-0 items-center gap-2 rounded-xl bg-white p-2 ring-1 ring-slate-200" data-testid={`es-midia-${slot === "Vertical" ? "vertical" : "feed"}`}>
      {thumb.data ? <img src={thumb.data} alt="" className="size-12 shrink-0 rounded-lg object-cover" /> : <div className="grid size-12 shrink-0 place-items-center rounded-lg bg-slate-50 text-slate-300">{m?.kind === "video" ? <Film className="size-5" aria-hidden /> : <ImageIcon className="size-5" aria-hidden />}</div>}
      <div className="min-w-0">
        <p className="text-xs font-semibold text-slate-500">{slot}{slot === "Vertical" ? " (Stories e Reels)" : " (Feed e demais)"}</p>
        <p className="truncate text-sm text-slate-800">{m ? m.name : "—"}</p>
        {m && <p className={`text-xs ${ready ? "text-emerald-700" : "text-slate-400"}`}>{ready ? "Enviado ao Meta" : "Ainda não enviado ao Meta"}</p>}
      </div>
    </div>
  );
}

function ItemCard({ item, disabled, onChange, onRemove }: { item: EsteiraItem; disabled: boolean; onChange: (i: EsteiraItem) => void; onRemove: () => void }) {
  const set = (p: Partial<EsteiraItem>) => onChange({ ...item, ...p });
  return (
    <div className="space-y-3 rounded-xl bg-slate-50 p-3" data-testid="es-criativo">
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-0 flex-1"><Field label="Nome do anúncio">{(id) => <Input id={id} value={item.name} disabled={disabled} maxLength={200} onChange={(e) => set({ name: e.target.value })} />}</Field></div>
        <Button variant="ghost" className="text-xs" disabled={disabled} onClick={onRemove} aria-label={`Remover criativo ${item.name}`}><Trash2 className="size-3.5" aria-hidden /> Remover</Button>
      </div>
      <div className="grid gap-2 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
        <MediaChip m={item.feed} slot="Feed" />
        <Button variant="ghost" className="justify-self-center px-2" disabled={disabled} aria-label="Inverter Feed e vertical" onClick={() => set({ feed: item.vertical, vertical: item.feed })}><ArrowLeftRight className="size-4" aria-hidden /></Button>
        <MediaChip m={item.vertical} slot="Vertical" />
      </div>
      <TextList label="Texto principal" testid="es-textos" rows={3} max={2000} values={item.bodies} disabled={disabled} onChange={(bodies) => set({ bodies })} />
      <TextList label="Título" testid="es-titulos" max={255} values={item.titles} disabled={disabled} onChange={(titles) => set({ titles })} />
      <Field label="Descrição (opcional)">{(id) => <Input id={id} value={item.description} disabled={disabled} maxLength={400} onChange={(e) => set({ description: e.target.value })} />}</Field>
    </div>
  );
}

/** Lê a pasta do Drive e propõe os criativos (pares vertical + Feed pelo formato real do arquivo). */
function DriveSection({ disabled, onAdd }: { disabled: boolean; onAdd: (p: ProposedItem[]) => void }) {
  const list = useDriveList();
  const [link, setLink] = useState("");
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const proposals = useMemo(() => {
    if (!list.data) return [];
    const files = [...list.data.images.map((f) => ({ ...f, kind: "image" as const })), ...(list.data.videos ?? []).map((f) => ({ ...f, kind: "video" as const }))]
      .map((f) => ({ id: f.id, name: f.name, kind: f.kind, width: f.width ?? null, height: f.height ?? null }));
    return pairDriveFiles(files);
  }, [list.data]);
  useEffect(() => setPicked(new Set(proposals.map((_, i) => i))), [proposals]);
  const open = (ref: string) => list.mutate(ref);
  return (
    <div className="space-y-3" data-testid="es-drive">
      <div className="flex flex-wrap items-end gap-2">
        <label className="min-w-0 flex-1 space-y-1 text-xs font-medium text-slate-600">
          Link da pasta do Drive (compartilhada com o CRM)
          <Input aria-label="Link da pasta do Drive" value={link} disabled={disabled} placeholder="https://drive.google.com/drive/folders/..." onChange={(e) => setLink(e.target.value)} />
        </label>
        <Button loading={list.isPending} disabled={disabled || !link.trim()} onClick={() => open(link.trim())}>Ler pasta</Button>
      </div>
      {list.error && <Alert tone="error">{errorMessage(list.error)}</Alert>}
      {list.data && (
        <div className="space-y-2">
          <p className="text-xs text-slate-500">Pasta: <strong>{list.data.folder.name}</strong>. Vertical (9:16) vai para Stories e Reels; quadrado ou 4:5 para o Feed. Arquivos com o mesmo nome viram um criativo só.</p>
          {list.data.folders.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {list.data.folders.map((f) => <Button key={f.id} variant="secondary" className="px-2.5 py-1 text-xs" onClick={() => open(f.id)}><Folder className="size-3.5 text-amber-600" aria-hidden /> {f.name}</Button>)}
            </div>
          )}
          {proposals.length === 0 ? <p className="text-sm text-slate-500">Nenhuma imagem (JPG/PNG) ou vídeo (MP4/MOV) nesta pasta.</p> : (
            <ul className="space-y-1 rounded-xl bg-slate-50 p-2" data-testid="es-propostas">
              {proposals.map((p, i) => (
                <li key={i}>
                  <label className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-white">
                    <input type="checkbox" checked={picked.has(i)} onChange={(e) => setPicked((s) => { const n = new Set(s); if (e.target.checked) n.add(i); else n.delete(i); return n; })} />
                    <span className="min-w-0 flex-1 truncate font-medium">{p.name}</span>
                    <span className={`text-xs ${p.paired ? "text-emerald-700" : "text-slate-500"}`}>{p.paired ? "Feed + vertical" : p.vertical ? "só vertical (sem par)" : "só Feed (sem par)"}</span>
                  </label>
                </li>
              ))}
            </ul>
          )}
          {proposals.length > 0 && (
            <Button disabled={disabled || picked.size === 0} onClick={() => { onAdd(proposals.filter((_, i) => picked.has(i))); list.reset(); setLink(""); }} data-testid="es-adicionar">
              <Plus className="size-4" aria-hidden /> Adicionar {picked.size} criativo(s)
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

const mb = (n: number) => `${(n / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;

const OP_LABEL = { processando: "Em andamento", concluida: "Criativos criados (pausados)", parcial: "Criados em parte", falhou: "Não subiu" } as const;

function PublishBox({ draftId, draft, accountName, accountExternalId, canPublish, disabled, flush, onPrepared }: {
  draftId: string; draft: EsteiraDraft; accountName: string; accountExternalId: string | null; canPublish: boolean; disabled: boolean; flush: () => Promise<void>;
  onPrepared: (fileId: string, r: { videoId?: string; thumbnail?: string; hash?: string }) => void;
}) {
  const history = usePublishHistory(draftId);
  const publish = usePublishDraft();
  const key = useRef<string | null>(null);
  const [sending, setSending] = useState<{ done: number; total: number; name: string; pct: number | null; note: string } | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const pending = mediaToPrepare(draft);
  const blockers = esteiraPublishBlockers(draft);
  const last = history.data?.[0];
  const already = last && (last.status === "concluida" || last.status === "parcial");

  async function sendFiles() {
    setSendError(null);
    await flush();
    const list = [...pending];
    outer: for (let i = 0; i < list.length; i++) {
      const f = list[i];
      setSending({ done: i, total: list.length, name: f.name, pct: null, note: "" });
      try {
        if (f.kind !== "video") {
          const r = await prepareMedia(draftId, f.fileId);
          if (r.kind === "image") onPrepared(f.fileId, { hash: r.hash });
          continue;
        }
        // Vídeo: envio em partes. Cada chamada avança um pouco; se a página fechar, a próxima continua de onde parou.
        for (let step = 0; step < 400; step++) {
          const r = await videoUploadStep(draftId, f.fileId);
          if (r.status === "pronto" && r.videoId && r.thumbnail) { onPrepared(f.fileId, { videoId: r.videoId, thumbnail: r.thumbnail }); continue outer; }
          if (r.status === "falhou" || r.error) { setSendError(`"${f.name}": ${r.error ?? "o Meta não aceitou o vídeo."} Clique de novo para continuar de onde parou.`); break outer; }
          const pct = r.total ? Math.round((r.sent / r.total) * 100) : 0;
          setSending({ done: i, total: list.length, name: f.name, pct, note: r.status === "processando" ? "O Meta está processando o vídeo..." : `${mb(r.sent)} de ${mb(r.total)}` });
          if (r.status === "processando") await new Promise((res) => setTimeout(res, 4000));
        }
        setSendError(`"${f.name}": o envio está demorando mais que o normal. Clique de novo para continuar.`);
        break;
      } catch (e) {
        setSendError(`"${f.name}": ${errorMessage(e)}`);
        break;
      }
    }
    setSending(null);
  }

  async function run() {
    const n = draft.items.length;
    if (!(await confirmar(`Serão criados ${n} anúncio(s) PAUSADO(S) no conjunto "${draft.target?.adSetName}" da conta "${accountName}". O conjunto e a campanha não mudam. Subir agora?`))) return;
    await flush();
    key.current ??= (globalThis.crypto?.randomUUID?.() ?? `op-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    publish.mutate({ draftId, operationKey: key.current }, {
      onSuccess: () => { key.current = null; toast.success("Criativos criados no Meta. Tudo ficou pausado."); },
      onError: (e) => toast.error(errorMessage(e)),
    });
  }

  return (
    <div className="space-y-2 border-t border-slate-100 pt-3" data-testid="es-publicar">
      {canPublish && !already && (
        <>
          {pending.length > 0 && (
            <Button variant="secondary" className="w-full" loading={!!sending} disabled={disabled || !!sending} onClick={() => void sendFiles()} data-testid="es-enviar-arquivos">
              <CloudUpload className="size-4" aria-hidden /> Enviar {pending.length} arquivo(s) ao Meta
            </Button>
          )}
          {sending && (
            <div className="space-y-1 text-xs text-slate-600" role="status" data-testid="es-envio-andamento">
              <p>Enviando {sending.done + 1} de {sending.total}: {sending.name}{sending.note ? ` (${sending.note})` : ""}.</p>
              {sending.pct !== null && (
                <div className="h-1.5 overflow-hidden rounded-full bg-slate-100" aria-label={`${sending.pct}% enviado`}>
                  <div className="h-full rounded-full bg-blue-600 transition-[width] duration-300" style={{ width: `${sending.pct}%` }} data-testid="es-envio-barra" />
                </div>
              )}
              <p className="text-slate-400">Vídeos vão em partes: pode fechar a página, o envio continua de onde parou quando você voltar e clicar de novo.</p>
            </div>
          )}
          {sendError && <Alert tone="error">{sendError}</Alert>}
          <Button className="w-full" loading={publish.isPending} disabled={disabled || blockers.length > 0 || !accountExternalId || !!sending} onClick={() => void run()} data-testid="es-subir">
            <Rocket className="size-4" aria-hidden /> Subir criativos (pausados)
          </Button>
          <p className="text-xs text-slate-500">Cria cada criativo e o anúncio <strong>pausado</strong> no conjunto escolhido. Nada é ativado.</p>
          {blockers.length > 0 && (
            <ul className="space-y-1 text-xs text-amber-800" data-testid="es-bloqueios">
              {blockers.slice(0, 4).map((b, i) => <li key={i}>• {b.message}</li>)}
              {blockers.length > 4 && <li>• e mais {blockers.length - 4}...</li>}
            </ul>
          )}
        </>
      )}
      {!canPublish && <p className="text-xs text-slate-500">Você não tem permissão para publicar. Peça ao administrador.</p>}
      {last && (
        <div className="space-y-1.5 rounded-xl bg-slate-50 p-3 text-xs" data-testid="es-publicacao">
          <p className="font-semibold text-slate-800" data-testid="es-publicacao-status">{OP_LABEL[last.status]}</p>
          {last.error_message && <p className="text-red-700">{last.error_message}</p>}
          <ul className="space-y-1">
            {last.publish_items.map((i) => (
              <li key={i.position} className="flex gap-1.5" data-status={i.status}>
                {i.status === "criado" ? <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-emerald-600" aria-hidden /> : i.status === "falhou" ? <XCircle className="mt-0.5 size-3.5 shrink-0 text-red-600" aria-hidden /> : <span className="mt-0.5 size-3.5 shrink-0 text-center text-slate-400" aria-hidden>·</span>}
                <span className="min-w-0 flex-1">
                  <span className="text-slate-700">{i.kind === "criativo" ? "Criativo" : "Anúncio"}: {i.name || "—"}</span>
                  {i.status === "criado" && <span className="text-slate-400"> · {i.confirmed ? "confirmado no Meta" : "não confirmado"}{i.effective_status ? ` (${i.effective_status})` : ""}</span>}
                  {i.status === "criado" && i.automations_check && <AutomationsBadge check={i.automations_check} />}
                  {i.status === "falhou" && <span className="block text-red-700">{i.error_message}</span>}
                  {i.status === "pulado" && <span className="text-slate-400"> · não criado (parou antes)</span>}
                </span>
              </li>
            ))}
          </ul>
          {accountExternalId && draft.target && (
            <a className="inline-flex items-center gap-1 font-medium text-brand-700 hover:underline" target="_blank" rel="noreferrer"
              href={`https://adsmanager.facebook.com/adsmanager/manage/ads?act=${accountExternalId.replace(/^act_/, "")}&selected_adset_ids=${draft.target.adSetId}`}>
              <ExternalLink className="size-3.5" aria-hidden /> Abrir o conjunto no Gerenciador
            </a>
          )}
        </div>
      )}
    </div>
  );
}

export function EsteiraPage() {
  const { id } = useParams();
  const perms = useBuilderPermissions();
  const loaded = useBuilderDraft(id);
  const accountId = loaded.data?.ad_account_id ?? null;
  const account = useDraftAccount(accountId);
  const assets = useAccountAssets(accountId);
  const adSets = useAccountAdSets(accountId);
  const adSetInfo = useAdSetInfo();
  const template = useAdTemplate();
  const [info, setInfo] = useState<AdSetInfo | null>(null);
  const [name, setName] = useState("");
  const [draft, setDraft] = useState<EsteiraDraft | null>(null);
  const [state, setState] = useState<SaveState>("salvo");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [templateAd, setTemplateAd] = useState("");
  const [packId, setPackId] = useState("");
  const [savePack, setSavePack] = useState(false);
  const packs = useCopySets(loaded.data?.client_id);
  const pack = packs.data?.find((x) => x.id === packId) ?? null;
  const version = useRef(0);
  const dirty = useRef(false);
  const saving = useRef(false);
  const latest = useRef<{ name: string; draft: EsteiraDraft | null }>({ name: "", draft: null });
  const canEdit = perms.data?.editar === true;
  const selectedGroup = adSets.data?.find((s) => s.external_id === draft?.target?.adSetId);
  const ads = useAdSetAds(selectedGroup?.id);

  useEffect(() => {
    if (!loaded.data || draft || !isEsteira(loaded.data.data)) return;
    setName(loaded.data.name);
    setDraft(normalizeEsteira(loaded.data.data));
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
  useEffect(() => {
    if (!dirty.current || state === "conflito") return;
    const t = setTimeout(() => void flush(), 1200);
    return () => clearTimeout(t);
  });
  function change(next: EsteiraDraft) {
    if (!canEdit) return;
    dirty.current = true;
    setState("pendente");
    setDraft(next);
  }
  // Envio dos arquivos: cada resposta grava o código do Meta no rascunho mais recente (não no da hora do clique).
  function prepared(fileId: string, r: { videoId?: string; thumbnail?: string; hash?: string }) {
    const cur = latest.current.draft;
    if (!cur) return;
    const next = applyPrepared(cur, fileId, r);
    latest.current = { ...latest.current, draft: next };
    change(next);
  }

  const items = useMemo(() => (draft ? checkEsteira(draft) : []), [draft]);
  if (loaded.isLoading || perms.isLoading) return <p className="text-sm text-slate-500">Carregando...</p>;
  if (loaded.error) return <Alert tone="error">{errorMessage(loaded.error)}</Alert>;
  if (loaded.data && !isEsteira(loaded.data.data)) return <Navigate to={`/criar/campanhas/${id}`} replace />;
  if (!draft) return null;
  const disabled = !canEdit || state === "conflito";
  const pages = (assets.data ?? []).filter((a) => a.asset_type === "page").map((a) => ({ id: a.external_id, name: a.name ?? a.external_id }));
  const instas = (assets.data ?? []).filter((a) => a.asset_type === "instagram").map((a) => ({ id: a.external_id, name: a.name ?? a.external_id }));
  const dest = draft.target?.destinationType ?? "";
  const summary = checkSummary(items);

  async function chooseAdSet(externalId: string) {
    if (!draft || !accountId) return;
    if (!externalId) { setInfo(null); change({ ...draft, target: null }); return; }
    try {
      const r = await adSetInfo.mutateAsync({ adAccountId: accountId, adSetId: externalId });
      setInfo(r);
      setTemplateAd("");
      change({ ...draft, target: { adSetId: r.id, adSetName: r.name, campaignId: r.campaignId, campaignName: r.campaignName, destinationType: r.destinationType } });
    } catch { /* a mensagem aparece abaixo do campo */ }
  }

  async function copyTemplate() {
    if (!draft || !accountId || !templateAd) return;
    try {
      const t = await template.mutateAsync({ adAccountId: accountId, adId: templateAd });
      const ctas = AD_CTAS.map((c) => c.id) as string[];
      change({
        ...draft,
        pageId: t.pageId || draft.pageId, instagramId: t.instagramId || draft.instagramId,
        link: esteiraToWebsite(dest) ? (t.link || draft.link) : draft.link,
        cta: ctas.includes(t.cta) && esteiraToWebsite(dest) ? (t.cta as AdCta) : draft.cta,
        defaults: { bodies: t.bodies.length ? t.bodies : draft.defaults.bodies, titles: t.titles.length ? t.titles : draft.defaults.titles, description: t.description },
        control: t.urlTags && !urlTagsProblem(t.urlTags) ? { ...draft.control, urlTags: t.urlTags } : draft.control,
      });
      toast.success("Textos, página e Instagram copiados do anúncio-modelo. Confira em \"Textos padrão\".");
    } catch { /* mensagem abaixo */ }
  }

  function addProposals(list: ProposedItem[]) {
    if (!draft) return;
    const room = ESTEIRA_MAX_ITEMS - draft.items.length;
    const added = list.slice(0, Math.max(0, room)).map((p) => newEsteiraItem(draft, { name: p.name, feed: p.feed ? toMedia(p.feed) : null, vertical: p.vertical ? toMedia(p.vertical) : null }));
    if (list.length > room) toast.error(`A esteira aceita até ${ESTEIRA_MAX_ITEMS} criativos por vez; ${list.length - room} ficaram de fora.`);
    change({ ...draft, items: [...draft.items, ...added] });
  }

  async function applyDefaultsToAll() {
    if (!draft) return;
    if (!(await confirmar("Trocar os textos, títulos e a descrição de TODOS os criativos pelos textos padrão?"))) return;
    change({ ...draft, items: draft.items.map((i) => ({ ...i, bodies: [...draft.defaults.bodies], titles: [...draft.defaults.titles], description: draft.defaults.description })) });
  }

  const ctl = draft.control;
  const tagsProblem = urlTagsProblem(ctl.urlTags);
  const stateText: Record<SaveState, string> = { salvo: "Salvo", salvando: "Salvando...", pendente: "Alterações a salvar...", erro: "Não salvou", conflito: "Conflito" };

  return (
    <div className="space-y-6" data-testid="esteira">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link to="/criar/campanhas" className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900"><ArrowLeft className="size-4" aria-hidden /> Rascunhos</Link>
        <span className="text-xs text-slate-500" data-testid="es-estado" role="status">{canEdit ? stateText[state] : "Somente leitura"}</span>
      </div>
      <header>
        <h1 className="text-xl font-semibold">Subir criativos</h1>
        <p className="text-sm text-slate-500">Criativos novos num conjunto que já existe. Tudo sai pausado e com as automações do Meta desligadas.</p>
      </header>
      {!canEdit && <Alert tone="info">Você pode ver esta esteira, mas não tem permissão para editar.</Alert>}
      {saveError && <Alert tone="error">{saveError}{state === "conflito" && <> <button type="button" className="font-semibold underline" onClick={() => window.location.reload()}>Recarregar</button></>}</Alert>}

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <Section n={1} title="Onde" hint={account.data ? `Conta: ${account.data.name}` : undefined}>
            <Field label="Nome desta esteira">{(i) => <Input id={i} value={name} disabled={disabled} maxLength={120} onChange={(e) => { if (!canEdit) return; dirty.current = true; setState("pendente"); setName(e.target.value); }} />}</Field>
            <Field label="Conjunto que vai receber os criativos" hint={adSets.data && adSets.data.length === 0 ? "Nenhum conjunto sincronizado nesta conta ainda." : "Lista do que o CRM sincroniza do Meta. O conjunto e a campanha não são alterados."}>
              {(i) => (
                <Select id={i} value={draft.target?.adSetId ?? ""} disabled={disabled || adSetInfo.isPending} onChange={(e) => void chooseAdSet(e.target.value)}>
                  <option value="">Escolha o conjunto...</option>
                  {(adSets.data ?? []).map((s) => (
                    <option key={s.id} value={s.external_id}>{s.campaign?.name ?? "Campanha"} › {s.name}{s.effective_status && s.effective_status !== "ACTIVE" ? ` (${s.effective_status.toLowerCase()})` : ""}</option>
                  ))}
                </Select>
              )}
            </Field>
            {adSetInfo.isPending && <p className="text-xs text-slate-500">Lendo o conjunto no Meta...</p>}
            {adSetInfo.error && <Alert tone="error">{errorMessage(adSetInfo.error)}</Alert>}
            {draft.target && (
              <div className="space-y-1 rounded-xl bg-slate-50 p-3 text-sm" data-testid="es-conjunto">
                <p><span className="text-slate-500">Destino do conjunto:</span> <strong>{DEST_LABEL[dest] ?? dest}</strong>{!esteiraSupported(dest) && <span className="text-red-700"> (a esteira não sobe para esse destino)</span>}</p>
                {info?.check.kind === "conjunto" && (info.check.advantageAudience || info.check.placements === "automatic") && (
                  <p className="flex gap-1.5 text-xs text-amber-800" data-testid="es-conjunto-automacoes">
                    <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                    Este conjunto está com {[info.check.advantageAudience ? "Público Advantage+" : "", info.check.placements === "automatic" ? "posicionamentos automáticos" : ""].filter(Boolean).join(" e ")} no Meta. O CRM não mexe no conjunto: se quiser mudar, mude no Gerenciador.
                  </p>
                )}
              </div>
            )}
          </Section>

          <Section n={2} title="Textos padrão" hint="Entram em todo criativo novo. Dá para copiar de um anúncio que já roda nesse conjunto.">
            {draft.target && (
              <div className="flex flex-wrap items-end gap-2" data-testid="es-modelo">
                <div className="min-w-0 flex-1">
                  <Field label="Anúncio-modelo (opcional)">
                    {(i) => (
                      <Select id={i} value={templateAd} disabled={disabled} onChange={(e) => setTemplateAd(e.target.value)}>
                        <option value="">Escolha um anúncio deste conjunto...</option>
                        {(ads.data ?? []).map((a) => <option key={a.external_id} value={a.external_id}>{a.name}</option>)}
                      </Select>
                    )}
                  </Field>
                </div>
                <Button variant="secondary" loading={template.isPending} disabled={disabled || !templateAd} onClick={() => void copyTemplate()}><Wand2 className="size-4" aria-hidden /> Copiar textos</Button>
              </div>
            )}
            {template.error && <Alert tone="error">{errorMessage(template.error)}</Alert>}
            <div className="flex flex-wrap items-end gap-2" data-testid="es-pacote">
              <div className="min-w-0 flex-1">
                <Field label="Pacote da biblioteca (opcional)" hint={packs.data && packs.data.length === 0 ? "Nenhum pacote para este cliente. Crie em Criar campanhas → Biblioteca, ou salve os textos abaixo como pacote." : undefined}>
                  {(i) => (
                    <Select id={i} value={packId} disabled={disabled} onChange={(e) => setPackId(e.target.value)}>
                      <option value="">Escolha um pacote...</option>
                      {(packs.data ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </Select>
                  )}
                </Field>
              </div>
              <Button variant="secondary" disabled={disabled || !pack} onClick={() => { if (pack) { change(applyCopySet(draft, pack)); toast.success(`Textos do pacote "${pack.name}" aplicados aos textos padrão.`); } }} data-testid="es-usar-pacote">Usar pacote</Button>
              <Button variant="ghost" disabled={disabled} onClick={() => setSavePack(true)} data-testid="es-salvar-pacote">Salvar como pacote</Button>
            </div>
            {pack && <ApproachMessages messages={pack.messages} />}
            {loaded.data && <CopySetModal open={savePack} clientId={loaded.data.client_id} editing={null} initial={copySetFromEsteira(draft, "")} onClose={() => setSavePack(false)} onSaved={(nid) => setPackId(nid)} />}
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Página do Facebook">
                {(i) => pages.length ? (
                  <Select id={i} value={draft.pageId} disabled={disabled} onChange={(e) => change({ ...draft, pageId: e.target.value })}>
                    <option value="">Escolha...</option>
                    {pages.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    {draft.pageId && !pages.some((p) => p.id === draft.pageId) && <option value={draft.pageId}>Página {draft.pageId}</option>}
                  </Select>
                ) : <Input id={i} value={draft.pageId} disabled={disabled} maxLength={40} onChange={(e) => change({ ...draft, pageId: e.target.value.replace(/\D/g, "") })} />}
              </Field>
              <Field label="Perfil do Instagram">
                {(i) => instas.length ? (
                  <Select id={i} value={draft.instagramId} disabled={disabled} onChange={(e) => change({ ...draft, instagramId: e.target.value })}>
                    <option value="">Sem Instagram</option>
                    {instas.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    {draft.instagramId && !instas.some((p) => p.id === draft.instagramId) && <option value={draft.instagramId}>Instagram {draft.instagramId}</option>}
                  </Select>
                ) : <Input id={i} value={draft.instagramId} disabled={disabled} maxLength={40} onChange={(e) => change({ ...draft, instagramId: e.target.value.replace(/\D/g, "") })} />}
              </Field>
              {draft.target && esteiraToWebsite(dest) && (<>
                <Field label="Link de destino" hint="Precisa começar com https://">{(i) => <Input id={i} type="url" value={draft.link} disabled={disabled} maxLength={2000} placeholder="https://" onChange={(e) => change({ ...draft, link: e.target.value })} />}</Field>
                <Field label="Botão (CTA)">
                  {(i) => (
                    <Select id={i} value={draft.cta} disabled={disabled} onChange={(e) => change({ ...draft, cta: e.target.value as AdCta })}>
                      <option value="">Escolha...</option>
                      {AD_CTAS.filter((c) => c.id !== "NO_BUTTON").map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                    </Select>
                  )}
                </Field>
              </>)}
            </div>
            {draft.target && !esteiraToWebsite(dest) && <p className="text-xs text-slate-500">O botão e o link de {DEST_LABEL[dest] ?? dest} são montados como nos seus anúncios de hoje.</p>}
            <TextList label="Texto principal" testid="es-padrao-textos" rows={3} max={2000} values={draft.defaults.bodies} disabled={disabled} onChange={(bodies) => change({ ...draft, defaults: { ...draft.defaults, bodies } })} />
            <TextList label="Título" testid="es-padrao-titulos" max={255} values={draft.defaults.titles} disabled={disabled} onChange={(titles) => change({ ...draft, defaults: { ...draft.defaults, titles } })} />
            <Field label="Descrição (opcional)">{(i) => <Input id={i} value={draft.defaults.description} disabled={disabled} maxLength={400} onChange={(e) => change({ ...draft, defaults: { ...draft.defaults, description: e.target.value } })} />}</Field>
            <fieldset className="space-y-3 rounded-xl bg-slate-50 p-3" data-testid="es-controle">
              <legend className="flex items-center gap-1.5 px-1 text-sm font-semibold text-slate-800"><ShieldCheck className="size-4 text-brand-600" aria-hidden /> Configurações automáticas do Meta</legend>
              <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-0.5" disabled={disabled} checked={ctl.enhancements} onChange={(e) => change({ ...draft, control: { ...ctl, enhancements: e.target.checked } })} /><span><span className="font-medium text-slate-700">Deixar o Meta aplicar melhorias automáticas</span><br /><span className="text-xs text-slate-500">Desligado = nenhuma das 84 (comentários em destaque, corte de vídeo, música, tradução...).</span></span></label>
              <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-0.5" disabled={disabled} checked={ctl.multiAdvertiser} onChange={(e) => change({ ...draft, control: { ...ctl, multiAdvertiser: e.target.checked } })} /><span><span className="font-medium text-slate-700">Deixar aparecer junto de anúncios de outros anunciantes</span></span></label>
              <Field label="Parâmetros de rastreio (UTM) — opcional" hint={tagsProblem ?? "Vão no link de todos os anúncios."}>
                {(i) => (
                  <div className="flex gap-2">
                    <Input id={i} value={ctl.urlTags} disabled={disabled} maxLength={500} onChange={(e) => change({ ...draft, control: { ...ctl, urlTags: e.target.value.trim() } })} />
                    {!ctl.urlTags && <Button variant="secondary" className="shrink-0 text-xs" disabled={disabled} onClick={() => change({ ...draft, control: { ...ctl, urlTags: SUGGESTED_URL_TAGS } })}>Usar sugestão</Button>}
                  </div>
                )}
              </Field>
            </fieldset>
          </Section>

          <Section n={3} title="Arquivos do Google Drive" hint="Cole o link da pasta. O CRM junta o vertical e o de Feed de cada criativo sozinho.">
            <DriveSection disabled={disabled || draft.items.length >= ESTEIRA_MAX_ITEMS} onAdd={addProposals} />
          </Section>

          <Section n={4} title={`Criativos (${draft.items.length})`} hint="Cada um vira um anúncio pausado no conjunto. Os textos de cada um podem ser trocados.">
            {draft.items.length > 0 && <Button variant="secondary" disabled={disabled} onClick={() => void applyDefaultsToAll()} data-testid="es-aplicar-todos">Aplicar textos padrão a todos</Button>}
            {draft.items.length === 0 && <p className="text-sm text-slate-500">Nenhum criativo ainda. Leia a pasta do Drive no passo 3.</p>}
            {draft.items.map((it) => (
              <ItemCard key={it.id} item={it} disabled={disabled}
                onChange={(n) => change({ ...draft, items: draft.items.map((x) => (x.id === n.id ? n : x)) })}
                onRemove={() => change({ ...draft, items: draft.items.filter((x) => x.id !== it.id) })} />
            ))}
          </Section>
        </div>

        <aside className="space-y-3 lg:sticky lg:top-4 lg:self-start">
          <Card className="space-y-3 p-4" data-testid="es-checklist">
            <h2 className="font-semibold text-slate-900">Conferência</h2>
            {summary.ready
              ? <p className="flex items-center gap-2 text-sm text-emerald-700"><CheckCircle2 className="size-4" aria-hidden /> Tudo preenchido{summary.warnings ? `, com ${summary.warnings} aviso(s)` : ""}.</p>
              : <p className="text-sm text-slate-600">{summary.errors} item(ns) para corrigir{summary.warnings ? ` e ${summary.warnings} aviso(s)` : ""}.</p>}
            <ul className="max-h-80 space-y-1.5 overflow-y-auto text-xs">
              {items.map((i, k) => (
                <li key={k} className="flex gap-2" data-level={i.level}>
                  {i.level === "erro" ? <XCircle className="mt-0.5 size-3.5 shrink-0 text-red-600" aria-hidden /> : <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-amber-600" aria-hidden />}
                  <span className="text-slate-700">{i.message}</span>
                </li>
              ))}
            </ul>
            <p className="text-xs text-slate-500">
              {draft.items.length} criativo(s): {draft.items.filter((i) => i.feed && i.vertical).length} com Feed + vertical; {filledTexts(draft.items.flatMap((i) => i.bodies)).length} texto(s) diferente(s).
            </p>
            {id && <PublishBox draftId={id} draft={draft} accountName={account.data?.name ?? "da conta"} accountExternalId={account.data?.external_id ?? null} canPublish={perms.data?.publicar === true} disabled={disabled} flush={flush} onPrepared={prepared} />}
          </Card>
        </aside>
      </div>
    </div>
  );
}
