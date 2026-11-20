import { useQueryClient } from "@tanstack/react-query";
import { MessageSquareText, Plus, QrCode, Settings2, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import { Alert } from "@/components/ui/alert.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Card } from "@/components/ui/card.tsx";
import { Input } from "@/components/ui/field.tsx";
import { IconButton } from "@/components/ui/icon-button.tsx";
import { useAuth } from "@/features/auth/AuthProvider.tsx";
import { can } from "@backstage/shared";
import { errorMessage } from "@/lib/errors.ts";
import { formatDataCurta } from "@/lib/format.ts";
import { type Destination, type TrackingContainer, useExcludedWhatsAppContainers, useWaSemSiteContainer, type WhatsAppConnection } from "./api.ts";
import { ExcluirWhatsApp } from "./ExcluirWhatsApp.tsx";
import { usoRecente, waConnectionStatus } from "./logic.ts";
import { WA_QR_LABEL, WaQrModal } from "./WaQrSection.tsx";

type Tone = "neutral" | "brand" | "success" | "warning" | "danger";
type Estado = "nenhum" | "conectado" | "aguardando" | "desligado" | "atencao";
type Filtro = "todos" | "conectados" | "atencao" | "sem-whatsapp" | "sem-site";

const POR_PAGINA = 30;
const FILTROS: { id: Filtro; label: string }[] = [
  { id: "todos", label: "Todos" },
  { id: "conectados", label: "Conectados" },
  { id: "atencao", label: "Precisam de atenção" },
  { id: "sem-whatsapp", label: "Sem WhatsApp" },
  { id: "sem-site", label: "Sem site" },
];

/** (81) 99506-7876 a partir de 5581995067876; número de fora do Brasil fica como veio. */
export function formatTelefone(raw: string | null | undefined): string {
  const d = (raw ?? "").replace(/\D/g, "");
  const nacional = d.startsWith("55") && d.length >= 12 ? d.slice(2) : null;
  if (!nacional) return d ? `+${d}` : "";
  const ddd = nacional.slice(0, 2);
  const resto = nacional.slice(2);
  return `(${ddd}) ${resto.length === 9 ? `${resto.slice(0, 5)}-${resto.slice(5)}` : `${resto.slice(0, 4)}-${resto.slice(4)}`}`;
}

const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

/** Uma situação só por tipo de WhatsApp, em palavras simples. */
function estadoDe(conn: WhatsAppConnection | undefined): { estado: Estado; tone: Tone; label: string; detalhe?: string } {
  if (!conn) return { estado: "nenhum", tone: "neutral", label: "Não ligado" };
  const st = waConnectionStatus(conn);
  const label = cap(st.label.replace(/^Servidor:\s*/, ""));
  if (conn.mode === "nao_oficial" && conn.instance_name && conn.gateway_state && conn.gateway_state !== "conectado") {
    const q = WA_QR_LABEL[conn.gateway_state];
    return { estado: conn.gateway_state === "aguardando_leitura" ? "aguardando" : conn.gateway_state === "erro" ? "atencao" : "desligado", tone: q.tone,
      label: conn.gateway_state === "erro" ? "Erro no servidor" : q.text, detalhe: conn.gateway_state === "erro" ? q.text : undefined };
  }
  if (conn.mode === "nao_oficial" && conn.gateway_state === "conectado" && !conn.last_webhook_at) return { estado: "conectado", tone: "success", label: "Conectado", detalhe: "Conectado, esperando a 1ª mensagem" };
  const estado: Estado = st.tone === "success" ? "conectado" : st.tone === "danger" ? "atencao" : st.tone === "warning" ? "aguardando" : "desligado";
  return { estado, tone: st.tone as Tone, label };
}

/**
 * Tracking → Configurações → "Clientes: site e/ou WhatsApp": o ÚNICO lugar do WhatsApp de cada cliente.
 * Computador: uma linha por cliente, em colunas (Cliente · Site · WhatsApp · API oficial). Celular: um cartão por cliente.
 * Feita para lista grande: busca, filtros e "mostrar mais" (30 por vez), sem rolagem dentro de rolagem.
 */
export function ClienteSiteWhatsApp({ clients, containers, connectionOf, destinationOf, onAddSite, onWhatsApp, onWhatsAppApi, onPixel }: {
  clients: { id: string; name: string }[];
  containers: TrackingContainer[];
  connectionOf: (containerId: string) => WhatsAppConnection | undefined;
  onAddSite: (clientId: string) => void;
  onWhatsApp: (c: TrackingContainer) => void;
  onWhatsAppApi: (c: TrackingContainer) => void;
  /** Pixel do Meta (API de Conversões) de um recipiente do cliente. */
  destinationOf: (containerId: string) => Destination | undefined;
  /** Abre a configuração do pixel do cliente naquele recipiente. */
  onPixel: (c: TrackingContainer) => void;
}) {
  const semSite = useWaSemSiteContainer();
  const excluidos = new Set(useExcludedWhatsAppContainers(true).data ?? []);
  const podeGerenciar = can(useAuth().profile?.role, "tracking.manage");
  const queryClient = useQueryClient();
  const [qrDe, setQrDe] = useState<{ clienteId: string; nome: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [mostrar, setMostrar] = useState(POR_PAGINA);
  const [avisos, setAvisos] = useState<Record<string, { tone: "success" | "error"; text: string } | null>>({});

  /** As conexões do cliente, separadas por tipo: servidor próprio (não oficial) e API oficial. */
  function conexoesDe(clientId: string) {
    const mine = containers.filter((c) => c.client_id === clientId);
    const porModo = (servidor: boolean) => {
      const container = mine.find((c) => {
        const cn = connectionOf(c.id);
        return cn ? (servidor ? cn.mode === "nao_oficial" : cn.mode !== "nao_oficial") : false;
      });
      return { container, connection: container ? connectionOf(container.id) : undefined };
    };
    return { mine, sites: mine.filter((c) => c.kind !== "whatsapp" && !c.excluded_at), servidor: porModo(true), oficial: porModo(false) };
  }

  /**
   * Onde cada tipo de WhatsApp entra:
   *  - servidor próprio: no container técnico do cliente (kind 'whatsapp'), para não ocupar o site;
   *  - API oficial: no site (é lá que o clique do botão do WhatsApp do site acontece).
   * Se já existe conexão desse tipo, ela manda: o que já está ligado não se move.
   */
  async function ligarWhatsApp(clientId: string, tipo: "servidor" | "oficial") {
    const abrir = tipo === "servidor" ? onWhatsApp : onWhatsAppApi;
    setErro(null);
    const { mine, sites } = conexoesDe(clientId);
    const doTipo = mine.find((c) => {
      const cn = connectionOf(c.id);
      return cn ? (tipo === "servidor" ? cn.mode === "nao_oficial" : cn.mode !== "nao_oficial") : false;
    });
    if (doTipo) { abrir(doTipo); return; }
    const alvo = tipo === "servidor" ? mine.find((c) => c.kind === "whatsapp") : sites[0];
    if (alvo) { abrir(alvo); return; }
    const livre = mine.find((c) => !connectionOf(c.id) && !excluidos.has(c.id));
    if (livre && tipo === "oficial") { abrir(livre); return; }
    setBusy(clientId);
    try {
      const id = await semSite.mutateAsync(clientId);
      await queryClient.refetchQueries({ queryKey: ["tracking", "containers"] });
      const c = (queryClient.getQueryData<TrackingContainer[]>(["tracking", "containers"]) ?? []).find((x) => x.id === id);
      if (c) abrir(c);
    } catch (e) { setErro(errorMessage(e)); } finally { setBusy(null); }
  }

  /** Um pixel por cliente: o que estiver ligado em qualquer recipiente dele (site ou WhatsApp). */
  function pixelDe(clientId: string) {
    const mine = containers.filter((c) => c.client_id === clientId && !c.excluded_at);
    const comPixel = mine.find((c) => destinationOf(c.id));
    return { container: comPixel, destination: comPixel ? destinationOf(comPixel.id) : undefined };
  }

  /** Abre o pixel: no recipiente que já tem pixel; senão no site; senão no recipiente técnico do WhatsApp (criado na hora, se preciso). */
  async function abrirPixel(clientId: string) {
    setErro(null);
    const { container } = pixelDe(clientId);
    if (container) { onPixel(container); return; }
    const mine = containers.filter((c) => c.client_id === clientId && !c.excluded_at);
    const alvo = mine.find((c) => c.kind !== "whatsapp") ?? mine.find((c) => c.kind === "whatsapp");
    if (alvo) { onPixel(alvo); return; }
    setBusy(clientId);
    try {
      const id = await semSite.mutateAsync(clientId);
      await queryClient.refetchQueries({ queryKey: ["tracking", "containers"] });
      const c = (queryClient.getQueryData<TrackingContainer[]>(["tracking", "containers"]) ?? []).find((x) => x.id === id);
      if (c) onPixel(c);
    } catch (e) { setErro(errorMessage(e)); } finally { setBusy(null); }
  }

  // Situação de cada cliente, calculada uma vez (a busca e os filtros usam isto).
  const linhas = useMemo(() => clients.map((cl) => {
    const dados = conexoesDe(cl.id);
    return { cl, ...dados, est: estadoDe(dados.servidor.connection), estOficial: estadoDe(dados.oficial.connection) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [clients, containers, connectionOf]);

  const q = busca.trim().toLowerCase();
  const filtradas = linhas.filter((l) => {
    if (q && !l.cl.name.toLowerCase().includes(q) && !l.sites.some((s) => (s.allowed_domains[0] ?? s.name).toLowerCase().includes(q))) return false;
    if (filtro === "conectados") return l.est.estado === "conectado" || l.estOficial.estado === "conectado";
    if (filtro === "atencao") return l.est.estado === "atencao" || l.estOficial.estado === "atencao" || l.est.estado === "aguardando";
    if (filtro === "sem-whatsapp") return l.est.estado === "nenhum" && l.estOficial.estado === "nenhum";
    if (filtro === "sem-site") return l.sites.length === 0;
    return true;
  });
  const visiveis = filtradas.slice(0, mostrar);
  const contagem = (f: Filtro) => linhas.filter((l) =>
    f === "conectados" ? l.est.estado === "conectado" || l.estOficial.estado === "conectado"
    : f === "atencao" ? l.est.estado === "atencao" || l.estOficial.estado === "atencao" || l.est.estado === "aguardando"
    : f === "sem-whatsapp" ? l.est.estado === "nenhum" && l.estOficial.estado === "nenhum"
    : f === "sem-site" ? l.sites.length === 0 : true).length;

  return (
    <Card className="@container space-y-4 p-3 sm:p-4" data-testid="cli-site-whatsapp">
      {/* Busca e filtros */}
      <div className="space-y-3">
        <Input aria-label="Buscar cliente" placeholder="Buscar cliente ou site" value={busca} onChange={(e) => { setBusca(e.target.value); setMostrar(POR_PAGINA); }} />
        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1" role="group" aria-label="Filtrar clientes">
          {FILTROS.map((f) => (
            <button key={f.id} type="button" aria-pressed={filtro === f.id} onClick={() => { setFiltro(f.id); setMostrar(POR_PAGINA); }}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset transition-colors ${filtro === f.id ? "bg-brand-600 text-white ring-brand-600" : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50"}`}>
              {f.label}
              <span className={`tabular-nums ${filtro === f.id ? "text-white/80" : "text-slate-400"}`}>{contagem(f.id)}</span>
            </button>
          ))}
        </div>
      </div>
      {erro && <Alert tone="error">{erro}</Alert>}

      <div className="overflow-hidden rounded-xl ring-1 ring-slate-200">
        {/* Cabeçalho das colunas (só no computador) */}
        <div className="hidden grid-cols-[minmax(6rem,0.7fr)_minmax(6rem,0.7fr)_minmax(26rem,2.6fr)_minmax(8.5rem,0.7fr)_minmax(10rem,0.8fr)] items-center gap-4 border-b border-slate-200 bg-slate-50 px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500 @[64rem]:grid" aria-hidden>
          <span>Cliente</span><span>Site</span><span className="@[64rem]:pl-4">WhatsApp (servidor próprio)</span><span className="@[64rem]:pl-4">API oficial</span><span className="@[64rem]:pl-4">Pixel do Meta</span>
        </div>
        <ul className="divide-y divide-slate-100">
          {visiveis.map(({ cl, sites, servidor, oficial, est, estOficial }) => {
            const cn = servidor.connection;
            const uso = usoRecente(cn?.last_webhook_at ?? null, Date.now());
            const usoOficial = usoRecente(oficial.connection?.last_webhook_at ?? null, Date.now());
            const guardando = Boolean(cn && cn.mode === "nao_oficial" && cn.store_messages && cn.store_ack_at);
            return (
              <li key={cl.id} className="grid gap-x-4 gap-y-3 px-3 py-3 sm:px-4 @[64rem]:grid-cols-[minmax(6rem,0.7fr)_minmax(6rem,0.7fr)_minmax(26rem,2.6fr)_minmax(8.5rem,0.7fr)_minmax(10rem,0.8fr)] @[64rem]:items-center @[64rem]:py-2.5" data-testid="cli-site-whatsapp-row">
                {/* Cliente */}
                <p className="truncate text-sm font-semibold text-slate-900" title={cl.name}>{cl.name}</p>

                {/* Site */}
                <div className="flex min-w-0 flex-wrap items-center gap-1.5" data-testid="cli-site-coluna">
                  <span className="w-20 shrink-0 text-[11px] font-semibold uppercase tracking-wide text-slate-400 @[64rem]:hidden">Site</span>
                  {sites.length === 0 && <span className="text-xs text-slate-400">sem site</span>}
                  {sites.slice(0, 2).map((s) => (
                    <Badge key={s.id} tone={s.status === "ativo" ? "success" : "neutral"} title={s.status === "ativo" ? undefined : "Site pausado"}>
                      <span className="block max-w-[10rem] truncate">{s.allowed_domains[0] ?? s.name}</span>
                    </Badge>
                  ))}
                  {sites.length > 2 && <span className="text-xs text-slate-500">+{sites.length - 2}</span>}
                  {sites.length === 1 && sites[0]!.allowed_domains.length > 1 && <span className="text-xs text-slate-500">+{sites[0]!.allowed_domains.length - 1} domínio(s)</span>}
                  {sites.some((s) => s.status !== "ativo") && <span className="text-xs text-slate-400 @[64rem]:hidden">pausado</span>}
                  <IconButton size="sm" label={`${sites.length ? "Adicionar outro site" : "Adicionar site"} de ${cl.name}`} icon={<Plus />} onClick={() => onAddSite(cl.id)} />
                </div>

                {/* WhatsApp do servidor próprio: situação + ações, numa linha */}
                <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-2 @[64rem]:flex-nowrap @[64rem]:border-l @[64rem]:border-slate-100 @[64rem]:pl-4" data-testid="cli-whatsapp-coluna">
                  <span className="w-20 shrink-0 text-[11px] font-semibold uppercase tracking-wide text-slate-400 @[64rem]:hidden">WhatsApp</span>
                  {est.estado === "nenhum" ? <span className="whitespace-nowrap text-xs text-slate-400">Não ligado</span> : <Badge tone={est.tone} title={est.detalhe}><span className="whitespace-nowrap">{est.label}</span></Badge>}
                  {cn?.display_phone && <span className="whitespace-nowrap text-xs tabular-nums text-slate-500">{formatTelefone(cn.display_phone)}</span>}
                  {guardando && <span title="Guardando as conversas deste WhatsApp" className="text-slate-400"><MessageSquareText className="size-4" aria-label="Guardando as conversas" role="img" /></span>}
                  {guardando && cn?.ai_suggest && <span title="IA sugerindo vendas" className="text-brand-600"><Sparkles className="size-4" aria-label="IA sugerindo vendas" role="img" /></span>}
                  {uso.level === "atencao" && <Badge tone="warning" data-testid="wa-sem-uso">Sem uso desde {formatDataCurta(cn!.last_webhook_at!)}</Badge>}
                  <span className="flex items-center gap-1" data-testid="wa-detalhe-servidor">
                    {cn?.mode === "nao_oficial" && podeGerenciar && (
                      <Button className="px-3 py-1 text-xs" variant={est.estado === "conectado" ? "secondary" : "primary"} onClick={() => setQrDe({ clienteId: cl.id, nome: cl.name })} aria-label={`Conectar o WhatsApp de ${cl.name}`}>
                        <QrCode className="size-3.5" aria-hidden /> {est.estado === "conectado" ? "Reconectar" : "Conectar"}
                      </Button>
                    )}
                    {cn ? (
                      <IconButton size="sm" label={`Configurar WhatsApp de ${cl.name}`} icon={<Settings2 />} onClick={() => void ligarWhatsApp(cl.id, "servidor")} />
                    ) : (
                      <Button variant="ghost" className="px-3 py-1 text-xs font-semibold text-brand-700 hover:bg-brand-50" loading={busy === cl.id} onClick={() => void ligarWhatsApp(cl.id, "servidor")} aria-label={`Ligar WhatsApp de ${cl.name}`}>Ligar</Button>
                    )}
                    {cn?.mode === "nao_oficial" && podeGerenciar && (
                      <ExcluirWhatsApp connectionId={cn.id} instanceName={cn.instance_name} clientName={cl.name} onMessage={(m) => setAvisos((a) => ({ ...a, [cl.id]: m }))} />
                    )}
                  </span>
                </div>

                {/* API oficial */}
                <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-2 @[64rem]:flex-nowrap @[64rem]:border-l @[64rem]:border-slate-100 @[64rem]:pl-4">
                  <span className="w-20 shrink-0 text-[11px] font-semibold uppercase tracking-wide text-slate-400 @[64rem]:hidden">API oficial</span>
                  {estOficial.estado === "nenhum" ? <span className="whitespace-nowrap text-xs text-slate-400">Não ligado</span> : <Badge tone={estOficial.tone}><span className="whitespace-nowrap">{estOficial.label}</span></Badge>}
                  {usoOficial.level === "atencao" && <Badge tone="warning" data-testid="wa-sem-uso">Sem uso desde {formatDataCurta(oficial.connection!.last_webhook_at!)}</Badge>}
                  <Button variant={oficial.connection ? "secondary" : "ghost"} className={`px-3 py-1 text-xs ${oficial.connection ? "" : "font-semibold text-brand-700 hover:bg-brand-50"}`} loading={busy === cl.id} onClick={() => void ligarWhatsApp(cl.id, "oficial")}
                    aria-label={`${oficial.connection ? "Configurar API oficial" : "Ligar pela API oficial"} de ${cl.name}`}>
                    {oficial.connection ? "Configurar" : "Ligar"}
                  </Button>
                </div>

                {/* Pixel do Meta: um por cliente (vale para o site e para o WhatsApp) */}
                {(() => {
                  const px = pixelDe(cl.id);
                  const pronto = Boolean(px.destination?.enabled && px.destination.has_token);
                  return (
                    <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-2 @[64rem]:flex-nowrap @[64rem]:border-l @[64rem]:border-slate-100 @[64rem]:pl-4" data-testid="cli-pixel-coluna">
                      <span className="w-20 shrink-0 text-[11px] font-semibold uppercase tracking-wide text-slate-400 @[64rem]:hidden">Pixel</span>
                      {!px.destination ? <span className="whitespace-nowrap text-xs text-slate-400">Sem pixel</span>
                        : pronto ? <Badge tone="success" title={`Pixel ${px.destination.pixel_id}`}><span className="whitespace-nowrap">Ligado ···{px.destination.pixel_id.slice(-4)}</span></Badge>
                        : <Badge tone="warning" title="Falta o token ou o envio está desligado"><span className="whitespace-nowrap">Incompleto</span></Badge>}
                      {podeGerenciar && (px.destination
                        ? <IconButton size="sm" label={`Configurar pixel de ${cl.name}`} icon={<Settings2 />} onClick={() => void abrirPixel(cl.id)} />
                        : <Button variant="ghost" className="px-3 py-1 text-xs font-semibold text-brand-700 hover:bg-brand-50" loading={busy === cl.id}
                            onClick={() => void abrirPixel(cl.id)} aria-label={`Ligar pixel de ${cl.name}`}>Ligar</Button>)}
                    </div>
                  );
                })()}

                {avisos[cl.id] && (
                  <div className="@[64rem]:col-span-5"><Alert tone={avisos[cl.id]!.tone}>{avisos[cl.id]!.text}</Alert></div>
                )}
              </li>
            );
          })}
          {filtradas.length === 0 && <li className="px-4 py-8 text-center text-sm text-slate-500">Nenhum cliente encontrado{q || filtro !== "todos" ? " com esse filtro" : ""}.</li>}
        </ul>
      </div>

      {/* Rodapé: quantos aparecem e "mostrar mais" */}
      {filtradas.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
          <span>Mostrando {visiveis.length} de {filtradas.length} cliente(s)</span>
          {visiveis.length < filtradas.length && (
            <Button variant="secondary" className="px-3 py-1.5 text-xs" onClick={() => setMostrar((n) => n + POR_PAGINA)}>Mostrar mais {Math.min(POR_PAGINA, filtradas.length - visiveis.length)}</Button>
          )}
        </div>
      )}

      {qrDe && (() => {
        const conn = conexoesDe(qrDe.clienteId).servidor.connection;
        return conn ? <WaQrModal clientName={qrDe.nome} connection={conn} onClose={() => setQrDe(null)} /> : null;
      })()}
    </Card>
  );
}
