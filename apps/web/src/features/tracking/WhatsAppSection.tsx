import { CHANNEL_LABELS, EVIDENCE_LABELS, hashUserData, splitFullName } from "@backstage/shared";
import { MessageCircle, Search } from "lucide-react";
import { type FormEvent, useState } from "react";
import { Alert } from "@/components/ui/alert.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Card } from "@/components/ui/card.tsx";
import { Field, Input, Select } from "@/components/ui/field.tsx";
import { errorMessage } from "@/lib/errors.ts";
import { formatDateTime } from "@/lib/format.ts";
import { type WhatsAppClick, type WhatsAppLookup, useWhatsAppLookup, useWhatsAppMark } from "./api.ts";
import { normalizeWaCode, parseMoneyInput, WA_STATUS_LABELS } from "./logic.ts";

const STATUS_TONE = { clicado: "neutral", lead: "brand", venda: "success" } as const;

/**
 * WhatsApp (app comum): a equipe digita o código que veio na mensagem
 * ("ref. K7Q2M9"), vê de onde a pessoa veio e marca Lead ou Venda.
 */
export function WhatsAppSection({ clicks, siteName, canMark }: { clicks: WhatsAppClick[]; siteName: (id: string) => string; canMark: boolean }) {
  const [typed, setTyped] = useState("");
  const [code, setCode] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const lookup = useWhatsAppLookup(code);

  function onSearch(e: FormEvent) {
    e.preventDefault();
    const c = normalizeWaCode(typed);
    if (!c) {
      setCode(null);
      return setFormError("Código inválido. São 6 letras/números, como K7Q2M9 (aparece no fim da mensagem: “ref. K7Q2M9”).");
    }
    setFormError(null);
    setCode(c);
  }

  return (
    <section aria-label="WhatsApp" className="space-y-3">
      <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
        <MessageCircle className="size-4 text-emerald-600" aria-hidden /> WhatsApp
      </h2>
      <Card className="space-y-3 p-4">
        <p className="text-sm text-slate-500">
          Quando chegar uma mensagem com “ref. XXXXXX” no final, digite o código aqui para ver de onde a pessoa veio e marcar Lead ou Venda.
        </p>
        <form onSubmit={onSearch} className="flex flex-wrap items-end gap-2" noValidate>
          <div className="w-48">
            <Field label="Código da conversa">
              {(id) => <Input id={id} value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="K7Q2M9" autoComplete="off" />}
            </Field>
          </div>
          <Button type="submit" variant="secondary"><Search className="size-4" aria-hidden /> Buscar</Button>
        </form>
        {formError && <Alert tone="error">{formError}</Alert>}
        {lookup.error && <Alert tone="error">{errorMessage(lookup.error)}</Alert>}
        {code && lookup.isFetched && !lookup.data && !lookup.error && (
          <Alert tone="warning">Código {code} não encontrado. Confira se foi digitado certo e se o site é de um cliente liberado para você.</Alert>
        )}
        {lookup.data && <LookupResult found={lookup.data} canMark={canMark} />}
      </Card>

      <Card className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs text-slate-500">
            <tr>
              <th className="px-3 py-2 font-medium">Clique</th>
              <th className="px-3 py-2 font-medium">Código</th>
              <th className="px-3 py-2 font-medium">Site</th>
              <th className="px-3 py-2 font-medium">Origem</th>
              <th className="px-3 py-2 font-medium">Situação</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100" data-testid="wa-clicks">
            {clicks.map((c) => (
              <tr key={c.id} data-testid="wa-click-row">
                <td className="whitespace-nowrap px-3 py-2 text-slate-600">{formatDateTime(c.clicked_at)}</td>
                <td className="px-3 py-2 font-mono text-slate-900">{c.code}</td>
                <td className="px-3 py-2 text-slate-600">{siteName(c.container_id)}</td>
                <td className="px-3 py-2 text-slate-700">
                  {c.touch ? `${CHANNEL_LABELS[c.touch.channel]} · ${EVIDENCE_LABELS[c.touch.evidence]}${c.touch.utm_campaign ? ` · ${c.touch.utm_campaign}` : ""}` : "Origem desconhecida"}
                </td>
                <td className="px-3 py-2">
                  <Badge tone={STATUS_TONE[c.status]}>{WA_STATUS_LABELS[c.status]}{c.sales > 1 ? ` (${c.sales})` : ""}</Badge>
                </td>
              </tr>
            ))}
            {clicks.length === 0 && (
              <tr><td colSpan={5} className="px-3 py-6 text-center text-slate-500">Nenhum clique com código ainda. Ligue “Código de rastreio no WhatsApp” no código de instalação.</td></tr>
            )}
          </tbody>
        </table>
      </Card>
    </section>
  );
}

function LookupResult({ found, canMark }: { found: WhatsAppLookup; canMark: boolean }) {
  const mark = useWhatsAppMark();
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [value, setValue] = useState("");
  const [currency, setCurrency] = useState("BRL");
  const [orderId, setOrderId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function submit(kind: "lead" | "venda") {
    setError(null);
    setNotice(null);
    let amount: number | undefined;
    if (kind === "venda") {
      const v = parseMoneyInput(value);
      if (v == null) return setError("Informe o valor da venda (ex.: 350,00).");
      amount = v;
    }
    // Contato do cliente: cifrado AQUI (SHA-256). O texto legível não sai desta tela.
    const { first, last } = splitFullName(name);
    const ud = await hashUserData({ email, phone, firstName: first, lastName: last });
    try {
      const r = await mark.mutateAsync({
        action: "mark", code: found.code, kind,
        ...(kind === "venda" ? { value: amount, currency, orderId: orderId.trim() || undefined } : {}),
        ...(Object.keys(ud).length ? { ud } : {}),
      });
      setNotice(r.status === "ja_marcado" ? "Esta conversa já estava marcada como Lead." : kind === "venda" ? "Venda registrada." : "Lead registrado.");
      setPhone("");
      setEmail("");
      setName("");
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <div className="space-y-3 rounded-lg bg-slate-50 p-3 text-sm" data-testid="wa-lookup">
      <p>
        <strong className="font-mono">{found.code}</strong> · {found.container_name} · clicou em {formatDateTime(found.clicked_at)}{" "}
        <Badge tone={STATUS_TONE[found.status]}>{WA_STATUS_LABELS[found.status]}</Badge>
        {found.test && <> <Badge tone="warning">Teste</Badge></>}
      </p>
      <p className="text-slate-700" data-testid="wa-origin">
        Origem: <strong>{found.channel ? CHANNEL_LABELS[found.channel] : "desconhecida"}</strong>
        {found.evidence && <> · {EVIDENCE_LABELS[found.evidence]}</>}
        {found.campaign && <> · {found.campaign}</>}
        {found.reason && <span className="block text-xs text-slate-500">{found.reason}</span>}
      </p>
      {error && <Alert tone="error">{error}</Alert>}
      {notice && <Alert tone="success">{notice}</Alert>}
      {canMark ? (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Telefone do cliente (opcional)" hint="Melhora o reconhecimento no Meta. É cifrado antes de sair desta tela.">
              {(id) => <Input id={id} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(45) 99999-8888" autoComplete="off" />}
            </Field>
            <Field label="E-mail (opcional)">
              {(id) => <Input id={id} value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" />}
            </Field>
            <Field label="Nome (opcional)">
              {(id) => <Input id={id} value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />}
            </Field>
          </div>
          <Button type="button" variant="secondary" loading={mark.isPending} onClick={() => submit("lead")}>Marcar como Lead</Button>
          <div className="grid gap-3 border-t border-slate-200 pt-3 sm:grid-cols-[1fr_auto_1fr_auto] sm:items-end">
            <Field label="Valor da venda">
              {(id) => <Input id={id} value={value} onChange={(e) => setValue(e.target.value)} placeholder="350,00" inputMode="decimal" />}
            </Field>
            <Field label="Moeda">
              {(id) => (
                <Select id={id} value={currency} onChange={(e) => setCurrency(e.target.value)}>
                  <option value="BRL">BRL</option>
                  <option value="USD">USD</option>
                  <option value="EUR">EUR</option>
                </Select>
              )}
            </Field>
            <Field label="Nº do pedido (recomendado)" hint="Evita contar a mesma venda duas vezes.">
              {(id) => <Input id={id} value={orderId} onChange={(e) => setOrderId(e.target.value)} placeholder="PED-123" />}
            </Field>
            <Button type="button" loading={mark.isPending} onClick={() => submit("venda")}>Marcar como Venda</Button>
          </div>
        </div>
      ) : (
        <p className="text-xs text-slate-500">Seu papel só permite consultar. Quem atende (operador, gestor ou admin) marca Lead/Venda.</p>
      )}
    </div>
  );
}
