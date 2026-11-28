import { Film, Image as ImageIcon } from "lucide-react";
import { Alert } from "@/components/ui/alert.tsx";
import { Modal } from "@/components/ui/modal.tsx";
import { errorMessage } from "@/lib/errors.ts";
import { type IgMediaItem, useIgMedia } from "./api.ts";

/** Escolher, entre os últimos posts do Instagram vinculado, o que será promovido. A lista vem do Meta (só leitura). */
export function IgPostPicker({ open, adAccountId, igUserId, onClose, onPick }: {
  open: boolean; adAccountId: string | null | undefined; igUserId: string; onClose: () => void; onPick: (m: IgMediaItem) => void;
}) {
  const media = useIgMedia(adAccountId, igUserId, open);
  return (
    <Modal open={open} onClose={onClose} title="Escolher post do Instagram">
      <div className="space-y-3" data-testid="ig-post-picker">
        {media.isLoading && <p className="text-sm text-slate-500">Buscando os posts no Meta...</p>}
        {media.isError && <Alert tone="error">{errorMessage(media.error)}</Alert>}
        {media.data && media.data.length === 0 && <p className="text-sm text-slate-500">O Meta não devolveu posts para esse Instagram.</p>}
        {media.data && media.data.length > 0 && (
          <ul className="grid max-h-96 gap-2 overflow-y-auto sm:grid-cols-2">
            {media.data.map((m) => (
              <li key={m.id}>
                <button type="button" data-testid="ig-post" onClick={() => { onPick(m); onClose(); }}
                  className="flex w-full items-center gap-3 rounded-xl bg-slate-50 p-2 text-left ring-1 ring-slate-200 hover:bg-white">
                  {m.thumbnail ? <img src={m.thumbnail} alt="" className="size-16 shrink-0 rounded-lg object-cover" /> : (
                    <span className="grid size-16 shrink-0 place-items-center rounded-lg bg-white text-slate-300">{m.type === "VIDEO" ? <Film className="size-5" aria-hidden /> : <ImageIcon className="size-5" aria-hidden />}</span>
                  )}
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-slate-800">{m.caption || "(sem legenda)"}</span>
                    <span className="block text-xs text-slate-500">{m.type === "VIDEO" ? "Vídeo/Reels" : m.type === "CAROUSEL_ALBUM" ? "Carrossel" : "Foto"} · {m.date.slice(0, 10)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
}
