/**
 * Tracking T2 (23/10/2026): regras de eventos configuradas no CRM, sem Tag Manager.
 *
 * As mesmas regras rodam em dois lugares:
 *   • aqui (tela do CRM: resumo da regra, "Testar endereço", validação);
 *   • no script do site (apps/web/public/t.js), reescritas em JavaScript simples.
 * Qualquer mudança de comportamento precisa ser feita nos dois (os testes cobrem os dois).
 */

export const RULE_KINDS = ["pagina", "clique", "formulario"] as const;
export type RuleKind = (typeof RULE_KINDS)[number];
export const RULE_KIND_LABELS: Record<RuleKind, string> = {
  pagina: "Página visitada",
  clique: "Clique em botão ou link",
  formulario: "Formulário enviado",
};

export type MatchOp = "contem" | "igual" | "comeca";
export const MATCH_OP_LABELS: Record<MatchOp, string> = { contem: "contém", igual: "é igual a", comeca: "começa com" };

export type ClickBy = "texto" | "link" | "seletor";
export const CLICK_BY_LABELS: Record<ClickBy, string> = {
  texto: "Texto do botão contém",
  link: "Endereço do link contém",
  seletor: "Seletor CSS (avançado)",
};

export type MetaMode = "mesmo" | "personalizado" | "nao_enviar";
export type ValueMode = "nenhum" | "fixo" | "pagina";

/** Eventos padrão do Meta, com o nome em português para a tela. */
export const RULE_EVENTS: { name: string; label: string }[] = [
  { name: "Lead", label: "Lead (cadastro / contato qualificado)" },
  { name: "Contact", label: "Contato" },
  { name: "Schedule", label: "Agendamento" },
  { name: "CompleteRegistration", label: "Cadastro concluído" },
  { name: "SubmitApplication", label: "Inscrição enviada" },
  { name: "ViewContent", label: "Viu conteúdo / produto" },
  { name: "AddToCart", label: "Adicionou ao carrinho" },
  { name: "InitiateCheckout", label: "Iniciou a compra" },
  { name: "Purchase", label: "Compra" },
];
export const EVENT_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9_]{1,49}$/;

export interface TrackingRuleInput {
  name: string;
  kind: RuleKind;
  match_op: MatchOp;
  match_text: string | null;
  click_by: ClickBy | null;
  field_name: string | null;
  field_values: string[] | null;
  event_name: string;
  meta_mode: MetaMode;
  meta_event: string | null;
  value_mode: ValueMode;
  value_fixed: number | null;
  value_selector: string | null;
  currency: string | null;
  order_param: string | null;
}

/** Texto comparável: minúsculo, sem acento, espaços simples. "  Lojísta " → "lojista". */
export function normalizeRuleText(s: string | null | undefined): string {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * A página bate com a regra? Compara com o caminho + parâmetros ("/obrigado?pedido=1").
 * Se o texto da regra começa com "http", compara com o endereço inteiro.
 * "igual" ignora a barra no fim ("/obrigado/" = "/obrigado").
 */
export function pageMatches(op: MatchOp, text: string, url: string): boolean {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  const want = normalizeRuleText(text);
  if (!want) return false;
  const full = /^https?:/.test(want);
  const target = normalizeRuleText(full ? u.href : u.pathname + u.search);
  const strip = (s: string) => (s.length > 1 ? s.replace(/\/+(\?|$)/, "$1") : s);
  if (op === "igual") return strip(target) === strip(want) || strip(normalizeRuleText(full ? u.origin + u.pathname : u.pathname)) === strip(want);
  if (op === "comeca") return target.startsWith(want);
  return target.includes(want);
}

/** A resposta do campo bate com uma das opções da regra? (sem diferença de maiúscula/acento) */
export function fieldValueMatches(options: string[], answer: string): boolean {
  const a = normalizeRuleText(answer);
  return a !== "" && options.some((o) => normalizeRuleText(o) === a);
}

/** O campo do formulário é o da regra? Compara com name, id, rótulo ou placeholder (contém). */
export function fieldNameMatches(ruleField: string, candidates: (string | null | undefined)[]): boolean {
  const want = normalizeRuleText(ruleField);
  return want !== "" && candidates.some((c) => {
    const n = normalizeRuleText(c);
    return n !== "" && (n === want || n.includes(want));
  });
}

/**
 * Valor de dinheiro escrito na página: "R$ 1.234,56" → 1234.56; "$1,234.56" → 1234.56; "297" → 297.
 * Sem número reconhecível → null (aí a compra não é enviada: nada de valor inventado).
 */
export function parseMoneyText(text: string | null | undefined): number | null {
  const m = String(text ?? "").match(/\d[\d.,\s]*/);
  if (!m) return null;
  let s = m[0].replace(/\s/g, "").replace(/[.,]$/, "");
  const lastDot = s.lastIndexOf(".");
  const lastComma = s.lastIndexOf(",");
  if (lastDot >= 0 && lastComma >= 0) {
    const dec = lastDot > lastComma ? "." : ",";
    const thou = dec === "." ? "," : ".";
    s = s.split(thou).join("").replace(dec, ".");
  } else if (lastComma >= 0 || lastDot >= 0) {
    const sep = lastComma >= 0 ? "," : ".";
    const parts = s.split(sep);
    const tail = parts[parts.length - 1];
    s = parts.length === 2 && tail.length <= 2 ? parts.join(".") : parts.join("");
  }
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 && n <= 1e9 ? Math.round(n * 100) / 100 : null;
}

/** Nome do evento como vai ao Meta (ou null se a regra diz para não enviar). */
export function metaEventName(rule: Pick<TrackingRuleInput, "event_name" | "meta_mode" | "meta_event">): string | null {
  if (rule.meta_mode === "nao_enviar") return null;
  if (rule.meta_mode === "personalizado") return rule.meta_event;
  return rule.event_name;
}

export function ruleEventLabel(name: string): string {
  return RULE_EVENTS.find((e) => e.name === name)?.label.split(" (")[0] ?? name;
}

/** Resumo em português para a lista de regras. */
export function describeRule(r: TrackingRuleInput): string {
  let when: string;
  if (r.kind === "pagina") when = `Quando o endereço ${MATCH_OP_LABELS[r.match_op]} "${r.match_text ?? ""}"`;
  else if (r.kind === "clique") {
    const how = r.click_by === "seletor" ? "no elemento" : r.click_by === "link" ? "em link que contém" : "em botão/link com o texto";
    when = `Quando clicar ${how} "${r.match_text ?? ""}"`;
  } else {
    when = r.match_text ? `Quando enviar o formulário "${r.match_text}"` : "Quando enviar qualquer formulário";
    if (r.field_name && r.field_values?.length) when += ` com "${r.field_name}" = ${r.field_values.map((v) => `"${v}"`).join(" ou ")}`;
  }
  const meta = metaEventName(r);
  const metaText = meta == null ? "não vai ao Meta" : meta === r.event_name ? "vai ao Meta" : `vai ao Meta como "${meta}"`;
  return `${when} → ${ruleEventLabel(r.event_name)} (${metaText})`;
}

/** Problemas da regra antes de salvar (mesmas travas do banco, em português). */
export function validateTrackingRule(r: TrackingRuleInput): string[] {
  const errors: string[] = [];
  if (!r.name.trim()) errors.push("Dê um nome para a regra.");
  if (!EVENT_NAME_PATTERN.test(r.event_name)) errors.push("Nome do evento inválido (letras, números e _; começa com letra).");
  if (r.kind === "pagina" && !r.match_text?.trim()) errors.push("Informe o endereço (ou parte dele) da página.");
  if (r.kind === "clique" && (!r.click_by || !r.match_text?.trim())) errors.push("Informe o texto, o link ou o seletor do botão.");
  if (r.kind === "formulario" && r.field_name != null && !(r.field_values?.length)) errors.push("Informe as respostas do campo que contam.");
  if (r.meta_mode === "personalizado" && !(r.meta_event && EVENT_NAME_PATTERN.test(r.meta_event))) {
    errors.push("Informe o nome do evento personalizado para o Meta (letras, números e _).");
  }
  if (r.value_mode !== "nenhum" && !/^[A-Z]{3}$/.test(r.currency ?? "")) errors.push("Escolha a moeda do valor.");
  if (r.value_mode === "fixo" && (r.value_fixed == null || !(r.value_fixed >= 0))) errors.push("Informe o valor fixo.");
  if (r.value_mode === "pagina" && !r.value_selector?.trim()) errors.push("Informe onde o valor aparece na página (seletor CSS).");
  if (r.event_name === "Purchase" && r.value_mode === "nenhum") errors.push("Compra precisa de valor (fixo ou lido da página): o Meta recusa compra sem valor.");
  if (r.order_param != null && !/^[A-Za-z0-9_-]{1,50}$/.test(r.order_param)) errors.push("Nome do parâmetro do pedido inválido.");
  return errors;
}
