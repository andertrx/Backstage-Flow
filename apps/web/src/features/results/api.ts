import type { RiMapping, RiProfile } from "@backstage/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FriendlyError, friendlyDbError, friendlyFunctionError } from "@/lib/errors.ts";
import { supabase } from "@/lib/supabase.ts";

// ---------------------------------------------------------------------------
// Etapa 39.1 — Inteligência de Resultados: conexão com o Google Sheets.
// A chave do Google vai direto para o cofre; a leitura da planilha é feita no
// servidor (Edge Function "sheets"), nunca no navegador.
// ---------------------------------------------------------------------------

export interface SheetsSettings {
  service_account_email: string | null;
  has_key: boolean;
  key_updated_at: string | null;
  last_test_at: string | null;
  last_test_ok: boolean | null;
  last_test_error: string | null;
}

export interface RiSource {
  id: string;
  client_id: string;
  spreadsheet_id: string;
  spreadsheet_title: string | null;
  sheet_name: string;
  header_row: number;
  mapping: RiMapping;
  profile_rules: Record<string, RiProfile>;
  enabled: boolean;
  updated_at: string;
}

export interface SheetTab { title: string; rowCount: number; columnCount: number }
export interface ColumnValue { value: string; example: string; count: number }

type SheetsAction =
  | { action: "test_settings" }
  | { action: "inspect"; clientId: string; url: string }
  | { action: "preview"; clientId: string; spreadsheetId: string; sheet: string; headerRow: number }
  | { action: "column_values"; clientId: string; spreadsheetId: string; sheet: string; headerRow: number; column: string };

export async function callSheets<T>(body: SheetsAction): Promise<T> {
  const { data, error } = await supabase.functions.invoke("sheets", { body });
  if (error) throw new FriendlyError(await friendlyFunctionError(error));
  return (data as { data: T }).data;
}

/** Nossas funções do banco explicam o problema (código 22023/23505) em português. */
const ownDbError = (error: { code?: string; message?: string }, fallback: string) =>
  (error.code === "22023" || error.code === "23505") && error.message ? error.message : friendlyDbError(error, fallback);

const SETTINGS_KEY = ["sheets-settings"];
const SOURCES_KEY = (clientId: string | null) => ["ri-sources", clientId];

export function useSheetsSettings() {
  return useQuery({
    queryKey: SETTINGS_KEY,
    queryFn: async () => {
      const { data, error } = await supabase.from("sheets_settings")
        .select("service_account_email, has_key, key_updated_at, last_test_at, last_test_ok, last_test_error").maybeSingle();
      if (error) throw new FriendlyError(friendlyDbError(error, "Não conseguimos ler a configuração do Google Sheets."));
      return data as SheetsSettings | null;
    },
  });
}

export function useSaveSheetsKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (key: string) => {
      const { data, error } = await supabase.rpc("sheets_settings_save", { p_key: key });
      if (error) throw new FriendlyError(ownDbError(error, "Não conseguimos guardar a chave."));
      return data as string;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: SETTINGS_KEY }),
  });
}

export function useRemoveSheetsKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("sheets_settings_remove_key");
      if (error) throw new FriendlyError(ownDbError(error, "Não conseguimos remover a chave."));
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: SETTINGS_KEY }),
  });
}

export function useTestSheets() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => callSheets<{ ok: boolean; serviceAccountEmail: string }>({ action: "test_settings" }),
    onSettled: () => qc.invalidateQueries({ queryKey: SETTINGS_KEY }),
  });
}

/** Planilhas conectadas a um cliente (o RLS decide se a pessoa vê). */
export function useRiSources(clientId: string | null) {
  return useQuery({
    queryKey: SOURCES_KEY(clientId),
    enabled: Boolean(clientId),
    queryFn: async () => {
      const { data, error } = await supabase.from("ri_sources")
        .select("id, client_id, spreadsheet_id, spreadsheet_title, sheet_name, header_row, mapping, profile_rules, enabled, updated_at")
        .eq("client_id", clientId!).order("created_at");
      if (error) throw new FriendlyError(friendlyDbError(error, "Não conseguimos ler a planilha do cliente."));
      return (data ?? []) as RiSource[];
    },
  });
}

export interface SaveSourceInput {
  id: string | null;
  clientId: string;
  spreadsheetId: string;
  spreadsheetTitle: string | null;
  sheetName: string;
  headerRow: number;
  mapping: RiMapping;
  profileRules: Record<string, RiProfile>;
}

export function useSaveRiSource() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (s: SaveSourceInput) => {
      const { data, error } = await supabase.rpc("ri_source_save", {
        p_id: s.id, p_client_id: s.clientId, p_spreadsheet_id: s.spreadsheetId, p_spreadsheet_title: s.spreadsheetTitle,
        p_sheet_name: s.sheetName, p_header_row: s.headerRow, p_mapping: s.mapping, p_profile_rules: s.profileRules,
      });
      if (error) throw new FriendlyError(ownDbError(error, "Não conseguimos salvar a planilha."));
      return data as string;
    },
    onSuccess: (_d, s) => qc.invalidateQueries({ queryKey: SOURCES_KEY(s.clientId) }),
  });
}
