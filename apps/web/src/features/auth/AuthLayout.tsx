import { BarChart3, Target, Wallet } from "lucide-react";
import type { ReactNode } from "react";
import { Logo } from "@/components/layout/Logo.tsx";

const DESTAQUES = [
  { icon: BarChart3, titulo: "Meta Ads e Google Ads num só painel", texto: "Resultados, campanhas e histórico de cada cliente" },
  { icon: Wallet, titulo: "Saldo e alertas das contas", texto: "Saiba quando uma conta precisa de atenção" },
  { icon: Target, titulo: "Tracking e relatórios", texto: "Vendas, conversas e relatórios prontos para o cliente" },
] as const;

/**
 * Moldura das telas de login e senha (dividida em dois lados).
 * Esquerda (só em tela grande): painel escuro da marca, com a frase e os destaques. Direita: o formulário.
 * Sem `title`, mostra o cumprimento do login. Só usa transform/opacity nas entradas (sem animação infinita).
 */
export function AuthLayout({ title, subtitle, children }: { title?: string; subtitle?: string; children: ReactNode }) {
  return (
    <div className="auth-split grid min-h-full lg:grid-cols-[1.08fr_1fr]">
      <aside className="auth-hero relative hidden flex-col justify-between overflow-hidden px-14 py-12 text-white lg:flex" aria-hidden={false}>
        <div className="auth-hero-grid" aria-hidden />
        <div className="auth-hero-glow" aria-hidden />
        <img src="/brand/symbol-dark.png" alt="" aria-hidden className="auth-hero-symbol" />
        <div className="relative auth-fade" style={{ "--i": 0 } as React.CSSProperties}>
          <Logo inverted size="lg" />
        </div>
        <div className="relative max-w-lg">
          <h2 className="auth-fade text-4xl font-bold leading-tight tracking-tight" style={{ "--i": 1 } as React.CSSProperties}>
            Nos bastidores, o resultado <span className="auth-hero-accent">ganha ritmo.</span>
          </h2>
          <p className="auth-fade mt-4 text-base text-slate-300" style={{ "--i": 2 } as React.CSSProperties}>
            O painel de performance de tráfego pago da sua agência.
          </p>
          <ul className="mt-10 space-y-4">
            {DESTAQUES.map((d, i) => (
              <li key={d.titulo} className="auth-fade flex items-start gap-3" style={{ "--i": 3 + i } as React.CSSProperties}>
                <span className="mt-0.5 grid size-10 shrink-0 place-items-center rounded-xl bg-white/[0.06] ring-1 ring-white/10">
                  <d.icon className="size-5 text-sky-300" aria-hidden />
                </span>
                <span>
                  <span className="block text-sm font-semibold text-white">{d.titulo}</span>
                  <span className="block text-sm text-slate-400">{d.texto}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs uppercase tracking-[0.18em] text-slate-500">Backstage Flow</p>
      </aside>

      <main className="auth-form-side relative flex items-center justify-center overflow-hidden px-6 py-12">
        <div className="auth-orb" aria-hidden />
        <div className="relative z-10 w-full max-w-sm">
          <div className="auth-fade mb-8 flex justify-center lg:hidden" style={{ "--i": 0 } as React.CSSProperties} data-testid="auth-logo">
            <Logo size="xl" />
          </div>
          <div className="auth-fade mb-6" style={{ "--i": 1 } as React.CSSProperties}>
            {!title && <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-600">Bem-vindo de volta</p>}
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">{title ?? "Entrar na sua conta"}</h1>
            {(subtitle || !title) && <p className="mt-1 text-sm text-slate-500">{subtitle ?? "Acesse o painel da sua agência."}</p>}
          </div>
          <div className="auth-fade" style={{ "--i": 2 } as React.CSSProperties}>{children}</div>
        </div>
      </main>
    </div>
  );
}
