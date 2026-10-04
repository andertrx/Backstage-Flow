import { Bell } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { cn } from "@/lib/cn.ts";
import { formatRelative } from "@/lib/format.ts";
import { type OpsNotification, useMarkNotificationsRead, useNotifications, useUnreadNotifications } from "./notificationsApi.ts";

export function NotificationItem({ n, onOpen, compact }: { n: OpsNotification; onOpen: (n: OpsNotification) => void; compact?: boolean }) {
  return (
    <button type="button" onClick={() => onOpen(n)} data-testid="ops-notification"
      className={cn("flex w-full gap-2.5 px-3 py-2.5 text-left hover:bg-slate-50", !n.read_at && "bg-blue-50/60")}>
      <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", n.read_at ? "bg-transparent" : "bg-blue-600")} aria-hidden />
      <span className="min-w-0 flex-1">
        <span className={cn("block text-sm", n.read_at ? "text-slate-700" : "font-semibold text-slate-900")}>{n.title}</span>
        {n.body && <span className={cn("block text-xs text-slate-500", compact && "truncate")}>{n.body}</span>}
        <span className="block text-[11px] text-slate-400">{n.actor ? `${n.actor} · ` : ""}{formatRelative(n.created_at)}</span>
      </span>
      {!n.read_at && <span className="sr-only">(não lida)</span>}
    </button>
  );
}

/** Sino da Central no topo: não lidas, últimas notificações e atalho para todas. */
export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const unread = useUnreadNotifications(true);
  const list = useNotifications({ limit: 15 }, open);
  const mark = useMarkNotificationsRead();
  const count = unread.data ?? 0;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  function openItem(n: OpsNotification) {
    if (!n.read_at) mark.mutate([n.id]);
    setOpen(false);
    if (n.link) navigate(n.link);
  }

  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} data-testid="ops-bell"
        aria-label={count ? `Notificações (${count} não lidas)` : "Notificações"}
        className="relative rounded-lg p-2 text-slate-600 hover:bg-slate-100 hover:text-slate-900">
        <Bell className="size-5" aria-hidden />
        {count > 0 && (
          <span className="absolute right-0.5 top-0.5 grid min-w-4 place-items-center rounded-full bg-blue-600 px-1 text-[10px] font-bold leading-4 text-white" data-testid="ops-bell-count">
            {count > 99 ? "99+" : count}
          </span>
        )}
      </button>
      {open && (
        <div className="fixed inset-x-2 top-[4.5rem] z-50 overflow-hidden rounded-xl sm:absolute sm:inset-x-auto sm:right-0 sm:top-11 sm:w-[22rem] bg-white shadow-xl ring-1 ring-slate-200"
          role="dialog" aria-label="Notificações" data-testid="ops-bell-panel">
          <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
            <p className="text-sm font-semibold text-slate-900">Notificações</p>
            {count > 0 && (
              <button type="button" className="text-xs font-medium text-blue-700 hover:underline" onClick={() => mark.mutate(null)}>Marcar todas como lidas</button>
            )}
          </div>
          <div className="max-h-[min(24rem,calc(100dvh-12rem))] divide-y divide-slate-100 overflow-y-auto">
            {list.isLoading && <p className="px-3 py-4 text-sm text-slate-500">Carregando…</p>}
            {list.data && list.data.items.length === 0 && <p className="px-3 py-6 text-center text-sm text-slate-500">Nenhuma notificação por aqui.</p>}
            {list.data?.items.map((n) => <NotificationItem key={n.id} n={n} onOpen={openItem} compact />)}
          </div>
          <Link to="/operacoes/notificacoes" onClick={() => setOpen(false)}
            className="block border-t border-slate-100 px-3 py-2 text-center text-sm font-medium text-blue-700 hover:bg-slate-50">
            Ver todas e preferências
          </Link>
        </div>
      )}
    </div>
  );
}
