import type { Session } from "@supabase/supabase-js";
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase.ts";
import type { Profile } from "./types.ts";

interface AuthState {
  /** true enquanto descobrimos se há sessão salva no navegador. */
  loading: boolean;
  session: Session | null;
  profile: Profile | null;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
  if (error) {
    console.error("[auth] perfil", error);
    return null;
  }
  return data as Profile | null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);

  useEffect(() => {
    let cancelled = false;

    const apply = async (next: Session | null) => {
      const nextProfile = next ? await fetchProfile(next.user.id) : null;
      if (cancelled) return;
      setSession(next);
      setProfile(nextProfile);
      setLoading(false);
    };

    supabase.auth.getSession().then(({ data }) => apply(data.session));

    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      // Evita chamar o Supabase dentro do callback (recomendação da biblioteca).
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") {
        setTimeout(() => apply(next), 0);
      } else if (event === "TOKEN_REFRESHED") {
        setSession(next);
      }
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  const refreshProfile = useCallback(async () => {
    if (session) setProfile(await fetchProfile(session.user.id));
  }, [session]);

  const signOut = useCallback(async () => {
    // Registra a saída no log antes de encerrar a sessão (depois não há mais login).
    const { error } = await supabase.rpc("log_auth_event", { p_event: "logout" });
    if (error) console.error("[log] logout", error);
    await supabase.auth.signOut();
  }, []);

  const value = useMemo(
    () => ({ loading, session, profile, refreshProfile, signOut }),
    [loading, session, profile, refreshProfile, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth precisa estar dentro de <AuthProvider>");
  return ctx;
}
