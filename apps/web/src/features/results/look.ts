import { RI_PROFILE_LABELS, type RiProfile } from "@backstage/shared";

/** Perfis com rótulo e cor (paleta categórica na ordem fixa; "não identificado" em cinza neutro). */
export const PROFILE_LOOK: Record<RiProfile, { label: string; plural: string; color: string }> = {
  lojista: { label: RI_PROFILE_LABELS.lojista, plural: "Lojistas", color: "#2a78d6" },
  sacoleiro: { label: RI_PROFILE_LABELS.sacoleiro, plural: "Sacoleiros", color: "#eb6834" },
  consumidor_final: { label: RI_PROFILE_LABELS.consumidor_final, plural: "Consumidores finais", color: "#1baf7a" },
  nao_identificado: { label: RI_PROFILE_LABELS.nao_identificado, plural: "Não identificados", color: "#94a3b8" },
};
export const PROFILES: RiProfile[] = ["lojista", "sacoleiro", "consumidor_final", "nao_identificado"];
export const RANKED_PROFILES = ["lojista", "sacoleiro", "consumidor_final"] as const;

