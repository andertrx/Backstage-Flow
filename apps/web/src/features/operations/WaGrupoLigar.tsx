import { AtSign, Link2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Alert } from "@/components/ui/alert.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Input, Select } from "@/components/ui/field.tsx";
import { Modal } from "@/components/ui/modal.tsx";
import { Switch } from "@/components/ui/switch.tsx";
import { errorMessage } from "@/lib/errors.ts";
import { useAuth } from "@/features/auth/AuthProvider.tsx";
import { useEnvioPadroes, useSaveEnvioPadrao } from "./enviosApi.ts";
import {
  formatarNumero, useAtivarMarcacao, useBuscarGruposWa, useParticipantesGrupo, useSalvarGrupos, useSalvarMarcacoes, useWaGruposLigados, useWaMarcacoes,
} from "./waGruposApi.ts";
import { sugerirGrupos, type WaGrupoOpt } from "./waGruposLogic.ts";

/**
 * T5.20 — peças para ligar um cliente ao grupo do WhatsApp e para escolher quem marcar (@) nos envios.
 * Só o administrador usa (o banco confere). Nada é enviado aqui.
 */

export interface ClienteGrupo {
  cliente_id: string;
  cliente_nome: string;
  /** Nome do grupo guardado no CRM (para sugerir o grupo certo pelo nome). */
  nome_grupo: string;
}

/** Liga UM cliente a um grupo do WhatsApp: busca a lista, sugere pelo nome e salva. */
export function LigarGrupoModal({ cliente, onClose }: { cliente: ClienteGrupo; onClose: () => void }) {
  const buscar = useBuscarGruposWa();
  const salvar = useSalvarGrupos();
  const salvarPadrao = useSaveEnvioPadrao();
  const padroes = useEnvioPadroes();
  const ligados = useWaGruposLigados(true);
  const [grupos, setGrupos] = useState<WaGrupoOpt[] | null>(null);
  const [escolha, setEscolha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [feito, setFeito] = useState(false);
  const emUso = useMemo(() => new Map((ligados.data ?? []).map((g) => [g.cliente_id, g.grupo_id])), [ligados.data]);
  const atual = emUso.get(cliente.cliente_id) ?? "";

  async function carregar() {
    setErro(null);
    try {
      const g = await buscar.mutateAsync();
      setGrupos(g);
      const sug = sugerirGrupos([{ cliente_id: cliente.cliente_id, nome_grupo: cliente.nome_grupo }], g, emUso);
      setEscolha(atual || sug.get(cliente.cliente_id)?.grupoId || "");
    } catch (e) { setErro(errorMessage(e)); }
  }
  // busca assim que abre (a lista pode levar uns 40 segundos)
  useEffect(() => { void carregar(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const usadoPorOutro = escolha && [...emUso].some(([c, g]) => g === escolha && c !== cliente.cliente_id);
  async function gravar() {
    setErro(null);
    try {
      const g = grupos?.find((x) => x.id === escolha) ?? null;
      await salvar.mutateAsync([{ cliente_id: cliente.cliente_id, grupo: g }]);
      // cliente novo nos envios: o nome do grupo do WhatsApp vira o nome do grupo no CRM (só se ainda não existir)
      if (g && padroes.data && !padroes.data.some((p) => p.cliente_id === cliente.cliente_id)) {
        await salvarPadrao.mutateAsync({ cliente_id: cliente.cliente_id, nome_grupo: g.name.slice(0, 200), contatos_marcar: [], contatos_desligados: [] });
      }
      setFeito(true);
    } catch (e) { setErro(errorMessage(e)); }
  }

  return (
    <Modal open title={`Ligar grupo: ${cliente.cliente_nome}`} onClose={onClose}>
      <div className="space-y-3 text-sm" data-testid="wa-ligar-um">
        {!grupos ? (
          <div className="space-y-3">
            <p className="text-slate-600">O CRM lê no seu WhatsApp só o <strong>nome e o código de cada grupo</strong> (nunca as pessoas nem as mensagens).</p>
            {erro ? <Alert tone="error">{erro}</Alert> : <p className="text-slate-500" aria-live="polite">{buscar.isPending ? "Buscando os grupos… pode levar até 1 minuto." : null}</p>}
            {erro && <Button onClick={() => void carregar()} loading={buscar.isPending}>Tentar de novo</Button>}
          </div>
        ) : (
          <>
            <p className="text-slate-600">{grupos.length} grupo(s) no WhatsApp. Grupo no CRM: <strong>{cliente.nome_grupo || "—"}</strong>.</p>
            <Select aria-label={`Grupo de ${cliente.cliente_nome}`} value={escolha} onChange={(e) => { setEscolha(e.target.value); setFeito(false); }}>
              <option value="">— sem grupo ligado —</option>
              {grupos.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </Select>
            {usadoPorOutro && <Alert tone="error">Este grupo já está ligado a outro cliente. Desligue lá primeiro.</Alert>}
            {erro && <Alert tone="error">{erro}</Alert>}
            {feito && <Alert tone="success">Ligação salva.</Alert>}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={onClose}>{feito ? "Fechar" : "Cancelar"}</Button>
              <Button onClick={() => void gravar()} loading={salvar.isPending} disabled={!!usadoPorOutro || escolha === atual}>Salvar</Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

/**
 * T5.22 — pessoas a marcar (@) de um cliente, SEMPRE por número: o administrador dá um apelido (só para ele se achar)
 * e escolhe o número na lista de quem está no grupo. Cada pessoa pode ser ligada/desligada ou removida.
 * `sugestoes` = nomes antigos do cliente, só como ajuda para o apelido.
 */
export function MarcacoesModal({ cliente, grupoId, sugestoes, onClose }: { cliente: { cliente_id: string; cliente_nome: string }; grupoId: string; sugestoes: string[]; onClose: () => void }) {
  const part = useParticipantesGrupo();
  const marc = useWaMarcacoes(true);
  const salvar = useSalvarMarcacoes();
  const ativar = useAtivarMarcacao();
  const [lista, setLista] = useState<{ numero: string; admin: boolean }[] | null>(null);
  const [apelido, setApelido] = useState("");
  const [numero, setNumero] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const pessoas = useMemo(() => (marc.data ?? []).filter((m) => m.cliente_id === cliente.cliente_id), [marc.data, cliente.cliente_id]);
  const usados = new Set(pessoas.map((p) => p.numero));
  const livres = (lista ?? []).filter((p) => !usados.has(p.numero));
  const dicas = sugestoes.filter((n) => !pessoas.some((p) => p.nome === n));

  async function carregar() {
    setErro(null);
    try { setLista(await part.mutateAsync(grupoId)); } catch (e) { setErro(errorMessage(e)); }
  }
  useEffect(() => { void carregar(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  async function adicionar() {
    setErro(null);
    try {
      await salvar.mutateAsync([{ cliente_id: cliente.cliente_id, nome: apelido.trim(), numero }]);
      setApelido(""); setNumero("");
    } catch (e) { setErro(errorMessage(e)); }
  }
  async function remover(nome: string) {
    setErro(null);
    try { await salvar.mutateAsync([{ cliente_id: cliente.cliente_id, nome, numero: null }]); } catch (e) { setErro(errorMessage(e)); }
  }
  async function ligar(nome: string, ativo: boolean) {
    setErro(null);
    try { await ativar.mutateAsync({ cliente_id: cliente.cliente_id, nome, ativo }); } catch (e) { setErro(errorMessage(e)); }
  }

  return (
    <Modal open title={`Pessoas a marcar (@): ${cliente.cliente_nome}`} size="lg" onClose={onClose}>
      <div className="space-y-4 text-sm" data-testid="wa-marcacoes-modal">
        <p className="text-slate-600">
          O WhatsApp marca pelo <strong>número</strong>. Escolha o número de cada pessoa na lista de quem está no grupo e dê um apelido só para você se achar.
          Os números ficam numa tabela protegida (só administrador).
        </p>
        <ul className="divide-y divide-slate-100 rounded-lg ring-1 ring-slate-200" aria-label="Pessoas marcadas">
          {pessoas.map((p) => (
            <li key={p.nome} className="flex flex-wrap items-center gap-2 px-3 py-2" data-testid="wa-marcacao-linha">
              <Switch checked={p.ativo} onChange={(v) => void ligar(p.nome, v)} label={`Marcar ${p.nome}`} disabled={ativar.isPending} />
              <span className={`min-w-0 flex-1 font-medium ${p.ativo ? "text-slate-900" : "text-slate-400 line-through"}`}>{p.nome}</span>
              <span className="tabular-nums text-xs text-slate-500">{formatarNumero(p.numero)}</span>
              {!p.ativo && <span className="text-xs text-slate-500">desligado</span>}
              <button type="button" className="rounded p-1 text-slate-500 hover:text-red-600" onClick={() => void remover(p.nome)} aria-label={`Tirar ${p.nome}`}><X className="size-3.5" /></button>
            </li>
          ))}
          {pessoas.length === 0 && <li className="px-3 py-3 text-slate-500" data-testid="wa-marcacao-vazio">Ninguém será marcado neste cliente. Adicione abaixo.</li>}
        </ul>
        {!lista ? (
          <div className="space-y-2">
            {erro ? <Alert tone="error">{erro}</Alert> : <p className="text-slate-500" aria-live="polite">{part.isPending ? "Lendo quem está no grupo…" : null}</p>}
            {erro && <Button onClick={() => void carregar()} loading={part.isPending}>Tentar de novo</Button>}
          </div>
        ) : (
          <div className="space-y-2 rounded-lg bg-slate-50 p-3">
            <p className="font-medium text-slate-800">Adicionar pessoa ({lista.length} no grupo)</p>
            <div className="flex flex-wrap items-center gap-2">
              <Input aria-label="Apelido da pessoa" placeholder="Apelido (ex.: Dono)" className="w-48" list="wa-apelidos" maxLength={80} value={apelido} onChange={(e) => setApelido(e.target.value)} />
              <datalist id="wa-apelidos">{dicas.map((n) => <option key={n} value={n} />)}</datalist>
              <Select aria-label="Número da pessoa" className="w-64" value={numero} onChange={(e) => setNumero(e.target.value)}>
                <option value="">— escolha o número —</option>
                {livres.map((p) => <option key={p.numero} value={p.numero}>{formatarNumero(p.numero)}{p.admin ? " · admin do grupo" : ""}</option>)}
              </Select>
              <Button onClick={() => void adicionar()} loading={salvar.isPending} disabled={!apelido.trim() || !numero}>Adicionar</Button>
            </div>
            {dicas.length > 0 && <p className="text-xs text-slate-500">Nomes que este cliente já tinha: {dicas.join(", ")} (use como apelido, se quiser).</p>}
            <p className="text-xs text-slate-500">O WhatsApp não informa o nome de quem participa, só o número.</p>
          </div>
        )}
        {lista && erro && <Alert tone="error">{erro}</Alert>}
        <div className="flex justify-end"><Button variant="ghost" onClick={onClose}>Fechar</Button></div>
      </div>
    </Modal>
  );
}

/** Botões da ficha do cliente e da aba Clientes: ligar/trocar grupo e escolher quem marcar. */
export function GrupoDoClienteAcoes({ cliente, sugestoes, isAdmin }: { cliente: ClienteGrupo; sugestoes: string[]; isAdmin: boolean }) {
  const ligados = useWaGruposLigados(true);
  const marc = useWaMarcacoes(isAdmin);
  const [ligar, setLigar] = useState(false);
  const [marcar, setMarcar] = useState(false);
  const g = (ligados.data ?? []).find((x) => x.cliente_id === cliente.cliente_id);
  const mine = (marc.data ?? []).filter((m) => m.cliente_id === cliente.cliente_id);
  const n = mine.filter((m) => m.ativo).length;
  return (
    <div className="space-y-3" data-testid="cliente-grupo-wa">
      <div className="flex flex-wrap items-center gap-2">
        <Link2 className="size-4 text-slate-400" aria-hidden />
        {g ? <span className="font-medium text-slate-900" data-testid="cliente-grupo-nome">{g.grupo_nome ?? "Grupo ligado"}</span> : <Badge tone="warning">Sem grupo ligado</Badge>}
        {isAdmin && <Button variant={g ? "secondary" : "primary"} onClick={() => setLigar(true)} data-testid="cliente-grupo-ligar">{g ? "Trocar grupo" : "Ligar grupo"}</Button>}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <AtSign className="size-4 text-slate-400" aria-hidden />
        <span className="text-sm text-slate-700" data-testid="cliente-grupo-marcados">{isAdmin ? (n ? `${n} pessoa(s) marcada(s) nos envios` : "Ninguém marcado nos envios") : "Marcações dos envios"}</span>
        {isAdmin && <Button variant="secondary" disabled={!g} title={g ? undefined : "Ligue o grupo primeiro"} onClick={() => setMarcar(true)} data-testid="cliente-grupo-marcar">Pessoas a marcar</Button>}
      </div>
      {!isAdmin && <p className="text-xs text-slate-500">Só o administrador liga o grupo e escolhe os números.</p>}
      {ligar && <LigarGrupoModal cliente={cliente} onClose={() => setLigar(false)} />}
      {marcar && g && <MarcacoesModal cliente={cliente} grupoId={g.grupo_id} sugestoes={sugestoes} onClose={() => setMarcar(false)} />}
    </div>
  );
}

/** Seção "Grupo do WhatsApp" da ficha do cliente. */
export function ClienteGrupoSecao({ clienteId, clienteNome }: { clienteId: string; clienteNome: string }) {
  const { profile } = useAuth();
  const padroes = useEnvioPadroes();
  const p = (padroes.data ?? []).find((x) => x.cliente_id === clienteId);
  return (
    <GrupoDoClienteAcoes
      cliente={{ cliente_id: clienteId, cliente_nome: clienteNome, nome_grupo: p?.nome_grupo ?? clienteNome }}
      sugestoes={(p?.contatos ?? []).map((c) => c.nome)}
      isAdmin={profile?.role === "admin"}
    />
  );
}
