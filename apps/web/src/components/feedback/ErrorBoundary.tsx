import { RefreshCw, TriangleAlert } from "lucide-react";
import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "@/components/ui/button.tsx";
import { reportError } from "@/lib/errorReporting.ts";

/** O site foi atualizado e esta página ainda pede um arquivo antigo. */
export function isChunkLoadError(error: unknown): boolean {
  const text = error instanceof Error ? `${error.name} ${error.message}` : String(error);
  return /dynamically imported module|Importing a module script failed|ChunkLoadError|Loading chunk/i.test(text);
}

export const PAGE_ERROR_MESSAGE = "Não conseguimos mostrar esta tela agora. O problema foi registrado para análise.";
export const UPDATED_MESSAGE = "O sistema foi atualizado. Recarregue a página para continuar.";

/** Aviso amigável no lugar de uma tela que falhou (o menu continua funcionando). */
export function ErrorFallback({ error, onRetry, fullPage = false }: { error: unknown; onRetry?: () => void; fullPage?: boolean }) {
  const updated = isChunkLoadError(error);
  return (
    <div className={fullPage ? "grid min-h-screen place-items-center bg-slate-50 p-4" : "py-10"}>
      <div
        className="mx-auto max-w-lg rounded-xl bg-white p-6 text-center shadow-sm ring-1 ring-slate-200"
        role="alert"
        data-testid="error-fallback"
      >
        <TriangleAlert className="mx-auto size-8 text-amber-500" aria-hidden />
        <h2 className="mt-3 text-lg font-semibold text-slate-900">{updated ? "Temos uma versão nova" : "Algo não saiu como esperado"}</h2>
        <p className="mt-1 text-sm text-slate-600">{updated ? UPDATED_MESSAGE : PAGE_ERROR_MESSAGE}</p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {updated || !onRetry ? (
            <Button onClick={() => window.location.reload()}>
              <RefreshCw className="size-4" aria-hidden /> Recarregar a página
            </Button>
          ) : (
            <Button onClick={onRetry}>
              <RefreshCw className="size-4" aria-hidden /> Tentar de novo
            </Button>
          )}
          <Button variant="secondary" onClick={() => window.location.assign("/")}>Ir para o início</Button>
        </div>
      </div>
    </div>
  );
}

interface Props {
  children: ReactNode;
  /** Antes de tentar de novo (ex.: descartar dados guardados que quebraram a tela). */
  onReset?: () => void;
}

/**
 * Se uma tela quebrar, mostra o aviso amigável em vez da tela branca e guarda
 * o erro técnico no log do administrador.
 */
export class ErrorBoundary extends Component<Props, { error: unknown }> {
  state = { error: null as unknown };

  static getDerivedStateFromError(error: unknown) {
    return { error };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    const code = isChunkLoadError(error) ? "SITE_VERSION_CHANGED" : "SITE_RENDER_ERROR";
    const technical = error instanceof Error ? `${error.name}: ${error.message}\n${info.componentStack ?? ""}` : error;
    reportError(code, technical, { userMessage: isChunkLoadError(error) ? UPDATED_MESSAGE : PAGE_ERROR_MESSAGE });
  }

  retry = () => {
    this.props.onReset?.();
    this.setState({ error: null });
  };

  render() {
    if (this.state.error) return <ErrorFallback error={this.state.error} onRetry={this.retry} />;
    return this.props.children;
  }
}
