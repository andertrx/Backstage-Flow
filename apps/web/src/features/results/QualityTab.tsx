import { CheckCircle2 } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Alert } from "@/components/ui/alert.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Card } from "@/components/ui/card.tsx";
import { errorMessage } from "@/lib/errors.ts";
import { formatDateTime } from "@/lib/format.ts";
import { type RiIssue, type RiSource, useRiQuality } from "./api.ts";
import { RecordsModal, type RecordsTarget } from "./RecordsModal.tsx";

const int = (n: number) => n.toLocaleString("pt-BR");
const pct = (n: number, total: number) => (total ? `${(Math.round((n / total) * 1000) / 10).toLocaleString("pt-BR")}%` : "—");

interface Problem { key: string; count: number; title: string; fix: ReactNode; issue?: RiIssue; profile?: "nao_identificado" }

/**
 * Etapa 39.5 — Qualidade dos dados: olha a última leitura INTEIRA (sem período) e diz,
 * para cada problema, quantas linhas tem e o que fazer para resolver.
 */
export function QualityTab({ source, canManage, onEditRules }: { source: RiSource; canManage: boolean; onEditRules: () => void }) {
  const q = useRiQuality(source.client_id, source.last_success_at);
  const [records, setRecords] = useState<RecordsTarget | null>(null);
  if (!source.last_success_at) return <Alert tone="info">A planilha ainda não foi lida. A qualidade aparece depois da primeira leitura.</Alert>;
  if (q.error) return <Alert tone="error">{errorMessage(q.error)}</Alert>;
  if (!q.data) return <div className="h-40 animate-pulse rounded-xl bg-slate-100" aria-label="Carregando" />;
  const d = q.data;
  const st = d.sources[0]?.stats ?? {};
  const linked = d.origin_ad + d.origin_ad_group + d.origin_campaign;
  const unknownRows = d.unknown_profiles.reduce((s, x) => s + x.rows, 0);
  const editRules = canManage
    ? <button type="button" className="font-medium text-blue-700 hover:underline" onClick={onEditRules}>Editar as regras dos perfis</button>
    : "Peça a um administrador ou gestor para editar as regras dos perfis.";

  const problems: Problem[] = [
    { key: "sem-regra", count: unknownRows, title: "com perfil escrito de um jeito que ainda não tem regra", profile: "nao_identificado",
      fix: <>Contam como "Não identificado". Diga a qual perfil cada valor pertence (lista abaixo). {editRules}.</> },
    { key: "sem-perfil", count: d.empty_profile, title: "com a coluna de perfil vazia", profile: "nao_identificado",
      fix: "Preencha o perfil na planilha (Lojista, Sacoleiro ou Consumidor final). Na próxima leitura elas entram nos números." },
    { key: "sem-data", count: d.no_date, title: "sem data (ou com data que não dá para entender)", issue: "sem_data",
      fix: "Preencha a data do contato no formato DD/MM/AAAA. Sem data a linha fica fora de qualquer período." },
    { key: "sem-origem", count: d.no_origin, title: "sem campanha, conjunto ou anúncio", issue: "sem_origem",
      fix: "Preencha a origem na planilha. O melhor é o ID do anúncio (Ad ID), que liga a linha sem erro." },
    { key: "ambiguo", count: d.ambiguous, title: "com nome que existe mais de uma vez no CRM (nome ambíguo)", issue: "nome_ambiguo",
      fix: "Use o ID do anúncio na planilha, ou dê nomes diferentes às campanhas/conjuntos/anúncios no Meta ou Google." },
    { key: "nao-encontrada", count: d.not_found, title: "com origem que não existe no CRM", issue: "nao_encontrada",
      fix: "Confira se o nome/ID está igual ao do Meta ou Google e se a conta de anúncios está ligada a este cliente. Itens novos aparecem depois da próxima sincronização." },
    { key: "repetido", count: st.duplicates ?? 0, title: "com ID repetido na planilha (contou só a primeira)",
      fix: "Cada linha precisa de um ID único. Apague a linha duplicada ou corrija o ID." },
    { key: "id-invalido", count: st.invalidIds ?? 0, title: "com ID de anúncio, conjunto ou campanha inválido",
      fix: "Os IDs do Meta e do Google têm só números. Confira se a coluna não virou texto ou notação científica (ex.: 1,2E+17)." },
    { key: "sem-contato", count: st.noContact ?? 0, title: "sem telefone ou e-mail",
      fix: "Sem contato, cada linha conta como um contato diferente (pode contar a mesma pessoa duas vezes)." },
  ];
  const open = problems.filter((p) => p.count > 0);

  return (
    <div className="space-y-4" data-testid="ri-quality">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Linhas na última leitura" value={int(d.rows)} sub={d.sources[0] ? `Lida em ${formatDateTime(d.sources[0].read_at)}` : undefined} testid="ri-q-rows" />
        <Stat label="Contatos únicos" value={int(d.contacts)} testid="ri-q-contacts" />
        <Stat label="Ligadas a campanha/conjunto/anúncio" value={pct(linked, d.rows)} sub={`${int(linked)} de ${int(d.rows)} linhas · ${int(d.origin_ad)} até o anúncio`} testid="ri-q-linked" />
        <Stat label="Ligadas pelo nome (sem ID)" value={int(d.origin_by_name)} sub="funciona, mas o ID é mais seguro" testid="ri-q-byname" />
      </div>

      <Card className="space-y-3 p-5">
        <h2 className="text-base font-semibold text-slate-900">O que corrigir</h2>
        {open.length === 0 ? (
          <p className="flex items-center gap-2 text-sm text-emerald-700" data-testid="ri-q-ok"><CheckCircle2 className="size-4" aria-hidden /> Nenhum problema encontrado na última leitura.</p>
        ) : (
          <ul className="divide-y divide-slate-100" data-testid="ri-q-problems">
            {open.map((p) => (
              <li key={p.key} className="flex flex-wrap items-start justify-between gap-3 py-3" data-testid={`ri-q-${p.key}`}>
                <div className="min-w-0 flex-1 space-y-0.5">
                  <p className="text-sm text-slate-900"><strong className="tabular-nums">{int(p.count)}</strong> linha(s) {p.title}</p>
                  <p className="text-xs text-slate-600">{p.fix}</p>
                </div>
                {(p.issue || p.profile) && (
                  <Button type="button" variant="ghost" className="px-2 py-1 text-xs"
                    onClick={() => setRecords({ title: p.profile ? "Linhas com perfil não identificado" : `Linhas ${p.title}`, issue: p.issue ?? null, profile: p.profile ?? null })}>Ver linhas</Button>
                )}
              </li>
            ))}
          </ul>
        )}
        {(st.missingColumns?.length ?? 0) > 0 && (
          <Alert tone="warning">Colunas configuradas que não existem mais na planilha: {st.missingColumns!.join(", ")}. {canManage ? "Confira a configuração na aba Planilha." : "Peça a um administrador ou gestor para conferir."}</Alert>
        )}
      </Card>

      {d.unknown_profiles.length > 0 && (
        <Card className="space-y-2 p-5">
          <h2 className="text-base font-semibold text-slate-900">Valores de perfil sem regra</h2>
          <ul className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2" data-testid="ri-q-unknown">
            {d.unknown_profiles.map((u) => (
              <li key={u.value} className="flex justify-between gap-3 border-b border-slate-100 py-1">
                <span className="truncate text-slate-800">“{u.value}”</span><span className="tabular-nums text-slate-500">{int(u.rows)} linha(s)</span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-slate-500">{editRules}</p>
        </Card>
      )}

      {d.unmatched_names.length > 0 && (
        <Card className="space-y-2 p-5">
          <h2 className="text-base font-semibold text-slate-900">Nomes da planilha que não ligaram a nada</h2>
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm" data-testid="ri-q-names">
              <thead className="text-left text-xs text-slate-500">
                <tr><th className="py-1.5 pr-2 font-medium">Campanha</th><th className="px-2 py-1.5 font-medium">Conjunto</th><th className="px-2 py-1.5 font-medium">Anúncio</th>
                  <th className="px-2 py-1.5 font-medium">Motivo</th><th className="py-1.5 pl-2 text-right font-medium">Linhas</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {d.unmatched_names.map((u, i) => (
                  <tr key={i}>
                    <td className="py-1.5 pr-2">{u.campaign ?? "—"}</td><td className="px-2 py-1.5">{u.adset ?? "—"}</td><td className="px-2 py-1.5">{u.ad ?? "—"}</td>
                    <td className="px-2 py-1.5 text-xs text-slate-600">{u.issue === "nome_ambiguo" ? "Nome ambíguo" : "Não encontrado no CRM"}</td>
                    <td className="py-1.5 pl-2 text-right tabular-nums">{int(u.rows)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      <p className="text-xs text-slate-500">Esta aba olha a planilha inteira (todas as datas). Os números mudam depois de corrigir a planilha e de uma nova leitura.</p>
      {records && <RecordsModal clientId={source.client_id} range={null} target={records} onClose={() => setRecords(null)} />}
    </div>
  );
}

function Stat({ label, value, sub, testid }: { label: string; value: string; sub?: string; testid: string }) {
  return (
    <Card className="p-4" data-testid={testid}>
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">{value}</p>
      {sub && <p className="text-xs text-slate-500">{sub}</p>}
    </Card>
  );
}
