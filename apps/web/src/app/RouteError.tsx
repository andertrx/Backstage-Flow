import { useEffect } from "react";
import { useRouteError } from "react-router";
import { ErrorFallback, isChunkLoadError, PAGE_ERROR_MESSAGE, UPDATED_MESSAGE } from "@/components/feedback/ErrorBoundary.tsx";
import { reportError } from "@/lib/errorReporting.ts";

/** Último recurso do roteador: erro fora das telas (ex.: no menu). Nunca tela branca. */
export function RouteError() {
  const error = useRouteError();
  useEffect(() => {
    const chunk = isChunkLoadError(error);
    reportError(chunk ? "SITE_VERSION_CHANGED" : "SITE_ROUTE_ERROR", error, { userMessage: chunk ? UPDATED_MESSAGE : PAGE_ERROR_MESSAGE });
  }, [error]);
  return <ErrorFallback error={error} fullPage />;
}
