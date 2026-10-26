/** Etapa 40.3: quem fez a ação no histórico — pessoa, "Sistema" ou pessoa "via Claude (MCP)". */
export function originLabel(origin: string | null | undefined, actor: string | null | undefined): string {
  if (origin === "sistema") return "Sistema";
  if (origin === "mcp") return `${actor ?? "—"} · via Claude (MCP)`;
  return actor ?? "—";
}
