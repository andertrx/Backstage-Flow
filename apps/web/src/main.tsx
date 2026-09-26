import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router";
import { MissingConfig } from "./app/MissingConfig.tsx";
import { router } from "./app/router.tsx";
import { AuthProvider } from "./features/auth/AuthProvider.tsx";
import { FriendlyError } from "./lib/errors.ts";
import { reportError } from "./lib/errorReporting.ts";
import { DEMO_PASSWORD, isDemoMode } from "./lib/demo.ts";
import { isSupabaseConfigured, supabase } from "./lib/supabase.ts";
import { DEMO_EMAIL } from "./demo/constants.ts";
import "./index.css";

// Erros técnicos inesperados (fora das mensagens amigáveis) vão para o log do administrador.
const reportUnexpected = (code: string) => (error: unknown) => {
  if (!(error instanceof FriendlyError)) reportError(code, error);
};

if (typeof window !== "undefined") {
  window.addEventListener("error", (event) => {
    // Só erros do próprio site (extensões do navegador e avisos de layout não interessam).
    if (event.filename && !event.filename.startsWith(window.location.origin)) return;
    if (/ResizeObserver loop/.test(event.message)) return;
    reportError("SITE_SCRIPT_ERROR", event.error ?? event.message);
  });
  window.addEventListener("unhandledrejection", (event) => {
    if (event.reason instanceof FriendlyError) return;
    reportError("SITE_PROMISE_ERROR", event.reason);
  });
}

const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError: reportUnexpected("SITE_QUERY_ERROR") }),
  mutationCache: new MutationCache({ onError: reportUnexpected("SITE_ACTION_ERROR") }),
  defaultOptions: { queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false } },
});

/** Demonstração: entra sozinho com o usuário fictício (nada sai do navegador). */
async function prepareDemo() {
  if (!isDemoMode) return;
  const { data } = await supabase.auth.getSession();
  if (!data.session) await supabase.auth.signInWithPassword({ email: DEMO_EMAIL, password: DEMO_PASSWORD });
}

await prepareDemo();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {isSupabaseConfigured ? (
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <RouterProvider router={router} />
        </AuthProvider>
      </QueryClientProvider>
    ) : (
      <MissingConfig />
    )}
  </StrictMode>,
);
