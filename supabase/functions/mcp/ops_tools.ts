import { z } from "npm:zod@4";
import type { Role } from "../../../packages/shared/src/constants/roles.ts";
import { date, type ToolContext, ToolError, type ToolSpec, uuid } from "./tools.ts";

/**
 * Etapa 40.2 — ferramentas da Central de Operações no MCP: tarefas (ler, criar, editar, status, pessoas, comentar,
 * arquivar) e configurações da Central (setores, status, colunas das filas, tipos de atividade).
 * Usam as MESMAS ações do site, com o login da pessoa: o banco confere a permissão e grava o histórico de sempre.
 * Nada é apagado (arquivar/desativar). Configurações: só o administrador (o banco também exige).
 */

export const SITE = "https://www.backstageflow.com.br";
const CATEGORIES = ["aberto", "andamento", "aguardando_cliente", "aguardando_interno", "bloqueado", "revisao", "concluido", "cancelado"] as const;
const PRIORITIES = ["baixa", "media", "alta", "urgente"] as const;
const color = z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Cor no formato #RRGGBB.");
const statusId = z.string().trim().min(1).max(60);
const tags = z.array(z.string().trim().min(1).max(40)).max(10);

const has = (perm: string) => (_r: Role, ops: readonly string[]) => ops.includes(perm);
const adminOnly = (r: Role) => r === "admin";
const taskLink = (id: string) => `${SITE}/operacoes/tarefas?tarefa=${id}`;

interface TaskFull {
  task: Record<string, unknown> & { id: string; version: number; archived_at: string | null };
  people: { user_id: string; role: string; name: string }[];
  tags: string[];
  comments?: { author: string; body: string; created_at: string }[];
  depends_on?: { number: number; title: string; status_name: string; done: boolean }[];
}

async function loadTask(ctx: ToolContext, id: string): Promise<TaskFull> {
  const t = (await ctx.data.opsRpc("ops_task_get", { p_id: id })) as TaskFull | null;
  if (!t?.task) throw new ToolError("NOT_FOUND", "Tarefa não encontrada ou não liberada para você.");
  return t;
}

/** A versão que a IA viu precisa ser a atual (senão alguém mexeu na tarefa no meio do caminho). */
function versionFor(t: TaskFull, seen: unknown): number {
  if (typeof seen === "number" && seen !== t.task.version) {
    throw new ToolError("CONFLICT", "Alguém alterou esta tarefa depois que você a leu. Abra de novo (backstage_get_task) e repita.");
  }
  return t.task.version;
}

const peopleOut = (people: TaskFull["people"]) => people.map((p) => ({ user_id: p.user_id, nome: p.name, papel: p.role }));

function taskOut(t: TaskFull) {
  const k = t.task;
  return {
    id: k.id, numero: k.number, titulo: k.title, descricao: k.description ?? null, cliente: k.client_name ?? null, cliente_id: k.client_id ?? null,
    setor_id: k.sector_id, status_id: k.status_id, status: k.status_name, grupo: k.category, prioridade: k.priority, inicio: k.start_date ?? null,
    prazo: k.due_date ?? null, horas_estimadas: k.effort_hours ?? null, visibilidade: k.visibility, versao: k.version, criada_em: k.created_at,
    atualizada_em: k.updated_at, concluida_em: k.completed_at ?? null, arquivada_em: k.archived_at ?? null, link: taskLink(k.id),
    pessoas: peopleOut(t.people ?? []),
    etiquetas: t.tags ?? [],
    depende_de: (t.depends_on ?? []).map((d) => ({ numero: d.number, titulo: d.title, status: d.status_name, concluida: d.done })),
    comentarios: (t.comments ?? []).slice(-20).map((c) => ({ autor: c.author, texto: c.body, em: c.created_at })),
  };
}

const ops = (perm: string) => has(perm);

export const OPS_TOOLS: ToolSpec[] = [
  {
    name: "backstage_central_reference",
    title: "Central: setores, status, pessoas e clientes",
    description: "Lista o que a Central de Operações usa para criar e mexer em tarefas: setores, status (com o grupo), colunas das filas, tipos de atividade, pessoas da equipe, clientes e as suas permissões na Central. Use para descobrir os IDs antes de criar ou editar.",
    input: {},
    allowed: ops("ops.access"),
    async run(ctx) {
      const [ref, dir] = await Promise.all([ctx.data.opsReference(), ctx.data.opsRpc("ops_directory", {}) as Promise<{ people?: unknown[]; clients?: unknown[] } | null>]);
      return {
        setores: ref.sectors.map((s) => ({ id: s.id, nome: s.name, cor: s.color, situacao: s.status })),
        status: ref.statuses.map((s) => ({ id: s.id, nome: s.name, grupo: s.category, ativo: s.active, cor: s.color })),
        colunas_das_filas: ref.columns.map((c) => ({ id: c.id, setor_id: c.sector_id, nome: c.name, status_id: c.status_id, ativa: c.active, cor: c.color })),
        tipos_de_atividade: ref.activityTypes.map((a) => ({ id: a.id, nome: a.name, ativo: a.active })),
        pessoas: (dir?.people ?? []).map((p) => {
          const x = p as { user_id: string; name: string; sector_id: string | null };
          return { user_id: x.user_id, nome: x.name, setor_principal_id: x.sector_id };
        }),
        clientes: (dir?.clients ?? []).map((c) => {
          const x = c as { id: string; name: string; status: string };
          return { id: x.id, nome: x.name, situacao: x.status };
        }),
        suas_permissoes_na_central: ctx.ops,
      };
    },
  },
  {
    name: "backstage_list_tasks",
    title: "Listar tarefas da Central",
    description: "Lista tarefas da Central de Operações que você pode ver, com filtros (busca, cliente, setor, status, grupo, prioridade, pessoa, só as suas, prazo, arquivadas). Ordem: prazo mais próximo primeiro.",
    input: {
      busca: z.string().trim().min(1).max(80).optional().describe("Texto no título/descrição, nome do cliente ou número (#12)."),
      cliente_id: uuid.optional(),
      setor_id: uuid.optional(),
      status_ids: z.array(statusId).max(10).optional(),
      grupos: z.array(z.enum(CATEGORIES)).max(8).optional().describe("Grupos de status, ex.: [\"aberto\",\"andamento\"]."),
      prioridades: z.array(z.enum(PRIORITIES)).max(4).optional(),
      pessoa_id: uuid.optional().describe("Tarefas em que esta pessoa participa."),
      minhas: z.boolean().optional().describe("Só as tarefas em que você participa."),
      prazo: z.enum(["atrasadas", "hoje", "semana", "sem_prazo"]).optional(),
      arquivadas: z.boolean().optional().describe("true = só as arquivadas."),
      limite: z.number().int().min(1).max(100).default(30),
      pagina: z.number().int().min(1).max(100).default(1),
    },
    allowed: ops("ops.access"),
    async run(ctx, a) {
      const limit = (a.limite as number) ?? 30;
      const page = (a.pagina as number) ?? 1;
      const f: Record<string, unknown> = {
        q: a.busca ?? null, client_id: a.cliente_id ?? null, sector_id: a.setor_id ?? null, status_ids: a.status_ids ?? [],
        categories: a.grupos ?? [], priorities: a.prioridades ?? [], person_id: a.pessoa_id ?? null, mine: a.minhas ?? false,
        due: a.prazo ?? null, archived: a.arquivadas ?? false,
      };
      const rows = ((await ctx.data.opsRpc("ops_task_list", { f, p_limit: limit + 1, p_offset: (page - 1) * limit })) ?? []) as Record<string, unknown>[];
      return {
        pagina: page,
        tem_mais: rows.length > limit,
        tarefas: rows.slice(0, limit).map((t) => ({
          id: t.id, numero: t.number, titulo: t.title, cliente: t.client_name ?? null, setor_id: t.sector_id, status_id: t.status_id,
          status: t.status_name, grupo: t.category, prioridade: t.priority, inicio: t.start_date ?? null, prazo: t.due_date ?? null,
          atrasada: t.overdue === true, versao: t.version, etiquetas: t.tags ?? [], comentarios: t.comments ?? 0,
          pessoas: ((t.people ?? []) as TaskFull["people"]).map((p) => ({ nome: p.name, papel: p.role, user_id: p.user_id })),
        })),
      };
    },
  },
  {
    name: "backstage_get_task",
    title: "Abrir uma tarefa",
    description: "Mostra uma tarefa da Central por inteiro: descrição, status, prazo, pessoas, etiquetas, dependências, últimos comentários e a versão (use a versão ao editar).",
    input: { tarefa_id: uuid },
    allowed: ops("ops.access"),
    async run(ctx, a) {
      return taskOut(await loadTask(ctx, a.tarefa_id as string));
    },
  },
  {
    name: "backstage_create_task",
    title: "Criar tarefa",
    description: "Cria uma tarefa na Central de Operações (mesmas regras do site). Obrigatórios: título e setor. Use backstage_central_reference para achar setor, pessoas, clientes e status.",
    input: {
      titulo: z.string().trim().min(3).max(200),
      setor_id: uuid,
      cliente_id: uuid.optional(),
      descricao: z.string().max(10000).optional(),
      prioridade: z.enum(PRIORITIES).default("media"),
      inicio: date.optional(),
      prazo: date.optional(),
      horas_estimadas: z.number().min(0).max(10000).optional(),
      visibilidade: z.enum(["setor", "participantes", "equipe"]).default("setor").describe("setor = o setor vê; participantes = só as pessoas da tarefa; equipe = toda a equipe."),
      etiquetas: tags.optional(),
      status_id: statusId.optional().describe("Padrão: o primeiro status em aberto."),
      responsavel_id: uuid.optional().describe("Responsável principal (user_id)."),
      adicionais_ids: z.array(uuid).max(10).optional(),
    },
    allowed: ops("ops.tasks.create"),
    write: true,
    async run(ctx, a) {
      const p = {
        title: a.titulo, sector_id: a.setor_id, client_id: a.cliente_id ?? null, description: a.descricao ?? null, priority: a.prioridade ?? "media",
        start_date: a.inicio ?? null, due_date: a.prazo ?? null, effort_hours: a.horas_estimadas ?? null, visibility: a.visibilidade ?? "setor",
        tags: a.etiquetas ?? [], status_id: a.status_id ?? null,
        people: { principal: a.responsavel_id ?? null, adicionais: a.adicionais_ids ?? [], aprovadores: [], observadores: [] },
      };
      const id = (await ctx.data.opsRpc("ops_task_save", { p_id: null, p_version: null, p })) as string;
      const t = await loadTask(ctx, id);
      return { criada: true, tarefa: taskOut(t) };
    },
  },
  {
    name: "backstage_update_task",
    title: "Editar tarefa",
    description: "Edita os dados de uma tarefa (título, setor, cliente, descrição, prioridade, datas, horas, visibilidade, etiquetas). Só os campos enviados mudam. Para status use backstage_set_task_status; para pessoas, backstage_set_task_people. Envie a versão que você leu para não sobrescrever mudança de outra pessoa.",
    input: {
      tarefa_id: uuid,
      versao: z.number().int().min(1).optional().describe("Versão lida em backstage_get_task."),
      titulo: z.string().trim().min(3).max(200).optional(),
      setor_id: uuid.optional(),
      cliente_id: uuid.nullable().optional().describe("null = tirar o cliente."),
      descricao: z.string().max(10000).nullable().optional(),
      prioridade: z.enum(PRIORITIES).optional(),
      inicio: date.nullable().optional(),
      prazo: date.nullable().optional(),
      horas_estimadas: z.number().min(0).max(10000).nullable().optional(),
      visibilidade: z.enum(["setor", "participantes", "equipe"]).optional(),
      etiquetas: tags.optional().describe("Substitui todas as etiquetas."),
    },
    allowed: ops("ops.tasks.edit"),
    write: true,
    async run(ctx, a) {
      const fields = ["titulo", "setor_id", "cliente_id", "descricao", "prioridade", "inicio", "prazo", "horas_estimadas", "visibilidade", "etiquetas"];
      if (!fields.some((f) => f in a && a[f] !== undefined)) throw new ToolError("INVALID_INPUT", "Diga o que mudar (pelo menos um campo).");
      const t = await loadTask(ctx, a.tarefa_id as string);
      const version = versionFor(t, a.versao);
      const k = t.task;
      const pick = (field: string, current: unknown) => (field in a && a[field] !== undefined ? a[field] : current);
      const clientId = pick("cliente_id", k.client_id ?? null);
      const p = {
        title: pick("titulo", k.title), sector_id: pick("setor_id", k.sector_id), client_id: clientId, description: pick("descricao", k.description ?? null),
        priority: pick("prioridade", k.priority), start_date: pick("inicio", k.start_date ?? null), due_date: pick("prazo", k.due_date ?? null),
        effort_hours: pick("horas_estimadas", k.effort_hours ?? null), visibility: pick("visibilidade", k.visibility), tags: pick("etiquetas", t.tags ?? []),
        client_stage_id: clientId ? k.client_stage_id ?? null : null, mandatory: clientId ? k.mandatory ?? false : false,
      };
      await ctx.data.opsRpc("ops_task_save", { p_id: k.id, p_version: version, p });
      return { editada: true, tarefa: taskOut(await loadTask(ctx, k.id)) };
    },
  },
  {
    name: "backstage_set_task_status",
    title: "Mudar status da tarefa",
    description: "Muda o status de uma tarefa (ex.: em andamento, finalizado). Respeita as regras do quadro (dependências, permissões). Veja os status em backstage_central_reference.",
    input: { tarefa_id: uuid, status_id: statusId, versao: z.number().int().min(1).optional() },
    allowed: (_r, o) => o.includes("ops.cards.move") || o.includes("ops.tasks.edit"),
    write: true,
    async run(ctx, a) {
      const t = await loadTask(ctx, a.tarefa_id as string);
      await ctx.data.opsRpc("ops_task_set_status", { p_id: t.task.id, p_version: versionFor(t, a.versao), p_status: a.status_id });
      return { status_alterado: true, tarefa: taskOut(await loadTask(ctx, t.task.id)) };
    },
  },
  {
    name: "backstage_set_task_people",
    title: "Definir pessoas da tarefa",
    description: "Define o responsável principal e os adicionais de uma tarefa (aprovadores e observadores continuam como estão). Use os user_id de backstage_central_reference.",
    input: {
      tarefa_id: uuid,
      responsavel_id: uuid.nullable().describe("null = sem responsável."),
      adicionais_ids: z.array(uuid).max(10).default([]),
      versao: z.number().int().min(1).optional(),
    },
    allowed: ops("ops.tasks.assign"),
    write: true,
    async run(ctx, a) {
      const t = await loadTask(ctx, a.tarefa_id as string);
      const keep = (role: string) => (t.people ?? []).filter((p) => p.role === role).map((p) => p.user_id);
      const people = { principal: a.responsavel_id ?? null, adicionais: a.adicionais_ids ?? [], aprovadores: keep("aprovador"), observadores: keep("observador") };
      await ctx.data.opsRpc("ops_task_set_people", { p_id: t.task.id, p_version: versionFor(t, a.versao), p_people: people });
      return { pessoas_definidas: true, tarefa: taskOut(await loadTask(ctx, t.task.id)) };
    },
  },
  {
    name: "backstage_comment_task",
    title: "Comentar na tarefa",
    description: "Adiciona um comentário numa tarefa (com menções opcionais, que avisam as pessoas no sino da Central).",
    input: {
      tarefa_id: uuid,
      texto: z.string().trim().min(1).max(5000),
      mencoes_ids: z.array(uuid).max(10).optional().describe("user_id das pessoas mencionadas."),
    },
    allowed: ops("ops.access"),
    write: true,
    async run(ctx, a) {
      const t = await loadTask(ctx, a.tarefa_id as string);
      const id = await ctx.data.opsRpc("ops_comment_add", { p_task: t.task.id, p_body: a.texto, p_mentions: a.mencoes_ids ?? [] });
      return { comentado: true, comentario_id: id, link: taskLink(t.task.id) };
    },
  },
  {
    name: "backstage_archive_task",
    title: "Arquivar ou desarquivar tarefa",
    description: "Arquiva uma tarefa (sai das listas, nada é apagado) ou desarquiva (arquivar = false).",
    input: { tarefa_id: uuid, arquivar: z.boolean().default(true) },
    allowed: ops("ops.tasks.archive"),
    write: true,
    destructive: true,
    async run(ctx, a) {
      const t = await loadTask(ctx, a.tarefa_id as string);
      const archive = (a.arquivar as boolean) ?? true;
      await ctx.data.opsRpc("ops_task_archive", { p_id: t.task.id, p_archived: archive });
      return { arquivada: archive, tarefa_id: t.task.id, numero: t.task.number, link: taskLink(t.task.id) };
    },
  },

  // ---------------- Configurações da Central (só administrador; o banco também exige)
  {
    name: "backstage_save_sector",
    title: "Criar ou renomear setor",
    description: "Cria um setor da Central (sem setor_id) ou muda nome e cor de um existente. Só administrador.",
    input: { setor_id: uuid.optional(), nome: z.string().trim().min(2).max(60), cor: color },
    allowed: adminOnly,
    write: true,
    async run(ctx, a) {
      const id = await ctx.data.opsRpc("ops_sector_save", { p_id: a.setor_id ?? null, p_name: a.nome, p_color: a.cor });
      return { salvo: true, setor_id: id, nome: a.nome };
    },
  },
  {
    name: "backstage_set_sector_status",
    title: "Ativar, desativar ou arquivar setor",
    description: "Muda a situação de um setor (ativo, inativo, arquivado). Se o setor tiver pessoas, diga para qual setor ativo elas vão. Só administrador. Nada é apagado.",
    input: { setor_id: uuid, situacao: z.enum(["ativo", "inativo", "arquivado"]), mover_pessoas_para_setor_id: uuid.optional() },
    allowed: adminOnly,
    write: true,
    destructive: true,
    async run(ctx, a) {
      await ctx.data.opsRpc("ops_sector_set_status", { p_id: a.setor_id, p_status: a.situacao, p_move_to: a.mover_pessoas_para_setor_id ?? null });
      return { salvo: true, setor_id: a.setor_id, situacao: a.situacao };
    },
  },
  {
    name: "backstage_save_status",
    title: "Criar ou editar status de tarefa",
    description: "Cria um status de tarefa (sem status_id) ou muda nome, cor e grupo. O grupo de um status já usado não muda (crie outro). Só administrador.",
    input: { status_id: statusId.optional(), nome: z.string().trim().min(2).max(40), cor: color, grupo: z.enum(CATEGORIES) },
    allowed: adminOnly,
    write: true,
    async run(ctx, a) {
      const id = await ctx.data.opsRpc("ops_status_save", { p_id: a.status_id ?? null, p_name: a.nome, p_color: a.cor, p_category: a.grupo });
      return { salvo: true, status_id: id, nome: a.nome, grupo: a.grupo };
    },
  },
  {
    name: "backstage_set_status_active",
    title: "Ativar ou desativar status de tarefa",
    description: "Ativa ou desativa um status. Se houver tarefas nele, diga para qual status ativo elas vão (ficam no histórico). Só administrador.",
    input: { status_id: statusId, ativo: z.boolean(), mover_tarefas_para_status_id: statusId.optional() },
    allowed: adminOnly,
    write: true,
    destructive: true,
    async run(ctx, a) {
      await ctx.data.opsRpc("ops_status_set_active", { p_id: a.status_id, p_active: a.ativo, p_move_to: a.mover_tarefas_para_status_id ?? null });
      return { salvo: true, status_id: a.status_id, ativo: a.ativo };
    },
  },
  {
    name: "backstage_save_queue_column",
    title: "Criar ou editar coluna da fila",
    description: "Cria uma coluna na fila de um setor (sem coluna_id) ou edita nome, cor e o status ligado à coluna. Só administrador.",
    input: { coluna_id: uuid.optional(), setor_id: uuid, nome: z.string().trim().min(2).max(40), cor: color, status_id: statusId },
    allowed: adminOnly,
    write: true,
    async run(ctx, a) {
      const id = await ctx.data.opsRpc("ops_queue_column_save", { p_id: a.coluna_id ?? null, p_sector: a.setor_id, p_name: a.nome, p_color: a.cor, p_status: a.status_id });
      return { salvo: true, coluna_id: id, nome: a.nome };
    },
  },
  {
    name: "backstage_set_queue_column_active",
    title: "Ativar ou desativar coluna da fila",
    description: "Ativa ou desativa uma coluna da fila de um setor (nada é apagado). Só administrador.",
    input: { coluna_id: uuid, ativo: z.boolean() },
    allowed: adminOnly,
    write: true,
    destructive: true,
    async run(ctx, a) {
      await ctx.data.opsRpc("ops_queue_column_set_active", { p_id: a.coluna_id, p_active: a.ativo });
      return { salvo: true, coluna_id: a.coluna_id, ativa: a.ativo };
    },
  },
  {
    name: "backstage_save_activity_type",
    title: "Criar ou editar tipo de atividade",
    description: "Cria um tipo de atividade (sem tipo_id) ou muda o nome e se está ativo. Só administrador.",
    input: { tipo_id: z.string().trim().min(1).max(60).optional(), nome: z.string().trim().min(2).max(60), ativo: z.boolean().optional() },
    allowed: adminOnly,
    write: true,
    async run(ctx, a) {
      const id = await ctx.data.opsRpc("ops_activity_type_save", { p_id: a.tipo_id ?? null, p_name: a.nome, p_active: a.ativo ?? null });
      return { salvo: true, tipo_id: id, nome: a.nome };
    },
  },
];
