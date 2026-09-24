import type { Role } from "@backstage/shared";

/** Linha da tabela public.profiles. */
export interface Profile {
  id: string;
  email: string;
  full_name: string;
  role: Role;
  active: boolean;
  created_at: string;
  updated_at: string;
}
