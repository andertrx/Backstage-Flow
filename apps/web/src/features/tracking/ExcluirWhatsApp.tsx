import { Trash2 } from "lucide-react";
import { useState } from "react";
import { Alert } from "@/components/ui/alert.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/field.tsx";
import { Modal } from "@/components/ui/modal.tsx";
import { errorMessage } from "@/lib/errors.ts";
import { useExcludeWhatsApp, useWaInstanceLogout } from "./api.ts";

/**
 * "Excluir WhatsApp" de UM cliente (administrador e gestor do cliente). A conexão some de todas as telas na hora, o número fica livre para
 * outro cliente e a conexão no servidor de WhatsApp é desligada e apagada. O histórico (conversas, vendas, contagens) NÃO é apagado:
 * se o cliente ligar o WhatsApp de novo, o cadastro antigo é reaproveitado. Para apagar o histórico, use "Apagar tudo e começar do zero" (em Configurar).
 * Confirma digitando EXCLUIR. Só mexe no cliente da linha.
 */
export function ExcluirWhatsApp({ connectionId, instanceName, clientName, onMessage }: {
  connectionId: string;
  instanceName?: string | null;
  clientName: string;
  onMessage: (m: { tone: "success" | "error"; text: string } | null) => void;
}) {
  const excluir = useExcludeWhatsApp();
  const desconectar = useWaInstanceLogout();
  const [aberto, setAberto] = useState(false);
  const [palavra, setPalavra] = useState("");
  const ocupado = excluir.isPending || desconectar.isPending;

  async function executar() {
    let aviso = "";
    // 1) desliga e apaga a conexão no servidor de WhatsApp (se houver). Se o servidor não responder, segue e avisa.
    if (instanceName) {
      try { await desconectar.mutateAsync(connectionId); } catch { aviso = " Não consegui apagar a conexão no servidor de WhatsApp agora (ela já está desligada aqui no CRM)."; }
    }
    // 2) exclui o WhatsApp do cliente: some das telas, número livre, histórico guardado
    try {
      await excluir.mutateAsync({ id: connectionId, confirmar: palavra });
      setAberto(false); setPalavra("");
      onMessage({ tone: "success", text: `WhatsApp de ${clientName} excluído. Ele saiu das telas e o número ficou livre. O histórico continua guardado.${aviso}` });
    } catch (e) {
      setAberto(false); setPalavra("");
      onMessage({ tone: "error", text: errorMessage(e) });
    }
  }

  return (
    <>
      <Button type="button" variant="ghost" className="px-2 py-1 text-xs text-rose-700 hover:text-rose-800" aria-label={`Excluir o WhatsApp de ${clientName}`}
        onClick={() => { onMessage(null); setPalavra(""); setAberto(true); }}>
        <Trash2 className="size-3.5" aria-hidden /> Excluir WhatsApp
      </Button>
      {aberto && (
        <Modal open title={`Excluir o WhatsApp de ${clientName}?`} onClose={() => (ocupado ? undefined : setAberto(false))}>
          <div className="space-y-3 text-sm" data-testid="wa-excluir-modal">
            <p>Isto vale <strong>só para {clientName}</strong>. O WhatsApp dele sai de todas as telas, a conexão é desligada e apagada no servidor e o número fica livre para outro cliente.</p>
            <p className="text-slate-600">O histórico (conversas, vendas marcadas e contagens), o site e o tracking <strong>continuam guardados</strong>. Se você ligar o WhatsApp deste cliente de novo, o cadastro antigo volta junto. Para apagar também o histórico, use “Apagar tudo e começar do zero”, dentro de Configurar.</p>
            <Alert tone="warning">Para confirmar, digite <strong>EXCLUIR</strong>.</Alert>
            <Input aria-label="Digite EXCLUIR" value={palavra} onChange={(e) => setPalavra(e.target.value)} placeholder="EXCLUIR" autoComplete="off" />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" disabled={ocupado} onClick={() => setAberto(false)}>Cancelar</Button>
              <Button loading={ocupado} disabled={palavra.trim().toUpperCase() !== "EXCLUIR"} onClick={() => void executar()}>Excluir WhatsApp</Button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
