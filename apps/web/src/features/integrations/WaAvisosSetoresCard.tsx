import { Users } from "lucide-react";
import { useState } from "react";
import { Alert } from "@/components/ui/alert.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Card } from "@/components/ui/card.tsx";
import { Field, Select } from "@/components/ui/field.tsx";
import { Switch } from "@/components/ui/switch.tsx";
import { useOpsSectors } from "@/features/operations/api.ts";
import { useBuscarGruposWa } from "@/features/operations/waGruposApi.ts";
import { errorMessage } from "@/lib/errors.ts";
import { useWaGateway } from "./waGatewayApi.ts";
import { useSalvarWaAvisoSetor, useWaAvisosSetores, type WaAvisoSetor, waAvisosDoSetor } from "./waAvisosApi.ts";

type Grupo = { id: string; name: string };

function SetorLinha({ setor, atual, opcoes, conectado }: { setor: { id: string; name: string }; atual: WaAvisoSetor | undefined; opcoes: Grupo[]; conectado: boolean }) {
  const salvar = useSalvarWaAvisoSetor();
  const [draft, setDraft] = useState<WaAvisoSetor>(atual ?? { setor_id: setor.id, ativo: false, grupo_id: null, grupo_nome: null, tipos: [] });
  const [msg, setMsg] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const grupos = opcoes.some((g) => g.id === draft.grupo_id) || !draft.grupo_id ? opcoes : [...opcoes, { id: draft.grupo_id, name: draft.grupo_nome ?? "Grupo escolhido" }];
  const secoes = waAvisosDoSetor(setor.name);
  const toggle = (id: string) => setDraft({ ...draft, tipos: draft.tipos.includes(id) ? draft.tipos.filter((t) => t !== id) : [...draft.tipos, id] });

  async function gravar() {
    setMsg(null);
    try { await salvar.mutateAsync(draft); setMsg({ tone: "success", text: "Salvo." }); } catch (e) { setMsg({ tone: "error", text: errorMessage(e) }); }
  }

  return (
    <fieldset className="space-y-3 rounded-lg p-3 ring-1 ring-slate-200" data-testid={`wa-setor-${setor.name}`}>
      <legend className="flex items-center gap-2 px-1 text-sm font-semibold text-slate-900">{setor.name} {draft.ativo ? <Badge tone="success">Ligado</Badge> : <Badge>Desligado</Badge>}</legend>
      <div className="flex flex-wrap items-end gap-3">
        <Field label={`Grupo do setor ${setor.name}`}>{(id) => (
          <Select id={id} aria-label={`Grupo do setor ${setor.name}`} value={draft.grupo_id ?? ""} className="min-w-64"
            onChange={(e) => { const g = grupos.find((x) => x.id === e.target.value); setDraft({ ...draft, grupo_id: g?.id ?? null, grupo_nome: g?.name ?? null }); }}>
            <option value="">Escolha o grupo</option>
            {grupos.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </Select>
        )}</Field>
        <Switch checked={draft.ativo} onChange={(v) => setDraft({ ...draft, ativo: v })} label={`Ligar avisos do setor ${setor.name}`} />
      </div>
      {!conectado && <p className="text-xs text-amber-700">O WhatsApp precisa estar conectado para enviar.</p>}
      {secoes.map((g) => (
        <div key={g.id} className="space-y-1" data-testid={`wa-setor-${setor.name}-${g.id}`}>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{g.titulo}</p>
          {g.nota && <p className="text-xs text-slate-500">{g.nota}</p>}
          {g.tipos.map((t) => (
            <label key={t.id} className="flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-0.5" checked={draft.tipos.includes(t.id)} onChange={() => toggle(t.id)} />
              <span>{t.label}{t.hint && <span className="text-slate-500"> · {t.hint}</span>}</span>
            </label>
          ))}
        </div>
      ))}
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
      <div className="flex justify-end"><Button onClick={gravar} loading={salvar.isPending} aria-label={`Salvar avisos do setor ${setor.name}`}>Salvar</Button></div>
    </fieldset>
  );
}

/**
 * Avisos no WhatsApp por setor: um grupo para cada setor, com os avisos de cada um. Só administrador.
 * Setor novo aparece sozinho na lista; o administrador escolhe o grupo e os avisos dele.
 */
export function WaAvisosSetoresCard() {
  const setores = useOpsSectors();
  const configs = useWaAvisosSetores();
  const gw = useWaGateway(true);
  const buscar = useBuscarGruposWa();
  const [grupos, setGrupos] = useState<Grupo[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const conectado = gw.data?.connection_state === "conectado" && gw.data?.enabled;
  const ativos = (setores.data ?? []).filter((s) => s.status === "ativo");

  async function buscarGrupos() {
    setErro(null);
    try { setGrupos(await buscar.mutateAsync()); } catch (e) { setErro(errorMessage(e)); }
  }

  if (setores.isLoading || configs.isLoading) return <div className="h-24 animate-pulse rounded-xl bg-slate-100" aria-label="Carregando" />;
  if (setores.error || configs.error) return <Alert tone="error">{errorMessage(setores.error ?? configs.error)}</Alert>;
  return (
    <Card className="space-y-4 p-5" data-testid="wa-avisos-setores-card">
      <div className="flex flex-wrap items-center gap-2">
        <Users className="size-5 text-slate-400" aria-hidden />
        <h2 className="text-lg font-semibold">Avisos no WhatsApp por setor</h2>
      </div>
      <p className="text-sm text-slate-600">Um grupo para cada setor, com os avisos que ele deve receber. Só avisa o que acontecer depois que você liga. O silêncio e o lembrete são os mesmos do grupo de avisos acima.</p>
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="secondary" onClick={buscarGrupos} loading={buscar.isPending} disabled={!conectado}>Buscar grupos no WhatsApp</Button>
        {erro && <span className="text-sm text-red-700">{erro}</span>}
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        {ativos.map((s) => <SetorLinha key={s.id} setor={s} atual={configs.data?.get(s.id)} opcoes={grupos ?? []} conectado={Boolean(conectado)} />)}
      </div>
    </Card>
  );
}
