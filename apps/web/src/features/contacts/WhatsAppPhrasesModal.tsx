import { matchTriggers, type WaTrigger } from "@backstage/shared";
import { Archive, Plus } from "lucide-react";
import { useState } from "react";
import { Alert } from "@/components/ui/alert.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Field, Input, Select, Textarea } from "@/components/ui/field.tsx";
import { Modal } from "@/components/ui/modal.tsx";
import { errorMessage } from "@/lib/errors.ts";
import { formatDateTime, formatMoney } from "@/lib/format.ts";
import { type ContactProfile, type ContactStage, useSaveWaTrigger, useWaTriggers, type WaTriggerLogRow, type WaTriggerRow } from "./api.ts";

const RESULT: Record<WaTriggerLogRow["result"], { label: string; tone: "success" | "neutral" | "warning" }> = {
  aplicado: { label: "Marcado", tone: "success" },
  repetido: { label: "Repetido", tone: "neutral" },
  sem_valor: { label: "Venda sem valor", tone: "warning" },
  ignorado: { label: "Sem mudança", tone: "neutral" },
};

/**
 * Frases do WhatsApp (Tracking T4.1, como no Tintim): quem atende manda no chat uma frase combinada e o CRM marca
 * o contato daquele número (perfil ou etapa; venda com o valor escrito na mensagem) e avisa o Meta.
 * Só admin e gestor configuram. O texto das conversas nunca é guardado.
 */
export function WhatsAppPhrasesModal({ clientId, profiles, stages, onClose }: {
  clientId: string;
  profiles: ContactProfile[];
  stages: ContactStage[];
  onClose: () => void;
}) {
  const data = useWaTriggers(clientId);
  const save = useSaveWaTrigger();
  const [problem, setProblem] = useState<string | null>(null);
  const [phrase, setPhrase] = useState("");
  const [target, setTarget] = useState("");
  const [sample, setSample] = useState("");
  const liveProfiles = profiles.filter((p) => !p.archived_at);
  const liveStages = stages.filter((s) => !s.archived_at);
  const triggers = data.data?.triggers ?? [];

  const kindOf = (t: Pick<WaTriggerRow, "profile_id" | "stage_id">): WaTrigger["kind"] =>
    t.profile_id ? "perfil" : stages.find((s) => s.id === t.stage_id)?.kind === "ganha" ? "venda" : "etapa";
  const targetLabel = (t: Pick<WaTriggerRow, "profile_id" | "stage_id">) =>
    t.profile_id ? `Perfil: ${profiles.find((p) => p.id === t.profile_id)?.name ?? "—"}` : `Etapa: ${stages.find((s) => s.id === t.stage_id)?.name ?? "—"}`;

  const run = async (input: Parameters<typeof save.mutateAsync>[0]) => {
    setProblem(null);
    try {
      await save.mutateAsync(input);
      return true;
    } catch (err) {
      setProblem(errorMessage(err));
      return false;
    }
  };
  const add = async () => {
    const [kind, id] = target.split(":");
    const ok = await run({ values: { client_id: clientId, phrase: phrase.trim(), position: triggers.length,
      ...(kind === "perfil" ? { profile_id: id } : { stage_id: id }) } });
    if (ok) { setPhrase(""); setTarget(""); }
  };

  const tested = sample.trim()
    ? matchTriggers(sample, triggers.filter((t) => t.enabled).map((t) => ({ id: t.id, phrase: t.phrase, kind: kindOf(t), currency: t.currency })))
    : null;

  return (
    <Modal title="Frases do WhatsApp" open size="lg" onClose={onClose}>
      <div className="space-y-5 text-sm" data-testid="wa-phrases">
        <p className="text-slate-600">
          Quem atende no WhatsApp manda no chat uma <strong>frase combinada</strong> e o CRM marca o contato daquele número, sem ninguém entrar no
          CRM. Ex.: “Parabéns pela sua compra de R$ 297” → <strong>Venda de R$ 297</strong>, enviada ao Meta. Para venda, o valor precisa estar na
          mensagem com a moeda (R$ 297, 297 reais, US$ 50); sem valor, vale o valor padrão da frase ou a venda não é registrada.
          A conversa é lida só para achar a frase: <strong>o texto nunca é guardado</strong>.
        </p>
        {data.data && !data.data.whatsappOn && (
          <Alert tone="warning">
            Este cliente ainda não tem o WhatsApp ligado ao CRM (Tracking → WhatsApp API, pela API oficial ou Coexistence). As frases ficam salvas e
            passam a valer quando ligar.
          </Alert>
        )}
        {data.error && <Alert tone="error">{errorMessage(data.error)}</Alert>}
        {problem && <Alert tone="error">{problem}</Alert>}

        <section className="space-y-2">
          <h3 className="font-semibold text-slate-900">Frases</h3>
          {data.data && triggers.length === 0 && <p className="text-slate-500">Nenhuma frase ainda.</p>}
          <ul className="space-y-2">
            {triggers.map((t) => (
              <PhraseRow key={t.id} trigger={t} kind={kindOf(t)} label={targetLabel(t)} onSave={(values) => run({ id: t.id, values })} />
            ))}
          </ul>
          <div className="flex flex-wrap items-end gap-2 rounded-lg bg-slate-50 p-3" data-testid="wa-phrase-new">
            <div className="min-w-56 flex-1">
              <Field label="Frase nova">
                {(id) => <Input id={id} value={phrase} maxLength={120} placeholder="Ex.: Parabéns pela sua compra" onChange={(e) => setPhrase(e.target.value)} />}
              </Field>
            </div>
            <div className="min-w-48">
              <Field label="Marca">
                {(id) => (
                  <Select id={id} value={target} onChange={(e) => setTarget(e.target.value)}>
                    <option value="">— escolha —</option>
                    <optgroup label="Perfil">
                      {liveProfiles.map((p) => <option key={p.id} value={`perfil:${p.id}`}>Perfil: {p.name}{p.meta_event ? " ★" : ""}</option>)}
                    </optgroup>
                    <optgroup label="Etapa">
                      {liveStages.map((s) => <option key={s.id} value={`etapa:${s.id}`}>Etapa: {s.name}{s.meta_event ? " ★" : ""}</option>)}
                    </optgroup>
                  </Select>
                )}
              </Field>
            </div>
            <Button onClick={add} disabled={phrase.trim().length < 3 || !target} loading={save.isPending}>
              <Plus className="size-4" aria-hidden /> Adicionar
            </Button>
          </div>
          <p className="text-xs text-slate-500">★ = vai ao Meta. Escolha frases que o atendente só usa nesse momento (não “obrigado”, que aparece em toda conversa).</p>
        </section>

        <section className="space-y-2">
          <h3 className="font-semibold text-slate-900">Testar uma mensagem</h3>
          <Textarea aria-label="Mensagem de teste" className="min-h-16" value={sample} placeholder="Cole aqui uma mensagem como o atendente mandaria"
            onChange={(e) => setSample(e.target.value)} />
          {tested && (
            <div data-testid="wa-phrase-test" className="text-slate-700">
              {tested.length === 0 ? "Nenhuma frase encontrada: o CRM não faria nada." : tested.map((m) => {
                const t = triggers.find((x) => x.id === m.trigger_id)!;
                const value = m.kind !== "venda" ? "" : m.value != null ? ` de ${formatMoney(m.value, m.currency ?? t.currency)}`
                  : t.default_value != null ? ` de ${formatMoney(t.default_value, t.currency)} (valor padrão)` : " — sem valor na mensagem: a venda não seria registrada";
                return <p key={m.trigger_id}>→ {targetLabel(t)}{value}</p>;
              })}
            </div>
          )}
        </section>

        <section className="space-y-2">
          <h3 className="font-semibold text-slate-900">Frases reconhecidas</h3>
          {data.data && data.data.log.length === 0 && <p className="text-slate-500">Nenhuma ainda.</p>}
          {data.data && data.data.log.length > 0 && (
            <ul className="divide-y divide-slate-100" data-testid="wa-phrase-log">
              {data.data.log.map((r) => {
                const t = triggers.find((x) => x.id === r.trigger_id);
                return (
                  <li key={r.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2" data-testid="wa-phrase-log-row">
                    <Badge tone={RESULT[r.result].tone}>{RESULT[r.result].label}</Badge>
                    <span className="text-xs text-slate-500">{formatDateTime(r.at)}</span>
                    <span className="text-slate-700">{t ? `“${t.phrase}”` : "frase arquivada"}</span>
                    {r.contact_id && <span className="text-slate-700">contato #{r.contact_id}</span>}
                    {r.value_micros != null && r.currency && <span className="text-slate-700">{formatMoney(r.value_micros / 1e6, r.currency)}</span>}
                    {r.reason && <span className="w-full text-xs text-slate-500">{r.reason}</span>}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </Modal>
  );
}

function PhraseRow({ trigger: t, kind, label, onSave }: {
  trigger: WaTriggerRow;
  kind: WaTrigger["kind"];
  label: string;
  onSave: (values: Partial<WaTriggerRow>) => Promise<boolean>;
}) {
  const [phrase, setPhrase] = useState(t.phrase);
  const [value, setValue] = useState(t.default_value != null ? String(t.default_value).replace(".", ",") : "");
  const parsed = value.trim() === "" ? null : Number(value.replace(/\./g, "").replace(",", "."));
  const valueOk = parsed === null || (Number.isFinite(parsed) && parsed >= 0);
  const dirty = phrase.trim() !== t.phrase || (kind === "venda" && parsed !== t.default_value);
  return (
    <li className="flex flex-wrap items-center gap-2 rounded-lg ring-1 ring-slate-200 p-2" data-testid="wa-phrase">
      <Input aria-label={`Frase: ${t.phrase}`} className="min-w-48 flex-1" value={phrase} maxLength={120} onChange={(e) => setPhrase(e.target.value)} />
      <span className="text-xs text-slate-600">{label}</span>
      {kind === "venda" && (
        <Input aria-label={`Valor padrão: ${t.phrase}`} className="w-32" placeholder="Valor padrão" inputMode="decimal" value={value}
          onChange={(e) => setValue(e.target.value)} />
      )}
      <label className="flex items-center gap-1 text-xs text-slate-600">
        <input type="checkbox" checked={t.enabled} aria-label={`Ligada: ${t.phrase}`} onChange={(e) => onSave({ enabled: e.target.checked })} /> Ligada
      </label>
      <Button variant="secondary" className="px-3 py-1.5 text-xs" disabled={!dirty || phrase.trim().length < 3 || !valueOk}
        onClick={() => onSave({ phrase: phrase.trim(), ...(kind === "venda" ? { default_value: parsed } : {}) })}>Salvar</Button>
      <Button variant="ghost" className="px-2 py-1.5 text-xs" aria-label={`Arquivar ${t.phrase}`}
        onClick={() => { if (window.confirm(`Arquivar a frase “${t.phrase}”? O que já foi marcado continua.`)) onSave({ archived_at: new Date().toISOString() }); }}>
        <Archive className="size-3.5" aria-hidden />
      </Button>
    </li>
  );
}
