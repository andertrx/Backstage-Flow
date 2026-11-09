import { MessageCircle } from "lucide-react";
import { useState } from "react";
import { Alert } from "@/components/ui/alert.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Modal } from "@/components/ui/modal.tsx";
import { Switch } from "@/components/ui/switch.tsx";
import { useAuth } from "@/features/auth/AuthProvider.tsx";
import { useWaGateway } from "@/features/integrations/waGatewayApi.ts";
import { errorMessage } from "@/lib/errors.ts";
import { formatDateTime } from "@/lib/format.ts";
import type { OpsEnvio } from "./enviosApi.ts";
import { DISPARO_LABEL, type DisparoStatus, useReenviar, useSetAutomatico, useWaAutomaticos, useWaDisparos } from "./waDisparosApi.ts";
import { useWaGruposLigados } from "./waGruposApi.ts";
import { LigarGrupoModal, type ClienteGrupo } from "./WaGrupoLigar.tsx";

const TONE: Record<DisparoStatus, "success" | "danger" | "warning" | "neutral" | "brand"> = { pendente: "brand", enviando: "brand", enviado: "success", falhou: "danger", pulado: "neutral" };

/**
 * Etapa 44.3 / T5.21 — painel do envio pelo WhatsApp conectado: chave "enviar sozinho" (só administrador) e o resultado
 * de cada grupo. Não há envio manual: o que sai é só o automático, depois de aprovado. Só aparece quando a conexão do WhatsApp está ligada em Integrações.
 */
export function WaEnvioPanel({ envio }: { envio: OpsEnvio }) {
  const { profile } = useAuth();
  const isAdmin = profile?.role === "admin";
  const gw = useWaGateway(isAdmin);
  const autos = useWaAutomaticos();
  const disparos = useWaDisparos();
  const setAuto = useSetAutomatico();
  const grupos = useWaGruposLigados(true);
  const [ligar, setLigar] = useState<ClienteGrupo | null>(null);
  const reenviar = useReenviar();
  const [confirmaTodos, setConfirmaTodos] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const automatico = autos.data?.has(envio.id) ?? false;
  const ligado = Boolean(gw.data?.enabled) && gw.data?.connection_state === "conectado";
  const meus = (disparos.data ?? []).filter((d) => d.envio_id === envio.id && d.semana === envio.semana);
  const nomes = new Map(envio.clientes.map((c) => [c.cliente_id, c.cliente_nome]));
  const comGrupo = new Set((grupos.data ?? []).map((g) => g.cliente_id));
  const semGrupo = envio.clientes.filter((c) => c.ativo && !comGrupo.has(c.cliente_id));
  // Sem conexão e sem nada anotado: não mostra nada (sem botão que não funciona).
  if (!ligado && !automatico && meus.length === 0) return null;
  // Resumo da semana: o último resultado de cada cliente que recebe nesta semana
  const ultimo = new Map<string, DisparoStatus>();
  for (const d of [...meus].sort((a, b) => a.id - b.id)) ultimo.set(d.cliente_id, d.status);
  const conta = { enviado: 0, falhou: 0, fila: 0, pulado: 0 };
  for (const st of ultimo.values()) {
    if (st === "enviado") conta.enviado++; else if (st === "falhou") conta.falhou++; else if (st === "pulado") conta.pulado++; else conta.fila++;
  }
  const podeReenviar = isAdmin && automatico && ligado && envio.situacao_hoje === "aprovado" && meus.length > 0;
  const faltam = envio.clientes.filter((c) => c.ativo && c.recebe_hoje !== false && ultimo.get(c.cliente_id) !== "enviado" && ultimo.get(c.cliente_id) !== "pendente" && ultimo.get(c.cliente_id) !== "enviando").length;
  async function reenvia(modo: "faltantes" | "todos") {
    setError(null); setAviso(null);
    try {
      const r = await reenviar.mutateAsync({ envio: envio.id, modo });
      setAviso(r.na_fila ? `${r.na_fila} cliente(s) entraram na fila (um por vez, a cada 45 segundos).` : "Ninguém entrou na fila: todos já estão na fila ou já receberam.");
      setConfirmaTodos(false);
    } catch (e) { setError(errorMessage(e)); setConfirmaTodos(false); }
  }
  async function toggle(on: boolean) {
    setError(null);
    try { await setAuto.mutateAsync({ envio: envio.id, on }); } catch (e) { setError(errorMessage(e)); }
  }
  return (
    <div className="space-y-2 rounded-lg bg-slate-50 p-3 ring-1 ring-slate-200" data-testid="wa-envio-panel">
      <div className="flex flex-wrap items-center gap-3">
        <MessageCircle className="size-4 text-emerald-600" aria-hidden />
        <span className="text-sm font-medium text-slate-800">Envio pelo WhatsApp conectado</span>
        {isAdmin && (
          <Switch checked={automatico} onChange={toggle} disabled={setAuto.isPending || (!ligado && !automatico)} label="Enviar sozinho pelo WhatsApp conectado" />
        )}
        {automatico && <Badge tone="brand">Automático: sai sozinho depois de aprovado</Badge>}
      </div>
      {automatico && <p className="text-xs text-slate-500">Neste modo o Claude (MCP) não envia este envio: só o WhatsApp conectado, para não duplicar. O envio sai depois da sua aprovação da semana; se o horário passar sem aprovar, aprove depois (botão "Aprovar e enviar agora") e ele sai logo para quem ainda não recebeu.</p>}
      {automatico && semGrupo.length > 0 && (
        <div className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900 ring-1 ring-amber-200" data-testid="wa-sem-grupo">
          <p className="font-medium">{semGrupo.length} cliente(s) sem grupo ligado: o envio automático vai pular {semGrupo.length === 1 ? "esse cliente" : "esses clientes"}.</p>
          <ul className="mt-1 flex flex-wrap gap-2">
            {semGrupo.slice(0, 6).map((c) => (
              <li key={c.cliente_id} className="flex items-center gap-1.5">
                <span>{c.cliente_nome}</span>
                {isAdmin && <Button variant="secondary" size="sm" onClick={() => setLigar({ cliente_id: c.cliente_id, cliente_nome: c.cliente_nome, nome_grupo: c.nome_grupo })} data-testid="wa-ligar-grupo">Ligar grupo</Button>}
              </li>
            ))}
          </ul>
          {semGrupo.length > 6 && <p className="mt-1">… e mais {semGrupo.length - 6}. Ligue os outros em "Grupos e @ dos clientes".</p>}
        </div>
      )}
      {ligar && <LigarGrupoModal cliente={ligar} onClose={() => setLigar(null)} />}
      {meus.length > 0 && (
        <p className="text-sm text-slate-700" data-testid="wa-resumo">
          <strong>Nesta semana:</strong> {conta.enviado} enviado(s) · {conta.falhou} falharam · {conta.fila} na fila · {conta.pulado} pulado(s)
        </p>
      )}
      {podeReenviar && (
        <div className="flex flex-wrap items-center gap-2" data-testid="wa-reenviar">
          <Button size="sm" onClick={() => void reenvia("faltantes")} loading={reenviar.isPending} disabled={faltam === 0}>Reenviar só para quem não recebeu{faltam ? ` (${faltam})` : ""}</Button>
          <Button size="sm" variant="secondary" onClick={() => setConfirmaTodos(true)} disabled={reenviar.isPending}>Enviar de novo para todos</Button>
        </div>
      )}
      {aviso && <Alert tone="success">{aviso}</Alert>}
      {confirmaTodos && (
        <Modal open title="Enviar de novo para todos?" onClose={() => setConfirmaTodos(false)}>
          <div className="space-y-3 text-sm" data-testid="wa-reenviar-confirma">
            <p className="text-slate-700">Quem já recebeu esta semana vai <strong>receber a mensagem outra vez</strong>. Isso aparece duplicado nos grupos dos clientes.</p>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setConfirmaTodos(false)}>Cancelar</Button>
              <Button onClick={() => void reenvia("todos")} loading={reenviar.isPending}>Sim, enviar para todos</Button>
            </div>
          </div>
        </Modal>
      )}
      {meus.length > 0 && (
        <ul className="flex flex-wrap gap-2" data-testid="wa-disparos-lista">
          {meus.map((d) => (
            <li key={d.id} className="rounded-lg bg-white px-2.5 py-1 text-xs ring-1 ring-slate-200" title={d.detalhe ?? undefined}>
              <span className="font-semibold">{nomes.get(d.cliente_id) ?? "Cliente"}</span>{" "}
              <Badge tone={TONE[d.status]}>{DISPARO_LABEL[d.status]}</Badge>
              {d.enviado_em && <span className="ml-1 text-slate-500">{formatDateTime(d.enviado_em)}</span>}
              {d.status === "falhou" || d.status === "pulado" ? <span className="ml-1 text-slate-500">· {d.detalhe}</span> : null}
            </li>
          ))}
        </ul>
      )}
      {error && <Alert tone="error">{error}</Alert>}
    </div>
  );
}
