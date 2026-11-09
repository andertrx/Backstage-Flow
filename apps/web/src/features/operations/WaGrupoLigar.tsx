import { AtSign, Link2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Alert } from "@/components/ui/alert.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Select } from "@/components/ui/field.tsx";
import { Modal } from "@/components/ui/modal.tsx";
import { errorMessage } from "@/lib/errors.ts";
import { useAuth } from "@/features/auth/AuthProvider.tsx";
import { type OpsEnvioContato, useEnvioPadroes } from "./enviosApi.ts";
import {
  formatarNumero, useBuscarGruposWa, useParticipantesGrupo, useSalvarGrupos, useSalvarMarcacoes, useWaGruposLigados, useWaMarcacoes, type WaMarcacao,
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

/** Escolhe, na lista de quem está no grupo, o número de cada pessoa a marcar (@) nos envios deste cliente. */
export function MarcacoesModal({ cliente, grupoId, contatos, onClose }: { cliente: { cliente_id: string; cliente_nome: string }; grupoId: string; contatos: OpsEnvioContato[]; onClose: () => void }) {
  const part = useParticipantesGrupo();
  const marc = useWaMarcacoes(true);
  const salvar = useSalvarMarcacoes();
  const [lista, setLista] = useState<{ numero: string; admin: boolean }[] | null>(null);
  const [escolha, setEscolha] = useState<Record<string, string>>({});
  const [erro, setErro] = useState<string | null>(null);
  const [feito, setFeito] = useState(false);
  const atuais = useMemo(() => new Map((marc.data ?? []).filter((m) => m.cliente_id === cliente.cliente_id).map((m) => [m.nome, m.numero])), [marc.data, cliente.cliente_id]);

  async function carregar() {
    setErro(null);
    try { setLista(await part.mutateAsync(grupoId)); } catch (e) { setErro(errorMessage(e)); }
  }
  useEffect(() => { void carregar(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);
  useEffect(() => { setEscolha(Object.fromEntries(contatos.map((c) => [c.nome, atuais.get(c.nome) ?? ""]))); }, [atuais, contatos]);

  // um número só pode servir a uma pessoa do mesmo cliente
  const usados = new Map<string, number>();
  for (const v of Object.values(escolha)) if (v) usados.set(v, (usados.get(v) ?? 0) + 1);
  const duplicado = [...usados.values()].some((x) => x > 1);
  const mudancas = contatos.filter((c) => (escolha[c.nome] ?? "") !== (atuais.get(c.nome) ?? ""));
  // número já ligado que saiu do grupo continua aparecendo, para não sumir sem aviso
  const opcoes = (nome: string) => {
    const base = lista ?? [];
    const cur = escolha[nome] ?? "";
    return cur && !base.some((p) => p.numero === cur) ? [...base, { numero: cur, admin: false }] : base;
  };

  async function gravar() {
    setErro(null);
    try {
      await salvar.mutateAsync(mudancas.map((c) => ({ cliente_id: cliente.cliente_id, nome: c.nome, numero: escolha[c.nome] || null })));
      setFeito(true);
    } catch (e) { setErro(errorMessage(e)); }
  }

  return (
    <Modal open title={`Quem marcar (@): ${cliente.cliente_nome}`} size="lg" onClose={onClose}>
      <div className="space-y-3 text-sm" data-testid="wa-marcacoes-modal">
        <p className="text-slate-600">
          O WhatsApp marca pelo <strong>número</strong>. Para cada pessoa abaixo, escolha o número dela na lista de quem está no grupo. Pessoa sem número fica sem ser marcada.
          Os números ficam guardados numa tabela protegida (só administrador).
        </p>
        {!lista ? (
          <div className="space-y-2">
            {erro ? <Alert tone="error">{erro}</Alert> : <p className="text-slate-500" aria-live="polite">{part.isPending ? "Lendo quem está no grupo…" : null}</p>}
            {erro && <Button onClick={() => void carregar()} loading={part.isPending}>Tentar de novo</Button>}
          </div>
        ) : (
          <>
            <p className="text-xs text-slate-500">{lista.length} pessoa(s) no grupo. O WhatsApp não informa o nome de quem participa, só o número.</p>
            <ul className="divide-y divide-slate-100 rounded-lg ring-1 ring-slate-200">
              {contatos.map((c) => (
                <li key={c.nome} className="flex flex-wrap items-center gap-2 px-3 py-2" data-testid="wa-marcacao-linha">
                  <span className="min-w-0 flex-1 font-medium text-slate-900">{c.nome}{!c.ativo && <span className="ml-2 text-xs font-normal text-slate-500">(desligado nos envios)</span>}</span>
                  <Select aria-label={`Número de ${c.nome}`} className="w-64" value={escolha[c.nome] ?? ""} onChange={(e) => { setEscolha((s) => ({ ...s, [c.nome]: e.target.value })); setFeito(false); }}>
                    <option value="">— sem número (não marca) —</option>
                    {opcoes(c.nome).map((p) => <option key={p.numero} value={p.numero}>{formatarNumero(p.numero)}{p.admin ? " · admin do grupo" : ""}</option>)}
                  </Select>
                  {atuais.get(c.nome) && (escolha[c.nome] ?? "") === atuais.get(c.nome) && <Badge tone="success">ligado</Badge>}
                </li>
              ))}
            </ul>
            {duplicado && <Alert tone="error">Dois nomes estão com o mesmo número. Cada número só pode servir a uma pessoa.</Alert>}
            {erro && <Alert tone="error">{erro}</Alert>}
            {feito && <Alert tone="success">Salvo. Nos próximos envios o texto termina com o @ de cada pessoa ligada.</Alert>}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={onClose}>{feito ? "Fechar" : "Cancelar"}</Button>
              <Button onClick={() => void gravar()} loading={salvar.isPending} disabled={duplicado || mudancas.length === 0}>Salvar{mudancas.length ? ` (${mudancas.length})` : ""}</Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

export interface ClienteMarcacao extends ClienteGrupo {
  contatos: OpsEnvioContato[];
}

/** Resumo para a página de Envios: quem já tem grupo ligado e quantas pessoas a marcar já têm número. */
export function MarcacoesIndexModal({ clientes, onClose }: { clientes: ClienteMarcacao[]; onClose: () => void }) {
  const ligados = useWaGruposLigados(true);
  const marc = useWaMarcacoes(true);
  const [alvo, setAlvo] = useState<ClienteMarcacao | null>(null);
  const grupo = useMemo(() => new Map((ligados.data ?? []).map((g) => [g.cliente_id, g.grupo_id])), [ligados.data]);
  const tem = useMemo(() => {
    const m = new Map<string, number>();
    for (const x of marc.data ?? [] as WaMarcacao[]) m.set(x.cliente_id, (m.get(x.cliente_id) ?? 0) + 1);
    return m;
  }, [marc.data]);
  const ordenados = useMemo(() => [...clientes].filter((c) => c.contatos.length > 0).sort((a, b) => a.cliente_nome.localeCompare(b.cliente_nome)), [clientes]);
  return (
    <>
      <Modal open title="Pessoas a marcar (@) nos envios" size="lg" onClose={onClose}>
        <div className="space-y-3 text-sm" data-testid="wa-marcacoes-index">
          <p className="text-slate-600">Cada cliente precisa do grupo ligado para escolher os números. Clique em "Escolher números" no cliente.</p>
          <ul className="max-h-[55vh] divide-y divide-slate-100 overflow-y-auto rounded-lg ring-1 ring-slate-200">
            {ordenados.map((c) => {
              const n = tem.get(c.cliente_id) ?? 0;
              return (
                <li key={c.cliente_id} className="flex flex-wrap items-center gap-2 px-3 py-2" data-testid="wa-marcacoes-index-linha">
                  <span className="min-w-0 flex-1 font-medium text-slate-900">{c.cliente_nome}</span>
                  <Badge tone={n >= c.contatos.length ? "success" : "neutral"}>{n} de {c.contatos.length} com número</Badge>
                  {grupo.has(c.cliente_id)
                    ? <Button variant="secondary" onClick={() => setAlvo(c)}>Escolher números</Button>
                    : <Badge tone="warning">Sem grupo ligado</Badge>}
                </li>
              );
            })}
          </ul>
          <div className="flex justify-end"><Button variant="ghost" onClick={onClose}>Fechar</Button></div>
        </div>
      </Modal>
      {alvo && grupo.get(alvo.cliente_id) && <MarcacoesModal cliente={alvo} grupoId={grupo.get(alvo.cliente_id)!} contatos={alvo.contatos} onClose={() => setAlvo(null)} />}
    </>
  );
}

/** Botões da ficha do cliente e do "Enviar agora": ligar/trocar grupo e escolher quem marcar. */
export function GrupoDoClienteAcoes({ cliente, contatos, isAdmin }: { cliente: ClienteGrupo; contatos: OpsEnvioContato[]; isAdmin: boolean }) {
  const ligados = useWaGruposLigados(true);
  const marc = useWaMarcacoes(isAdmin);
  const [ligar, setLigar] = useState(false);
  const [marcar, setMarcar] = useState(false);
  const g = (ligados.data ?? []).find((x) => x.cliente_id === cliente.cliente_id);
  const n = (marc.data ?? []).filter((m) => m.cliente_id === cliente.cliente_id).length;
  return (
    <div className="space-y-3" data-testid="cliente-grupo-wa">
      <div className="flex flex-wrap items-center gap-2">
        <Link2 className="size-4 text-slate-400" aria-hidden />
        {g ? <span className="font-medium text-slate-900" data-testid="cliente-grupo-nome">{g.grupo_nome ?? "Grupo ligado"}</span> : <Badge tone="warning">Sem grupo ligado</Badge>}
        {isAdmin && <Button variant={g ? "secondary" : "primary"} onClick={() => setLigar(true)} data-testid="cliente-grupo-ligar">{g ? "Trocar grupo" : "Ligar grupo"}</Button>}
      </div>
      {contatos.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <AtSign className="size-4 text-slate-400" aria-hidden />
          <span className="text-sm text-slate-700">{contatos.length} pessoa(s) a marcar nos envios{isAdmin ? ` · ${n} com número` : ""}</span>
          {isAdmin && <Button variant="secondary" disabled={!g} title={g ? undefined : "Ligue o grupo primeiro"} onClick={() => setMarcar(true)} data-testid="cliente-grupo-marcar">Escolher números</Button>}
        </div>
      )}
      {!isAdmin && <p className="text-xs text-slate-500">Só o administrador liga o grupo e escolhe os números.</p>}
      {ligar && <LigarGrupoModal cliente={cliente} onClose={() => setLigar(false)} />}
      {marcar && g && <MarcacoesModal cliente={cliente} grupoId={g.grupo_id} contatos={contatos} onClose={() => setMarcar(false)} />}
    </div>
  );
}

/** Seção "Grupo do WhatsApp" da ficha do cliente (T5.20). */
export function ClienteGrupoSecao({ clienteId, clienteNome }: { clienteId: string; clienteNome: string }) {
  const { profile } = useAuth();
  const padroes = useEnvioPadroes();
  const p = (padroes.data ?? []).find((x) => x.cliente_id === clienteId);
  return (
    <GrupoDoClienteAcoes
      cliente={{ cliente_id: clienteId, cliente_nome: clienteNome, nome_grupo: p?.nome_grupo ?? clienteNome }}
      contatos={p?.contatos ?? []}
      isAdmin={profile?.role === "admin"}
    />
  );
}
