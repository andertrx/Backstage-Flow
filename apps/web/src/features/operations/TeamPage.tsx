import { opsCan, ROLE_LABELS } from "@backstage/shared";
import { Pencil, Search, Users } from "lucide-react";
import { type FormEvent, useMemo, useState } from "react";
import { Alert } from "@/components/ui/alert.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Card } from "@/components/ui/card.tsx";
import { Input, Select } from "@/components/ui/field.tsx";
import { Modal } from "@/components/ui/modal.tsx";
import { errorMessage } from "@/lib/errors.ts";
import { type OpsSector, type OpsTeamMember, useMyOpsPermissions, useOpsSectors, useOpsTeam, useSaveMember } from "./api.ts";
import { type MemberDraft, memberDraftFrom, MemberFields } from "./MemberFields.tsx";
import { OpsModuleHeader } from "./OpsHeader.tsx";

export function SectorChip({ sector, muted }: { sector: OpsSector | undefined; muted?: boolean }) {
  if (!sector) return null;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${muted ? "bg-white text-slate-600 ring-slate-200" : "text-slate-800 ring-transparent"}`}
      style={muted ? undefined : { background: `${sector.color}1f` }}>
      <span className="size-2 rounded-full" style={{ background: sector.color }} aria-hidden />
      {sector.name}
    </span>
  );
}

function MemberModal({ member, sectors, onClose }: { member: OpsTeamMember; sectors: OpsSector[]; onClose: () => void }) {
  const [draft, setDraft] = useState<MemberDraft>(memberDraftFrom(member));
  const [error, setError] = useState<string | null>(null);
  const save = useSaveMember();
  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!draft.primarySector) return setError("Escolha o setor principal.");
    try {
      await save.mutateAsync({ userId: member.user_id, ...draft });
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    }
  }
  return (
    <Modal title={`${member.full_name} na Central`} open onClose={onClose} size="lg">
      <form onSubmit={submit} className="space-y-4">
        <p className="text-sm text-slate-500">{member.email} · papel {ROLE_LABELS[member.role]}</p>
        <MemberFields value={draft} onChange={setDraft} sectors={sectors} role={member.role} inOps={member.in_ops} />
        {error && <Alert tone="error">{error}</Alert>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" loading={save.isPending}>Salvar</Button>
        </div>
      </form>
    </Modal>
  );
}

/**
 * Equipe da Central (36.1): quem está em cada setor. As contagens de tarefas
 * (abertas, em andamento, atrasadas, concluídas) entram junto com as tarefas (36.2).
 */
export function TeamPage() {
  const perms = useMyOpsPermissions();
  const isAdmin = opsCan(perms.data, "ops.admin");
  const team = useOpsTeam();
  const sectors = useOpsSectors();
  const [q, setQ] = useState("");
  const [sector, setSector] = useState("");
  const [status, setStatus] = useState<"" | "ativo" | "inativo" | "fora">("");
  const [editing, setEditing] = useState<OpsTeamMember | null>(null);

  const byId = useMemo(() => new Map((sectors.data ?? []).map((s) => [s.id, s])), [sectors.data]);
  const rows = useMemo(() => {
    const text = q.trim().toLowerCase();
    return (team.data ?? []).filter((m) => {
      if (text && !`${m.full_name} ${m.email} ${m.job_title ?? ""}`.toLowerCase().includes(text)) return false;
      if (sector && m.primary_sector_id !== sector && !m.secondary_sector_ids.includes(sector)) return false;
      if (status === "fora" && m.in_ops) return false;
      if (status === "ativo" && !(m.in_ops && m.member_active)) return false;
      if (status === "inativo" && !(m.in_ops && !m.member_active)) return false;
      return true;
    });
  }, [team.data, q, sector, status]);

  const error = team.error ?? sectors.error;
  return (
    <div className="space-y-4" data-testid="ops-team">
      <OpsModuleHeader icon={Users} title="Equipe" description="Quem está em cada setor: setor principal, outros setores, cargo e situação." />
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-slate-400" aria-hidden />
          <Input aria-label="Buscar pessoa" placeholder="Buscar por nome, e-mail ou cargo" className="pl-9" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Select aria-label="Filtrar por setor" className="w-auto" value={sector} onChange={(e) => setSector(e.target.value)}>
          <option value="">Todos os setores</option>
          {(sectors.data ?? []).filter((s) => s.status !== "arquivado").map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </Select>
        <Select aria-label="Filtrar por situação" className="w-auto" value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
          <option value="">Todas as situações</option>
          <option value="ativo">Ativos na Central</option>
          <option value="inativo">Inativos na Central</option>
          {isAdmin && <option value="fora">Ainda fora da Central</option>}
        </Select>
      </div>

      {error ? <Alert tone="error">{errorMessage(error)}</Alert> : null}
      {team.isLoading || sectors.isLoading ? (
        <div className="h-40 animate-pulse rounded-xl bg-slate-100" aria-label="Carregando" />
      ) : rows.length === 0 ? (
        <Card className="space-y-2 p-8 text-center" data-testid="ops-team-empty">
          <Users className="mx-auto size-8 text-slate-300" aria-hidden />
          <p className="font-medium text-slate-900">{team.data?.length ? "Ninguém com esses filtros." : "Ninguém na Central ainda."}</p>
          {isAdmin && !team.data?.length && <p className="text-sm text-slate-500">Coloque as pessoas nos setores em Configurações → Usuários.</p>}
        </Card>
      ) : (
        <Card className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Pessoa</th>
                <th className="px-4 py-3">Setor principal</th>
                <th className="px-4 py-3">Outros setores</th>
                <th className="px-4 py-3">Cargo</th>
                <th className="px-4 py-3">Situação</th>
                {isAdmin && <th className="px-4 py-3 text-right">Ações</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((m) => (
                <tr key={m.user_id} data-testid="ops-team-row">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-semibold text-blue-700" aria-hidden>
                        {(m.full_name || m.email).trim().split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase()}
                      </span>
                      <div>
                        <p className="font-medium text-slate-900">{m.full_name}</p>
                        <p className="text-xs text-slate-500">{m.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">{m.in_ops ? <SectorChip sector={byId.get(m.primary_sector_id ?? "")} /> : <span className="text-slate-400">—</span>}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">{m.secondary_sector_ids.map((s) => <SectorChip key={s} sector={byId.get(s)} muted />)}</div>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{m.job_title || "—"}</td>
                  <td className="px-4 py-3">
                    {!m.in_ops ? <Badge>Fora da Central</Badge>
                      : !m.profile_active ? <Badge tone="danger">Usuário desativado</Badge>
                      : m.member_active ? <Badge tone="success">Ativo</Badge> : <Badge tone="warning">Inativo na Central</Badge>}
                  </td>
                  {isAdmin && (
                    <td className="px-4 py-3 text-right">
                      <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => setEditing(m)} aria-label={`Editar ${m.full_name} na Central`}>
                        <Pencil className="size-3.5" aria-hidden /> {m.in_ops ? "Editar" : "Colocar na Central"}
                      </Button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      {editing && sectors.data && <MemberModal member={editing} sectors={sectors.data} onClose={() => setEditing(null)} />}
    </div>
  );
}
