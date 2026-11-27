import { Folder, FolderOpen, Image as ImageIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { Alert } from "@/components/ui/alert.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/field.tsx";
import { Modal } from "@/components/ui/modal.tsx";
import { errorMessage } from "@/lib/errors.ts";
import { type DriveListing, useDriveList, useDriveThumb } from "./api.ts";

const STORE = "bf-drive-pasta";
const read = () => { try { return localStorage.getItem(STORE) ?? ""; } catch { return ""; } };
const write = (v: string) => { try { localStorage.setItem(STORE, v); } catch { /* sem armazenamento: segue sem lembrar */ } };
const size = (n: number | null) => (n == null ? "" : n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);

/**
 * Escolher a imagem do anúncio numa pasta do Google Drive (Fase C). O CRM só lê as pastas compartilhadas com a conta de serviço.
 * Cola o link da pasta uma vez (fica lembrado neste navegador), navega nas subpastas e escolhe uma imagem JPG ou PNG.
 */
export function DrivePicker({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (f: { id: string; name: string }) => void }) {
  const list = useDriveList();
  const [link, setLink] = useState(read);
  const [trail, setTrail] = useState<{ id: string; name: string }[]>([]);
  const [chosen, setChosen] = useState<{ id: string; name: string } | null>(null);
  const thumb = useDriveThumb(chosen?.id ?? null);
  const { mutate } = list;

  function openFolder(ref: string, name?: string) {
    setChosen(null);
    mutate(ref, {
      onSuccess: (d) => setTrail((t) => {
        const i = t.findIndex((x) => x.id === d.folder.id);
        return i >= 0 ? t.slice(0, i + 1) : [...t, { id: d.folder.id, name: name ?? d.folder.name }];
      }),
    });
  }

  // Ao abrir com uma pasta lembrada, já mostra o conteúdo.
  useEffect(() => {
    if (open && link.trim() && !list.data && !list.isPending) { setTrail([]); mutate(link, { onSuccess: (d) => setTrail([{ id: d.folder.id, name: d.folder.name }]) }); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const d: DriveListing | undefined = list.data;
  return (
    <Modal title="Escolher imagem no Google Drive" open={open} size="lg" onClose={onClose}>
      <div className="space-y-4 text-sm" data-testid="drive-picker">
        <div className="flex flex-wrap items-end gap-2">
          <label className="min-w-0 flex-1 space-y-1 text-xs font-medium text-slate-600">
            Link da pasta do Drive (compartilhada com o CRM)
            <Input aria-label="Link da pasta do Drive" value={link} placeholder="https://drive.google.com/drive/folders/..." onChange={(e) => setLink(e.target.value)} />
          </label>
          <Button loading={list.isPending} disabled={!link.trim()} onClick={() => { write(link.trim()); setTrail([]); openFolder(link.trim()); }}>Abrir pasta</Button>
        </div>
        {list.error && <Alert tone="error">{errorMessage(list.error)}</Alert>}
        {d && (
          <div className="space-y-3">
            <nav className="flex flex-wrap items-center gap-1 text-xs text-slate-500" aria-label="Caminho">
              {trail.map((t, i) => (
                <span key={t.id} className="flex items-center gap-1">
                  {i > 0 && <span aria-hidden>/</span>}
                  <button type="button" className="font-medium text-brand-700 hover:underline" onClick={() => openFolder(t.id, t.name)}>{t.name}</button>
                </span>
              ))}
            </nav>
            <ul className="max-h-72 space-y-1 overflow-y-auto rounded-xl bg-slate-50 p-2" data-testid="drive-lista">
              {d.folders.map((f) => (
                <li key={f.id}>
                  <button type="button" className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-white" onClick={() => openFolder(f.id, f.name)}>
                    <Folder className="size-4 text-amber-600" aria-hidden /> <span className="truncate">{f.name}</span>
                  </button>
                </li>
              ))}
              {d.images.map((im) => (
                <li key={im.id}>
                  <button type="button" aria-pressed={chosen?.id === im.id} data-testid="drive-imagem"
                    className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left ${chosen?.id === im.id ? "bg-brand-50 ring-1 ring-brand-300" : "hover:bg-white"}`}
                    onClick={() => setChosen({ id: im.id, name: im.name })}>
                    <ImageIcon className="size-4 text-slate-500" aria-hidden /> <span className="min-w-0 flex-1 truncate">{im.name}</span>
                    <span className="text-xs text-slate-400">{size(im.size)}</span>
                  </button>
                </li>
              ))}
              {d.folders.length === 0 && d.images.length === 0 && (
                <li className="flex items-center gap-2 px-2 py-3 text-slate-500"><FolderOpen className="size-4" aria-hidden /> Nenhuma imagem JPG ou PNG nesta pasta.</li>
              )}
            </ul>
            {d.others > 0 && <p className="text-xs text-slate-500">{d.others} arquivo(s) de outro tipo (como vídeo) não aparecem: nesta etapa só imagens JPG e PNG, até 8 MB.</p>}
          </div>
        )}
        {chosen && (
          <div className="flex items-center gap-3 rounded-xl bg-slate-50 p-3" data-testid="drive-escolhida">
            {thumb.data ? <img src={thumb.data} alt="" className="size-20 rounded-lg object-cover ring-1 ring-slate-200" /> : <div className="grid size-20 place-items-center rounded-lg bg-white text-slate-300 ring-1 ring-slate-200"><ImageIcon className="size-6" aria-hidden /></div>}
            <div className="min-w-0 flex-1"><p className="truncate font-medium text-slate-800">{chosen.name}</p><p className="text-xs text-slate-500">{thumb.isLoading ? "Carregando miniatura..." : thumb.data ? "Miniatura do Drive" : "Sem miniatura disponível"}</p></div>
            <Button onClick={() => { onPick(chosen); onClose(); }}>Usar esta imagem</Button>
          </div>
        )}
      </div>
    </Modal>
  );
}
