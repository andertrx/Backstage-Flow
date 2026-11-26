import { Copy, QrCode, Smartphone, Unplug } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Alert } from "@/components/ui/alert.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Modal } from "@/components/ui/modal.tsx";
import { errorMessage } from "@/lib/errors.ts";
import { useWaInstanceConnect, useWaInstanceLogout, useWaInstanceStatus, type WaInstanceState, type WhatsAppConnection } from "./api.ts";
import { confirmar } from "@/lib/confirmStore.ts";

/** Só mostra imagem que venha como PNG/JPEG/WebP em base64 (nunca um endereço qualquer). */
const SAFE_IMAGE = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;

export const WA_QR_LABEL: Record<WaInstanceState, { text: string; tone: "success" | "warning" | "neutral" | "danger" }> = {
  conectado: { text: "Conectado", tone: "success" },
  aguardando_leitura: { text: "Aguardando a leitura", tone: "warning" },
  desconectado: { text: "Desconectado", tone: "neutral" },
  erro: { text: "Erro ao falar com o servidor", tone: "danger" },
  desconhecido: { text: "Ainda não conectado", tone: "neutral" },
};

/** Intervalo entre conferências. A próxima só começa DEPOIS que a anterior terminar (o servidor de WhatsApp pode demorar). */
const POLL_MS = 3000;
/** Depois deste tempo esperando a leitura, a tela para de conferir sozinha (poupa o servidor); um botão retoma. */
const POLL_MAX_MS = 6 * 60_000;
/** O QR Code do WhatsApp vence em cerca de um minuto: pedimos um novo antes disso. */
const REFRESH_MS = 50_000;

/** Celulares do Brasil existem com e sem o 9 na frente: devolve a outra forma do número (ou null se não der). */
export function altBrPhone(input: string): string | null {
  const d = input.replace(/\D/g, "");
  const full = d.length === 10 || d.length === 11 ? `55${d}` : d;
  const m = /^55(\d{2})(\d{8,9})$/.exec(full);
  if (!m) return null;
  const [, ddd, rest] = m;
  if (rest.length === 8 && /^[6-9]/.test(rest)) return `${ddd}9${rest}`;
  if (rest.length === 9 && rest.startsWith("9")) return `${ddd}${rest.slice(1)}`;
  return null;
}

/**
 * 26/11/2026: o código de pareamento só vale se o número for EXATAMENTE o do WhatsApp do chip. Celular do Brasil tem 9 dígitos depois do DDD
 * (81 9 9839-8622), mas alguns cadastros vieram sem o 9 da frente (81 9839-8622) e o celular respondia "código incorreto".
 * Devolve o número (só dígitos, sem o 55) com o 9 na frente quando faltar; qualquer outro número volta como veio.
 */
export function numeroComNove(input: string): string {
  const d = input.replace(/\D/g, "");
  const nacional = d.startsWith("55") && d.length === 12 ? d.slice(2) : d.length === 10 ? d : null;
  if (nacional && /^[6-9]/.test(nacional.slice(2))) return `${nacional.slice(0, 2)}9${nacional.slice(2)}`;
  return d.startsWith("55") && d.length === 13 ? d.slice(2) : d;
}

export type WaQrConnection = Pick<WhatsAppConnection, "id" | "display_phone" | "phone_number_id" | "instance_name" | "gateway_state">;

/**
 * Conectar o WhatsApp do cliente por QR Code, dentro do Tracking (T5.38).
 * Quem lê o QR é a pessoa que está com o celular do cliente: WhatsApp → Aparelhos conectados → Conectar um aparelho.
 * O QR Code só aparece para quem está logado e nunca é guardado nem vai para log.
 * `autoStart`: já pede o QR ao abrir (sem precisar clicar).
 */
export function WaQrSection({ connection, autoStart = false }: { connection: WaQrConnection; autoStart?: boolean }) {
  const connect = useWaInstanceConnect();
  const status = useWaInstanceStatus();
  const logout = useWaInstanceLogout();
  const [state, setState] = useState<WaInstanceState>(connection.gateway_state ?? "desconhecido");
  const [qr, setQr] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [codeFor, setCodeFor] = useState<string | null>(null);
  const [codeNumber, setCodeNumber] = useState<string>(numeroComNove(connection.display_phone ?? connection.phone_number_id));
  const [tab, setTab] = useState<"qr" | "code">("qr");
  const [copied, setCopied] = useState(false);
  const [paused, setPaused] = useState(false);
  const [warn, setWarn] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const qrAt = useRef(0);
  const mode = useRef<"qr" | "code">("qr");
  const started = useRef(false);
  /** Só vale a resposta do pedido MAIS NOVO: um QR automático lento não pode apagar o código gerado depois, nem mostrar erro velho. */
  const reqSeq = useRef(0);
  const waiting = state === "aguardando_leitura";
  const busy = connect.isPending || logout.isPending;

  const { mutateAsync: askQr } = connect;
  const { mutateAsync: checkStatus } = status;

  async function start(kind: "qr" | "code" = "qr", numberOverride?: string) {
    mode.current = kind;
    const my = ++reqSeq.current;
    setPaused(false);
    setError(null);
    setNotice(null);
    try {
      const r = await askQr({ connectionId: connection.id, ...(kind === "code" ? { number: numberOverride ?? codeNumber } : {}) });
      if (my !== reqSeq.current) return;
      setState(r.state);
      setQr(r.qr);
      setCode(r.pairingCode ?? null);
      setCodeFor(r.pairingNumber ?? null);
      setWarn(r.message);
      qrAt.current = Date.now();
      if (r.state === "conectado") setNotice("WhatsApp conectado. As mensagens deste número já chegam ao CRM.");
    } catch (err) {
      if (my === reqSeq.current) setError(errorMessage(err));
    }
  }

  // Abre já pedindo o QR (uma vez só).
  useEffect(() => {
    if (!autoStart || started.current || state === "conectado") return;
    started.current = true;
    void start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart]);

  // Enquanto espera a leitura: confere, UMA chamada de cada vez, e renova o QR só quando está para vencer.
  useEffect(() => {
    if (!waiting || paused) return;
    const t0 = Date.now();
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      if (stopped) return;
      if (Date.now() - t0 > POLL_MAX_MS) { setPaused(true); return; }
      try {
        const r = await checkStatus(connection.id);
        if (stopped) return;
        if (r.state === "conectado") {
          setState("conectado");
          setQr(null);
          setCode(null);
          setNotice("WhatsApp conectado. As mensagens deste número já chegam ao CRM.");
          return;
        }
        // Só o QR se renova sozinho. O CÓDIGO nunca muda sozinho: quem decide é a pessoa ("Gerar outro código"),
        // senão o cliente digitaria um código que já foi trocado.
        if (mode.current === "qr" && Date.now() - qrAt.current > REFRESH_MS) {
          const mySeq = reqSeq.current;
          const q = await askQr({ connectionId: connection.id });
          if (stopped || mySeq !== reqSeq.current) return;
          setState(q.state);
          setQr(q.qr);
          setCode(q.pairingCode ?? null);
          setCodeFor(q.pairingNumber ?? null);
          qrAt.current = Date.now();
        }
      } catch {
        /* a próxima conferência tenta de novo */
      }
      if (!stopped) timer = setTimeout(tick, POLL_MS);
    };
    timer = setTimeout(tick, POLL_MS);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [waiting, paused, connection.id, checkStatus, askQr]);

  async function doLogout() {
    if (!(await confirmar("Desconectar o WhatsApp deste cliente e apagar a conexão no servidor? A próxima conexão (de qualquer número) começa do zero. Contatos e conversas já guardados continuam no CRM."))) return;
    setError(null);
    try {
      await logout.mutateAsync(connection.id);
      setState("desconectado");
      setQr(null);
      setCode(null);
      setNotice("Conexão apagada no servidor. Agora é só conectar de novo, do zero.");
    } catch (err) {
      setError(errorMessage(err));
    }
  }
  async function copyMessage() {
    if (!code) return;
    const text = `Olá! Para conectar o WhatsApp ao nosso sistema:\n1. Abra o WhatsApp no celular do número ${codeFor ?? codeNumber}.\n2. Toque em Configurações → Aparelhos conectados → Conectar um aparelho.\n3. Escolha "Conectar com número de telefone" e digite este código: ${code}\nO código vale por poucos minutos. Me avise assim que digitar.`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setNotice("Não consegui copiar automaticamente. Selecione o código e copie à mão.");
    }
  }

  const safeQr = qr && SAFE_IMAGE.test(qr) ? qr : null;
  const hasInstance = Boolean(connection.instance_name) || state !== "desconhecido";

  return (
    <section className="space-y-3" data-testid="wa-qr">
      <h4 className="font-medium text-slate-800">Conectar por QR Code</h4>
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={WA_QR_LABEL[state].tone}>{WA_QR_LABEL[state].text}</Badge>
        <span className="text-xs text-slate-500">Cada cliente tem a sua conexão: um número nunca lê as mensagens de outro.</span>
      </div>
      {error && <Alert tone="error">{error}</Alert>}
      {notice && <Alert tone="success">{notice}</Alert>}
      {warn && <Alert tone="warning">{warn}</Alert>}
      {waiting && paused && (
        <Alert tone="info">
          <div className="flex flex-wrap items-center gap-2">
            <span>Parei de conferir sozinho depois de alguns minutos, para não sobrecarregar o servidor.</span>
            <Button variant="secondary" className="px-3 py-1.5 text-xs" onClick={() => setPaused(false)}>Continuar conferindo</Button>
          </div>
        </Alert>
      )}

      {state !== "conectado" && (
        <>
          <div role="tablist" aria-label="Como conectar" className="flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1 text-sm">
            <button type="button" role="tab" aria-selected={tab === "qr"} onClick={() => setTab("qr")}
              className={`rounded-lg px-3 py-1.5 font-medium ${tab === "qr" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"}`}>
              O celular está comigo (QR Code)
            </button>
            <button type="button" role="tab" aria-selected={tab === "code"} onClick={() => setTab("code")}
              className={`rounded-lg px-3 py-1.5 font-medium ${tab === "code" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"}`}>
              O celular está em outro lugar (código)
            </button>
          </div>

          {tab === "qr" && (
            <div className="space-y-3">
              <Button loading={connect.isPending && mode.current === "qr"} disabled={busy} onClick={() => void start("qr")}>
                <QrCode className="size-4" aria-hidden /> {waiting && mode.current === "qr" ? "Gerar novo QR Code" : "Conectar por QR Code"}
              </Button>
              {connect.isPending && mode.current === "qr" && !safeQr && <p className="text-xs text-slate-500">Gerando... o servidor de WhatsApp pode levar alguns segundos.</p>}
              {waiting && safeQr && mode.current === "qr" && (
                <div className="space-y-2 rounded-xl bg-slate-50 p-4" data-testid="wa-qr-box">
                  <img src={safeQr} alt="QR Code do WhatsApp" className="size-56 rounded-lg bg-white p-2 ring-1 ring-slate-200" />
                  <ol className="list-decimal space-y-0.5 pl-5 text-xs text-slate-600">
                    <li>No celular do cliente, abra o <strong>WhatsApp</strong> do número <strong>{connection.display_phone ?? connection.phone_number_id}</strong>.</li>
                    <li>Toque em <strong>Configurações → Aparelhos conectados → Conectar um aparelho</strong>.</li>
                    <li>Aponte a câmera para este QR Code. Ele se renova sozinho; esta tela confere a cada poucos segundos.</li>
                  </ol>
                </div>
              )}
            </div>
          )}

          {tab === "code" && (
            <div className="space-y-3" data-testid="wa-qr-codigo-form">
              <div className="flex flex-wrap items-end gap-2">
                <label className="space-y-1 text-xs font-medium text-slate-600">
                  Número do WhatsApp do cliente (DDD e número)
                  <input
                    className="block w-56 rounded-xl border-0 bg-white px-3 py-2 text-sm text-slate-900 ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-inset focus:ring-brand-600"
                    inputMode="tel" aria-label="Número do chip para o código" value={codeNumber} onChange={(e) => setCodeNumber(e.target.value)} placeholder="81 99999-8888"
                  />
                </label>
                <Button loading={connect.isPending && mode.current === "code"} disabled={busy || codeNumber.replace(/\D/g, "").length < 10} onClick={() => void start("code")}>
                  <Smartphone className="size-4" aria-hidden /> {code ? "Gerar outro código" : "Gerar código"}
                </Button>
                {altBrPhone(codeNumber) && (
                  <Button variant="secondary" disabled={busy} onClick={() => { const alt = altBrPhone(codeNumber)!; setCodeNumber(alt); void start("code", alt); }}>
                    Tentar {altBrPhone(codeNumber)!.replace(/\D/g, "").length === 11 ? "com o 9" : "sem o 9"}
                  </Button>
                )}
              </div>
              <p className="text-xs text-slate-500">
                Use o número <strong>exatamente como está no WhatsApp do chip</strong> (celular do Brasil: DDD + 9 dígitos, já colocamos o 9 da frente).
                Se o celular disser “código incorreto”, toque em <strong>Tentar sem o 9</strong>. O código vale por poucos minutos: digite assim que aparecer.
              </p>
              <p className="text-xs text-slate-500">O código só muda quando você pedir outro: dá tempo de passar para o cliente. Cada código novo apaga o anterior.</p>
              {connect.isPending && mode.current === "code" && !code && <p className="text-xs text-slate-500">Gerando... o servidor de WhatsApp pode levar alguns segundos.</p>}
              {waiting && code && mode.current === "code" && (
                <div className="space-y-2 rounded-xl bg-slate-50 p-4" data-testid="wa-qr-code">
                  <p className="text-xs text-slate-600">No celular do cliente: <strong>Configurações → Aparelhos conectados → Conectar um aparelho → Conectar com número de telefone</strong>, e digite:</p>
                  <p className="font-mono text-2xl font-semibold tracking-widest text-slate-900" aria-label="Código de pareamento">{code}</p>
                  {codeFor && <p className="text-xs text-slate-500">Código gerado para o número <strong>{codeFor}</strong>. Ele precisa ser o do WhatsApp que está no celular.</p>}
                  <Button variant="secondary" className="px-3 py-1.5 text-xs" onClick={() => void copyMessage()}>
                    <Copy className="size-3.5" aria-hidden /> {copied ? "Copiado!" : "Copiar mensagem para o cliente"}
                  </Button>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {state === "conectado" && (
        <p className="text-xs text-slate-600">O celular do cliente precisa continuar com internet, e o aparelho não pode ser removido em “Aparelhos conectados”, senão a conexão cai.</p>
      )}

      {hasInstance && (
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" className="px-3 py-1.5 text-xs" loading={logout.isPending} disabled={busy} onClick={() => void doLogout()}>
            <Unplug className="size-3.5" aria-hidden /> Desconectar (começar do zero)
          </Button>
        </div>
      )}
      <p className="text-xs text-slate-500">
        Conexão por API <strong>não oficial</strong>: o WhatsApp pode bloquear números pareados assim. O texto das conversas continua sem ser guardado, a menos que você ligue “Guardar as conversas”.
      </p>
    </section>
  );
}

/** Janela só com o QR Code do cliente (aberta direto da linha do cliente em Tracking → Configurações): já pede o QR ao abrir. */
export function WaQrModal({ clientName, connection, onClose }: { clientName: string; connection: WaQrConnection; onClose: () => void }) {
  return (
    <Modal title={`Conectar o WhatsApp de ${clientName}`} open size="lg" onClose={onClose}>
      <div className="space-y-4 text-sm text-slate-700" data-testid="wa-qr-modal">
        <WaQrSection connection={connection} autoStart />
        <div className="flex justify-end"><Button type="button" onClick={onClose}>Fechar</Button></div>
      </div>
    </Modal>
  );
}
