import { CLIENT_STATUS_LABELS, CLIENT_STATUSES, type ClientStatus } from "@backstage/shared";
import { type FormEvent, useState } from "react";
import { Alert } from "@/components/ui/alert.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Field, Input, Select, Textarea } from "@/components/ui/field.tsx";
import { Modal } from "@/components/ui/modal.tsx";
import { errorMessage } from "@/lib/errors.ts";
import { useSaveClient } from "./api.ts";
import { type ClientFormValues, emptyClientForm, parseClientForm, toFormValues } from "./form.ts";
import { TIMEZONES } from "./timezones.ts";
import type { Client } from "./types.ts";

interface Props {
  client: Client | null;
  onClose: () => void;
  onSaved?: (id: string) => void;
}

export function ClientFormModal({ client, onClose, onSaved }: Props) {
  const isNew = client === null;
  const save = useSaveClient();
  const [values, setValues] = useState<ClientFormValues>(client ? toFormValues(client) : emptyClientForm);
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof ClientFormValues>(key: K) => (e: { target: { value: string } }) =>
    setValues((v) => ({ ...v, [key]: e.target.value as ClientFormValues[K] }));

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const parsed = parseClientForm(values);
    if ("error" in parsed) return setError(parsed.error);
    setError(null);
    try {
      const id = await save.mutateAsync({ id: client?.id, input: parsed.data });
      onSaved?.(id);
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <Modal title={isNew ? "Novo cliente" : "Editar cliente"} open onClose={onClose} size="lg">
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {error && <Alert tone="error">{error}</Alert>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nome do cliente *">
            {(id) => <Input id={id} value={values.name} onChange={set("name")} maxLength={120} autoFocus />}
          </Field>
          <Field label="Empresa (razão social)">
            {(id) => <Input id={id} value={values.company} onChange={set("company")} maxLength={160} />}
          </Field>
          <Field label="CNPJ (opcional)" hint="Aceita o formato novo, com letras.">
            {(id) => <Input id={id} value={values.cnpj} onChange={set("cnpj")} placeholder="00.000.000/0000-00" />}
          </Field>
          <Field label="Responsável">
            {(id) => <Input id={id} value={values.owner_name} onChange={set("owner_name")} maxLength={120} />}
          </Field>
          <Field label="Telefone">
            {(id) => <Input id={id} type="tel" value={values.phone} onChange={set("phone")} placeholder="(45) 99999-8888" />}
          </Field>
          <Field label="E-mail">
            {(id) => <Input id={id} type="email" value={values.email} onChange={set("email")} />}
          </Field>
          <Field label="Status">
            {(id) => (
              <Select id={id} value={values.status} onChange={set("status")}>
                {CLIENT_STATUSES.map((s: ClientStatus) => (
                  <option key={s} value={s}>
                    {CLIENT_STATUS_LABELS[s]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Fuso horário" hint="Define o que é “hoje” e “ontem” nos relatórios deste cliente.">
            {(id) => (
              <Select id={id} value={values.timezone} onChange={set("timezone")}>
                {TIMEZONES.map(([tz, label]) => (
                  <option key={tz} value={tz}>
                    {label}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>
        <Field label="Observações">
          {(id) => <Textarea id={id} value={values.notes} onChange={set("notes")} maxLength={5000} />}
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" loading={save.isPending}>
            {isNew ? "Cadastrar cliente" : "Salvar"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
