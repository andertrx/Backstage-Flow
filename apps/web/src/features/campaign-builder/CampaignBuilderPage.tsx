import { newEsteira } from "@backstage/shared";
import { FilePlus2, Layers, Megaphone } from "lucide-react";
import { type FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router";
import { Alert } from "@/components/ui/alert.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Card } from "@/components/ui/card.tsx";
import { Field, Input, Select } from "@/components/ui/field.tsx";
import { Modal } from "@/components/ui/modal.tsx";
import { useMetaAccounts } from "@/features/ads-builder/api.ts";
import { useAuth } from "@/features/auth/AuthProvider.tsx";
import { errorMessage } from "@/lib/errors.ts";
import { formatDateTime } from "@/lib/format.ts";
import { confirmar } from "@/lib/confirmStore.ts";
import { toast } from "@/lib/toastStore.ts";
import {
  type BuilderPersonPermission, useArchiveDraft, useUnarchiveDraft, useBuilderDrafts, useBuilderPeople, useBuilderPermissions, useCreateDraft, useSaveBuilderPermission,
} from "./api.ts";

function NewDraftModal({ open, onClose, esteira = false }: { open: boolean; onClose: () => void; esteira?: boolean }) {
  const accounts = useMetaAccounts();
  const create = useCreateDraft();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [accountId, setAccountId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const account = accounts.data?.find((a) => a.id === accountId);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!account) return;
    setError(null);
    try {
      const r = await create.mutateAsync({ name: name.trim(), clientId: account.client_id, adAccountId: account.id, data: esteira ? newEsteira() : {} });
      setName("");
      setAccountId("");
      onClose();
      navigate(esteira ? `/criar/esteira/${r.id}` : `/criar/campanhas/${r.id}`);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <Modal title={esteira ? "Subir criativos num conjunto que já existe" : "Novo rascunho de campanha"} open={open} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4 p-5" noValidate>
        <p className="text-sm text-slate-600">{esteira ? "Você escolhe o conjunto, a pasta do Drive e os textos. Nada é criado no Meta até você clicar em Subir." : "O rascunho fica só aqui no CRM. Nada é criado no Meta."}</p>
        {error && <Alert tone="error">{error}</Alert>}
        <Field label="Nome do rascunho">
          {(id) => <Input id={id} value={name} maxLength={120} onChange={(e) => setName(e.target.value)} placeholder={esteira ? "Ex.: Criativos Black — semana 2" : "Ex.: Black Friday — Cadastros"} />}
        </Field>
        <Field label="Conta de anúncio (Meta)">
          {(id) => (
            <Select id={id} value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              <option value="">Escolha a conta...</option>
              {accounts.data?.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.client_name} — {a.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" loading={create.isPending} disabled={name.trim().length < 2 || !account}>{esteira ? "Começar" : "Criar rascunho"}</Button>
        </div>
      </form>
    </Modal>
  );
}

function PeopleCard() {
  const people = useBuilderPeople(true);
  const save = useSaveBuilderPermission();
  const [error, setError] = useState<string | null>(null);

  async function toggle(p: BuilderPersonPermission, key: "criar" | "editar" | "publicar", value: boolean) {
    setError(null);
    const next = { ...p, [key]: value };
    // Regra do banco: criar ou publicar exige editar. Desligar "editar" desliga os outros.
    if (key === "editar" && !value) { next.criar = false; next.publicar = false; }
    if ((key === "criar" || key === "publicar") && value) next.editar = true;
    try {
      await save.mutateAsync({ user_id: p.user_id, criar: next.criar, editar: next.editar, publicar: next.publicar });
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <Card className="space-y-3 p-5" data-testid="builder-pessoas">
      <div>
        <h2 className="text-base font-semibold">Quem pode o quê</h2>
        <p className="text-sm text-slate-500">Administrador pode tudo. Gestor e operador só veem o módulo; criar, editar e publicar você libera aqui.</p>
      </div>
      {error && <Alert tone="error">{error}</Alert>}
      {people.error && <Alert tone="error">{errorMessage(people.error)}</Alert>}
      {people.data && people.data.length === 0 && <p className="text-sm text-slate-500">Nenhum gestor ou operador ativo.</p>}
      <ul className="divide-y divide-slate-100 rounded-lg ring-1 ring-slate-200">
        {people.data?.map((p) => (
          <li key={p.user_id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
            <div>
              <p className="font-medium">{p.nome}</p>
              <p className="text-xs capitalize text-slate-500">{p.papel}</p>
            </div>
            <div className="flex flex-wrap gap-4">
              {(["criar", "editar", "publicar"] as const).map((k) => (
                <label key={k} className="flex items-center gap-1.5 capitalize">
                  <input
                    type="checkbox"
                    checked={p[k]}
                    disabled={save.isPending}
                    aria-label={`${p.nome}: ${k}`}
                    onChange={(e) => toggle(p, k, e.target.checked)}
                  />
                  {k}
                </label>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export function CampaignBuilderPage() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === "admin";
  const perms = useBuilderPermissions();
  const drafts = useBuilderDrafts();
  const archive = useArchiveDraft();
  const unarchive = useUnarchiveDraft();
  const [open, setOpen] = useState(false);
  const [openEsteira, setOpenEsteira] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function doArchive(id: string, name: string) {
    if (!(await confirmar(`Arquivar o rascunho "${name}"? Ele sai da lista, mas continua guardado.`))) return;
    setError(null);
    try {
      await archive.mutateAsync(id);
      toast.success("Rascunho arquivado. Ele continua guardado.", {
        label: "Desfazer",
        onClick: () => unarchive.mutateAsync(id).then(() => toast.success("Rascunho de volta à lista.")).catch((e) => toast.error(errorMessage(e))),
      });
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="rounded-lg bg-brand-50 p-2 text-brand-600"><Megaphone className="size-5" aria-hidden /></span>
          <div>
            <h1 className="text-xl font-semibold">Criar campanhas</h1>
            <p className="text-sm text-slate-500">Suba criativos em conjuntos que já existem ou monte campanhas novas. Tudo é criado pausado.</p>
          </div>
        </div>
        {perms.data?.criar && (
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => setOpenEsteira(true)} data-testid="cb-subir-criativos">
              <Layers className="size-4" aria-hidden /> Subir criativos
            </Button>
            <Button variant="secondary" onClick={() => setOpen(true)}>
              <FilePlus2 className="size-4" aria-hidden /> Novo rascunho
            </Button>
          </div>
        )}
      </header>

      {perms.data && !perms.data.criar && (
        <Alert tone="info">Você pode ver os rascunhos, mas ainda não tem permissão para criar. Peça ao administrador.</Alert>
      )}
      {error && <Alert tone="error">{error}</Alert>}
      {drafts.error && <Alert tone="error">{errorMessage(drafts.error)}</Alert>}

      <Card className="space-y-3 p-5" data-testid="builder-rascunhos">
        <h2 className="text-base font-semibold">Rascunhos</h2>
        {drafts.isLoading && <p className="text-sm text-slate-500">Carregando...</p>}
        {drafts.data && drafts.data.length === 0 && <p className="text-sm text-slate-500">Nenhum rascunho ainda.</p>}
        <ul className="divide-y divide-slate-100 rounded-lg ring-1 ring-slate-200 empty:hidden">
          {drafts.data?.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
              <div className="min-w-0">
                <Link to={d.kind === "esteira" ? `/criar/esteira/${d.id}` : `/criar/campanhas/${d.id}`} className="font-medium text-brand-700 hover:underline">{d.name}</Link>
                {d.kind === "esteira" && <span className="ml-2 rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-700">Subir criativos</span>}
                <p className="text-xs text-slate-500">
                  {d.client_name} · {d.ad_account_name ?? "sem conta"} · atualizado {formatDateTime(d.updated_at)}
                  {d.updated_by_name ? ` por ${d.updated_by_name}` : ""}
                </p>
              </div>
              {perms.data?.editar && (
                <Button variant="ghost" className="text-xs" onClick={() => doArchive(d.id, d.name)} aria-label={`Arquivar ${d.name}`}>
                  Arquivar
                </Button>
              )}
            </li>
          ))}
        </ul>
      </Card>

      {isAdmin && <PeopleCard />}
      <NewDraftModal open={open} onClose={() => setOpen(false)} />
      <NewDraftModal esteira open={openEsteira} onClose={() => setOpenEsteira(false)} />
    </div>
  );
}
