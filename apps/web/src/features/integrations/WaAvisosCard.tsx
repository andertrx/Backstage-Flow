import { Bell } from "lucide-react";
import { useMemo, useState } from "react";
import { Alert } from "@/components/ui/alert.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Card } from "@/components/ui/card.tsx";
import { Field, Select } from "@/components/ui/field.tsx";
import { Switch } from "@/components/ui/switch.tsx";
import { useActiveClients } from "@/features/clients/api.ts";
import { useBuscarGruposWa } from "@/features/operations/waGruposApi.ts";
import { errorMessage } from "@/lib/errors.ts";
import { formatDateTime } from "@/lib/format.ts";
import { useWaGateway } from "./waGatewayApi.ts";
import { useSalvarWaAvisos, useWaAvisosConfig, useWaAvisosRecentes, useWaSemGastoSilenciados, WA_AVISO_GRUPOS, type WaAvisosConfig } from "./waAvisosApi.ts";

const HORAS = Array.from({ length: 24 }, (_, h) => h);
const STATUS_TONE = { pendente: "brand", enviando: "brand", enviado: "success", falhou: "danger", pulado: "neutral" } as const;
const STATUS_LABEL = { pendente: "Na fila", enviando: "Enviando", enviado: "Enviado", falhou: "Falhou", pulado: "Pulado" } as const;
const hh = (h: number) => `${String(h).padStart(2, "0")}h`;

/**
 * Etapa 45.3 — avisos no WhatsApp, num grupo só do administrador. Só administrador.
 * Os avisos do sino, do aparelho e do e-mail continuam como sempre; aqui se liga o canal WhatsApp.
 */
export function WaAvisosCard() {
  const cfg = useWaAvisosConfig();
  const gw = useWaGateway(true);
  const silenciados = useWaSemGastoSilenciados();
  const clients = useActiveClients();
  const recentes = useWaAvisosRecentes();
  const buscar = useBuscarGruposWa();
  const salvar = useSalvarWaAvisos();
  const [draft, setDraft] = useState<WaAvisosConfig | null>(null);
  const [mute, setMute] = useState<Set<string> | null>(null);
  const [grupos, setGrupos] = useState<{ id: string; name: string }[] | null>(null);
  const [msg, setMsg] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [loaded, setLoaded] = useState<unknown>(null);
  if (cfg.data && cfg.data !== loaded && silenciados.data) { setLoaded(cfg.data); setDraft(cfg.data); setMute(new Set(silenciados.data)); }

  const conectado = gw.data?.connection_state === "conectado" && gw.data?.enabled;
  const lista = useMemo(() => [...(clients.data ?? [])].sort((a, b) => a.name.localeCompare(b.name, "pt-BR")), [clients.data]);
  if (!draft || !mute) return cfg.error ? <Alert tone="error">{errorMessage(cfg.error)}</Alert> : <div className="h-24 animate-pulse rounded-xl bg-slate-100" aria-label="Carregando" />;
  const set = <K extends keyof WaAvisosConfig>(k: K, v: WaAvisosConfig[K]) => setDraft({ ...draft, [k]: v });
  const toggleTipo = (id: string) => set("tipos", draft.tipos.includes(id) ? draft.tipos.filter((t) => t !== id) : [...draft.tipos, id]);
  const opcoesGrupo = grupos ?? (draft.grupo_id ? [{ id: draft.grupo_id, name: draft.grupo_nome ?? "Grupo escolhido" }] : []);

  async function buscarGrupos() {
    setMsg(null);
    try { setGrupos(await buscar.mutateAsync()); } catch (e) { setMsg({ tone: "error", text: errorMessage(e) }); }
  }
  async function gravar() {
    if (!draft || !mute) return;
    setMsg(null);
    const antes = silenciados.data ?? new Set<string>();
    const mudancas = lista.filter((c) => mute.has(c.id) !== antes.has(c.id)).map((c) => ({ cliente_id: c.id, silenciar: mute.has(c.id) }));
    try {
      await salvar.mutateAsync({ config: draft, silenciar: mudancas });
      setMsg({ tone: "success", text: "Avisos salvos." });
    } catch (e) { setMsg({ tone: "error", text: errorMessage(e) }); }
  }

  return (
    <Card className="space-y-4 p-5" data-testid="wa-avisos-card">
      <div className="flex flex-wrap items-center gap-2">
        <Bell className="size-5 text-slate-400" aria-hidden />
        <h2 className="text-lg font-semibold">Avisos no WhatsApp (grupo só seu)</h2>
        {draft.ativo ? <Badge tone="success">Ligado</Badge> : <Badge>Desligado</Badge>}
      </div>
      <p className="text-sm text-slate-600">Além do sino, do aparelho e do e-mail, os avisos escolhidos chegam num grupo do WhatsApp que você cria só para isso. Vários avisos juntos viram uma mensagem só.</p>
      {!conectado && <Alert tone="warning">Conecte o WhatsApp e ligue os envios automáticos acima. Sem isso, os avisos ficam guardados e nada é enviado.</Alert>}

      <div className="flex flex-wrap items-end gap-3">
        <Field label="Grupo de avisos">{(id) => (
<Select id={id} aria-label="Grupo de avisos" value={draft.grupo_id ?? ""} className="min-w-64"
            onChange={(e) => { const g = opcoesGrupo.find((x) => x.id === e.target.value); setDraft({ ...draft, grupo_id: g?.id ?? null, grupo_nome: g?.name ?? null }); }}>
            <option value="">Escolha o grupo</option>
            {opcoesGrupo.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </Select>
          )}</Field>
        <Button variant="secondary" onClick={buscarGrupos} loading={buscar.isPending} disabled={!conectado}>Buscar grupos no WhatsApp</Button>
        <Switch checked={draft.ativo} onChange={(v) => set("ativo", v)} label="Ligar avisos no WhatsApp" />
      </div>

      <div className="space-y-4" data-testid="wa-avisos-tipos">
        <p className="text-sm font-medium text-slate-800">Quais avisos</p>
        {WA_AVISO_GRUPOS.map((g) => {
          const ids = g.tipos.map((t) => t.id);
          const todos = ids.every((i) => draft.tipos.includes(i));
          return (
            <fieldset key={g.id} className="space-y-1 rounded-lg p-3 ring-1 ring-slate-200" data-testid={`wa-avisos-grupo-${g.id}`}>
              <legend className="px-1 text-sm font-semibold text-slate-900">{g.titulo}</legend>
              {g.nota && <p className="text-xs text-slate-500">{g.nota}</p>}
              <button type="button" className="text-xs font-medium text-brand-700 hover:underline" aria-label={`${todos ? "Desmarcar" : "Marcar"} todos: ${g.titulo}`}
                onClick={() => set("tipos", todos ? draft.tipos.filter((t) => !ids.includes(t)) : [...new Set([...draft.tipos, ...ids])])}>
                {todos ? "Desmarcar todos" : "Marcar todos"}
              </button>
              {g.tipos.map((t) => (
                <label key={t.id} className="flex items-start gap-2 text-sm">
                  <input type="checkbox" className="mt-0.5" checked={draft.tipos.includes(t.id)} onChange={() => toggleTipo(t.id)} />
                  <span>{t.label}{t.hint && <span className="text-slate-500"> · {t.hint}</span>}</span>
                </label>
              ))}
            </fieldset>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-4">
        <Field label="Silêncio: de">{(id) => (
<Select id={id} aria-label="Silêncio de" value={draft.silencio_inicio} onChange={(e) => set("silencio_inicio", Number(e.target.value))}>{HORAS.map((h) => <option key={h} value={h}>{hh(h)}</option>)}</Select>
          )}</Field>
        <Field label="até">{(id) => (
<Select id={id} aria-label="Silêncio até" value={draft.silencio_fim} onChange={(e) => set("silencio_fim", Number(e.target.value))}>{HORAS.map((h) => <option key={h} value={h}>{hh(h)}</option>)}</Select>
          )}</Field>
        <Field label="Lembrar de novo a cada">{(id) => (
<Select id={id} aria-label="Lembrar a cada" value={draft.repetir_horas} onChange={(e) => set("repetir_horas", Number(e.target.value))}>
            {[3, 6, 12, 24, 48].map((h) => <option key={h} value={h}>{h} horas</option>)}
          </Select>
          )}</Field>
      </div>
      <p className="text-xs text-slate-500">Durante o silêncio (horário de Brasília) os avisos ficam guardados e saem quando acabar; avisos com mais de 24 horas não são enviados.</p>

      {draft.tipos.includes("sem_gasto") && (
        <div className="space-y-2 rounded-lg bg-slate-50 p-3 ring-1 ring-slate-200" data-testid="wa-sem-gasto">
          <p className="text-sm font-medium text-slate-800">Cliente sem gastar</p>
          <div className="flex flex-wrap gap-4">
            <Field label="Só entre">{(id) => (
<Select id={id} aria-label="Sem gasto de" value={draft.sem_gasto_inicio} onChange={(e) => set("sem_gasto_inicio", Number(e.target.value))}>{HORAS.map((h) => <option key={h} value={h}>{hh(h)}</option>)}</Select>
          )}</Field>
            <Field label="e">{(id) => (
<Select id={id} aria-label="Sem gasto até" value={draft.sem_gasto_fim} onChange={(e) => set("sem_gasto_fim", Number(e.target.value))}>{[...HORAS.slice(1), 24].map((h) => <option key={h} value={h}>{hh(h)}</option>)}</Select>
          )}</Field>
            <Field label="Sem gasto por pelo menos">{(id) => (
<Select id={id} aria-label="Minutos sem gasto" value={draft.sem_gasto_minutos} onChange={(e) => set("sem_gasto_minutos", Number(e.target.value))}>
                {[30, 60, 90, 120, 180].map((m) => <option key={m} value={m}>{m} min</option>)}
              </Select>
          )}</Field>
          </div>
          <p className="text-xs text-slate-500">O CRM lê as contas de hora em hora: a precisão é de cerca de 1 hora. Pode haver aviso falso (campanha programada para outro horário, orçamento do dia esgotado). Desmarque os clientes que não devem avisar:</p>
          <ul className="grid max-h-48 gap-1 overflow-y-auto sm:grid-cols-2">
            {lista.map((c) => (
              <li key={c.id}>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={!mute.has(c.id)} aria-label={`Avisar sem gasto: ${c.name}`}
                    onChange={() => { const n = new Set(mute); if (n.has(c.id)) n.delete(c.id); else n.add(c.id); setMute(n); }} />
                  {c.name}
                </label>
              </li>
            ))}
          </ul>
        </div>
      )}

      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
      <div className="flex justify-end"><Button onClick={gravar} loading={salvar.isPending}>Salvar avisos</Button></div>

      <div className="space-y-1" data-testid="wa-avisos-recentes">
        <p className="text-sm font-medium text-slate-800">Últimos avisos</p>
        {(recentes.data ?? []).length === 0 ? <p className="text-sm text-slate-500">Nenhum aviso ainda.</p> : (
          <ul className="space-y-1">
            {(recentes.data ?? []).map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-2 text-sm">
                <Badge tone={STATUS_TONE[a.status]}>{STATUS_LABEL[a.status]}</Badge>
                <span className="text-slate-700">{a.texto}</span>
                <span className="text-xs text-slate-400">{formatDateTime(a.enviado_em ?? a.created_at)}</span>
                {a.detalhe && <span className="text-xs text-slate-500">· {a.detalhe}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}
