import { Copy, KeyRound } from "lucide-react";
import { useState } from "react";
import { Alert } from "@/components/ui/alert.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Field, Input } from "@/components/ui/field.tsx";
import { Modal } from "@/components/ui/modal.tsx";
import { errorMessage } from "@/lib/errors.ts";
import { formatRelative } from "@/lib/format.ts";
import {
  type TrackingContainer,
  useWaUnofficialEnabled,
  useWaUnofficialNewKey,
  useWaAiSuggest,
  useWaStoreMessages,
  useWaUnofficialSave,
  waInboundUrl,
  type WhatsAppConnection,
} from "./api.ts";
import { waConnectionStatus } from "./logic.ts";

/** Texto de aviso que o cliente coloca no site, no botão de WhatsApp ou na primeira mensagem (Tracking T5.7). */
export const WA_PRIVACY_NOTICE =
  "Ao conversar neste WhatsApp, você concorda que seu número, seu nome e as mensagens sejam registrados para atendimento, controle de vendas e melhoria do serviço, conforme nossa Política de Privacidade (https://www.backstageflow.com.br/privacidade). Para pedir acesso ou exclusão, fale com a gente por aqui.";

function CopyLine({ label, text }: { label: string; text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-slate-600">{label}</p>
        <Button type="button" variant="ghost" className="px-2 py-1 text-xs" aria-label={`Copiar: ${label}`} onClick={async () => {
          try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { setCopied(false); }
        }}>
          <Copy className="size-3.5" aria-hidden /> {copied ? "Copiado" : "Copiar"}
        </Button>
      </div>
      <code className="block break-all rounded-lg bg-slate-50 px-3 py-2 font-mono text-xs text-slate-900">{text}</code>
    </div>
  );
}

/**
 * WhatsApp do cliente pelo SERVIDOR NÃO OFICIAL (Tracking T5.3). O servidor de conexão (estilo Evolution API) avisa o CRM
 * a cada mensagem por webhook: o CRM conta a conversa, lê o código do botão do site e a origem do anúncio de WhatsApp,
 * e marca vendas pelas frases cadastradas. O texto das conversas só é guardado se a opção do passo 4 estiver ligada (com o aviso confirmado). Só admin e gestor configuram.
 */
export function WhatsAppServerModal({ container, connection, canManage, onClose }: {
  container: TrackingContainer;
  connection: WhatsAppConnection | undefined;
  canManage: boolean;
  onClose: () => void;
}) {
  const save = useWaUnofficialSave();
  const newKey = useWaUnofficialNewKey();
  const toggle = useWaUnofficialEnabled();
  const store = useWaStoreMessages();
  const ai = useWaAiSuggest();
  const official = connection && connection.mode !== "nao_oficial";
  const [phone, setPhone] = useState(connection?.mode === "nao_oficial" ? connection.display_phone ?? "" : "");
  const [revealed, setRevealed] = useState<{ id: string; key: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [ack, setAck] = useState(false);
  const [ackChecked, setAckChecked] = useState(false);
  const status = waConnectionStatus(connection);
  const mine = connection?.mode === "nao_oficial" ? connection : undefined;
  const url = mine ? waInboundUrl(mine.id) : null;

  async function run<T>(fn: () => Promise<T>, ok?: (r: T) => void) {
    setError(null);
    setNotice(null);
    try {
      const r = await fn();
      ok?.(r);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <Modal title={`WhatsApp pelo servidor — ${container.name}`} open size="lg" onClose={onClose}>
      <div className="space-y-5 text-sm text-slate-700" data-testid="wa-server">
        <p className="text-slate-600">
          Para o número de WhatsApp do cliente ligado ao seu <strong>servidor de conexão</strong> (API não oficial). Cada mensagem avisa o CRM, que conta a
          conversa, lê o <strong>código do botão do site</strong> e a <strong>origem do anúncio de WhatsApp</strong>, e marca a venda pelas <strong>frases</strong> (Contatos → Frases do WhatsApp).
          Por padrão o texto das conversas <strong>não é guardado</strong>: o número vira código e o texto é lido só na memória. Se você ligar o passo 4, as conversas passam a ficar guardadas no CRM. Grupos são ignorados.
        </p>
        {official && <Alert tone="warning">Este site já tem WhatsApp pela API oficial. Desligue e remova essa conexão (botão “WhatsApp API”) antes de usar o servidor.</Alert>}
        {error && <Alert tone="error">{error}</Alert>}
        {notice && <Alert tone="success">{notice}</Alert>}
        {mine && (
          <div className="flex flex-wrap items-center gap-2" data-testid="wa-server-status">
            <Badge tone={status.tone}>{status.label}</Badge>
            <span className="text-xs text-slate-500">
              {mine.last_webhook_at ? `Última mensagem recebida ${formatRelative(mine.last_webhook_at)}.` : status.detail}
            </span>
          </div>
        )}

        {canManage && !official && (
          <section className="space-y-2">
            <h4 className="font-medium text-slate-800">1. Número do WhatsApp do cliente</h4>
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-56 flex-1">
                <Field label="Número com DDD (só números)">
                  {(id) => <Input id={id} value={phone} inputMode="tel" placeholder="45 99999-8888" onChange={(e) => setPhone(e.target.value)} />}
                </Field>
              </div>
              <Button loading={save.isPending} disabled={phone.replace(/\D/g, "").length < 10}
                onClick={() => run(() => save.mutateAsync({ containerId: container.id, phone }), (r) => {
                  if (r.key) setRevealed({ id: r.id, key: r.key });
                  setNotice(r.key ? "Conexão criada (desligada). Copie o endereço e a chave abaixo." : "Número atualizado.");
                })}>
                {mine ? "Atualizar número" : "Criar conexão"}
              </Button>
            </div>
          </section>
        )}

        {mine && url && (
          <section className="space-y-2">
            <h4 className="font-medium text-slate-800">2. No servidor de WhatsApp, cadastre o webhook</h4>
            <CopyLine label="Endereço (método POST)" text={url} />
            {revealed?.id === mine.id ? (
              <div className="space-y-2" data-testid="wa-server-key">
                <CopyLine label="Chave (cabeçalho x-webhook-key)" text={revealed.key} />
                <CopyLine label="Ou, se o servidor só aceita o endereço" text={`${url}&k=${revealed.key}`} />
                <Alert tone="warning">Copie agora: a chave aparece só desta vez. Se perder, gere uma nova.</Alert>
              </div>
            ) : (
              <p className="text-slate-600">Chave: ••••{mine.inbound_key_hint} (aparece só quando é criada).</p>
            )}
            <p className="text-xs text-slate-500">No servidor, ligue só o evento de <strong>mensagens</strong> (<code>MESSAGES_UPSERT</code>), inclusive as enviadas por você (para achar as frases de venda).</p>
            {canManage && (
              <Button variant="secondary" className="px-3 py-1.5 text-xs" loading={newKey.isPending}
                onClick={() => {
                  if (!window.confirm("Trocar a chave? A chave atual para de valer na hora: será preciso colar a nova no servidor de WhatsApp.")) return;
                  void run(() => newKey.mutateAsync(mine.id), (key) => setRevealed({ id: mine.id, key }));
                }}>
                <KeyRound className="size-3.5" aria-hidden /> Gerar nova chave
              </Button>
            )}
          </section>
        )}

        {mine && canManage && (
          <section className="space-y-2">
            <h4 className="font-medium text-slate-800">3. Ligue</h4>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={mine.enabled} aria-label="Ligado" onChange={(e) => run(() => toggle.mutateAsync({ id: mine.id, enabled: e.target.checked }))} />
              <span className="font-medium">Ligado</span>
              <span className="text-xs text-slate-500">(desligado: as mensagens são ignoradas)</span>
            </label>
            <Alert tone="info">
              Sem a conta oficial do WhatsApp (WABA), o Meta recebe a venda como <strong>conversa</strong> com o telefone cifrado, e não como “anúncio de WhatsApp”.
              A origem do anúncio continua registrada aqui no CRM.
            </Alert>
          </section>
        )}
        {mine && canManage && (
          <section className="space-y-2" data-testid="wa-server-store">
            <h4 className="font-medium text-slate-800">4. Guardar as conversas (para conferir vendas e a IA sugerir)</h4>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={!!mine.store_messages} aria-label="Guardar as conversas deste WhatsApp"
                onChange={(e) => {
                  if (e.target.checked && !mine.store_ack_at) { setAck(true); return; }
                  void run(() => store.mutateAsync({ id: mine.id, on: e.target.checked, ack: true }));
                }} />
              <span className="font-medium">Guardar as conversas deste WhatsApp</span>
              {mine.store_messages && !mine.store_ack_at && <Badge tone="warning">Falta confirmar o aviso</Badge>}
            </label>
            <p className="text-xs text-slate-500">
              Guarda o <strong>telefone completo</strong>, o nome do WhatsApp e o <strong>texto</strong> das conversas individuais, <strong>sem prazo</strong>: nada é apagado sozinho.
              Só administrador, gestor e o Account Manager do cliente leem (em Tracking → Painel → Conversas); só o administrador apaga. Grupos nunca entram.
              Áudio, imagem e arquivos aparecem só como marcador (“[áudio]”): o arquivo em si não é guardado.
            </p>
            {ack && (
              <Alert tone="warning">
                <div className="space-y-2" data-testid="wa-store-ack">
                  <p><strong>Antes de ligar, confirme o aviso de privacidade.</strong> A conversa só pode ser registrada se a pessoa for informada. Use este texto no site, no botão de WhatsApp ou na primeira mensagem do atendimento:</p>
                  <CopyLine label="Texto do aviso (copie e use)" text={WA_PRIVACY_NOTICE} />
                  <label className="flex items-start gap-2">
                    <input type="checkbox" className="mt-0.5" checked={ackChecked} onChange={(e) => setAckChecked(e.target.checked)} />
                    <span>Confirmo que as pessoas que falam com este WhatsApp são avisadas de que a conversa é registrada, e que o contrato e a política de privacidade do cliente permitem isso.</span>
                  </label>
                  <div className="flex gap-2">
                    <Button type="button" disabled={!ackChecked} loading={store.isPending}
                      onClick={() => void run(() => store.mutateAsync({ id: mine.id, on: true, ack: true }), () => { setAck(false); setAckChecked(false); setNotice("Guarda das conversas ligada."); })}>
                      Confirmar e ligar
                    </Button>
                    <Button type="button" variant="secondary" onClick={() => { setAck(false); setAckChecked(false); }}>Cancelar</Button>
                  </div>
                </div>
              </Alert>
            )}
          </section>
        )}
        {mine && canManage && (
          <section className="space-y-2" data-testid="wa-server-ai">
            <h4 className="font-medium text-slate-800">5. IA que sugere vendas (só este WhatsApp)</h4>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={!!mine.ai_suggest && !!mine.store_messages} disabled={!mine.store_messages || !mine.store_ack_at || ai.isPending}
                aria-label="IA que sugere vendas neste WhatsApp"
                onChange={(e) => void run(() => ai.mutateAsync({ id: mine.id, on: e.target.checked }))} />
              <span className="font-medium">IA sugere vendas nas conversas deste WhatsApp</span>
            </label>
            <p className="text-xs text-slate-500">
              Uma vez por dia (3h da manhã) a IA lê as conversas guardadas <strong>só deste cliente</strong> e sugere onde pode ter havido venda; quem decide é você (Tracking → Painel → Vendas sugeridas).
              {!mine.store_messages || !mine.store_ack_at ? " Para ligar, primeiro ligue “Guardar as conversas” (item 4). " : " "}
              Precisa também da chave e do interruptor geral da IA (Tracking → Configurações → IA de vendas sugeridas). Cada cliente novo começa com a IA <strong>desligada</strong>.
            </p>
          </section>
        )}
        {!canManage && <p className="text-slate-500">Só administrador e gestor configuram o WhatsApp do site.</p>}
        <div className="flex justify-end"><Button type="button" onClick={onClose}>Fechar</Button></div>
      </div>
    </Modal>
  );
}
