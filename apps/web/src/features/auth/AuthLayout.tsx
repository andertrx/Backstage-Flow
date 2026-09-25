import type { ReactNode } from "react";
import { Card } from "@/components/ui/card.tsx";
import { Logo } from "@/components/layout/Logo.tsx";

/** Moldura centralizada das telas de login e senha. */
export function AuthLayout({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <div className="flex min-h-full items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <Logo size="lg" />
          <div>
            <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
            {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
          </div>
        </div>
        <Card className="p-6">{children}</Card>
      </div>
    </div>
  );
}
