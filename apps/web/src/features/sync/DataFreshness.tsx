import { can, isStale, minutesSince, STALE_MINUTES } from "@backstage/shared";
import { Clock, Loader2, TriangleAlert } from "lucide-react";
import { type ReactNode, useEffect, useMemo } from "react";
import { Link } from "react-router";
import { useAuth } from "@/features/auth/AuthProvider.tsx";
import { formatRelative } from "@/lib/format.ts";
import { useRunSync, useSyncOverview } from "./api.ts";

/** Contas já pedidas nesta visita (não pede a mesma conta de novo por 15 minutos). */
const attempted = new Map<string, number>();
const RETRY_MS = 15 * 60_000;
const MAX_AUTO = 20;

interface Props {
  clientId?: string | null;
  platform?: string | null;
  accountId?: string | null;
}

/**
 * Cache (Etapa 24): mostra de quando são os dados da tela e, se alguma conta
 * estiver desatualizada (> 90 min sem sincronizar), pede a sincronização SÓ
 * dessas contas. As demais usam o que já está guardado no banco.
 */
export function DataFreshness({ clientId = null, platform = null, accountId = null }: Props) {
  const { profile } = useAuth();
  const staff = can(profile?.role, "internal.view");
  const canRun = can(profile?.role, "sync.run");
  const overview = useSyncOverview(staff);
  const run = useRunSync();

  const rows = useMemo(
    () =>
      (overview.data ?? []).filter((r) =>
        r.has_connection && !r.is_test_account &&
        (!clientId || r.client_id === clientId) && (!platform || r.platform_id === platform) && (!accountId || r.ad_account_id === accountId)),
    [overview.data, clientId, platform, accountId],
  );
  const stale = rows.filter((r) => !r.running && isStale(r.last_success_at));
  const staleKey = stale.map((r) => r.ad_account_id).sort().join(",");
  const running = rows.filter((r) => r.running).length;

  // Dados velhos → sincroniza só essas contas (uma vez a cada 15 min por conta).
  useEffect(() => {
    if (!canRun || !staleKey || run.isPending) return;
    const now = Date.now();
    const ids = staleKey.split(",").filter((id) => now - (attempted.get(id) ?? 0) > RETRY_MS).slice(0, MAX_AUTO);
    if (!ids.length) return;
    for (const id of ids) attempted.set(id, now);
    run.mutate({ adAccountIds: ids, onlyStale: true });
  }, [canRun, staleKey]);

  if (!staff || overview.isLoading || rows.length === 0) return null;

  const synced = rows.map((r) => r.last_success_at).filter((v): v is string => Boolean(v)).sort();
  const oldest = synced[0] ?? null;
  const never = rows.length - synced.length;

  let tone = "text-slate-500";
  let icon = <Clock className="size-3.5 shrink-0" aria-hidden />;
  let text: ReactNode;
  if (run.isPending || running > 0) {
    const requested = run.isPending && run.variables && !Array.isArray(run.variables) ? (run.variables.adAccountIds?.length ?? 0) : 0;
    const n = Math.max(requested, running);
    icon = <Loader2 className="size-3.5 shrink-0 animate-spin" aria-hidden />;
    text = `Atualizando ${n} ${n === 1 ? "conta com dados antigos" : "contas com dados antigos"} nas APIs… As demais já estão em dia.`;
  } else if (stale.length > 0) {
    tone = "text-amber-700";
    icon = <TriangleAlert className="size-3.5 shrink-0" aria-hidden />;
    const age = oldest ? `dados mais antigos ${formatRelative(oldest)}` : "ainda não buscados";
    text = (
      <>
        {stale.length} {stale.length === 1 ? "conta está" : "contas estão"} com dados antigos ({never ? `${never} nunca sincronizada${never === 1 ? "" : "s"}` : age})
        {canRun ? (run.error ? ": não conseguimos atualizar agora, mostramos o que está guardado." : ".") : ": a atualização automática está atrasada."}{" "}
        <Link to="/sincronizacao" className="font-medium underline">Ver sincronização</Link>
      </>
    );
  } else {
    const minutes = minutesSince(oldest);
    text = minutes == null
      ? "Dados ainda não sincronizados."
      : `Dados atualizados ${formatRelative(oldest as string)}${rows.length > 1 ? " (conta mais antiga)" : ""}. Atualização automática a cada hora; com mais de ${STALE_MINUTES} min, a tela busca de novo sozinha.`;
  }

  return (
    <p className={`flex items-start gap-1.5 text-xs ${tone}`} data-testid="data-freshness" role="status">
      <span className="mt-px">{icon}</span>
      <span>{text}</span>
    </p>
  );
}
