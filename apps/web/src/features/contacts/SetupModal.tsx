import { EVENT_NAME_PATTERN } from "@backstage/shared";
import { Archive, Plus } from "lucide-react";
import { useState } from "react";
import { Alert } from "@/components/ui/alert.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Input, Select } from "@/components/ui/field.tsx";
import { Modal } from "@/components/ui/modal.tsx";
import { errorMessage } from "@/lib/errors.ts";
import { type ContactProfile, type ContactStage, useSaveSetupItem } from "./api.ts";

const KIND_LABELS: Record<ContactStage["kind"], string> = { aberta: "Em andamento", ganha: "Venda (ganha)", perdida: "Perdido" };

/**
 * Perfis (Lojista, Sacoleiro...) e etapas (Novo → Venda) de um cliente, e o nome com que cada um vai ao Meta.
 * Só admin e gestor. Nada é apagado: "Arquivar" tira da lista e mantém o histórico.
 */
export function SetupModal({ clientId, profiles, stages, onClose }: {
  clientId: string;
  profiles: ContactProfile[];
  stages: ContactStage[];
  onClose: () => void;
}) {
  const save = useSaveSetupItem();
  const [problem, setProblem] = useState<string | null>(null);
  const live = <T extends { archived_at: string | null }>(list: T[]) => list.filter((x) => !x.archived_at);

  const run = (input: Parameters<typeof save.mutate>[0]) => {
    setProblem(null);
    save.mutate(input);
  };
  const metaOk = (v: string) => v === "" || EVENT_NAME_PATTERN.test(v);

  return (
    <Modal title="Perfis e etapas dos contatos" open size="lg" onClose={onClose}>
      <div className="space-y-6 text-sm" data-testid="contacts-setup">
        <p className="text-slate-600">
          Evento no Meta vazio = só registra no CRM. Preenchido = ao marcar, o CRM manda esse evento ao Meta (uma vez por pessoa).
          Para usar na campanha, crie no Gerenciador de Eventos uma <strong>conversão personalizada</strong> com esse nome (ex.: LeadLojista).
        </p>

        <section className="space-y-2">
          <h3 className="font-semibold text-slate-900">Perfis</h3>
          <ul className="space-y-2">
            {live(profiles).map((p) => (
              <SetupRow key={p.id} name={p.name} meta={p.meta_event} metaEnabled testId="setup-profile"
                onSave={(name, meta) => {
                  if (!metaOk(meta)) return setProblem("Evento no Meta: só letras, números e _ (ex.: LeadLojista).");
                  run({ table: "profiles", id: p.id, values: { name, meta_event: meta || null } });
                }}
                onArchive={() => run({ table: "profiles", id: p.id, values: { archived_at: new Date().toISOString() } })} />
            ))}
          </ul>
          <Button variant="secondary" className="px-3 py-1.5 text-xs" data-testid="setup-add-profile"
            onClick={() => run({ table: "profiles", values: { client_id: clientId, name: `Novo perfil ${live(profiles).length + 1}`, position: profiles.length } })}>
            <Plus className="size-3.5" aria-hidden /> Perfil
          </Button>
        </section>

        <section className="space-y-2">
          <h3 className="font-semibold text-slate-900">Etapas</h3>
          <ul className="space-y-2">
            {live(stages).map((s) => (
              <SetupRow key={s.id} name={s.name} meta={s.meta_event} metaEnabled={s.kind === "ganha"} kind={KIND_LABELS[s.kind]} testId="setup-stage"
                onSave={(name, meta) => {
                  if (!metaOk(meta)) return setProblem("Evento no Meta: só letras, números e _ (ex.: Purchase).");
                  run({ table: "stages", id: s.id, values: { name, meta_event: s.kind === "ganha" ? meta || null : null } });
                }}
                onArchive={() => {
                  if (s.kind === "aberta" && live(stages).filter((x) => x.kind === "aberta").length <= 1) {
                    return setProblem("Mantenha ao menos uma etapa em andamento (é onde o contato novo entra).");
                  }
                  run({ table: "stages", id: s.id, values: { archived_at: new Date().toISOString() } });
                }} />
            ))}
          </ul>
          <div className="flex flex-wrap gap-2">
            {(["aberta", "ganha", "perdida"] as const).map((kind) => (
              <Button key={kind} variant="secondary" className="px-3 py-1.5 text-xs"
                onClick={() => run({ table: "stages", values: { client_id: clientId, name: `${KIND_LABELS[kind]} ${live(stages).length + 1}`, kind, position: stages.length } })}>
                <Plus className="size-3.5" aria-hidden /> {KIND_LABELS[kind]}
              </Button>
            ))}
          </div>
        </section>

        {problem && <Alert tone="error">{problem}</Alert>}
        {save.error && <Alert tone="error">{errorMessage(save.error)}</Alert>}
      </div>
    </Modal>
  );
}

function SetupRow({ name, meta, metaEnabled, kind, testId, onSave, onArchive }: {
  name: string;
  meta: string | null;
  metaEnabled: boolean;
  kind?: string;
  testId: string;
  onSave: (name: string, meta: string) => void;
  onArchive: () => void;
}) {
  const [n, setN] = useState(name);
  const [m, setM] = useState(meta ?? "");
  const dirty = n.trim() !== name || m.trim() !== (meta ?? "");
  return (
    <li className="flex flex-wrap items-center gap-2" data-testid={testId}>
      <Input aria-label={`Nome: ${name}`} className="w-40" value={n} maxLength={40} onChange={(e) => setN(e.target.value)} />
      {kind && <span className="text-xs text-slate-500">{kind}</span>}
      {metaEnabled ? (
        <Input aria-label={`Evento no Meta: ${name}`} className="w-44" placeholder="Não vai ao Meta" value={m} onChange={(e) => setM(e.target.value)} />
      ) : (
        <Select aria-label={`Evento no Meta: ${name}`} className="w-44" disabled value=""><option value="">Não vai ao Meta</option></Select>
      )}
      <Button variant="secondary" className="px-3 py-1.5 text-xs" disabled={!dirty || !n.trim()} onClick={() => onSave(n.trim(), m.trim())}>Salvar</Button>
      <Button variant="ghost" className="px-2 py-1.5 text-xs" aria-label={`Arquivar ${name}`} onClick={onArchive}>
        <Archive className="size-3.5" aria-hidden />
      </Button>
    </li>
  );
}
