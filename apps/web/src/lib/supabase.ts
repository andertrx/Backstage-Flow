import { createClient } from "@supabase/supabase-js";
import { demoFetch } from "@/demo/demoFetch.ts";
import { DEMO_STORAGE_KEY, isDemoMode } from "./demo.ts";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

/** Na demonstração não há servidor: tudo responde no navegador (Etapa 27). */
export const isSupabaseConfigured = isDemoMode || Boolean(url && publishableKey);

/**
 * Cliente do Supabase para o NAVEGADOR.
 * Usa somente a chave pública; tudo o que ele pode ler é controlado pelo RLS.
 */
export const supabase = isDemoMode
  ? // Demonstração: sessão própria (não mexe no login real) e respostas fictícias locais.
    createClient("https://demonstracao.supabase.co", "demonstracao", {
      auth: { persistSession: true, autoRefreshToken: false, detectSessionInUrl: false, storageKey: DEMO_STORAGE_KEY, storage: window.sessionStorage },
      global: { fetch: demoFetch },
    })
  : createClient(url ?? "http://localhost", publishableKey ?? "missing-key", {
      auth: {
        persistSession: true, // sessão continua ao fechar e abrir o navegador
        autoRefreshToken: true,
        detectSessionInUrl: true, // necessário para o link de "redefinir senha"
        flowType: "pkce",
      },
    });

/**
 * Link de "esqueci minha senha": abre sempre a tela de nova senha, mesmo que o
 * e-mail tenha trazido a pessoa para outra página do site. Precisa ser
 * registrado aqui, logo ao criar o cliente: o aviso de recuperação chega antes
 * de as telas começarem a ouvir.
 */
supabase.auth.onAuthStateChange((event) => {
  if (event === "PASSWORD_RECOVERY" && window.location.pathname !== "/redefinir-senha") {
    window.location.replace("/redefinir-senha");
  }
});
