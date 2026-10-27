import { parseWhatsApp } from "@backstage/shared";
import { cn } from "@/lib/cn.ts";

/** Pré-visualização no estilo do WhatsApp: quebras de linha, emojis, *negrito*, _itálico_, ~riscado~. */
export function WhatsAppPreview({ text }: { text: string }) {
  const lines = parseWhatsApp(text);
  return (
    <div className="rounded-xl bg-[#e7f3ec] p-3" data-testid="envio-preview">
      <div className="ml-auto max-w-md rounded-lg rounded-tr-none bg-[#d9fdd3] px-3 py-2 text-sm text-slate-900 shadow-sm">
        {text.trim() === "" ? <span className="text-slate-400">A mensagem aparece aqui.</span> : lines.map((segs, i) => (
          <p key={i} className="min-h-5 whitespace-pre-wrap break-words">
            {segs.map((s, j) => (
              <span key={j} className={cn(s.bold && "font-bold", s.italic && "italic", s.strike && "line-through", s.mono && "font-mono text-xs")}>{s.text}</span>
            ))}
          </p>
        ))}
      </div>
    </div>
  );
}
