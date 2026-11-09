import { AtSign, Link2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Alert } from "@/components/ui/alert.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Card } from "@/components/ui/card.tsx";
import { Select } from "@/components/ui/field.tsx";
import { Modal } from "@/components/ui/modal.tsx";
import { useAuth } from "@/features/auth/AuthProvider.tsx";
import { useWaGateway } from "@/features/integrations/waGatewayApi.ts";
import { errorMessage } from "@/lib/errors.ts";
import type { OpsEnvioPadrao } from "./enviosApi.ts";
import { useBuscarGruposWa, useSalvarGrupos, useWaGruposLigados } from "./waGruposApi.ts";
import { sugerirGrupos, type WaGrupoOpt } from "./waGruposLogic.ts";
import { MarcacoesIndexModal } from "./WaGrupoLigar.tsx";

/**
 * Etapa 44.2 — liga o grupo do WhatsApp de cada cliente (para o envio automático da 44.3). Nada é enviado aqui.
 * Buscar a lista no WhatsApp conectado é só do administrador; quem tem "Envios semanais" vê quais grupos já estão ligados.
 */
export function WaGruposCard({ padroes }: { padroes: OpsEnvioPadrao[] }) {
  const { profile } = useAuth();
  const isAdmin = profile?.role === "admin";
  const ligados = useWaGruposLigados(true);
  const gw = useWaGateway(isAdmin);
  const [open, setOpen] = useState(false);
  const [marcar, setMarcar] = useState(false);
  const mapa = useMemo(() => new Map((ligados.data ?? []).map((g) => [g.cliente_id, g])), [ligados.data]);
  const n = padroes.filter((p) => mapa.has(p.cliente_id)).length;
  const conectado = gw.data?.connection_state === "conectado";
  const nenhum = n === 0;
  return (
    <Card className={`flex flex-wrap items-center justify-between gap-3 p-4 ${nenhum ? "ring-2 ring-amber-300" : ""}`} data-testid="wa-grupos-card">
      <div className="min-w-0">
        <p className="flex items-center gap-2 font-semibold text-slate-900"><Link2 className="size-4 text-slate-400" aria-hidden />Grupos do WhatsApp
          <Badge tone={n === padroes.length && n > 0 ? "success" : "neutral"}>{n} de {padroes.length} ligados</Badge></p>
        <p className={`text-sm ${nenhum ? "font-medium text-amber-800" : "text-slate-500"}`}>{nenhum
          ? "Nenhum grupo ligado: o envio automático não vai enviar nada. Ligue o grupo de cada cliente (leva uns 40 segundos para buscar os grupos)."
          : "Para o envio automático (não oficial), cada cliente precisa ter o grupo dele ligado. Aqui nada é enviado."}</p>
      </div>
      {isAdmin ? (
        <div className="flex flex-wrap gap-2">
          <Button size="lg" variant={nenhum ? "primary" : "secondary"} disabled={!conectado || padroes.length === 0} onClick={() => setOpen(true)} title={conectado ? undefined : "Conecte o WhatsApp em Configurações → Integrações"} data-testid="wa-grupos-buscar">
            <Link2 className="size-4" aria-hidden /> Buscar e ligar grupos
          </Button>
          <Button size="lg" variant="secondary" disabled={n === 0} onClick={() => setMarcar(true)} title={n === 0 ? "Ligue os grupos primeiro" : undefined} data-testid="wa-marcacoes-abrir">
            <AtSign className="size-4" aria-hidden /> Pessoas a marcar (@)
          </Button>
        </div>
      ) : <span className="text-xs text-slate-500">Só o administrador liga os grupos.</span>}
      {isAdmin && !conectado && !gw.isLoading && <p className="w-full text-xs text-slate-500">Conecte o WhatsApp em Configurações → Integrações para buscar os grupos.</p>}
      {open && <LigarModal padroes={padroes} ligados={mapa} onClose={() => setOpen(false)} />}
      {marcar && <MarcacoesIndexModal clientes={padroes.map((p) => ({ cliente_id: p.cliente_id, cliente_nome: p.cliente_nome, nome_grupo: p.nome_grupo, contatos: p.contatos }))} onClose={() => setMarcar(false)} />}
    </Card>
  );
}

function LigarModal({ padroes, ligados, onClose }: { padroes: OpsEnvioPadrao[]; ligados: Map<string, { grupo_id: string; grupo_nome: string | null }>; onClose: () => void }) {
  const buscar = useBuscarGruposWa();
  const salvar = useSalvarGrupos();
  const [grupos, setGrupos] = useState<WaGrupoOpt[] | null>(null);
  const [escolha, setEscolha] = useState<Record<string, string>>({});
  const [erro, setErro] = useState<string | null>(null);
  const [feito, setFeito] = useState(false);

  const ordenados = useMemo(() => [...padroes].sort((a, b) => a.cliente_nome.localeCompare(b.cliente_nome)), [padroes]);
  const atuais = useMemo(() => new Map([...ligados].map(([c, g]) => [c, g.grupo_id])), [ligados]);
  const sugestoes = useMemo(() => (grupos ? sugerirGrupos(ordenados, grupos, atuais) : new Map()), [grupos, ordenados, atuais]);

  async function carregar() {
    setErro(null); setFeito(false);
    try {
      const g = await buscar.mutateAsync();
      setGrupos(g);
      // começa com o que já está ligado e com as sugestões por nome (a pessoa confirma ao salvar)
      const ini: Record<string, string> = {};
      const sug = sugerirGrupos(ordenados, g, new Map([...ligados].map(([c, x]) => [c, x.grupo_id])));
      for (const p of ordenados) ini[p.cliente_id] = ligados.get(p.cliente_id)?.grupo_id ?? sug.get(p.cliente_id)?.grupoId ?? "";
      setEscolha(ini);
    } catch (e) { setErro(errorMessage(e)); }
  }

  const usados = new Map<string, number>();
  for (const v of Object.values(escolha)) if (v) usados.set(v, (usados.get(v) ?? 0) + 1);
  const duplicado = [...usados.values()].some((x) => x > 1);
  const mudancas = ordenados.filter((p) => (escolha[p.cliente_id] ?? "") !== (ligados.get(p.cliente_id)?.grupo_id ?? ""));

  async function gravar() {
    setErro(null);
    try {
      await salvar.mutateAsync(mudancas.map((p) => ({ cliente_id: p.cliente_id, grupo: escolha[p.cliente_id] ? (grupos?.find((g) => g.id === escolha[p.cliente_id]) ?? null) : null })));
      setFeito(true);
    } catch (e) { setErro(errorMessage(e)); }
  }

  return (
    <Modal title="Ligar os grupos do WhatsApp aos clientes" open size="lg" onClose={onClose}>
      <div className="space-y-4 text-sm" data-testid="wa-grupos-modal">
        {!grupos ? (
          <div className="space-y-3">
            <p className="text-slate-600">O CRM vai ler no seu WhatsApp conectado só o <strong>nome e o código de cada grupo</strong> (nunca as pessoas nem as mensagens).</p>
            {erro && <Alert tone="error">{erro}</Alert>}
            <Button onClick={() => void carregar()} loading={buscar.isPending}>Buscar grupos agora</Button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-slate-600">{grupos.length} grupo(s) no WhatsApp. Confira cada escolha: as sugestões vêm da semelhança dos nomes.</p>
            <ul className="max-h-[50vh] divide-y divide-slate-100 overflow-y-auto rounded-lg ring-1 ring-slate-200">
              {ordenados.map((p) => {
                const sug = sugestoes.get(p.cliente_id);
                const atual = escolha[p.cliente_id] ?? "";
                return (
                  <li key={p.cliente_id} className="flex flex-wrap items-center gap-2 px-3 py-2" data-testid="wa-grupo-linha">
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium text-slate-900">{p.cliente_nome}</span>
                      <span className="block text-xs text-slate-500">Grupo no CRM: {p.nome_grupo}</span>
                    </span>
                    <Select aria-label={`Grupo de ${p.cliente_nome}`} className="w-72" value={atual} onChange={(e) => setEscolha((s) => ({ ...s, [p.cliente_id]: e.target.value }))}>
                      <option value="">— sem grupo ligado —</option>
                      {grupos.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                    </Select>
                    {sug && !ligados.has(p.cliente_id) && sug.grupoId === atual && <Badge tone={sug.tipo === "igual" ? "success" : "warning"}>{sug.tipo === "igual" ? "nome igual" : "nome parecido"}</Badge>}
                    {ligados.has(p.cliente_id) && atual === ligados.get(p.cliente_id)?.grupo_id && <Badge tone="neutral">ligado</Badge>}
                  </li>
                );
              })}
            </ul>
            {duplicado && <Alert tone="error">Dois clientes estão com o mesmo grupo. Cada grupo só pode servir a um cliente.</Alert>}
            {erro && <Alert tone="error">{erro}</Alert>}
            {feito && <Alert tone="success">Ligações salvas.</Alert>}
            <div className="flex flex-wrap gap-2">
              <Button disabled={duplicado || mudancas.length === 0} loading={salvar.isPending} onClick={() => void gravar()}>Salvar {mudancas.length ? `(${mudancas.length})` : ""}</Button>
              <Button variant="ghost" onClick={onClose}>Fechar</Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
