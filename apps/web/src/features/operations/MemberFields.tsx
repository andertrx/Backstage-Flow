import { OPS_DEFAULT_PERMISSIONS, OPS_PERMISSION_LABELS, OPS_PERMISSIONS, type Role } from "@backstage/shared";
import { Field, Input, Select } from "@/components/ui/field.tsx";
import type { OpsSector, OpsTeamMember } from "./api.ts";

export interface MemberDraft {
  /** "" = não participa da Central. */
  primarySector: string;
  secondary: string[];
  jobTitle: string;
  active: boolean;
  joinsMeetings: boolean;
  permissions: string[];
}

export function memberDraftFrom(m: OpsTeamMember | null | undefined): MemberDraft {
  if (!m?.in_ops) {
    return { primarySector: "", secondary: [], jobTitle: "", active: true, joinsMeetings: true, permissions: [...OPS_DEFAULT_PERMISSIONS] };
  }
  return {
    primarySector: m.primary_sector_id ?? "",
    secondary: m.secondary_sector_ids,
    jobTitle: m.job_title ?? "",
    active: m.member_active,
    joinsMeetings: m.joins_meetings,
    permissions: m.permissions ?? [],
  };
}

/**
 * Setor principal, secundários, cargo, participação em reuniões e permissões
 * na Central. Admin tem todas as permissões (a lista fica escondida).
 */
export function MemberFields({ value, onChange, sectors, role, inOps }: {
  value: MemberDraft;
  onChange: (v: MemberDraft) => void;
  sectors: OpsSector[];
  role: Role;
  /** Já está na Central (aí não dá para "tirar": só desativar, o histórico fica). */
  inOps: boolean;
}) {
  const active = sectors.filter((s) => s.status === "ativo");
  // Setor que a pessoa já tem, mesmo que desativado depois, continua visível.
  const selectable = (id: string) => active.some((s) => s.id === id) || value.secondary.includes(id) || value.primarySector === id;
  const listed = sectors.filter((s) => selectable(s.id));
  const set = (patch: Partial<MemberDraft>) => onChange({ ...value, ...patch });
  const togglePerm = (p: string) =>
    set({ permissions: value.permissions.includes(p) ? value.permissions.filter((x) => x !== p) : [...value.permissions, p] });

  return (
    <div className="space-y-4" data-testid="member-fields">
      <Field label="Setor principal" hint={inOps ? undefined : "Escolha um setor para colocar a pessoa na Central de Operações."}>
        {(id) => (
          <Select id={id} value={value.primarySector} onChange={(e) => set({ primarySector: e.target.value, secondary: value.secondary.filter((s) => s !== e.target.value) })}>
            {!inOps && <option value="">Não participa da Central</option>}
            {listed.map((s) => <option key={s.id} value={s.id} disabled={s.status !== "ativo"}>{s.name}{s.status !== "ativo" ? " (inativo)" : ""}</option>)}
          </Select>
        )}
      </Field>

      {value.primarySector && (
        <>
          <fieldset className="space-y-1.5">
            <legend className="text-sm font-medium text-slate-700">Setores secundários</legend>
            <div className="grid gap-x-4 gap-y-1 sm:grid-cols-2">
              {listed.filter((s) => s.id !== value.primarySector).map((s) => (
                <label key={s.id} className="flex items-center gap-2 text-sm text-slate-700">
                  <input type="checkbox" checked={value.secondary.includes(s.id)} disabled={s.status !== "ativo" && !value.secondary.includes(s.id)}
                    onChange={(e) => set({ secondary: e.target.checked ? [...value.secondary, s.id] : value.secondary.filter((x) => x !== s.id) })} />
                  <span className="size-2.5 rounded-full" style={{ background: s.color }} aria-hidden />
                  {s.name}
                </label>
              ))}
            </div>
          </fieldset>

          <Field label="Cargo ou função (opcional)">
            {(id) => <Input id={id} value={value.jobTitle} maxLength={80} placeholder="Ex.: Designer Pleno" onChange={(e) => set({ jobTitle: e.target.value })} />}
          </Field>

          <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate-700">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={value.active} onChange={(e) => set({ active: e.target.checked })} /> Ativo na Central
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={value.joinsMeetings} onChange={(e) => set({ joinsMeetings: e.target.checked })} /> Participa das reuniões
            </label>
          </div>

          {role === "admin" ? (
            <p className="text-xs text-slate-500">Administradores têm todas as permissões da Central.</p>
          ) : (
            <fieldset className="space-y-1.5" data-testid="member-permissions">
              <legend className="text-sm font-medium text-slate-700">Permissões na Central</legend>
              <div className="grid gap-x-4 gap-y-1 sm:grid-cols-2">
                {OPS_PERMISSIONS.map((p) => (
                  <label key={p} className="flex items-center gap-2 text-sm text-slate-700">
                    <input type="checkbox" checked={value.permissions.includes(p)} disabled={p !== "ops.access" && !value.permissions.includes("ops.access")}
                      onChange={() => togglePerm(p)} />
                    {OPS_PERMISSION_LABELS[p]}
                  </label>
                ))}
              </div>
              <p className="text-xs text-slate-500">Sem "Acessar a Central de Operações" as demais não valem. Setores, equipe e configurações: só o admin.</p>
            </fieldset>
          )}
        </>
      )}
    </div>
  );
}
