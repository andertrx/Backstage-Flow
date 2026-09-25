/**
 * Edge Function: admin-users
 *
 * Gestão de usuários — SOMENTE para administradores ativos.
 *
 * Ações (POST com JSON):
 *   { "action": "create", "email", "fullName", "role", "password" }
 *   { "action": "update", "userId", "fullName"?, "role"?, "active"? }
 *   { "action": "set_password", "userId", "password" }
 *
 * Toda ação bem-sucedida é registrada em public.audit_logs.
 */
import { z } from "npm:zod@4";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { ROLES } from "../../../packages/shared/src/constants/roles.ts";
import { adminClient, type Caller, requireAdmin } from "../_shared/auth.ts";
import { recordError } from "../_shared/errorlog.ts";
import { AppError, handle, json } from "../_shared/http.ts";

// "Banido" por ~100 anos = não consegue mais fazer login. "none" remove o bloqueio.
const BLOCKED = "876000h";
const UNBLOCKED = "none";

const password = z
  .string()
  .min(8, "A senha precisa ter pelo menos 8 caracteres.")
  .max(72, "A senha pode ter no máximo 72 caracteres.");
const fullName = z.string().trim().min(2, "Informe o nome.").max(120, "Nome muito longo.");

const schema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("create"),
    email: z.email("E-mail inválido.").trim().toLowerCase(),
    fullName,
    role: z.enum(ROLES),
    password,
  }),
  z.object({
    action: z.literal("update"),
    userId: z.guid("Identificador inválido."),
    fullName: fullName.optional(),
    role: z.enum(ROLES).optional(),
    active: z.boolean().optional(),
  }),
  z.object({
    action: z.literal("set_password"),
    userId: z.guid("Identificador inválido."),
    password,
  }),
]);

type Input = z.infer<typeof schema>;

async function audit(
  admin: SupabaseClient,
  caller: Caller,
  action: string,
  targetId: string,
  details: Record<string, unknown>,
) {
  const { error } = await admin.from("audit_logs").insert({
    actor_id: caller.id,
    action,
    target_type: "user",
    target_id: targetId,
    details,
  });
  // Falha de auditoria não desfaz a ação, mas fica no log técnico.
  if (error) await recordError({ source: "servidor", code: "AUDIT_FAILED", technical: error, context: { funcao: "admin-users", acao: action }, userId: caller.id });
}

async function createUser(admin: SupabaseClient, caller: Caller, input: Extract<Input, { action: "create" }>) {
  const { data, error } = await admin.auth.admin.createUser({
    email: input.email,
    password: input.password,
    email_confirm: true,
    user_metadata: { full_name: input.fullName },
  });
  if (error || !data.user) {
    const alreadyExists = error?.message?.toLowerCase().includes("already");
    throw alreadyExists
      ? new AppError(409, "EMAIL_IN_USE", "Já existe um usuário com este e-mail.", error)
      : new AppError(500, "CREATE_FAILED", "Não conseguimos criar o usuário.", error);
  }

  // O gatilho do banco criou o perfil inativo; agora o admin define papel e ativa.
  const { error: profileError } = await admin
    .from("profiles")
    .update({ full_name: input.fullName, role: input.role, active: true, created_by: caller.id })
    .eq("id", data.user.id);
  if (profileError) throw new AppError(500, "PROFILE_FAILED", "Usuário criado, mas o perfil não foi configurado.", profileError);

  await audit(admin, caller, "user.create", data.user.id, { email: input.email, role: input.role });
  return { id: data.user.id };
}

async function countActiveAdmins(admin: SupabaseClient): Promise<number> {
  const { count, error } = await admin
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("role", "admin")
    .eq("active", true);
  if (error) throw new AppError(500, "DB_ERROR", "Não conseguimos verificar os administradores.", error);
  return count ?? 0;
}

async function updateUser(admin: SupabaseClient, caller: Caller, input: Extract<Input, { action: "update" }>) {
  const { data: before, error } = await admin
    .from("profiles")
    .select("id, full_name, role, active")
    .eq("id", input.userId)
    .maybeSingle();
  if (error) throw new AppError(500, "DB_ERROR", "Não conseguimos carregar o usuário.", error);
  if (!before) throw new AppError(404, "NOT_FOUND", "Usuário não encontrado.");

  const losesAdmin =
    before.role === "admin" && before.active &&
    ((input.role !== undefined && input.role !== "admin") || input.active === false);

  if (losesAdmin && input.userId === caller.id) {
    throw new AppError(400, "SELF_LOCKOUT", "Você não pode remover o seu próprio acesso de administrador.");
  }
  if (losesAdmin && (await countActiveAdmins(admin)) <= 1) {
    throw new AppError(400, "LAST_ADMIN", "O sistema precisa ter pelo menos um administrador ativo.");
  }

  const changes: Record<string, unknown> = {};
  if (input.fullName !== undefined) changes.full_name = input.fullName;
  if (input.role !== undefined) changes.role = input.role;
  if (input.active !== undefined) changes.active = input.active;
  if (Object.keys(changes).length === 0) return { id: input.userId };

  // Bloqueia/desbloqueia o LOGIN junto com o perfil.
  if (input.active !== undefined && input.active !== before.active) {
    const { error: banError } = await admin.auth.admin.updateUserById(input.userId, {
      ban_duration: input.active ? UNBLOCKED : BLOCKED,
    });
    if (banError) throw new AppError(500, "BAN_FAILED", "Não conseguimos alterar o acesso deste usuário.", banError);
  }

  const { error: updateError } = await admin.from("profiles").update(changes).eq("id", input.userId);
  if (updateError) throw new AppError(500, "UPDATE_FAILED", "Não conseguimos salvar as alterações.", updateError);

  await audit(admin, caller, "user.update", input.userId, {
    before: { full_name: before.full_name, role: before.role, active: before.active },
    after: changes,
  });
  return { id: input.userId };
}

async function setPassword(admin: SupabaseClient, caller: Caller, input: Extract<Input, { action: "set_password" }>) {
  const { error } = await admin.auth.admin.updateUserById(input.userId, { password: input.password });
  if (error) throw new AppError(500, "PASSWORD_FAILED", "Não conseguimos definir a nova senha.", error);
  // Nunca registrar a senha — só o fato de que foi trocada.
  await audit(admin, caller, "user.set_password", input.userId, {});
  return { id: input.userId };
}

Deno.serve(
  handle(async (req) => {
    const admin = adminClient();
    const caller = await requireAdmin(req, admin);

    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      const message = parsed.error.issues[0]?.message ?? "Dados inválidos.";
      throw new AppError(400, "INVALID_INPUT", message, parsed.error.message);
    }

    const input = parsed.data;
    const result = input.action === "create"
      ? await createUser(admin, caller, input)
      : input.action === "update"
      ? await updateUser(admin, caller, input)
      : await setPassword(admin, caller, input);

    return json(req, 200, { data: result });
  }, "admin-users"),
);
