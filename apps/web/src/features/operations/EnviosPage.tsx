import {
  buildEnvioCommand, cleanContacts, cleanDesligados, ENVIO_AGENT_INSTRUCTION, ENVIO_LIMITS, ENVIO_STATUS_LABELS, ENVIO_STATUSES, ENVIO_WEEKDAYS, type EnvioClienteInput, type EnvioStatus,
  validateEnvio,
} from "@backstage/shared";
import { ArrowDown, ArrowUp, Archive, ArchiveRestore, AtSign, Check, Copy, History, Pencil, Plus, Search, Send, X } from "lucide-react";
import { type FormEvent, useMemo, useState } from "react";
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
import { usePersistentState } from "@/lib/usePersistentState.ts";
import {
  type EnvioSituacaoHoje, type OpsEnvio, type OpsEnvioHistoricoFilters, type OpsEnvioPadrao, useArchiveEnvio, useEnvioAprovacoes, useEnvioHistorico, useEnvioPadroes, useEnvios,
  useSaveEnvio, useSaveEnvioPadrao,
} from "./enviosApi.ts";
import { OpsModuleHeader } from "./OpsHeader.tsx";
import { RequireOps } from "./OpsLayout.tsx";
import { EnvioApprovalModal } from "./EnvioApproval.tsx";
import { originLabel } from "./origin.ts";
import { WhatsAppPreview } from "./WhatsAppPreview.tsx";
import { type TasksContext, useTasksContext } from "./tasksContext.tsx";

const STATUS_TONE: Record<EnvioStatus, "success" | "danger" | "neutral"> = { enviado: "success", falhou: "danger", pulado: "neutral" };

/** 41.2: situação do envio hoje (aprovação semanal). */
const SITUACAO: Partial<Record<EnvioSituacaoHoje, { label: string; tone: "success" | "danger" | "warning" | "neutral" | "brand" }>> = {
  antes_da_janela: { label: "Hoje: aprovação a partir das 7h", tone: "brand" },
  aguardando_aprovacao: { label: "Hoje: aguardando sua aprovação", tone: "warning" },
  aprovado: { label: "Hoje: aprovado", tone: "success" },
  recusado: { label: "Hoje: não enviar esta semana", tone: "neutral" },
  nao_aprovado_a_tempo: { label: "Hoje: não aprovado a tempo (não sai)", tone: "danger" },
};
const DECISAO_LABEL = { aprovado: "Aprovado", recusado: "Não enviar", sem_resposta: "Sem resposta (não saiu)" } as const;

/**
 * "Quem marcar": vários nomes, na ordem (setas para mudar). Só nomes, como aparecem no grupo.
 * 41.3: cada nome tem um botão de ligar/desligar — desligado fica guardado, mas não é marcado.
 */
function ContactsEditor({ names, off, onChange, label }: {
  names: string[]; off: string[]; onChange: (v: { names: string[]; off: string[] }) => void; label: string;
}) {
  const [draft, setDraft] = useState("");
  function add() {
    const n = draft.trim();
    if (!n) return;
    onChange({ names: [...names, n], off });
    setDraft("");
  }
  const move = (i: number, d: -1 | 1) => {
    const next = [...names];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    onChange({ names: next, off });
  };
  const setOn = (n: string, on: boolean) => onChange({ names, off: on ? off.filter((x) => x !== n) : [...off, n] });
  const remove = (i: number) => {
    const next = names.filter((_, k) => k !== i);
    onChange({ names: next, off: off.filter((x) => next.includes(x)) });
  };
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Input aria-label={`Adicionar pessoa para marcar em ${label}`} placeholder="Nome exatamente como aparece no grupo" value={draft} maxLength={ENVIO_LIMITS.contato}
          onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }} />
        <Button type="button" variant="secondary" onClick={add} disabled={!draft.trim() || names.length >= ENVIO_LIMITS.contatos}>Adicionar</Button>
      </div>
      {names.length > 0 && (
        <ol className="space-y-1" aria-label={`Quem marcar em ${label}`}>
          {names.map((n, i) => {
            const on = !off.includes(n);
            return (
              <li key={`${n}-${i}`} className={cn("flex items-center gap-2 rounded-md px-2 py-1 text-sm", on ? "bg-slate-50" : "bg-slate-50/50 text-slate-400")} data-testid="envio-contato">
                <Switch checked={on} onChange={(v) => setOn(n, v)} label={`Marcar ${n}`} />
                <span className="w-5 text-right text-xs font-semibold text-slate-400">{i + 1}.</span>
                <span className={cn("min-w-0 flex-1 truncate", !on && "line-through")}>@{n}</span>
                {!on && <span className="text-xs">desligado</span>}
                <button type="button" className="rounded p-1 text-slate-500 hover:text-blue-700 disabled:opacity-30" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`Subir ${n}`}><ArrowUp className="size-3.5" /></button>
                <button type="button" className="rounded p-1 text-slate-500 hover:text-blue-700 disabled:opacity-30" disabled={i === names.length - 1} onClick={() => move(i, 1)} aria-label={`Descer ${n}`}><ArrowDown className="size-3.5" /></button>
                <button type="button" className="rounded p-1 text-slate-500 hover:text-red-600" onClick={() => remove(i)} aria-label={`Tirar ${n}`}><X className="size-3.5" /></button>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

function EnvioFormModal({ envio, ctx, onClose }: { envio: OpsEnvio | null; ctx: TasksContext; onClose: () => void }) {
  const [nome, setNome] = useState(envio?.nome ?? "");
  const [mensagem, setMensagem] = useState(envio?.mensagem ?? "");
  const [dia, setDia] = useState<number | null>(envio?.dia_semana ?? null);
  const [horario, setHorario] = useState(envio?.horario ?? "");
  const [ativo, setAtivo] = useState(envio?.ativo ?? true);
  const [clientes, setClientes] = useState<EnvioClienteInput[]>(() => (envio?.clientes ?? []).map((c) => ({
    cliente_id: c.cliente_id, nome_grupo: c.nome_grupo, ativo: c.ativo, observacao: c.observacao ?? "",
    contatos_marcar: c.contatos ? c.contatos.map((x) => x.nome) : c.contatos_marcar,
    contatos_desligados: (c.contatos ?? []).filter((x) => !x.ativo).map((x) => x.nome) })));
  const padroes = useEnvioPadroes();
  const [busca, setBusca] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const save = useSaveEnvio();
  const clientName = (id: string) => ctx.directory.clients.find((c) => c.id === id)?.name ?? envio?.clientes.find((c) => c.cliente_id === id)?.cliente_nome ?? "cliente";
  const allClients = useMemo(() => {
    const list = ctx.directory.clients.map((c) => ({ id: c.id, name: c.name }));
    for (const c of envio?.clientes ?? []) if (!list.some((x) => x.id === c.cliente_id)) list.push({ id: c.cliente_id, name: c.cliente_nome });
    return list.sort((a, b) => a.name.localeCompare(b.name));
  }, [ctx.directory.clients, envio]);
  const q = busca.trim().toLowerCase();
  const shown = allClients.filter((c) => !q || c.name.toLowerCase().includes(q) || clientes.some((x) => x.cliente_id === c.id));
  const patch = (id: string, v: Partial<EnvioClienteInput>) => setClientes((cs) => cs.map((c) => (c.cliente_id === id ? { ...c, ...v } : c)));
  // 41.3: cliente marcado já vem com o grupo e os @ padrão dele
  const toggle = (id: string, on: boolean) => {
    const pd = padroes.data?.find((x) => x.cliente_id === id);
    setClientes((cs) => on ? [...cs, { cliente_id: id, nome_grupo: pd?.nome_grupo ?? "", contatos_marcar: pd?.contatos.map((x) => x.nome) ?? [],
      contatos_desligados: pd?.contatos.filter((x) => !x.ativo).map((x) => x.nome) ?? [], ativo: true, observacao: "" }] : cs.filter((c) => c.cliente_id !== id));
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    const input = { nome, mensagem, dia_semana: dia, horario, ativo,
      clientes: clientes.map((c) => ({ ...c, contatos_marcar: cleanContacts(c.contatos_marcar), contatos_desligados: cleanDesligados(c.contatos_marcar, c.contatos_desligados),
        observacao: c.observacao?.trim() || null })) };
    const found = validateEnvio(input, clientName);
    setErrors(found.map((x) => x.message));
    if (found.length) return;
    try {
      await save.mutateAsync({ id: envio?.id ?? null, versao: envio?.versao ?? null, input: { ...input, dia_semana: dia as number } });
      onClose();
    } catch (err) { setErrors([errorMessage(err)]); }
  }

  return (
    <Modal title={envio ? "Editar envio semanal" : "Novo envio semanal"} open onClose={onClose} size="lg">
      <form onSubmit={submit} className="space-y-5" data-testid="envio-form">
        <Field label="Nome do envio">{(id) => <Input id={id} value={nome} maxLength={ENVIO_LIMITS.nome} placeholder="Ex.: Feedback semanal de resultados" onChange={(e) => setNome(e.target.value)} />}</Field>
        <div className="grid gap-4 lg:grid-cols-2">
          <Field label="Mensagem" hint="Quebras de linha e emojis ficam como você escrever. *negrito*, _itálico_ e ~riscado~ como no WhatsApp.">
            {(id) => <Textarea id={id} rows={9} value={mensagem} maxLength={ENVIO_LIMITS.mensagem} onChange={(e) => setMensagem(e.target.value)} />}
          </Field>
          <div className="space-y-1.5">
            <p className="text-sm font-medium text-slate-700">Pré-visualização</p>
            <WhatsAppPreview text={mensagem} />
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-4">
          <Field label="Dia da semana">{(id) => (
            <Select id={id} className="w-48" value={dia ?? ""} onChange={(e) => setDia(e.target.value === "" ? null : Number(e.target.value))}>
              <option value="">Escolha…</option>
              {ENVIO_WEEKDAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}
            </Select>
          )}</Field>
          <Field label="Horário (Brasília)">{(id) => <Input id={id} type="time" className="w-36" value={horario} onChange={(e) => setHorario(e.target.value)} />}</Field>
          <label className="flex items-center gap-2 pb-2 text-sm font-medium text-slate-700"><Switch checked={ativo} onChange={setAtivo} label="Envio ativo" /> {ativo ? "Ativo" : "Pausado"}</label>
        </div>

        <fieldset className="space-y-3">
          <legend className="text-sm font-semibold text-slate-800">Clientes e grupos ({clientes.filter((c) => c.ativo).length} ativo(s))</legend>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-slate-400" aria-hidden />
            <Input aria-label="Buscar cliente" placeholder="Buscar cliente" className="pl-9" value={busca} onChange={(e) => setBusca(e.target.value)} />
          </div>
          <ul className="max-h-[28rem] space-y-2 overflow-y-auto pr-1">
            {shown.map((c) => {
              const sel = clientes.find((x) => x.cliente_id === c.id);
              return (
                <li key={c.id} className={cn("rounded-xl ring-1", sel ? "bg-blue-50/40 ring-blue-200" : "ring-slate-200")} data-testid="envio-cliente">
                  <label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm font-medium text-slate-800">
                    <input type="checkbox" checked={Boolean(sel)} onChange={(e) => toggle(c.id, e.target.checked)} aria-label={`Incluir ${c.name}`} />
                    <span className="flex-1">{c.name}</span>
                    {!sel && padroes.data?.some((x) => x.cliente_id === c.id) && <span className="text-xs font-normal text-slate-500">grupo e @ salvos</span>}
                    {sel && !sel.ativo && <Badge>Inativo neste envio</Badge>}
                  </label>
                  {sel && (
                    <div className="grid gap-3 border-t border-blue-100 px-3 py-3 md:grid-cols-2">
                      <Field label="Nome do grupo" hint="Exatamente como aparece no WhatsApp.">
                        {(id) => <Input id={id} value={sel.nome_grupo} maxLength={ENVIO_LIMITS.grupo} onChange={(e) => patch(c.id, { nome_grupo: e.target.value })} />}
                      </Field>
                      <div className="space-y-1.5">
                        <p className="text-sm font-medium text-slate-700">Quem marcar (na ordem)</p>
                        <ContactsEditor names={sel.contatos_marcar} off={sel.contatos_desligados ?? []} label={c.name}
                          onChange={(v) => patch(c.id, { contatos_marcar: v.names, contatos_desligados: v.off })} />
                        <p className="text-xs text-slate-500">Só o nome, como na lista de participantes do grupo. Telefone não é guardado. Desligado fica guardado, mas não é marcado.</p>
                      </div>
                      <Field label="Observação (opcional)">
                        {(id) => <Input id={id} value={sel.observacao ?? ""} maxLength={ENVIO_LIMITS.observacao} onChange={(e) => patch(c.id, { observacao: e.target.value })} />}
                      </Field>
                      <label className="flex items-center gap-2 self-end pb-2 text-sm text-slate-700">
                        <Switch checked={sel.ativo} onChange={(v) => patch(c.id, { ativo: v })} label={`${c.name} ativo neste envio`} /> {sel.ativo ? "Ativo neste envio" : "Inativo (fica guardado)"}
                      </label>
                    </div>
                  )}
                </li>
              );
            })}
            {shown.length === 0 && <li className="p-4 text-center text-sm text-slate-500">Nenhum cliente encontrado.</li>}
          </ul>
        </fieldset>

        <p className="text-xs text-slate-500">Ao salvar, o grupo e os @ de cada cliente ficam guardados como padrão dele: o próximo envio já vem preenchido.</p>
        {errors.length > 0 && <Alert tone="error"><ul className="list-disc space-y-0.5 pl-4" data-testid="envio-errors">{errors.map((m) => <li key={m}>{m}</li>)}</ul></Alert>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" loading={save.isPending}>Salvar</Button>
        </div>
      </form>
    </Modal>
  );
}

function CopyCommand({ envio }: { envio: OpsEnvio }) {
  const [copied, setCopied] = useState<"ok" | "erro" | null>(null);
  async function copy() {
    try {
      await navigator.clipboard.writeText(buildEnvioCommand(envio, envio.id));
      setCopied("ok");
    } catch { setCopied("erro"); }
    setTimeout(() => setCopied(null), 2500);
  }
  const vazio = !envio.clientes.some((c) => c.ativo);
  return (
    <Button variant="secondary" className="px-3 py-1.5 text-xs" onClick={copy} disabled={vazio} aria-label={`Copiar comando de ${envio.nome}`}>
      {copied === "ok" ? <Check className="size-3.5" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
      {copied === "ok" ? "Copiado" : copied === "erro" ? "Não deu para copiar" : "Copiar comando"}
    </Button>
  );
}

/** 41.2: a instrução fixa para colar na tarefa agendada do Claude no computador (ver a documentação da fase). */
function CopyAgentInstruction() {
  const [copied, setCopied] = useState<"ok" | "erro" | null>(null);
  async function copy() {
    try { await navigator.clipboard.writeText(ENVIO_AGENT_INSTRUCTION); setCopied("ok"); } catch { setCopied("erro"); }
    setTimeout(() => setCopied(null), 2500);
  }
  return (
    <Button variant="secondary" onClick={copy} aria-label="Copiar instrução da tarefa agendada">
      {copied === "ok" ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
      {copied === "ok" ? "Instrução copiada" : copied === "erro" ? "Não deu para copiar" : "Instrução da tarefa agendada"}
    </Button>
  );
}

function EnvioCard({ envio, onEdit }: { envio: OpsEnvio; onEdit: () => void }) {
  const archive = useArchiveEnvio();
  const [reviewing, setReviewing] = useState(false);
  const sit = SITUACAO[envio.situacao_hoje];
  const podeDecidir = ["aguardando_aprovacao", "aprovado", "recusado"].includes(envio.situacao_hoje);
  const [error, setError] = useState<string | null>(null);
  const ativos = envio.clientes.filter((c) => c.ativo);
  const arquivado = Boolean(envio.arquivado_em);
  async function toggleArchive() {
    setError(null);
    try { await archive.mutateAsync({ id: envio.id, arquivar: !arquivado }); } catch (err) { setError(errorMessage(err)); }
  }
  return (
    <Card className={cn("space-y-3 p-4", (!envio.ativo || arquivado) && "opacity-75")} data-testid="envio-card">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold text-slate-900">{envio.nome}</h3>
            {arquivado ? <Badge>Arquivado</Badge> : envio.ativo ? <Badge tone="success">Ativo</Badge> : <Badge tone="warning">Pausado</Badge>}
            {!arquivado && sit && <Badge tone={sit.tone}>{sit.label}</Badge>}
          </div>
          <p className="text-sm text-slate-600">{ENVIO_WEEKDAYS[envio.dia_semana]} às {envio.horario} · {ativos.length} grupo(s) ativo(s)</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {!arquivado && podeDecidir && (
            <Button className="px-3 py-1.5 text-xs" variant={envio.situacao_hoje === "aguardando_aprovacao" ? "primary" : "secondary"} onClick={() => setReviewing(true)}
              aria-label={`Revisar e aprovar ${envio.nome}`}>Revisar e aprovar</Button>
          )}
          {!arquivado && <CopyCommand envio={envio} />}
          {!arquivado && <Button variant="ghost" className="px-2 py-1 text-xs" onClick={onEdit} aria-label={`Editar ${envio.nome}`}><Pencil className="size-3.5" aria-hidden /> Editar</Button>}
          <Button variant="ghost" className="px-2 py-1 text-xs" onClick={toggleArchive} loading={archive.isPending} aria-label={`${arquivado ? "Desarquivar" : "Arquivar"} ${envio.nome}`}>
            {arquivado ? <ArchiveRestore className="size-3.5" aria-hidden /> : <Archive className="size-3.5" aria-hidden />}{arquivado ? "Desarquivar" : "Arquivar"}
          </Button>
        </div>
      </div>
      <p className="line-clamp-2 whitespace-pre-line text-sm text-slate-500">{envio.mensagem}</p>
      {envio.clientes.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {envio.clientes.map((c) => (
            <li key={c.id} className={cn("rounded-lg px-2.5 py-1 text-xs ring-1", c.ativo ? "bg-white text-slate-700 ring-slate-200" : "bg-slate-50 text-slate-400 ring-slate-100")}
              title={c.contatos_marcar.length ? `Marcar: ${c.contatos_marcar.map((n) => `@${n}`).join(" ")}` : "Sem marcação"}>
              <span className="font-semibold">{c.cliente_nome}</span> · {c.nome_grupo}
              {c.ja_enviado_nesta_semana && <span className="ml-1 text-emerald-700">· enviado nesta semana</span>}
            </li>
          ))}
        </ul>
      )}
      {error && <Alert tone="error">{error}</Alert>}
      {reviewing && <EnvioApprovalModal envio={envio} onClose={() => setReviewing(false)} />}
    </Card>
  );
}

function HistoricoView({ envios, ctx }: { envios: OpsEnvio[]; ctx: TasksContext }) {
  const [f, setF] = useState<OpsEnvioHistoricoFilters>({});
  const hist = useEnvioHistorico(f);
  const set = (k: keyof OpsEnvioHistoricoFilters, v: string) => setF((old) => ({ ...old, [k]: v || undefined }));
  return (
    <div className="space-y-3" data-testid="envio-historico">
      <div className="flex flex-wrap items-center gap-2">
        <Select aria-label="Filtrar por envio" className="w-auto" value={f.envio_id ?? ""} onChange={(e) => set("envio_id", e.target.value)}>
          <option value="">Todos os envios</option>
          {envios.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
        </Select>
        <Select aria-label="Filtrar por cliente" className="w-auto" value={f.cliente_id ?? ""} onChange={(e) => set("cliente_id", e.target.value)}>
          <option value="">Todos os clientes</option>
          {ctx.directory.clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
        <Select aria-label="Filtrar por status" className="w-auto" value={f.status ?? ""} onChange={(e) => set("status", e.target.value)}>
          <option value="">Todos os status</option>
          {ENVIO_STATUSES.map((s) => <option key={s} value={s}>{ENVIO_STATUS_LABELS[s]}</option>)}
        </Select>
        <Input aria-label="De" type="date" className="w-auto" value={f.de ?? ""} onChange={(e) => set("de", e.target.value)} />
        <Input aria-label="Até" type="date" className="w-auto" value={f.ate ?? ""} onChange={(e) => set("ate", e.target.value)} />
      </div>
      {hist.error ? <Alert tone="error">{errorMessage(hist.error)}</Alert> : null}
      {hist.isLoading ? <div className="h-40 animate-pulse rounded-xl bg-slate-100" aria-label="Carregando" />
        : (hist.data ?? []).length === 0 ? (
          <Card className="space-y-1 p-8 text-center">
            <History className="mx-auto size-8 text-slate-300" aria-hidden />
            <p className="font-medium text-slate-900">Nenhuma execução registrada.</p>
            <p className="text-sm text-slate-500">O agente (Claude, pelo MCP) registra aqui cada grupo: enviado, falhou ou pulado.</p>
          </Card>
        ) : (
          <Card className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr><th className="px-4 py-2">Data</th><th className="px-4 py-2">Cliente / grupo</th><th className="px-4 py-2">Envio</th><th className="px-4 py-2">Status</th><th className="px-4 py-2">Detalhe</th><th className="px-4 py-2">Registrado por</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(hist.data ?? []).map((x) => (
                  <tr key={x.id} data-testid="envio-execucao">
                    <td className="whitespace-nowrap px-4 py-2 tabular-nums text-slate-700">{formatDateTime(x.executado_em)}</td>
                    <td className="px-4 py-2"><span className="font-medium text-slate-900">{x.cliente_nome}</span>{x.nome_grupo && <span className="block text-xs text-slate-500">{x.nome_grupo}</span>}</td>
                    <td className="px-4 py-2 text-slate-600">{x.envio_nome}</td>
                    <td className="px-4 py-2"><Badge tone={STATUS_TONE[x.status]}>{ENVIO_STATUS_LABELS[x.status]}</Badge></td>
                    <td className="px-4 py-2 text-slate-600">{x.detalhe ?? "—"}</td>
                    <td className="px-4 py-2 text-xs text-slate-500">{originLabel(x.origem, x.registrado_por_nome)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      {(hist.data ?? []).length >= 300 && <p className="text-xs text-slate-500">Mostrando as 300 mais recentes. Use os filtros para ver as mais antigas.</p>}
      <AprovacoesView envioId={f.envio_id} />
    </div>
  );
}

/** 41.2: decisão de cada semana (aprovado, não enviar, sem resposta). */
function AprovacoesView({ envioId }: { envioId?: string }) {
  const ap = useEnvioAprovacoes(envioId);
  const rows = ap.data ?? [];
  return (
    <section className="space-y-2" data-testid="envio-aprovacoes">
      <h3 className="text-sm font-semibold text-slate-800">Aprovações semanais</h3>
      {ap.error ? <Alert tone="error">{errorMessage(ap.error)}</Alert> : rows.length === 0 ? (
        <p className="text-sm text-slate-500">Nenhuma decisão ainda. No dia do envio, das 7h até o horário, o CRM pede a sua aprovação.</p>
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr><th className="px-4 py-2">Semana de</th><th className="px-4 py-2">Envio</th><th className="px-4 py-2">Decisão</th><th className="px-4 py-2">Quem e quando</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={r.id} data-testid="envio-aprovacao-row">
                  <td className="whitespace-nowrap px-4 py-2 tabular-nums text-slate-700">{r.semana.split("-").reverse().join("/")}</td>
                  <td className="px-4 py-2 text-slate-700">{r.envio_nome}</td>
                  <td className="px-4 py-2"><Badge tone={r.decisao === "aprovado" ? "success" : r.decisao === "recusado" ? "neutral" : "danger"}>{DECISAO_LABEL[r.decisao]}</Badge></td>
                  <td className="px-4 py-2 text-xs text-slate-500">{r.origem === "sistema" ? "Sistema (passou do horário)" : originLabel(r.origem, r.decidido_por_nome)} · {formatDateTime(r.decidido_em)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </section>
  );
}

/** 41.3: editar o grupo e os @ padrão de um cliente (nome do grupo, nomes na ordem, ligar/desligar). */
function PadraoFormModal({ clienteId, clienteNome, padrao, onClose }: { clienteId: string; clienteNome: string; padrao: OpsEnvioPadrao | null; onClose: () => void }) {
  const [grupo, setGrupo] = useState(padrao?.nome_grupo ?? "");
  const [names, setNames] = useState(padrao?.contatos.map((x) => x.nome) ?? []);
  const [off, setOff] = useState(padrao?.contatos.filter((x) => !x.ativo).map((x) => x.nome) ?? []);
  const [errors, setErrors] = useState<string[]>([]);
  const save = useSaveEnvioPadrao();
  async function submit(e: FormEvent) {
    e.preventDefault();
    const found = validateEnvio({ nome: "padrão", mensagem: "-", dia_semana: 1, horario: "09:00", ativo: true,
      clientes: [{ cliente_id: clienteId, nome_grupo: grupo, contatos_marcar: names, ativo: true }] }, () => clienteNome).map((x) => x.message);
    setErrors(found);
    if (found.length) return;
    try {
      await save.mutateAsync({ cliente_id: clienteId, nome_grupo: grupo.trim(), contatos_marcar: cleanContacts(names), contatos_desligados: cleanDesligados(names, off) });
      onClose();
    } catch (err) { setErrors([errorMessage(err)]); }
  }
  return (
    <Modal title={`Grupo e @ de ${clienteNome}`} open onClose={onClose}>
      <form onSubmit={submit} className="space-y-4" data-testid="envio-padrao-form">
        <Field label="Nome do grupo" hint="Exatamente como aparece no WhatsApp.">
          {(id) => <Input id={id} value={grupo} maxLength={ENVIO_LIMITS.grupo} onChange={(e) => setGrupo(e.target.value)} />}
        </Field>
        <div className="space-y-1.5">
          <p className="text-sm font-medium text-slate-700">Quem marcar (na ordem)</p>
          <ContactsEditor names={names} off={off} label={clienteNome} onChange={(v) => { setNames(v.names); setOff(v.off); }} />
          <p className="text-xs text-slate-500">Desligado fica guardado, mas não é marcado. Só o nome, nunca telefone.</p>
        </div>
        {(padrao?.envios.length ?? 0) > 0 && (
          <p className="text-xs text-slate-500">Vale também para: {padrao?.envios.map((x) => x.nome).join(", ")}. Se o envio já estava aprovado hoje, ele pede aprovação de novo.</p>
        )}
        {errors.length > 0 && <Alert tone="error"><ul className="list-disc space-y-0.5 pl-4">{errors.map((m) => <li key={m}>{m}</li>)}</ul></Alert>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" loading={save.isPending}>Salvar</Button>
        </div>
      </form>
    </Modal>
  );
}

/** 41.3: um cliente na lista "Grupos e @": cada @ com o botão de ligar/desligar (salva na hora). */
function PadraoRow({ padrao, onEdit }: { padrao: OpsEnvioPadrao; onEdit: () => void }) {
  const save = useSaveEnvioPadrao();
  const [error, setError] = useState<string | null>(null);
  async function setOn(nome: string, on: boolean) {
    setError(null);
    const names = padrao.contatos.map((x) => x.nome);
    const off = padrao.contatos.filter((x) => (x.nome === nome ? !on : !x.ativo)).map((x) => x.nome);
    try { await save.mutateAsync({ cliente_id: padrao.cliente_id, nome_grupo: padrao.nome_grupo, contatos_marcar: names, contatos_desligados: off }); }
    catch (err) { setError(errorMessage(err)); }
  }
  const ligados = padrao.contatos.filter((x) => x.ativo).length;
  return (
    <li className="space-y-2 rounded-xl bg-white p-3 ring-1 ring-slate-200" data-testid="envio-padrao">
      <div className="flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-slate-900">{padrao.cliente_nome}</p>
          <p className="text-sm text-slate-600">{padrao.nome_grupo}</p>
        </div>
        <span className="text-xs text-slate-500">{ligados} de {padrao.contatos.length} marcado(s)</span>
        <Button variant="ghost" className="px-2 py-1 text-xs" onClick={onEdit} aria-label={`Editar grupo e @ de ${padrao.cliente_nome}`}><Pencil className="size-3.5" aria-hidden /> Editar</Button>
      </div>
      {padrao.contatos.length === 0 ? <p className="text-xs text-slate-500">Sem marcação.</p> : (
        <ul className="flex flex-wrap gap-2">
          {padrao.contatos.map((x) => (
            <li key={x.nome} className={cn("flex items-center gap-2 rounded-lg px-2 py-1 text-sm ring-1", x.ativo ? "bg-blue-50/50 text-slate-800 ring-blue-100" : "bg-slate-50 text-slate-400 ring-slate-100")}
              data-testid="envio-padrao-contato">
              <Switch checked={x.ativo} onChange={(v) => setOn(x.nome, v)} label={`Marcar ${x.nome} em ${padrao.cliente_nome}`} disabled={save.isPending} />
              <span className={cn(!x.ativo && "line-through")}>@{x.nome}</span>
            </li>
          ))}
        </ul>
      )}
      {padrao.envios.length > 0 && <p className="text-xs text-slate-500">Nos envios: {padrao.envios.map((e) => e.nome).join(", ")}</p>}
      {error && <Alert tone="error">{error}</Alert>}
    </li>
  );
}

/** 41.3: grupo e @ padrão de cada cliente — todo envio novo já vem com eles. */
function PadroesView({ ctx }: { ctx: TasksContext }) {
  const list = useEnvioPadroes();
  const [busca, setBusca] = useState("");
  const [novo, setNovo] = useState("");
  const [editing, setEditing] = useState<{ id: string; nome: string; padrao: OpsEnvioPadrao | null } | null>(null);
  const rows = list.data ?? [];
  const q = busca.trim().toLowerCase();
  const shown = rows.filter((r) => !q || r.cliente_nome.toLowerCase().includes(q) || r.nome_grupo.toLowerCase().includes(q)
    || r.contatos.some((x) => x.nome.toLowerCase().includes(q)));
  const semPadrao = ctx.directory.clients.filter((c) => !rows.some((r) => r.cliente_id === c.id)).sort((a, b) => a.name.localeCompare(b.name));
  return (
    <div className="space-y-3" data-testid="envio-padroes">
      <p className="text-sm text-slate-600">O grupo e quem marcar de cada cliente ficam guardados aqui. Todo envio novo já vem com eles. Desligue um @ para não marcar a pessoa sem perder o nome.</p>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-slate-400" aria-hidden />
          <Input aria-label="Buscar cliente, grupo ou @" placeholder="Buscar cliente, grupo ou @" className="pl-9" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
        <Select aria-label="Adicionar cliente" className="w-auto" value={novo} onChange={(e) => setNovo(e.target.value)}>
          <option value="">Adicionar cliente…</option>
          {semPadrao.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
        <Button variant="secondary" disabled={!novo} onClick={() => {
          const c = semPadrao.find((x) => x.id === novo);
          if (c) setEditing({ id: c.id, nome: c.name, padrao: null });
          setNovo("");
        }}><Plus className="size-4" aria-hidden /> Adicionar</Button>
      </div>
      {list.error ? <Alert tone="error">{errorMessage(list.error)}</Alert> : null}
      {list.isLoading ? <div className="h-40 animate-pulse rounded-xl bg-slate-100" aria-label="Carregando" />
        : shown.length === 0 ? (
          <Card className="space-y-1 p-8 text-center">
            <AtSign className="mx-auto size-8 text-slate-300" aria-hidden />
            <p className="font-medium text-slate-900">{rows.length ? "Nenhum cliente encontrado." : "Nenhum grupo salvo ainda."}</p>
            {!rows.length && <p className="text-sm text-slate-500">Use "Adicionar cliente" ou salve um envio: o grupo e os @ ficam guardados aqui.</p>}
          </Card>
        ) : <ul className="space-y-2">{shown.map((r) => <PadraoRow key={r.cliente_id} padrao={r} onEdit={() => setEditing({ id: r.cliente_id, nome: r.cliente_nome, padrao: r })} />)}</ul>}
      {editing && <PadraoFormModal clienteId={editing.id} clienteNome={editing.nome} padrao={editing.padrao} onClose={() => setEditing(null)} />}
    </div>
  );
}

type View = "envios" | "padroes" | "historico";

/** Etapa 41: envios semanais de feedback para os grupos de WhatsApp dos clientes. O CRM não envia: guarda e mostra o histórico. */
export function EnviosPage() {
  const ctx = useTasksContext();
  const [view, setView] = usePersistentState<View>("ops.envios.view", "envios");
  const [arquivados, setArquivados] = useState(false);
  const [editing, setEditing] = useState<OpsEnvio | null | undefined>(undefined);
  const list = useEnvios(arquivados);
  const envios = list.data ?? [];
  return (
    <div className="space-y-4" data-testid="ops-envios">
      <OpsModuleHeader icon={Send} title="Envios semanais"
        description="Mensagem de feedback que se repete toda semana nos grupos de WhatsApp dos clientes. O CRM não envia: o Claude lê pelo MCP, envia e registra o resultado aqui." />
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-lg bg-white p-1 ring-1 ring-slate-200" role="group" aria-label="Visão dos envios">
          {([["envios", "Envios", Send], ["padroes", "Grupos e @ dos clientes", AtSign], ["historico", "Histórico", History]] as const).map(([id, label, Icon]) => (
            <button key={id} type="button" aria-pressed={view === id} onClick={() => setView(id)}
              className={cn("inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-semibold", view === id ? "bg-blue-600 text-white" : "text-slate-600 hover:text-blue-700")}>
              <Icon className="size-4" aria-hidden />{label}
            </button>
          ))}
        </div>
        {view === "envios" && <label className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={arquivados} onChange={(e) => setArquivados(e.target.checked)} /> Ver arquivados</label>}
        {view === "envios" && !arquivados && (
          <div className="ml-auto flex flex-wrap gap-2">
            <CopyAgentInstruction />
            <Button onClick={() => setEditing(null)} disabled={ctx.loading}><Plus className="size-4" aria-hidden /> Novo envio</Button>
          </div>
        )}
      </div>
      {list.error ? <Alert tone="error">{errorMessage(list.error)}</Alert> : null}
      {view === "historico" ? <HistoricoView envios={envios} ctx={ctx} />
        : view === "padroes" ? <PadroesView ctx={ctx} />
        : list.isLoading ? <div className="h-48 animate-pulse rounded-xl bg-slate-100" aria-label="Carregando" />
        : envios.length === 0 ? (
          <Card className="space-y-2 p-8 text-center" data-testid="envios-empty">
            <Send className="mx-auto size-8 text-slate-300" aria-hidden />
            <p className="font-medium text-slate-900">{arquivados ? "Nenhum envio arquivado." : "Nenhum envio semanal ainda."}</p>
            {!arquivados && <p className="text-sm text-slate-500">Use "Novo envio" para configurar a mensagem, o dia, o horário e os grupos.</p>}
          </Card>
        ) : <div className="space-y-3">{envios.map((e) => <EnvioCard key={e.id} envio={e} onEdit={() => setEditing(e)} />)}</div>}
      <p className="text-xs text-slate-500">Dias e horários no fuso de Brasília. Só nomes são guardados (grupo e pessoas a marcar), nunca telefone.</p>
      {editing !== undefined && <EnvioFormModal envio={editing} ctx={ctx} onClose={() => setEditing(undefined)} />}
    </div>
  );
}

export function EnviosRoute() {
  return (
    <RequireOps permission="ops.envios">
      <EnviosPage />
    </RequireOps>
  );
}
