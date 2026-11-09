import { AlertTriangle, KeyRound, Power, QrCode, RefreshCw, Smartphone, Unplug } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { Alert } from "@/components/ui/alert.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Card } from "@/components/ui/card.tsx";
import { Field, Input } from "@/components/ui/field.tsx";
import { errorMessage } from "@/lib/errors.ts";
import { formatDateTime } from "@/lib/format.ts";
import { useSaveWaGateway, useSetWaEnabled, useWaConnect, useWaGateway, useWaLogout, useWaStatus, type WaConnectResult, type WaGatewaySettings, type WaState } from "./waGatewayApi.ts";

const STATE: Record<WaState, { label: string; tone: "success" | "neutral" | "warning" | "danger" }> = {
  conectado: { label: "WhatsApp conectado", tone: "success" },
  aguardando_leitura: { label: "Esperando você ler o QR Code ou digitar o código", tone: "warning" },
  desconectado: { label: "WhatsApp desconectado", tone: "neutral" },
  erro: { label: "Erro ao falar com o servidor", tone: "danger" },
  desconhecido: { label: "Ainda não conectado", tone: "neutral" },
};

/**
 * Etapa 44.1 — conexão do WhatsApp por API NÃO OFICIAL (só administrador). Nesta fase nada é enviado:
 * aqui se salva o servidor de conexão, se conecta o chip (QR Code ou código) e fica a trava geral dos envios automáticos.
 */
export function WaGatewayCard() {
  const settings = useWaGateway(true);
  const save = useSaveWaGateway();
  const setEnabled = useSetWaEnabled();
  const status = useWaStatus();
  const connect = useWaConnect();
  const logout = useWaLogout();
  const s: WaGatewaySettings | null | undefined = settings.data;
  const [baseUrl, setBaseUrl] = useState("");
  const [instance, setInstance] = useState("backstage");
  const [apiKey, setApiKey] = useState("");
  const [risk, setRisk] = useState(false);
  const [phone, setPhone] = useState("");
  const [shown, setShown] = useState<WaConnectResult | null>(null);
  const [message, setMessage] = useState<{ tone: "success" | "error" | "info"; text: string } | null>(null);
  const [loaded, setLoaded] = useState<WaGatewaySettings | null>(null);
  if (s && s !== loaded) {
    setLoaded(s);
    setBaseUrl(s.base_url ?? ""); setInstance(s.instance_name);
  }

  // Enquanto espera a leitura, confere a cada 4 segundos (até 2 minutos).
  const waiting = s?.connection_state === "aguardando_leitura";
  useEffect(() => {
    if (!waiting) return;
    let n = 0;
    const t = setInterval(() => { n++; if (n > 30) clearInterval(t); else status.mutate(); }, 4000);
    return () => clearInterval(t);
  }, [waiting]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (s?.connection_state === "conectado") setShown(null); }, [s?.connection_state]);

  async function run(fn: () => Promise<string | null>) {
    setMessage(null);
    try {
      const text = await fn();
      if (text) setMessage({ tone: "success", text });
    } catch (err) { setMessage({ tone: "error", text: errorMessage(err) }); }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!s?.risk_accepted_at && !risk) return setMessage({ tone: "error", text: "Marque que você entende o risco antes de salvar." });
    if (!/^https:\/\//i.test(baseUrl.trim())) return setMessage({ tone: "error", text: "O endereço do servidor precisa começar com https://." });
    if (!s?.has_key && !apiKey.trim()) return setMessage({ tone: "error", text: "Cole a chave de acesso do servidor." });
    void run(async () => {
      await save.mutateAsync({ baseUrl, instance, apiKey, acceptRisk: risk });
      const hadKey = Boolean(apiKey.trim());
      setApiKey(""); setShown(null);
      return hadKey ? "Salvo. A chave foi para o cofre. Agora conecte o chip." : "Salvo.";
    });
  }

  const state = s?.connection_state ?? "desconhecido";
  const ready = Boolean(s?.base_url && s.has_key && s.risk_accepted_at);

  return (
    <Card className="space-y-5 p-6" data-testid="wa-gateway-card">
      <div className="flex gap-3">
        <Smartphone className="mt-0.5 size-5 text-slate-400" aria-hidden />
        <div className="min-w-0">
          <h2 className="flex flex-wrap items-center gap-2 text-base font-semibold">
            WhatsApp para envios automáticos <Badge tone="warning">Não oficial</Badge>
          </h2>
          <p className="text-sm text-slate-500">
            Conecta o seu chip (por QR Code ou código) para o CRM enviar sozinho os envios semanais aprovados nos grupos dos clientes, sem o navegador.
            <strong> Nesta etapa nada é enviado:</strong> só a conexão e a trava geral.
          </p>
        </div>
      </div>

      <Alert tone="warning">
        <span className="flex gap-2"><AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>Conexão <strong>não oficial</strong>: o WhatsApp não permite isso e pode <strong>banir o número</strong>, sem aviso. Use um chip separado. O CRM só envia o que você aprovou na semana, com pausa entre os grupos, e você pode desligar tudo aqui a qualquer hora.</span>
        </span>
      </Alert>

      {settings.error ? <Alert tone="error">{errorMessage(settings.error)}</Alert> : null}

      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Endereço do servidor de conexão" hint="O endereço seguro (https://) do servidor onde o programa de conexão está instalado.">
            {(id) => <Input id={id} value={baseUrl} placeholder="https://whats.seudominio.com.br" autoComplete="off" spellCheck={false} onChange={(e) => setBaseUrl(e.target.value)} />}
          </Field>
          <Field label="Nome da instância" hint="Só letras, números, - e _.">
            {(id) => <Input id={id} value={instance} maxLength={60} onChange={(e) => setInstance(e.target.value)} />}
          </Field>
          <Field label={s?.has_key ? "Trocar a chave de acesso (opcional)" : "Chave de acesso do servidor"} hint="Colada aqui, vai direto para o cofre criptografado e nunca volta para a tela. Nunca envie a chave por chat.">
            {(id) => <Input id={id} type="password" autoComplete="off" spellCheck={false} value={apiKey} onChange={(e) => setApiKey(e.target.value)} />}
          </Field>
        </div>
        {s?.risk_accepted_at ? (
          <p className="text-sm text-slate-600" data-testid="wa-risk-accepted">Risco aceito em {formatDateTime(s.risk_accepted_at)}.</p>
        ) : (
          <label className="flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-sm text-slate-800">
            <input type="checkbox" className="mt-0.5" checked={risk} onChange={(e) => setRisk(e.target.checked)} />
            <span><strong>Entendo o risco:</strong> esta conexão não é oficial, o WhatsApp pode banir o número, e eu uso um chip separado.</span>
          </label>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" loading={save.isPending}>Salvar</Button>
          {s?.has_key && <span className="inline-flex items-center gap-1.5 text-sm text-slate-600"><KeyRound className="size-4 text-slate-400" aria-hidden />Chave no cofre{s.key_updated_at && <> desde {formatDateTime(s.key_updated_at)}</>}</span>}
        </div>
      </form>

      {message && <Alert tone={message.tone}>{message.text}</Alert>}

      <div className="space-y-3 rounded-xl bg-slate-50 p-4" data-testid="wa-connection">
        <div className="space-y-1 text-sm text-slate-700" data-testid="wa-health">
          {s?.owner_tail ? (
            <p>
              Número ligado: <strong>final {s.owner_tail}</strong>{s.profile_name ? <> · perfil <strong>{s.profile_name}</strong></> : null}.
              {" "}Confira se é o chip certo: ele serve para os avisos nos grupos e para ler as conversas do cliente.
            </p>
          ) : (
            <p className="text-slate-500">Nenhum número ligado ainda.</p>
          )}
          {s?.health_state && s.health_state !== "conectado" && (
            <p className="text-red-700" data-testid="wa-health-problem">
              Sem conexão{s.health_since ? ` desde ${formatDateTime(s.health_since)}` : ""}: {s.health_message ?? "sem detalhe"}
            </p>
          )}
          <p className="text-xs text-slate-500">
            O CRM confere o servidor a cada 5 minutos{s?.last_ok_at ? ` (última resposta boa: ${formatDateTime(s.last_ok_at)})` : ""}. Se ficar fora por mais de 10 minutos,
            você recebe um aviso no sino (Alertas → Tarefas) e outro quando voltar.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={STATE[state].tone}>{STATE[state].label}</Badge>
          {s?.last_check_at && <span className="text-xs text-slate-500">conferido {formatDateTime(s.last_check_at)}</span>}
          {s?.last_error && <span className="text-xs text-red-700">{s.last_error}</span>}
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <Button type="button" disabled={!ready || connect.isPending || state === "conectado"} loading={connect.isPending && !phone.trim()}
            onClick={() => void run(async () => { const r = await connect.mutateAsync(undefined); setShown(r); return r.message; })}>
            <QrCode className="size-4" aria-hidden /> Conectar por QR Code
          </Button>
          <div className="flex flex-wrap items-end gap-2">
            <Field label="ou, pelo código: telefone do chip" hint="Com DDD. No celular: WhatsApp → Aparelhos conectados → Conectar com número de telefone.">
              {(id) => <Input id={id} value={phone} inputMode="tel" placeholder="11 98765-4321" onChange={(e) => setPhone(e.target.value)} />}
            </Field>
            <Button type="button" variant="secondary" disabled={!ready || !phone.trim() || connect.isPending || state === "conectado"} loading={connect.isPending && Boolean(phone.trim())}
              onClick={() => void run(async () => { const r = await connect.mutateAsync(phone); setShown(r); return r.message; })}>
              Gerar código
            </Button>
          </div>
          <Button type="button" variant="ghost" disabled={!ready || status.isPending} loading={status.isPending}
            onClick={() => void run(async () => { const r = await status.mutateAsync(); return r.message ?? "Conexão conferida."; })}>
            <RefreshCw className="size-4" aria-hidden /> Verificar agora
          </Button>
          {state === "conectado" && (
            <Button type="button" variant="ghost" loading={logout.isPending}
              onClick={() => window.confirm("Desconectar o WhatsApp? Os envios automáticos desligam.") && void run(async () => { await logout.mutateAsync(); return "WhatsApp desconectado."; })}>
              <Unplug className="size-4" aria-hidden /> Desconectar
            </Button>
          )}
        </div>
        {shown?.qr && (
          <div className="flex flex-wrap items-center gap-4" data-testid="wa-qr">
            <img src={shown.qr} alt="QR Code para conectar o WhatsApp" className="size-48 rounded-lg bg-white p-2 ring-1 ring-slate-200" style={{ imageRendering: "pixelated" }} />
            <p className="max-w-xs text-sm text-slate-600">No celular do chip: WhatsApp → Aparelhos conectados → Conectar um aparelho → aponte para este QR Code. Ele muda sozinho; se expirar, clique de novo.</p>
          </div>
        )}
        {shown?.pairingCode && (
          <div data-testid="wa-pairing">
            <p className="text-sm text-slate-600">Digite este código no WhatsApp do chip:</p>
            <p className="mt-1 text-3xl font-semibold tracking-[0.3em] text-slate-900">{shown.pairingCode}</p>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl p-4 ring-1 ring-slate-200" data-testid="wa-switch">
        <div className="min-w-0">
          <p className="flex items-center gap-2 font-semibold"><Power className="size-4" aria-hidden />Envios automáticos: {s?.enabled ? <span className="text-emerald-700">LIGADOS</span> : <span className="text-slate-600">DESLIGADOS</span>}</p>
          <p className="text-sm text-slate-500">Trava geral. Desliga sozinha se o WhatsApp desconectar ou se você mudar o servidor. Só liga com o WhatsApp conectado.</p>
        </div>
        {s?.enabled ? (
          <Button variant="secondary" loading={setEnabled.isPending} onClick={() => void run(async () => { await setEnabled.mutateAsync(false); return "Envios automáticos desligados."; })}>Desligar tudo</Button>
        ) : (
          <Button disabled={state !== "conectado"} loading={setEnabled.isPending} onClick={() => void run(async () => { await setEnabled.mutateAsync(true); return "Envios automáticos ligados. (A próxima etapa é que vai enviar de fato.)"; })}>Ligar</Button>
        )}
      </div>
    </Card>
  );
}
