import { Copy, KeyRound, Link2, RefreshCw } from "lucide-react";
import { useState } from "react";
import { Alert } from "@/components/ui/alert.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Card } from "@/components/ui/card.tsx";
import { Select } from "@/components/ui/field.tsx";
import { useClientAccess } from "@/features/clients/api.ts";
import { cn } from "@/lib/cn.ts";
import { errorMessage } from "@/lib/errors.ts";
import { formatDateTime } from "@/lib/format.ts";
import { useClientPortal, useNewClientLink, useSetClientPortal } from "./api.ts";

function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn("relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        checked ? "bg-emerald-600" : "bg-slate-300")}
    >
      <span className={cn("inline-block size-5 rounded-full bg-white shadow transition-transform", checked ? "translate-x-5" : "translate-x-0.5")} />
    </button>
  );
}

const VALIDITY = [
  { value: "", label: "Sem validade (até você desligar)" },
  { value: "30", label: "30 dias" },
  { value: "90", label: "90 dias" },
  { value: "365", label: "1 ano" },
];

/**
 * Etapa 19.2 — como o cliente acessa o dashboard. Dois interruptores
 * independentes: login (usuário com papel Cliente) e link secreto.
 * Admin e gestor responsável mudam; o banco confere a permissão.
 */
export function ClientPortalCard({ clientId }: { clientId: string }) {
  const portal = useClientPortal(clientId);
  const access = useClientAccess(clientId, true);
  const set = useSetClientPortal(clientId);
  const newLink = useNewClientLink(clientId);
  const [validity, setValidity] = useState("");
  const [freshLink, setFreshLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const p = portal.data;
  const clientUsers = (access.data ?? []).filter((a) => a.profile?.role === "cliente");
  const expired = p?.link_expires_at ? Date.parse(p.link_expires_at) <= Date.now() : false;

  async function run(fn: () => Promise<unknown>) {
    setError(null);
    try { await fn(); } catch (e) { setError(errorMessage(e)); }
  }
  async function generate() {
    if (p?.link_created_at && !window.confirm("Gerar um link novo? O link atual para de funcionar na hora.")) return;
    await run(async () => {
      const token = await newLink.mutateAsync(validity ? Number(validity) : null);
      setFreshLink(`${window.location.origin}/r/${token}`);
      setCopied(false);
    });
  }
  async function copy() {
    if (!freshLink) return;
    try { await navigator.clipboard.writeText(freshLink); setCopied(true); } catch { setCopied(false); }
  }

  return (
    <Card className="space-y-5 p-6" data-testid="client-portal-card">
      <div>
        <h2 className="text-base font-semibold">Acesso do cliente ao dashboard</h2>
        <p className="text-sm text-slate-500">Duas formas, cada uma liga e desliga sozinha. Desligado, o cliente não vê nada.</p>
      </div>
      {portal.error ? <Alert tone="error">{errorMessage(portal.error)}</Alert> : null}

      <section className="space-y-2 border-t border-slate-100 pt-4" aria-label="Login do cliente">
        <div className="flex items-start justify-between gap-4">
          <div className="flex gap-3">
            <KeyRound className="mt-0.5 size-5 text-slate-400" aria-hidden />
            <div>
              <p className="font-medium text-slate-900">Login com e-mail e senha</p>
              <p className="text-sm text-slate-500">Quem tem o papel <strong>Cliente</strong> e está liberado para esta empresa entra e vê só este dashboard.</p>
            </div>
          </div>
          <Switch label="Login do cliente" checked={Boolean(p?.login_enabled)} disabled={!p || set.isPending}
            onChange={(v) => run(() => set.mutateAsync({ login: v }))} />
        </div>
        <div className="pl-8 text-sm text-slate-600" data-testid="portal-client-users">
          {clientUsers.length > 0 ? (
            <>Pessoas com login: {clientUsers.map((u) => `${u.profile?.full_name} (${u.profile?.email})`).join(", ")}.</>
          ) : (
            <>Nenhum usuário com papel Cliente liberado. Crie em <strong>Configurações → Usuários</strong> (papel Cliente) e libere esta empresa em "Equipe com acesso".</>
          )}
        </div>
      </section>

      <section className="space-y-3 border-t border-slate-100 pt-4" aria-label="Link secreto">
        <div className="flex items-start justify-between gap-4">
          <div className="flex gap-3">
            <Link2 className="mt-0.5 size-5 text-slate-400" aria-hidden />
            <div>
              <p className="font-medium text-slate-900">Link secreto (sem login)</p>
              <p className="text-sm text-slate-500">Quem tiver o link vê o dashboard. Trate como uma senha: envie só para o cliente.</p>
            </div>
          </div>
          <Switch label="Link secreto" checked={Boolean(p?.link_enabled)} disabled={!p || !p.link_created_at || set.isPending}
            onChange={(v) => run(() => set.mutateAsync({ link: v }))} />
        </div>

        {freshLink && (
          <div className="space-y-2 rounded-lg bg-amber-50 p-3 ring-1 ring-amber-200" data-testid="portal-fresh-link">
            <p className="text-sm font-medium text-amber-900">Copie agora: por segurança, o link completo só aparece desta vez.</p>
            <div className="flex gap-2">
              <input readOnly value={freshLink} aria-label="Link do cliente" onFocus={(e) => e.currentTarget.select()}
                className="min-w-0 flex-1 rounded-lg bg-white px-3 py-2 font-mono text-xs text-slate-800 ring-1 ring-inset ring-slate-300" />
              <Button variant="secondary" onClick={copy}><Copy className="size-4" aria-hidden /> {copied ? "Copiado" : "Copiar"}</Button>
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 pl-8">
          <Select aria-label="Validade do link" className="w-auto" value={validity} onChange={(e) => setValidity(e.target.value)}>
            {VALIDITY.map((v) => <option key={v.value} value={v.value}>{v.label}</option>)}
          </Select>
          <Button variant={p?.link_created_at ? "secondary" : "primary"} onClick={generate} loading={newLink.isPending}>
            <RefreshCw className="size-4" aria-hidden /> {p?.link_created_at ? "Gerar novo link" : "Gerar link"}
          </Button>
        </div>

        {p?.link_created_at && (
          <dl className="grid gap-x-6 gap-y-1 pl-8 text-sm text-slate-600 sm:grid-cols-2" data-testid="portal-link-info">
            <div><dt className="inline text-slate-500">Criado em: </dt><dd className="inline">{formatDateTime(p.link_created_at)}</dd></div>
            <div><dt className="inline text-slate-500">Validade: </dt><dd className="inline">{p.link_expires_at ? `${expired ? "venceu em" : "até"} ${formatDateTime(p.link_expires_at)}` : "sem validade"}</dd></div>
            <div><dt className="inline text-slate-500">Último acesso: </dt><dd className="inline">{p.link_last_used_at ? formatDateTime(p.link_last_used_at) : "nunca"}</dd></div>
            <div><dt className="inline text-slate-500">Aberturas: </dt><dd className="inline">{p.link_uses}</dd></div>
          </dl>
        )}
        {p?.link_created_at && !freshLink && (
          <p className="pl-8 text-xs text-slate-500">Perdeu o link? Gere um novo: o antigo para de funcionar na hora.</p>
        )}
      </section>

      {error && <Alert tone="error">{error}</Alert>}
    </Card>
  );
}
