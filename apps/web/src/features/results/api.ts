import type { DateRange, RiLevel, RiMapping, RiProfile, RiReadStats, RiResults } from "@backstage/shared";
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
  /** Etapa 39.2: situação da leitura da planilha. */
  read_status: "nunca" | "lendo" | "ok" | "erro";
  last_attempt_at: string | null;
  last_success_at: string | null;
  last_error: string | null;
  consecutive_failures: number;
}

/** Números da última leitura boa (sem as linhas; elas ficam no servidor). */
export interface RiReadInfo {
  read_at: string;
  trigger: "agendada" | "manual";
  row_count: number;
  stats: Partial<RiReadStats> & { missingColumns?: string[] };
}

export interface SheetTab { title: string; rowCount: number; columnCount: number }
export interface ColumnValue { value: string; example: string; count: number }

type SheetsAction =
  | { action: "test_settings" }
  | { action: "inspect"; clientId: string; url: string }
  | { action: "preview"; clientId: string; spreadsheetId: string; sheet: string; headerRow: number }
  | { action: "column_values"; clientId: string; spreadsheetId: string; sheet: string; headerRow: number; column: string }
  | { action: "read_now"; sourceId: string };

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
        .select("id, client_id, spreadsheet_id, spreadsheet_title, sheet_name, header_row, mapping, profile_rules, enabled, updated_at, read_status, last_attempt_at, last_success_at, last_error, consecutive_failures")
        .eq("client_id", clientId!).order("created_at");
      if (error) throw new FriendlyError(friendlyDbError(error, "Não conseguimos ler a planilha do cliente."));
      return (data ?? []) as RiSource[];
    },
    // Enquanto uma leitura está em andamento, confere de novo a cada 5 s (consulta leve, sem as linhas).
    refetchInterval: (q) => ((q.state.data as RiSource[] | undefined)?.some((s) => s.read_status === "lendo") ? 5000 : false),
  });
}

/** Números da última leitura boa de uma planilha. */
export function useRiReadInfo(sourceId: string | null, updatedAt: string | null) {
  return useQuery({
    queryKey: ["ri-read", sourceId, updatedAt],
    enabled: Boolean(sourceId),
    queryFn: async () => {
      const { data, error } = await supabase.from("ri_snapshots").select("read_at, trigger, row_count, stats").eq("source_id", sourceId!).maybeSingle();
      if (error) throw new FriendlyError(friendlyDbError(error, "Não conseguimos ler a última leitura da planilha."));
      return data as RiReadInfo | null;
    },
  });
}

export function useReadNow(clientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (sourceId: string) => callSheets<{ status: "ok"; rows: number }>({ action: "read_now", sourceId }),
    onSettled: () => qc.invalidateQueries({ queryKey: SOURCES_KEY(clientId) }),
  });
}

export function useSetSourceEnabled(clientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; enabled: boolean }) => {
      const { error } = await supabase.rpc("ri_source_set_enabled", { p_id: input.id, p_enabled: input.enabled });
      if (error) throw new FriendlyError(ownDbError(error, "Não conseguimos mudar a leitura automática."));
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: SOURCES_KEY(clientId) }),
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

// ---------------------------------------------------------------------------
// Etapa 39.4 — resultados (cards, ranking, contatos por dia e registros).
// Os números vêm prontos do banco (ri_results, ri_daily, ri_records).
// ---------------------------------------------------------------------------

export interface RiDailyRow { day: string; contacts: number; lojista: number; sacoleiro: number; consumidor_final: number; nao_identificado: number }

export type RiIssue = "sem_origem" | "nao_encontrada" | "nome_ambiguo" | "sem_data";

export interface RiRecord {
  row_number: number;
  record_key: string;
  contact_date: string | null;
  profile_value: string | null;
  profile: RiProfile;
  sheet_campaign: string | null;
  sheet_adset: string | null;
  sheet_ad: string | null;
  campaign_name: string | null;
  ad_group_name: string | null;
  ad_name: string | null;
  match_level: "anuncio" | "conjunto" | "campanha" | null;
  match_method: "id" | "nome" | null;
  match_issue: "sem_origem" | "nao_encontrada" | "nome_ambiguo" | null;
  total_count: number;
}

export interface RiRecordsQuery {
  clientId: string;
  /** null = todas as datas (aba Qualidade dos dados). */
  range: DateRange | null;
  profile?: RiProfile | null;
  campaignId?: string | null;
  adGroupId?: string | null;
  adId?: string | null;
  issue?: RiIssue | null;
}

const RESULTS_ERROR = "Não conseguimos calcular os resultados da planilha.";

export function useRiResults(clientId: string | null, range: DateRange, level: RiLevel, campaignId: string | null = null, adGroupId: string | null = null, enabled = true) {
  return useQuery({
    queryKey: ["ri-results", clientId, range.from, range.to, level, campaignId, adGroupId],
    enabled: Boolean(clientId) && enabled,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("ri_results", {
        p_client_id: clientId, p_from: range.from, p_to: range.to, p_level: level, p_campaign_id: campaignId, p_ad_group_id: adGroupId,
      });
      if (error) throw new FriendlyError(ownDbError(error, RESULTS_ERROR));
      return data as RiResults;
    },
  });
}

export function useRiDaily(clientId: string | null, range: DateRange, campaignId: string | null = null, adGroupId: string | null = null) {
  return useQuery({
    queryKey: ["ri-daily", clientId, range.from, range.to, campaignId, adGroupId],
    enabled: Boolean(clientId),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("ri_daily", {
        p_client_id: clientId, p_from: range.from, p_to: range.to, p_campaign_id: campaignId, p_ad_group_id: adGroupId,
      });
      if (error) throw new FriendlyError(ownDbError(error, RESULTS_ERROR));
      return (data ?? []) as RiDailyRow[];
    },
  });
}

export const RECORDS_PAGE = 50;

export function useRiRecords(q: RiRecordsQuery, page: number, enabled = true) {
  return useQuery({
    queryKey: ["ri-records", q, page],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("ri_records", {
        p_client_id: q.clientId, p_from: q.issue === "sem_data" || !q.range ? null : q.range.from, p_to: q.issue === "sem_data" || !q.range ? null : q.range.to,
        p_profile: q.profile ?? null, p_campaign_id: q.campaignId ?? null, p_ad_group_id: q.adGroupId ?? null, p_ad_id: q.adId ?? null,
        p_issue: q.issue ?? null, p_limit: RECORDS_PAGE, p_offset: page * RECORDS_PAGE,
      });
      if (error) throw new FriendlyError(ownDbError(error, "Não conseguimos ler os registros."));
      return (data ?? []) as RiRecord[];
    },
  });
}

// ---------------------------------------------------------------------------
// Etapa 39.5 — qualidade dos dados da última leitura inteira (sem período).
// ---------------------------------------------------------------------------

export interface RiQuality {
  rows: number;
  contacts: number;
  origin_ad: number;
  origin_ad_group: number;
  origin_campaign: number;
  origin_by_name: number;
  no_origin: number;
  not_found: number;
  ambiguous: number;
  no_date: number;
  empty_profile: number;
  unknown_profiles: { value: string; rows: number }[];
  unmatched_names: { campaign: string | null; adset: string | null; ad: string | null; issue: "nao_encontrada" | "nome_ambiguo"; rows: number }[];
  sources: { source_id: string; read_at: string; trigger: string; row_count: number; stats: RiReadInfo["stats"] }[];
}

export function useRiQuality(clientId: string, readAt: string | null) {
  return useQuery({
    queryKey: ["ri-quality", clientId, readAt],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("ri_quality", { p_client_id: clientId });
      if (error) throw new FriendlyError(ownDbError(error, "Não conseguimos ler a qualidade dos dados."));
      return data as RiQuality;
    },
  });
}
