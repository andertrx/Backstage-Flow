/** Etapa 44.3 — envio de mensagens pelo WhatsApp conectado: regras puras (sem banco), para testar. */
import { callGateway, type GatewayCfg } from "../wa-gateway/logic.ts";

export interface Disparo {
  id: number;
  grupo_id: string;
  mensagem: string;
  tentativa: number;
  /** Números (só dígitos, com DDI) das pessoas marcadas com @ no fim do texto (T5.20). Opcional. */
  mentioned?: string[];
}

/** Lista de marcações válida: até 30 números só com dígitos (10 a 15). */
export function mentionedValido(m: unknown): m is string[] {
  return Array.isArray(m) && m.length <= 30 && m.every((x) => typeof x === "string" && /^[0-9]{10,15}$/.test(x));
}

export interface Aviso {
  ids: number[];
  grupo_id: string;
  mensagem: string;
}

/** Lote de avisos para o grupo do administrador: só grupo (@g.us), ids numéricos e texto de tamanho razoável. */
export function avisoValido(a: unknown): a is Aviso {
  const o = a as Record<string, unknown> | null;
  return !!o && Array.isArray(o.ids) && o.ids.length > 0 && o.ids.length <= 10 && o.ids.every((x) => typeof x === "number") &&
    typeof o.grupo_id === "string" && /^[0-9A-Za-z._-]{5,60}@g\.us$/.test(o.grupo_id) &&
    typeof o.mensagem === "string" && o.mensagem.trim().length > 0 && o.mensagem.length <= 4000;
}

export interface Resultado {
  ok: boolean;
  retry: boolean;
  detalhe: string | null;
  /** Problema de acesso: o servidor recusou a chave, então o estado da conexão vira "erro". */
  acesso: boolean;
}

/** Só grupos (@g.us) e mensagem de texto de tamanho razoável. */
export function disparoValido(d: unknown): d is Disparo {
  const o = d as Record<string, unknown> | null;
  return !!o && typeof o.id === "number" && typeof o.grupo_id === "string" && /^[0-9A-Za-z._-]{5,60}@g\.us$/.test(o.grupo_id) &&
    typeof o.mensagem === "string" && o.mensagem.trim().length > 0 && o.mensagem.length <= 4000 &&
    (o.mentioned === undefined || o.mentioned === null || mentionedValido(o.mentioned));
}

/** Pausa aleatória (ms) antes de enviar, para não parecer robô. */
export function pausaAleatoria(rand: () => number = Math.random): number {
  return 1200 + Math.floor(rand() * 2300);
}

/** Traduz a resposta do servidor de conexão em ok / tentar de novo / falha definitiva. Nunca guarda corpo nem chave. */
export function classificar(status: number | "sem_conexao"): Resultado {
  if (status === "sem_conexao") return { ok: false, retry: true, detalhe: "Servidor do WhatsApp sem resposta.", acesso: false };
  if (status >= 200 && status < 300) return { ok: true, retry: false, detalhe: null, acesso: false };
  if (status === 401 || status === 403) return { ok: false, retry: false, detalhe: "O servidor do WhatsApp recusou a chave de acesso.", acesso: true };
  if (status === 404) return { ok: false, retry: false, detalhe: "O servidor não achou a instância ou o grupo.", acesso: false };
  if (status === 400) return { ok: false, retry: false, detalhe: "O WhatsApp recusou a mensagem (grupo inválido ou sem permissão).", acesso: false };
  if (status === 429 || status >= 500) return { ok: false, retry: true, detalhe: `Servidor do WhatsApp com problema (código ${status}).`, acesso: false };
  return { ok: false, retry: false, detalhe: `Resposta inesperada do servidor (código ${status}).`, acesso: false };
}

export async function enviarTexto(cfg: GatewayCfg, d: { grupo_id: string; mensagem: string; mentioned?: string[] | null }, delay: number, fetchImpl?: typeof fetch): Promise<Resultado> {
  try {
    const r = await callGateway(cfg, "POST", "/message/sendText/{instance}", {
      body: { number: d.grupo_id, text: d.mensagem, delay, linkPreview: false, ...(d.mentioned && d.mentioned.length ? { mentioned: d.mentioned } : {}) },
      fetchImpl,
    });
    return classificar(r.status);
  } catch (e) {
    if (e instanceof Error && e.message === "ENDERECO_INSEGURO") return { ok: false, retry: false, detalhe: "Endereço do servidor não é seguro.", acesso: false };
    return classificar("sem_conexao");
  }
}
