import { MessageCircle } from "lucide-react";
import { useMemo, useState } from "react";
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
import { DISPARO_LABEL, type DisparoStatus, type EnviarAgoraResult, useEnviarAgora, useSetAutomatico, useWaAutomaticos, useWaDisparos } from "./waDisparosApi.ts";
import { useWaGruposLigados } from "./waGruposApi.ts";

const TONE: Record<DisparoStatus, "success" | "danger" | "warning" | "neutral" | "brand"> = { pendente: "brand", enviando: "brand", enviado: "success", falhou: "danger", pulado: "neutral" };

/**
 * Etapa 44.3 — painel do envio pelo WhatsApp conectado: chave "enviar sozinho" (só administrador), "Enviar agora" e
 * o resultado de cada grupo. Só aparece quando a conexão do WhatsApp está ligada em Integrações.
 */
export function WaEnvioPanel({ envio }: { envio: OpsEnvio }) {
  const { profile } = useAuth();
  const isAdmin = profile?.role === "admin";
  const gw = useWaGateway(isAdmin);
  const autos = useWaAutomaticos();
  const disparos = useWaDisparos();
  const setAuto = useSetAutomatico();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const automatico = autos.data?.has(envio.id) ?? false;
  const ligado = Boolean(gw.data?.enabled) && gw.data?.connection_state === "conectado";
  const meus = (disparos.data ?? []).filter((d) => d.envio_id === envio.id && d.semana === envio.semana);
  const nomes = new Map(envio.clientes.map((c) => [c.cliente_id, c.cliente_nome]));
  // Sem conexão e sem nada anotado: não mostra nada (sem botão que não funciona).
  if (!ligado && !automatico && meus.length === 0) return null;
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
        {ligado && !envio.arquivado_em && <Button variant="secondary" className="ml-auto px-3 py-1.5 text-xs" onClick={() => setOpen(true)}>Enviar agora</Button>}
      </div>
      {automatico && <p className="text-xs text-slate-500">Neste modo o Claude (MCP) não envia este envio: só o WhatsApp conectado, para não duplicar.</p>}
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
      {open && <EnviarAgoraModal envio={envio} onClose={() => setOpen(false)} />}
    </div>
  );
}

function EnviarAgoraModal({ envio, onClose }: { envio: OpsEnvio; onClose: () => void }) {
  const ligados = useWaGruposLigados(true);
  const grupos = useMemo(() => new Map((ligados.data ?? []).map((g) => [g.cliente_id, g.grupo_nome ?? "Grupo ligado"])), [ligados.data]);
  const ativos = envio.clientes.filter((c) => c.ativo);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [reenviar, setReenviar] = useState(false);
  const [result, setResult] = useState<EnviarAgoraResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const enviar = useEnviarAgora();
  const toggle = (id: string) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  async function go() {
    setError(null);
    try { setResult(await enviar.mutateAsync({ envio: envio.id, clientes: [...sel], reenviar })); } catch (e) { setError(errorMessage(e)); }
  }
  return (
    <Modal open title={`Enviar agora: ${envio.nome}`} onClose={onClose}>
      <div className="space-y-3" data-testid="wa-enviar-agora">
        {result ? (
          <>
            <Alert tone="success">{result.enfileirados} mensagem(ns) na fila. Elas saem uma de cada vez, com pausa entre elas (cerca de 1 por minuto).</Alert>
            {result.pulados.length > 0 && (
              <Alert tone="warning">
                <p className="font-medium">Não entraram na fila:</p>
                <ul className="list-disc pl-5">{result.pulados.map((p) => <li key={p.cliente_id}>{p.nome}: {p.motivo}</li>)}</ul>
              </Alert>
            )}
            <div className="flex justify-end"><Button onClick={onClose}>Fechar</Button></div>
          </>
        ) : (
          <>
            <p className="text-sm text-slate-600">A mesma mensagem do envio vai para o grupo de cada cliente marcado, sem marcar ninguém (@). Quem já recebeu esta semana fica de fora, a menos que você marque "Enviar de novo".</p>
            {ativos.length === 0 ? <Alert tone="warning">Este envio não tem clientes ativos.</Alert> : (
              <ul className="max-h-64 space-y-1 overflow-y-auto">
                {ativos.map((c) => {
                  const g = grupos.get(c.cliente_id);
                  return (
                    <li key={c.id}>
                      <label className="flex items-center gap-2 rounded-md px-2 py-1 text-sm hover:bg-slate-50">
                        <input type="checkbox" checked={sel.has(c.cliente_id)} onChange={() => toggle(c.cliente_id)} aria-label={c.cliente_nome} />
                        <span className="font-medium">{c.cliente_nome}</span>
                        {g ? <span className="text-xs text-slate-500">· {g}</span> : <Badge tone="warning">Sem grupo ligado</Badge>}
                        {c.ja_enviado_nesta_semana && <span className="text-xs text-emerald-700">· já recebeu</span>}
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={reenviar} onChange={(e) => setReenviar(e.target.checked)} /> Enviar de novo, mesmo para quem já recebeu</label>
            {error && <Alert tone="error">{error}</Alert>}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={onClose}>Cancelar</Button>
              <Button onClick={go} loading={enviar.isPending} disabled={sel.size === 0}>Enviar para {sel.size} cliente(s)</Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
