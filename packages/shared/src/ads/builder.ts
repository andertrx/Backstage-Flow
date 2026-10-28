/**
 * Etapa 42 — Criador de Anúncios. A página só monta um PEDIDO em texto para colar no Claude, que cria os anúncios
 * no Meta Ads. Nada é criado no Meta pelo CRM. Regras iguais às do banco (private.ads_builder_*).
 * "tipo" deixa a estrutura pronta para, no futuro, pedir também campanhas e conjuntos.
 */

export const ADS_BUILDER_TIPOS = ["anuncios"] as const;
export type AdsBuilderTipo = (typeof ADS_BUILDER_TIPOS)[number];

export type MidiaTipo = "video" | "imagem";
export interface MidiaPasta {
  link: string;
  rotulo: string;
  tipo: MidiaTipo;
}

export type Distribuicao = "combinar" | "rodizio" | "manual";
export const DISTRIBUICAO_LABELS: Record<Distribuicao, string> = {
  combinar: "Combinar todos no mesmo anúncio",
  rodizio: "Um texto diferente por anúncio, em rodízio",
  manual: "Mapeamento manual",
};

export const CTA_OPTIONS = [
  "Enviar mensagem", "Enviar mensagem pelo WhatsApp", "Saiba mais", "Cadastre-se", "Comprar agora", "Pedir agora", "Fale conosco",
  "Obter oferta", "Reservar", "Inscrever-se", "Ver mais", "Ligar agora", "Baixar", "Solicitar orçamento",
] as const;

export type DestinoTipo = "whatsapp" | "formulario" | "site";
export const DESTINO_LABELS: Record<DestinoTipo, string> = { whatsapp: "WhatsApp", formulario: "Formulário instantâneo", site: "Site" };

/** Recursos de IA e aprimoramentos automáticos da Meta: todos DESLIGADOS por padrão. */
export const IA_RECURSOS = [
  { id: "melhorias_padrao", label: "Melhorias padrão do criativo (Advantage+ Creative)" },
  { id: "variacoes_texto", label: "Variações de texto geradas por IA" },
  { id: "ajustes_visuais", label: "Ajustes visuais automáticos (brilho, contraste, recorte)" },
  { id: "expansao_midia", label: "Expansão de imagem e vídeo por IA" },
  { id: "animacao_imagem", label: "Animação de imagem" },
  { id: "musica", label: "Música automática" },
  { id: "sobreposicoes", label: "Sobreposições de texto e etiquetas automáticas" },
  { id: "traducao", label: "Tradução automática" },
] as const;
export type IaRecurso = (typeof IA_RECURSOS)[number]["id"];

export interface MapeamentoLinha {
  /** Índice (1…) do texto e do título usados no anúncio de número N (posição na lista). */
  texto: number;
  titulo: number | null;
}

export interface AdsBuilderForm {
  tipo: AdsBuilderTipo;
  // 1. Onde criar
  conta: string;
  campanha: string;
  conjunto: string;
  pagina: string;
  instagram: string;
  // 2. Mídia
  pastas: MidiaPasta[];
  padrao_nome_arquivo: string;
  quantidade: number | null;
  faixa_inicio: string;
  faixa_fim: string;
  feed_vertical: boolean;
  // 3. Textos
  textos: string[];
  titulos: string[];
  descricoes: string[];
  distribuicao: Distribuicao;
  mapeamento: MapeamentoLinha[];
  // 4. Botão e destino
  cta: string;
  destino: DestinoTipo;
  whatsapp_numero: string;
  whatsapp_mensagem: string;
  whatsapp_saudacao: string;
  site_url: string;
  site_utms: string;
  formulario_nome: string;
  // 5. Nome
  nome_modelo: string;
  tema: string;
  data: string;
  // 6. Regras
  status: "PAUSADO" | "ATIVO";
  ia_ligados: IaRecurso[];
  pausados_origem: "incluir" | "ignorar";
  observacoes: string;
}

export const ADS_BUILDER_PADRAO_ARQUIVO = "ADS-01.mp4 (normal/vertical) · ADS-01 | Feed.mp4 (feed)";

export function adsBuilderDefaults(hoje = new Date()): AdsBuilderForm {
  const d = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric" }).format(hoje);
  return {
    tipo: "anuncios",
    conta: "", campanha: "", conjunto: "", pagina: "", instagram: "",
    pastas: [{ link: "", rotulo: "Vídeos verticais", tipo: "video" }],
    padrao_nome_arquivo: ADS_BUILDER_PADRAO_ARQUIVO,
    quantidade: null, faixa_inicio: "ADS-01", faixa_fim: "", feed_vertical: true,
    textos: [""], titulos: [], descricoes: [], distribuicao: "combinar", mapeamento: [],
    cta: "Enviar mensagem", destino: "whatsapp",
    whatsapp_numero: "", whatsapp_mensagem: "", whatsapp_saudacao: "", site_url: "", site_utms: "", formulario_nome: "",
    nome_modelo: "ADS-{nº} | {tema} | {data}", tema: "", data: d.replace(/\//g, "-"),
    status: "PAUSADO", ia_ligados: [], pausados_origem: "ignorar", observacoes: "",
  };
}

/** Completa um formulário salvo (modelo/histórico antigo) com os padrões de hoje. */
export function adsBuilderNormalize(raw: unknown): AdsBuilderForm {
  const base = adsBuilderDefaults();
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<AdsBuilderForm>;
  const out = { ...base, ...r } as AdsBuilderForm;
  out.pastas = Array.isArray(r.pastas) && r.pastas.length ? r.pastas.map((p) => ({ link: String(p?.link ?? ""), rotulo: String(p?.rotulo ?? ""), tipo: p?.tipo === "imagem" ? "imagem" : "video" })) : base.pastas;
  out.textos = Array.isArray(r.textos) && r.textos.length ? r.textos.map(String) : [""];
  out.titulos = Array.isArray(r.titulos) ? r.titulos.map(String) : [];
  out.descricoes = Array.isArray(r.descricoes) ? r.descricoes.map(String) : [];
  out.mapeamento = Array.isArray(r.mapeamento) ? r.mapeamento : [];
  out.ia_ligados = Array.isArray(r.ia_ligados) ? r.ia_ligados.filter((x): x is IaRecurso => IA_RECURSOS.some((i) => i.id === x)) : [];
  return out;
}

const clean = (list: readonly string[]) => list.map((t) => t.trim()).filter((t) => t !== "");

// ---------------------------------------------------------------- segurança: nada de senha, token ou cartão

const luhn = (digits: string) => {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let n = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) { n *= 2; if (n > 9) n -= 9; }
    sum += n;
  }
  return sum % 10 === 0;
};

/** Diz o que parece segredo num texto (token de acesso, chave, senha, cartão). null = nada encontrado. */
export function findSecret(text: string): string | null {
  if (/\bEAA[A-Za-z0-9]{20,}/.test(text)) return "um token de acesso do Meta";
  if (/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}/.test(text)) return "um token de acesso";
  if (/\b(sk|pk|rk)_(live|test)_[A-Za-z0-9]{10,}|\bsk-[A-Za-z0-9_-]{20,}|\bya29\.[A-Za-z0-9_-]{20,}|\bAIza[A-Za-z0-9_-]{30,}/.test(text)) return "uma chave de acesso";
  if (/\b(senha|password|passwd|token|secret|client_secret|api[_-]?key)\s*[:=]\s*\S{4,}/i.test(text)) return "uma senha ou chave";
  for (const m of text.matchAll(/\b(?:\d[ .-]?){15,19}\b/g)) {
    const d = m[0].replace(/\D/g, "");
    if (d.length >= 15 && d.length <= 19 && luhn(d)) return "um número de cartão";
  }
  return null;
}

// ---------------------------------------------------------------- validação

export interface AdsBuilderError {
  field: string;
  message: string;
}

const isUrl = (s: string) => /^https?:\/\/\S+\.\S+/i.test(s.trim());

export function validateAdsBuilder(f: AdsBuilderForm): AdsBuilderError[] {
  const e: AdsBuilderError[] = [];
  if (!f.conta.trim()) e.push({ field: "conta", message: "Informe a conta de anúncios." });
  if (!f.campanha.trim()) e.push({ field: "campanha", message: "Informe a campanha de destino." });
  if (!f.conjunto.trim()) e.push({ field: "conjunto", message: "Informe o conjunto de destino." });
  const pastas = f.pastas.filter((p) => p.link.trim());
  if (pastas.length === 0) e.push({ field: "pastas", message: "Adicione pelo menos uma pasta de mídia do Google Drive." });
  pastas.forEach((p, i) => {
    if (!isUrl(p.link)) e.push({ field: `pasta:${i}`, message: `O link da pasta ${i + 1} precisa começar com https://.` });
  });
  if (clean(f.textos).length === 0) e.push({ field: "textos", message: "Escreva pelo menos um texto principal." });
  if (f.quantidade != null && (!Number.isInteger(f.quantidade) || f.quantidade < 1 || f.quantidade > 200)) {
    e.push({ field: "quantidade", message: "Quantidade de anúncios entre 1 e 200." });
  }
  if (f.destino === "site" && f.site_url.trim() && !isUrl(f.site_url)) e.push({ field: "site_url", message: "A URL do site precisa começar com https://." });
  if (f.destino === "whatsapp" && f.whatsapp_numero.trim() && f.whatsapp_numero.replace(/\D/g, "").length < 10) {
    e.push({ field: "whatsapp_numero", message: "Número do WhatsApp com DDD (pelo menos 10 dígitos)." });
  }
  const segredo = findSecret(JSON.stringify(f));
  if (segredo) e.push({ field: "segredo", message: `Parece que há ${segredo} num dos campos. Não coloque senhas, tokens nem dados de pagamento.` });
  return e;
}

/** Aviso (não impede): a faixa de numeração não bate com a quantidade. */
export function faixaAviso(f: AdsBuilderForm): string | null {
  const a = Number(/(\d+)\s*$/.exec(f.faixa_inicio.trim())?.[1]);
  const b = Number(/(\d+)\s*$/.exec(f.faixa_fim.trim())?.[1]);
  if (!f.quantidade || !Number.isFinite(a) || !Number.isFinite(b) || !f.faixa_fim.trim()) return null;
  return b - a + 1 === f.quantidade ? null : `A faixa ${f.faixa_inicio} até ${f.faixa_fim} tem ${b - a + 1} anúncios, mas a quantidade é ${f.quantidade}.`;
}

// ---------------------------------------------------------------- nome dos anúncios

/** Número do anúncio na faixa (ex.: faixa ADS-01, índice 0 → "01"). */
export function numeroAnuncio(f: AdsBuilderForm, indice: number): string {
  const m = /(\d+)\s*$/.exec(f.faixa_inicio.trim());
  const ini = m ? Number(m[1]) : 1;
  const width = m ? m[1].length : 2;
  return String(ini + indice).padStart(width, "0");
}

/** Nome do anúncio a partir do modelo: {nº}, {tema}, {data}, {campanha}, {conjunto}. */
export function nomeAnuncio(f: AdsBuilderForm, indice = 0): string {
  return f.nome_modelo
    .replace(/\{(n[ºo°]|num|numero)\}/gi, numeroAnuncio(f, indice))
    .replace(/\{tema\}/gi, f.tema.trim() || "tema")
    .replace(/\{data\}/gi, f.data.trim())
    .replace(/\{campanha\}/gi, f.campanha.trim())
    .replace(/\{conjunto\}/gi, f.conjunto.trim())
    .trim();
}

// ---------------------------------------------------------------- pedido em texto

const numbered = (list: string[]) => list.map((t, i) => `  ${i + 1}. ${t.replace(/\n/g, "\n     ")}`).join("\n");

function distribuicaoTexto(f: AdsBuilderForm, textos: string[], titulos: string[]): string {
  if (textos.length <= 1 && titulos.length <= 1) return "um texto e um título para todos os anúncios";
  if (f.distribuicao === "combinar") return "combinar todos os textos e títulos no mesmo anúncio (várias opções de texto no anúncio)";
  if (f.distribuicao === "rodizio") return "um texto diferente por anúncio, em rodízio (anúncio 1 = texto 1, anúncio 2 = texto 2… e recomeça; o mesmo para os títulos)";
  const linhas = f.mapeamento.slice(0, f.quantidade ?? f.mapeamento.length).map((m, i) =>
    `  ${f.faixa_inicio.replace(/\d+\s*$/, "") || "ADS-"}${numeroAnuncio(f, i)} → texto ${m.texto}${m.titulo ? `, título ${m.titulo}` : ""}`);
  return `mapeamento manual:\n${linhas.join("\n")}`;
}

function destinoTexto(f: AdsBuilderForm): string {
  if (f.destino === "whatsapp") {
    return [`WhatsApp — número: ${f.whatsapp_numero.trim() || "(o já configurado na página)"}`,
      f.whatsapp_mensagem.trim() ? `mensagem pré-preenchida: "${f.whatsapp_mensagem.trim()}"` : null,
      f.whatsapp_saudacao.trim() ? `saudação/perguntas rápidas: ${f.whatsapp_saudacao.trim()}` : null].filter(Boolean).join(" / ");
  }
  if (f.destino === "site") return [`Site — URL: ${f.site_url.trim() || "(informar)"}`, f.site_utms.trim() ? `UTMs: ${f.site_utms.trim()}` : null].filter(Boolean).join(" / ");
  return `Formulário instantâneo — formulário: ${f.formulario_nome.trim() || "(informar)"}`;
}

/** O texto final do pedido, para copiar e colar no Claude. */
export function buildAdsPedido(f: AdsBuilderForm): string {
  const textos = clean(f.textos);
  const titulos = clean(f.titulos);
  const descricoes = clean(f.descricoes);
  const pastas = f.pastas.filter((p) => p.link.trim());
  const iaLigados = IA_RECURSOS.filter((r) => f.ia_ligados.includes(r.id));
  const faixa = f.faixa_fim.trim() ? `${f.faixa_inicio.trim()} até ${f.faixa_fim.trim()}` : f.faixa_inicio.trim() || "—";
  const lines: (string | null)[] = [
    "Crie anúncios no Meta Ads com os dados abaixo.",
    "",
    `Conta: ${f.conta.trim()} | Campanha: ${f.campanha.trim()} | Conjunto: ${f.conjunto.trim()}`,
    `Página / Instagram: ${f.pagina.trim() || "—"} / ${f.instagram.trim() || "—"}`,
    "",
    "Mídia (Google Drive):",
    ...pastas.map((p, i) => `  ${i + 1}. ${p.rotulo.trim() || "Pasta"} (${p.tipo === "video" ? "vídeo" : "imagem"}): ${p.link.trim()}`),
    `Padrão de nome dos arquivos: ${f.padrao_nome_arquivo.trim() || "—"}`,
    `Quantidade: ${f.quantidade ?? "todos os arquivos das pastas"} (faixa ${faixa}).`,
    `Feed para feed, vertical para Stories e Reels: ${f.feed_vertical ? "sim" : "não"}.`,
    "",
    "Textos principais:",
    numbered(textos),
    titulos.length ? "Títulos:" : "Títulos: nenhum.",
    titulos.length ? numbered(titulos) : null,
    descricoes.length ? "Descrições:" : "Descrições: nenhuma.",
    descricoes.length ? numbered(descricoes) : null,
    `Distribuição: ${distribuicaoTexto(f, textos, titulos)}`,
    "",
    `Botão: ${f.cta} | Destino: ${destinoTexto(f)}`,
    `Nome dos anúncios: modelo "${f.nome_modelo.trim()}" (ex.: ${nomeAnuncio(f, 0)})`,
    "",
    `Regras: criar ${f.status}; ${iaLigados.length ? "recursos de IA e aprimoramentos automáticos DESLIGADOS, EXCETO os listados abaixo" : "todos os recursos de IA e aprimoramentos automáticos DESLIGADOS"}; pausados na origem: ${f.pausados_origem}.`,
    f.status === "ATIVO" ? "⚠️ ATENÇÃO: os anúncios devem ser criados ATIVOS (não pausados)." : null,
    iaLigados.length ? `⚠️ ATENÇÃO — recursos de IA LIGADOS a pedido: ${iaLigados.map((r) => r.label).join("; ")}. Todos os outros ficam desligados.` : null,
    f.observacoes.trim() ? `Observações: ${f.observacoes.trim()}` : null,
    "",
    "Instruções: o criativo deve respeitar as configurações da campanha e do conjunto de destino. Suba os vídeos do Drive para a biblioteca de mídia da conta, "
      + "na quantidade indicada. Crie PRIMEIRO apenas um anúncio, me mostre o resultado e espere minha aprovação antes de criar os demais. "
      + "Me avise a cada etapa e diga qualquer erro ou limitação da Meta antes de seguir.",
  ];
  return lines.filter((l): l is string => l !== null).join("\n").replace(/\n{3,}/g, "\n\n");
}

/** Mapeamento manual com uma linha por anúncio (até 50), mantendo o que já existe. */
export function resizeMapeamento(f: AdsBuilderForm): MapeamentoLinha[] {
  const n = Math.min(Math.max(f.quantidade ?? 1, 1), 50);
  return Array.from({ length: n }, (_, i) => f.mapeamento[i] ?? { texto: 1, titulo: clean(f.titulos).length ? 1 : null });
}
