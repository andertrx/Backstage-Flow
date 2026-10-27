import { z } from "npm:zod@4";
import type { Role } from "../../../packages/shared/src/constants/roles.ts";
import { SITE } from "./ops_tools.ts";
import { type ToolContext, ToolError, type ToolSpec, uuid } from "./tools.ts";

/**
 * Etapa 41.2 — Envios semanais no MCP. O CRM não envia: o agente (Claude no computador da pessoa, com o WhatsApp Web)
 * lê o que está LIBERADO (aprovado nesta semana, no horário), envia e registra o resultado de cada grupo.
 * A aprovação é só humana, na tela do CRM: não existe ferramenta para aprovar.
 */

const has = (perm: string) => (_r: Role, ops: readonly string[]) => ops.includes(perm);
const WEEKDAYS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
const link = () => `${SITE}/operacoes/envios`;

interface EnvioCliente {
  cliente_id: string;
  cliente_nome: string;
  nome_grupo: string;
  contatos_marcar: string[];
  ativo: boolean;
  observacao: string | null;
  ja_enviado_nesta_semana: boolean;
  ultima_execucao: { executado_em: string; status: string; detalhe: string | null } | null;
}
interface Envio {
  id: string;
  nome: string;
  mensagem: string;
  dia_semana: number;
  horario: string;
  ativo: boolean;
  versao: number;
  semana: string;
  situacao_hoje: string;
  pode_enviar_agora: boolean;
  aprovacao: { decisao: string; decidido_por_nome: string | null; decidido_em: string; valida: boolean } | null;
  clientes: EnvioCliente[];
}

const SITUACAO: Record<string, string> = {
  nao_hoje: "não é dia deste envio",
  antes_da_janela: "hoje, aguardando a janela de aprovação (a partir das 7h)",
  aguardando_aprovacao: "hoje, aguardando a aprovação no CRM — NÃO envie",
  aprovado: "aprovado nesta semana",
  recusado: "a pessoa decidiu não enviar esta semana — NÃO envie",
  nao_aprovado_a_tempo: "não foi aprovado até o horário — NÃO envie",
};

function envioOut(e: Envio, soPendentes: boolean) {
  const grupos = e.clientes.filter((c) => c.ativo && (!soPendentes || !c.ja_enviado_nesta_semana));
  return {
    envio_id: e.id,
    nome: e.nome,
    quando: `${WEEKDAYS[e.dia_semana]} às ${e.horario} (Brasília)`,
    versao: e.versao,
    situacao_hoje: SITUACAO[e.situacao_hoje] ?? e.situacao_hoje,
    pode_enviar_agora: e.pode_enviar_agora,
    aprovacao: e.aprovacao ? { decisao: e.aprovacao.decisao, por: e.aprovacao.decidido_por_nome, em: e.aprovacao.decidido_em, vale_para_esta_versao: e.aprovacao.valida } : null,
    mensagem: e.mensagem,
    grupos: grupos.map((c) => ({
      cliente_id: c.cliente_id, cliente: c.cliente_nome, nome_grupo: c.nome_grupo, marcar_na_ordem: c.contatos_marcar,
      ja_enviado_nesta_semana: c.ja_enviado_nesta_semana, ...(c.observacao ? { observacao: c.observacao } : {}),
      ...(c.ultima_execucao ? { ultima_execucao: c.ultima_execucao } : {}),
    })),
  };
}

const COMO_ENVIAR = [
  "Só envie os envios com pode_enviar_agora = true (aprovados no CRM nesta semana). Nunca envie os outros.",
  "Em cada grupo (procure pelo nome exato): 1) envie a mensagem exatamente como está, com as quebras de linha e emojis;",
  "2) logo depois, numa SEGUNDA mensagem, marque as pessoas de marcar_na_ordem, na ordem (digite @ e o nome e escolha a pessoa na lista).",
  "Depois de cada grupo, registre com backstage_registrar_execucao_envio: enviado, falhou (ex.: grupo não encontrado) ou pulado, com um detalhe curto.",
  "Pule os grupos com ja_enviado_nesta_semana = true.",
].join(" ");

async function loadEnvio(ctx: ToolContext, id: string): Promise<Envio> {
  const e = (await ctx.data.opsRpc("ops_envio_get", { p_id: id })) as Envio | null;
  if (!e) throw new ToolError("NOT_FOUND", "Envio não encontrado ou sem a permissão \"Envios semanais\".");
  return e;
}

export const ENVIO_TOOLS: ToolSpec[] = [
  {
    name: "backstage_list_envios",
    title: "Envios semanais (mensagens para grupos de WhatsApp)",
    description: "Lista os envios semanais ativos: mensagem, dia e horário, situação de hoje (aprovado ou não), e para cada grupo ativo o nome exato do grupo e quem marcar, na ordem. "
      + "Use liberados_agora = true para receber só o que está aprovado e no horário, e só os grupos que ainda não receberam nesta semana (econômico).",
    input: { liberados_agora: z.boolean().optional().describe("true = só o que pode ser enviado agora (aprovado nesta semana e no horário).") },
    allowed: has("ops.envios"),
    async run(ctx, a) {
      const liberados = a.liberados_agora === true;
      const r = (await ctx.data.opsRpc("ops_envio_list", { f: { so_ativos: true } })) as { hoje?: { data?: string; hora?: string }; envios?: Envio[] } | null;
      const envios = (r?.envios ?? []).filter((e) => !liberados || e.pode_enviar_agora);
      const out = envios.map((e) => envioOut(e, liberados)).filter((e) => !liberados || e.grupos.length > 0);
      return {
        agora_em_brasilia: r?.hoje ? `${r.hoje.data} ${r.hoje.hora}` : null,
        total: out.length,
        envios: out,
        ...(liberados && out.length === 0 ? { aviso: "Nada liberado para enviar agora. Não envie nada." } : {}),
        como_enviar: COMO_ENVIAR,
        tela: link(),
      };
    },
  },
  {
    name: "backstage_get_envio",
    title: "Abrir um envio semanal",
    description: "Mostra um envio semanal completo pelo ID: mensagem, dia, horário, aprovação desta semana e todos os grupos (inclusive os pausados), com quem marcar na ordem.",
    input: { envio_id: uuid },
    allowed: has("ops.envios"),
    async run(ctx, a) {
      const e = await loadEnvio(ctx, a.envio_id as string);
      const base = envioOut({ ...e, clientes: e.clientes.map((c) => ({ ...c, ativo: true })) }, false);
      return {
        ...base,
        ativo: e.ativo,
        grupos: base.grupos.map((g) => ({ ...g, ativo_neste_envio: e.clientes.find((c) => c.cliente_id === g.cliente_id)?.ativo ?? false })),
        como_enviar: COMO_ENVIAR,
      };
    },
  },
  {
    name: "backstage_registrar_execucao_envio",
    title: "Registrar o resultado do envio num grupo",
    description: "Registra no histórico do CRM o resultado do envio semanal num grupo: enviado, falhou ou pulado, com um detalhe curto. "
      + "\"enviado\" só é aceito se o envio foi aprovado no CRM nesta semana.",
    input: {
      envio_id: uuid,
      cliente_id: uuid,
      status: z.enum(["enviado", "falhou", "pulado"]),
      detalhe: z.string().trim().max(1000).optional().describe("Ex.: \"mensagem e marcação enviadas\", \"grupo não encontrado\"."),
      executado_em: z.string().datetime({ offset: true }).optional().describe("Quando (ISO). Padrão: agora."),
    },
    allowed: has("ops.envios"),
    write: true,
    async run(ctx, a) {
      const id = await ctx.data.opsRpc("ops_envio_execucao_add", {
        p_envio: a.envio_id, p_cliente: a.cliente_id, p_status: a.status, p_detalhe: a.detalhe ?? null, p_executado_em: a.executado_em ?? null,
      });
      return { registrado: true, execucao_id: id, status: a.status, historico: link() };
    },
  },
];
