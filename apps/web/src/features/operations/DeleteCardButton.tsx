import { Trash2 } from "lucide-react";
import { useState } from "react";
import { Alert } from "@/components/ui/alert.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Modal } from "@/components/ui/modal.tsx";
import { errorMessage } from "@/lib/errors.ts";

/**
 * Etapa 51.3: botão "Excluir" de um cartão (tarefa ou lead) com confirmação.
 * Excluir não apaga do banco: o cartão some das telas e fica em "Arquivados e excluídos".
 */
export function DeleteCardButton({ what, label, onDelete, onDone }: {
  what: "tarefa" | "lead";
  label: string;
  onDelete: () => Promise<unknown>;
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function confirm() {
    setBusy(true);
    setError(null);
    try { await onDelete(); setOpen(false); onDone(); } catch (err) { setError(errorMessage(err)); } finally { setBusy(false); }
  }
  const nome = what === "tarefa" ? "a tarefa" : "o lead";
  return (
    <>
      <Button variant="secondary" className="px-2.5 py-1.5 text-xs text-red-700" onClick={() => { setError(null); setOpen(true); }}>
        <Trash2 className="size-3.5" aria-hidden /> Excluir
      </Button>
      {open && (
        <Modal title={`Excluir ${nome}?`} open onClose={() => setOpen(false)}>
          <div className="space-y-4" data-testid="ops-delete-confirm">
            <p className="text-sm text-slate-700"><strong>{label}</strong> vai sumir de todas as telas e ficar em "Arquivados e excluídos". Só o administrador pode restaurar.</p>
            {error && <Alert tone="error">{error}</Alert>}
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button className="bg-red-600 hover:bg-red-700" loading={busy} onClick={confirm}><Trash2 className="size-4" aria-hidden /> Excluir</Button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
