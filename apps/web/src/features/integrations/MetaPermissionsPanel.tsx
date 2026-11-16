import { Alert } from "@/components/ui/alert.tsx";
import type { MetaPermissionsReport } from "@/features/ad-accounts/api.ts";

const label = { concedida: "Concedida", recusada: "Recusada", ausente: "Não concedida" } as const;
const tone = { concedida: "text-emerald-700", recusada: "text-red-700", ausente: "text-amber-700" } as const;

/** Fase 35.1: resultado da conferência das permissões do token do Meta (só leitura). */
export function MetaPermissionsPanel({ report, error }: { report: MetaPermissionsReport | null; error: string | null }) {
  if (error) return <Alert tone="error">{error}</Alert>;
  if (!report) return null;
  return (
    <div className="space-y-3" data-testid="meta-permissions">
      {report.canCreate ? (
        <Alert tone="success">Este token tem todas as permissões para criar campanhas. Nada é publicado só por isso.</Alert>
      ) : (
        <Alert tone="info">
          {report.canRead
            ? "O token lê campanhas e métricas, mas ainda não tem tudo para criar campanhas. Veja o que falta abaixo."
            : "O token não tem nem as permissões de leitura. Gere um novo token com as permissões abaixo."}
        </Alert>
      )}
      <ul className="divide-y divide-slate-100 rounded-lg text-sm ring-1 ring-slate-200">
        {report.checks.map((c) => (
          <li key={c.name} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
            <div>
              <code className="text-xs">{c.name}</code>
              <p className="text-xs text-slate-500">{c.why}</p>
            </div>
            <span className={`text-xs font-medium ${tone[c.state]}`}>{label[c.state]}</span>
          </li>
        ))}
      </ul>
      {!report.canCreate && (
        <p className="text-xs text-slate-500">
          Se <code>ads_management</code> não aparece como concedida, gere o token de novo marcando essa permissão. Se o Meta não deixar marcar, o app
          pode precisar de acesso avançado (revisão do Meta).
        </p>
      )}
    </div>
  );
}
