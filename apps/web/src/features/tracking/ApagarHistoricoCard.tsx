import { Trash2 } from "lucide-react";
import { useState } from "react";
import { Alert } from "@/components/ui/alert.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Card } from "@/components/ui/card.tsx";
import { Input } from "@/components/ui/field.tsx";
import { errorMessage } from "@/lib/errors.ts";
import { toast } from "@/lib/toastStore.ts";
import { type HistoricoContagem, type HistoricoEscopo, useHistoricoApagar, useHistoricoContagem } from "./api.ts";

const OPCOES: { id: HistoricoEscopo; titulo: string; texto: string }[] = [
  { id: "whatsapp", titulo: "Só o WhatsApp", texto: "Mensagens, pessoas (telefone e nome), sugestões da IA e conversas sem venda." },
  { id: "site", titulo: "Só o site", texto: "Eventos, visitas, origens, leads, cliques no WhatsApp e o registro de envios ao Meta." },
  { id: "ambos", titulo: "Os dois", texto: "Tudo o que está acima, de uma vez." },
];

const n = (v: number) => v.toLocaleString("pt-BR");

/** O que será apagado, em frases, conforme a escolha. */
function resumo(c: HistoricoContagem, escopo: HistoricoEscopo): { linhas: string[]; total: number } {
  const linhas: string[] = [];
  let total = 0;
  if (escopo !== "site") {
    const w = c.whatsapp;
    linhas.push(`WhatsApp: ${n(w.mensagens)} mensagem(ns), ${n(w.pessoas)} pessoa(s), ${n(w.sugestoes)} sugestão(ões) da IA e ${n(w.conversas_apagar)} conversa(s) sem venda.`);
    total += w.mensagens + w.pessoas + w.sugestoes + w.conversas_apagar;
  }
  if (escopo !== "whatsapp") {
    const s = c.site;
    linhas.push(`Site: ${n(s.eventos)} evento(s), ${n(s.visitas)} visita(s), ${n(s.visitantes)} visitante(s), ${n(s.origens)} origem(ns), ${n(s.leads)} lead(s), ${n(s.cliques_whatsapp)} clique(s) no WhatsApp e ${n(s.envios_meta_registro)} registro(s) de envio ao Meta.`);
    total += s.eventos + s.visitas + s.visitantes + s.origens + s.leads + s.cliques_whatsapp + s.envios_meta_registro;
  }
  return { linhas, total };
}

/**
 * 26/11/2026 — Configurações do Tracking: apagar o histórico de UM cliente (só o WhatsApp, só o site ou os dois). Só administrador.
 * Primeiro mostra quanto será apagado; só apaga com a palavra APAGAR. Vendas, contatos marcados, conversas com venda, a fila pendente
 * do Meta e toda a configuração ficam. Não há "desfazer".
 */
export function ApagarHistoricoCard({ clientId, clientName }: { clientId: string | null; clientName: string | null }) {
  const contagem = useHistoricoContagem();
  const apagar = useHistoricoApagar();
  const [escopo, setEscopo] = useState<HistoricoEscopo>("whatsapp");
  const [dados, setDados] = useState<HistoricoContagem | null>(null);
  const [palavra, setPalavra] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [feito, setFeito] = useState<string | null>(null);

  function reiniciar() { setDados(null); setPalavra(""); setErro(null); }

  if (!clientId) {
    return (
      <Card className="p-4 text-sm text-slate-600" data-testid="historico-escolha-cliente">
        Escolha um cliente no campo no topo da tela. O histórico é apagado de um cliente por vez.
      </Card>
    );
  }

  const r = dados ? resumo(dados, escopo) : null;
  return (
    <Card className="space-y-4 p-4" data-testid="historico-card">
      <fieldset className="space-y-2" disabled={apagar.isPending}>
        <legend className="text-sm font-medium text-slate-900">O que apagar de {clientName ?? "este cliente"}</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {OPCOES.map((o) => (
            <label key={o.id} className={`cursor-pointer space-y-1 rounded-xl p-3 text-sm ring-1 ring-inset transition-colors ${escopo === o.id ? "bg-brand-50 ring-brand-500" : "bg-white ring-slate-200 hover:bg-slate-50"}`}>
              <span className="flex items-center gap-2 font-semibold text-slate-900">
                <input type="radio" name="historico-escopo" checked={escopo === o.id} onChange={() => { setEscopo(o.id); reiniciar(); setFeito(null); }} data-testid={`historico-escopo-${o.id}`} />
                {o.titulo}
              </span>
              <span className="block text-xs text-slate-600">{o.texto}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <p className="text-xs text-slate-500">
        <strong>Sempre ficam:</strong> os contatos e as marcações deles, as vendas registradas, as conversas com venda marcada, a fila do Meta que ainda não foi enviada e toda a configuração (sites, conexões, pixel, regras).
        Os contatos que ficam só perdem o detalhe de “de onde veio”.
      </p>

      {feito && <Alert tone="success"><span data-testid="historico-feito">{feito}</span></Alert>}
      {erro && <Alert tone="error">{erro}</Alert>}

      {!dados ? (
        <Button variant="secondary" loading={contagem.isPending} data-testid="historico-contar"
          onClick={() => { setFeito(null); setErro(null); contagem.mutate(clientId, { onSuccess: setDados, onError: (e) => setErro(errorMessage(e)) }); }}>
          <Trash2 className="size-4" aria-hidden /> Ver o que será apagado
        </Button>
      ) : (
        <div className="space-y-3 rounded-xl bg-red-50 p-3 ring-1 ring-inset ring-red-200" data-testid="historico-confirmar">
          <p className="text-sm font-semibold text-red-900">Vai ser apagado de {clientName ?? "este cliente"}:</p>
          <ul className="list-disc space-y-1 pl-5 text-sm text-red-900" data-testid="historico-resumo">
            {r!.linhas.map((l) => <li key={l}>{l}</li>)}
          </ul>
          {dados.site.fila_meta_pendente_mantida > 0 && escopo !== "whatsapp" && (
            <p className="text-xs text-red-800">{n(dados.site.fila_meta_pendente_mantida)} envio(s) ao Meta ainda pendente(s) ficam até serem enviados.</p>
          )}
          <p className="text-xs text-red-800">Ficam: {n(dados.mantidos.contatos)} contato(s), {n(dados.mantidos.vendas_registradas)} venda(s) registrada(s){escopo !== "site" ? ` e ${n(dados.whatsapp.conversas_com_venda_mantidas)} conversa(s) com venda` : ""}. <strong>Isto não pode ser desfeito.</strong></p>
          {r!.total === 0 ? (
            <Alert tone="info">Não há nada para apagar com essa escolha.</Alert>
          ) : (
            <div className="flex flex-wrap items-end gap-2">
              <label className="space-y-1 text-xs font-medium text-red-900">
                Para confirmar, digite APAGAR
                <Input aria-label="Digite APAGAR para confirmar" value={palavra} onChange={(e) => setPalavra(e.target.value)} placeholder="APAGAR" className="w-40" autoComplete="off" data-testid="historico-palavra" />
              </label>
              <Button loading={apagar.isPending} disabled={palavra.trim() !== "APAGAR"} data-testid="historico-apagar"
                onClick={() => apagar.mutate({ clientId, escopo, confirmar: palavra.trim() }, {
                  onSuccess: (x) => {
                    const t = [
                      escopo !== "site" ? `WhatsApp: ${n(x.whatsapp.mensagens)} mensagem(ns), ${n(x.whatsapp.pessoas)} pessoa(s), ${n(x.whatsapp.conversas)} conversa(s)` : null,
                      escopo !== "whatsapp" ? `Site: ${n(x.site.eventos)} evento(s), ${n(x.site.visitas)} visita(s), ${n(x.site.leads)} lead(s)` : null,
                    ].filter(Boolean).join(" · ");
                    setFeito(`Apagado — ${t}.`); toast.success(`Histórico apagado (${clientName ?? "cliente"}).`); reiniciar();
                  },
                  onError: (e) => setErro(errorMessage(e)),
                })}>
                <Trash2 className="size-4" aria-hidden /> Apagar para sempre
              </Button>
              <Button variant="ghost" onClick={reiniciar} disabled={apagar.isPending}>Cancelar</Button>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
