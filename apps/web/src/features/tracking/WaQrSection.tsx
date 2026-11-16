import { QrCode, Smartphone, Unplug } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Alert } from "@/components/ui/alert.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Modal } from "@/components/ui/modal.tsx";
import { errorMessage } from "@/lib/errors.ts";
import { useWaInstanceConnect, useWaInstanceLogout, useWaInstanceRemove, useWaInstanceStatus, type WaInstanceState, type WhatsAppConnection } from "./api.ts";

/** Só mostra imagem que venha como PNG/JPEG/WebP em base64 (nunca um endereço qualquer). */
const SAFE_IMAGE = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;

export const WA_QR_LABEL: Record<WaInstanceState, { text: string; tone: "success" | "warning" | "neutral" | "danger" }> = {
  conectado: { text: "Conectado", tone: "success" },
  aguardando_leitura: { text: "Aguardando a leitura", tone: "warning" },
  desconectado: { text: "Desconectado", tone: "neutral" },
  erro: { text: "Erro ao falar com o servidor", tone: "danger" },
  desconhecido: { text: "Ainda não conectado", tone: "neutral" },
};

const POLL_MS = 3000;
/** O QR Code do WhatsApp vence em cerca de um minuto: pedimos um novo antes disso. */
const REFRESH_MS = 40_000;

/**
 * Conectar o WhatsApp do cliente por QR Code (ou código de pareamento), dentro do Tracking (T5.38).
 * Quem lê o QR é a pessoa que está com o celular do cliente: WhatsApp → Aparelhos conectados → Conectar um aparelho.
 * O QR Code só aparece para quem está logado e nunca é guardado nem vai para log.
 */
export type WaQrConnection = Pick<WhatsAppConnection, "id" | "display_phone" | "phone_number_id" | "instance_name" | "gateway_state">;

export function WaQrSection({ connection }: { connection: WaQrConnection }) {
  const connect = useWaInstanceConnect();
  const status = useWaInstanceStatus();
  const logout = useWaInstanceLogout();
  const remove = useWaInstanceRemove();
  const [state, setState] = useState<WaInstanceState>(connection.gateway_state ?? "desconhecido");
  const [qr, setQr] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [warn, setWarn] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const mode = useRef<"qr" | "code">("qr");
  const waiting = state === "aguardando_leitura";
  const busy = connect.isPending || logout.isPending || remove.isPending;

  async function start(kind: "qr" | "code") {
    mode.current = kind;
    setError(null);
    setNotice(null);
    try {
      const r = await connect.mutateAsync({ connectionId: connection.id, ...(kind === "code" ? { number: connection.display_phone ?? connection.phone_number_id } : {}) });
      setState(r.state);
      setQr(r.qr);
      setCode(r.pairingCode);
      setWarn(r.message);
      if (r.state === "conectado") setNotice("WhatsApp conectado. As mensagens deste número já chegam ao CRM.");
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  // Enquanto espera a leitura: confere a cada 3 s e renova o QR antes de vencer.
  const { mutateAsync: checkStatus } = status;
  const { mutateAsync: refreshQr } = connect;
  useEffect(() => {
    if (!waiting) return;
    let stopped = false;
    const poll = setInterval(async () => {
      try {
        const r = await checkStatus(connection.id);
        if (stopped) return;
        if (r.state === "conectado") {
          setState("conectado");
          setQr(null);
          setCode(null);
          setNotice("WhatsApp conectado. As mensagens deste número já chegam ao CRM.");
        }
      } catch {
        /* a próxima conferência tenta de novo */
      }
    }, POLL_MS);
    const refresh = setInterval(async () => {
      try {
        const r = await refreshQr({ connectionId: connection.id, ...(mode.current === "code" ? { number: connection.display_phone ?? connection.phone_number_id } : {}) });
        if (stopped) return;
        setState(r.state);
        setQr(r.qr);
        setCode(r.pairingCode);
      } catch {
        /* mantém o QR atual até a próxima tentativa */
      }
    }, REFRESH_MS);
    return () => {
      stopped = true;
      clearInterval(poll);
      clearInterval(refresh);
    };
  }, [waiting, connection.id, connection.display_phone, connection.phone_number_id, checkStatus, refreshQr]);

  async function doLogout() {
    if (!window.confirm("Desconectar o WhatsApp deste cliente? O CRM deixa de receber as mensagens até conectar de novo.")) return;
    setError(null);
    try {
      await logout.mutateAsync(connection.id);
      setState("desconectado");
      setQr(null);
      setCode(null);
      setNotice("WhatsApp desconectado e conexão desligada.");
    } catch (err) {
      setError(errorMessage(err));
    }
  }
  async function doRemove() {
    if (!window.confirm("Remover a conexão deste cliente do servidor de WhatsApp? Contatos e conversas já guardados continuam no CRM.")) return;
    setError(null);
    try {
      await remove.mutateAsync(connection.id);
      setState("desconhecido");
      setQr(null);
      setCode(null);
      setNotice("Conexão removida do servidor. Os contatos e as conversas continuam guardados.");
    } catch (err) {
      setError(errorMessage(err));
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

      {state !== "conectado" && (
        <>
          <div className="flex flex-wrap gap-2">
            <Button loading={busy && mode.current === "qr"} disabled={busy} onClick={() => void start("qr")}>
              <QrCode className="size-4" aria-hidden /> {waiting ? "Gerar novo QR Code" : "Conectar por QR Code"}
            </Button>
            <Button variant="secondary" disabled={busy} onClick={() => void start("code")}>
              <Smartphone className="size-4" aria-hidden /> Conectar por código
            </Button>
          </div>
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
          {waiting && code && (
            <div className="space-y-2 rounded-xl bg-slate-50 p-4" data-testid="wa-qr-code">
              <p className="text-xs text-slate-600">No celular do cliente: <strong>Configurações → Aparelhos conectados → Conectar um aparelho → Conectar com número de telefone</strong>, e digite:</p>
              <p className="font-mono text-2xl font-semibold tracking-widest text-slate-900" aria-label="Código de pareamento">{code}</p>
            </div>
          )}
          {waiting && !safeQr && !code && <p className="text-xs text-slate-500">Esperando o servidor devolver o QR Code...</p>}
        </>
      )}

      {state === "conectado" && (
        <p className="text-xs text-slate-600">O celular do cliente precisa continuar com internet, e o aparelho não pode ser removido em “Aparelhos conectados”, senão a conexão cai.</p>
      )}

      {hasInstance && (
        <div className="flex flex-wrap gap-2">
          {state === "conectado" && (
            <Button variant="secondary" className="px-3 py-1.5 text-xs" loading={logout.isPending} disabled={busy} onClick={() => void doLogout()}>
              <Unplug className="size-3.5" aria-hidden /> Desconectar
            </Button>
          )}
          <Button variant="ghost" className="px-3 py-1.5 text-xs text-slate-500" loading={remove.isPending} disabled={busy} onClick={() => void doRemove()}>
            Remover conexão do servidor
          </Button>
        </div>
      )}
      <p className="text-xs text-slate-500">
        Conexão por API <strong>não oficial</strong>: o WhatsApp pode bloquear números pareados assim. O texto das conversas continua sem ser guardado, a menos que você ligue o passo 4.
      </p>
    </section>
  );
}

/** Janela só com o QR Code do cliente (aberta direto da linha do cliente em Tracking → Configurações). */
export function WaQrModal({ clientName, connection, onClose }: { clientName: string; connection: WaQrConnection; onClose: () => void }) {
  return (
    <Modal title={`Conectar o WhatsApp de ${clientName}`} open size="lg" onClose={onClose}>
      <div className="space-y-4 text-sm text-slate-700" data-testid="wa-qr-modal">
        <WaQrSection connection={connection} />
        <div className="flex justify-end"><Button type="button" onClick={onClose}>Fechar</Button></div>
      </div>
    </Modal>
  );
}
