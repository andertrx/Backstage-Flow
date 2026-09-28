import { OPS_NOTIFICATION_KINDS, OPS_NOTIFICATION_LABELS, type OpsNotificationKind } from "@backstage/shared";
import { Bell } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { Alert } from "@/components/ui/alert.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Card } from "@/components/ui/card.tsx";
import { Select } from "@/components/ui/field.tsx";
import { errorMessage } from "@/lib/errors.ts";
import { NotificationItem } from "./NotificationBell.tsx";
import {
  type OpsNotification, useMarkNotificationsRead, useNotificationPrefs, useNotifications, useSaveNotificationPrefs,
} from "./notificationsApi.ts";
import { OpsModuleHeader } from "./OpsHeader.tsx";
import { RequireOps } from "./OpsLayout.tsx";

function Preferences() {
  const prefs = useNotificationPrefs();
  const save = useSaveNotificationPrefs();
  const [muted, setMuted] = useState<OpsNotificationKind[] | null>(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (prefs.data && muted === null) setMuted(prefs.data); }, [prefs.data, muted]);
  const current = muted ?? [];
  async function submit() {
    setError(null); setSaved(false);
    try { await save.mutateAsync(current); setSaved(true); } catch (err) { setError(errorMessage(err)); }
  }
  return (
    <Card className="space-y-3 p-5" data-testid="ops-notification-prefs">
      <div>
        <h2 className="text-base font-semibold">Quero ser avisado quando…</h2>
        <p className="text-sm text-slate-500">Desmarque o que não quiser receber. Vale só para você. Nada é enviado por e-mail ou WhatsApp.</p>
      </div>
      <div className="grid gap-1.5 sm:grid-cols-2">
        {OPS_NOTIFICATION_KINDS.map((k) => (
          <label key={k} className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={!current.includes(k)} disabled={muted === null}
              onChange={() => { setSaved(false); setMuted((m) => ((m ?? []).includes(k) ? (m ?? []).filter((x) => x !== k) : [...(m ?? []), k])); }} />
            {OPS_NOTIFICATION_LABELS[k]}
          </label>
        ))}
      </div>
      {error && <Alert tone="error">{error}</Alert>}
      {saved && <Alert tone="success">Preferências salvas.</Alert>}
      <div className="flex justify-end"><Button onClick={submit} loading={save.isPending} disabled={muted === null}>Salvar preferências</Button></div>
    </Card>
  );
}

/** Todas as notificações da pessoa, com filtros e preferências. */
export function NotificationsPage() {
  const navigate = useNavigate();
  const [unread, setUnread] = useState(false);
  const [kind, setKind] = useState("");
  const list = useNotifications({ unread, kind, limit: 200 });
  const mark = useMarkNotificationsRead();
  const items = list.data?.items ?? [];
  function openItem(n: OpsNotification) {
    if (!n.read_at) mark.mutate([n.id]);
    if (n.link) navigate(n.link);
  }
  return (
    <div className="space-y-4" data-testid="ops-notifications">
      <OpsModuleHeader icon={Bell} title="Notificações" description="Avisos da Central só para você: tarefas, menções, prazos, reuniões, clientes e leads." />
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={unread} onChange={(e) => setUnread(e.target.checked)} /> Só não lidas</label>
        <Select aria-label="Filtrar por tipo" className="w-auto" value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="">Todos os tipos</option>
          {OPS_NOTIFICATION_KINDS.map((k) => <option key={k} value={k}>{OPS_NOTIFICATION_LABELS[k]}</option>)}
        </Select>
        <span className="text-sm text-slate-500">{list.data ? `${list.data.unread} não lida(s)` : ""}</span>
        {(list.data?.unread ?? 0) > 0 && (
          <Button variant="secondary" className="ml-auto" loading={mark.isPending} onClick={() => mark.mutate(null)}>Marcar todas como lidas</Button>
        )}
      </div>
      {list.error && <Alert tone="error">{errorMessage(list.error)}</Alert>}
      <Card className="divide-y divide-slate-100 overflow-hidden" data-testid="ops-notification-list">
        {list.isLoading && <p className="p-4 text-sm text-slate-500">Carregando…</p>}
        {!list.isLoading && items.length === 0 && <p className="p-6 text-center text-sm text-slate-500">Nenhuma notificação com esses filtros.</p>}
        {items.map((n) => <NotificationItem key={n.id} n={n} onOpen={openItem} />)}
      </Card>
      {items.length >= 200 && <p className="text-xs text-slate-500">Mostrando as 200 mais recentes. As lidas continuam guardadas.</p>}
      <Preferences />
    </div>
  );
}

export function NotificationsRoute() {
  return (
    <RequireOps permission="ops.access">
      <NotificationsPage />
    </RequireOps>
  );
}
