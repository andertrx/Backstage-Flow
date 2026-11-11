import { Trash2 } from "lucide-react";
import { useState } from "react";
import { Alert } from "@/components/ui/alert.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Modal } from "@/components/ui/modal.tsx";
import { errorMessage } from "@/lib/errors.ts";
import { type ConfigOptionKind, isProtectedOption, useConfigExcluir } from "./configOptionsApi.ts";

/** Botão "Excluir" de uma opção de Configurações, com confirmação. Opções que o sistema usa por nome não mostram o botão. */
export function ConfigExcluir({ kind, id, name, onError }: { kind: ConfigOptionKind; id: string; name: string; onError?: (msg: string | null) => void }) {
  const excluir = useConfigExcluir(kind);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Opção que o sistema usa por nome: sem botão, mas reserva o espaço para as colunas ficarem alinhadas no computador.
  if (isProtectedOption(kind, id)) return <span className="hidden w-[4.9rem] sm:inline-block" aria-hidden />;
  return (
    <>
      <Button variant="ghost" className="px-2 py-1 text-xs text-slate-500 hover:text-red-600" onClick={() => { setError(null); setOpen(true); }}
        aria-label={`Excluir ${name}`} title="Excluir">
        <Trash2 className="size-3.5" aria-hidden /> Excluir
      </Button>
      {open && (
        <Modal open title={`Excluir "${name}"?`} onClose={() => setOpen(false)}>
          <div className="space-y-3 text-sm" data-testid="config-excluir-modal">
            <p>Esta opção some da lista para sempre. Só dá para excluir o que ninguém usa: se houver tarefas, clientes ou leads ligados a ela, o sistema avisa e você pode <strong>desativar</strong> em vez de excluir.</p>
            {error && <Alert tone="error">{error}</Alert>}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button loading={excluir.isPending} onClick={() => excluir.mutate(id, {
                onSuccess: () => { setOpen(false); onError?.(null); },
                onError: (e) => { setError(errorMessage(e)); onError?.(null); },
              })}>Sim, excluir</Button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
