import { RefreshCw } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Alert } from "@/components/ui/alert.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Modal } from "@/components/ui/modal.tsx";

interface CapturedEvent {
  /** Corpo JSON que o script mandou (é o que chegaria no servidor). */
  body: Record<string, unknown>;
  /** Como chegou: sendBeacon (rápido, no unload) ou fetch (reserva). */
  via: "beacon" | "fetch";
}

const CHAVE = "_bfCapturado";

/**
 * Simulador do script do site.
 *
 * Carrega o `t.js` de verdade numa página de mentira (iframe) e mostra, ao vivo,
 * tudo que ele manda. Nada sai do navegador: o envio é interceptado antes de
 * chegar em qualquer servidor, então serve para conferir o script sem depender
 * de tráfego real (e também no modo demonstração).
 */
export function ScriptSimulator({ publicKey, onClose }: { publicKey: string; onClose: () => void }) {
  const [eventos, setEventos] = useState<CapturedEvent[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  // A página de mentira só pode ser montada uma vez: se o srcDoc mudar a cada
  // render, o iframe recarrega e a lista de eventos capturados zera.
  const srcDoc = useMemo(() => paginaDeTeste(publicKey), [publicKey]);

  // Recarrega o iframe: é o que dispara o script de novo e limpa a lista.
  const recarregar = () => {
    setEventos([]);
    setErro(null);
    const el = frame.current;
    if (!el) return;
    // eslint-disable-next-line no-self-assign
    el.src = el.src;
  };

  useEffect(() => {
    const t = setInterval(() => {
      const win = frame.current?.contentWindow as (Window & { [CHAVE]?: CapturedEvent[] }) | null;
      if (!win?.[CHAVE]) return;
      const novos = win[CHAVE];
      if (novos.length === eventos.length) return;
      setEventos([...novos]);
    }, 400);
    return () => clearInterval(t);
  }, [eventos.length]);

  return (
    <Modal title="Simulador do script" open onClose={onClose} size="lg">
      <div className="space-y-4 text-sm text-slate-700">
        <Alert tone="info">
          O script de verdade roda aqui dentro, numa página de mentira. <strong>Nada é enviado para o servidor</strong>: o envio é parado antes de
          sair. Serve para conferir o que o script captura — inclusive no modo demonstração, onde ainda não existe site real rodando.
        </Alert>
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-slate-500">
            Chave usada: <code className="text-slate-700">{publicKey}</code>
          </p>
          <Button type="button" variant="secondary" onClick={recarregar} data-testid="simulador-recarregar">
            <RefreshCw className="size-3.5" aria-hidden /> Recarregar
          </Button>
        </div>
        <iframe
          ref={frame}
          title="Página de teste do script de tracking"
          className="h-32 w-full rounded-xl border border-slate-200 bg-white"
          sandbox="allow-scripts allow-same-origin"
          srcDoc={srcDoc}
          data-testid="simulador-iframe"
        />
        {erro && <Alert tone="error">{erro}</Alert>}
        <div>
          <p className="mb-2 text-sm font-semibold text-slate-800" data-testid="simulador-total">
            {eventos.length === 0 ? "Nenhum evento ainda" : `${eventos.length} evento(s) capturado(s)`}
          </p>
          {eventos.length > 0 && (
            <ul className="space-y-2" data-testid="simulador-lista">
              {eventos.map((e, i) => (
                <li key={i} className="rounded-xl bg-slate-50 p-3 text-xs ring-1 ring-slate-200">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-md bg-white px-2 py-0.5 font-semibold text-slate-800 ring-1 ring-slate-200" data-testid="simulador-evento">
                      {String(e.body.n ?? "?")}
                    </span>
                    <span className="text-slate-500">{e.via}</span>
                    {e.body.c === "concedido" && <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-emerald-700 ring-1 ring-emerald-200">consentido</span>}
                  </div>
                  <dl className="mt-2 grid gap-x-4 gap-y-0.5 text-slate-600 sm:grid-cols-2">
                    <div className="break-all"><dt className="inline">Página: </dt><dd className="inline">{String(e.body.u ?? "—")}</dd></div>
                    <div className="break-all"><dt className="inline">Origem: </dt><dd className="inline">{descreverOrigem(e.body)}</dd></div>
                    <div className="break-all"><dt className="inline">Visitante: </dt><dd className="inline">{String(e.body.v ?? "—")}</dd></div>
                    <div className="break-all"><dt className="inline">Identificador: </dt><dd className="inline">{String(e.body.e ?? "—")}</dd></div>
                  </dl>
                  <details className="mt-2">
                    <summary className="cursor-pointer text-slate-500">Ver o que foi enviado</summary>
                    <pre className="mt-1 overflow-x-auto whitespace-pre-wrap break-all rounded-lg bg-slate-900 p-2 text-[11px] text-slate-100">
                      {JSON.stringify(e.body, null, 2)}
                    </pre>
                  </details>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="flex justify-end">
          <Button type="button" onClick={onClose}>Fechar</Button>
        </div>
      </div>
    </Modal>
  );
}

/** Resumo legível da origem capturada (UTMs, click-ids e IDs de anúncio). */
function descreverOrigem(body: Record<string, unknown>): string {
  const chaves = ["utm_source", "utm_medium", "utm_campaign", "fbclid", "gclid", "bf_c"];
  const achados = chaves.filter((k) => body[k]).map((k) => `${k}=${String(body[k])}`);
  return achados.length ? achados.join(" · ") : "sem parâmetros";
}

/**
 * Página de mentira: um documentinho com o mesmo script que o cliente vai colar.
 * O primeiro script intercepta o envio e guarda o corpo; o segundo é o t.js de verdade.
 */
function paginaDeTeste(publicKey: string): string {
  const endpoint = `${location.origin}/__bf_captura`;
  return `<!doctype html><html><head><meta charset="utf-8"><title>Página de teste</title>
<script>
  window.${CHAVE} = [];
  var origBeacon = navigator.sendBeacon.bind(navigator);
  navigator.sendBeacon = function (url, data) { window.${CHAVE}.push({ body: JSON.parse(data), via: "beacon" }); return true; };
  var origFetch = window.fetch.bind(window);
  window.fetch = function (url, init) {
    if (String(url).indexOf("__bf_captura") >= 0) {
      if (init && init.method === "POST") { window.${CHAVE}.push({ body: JSON.parse(init.body), via: "fetch" }); return Promise.resolve(new Response("", { status: 204 })); }
      return Promise.resolve(new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } }));
    }
    return origFetch(url, init);
  };
</script>
<script async src="/t.js" data-key="${publicKey}" data-endpoint="${endpoint}"></script>
</head><body>
<h1 style="font:16px sans-serif;padding:12px">Página de teste do tracking</h1>
<p style="font:13px sans-serif;padding:0 12px;color:#64748b">O script desta página é o mesmo que o cliente vai colar no site.</p>
</body></html>`;
}
