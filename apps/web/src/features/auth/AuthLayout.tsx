import type { ReactNode } from "react";
import { Card } from "@/components/ui/card.tsx";
import { Logo } from "@/components/layout/Logo.tsx";

/**
 * Moldura centralizada das telas de login e senha.
 * Fundo com luzes azuis flutuando devagar, logo que entra, flutua e recebe um brilho passando, e o cartão que sobe em seguida.
 * Sem `title`, só o logo aparece (como no login: o logo já diz "Backstage Flow").
 */
export function AuthLayout({ title, subtitle, children }: { title?: string; subtitle?: string; children: ReactNode }) {
  return (
    <div className="auth-stage relative flex min-h-full items-center justify-center overflow-hidden px-4 py-12">
      <div className="auth-orb auth-orb-a" aria-hidden />
      <div className="auth-orb auth-orb-b" aria-hidden />
      <div className="auth-orb auth-orb-c" aria-hidden />
      <div className="auth-grid" aria-hidden />
      <div className="relative z-10 w-full max-w-sm space-y-7 print:animate-none">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="auth-logo-in" data-testid="auth-logo">
            <div className="auth-logo-float relative">
              <div className="auth-logo-glow" aria-hidden />
              <div className="relative inline-block">
                <Logo size="xl" />
                <span className="auth-logo-shine" aria-hidden />
              </div>
            </div>
          </div>
          {!title && <h1 className="sr-only">Entrar no Backstage Flow</h1>}
          {(title || subtitle) && (
            <div className="auth-text-in">
              {title && <h1 className="text-xl font-semibold tracking-tight">{title}</h1>}
              {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
            </div>
          )}
        </div>
        <Card className="auth-card-in p-6 shadow-elevated">{children}</Card>
      </div>
    </div>
  );
}
