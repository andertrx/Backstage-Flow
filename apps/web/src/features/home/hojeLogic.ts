/**
 * Etapa 43.2 — tela "Hoje": monta a lista "Precisa de você agora" a partir de números que o CRM já tem.
 * Nada é estimado: cada linha vem de uma consulta existente, e linha sem nada pendente não aparece.
 */
export type HojeTone = "danger" | "warning" | "info";

export interface HojeInputs {
  /** null = a pessoa não tem acesso àquele assunto (a linha não aparece). */
  enviosPendentes: { nome: string; horario: string }[] | null;
  alertasCriticos: number | null;
  alertasAntigosAbertos: number | null;
  tarefasVencidas: number | null;
  reunioesHoje: number | null;
  leadsAtrasados: number | null;
  contasSaldoCritico: number | null;
  contasComErroDeSync: number | null;
}

export interface HojeItem {
  id: string;
  tone: HojeTone;
  count: number;
  title: string;
  detail: string | null;
  to: string;
  cta: string;
}

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/** Ordem = prioridade: o que perde prazo ou dinheiro vem primeiro. */
export function buildHojeItems(i: HojeInputs): HojeItem[] {
  const out: HojeItem[] = [];
  const envios = i.enviosPendentes ?? [];
  if (envios.length) {
    const first = envios[0];
    out.push({
      id: "envio", tone: "danger", count: envios.length,
      title: envios.length === 1 ? `Aprovar o envio de hoje até ${first.horario}` : `Aprovar ${envios.length} envios de hoje`,
      detail: envios.length === 1 ? first.nome : envios.map((e) => `${e.nome} (${e.horario})`).join(" · "),
      to: "/envios", cta: "Revisar e aprovar",
    });
  }
  if (i.contasSaldoCritico) {
    out.push({
      id: "saldo", tone: "danger", count: i.contasSaldoCritico,
      title: `${i.contasSaldoCritico} ${plural(i.contasSaldoCritico, "conta com saldo crítico", "contas com saldo crítico")}`,
      detail: "Sem saldo ou perto de acabar. Cada moeda é tratada separada.", to: "/contas", cta: "Ver contas",
    });
  }
  if (i.alertasCriticos) {
    out.push({
      id: "monitor", tone: "danger", count: i.alertasCriticos,
      title: `${i.alertasCriticos} ${plural(i.alertasCriticos, "alerta crítico de desempenho", "alertas críticos de desempenho")}`,
      detail: null, to: "/monitoramento?aba=alertas", cta: "Tratar alertas",
    });
  }
  if (i.contasComErroDeSync) {
    out.push({
      id: "sync", tone: "warning", count: i.contasComErroDeSync,
      title: `${i.contasComErroDeSync} ${plural(i.contasComErroDeSync, "conta com erro de sincronização", "contas com erro de sincronização")}`,
      detail: "Os números dessas contas podem estar desatualizados.", to: "/sincronizacao", cta: "Ver sincronização",
    });
  }
  if (i.tarefasVencidas) {
    out.push({
      id: "tarefas", tone: "warning", count: i.tarefasVencidas,
      title: `${i.tarefasVencidas} ${plural(i.tarefasVencidas, "tarefa sua vencida", "tarefas suas vencidas")}`,
      detail: null, to: "/operacoes/minhas-tarefas", cta: "Abrir minhas tarefas",
    });
  }
  if (i.reunioesHoje) {
    out.push({
      id: "reunioes", tone: "info", count: i.reunioesHoje,
      title: `${i.reunioesHoje} ${plural(i.reunioesHoje, "reunião hoje", "reuniões hoje")}`,
      detail: null, to: "/operacoes/reunioes", cta: "Ver reuniões",
    });
  }
  if (i.leadsAtrasados) {
    out.push({
      id: "leads", tone: "info", count: i.leadsAtrasados,
      title: `${i.leadsAtrasados} ${plural(i.leadsAtrasados, "lead com retorno atrasado", "leads com retorno atrasado")}`,
      detail: null, to: "/comercial", cta: "Ver comercial",
    });
  }
  if (i.alertasAntigosAbertos) {
    out.push({
      id: "alertas", tone: "info", count: i.alertasAntigosAbertos,
      title: `${i.alertasAntigosAbertos} ${plural(i.alertasAntigosAbertos, "alerta novo para ver", "alertas novos para ver")}`,
      detail: "Saldo, cobrança, conexão e sincronização.", to: "/alertas", cta: "Ver alertas",
    });
  }
  return out;
}

/** Quantos assuntos a pessoa pode ver (para dizer "tudo em dia" só quando de fato olhamos alguma coisa). */
export function hojeWatching(i: HojeInputs): number {
  return Object.values(i).filter((v) => v !== null).length;
}

/** Saudação pelo horário de Brasília. */
export function saudacao(now = new Date()): string {
  const h = Number(new Intl.DateTimeFormat("pt-BR", { hour: "numeric", hour12: false, timeZone: "America/Sao_Paulo" }).format(now)) % 24;
  return h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
}
