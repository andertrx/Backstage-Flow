import {
  adsBuilderDefaults, adsBuilderNormalize, type AdsBuilderForm, buildAdsPedido, CTA_OPTIONS, DESTINO_LABELS, type DestinoTipo, type Distribuicao,
  DISTRIBUICAO_LABELS, faixaAviso, IA_RECURSOS, type IaRecurso, nomeAnuncio, resizeMapeamento, validateAdsBuilder,
} from "@backstage/shared";
import { AlertTriangle, Check, Copy, CopyPlus, FolderOpen, History, Plus, Save, Search, Trash2, Wand2, X } from "lucide-react";
import { type ReactNode, useEffect, useId, useMemo, useRef, useState } from "react";
import { Alert } from "@/components/ui/alert.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Card } from "@/components/ui/card.tsx";
import { Field, Input, Select, Textarea } from "@/components/ui/field.tsx";
import { Modal } from "@/components/ui/modal.tsx";
import { Switch } from "@/components/ui/switch.tsx";
import { cn } from "@/lib/cn.ts";
import { errorMessage } from "@/lib/errors.ts";
import { formatDateTime } from "@/lib/format.ts";
import {
  type AdsPedido, type Opcao, useAdSetOptions, useAddAdsPedido, useAdsModelos, useAdsPedidos, useArchiveAdsModelo, useCampaignOptions, useMetaAccounts,
  useSaveAdsModelo,
} from "./api.ts";

const DRAFT_KEY = "adsBuilder.rascunho";

function loadDraft(): AdsBuilderForm {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    return raw ? adsBuilderNormalize(JSON.parse(raw)) : adsBuilderDefaults();
  } catch {
    return adsBuilderDefaults();
  }
}

/** Seção numerada do formulário. */
function Section({ n, title, hint, children }: { n: number; title: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <Card className="space-y-4 p-4 sm:p-5" data-testid={`ads-secao-${n}`}>
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

/** Campo de texto com sugestões (lista do CRM) — dá para digitar qualquer coisa. */
function SuggestInput({ label, value, onChange, options, placeholder, hint }: {
  label: string; value: string; onChange: (v: string) => void; options: Opcao[]; placeholder?: string; hint?: ReactNode;
}) {
  const listId = useId();
  return (
    <Field label={label} hint={hint}>
      {(id) => (
        <>
          <Input id={id} list={listId} value={value} placeholder={placeholder} maxLength={300} autoComplete="off" onChange={(e) => onChange(e.target.value)} />
          <datalist id={listId}>{options.map((o) => <option key={o.id} value={o.label} />)}</datalist>
        </>
      )}
    </Field>
  );
}

/** Lista repetível de textos (textos principais, títulos, descrições). */
function TextList({ label, items, onChange, addLabel, min = 0, multiline, max = 2000 }: {
  label: string; items: string[]; onChange: (v: string[]) => void; addLabel: string; min?: number; multiline?: boolean; max?: number;
}) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-slate-700">{label}</p>
      {items.map((t, i) => (
        <div key={i} className="flex items-start gap-2">
          <span className="mt-2 w-5 text-right text-xs font-semibold text-slate-400">{i + 1}.</span>
          {multiline ? (
            <Textarea aria-label={`${label} ${i + 1}`} rows={3} value={t} maxLength={max} onChange={(e) => onChange(items.map((x, k) => (k === i ? e.target.value : x)))} />
          ) : (
            <Input aria-label={`${label} ${i + 1}`} value={t} maxLength={max} onChange={(e) => onChange(items.map((x, k) => (k === i ? e.target.value : x)))} />
          )}
          {items.length > min && (
            <button type="button" className="mt-1.5 rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600" aria-label={`Tirar ${label.toLowerCase()} ${i + 1}`}
              onClick={() => onChange(items.filter((_, k) => k !== i))}><X className="size-4" /></button>
          )}
        </div>
      ))}
      <Button type="button" variant="ghost" className="px-2 py-1 text-xs text-blue-700" onClick={() => onChange([...items, ""])} disabled={items.length >= 20}>
        <Plus className="size-3.5" aria-hidden /> {addLabel}
      </Button>
    </div>
  );
}

function CopyButton({ text, label = "Copiar", testId }: { text: string; label?: string; testId?: string }) {
  const [state, setState] = useState<"ok" | "erro" | null>(null);
  async function copy() {
    try { await navigator.clipboard.writeText(text); setState("ok"); } catch { setState("erro"); }
    setTimeout(() => setState(null), 2500);
  }
  return (
    <Button type="button" onClick={copy} data-testid={testId} aria-label={label}>
      {state === "ok" ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
      {state === "ok" ? "Copiado" : state === "erro" ? "Não deu para copiar" : label}
    </Button>
  );
}

// ---------------------------------------------------------------- formulário

function Formulario({ form, set, origem, onClearOrigem }: {
  form: AdsBuilderForm; set: (patch: Partial<AdsBuilderForm>) => void; origem: AdsPedido | null; onClearOrigem: () => void;
}) {
  const contas = useMetaAccounts();
  const contaId = contas.data?.find((o) => o.label === form.conta.trim())?.id ?? null;
  const campanhas = useCampaignOptions(contaId);
  const campanhaId = campanhas.data?.find((o) => o.label === form.campanha.trim())?.id ?? null;
  const conjuntos = useAdSetOptions(campanhaId);
  const [errors, setErrors] = useState<string[]>([]);
  const [pedido, setPedido] = useState<string | null>(null);
  const addPedido = useAddAdsPedido();
  const resultRef = useRef<HTMLDivElement>(null);
  const textos = form.textos.filter((t) => t.trim());
  const titulos = form.titulos.filter((t) => t.trim());
  const multi = textos.length > 1 || titulos.length > 1;
  const aviso = faixaAviso(form);

  async function gerar() {
    const found = validateAdsBuilder(form).map((e) => e.message);
    setErrors(found);
    setPedido(null);
    if (found.length) return;
    const texto = buildAdsPedido(form);
    try {
      await addPedido.mutateAsync({ dados: form, texto, origem: origem?.id ?? null });
      setPedido(texto);
      setTimeout(() => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    } catch (err) { setErrors([errorMessage(err)]); }
  }

  const setPasta = (i: number, patch: Partial<AdsBuilderForm["pastas"][number]>) => set({ pastas: form.pastas.map((p, k) => (k === i ? { ...p, ...patch } : p)) });

  return (
    <div className="space-y-4" data-testid="ads-form">
      {origem && (
        <Alert tone="info">
          <div className="flex flex-wrap items-center gap-2">
            <span>Duplicado do pedido de {formatDateTime(origem.created_at)} ({origem.campanha} · {origem.conjunto}). Troque a campanha ou o conjunto e gere de novo.</span>
            <Button variant="ghost" className="px-2 py-1 text-xs" onClick={onClearOrigem}>Ok</Button>
          </div>
        </Alert>
      )}

      <Section n={1} title="Onde criar" hint="Escolha da lista (contas, campanhas e conjuntos que o CRM já tem do Meta) ou digite o nome completo.">
        <div className="grid gap-4 md:grid-cols-2">
          <SuggestInput label="Conta de anúncios (nome ou ID)" value={form.conta} onChange={(v) => set({ conta: v })} options={contas.data ?? []} placeholder="Ex.: Loja Aurora (act_123…)" />
          <SuggestInput label="Campanha de destino (nome completo)" value={form.campanha} onChange={(v) => set({ campanha: v })} options={campanhas.data ?? []}
            hint={contaId ? `${campanhas.data?.length ?? 0} campanha(s) desta conta no CRM.` : undefined} />
          <SuggestInput label="Conjunto de destino (nome completo)" value={form.conjunto} onChange={(v) => set({ conjunto: v })} options={conjuntos.data ?? []}
            hint={campanhaId ? `${conjuntos.data?.length ?? 0} conjunto(s) desta campanha no CRM.` : undefined} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Página do Facebook">{(id) => <Input id={id} value={form.pagina} maxLength={200} onChange={(e) => set({ pagina: e.target.value })} />}</Field>
            <Field label="Perfil do Instagram">{(id) => <Input id={id} value={form.instagram} maxLength={200} placeholder="@perfil" onChange={(e) => set({ instagram: e.target.value })} />}</Field>
          </div>
        </div>
      </Section>

      <Section n={2} title="Mídia (Google Drive)">
        <Alert tone="warning">O link de cada pasta precisa ter permissão de leitura para o Claude (ex.: "Qualquer pessoa com o link pode ver").</Alert>
        <div className="space-y-3">
          {form.pastas.map((p, i) => (
            <div key={i} className="grid gap-2 rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200 md:grid-cols-[1fr_12rem_8rem_auto]" data-testid="ads-pasta">
              <Input aria-label={`Link da pasta ${i + 1}`} placeholder="https://drive.google.com/drive/folders/…" value={p.link} maxLength={500} onChange={(e) => setPasta(i, { link: e.target.value })} />
              <Input aria-label={`Rótulo da pasta ${i + 1}`} placeholder="Ex.: Vídeos verticais" value={p.rotulo} maxLength={80} onChange={(e) => setPasta(i, { rotulo: e.target.value })} />
              <Select aria-label={`Tipo da pasta ${i + 1}`} value={p.tipo} onChange={(e) => setPasta(i, { tipo: e.target.value as "video" | "imagem" })}>
                <option value="video">Vídeo</option>
                <option value="imagem">Imagem</option>
              </Select>
              <Button type="button" variant="ghost" className="px-2" aria-label={`Tirar pasta ${i + 1}`} disabled={form.pastas.length <= 1}
                onClick={() => set({ pastas: form.pastas.filter((_, k) => k !== i) })}><Trash2 className="size-4" /></Button>
            </div>
          ))}
          <Button type="button" variant="ghost" className="px-2 py-1 text-xs text-blue-700" disabled={form.pastas.length >= 10}
            onClick={() => set({ pastas: [...form.pastas, { link: "", rotulo: "Versão Feed", tipo: "video" }] })}><Plus className="size-3.5" aria-hidden /> adicionar pasta</Button>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Padrão de nome dos arquivos" hint='Ex.: "ADS-01.mp4" (normal/vertical) e "ADS-01 | Feed.mp4" (feed).'>
            {(id) => <Input id={id} value={form.padrao_nome_arquivo} maxLength={200} onChange={(e) => set({ padrao_nome_arquivo: e.target.value })} />}
          </Field>
          <div className="grid grid-cols-3 gap-2">
            <Field label="Quantidade de anúncios">{(id) => (
              <Input id={id} type="number" inputMode="numeric" min={1} max={200} value={form.quantidade ?? ""}
                onChange={(e) => set({ quantidade: e.target.value === "" ? null : Number(e.target.value) })} />
            )}</Field>
            <Field label="Faixa: de">{(id) => <Input id={id} value={form.faixa_inicio} maxLength={40} onChange={(e) => set({ faixa_inicio: e.target.value })} />}</Field>
            <Field label="até">{(id) => <Input id={id} value={form.faixa_fim} maxLength={40} placeholder="ADS-14" onChange={(e) => set({ faixa_fim: e.target.value })} />}</Field>
          </div>
        </div>
        {aviso && <p className="text-xs text-amber-700">{aviso}</p>}
        <label className="flex items-center gap-3 text-sm text-slate-700">
          <Switch checked={form.feed_vertical} onChange={(v) => set({ feed_vertical: v })} label="Versão Feed para feed e vertical para Stories e Reels" />
          Usar a versão Feed nos posicionamentos de feed e a vertical em Stories e Reels
        </label>
      </Section>

      <Section n={3} title="Textos">
        <TextList label="Texto principal" items={form.textos} min={1} multiline addLabel="adicionar texto" onChange={(v) => set({ textos: v })} />
        <TextList label="Título" items={form.titulos} addLabel="adicionar título" max={255} onChange={(v) => set({ titulos: v })} />
        <TextList label="Descrição" items={form.descricoes} addLabel="adicionar descrição" max={255} onChange={(v) => set({ descricoes: v })} />
        {multi && (
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium text-slate-700">Distribuição dos textos e títulos</legend>
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              {(Object.keys(DISTRIBUICAO_LABELS) as Distribuicao[]).map((d) => (
                <label key={d} className={cn("flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm ring-1",
                  form.distribuicao === d ? "bg-blue-50 text-blue-800 ring-blue-300" : "ring-slate-200")}>
                  <input type="radio" name="distribuicao" checked={form.distribuicao === d}
                    onChange={() => set({ distribuicao: d, ...(d === "manual" ? { mapeamento: resizeMapeamento(form) } : {}) })} />
                  {DISTRIBUICAO_LABELS[d]}
                </label>
              ))}
            </div>
            {form.distribuicao === "manual" && (
              <div className="overflow-x-auto rounded-xl ring-1 ring-slate-200">
                <table className="w-full text-left text-sm" data-testid="ads-mapeamento">
                  <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-3 py-2">Anúncio</th><th className="px-3 py-2">Texto</th><th className="px-3 py-2">Título</th></tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {resizeMapeamento(form).map((m, i) => {
                      const patch = (v: Partial<typeof m>) => set({ mapeamento: resizeMapeamento(form).map((x, k) => (k === i ? { ...x, ...v } : x)) });
                      return (
                        <tr key={i}>
                          <td className="whitespace-nowrap px-3 py-1.5 font-medium text-slate-700">{nomeAnuncio({ ...form, nome_modelo: "{nº}" }, i)}</td>
                          <td className="px-3 py-1.5">
                            <Select aria-label={`Texto do anúncio ${i + 1}`} value={m.texto} onChange={(e) => patch({ texto: Number(e.target.value) })}>
                              {textos.map((_, k) => <option key={k} value={k + 1}>Texto {k + 1}</option>)}
                            </Select>
                          </td>
                          <td className="px-3 py-1.5">
                            <Select aria-label={`Título do anúncio ${i + 1}`} value={m.titulo ?? ""} onChange={(e) => patch({ titulo: e.target.value ? Number(e.target.value) : null })}>
                              <option value="">Sem título</option>
                              {titulos.map((_, k) => <option key={k} value={k + 1}>Título {k + 1}</option>)}
                            </Select>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <p className="px-3 py-2 text-xs text-slate-500">Uma linha por anúncio (pela quantidade; até 50).</p>
              </div>
            )}
          </fieldset>
        )}
      </Section>

      <Section n={4} title="Botão e destino">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Botão (CTA)">{(id) => (
            <Select id={id} value={form.cta} onChange={(e) => set({ cta: e.target.value })}>
              {CTA_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
            </Select>
          )}</Field>
          <Field label="Tipo de destino">{(id) => (
            <Select id={id} value={form.destino} onChange={(e) => set({ destino: e.target.value as DestinoTipo })}>
              {(Object.keys(DESTINO_LABELS) as DestinoTipo[]).map((d) => <option key={d} value={d}>{DESTINO_LABELS[d]}</option>)}
            </Select>
          )}</Field>
        </div>
        {form.destino === "whatsapp" && (
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Número do WhatsApp (com DDD)">{(id) => <Input id={id} inputMode="tel" value={form.whatsapp_numero} maxLength={30} placeholder="(11) 98765-4321" onChange={(e) => set({ whatsapp_numero: e.target.value })} />}</Field>
            <Field label="Mensagem pré-preenchida">{(id) => <Input id={id} value={form.whatsapp_mensagem} maxLength={500} placeholder="Olá! Quero saber mais" onChange={(e) => set({ whatsapp_mensagem: e.target.value })} />}</Field>
            <div className="md:col-span-2">
              <Field label="Saudação ou perguntas rápidas (opcional)">{(id) => <Textarea id={id} rows={2} value={form.whatsapp_saudacao} maxLength={1000} onChange={(e) => set({ whatsapp_saudacao: e.target.value })} />}</Field>
            </div>
          </div>
        )}
        {form.destino === "site" && (
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="URL final">{(id) => <Input id={id} type="url" value={form.site_url} maxLength={1000} placeholder="https://" onChange={(e) => set({ site_url: e.target.value })} />}</Field>
            <Field label="UTMs (opcional)">{(id) => <Input id={id} value={form.site_utms} maxLength={500} placeholder="utm_source=meta&utm_medium=cpc" onChange={(e) => set({ site_utms: e.target.value })} />}</Field>
          </div>
        )}
        {form.destino === "formulario" && (
          <Field label="Nome do formulário instantâneo">{(id) => <Input id={id} value={form.formulario_nome} maxLength={200} onChange={(e) => set({ formulario_nome: e.target.value })} />}</Field>
        )}
      </Section>

      <Section n={5} title="Nome dos anúncios" hint="Variáveis: {nº} (número da faixa), {tema}, {data}, {campanha}, {conjunto}.">
        <div className="grid gap-4 md:grid-cols-3">
          <div className="md:col-span-3">
            <Field label="Modelo de nome">{(id) => <Input id={id} value={form.nome_modelo} maxLength={200} onChange={(e) => set({ nome_modelo: e.target.value })} />}</Field>
          </div>
          <Field label="Tema">{(id) => <Input id={id} value={form.tema} maxLength={80} placeholder="Ex.: Promo Outubro" onChange={(e) => set({ tema: e.target.value })} />}</Field>
          <Field label="Data">{(id) => <Input id={id} value={form.data} maxLength={20} onChange={(e) => set({ data: e.target.value })} />}</Field>
          <div className="space-y-1.5">
            <p className="text-sm font-medium text-slate-700">Prévia do primeiro nome</p>
            <p className="truncate rounded-lg bg-blue-50 px-3 py-2 text-sm font-medium text-blue-800 ring-1 ring-blue-100" data-testid="ads-nome-previa">{nomeAnuncio(form, 0) || "—"}</p>
          </div>
        </div>
      </Section>

      <Section n={6} title="Regras de criação">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Status ao criar">{(id) => (
            <Select id={id} value={form.status} onChange={(e) => set({ status: e.target.value as "PAUSADO" | "ATIVO" })}>
              <option value="PAUSADO">PAUSADO (recomendado)</option>
              <option value="ATIVO">ATIVO</option>
            </Select>
          )}</Field>
          <Field label="Anúncios pausados na origem">{(id) => (
            <Select id={id} value={form.pausados_origem} onChange={(e) => set({ pausados_origem: e.target.value as "incluir" | "ignorar" })}>
              <option value="ignorar">Ignorar</option>
              <option value="incluir">Incluir</option>
            </Select>
          )}</Field>
        </div>
        {form.status === "ATIVO" && <p className="flex items-center gap-1.5 text-xs font-medium text-amber-700"><AlertTriangle className="size-3.5" /> Os anúncios serão criados ATIVOS (vai destacado no pedido).</p>}
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-slate-700">Recursos de IA e aprimoramentos automáticos da Meta (Advantage+ Creative e similares)</legend>
          <p className="text-xs text-slate-500">Todos desligados por padrão. O que você ligar aparece destacado no pedido.</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {IA_RECURSOS.map((r) => {
              const on = form.ia_ligados.includes(r.id);
              return (
                <label key={r.id} className={cn("flex items-center gap-3 rounded-lg px-3 py-2 text-sm ring-1", on ? "bg-amber-50 text-amber-900 ring-amber-300" : "ring-slate-200")}>
                  <Switch checked={on} label={r.label}
                    onChange={(v) => set({ ia_ligados: v ? [...form.ia_ligados, r.id] : form.ia_ligados.filter((x): x is IaRecurso => x !== r.id) })} />
                  {r.label}
                </label>
              );
            })}
          </div>
        </fieldset>
        <Field label="Observações (opcional)">{(id) => <Textarea id={id} rows={3} value={form.observacoes} maxLength={3000} onChange={(e) => set({ observacoes: e.target.value })} />}</Field>
        <p className="text-xs text-slate-500">Não coloque senhas, tokens nem dados de pagamento em nenhum campo.</p>
      </Section>

      {errors.length > 0 && <Alert tone="error"><ul className="list-disc space-y-0.5 pl-4" data-testid="ads-erros">{errors.map((m) => <li key={m}>{m}</li>)}</ul></Alert>}
      <div className="sticky bottom-0 z-10 -mx-4 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0">
        <Button className="w-full sm:w-auto" onClick={gerar} loading={addPedido.isPending}><Wand2 className="size-4" aria-hidden /> Gerar pedido</Button>
      </div>

      {pedido && (
        <div ref={resultRef}>
          <Card className="space-y-3 p-4 ring-2 ring-blue-200" data-testid="ads-pedido">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-semibold text-slate-900">Pedido pronto — copie e cole no Claude</h2>
              <CopyButton text={pedido} label="Copiar" testId="ads-copiar" />
            </div>
            <pre className="max-h-[32rem] overflow-auto whitespace-pre-wrap break-words rounded-lg bg-slate-50 p-3 text-sm text-slate-800 ring-1 ring-slate-200">{pedido}</pre>
            <p className="text-xs text-slate-500">Guardado no Histórico. Esta página não cria nada no Meta: quem cria é o Claude, um anúncio primeiro, com a sua aprovação.</p>
          </Card>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- modelos

function SalvarModeloModal({ form, onClose }: { form: AdsBuilderForm; onClose: () => void }) {
  const [nome, setNome] = useState("");
  const [error, setError] = useState<string | null>(null);
  const modelos = useAdsModelos();
  const save = useSaveAdsModelo();
  const existe = modelos.data?.find((m) => m.nome.trim().toLowerCase() === nome.trim().toLowerCase());
  async function salvar() {
    setError(null);
    try { await save.mutateAsync({ id: null, nome, dados: form }); onClose(); } catch (err) { setError(errorMessage(err)); }
  }
  return (
    <Modal title="Salvar como modelo" open onClose={onClose}>
      <div className="space-y-4" data-testid="ads-salvar-modelo">
        <Field label="Nome do modelo" hint="Os modelos são da equipe: todos que usam o Criador de Anúncios podem carregar.">
          {(id) => <Input id={id} value={nome} maxLength={120} placeholder="Ex.: WhatsApp — Loja Aurora" onChange={(e) => setNome(e.target.value)} />}
        </Field>
        {existe && <Alert tone="warning">Já existe o modelo "{existe.nome}". Salvar vai substituí-lo.</Alert>}
        {error && <Alert tone="error">{error}</Alert>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button onClick={salvar} loading={save.isPending} disabled={nome.trim().length < 2}>{existe ? "Substituir modelo" : "Salvar modelo"}</Button>
        </div>
      </div>
    </Modal>
  );
}

function CarregarModeloModal({ onLoad, onClose }: { onLoad: (f: AdsBuilderForm) => void; onClose: () => void }) {
  const modelos = useAdsModelos();
  const archive = useArchiveAdsModelo();
  const [error, setError] = useState<string | null>(null);
  return (
    <Modal title="Carregar modelo" open onClose={onClose}>
      <div className="space-y-3" data-testid="ads-carregar-modelo">
        {modelos.error ? <Alert tone="error">{errorMessage(modelos.error)}</Alert> : null}
        {error && <Alert tone="error">{error}</Alert>}
        {modelos.isLoading ? <div className="h-24 animate-pulse rounded-xl bg-slate-100" aria-label="Carregando" />
          : (modelos.data ?? []).length === 0 ? <p className="text-sm text-slate-500">Nenhum modelo salvo ainda. Use "Salvar como modelo".</p> : (
            <ul className="divide-y divide-slate-100 rounded-xl ring-1 ring-slate-200">
              {(modelos.data ?? []).map((m) => (
                <li key={m.id} className="flex flex-wrap items-center gap-2 px-3 py-2" data-testid="ads-modelo">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-slate-900">{m.nome}</p>
                    <p className="text-xs text-slate-500">{m.atualizado_por_nome ?? "—"} · {formatDateTime(m.updated_at)}</p>
                  </div>
                  <Button className="px-3 py-1.5 text-xs" onClick={() => { onLoad(adsBuilderNormalize(m.dados)); onClose(); }} aria-label={`Carregar ${m.nome}`}>Carregar</Button>
                  <Button variant="ghost" className="px-2 py-1 text-xs" aria-label={`Arquivar ${m.nome}`} loading={archive.isPending}
                    onClick={async () => { setError(null); try { await archive.mutateAsync(m.id); } catch (err) { setError(errorMessage(err)); } }}>Arquivar</Button>
                </li>
              ))}
            </ul>
          )}
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------- histórico

function Historico({ onDuplicar }: { onDuplicar: (p: AdsPedido) => void }) {
  const [busca, setBusca] = useState("");
  const [q, setQ] = useState("");
  useEffect(() => { const t = setTimeout(() => setQ(busca.trim()), 300); return () => clearTimeout(t); }, [busca]);
  const pedidos = useAdsPedidos(q);
  const [aberto, setAberto] = useState<number | null>(null);
  return (
    <div className="space-y-3" data-testid="ads-historico">
      <div className="relative sm:w-80">
        <Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-slate-400" aria-hidden />
        <Input aria-label="Buscar no histórico" placeholder="Buscar conta, campanha ou conjunto" className="pl-9" value={busca} onChange={(e) => setBusca(e.target.value)} />
      </div>
      {pedidos.error ? <Alert tone="error">{errorMessage(pedidos.error)}</Alert> : null}
      {pedidos.isLoading ? <div className="h-40 animate-pulse rounded-xl bg-slate-100" aria-label="Carregando" />
        : (pedidos.data ?? []).length === 0 ? (
          <Card className="space-y-1 p-8 text-center">
            <History className="mx-auto size-8 text-slate-300" aria-hidden />
            <p className="font-medium text-slate-900">Nenhum pedido gerado ainda.</p>
            <p className="text-sm text-slate-500">Cada pedido gerado fica guardado aqui para copiar de novo ou duplicar.</p>
          </Card>
        ) : (
          <ul className="space-y-2">
            {(pedidos.data ?? []).map((p) => (
              <li key={p.id}>
                <Card className="space-y-2 p-3" data-testid="ads-historico-item">
                  <div className="flex flex-wrap items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-slate-900">{p.campanha} <span className="font-normal text-slate-400">·</span> {p.conjunto}</p>
                      <p className="text-xs text-slate-500">{p.conta} · {formatDateTime(p.created_at)} · {p.criado_por_nome ?? "—"}
                        {p.origem_pedido_id ? " · duplicado" : ""}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <CopyButton text={p.texto} label={`Copiar de novo o pedido ${p.id}`} />
                      <Button variant="secondary" onClick={() => onDuplicar(p)} aria-label={`Duplicar o pedido ${p.id}`}><CopyPlus className="size-4" aria-hidden /> Duplicar</Button>
                      <Button variant="ghost" onClick={() => setAberto(aberto === p.id ? null : p.id)}>{aberto === p.id ? "Fechar" : "Ver texto"}</Button>
                    </div>
                  </div>
                  {aberto === p.id && <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-slate-50 p-3 text-xs text-slate-700 ring-1 ring-slate-200">{p.texto}</pre>}
                </Card>
              </li>
            ))}
          </ul>
        )}
    </div>
  );
}

// ---------------------------------------------------------------- página

type View = "novo" | "historico";

/** Etapa 42: monta o PEDIDO em texto para o Claude criar anúncios no Meta Ads. A página não cria nada no Meta. */
export function AdsBuilderPage() {
  const [form, setForm] = useState<AdsBuilderForm>(loadDraft);
  const [view, setView] = useState<View>("novo");
  const [origem, setOrigem] = useState<AdsPedido | null>(null);
  const [modal, setModal] = useState<"salvar" | "carregar" | null>(null);
  const [formKey, setFormKey] = useState(0);
  // Rascunho no navegador (comodidade): o formulário volta como você deixou
  useEffect(() => { try { localStorage.setItem(DRAFT_KEY, JSON.stringify(form)); } catch { /* armazenamento bloqueado */ } }, [form]);
  const set = useMemo(() => (patch: Partial<AdsBuilderForm>) => setForm((f) => ({ ...f, ...patch })), []);
  const replace = (f: AdsBuilderForm, o: AdsPedido | null = null) => { setForm(f); setOrigem(o); setFormKey((k) => k + 1); setView("novo"); window.scrollTo({ top: 0 }); };

  return (
    <div className="mx-auto max-w-5xl space-y-5" data-testid="ads-builder">
      <div className="flex flex-wrap items-start gap-3">
        <span className="flex size-10 items-center justify-center rounded-xl bg-blue-600 text-white"><Wand2 className="size-5" aria-hidden /></span>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold tracking-tight">Criador de Anúncios</h1>
          <p className="mt-1 text-sm text-slate-500">Preencha uma vez, gere o pedido e cole no Claude, que cria os anúncios no Meta Ads. Esta página não cria nada no Meta.</p>
        </div>
        <span className="hidden sm:block"><Badge tone="brand">Só anúncios (por enquanto)</Badge></span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-lg bg-white p-1 ring-1 ring-slate-200" role="group" aria-label="Visão do Criador de Anúncios">
          {([["novo", "Novo pedido", Wand2], ["historico", "Histórico", History]] as const).map(([id, label, Icon]) => (
            <button key={id} type="button" aria-pressed={view === id} onClick={() => setView(id)}
              className={cn("inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-semibold", view === id ? "bg-blue-600 text-white" : "text-slate-600 hover:text-blue-700")}>
              <Icon className="size-4" aria-hidden />{label}
            </button>
          ))}
        </div>
        {view === "novo" && (
          <div className="flex flex-wrap gap-2 sm:ml-auto">
            <Button variant="secondary" onClick={() => setModal("carregar")}><FolderOpen className="size-4" aria-hidden /> Carregar modelo</Button>
            <Button variant="secondary" onClick={() => setModal("salvar")}><Save className="size-4" aria-hidden /> Salvar como modelo</Button>
            <Button variant="ghost" onClick={() => replace(adsBuilderDefaults())}>Limpar</Button>
          </div>
        )}
      </div>

      {view === "novo"
        ? <Formulario key={formKey} form={form} set={set} origem={origem} onClearOrigem={() => setOrigem(null)} />
        : <Historico onDuplicar={(p) => replace(adsBuilderNormalize(p.dados), p)} />}

      {modal === "salvar" && <SalvarModeloModal form={form} onClose={() => setModal(null)} />}
      {modal === "carregar" && <CarregarModeloModal onLoad={(f) => replace(f)} onClose={() => setModal(null)} />}
    </div>
  );
}
