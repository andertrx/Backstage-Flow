/**
 * Etapa 44.2 — sugere qual grupo do WhatsApp é de cada cliente, comparando o nome do grupo guardado no CRM
 * com o nome do grupo no WhatsApp. É só uma sugestão: quem confirma é a pessoa.
 */
export interface WaGrupoOpt {
  id: string;
  name: string;
}

export interface WaClienteRef {
  cliente_id: string;
  nome_grupo: string;
}

export interface WaSugestao {
  grupoId: string;
  /** igual = mesmo nome (ignora maiúsculas, acentos e símbolos); parecido = um nome contém o outro. */
  tipo: "igual" | "parecido";
}

export const normalizaNome = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Só sugere quando há UM candidato; cada grupo é sugerido para no máximo um cliente; grupos já ligados a outro cliente ficam de fora. */
export function sugerirGrupos(clientes: WaClienteRef[], grupos: WaGrupoOpt[], ligados: ReadonlyMap<string, string>): Map<string, WaSugestao> {
  const emUso = new Set(ligados.values());
  const livres = grupos.filter((g) => !emUso.has(g.id)).map((g) => ({ ...g, n: normalizaNome(g.name) }));
  const out = new Map<string, WaSugestao>();
  const usados = new Set<string>();
  const alvo = clientes.filter((c) => !ligados.has(c.cliente_id)).map((c) => ({ ...c, n: normalizaNome(c.nome_grupo) })).filter((c) => c.n);
  for (const tipo of ["igual", "parecido"] as const) {
    for (const c of alvo) {
      if (out.has(c.cliente_id)) continue;
      const achados = livres.filter((g) => !usados.has(g.id) && (tipo === "igual" ? g.n === c.n : c.n.length >= 5 && g.n.length >= 5 && (g.n.includes(c.n) || c.n.includes(g.n))));
      if (achados.length === 1) {
        out.set(c.cliente_id, { grupoId: achados[0].id, tipo });
        usados.add(achados[0].id);
      }
    }
  }
  return out;
}
