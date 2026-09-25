import { can, PERMISSION_LABELS, PERMISSIONS, ROLE_DESCRIPTIONS, ROLE_LABELS, ROLE_SCOPE, ROLES } from "@backstage/shared";
import { Check, Minus } from "lucide-react";
import { Alert } from "@/components/ui/alert.tsx";
import { Card } from "@/components/ui/card.tsx";

/** Quem pode o quê (somente leitura). A mesma regra é conferida no banco e no servidor. */
export function PermissionsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Papéis e permissões</h1>
        <p className="mt-1 text-sm text-slate-500">
          O que cada tipo de usuário pode ver e fazer. Para mudar o papel de alguém, use a aba Usuários.
        </p>
      </div>

      <Alert tone="info">
        Estas regras são aplicadas no <strong>banco de dados</strong> e no <strong>servidor</strong>, e não só na tela.
        Mesmo que alguém tente burlar o site, o banco recusa. Usuário desativado perde todo o acesso na hora.
      </Alert>

      <Card className="relative overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm" data-testid="permissions-table">
          <caption className="sr-only">Permissões por papel</caption>
          <thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-600">
            <tr>
              <th scope="col" className="w-2/5 px-4 py-3 font-medium">Permissão</th>
              {ROLES.map((r) => (
                <th key={r} scope="col" className="px-3 py-3 text-center font-semibold text-slate-900">{ROLE_LABELS[r]}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            <tr className="bg-slate-50/50" data-testid="scope-row">
              <th scope="row" className="px-4 py-3 font-medium text-slate-900">Quais clientes vê</th>
              {ROLES.map((r) => <td key={r} className="px-3 py-3 text-center text-xs text-slate-700">{ROLE_SCOPE[r]}</td>)}
            </tr>
            {PERMISSIONS.map((p) => (
              <tr key={p} data-testid="permission-row" data-permission={p}>
                <th scope="row" className="px-4 py-3 font-normal text-slate-700">{PERMISSION_LABELS[p]}</th>
                {ROLES.map((r) => (
                  <td key={r} className="px-3 py-3 text-center" data-role={r}>
                    {can(r, p) ? (
                      <Check className="mx-auto size-4 text-emerald-600" aria-label="Sim" />
                    ) : (
                      <Minus className="mx-auto size-4 text-slate-300" aria-label="Não" />
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {ROLES.map((r) => (
          <Card key={r} className="p-4">
            <p className="font-medium text-slate-900">{ROLE_LABELS[r]}</p>
            <p className="mt-1 text-sm text-slate-600">{ROLE_DESCRIPTIONS[r]}</p>
          </Card>
        ))}
      </div>

      <Card className="space-y-2 p-4 text-sm text-slate-600" data-testid="never-list">
        <p className="font-medium text-slate-900">Ninguém, nem o administrador, consegue pelo site:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>ver os tokens (senhas) de conexão com o Meta e o Google — eles ficam só no cofre do servidor;</li>
          <li>mudar o próprio papel;</li>
          <li>apagar ou alterar o histórico (métricas, logs, auditoria);</li>
          <li>alterar dados das contas de anúncio direto — tudo passa pelo servidor, que confere a permissão.</li>
        </ul>
      </Card>
    </div>
  );
}
