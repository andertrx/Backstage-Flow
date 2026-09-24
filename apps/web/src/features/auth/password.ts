/** Regras mínimas de senha, iguais às da Edge Function admin-users. */
export function validateNewPassword(password: string, confirm?: string): string | null {
  if (password.length < 8) return "A senha precisa ter pelo menos 8 caracteres.";
  if (password.length > 72) return "A senha pode ter no máximo 72 caracteres.";
  if (!/[a-zA-Z]/.test(password) || !/\d/.test(password)) return "Use letras e números na senha.";
  if (confirm !== undefined && password !== confirm) return "As senhas não são iguais.";
  return null;
}
