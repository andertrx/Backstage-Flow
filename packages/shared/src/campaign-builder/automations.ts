/**
 * Fase J.1 — "Controle total": as automações que o Meta liga sozinho e como o CRM as desliga.
 *
 * A lista de melhorias do criativo é a que o próprio Meta devolveu na sondagem de 28/11/2026 (conta Acelera Atacado,
 * docs/etapa-35-campaign-builder/35.11-FASE-J0-SONDAGEM-NO-META.md). O Meta muda essa lista com frequência: por isso, depois de
 * publicar, o CRM lê o criativo de volta e mostra o que ficou LIGADO de verdade (enabledFeatures).
 */

/** Melhorias Advantage+ do criativo (creative_features_spec). Todas vão como OPT_OUT quando o Controle total está ligado. */
export const META_CREATIVE_FEATURES = [
  "adapt_to_placement", "add_text_overlay", "ads_with_benefits", "advantage_plus_creative", "app_highlights", "audio", "auto_promotion_tag",
  "biz_ai", "carousel_to_video", "catalog_feed_tag", "creative_stickers", "customize_product_recommendation", "cv_transformation",
  "description_automation", "dha_optimization", "dynamic_cta_text", "dynamic_partner_content", "enable_ncs_testimonials", "enhance_cta",
  "fb_feed_tag", "fb_reels_tag", "fb_story_tag", "feed_caption_optimization", "generate_cta", "hide_price", "hyperlink_formatting",
  "ig_feed_tag", "ig_glados_feed", "ig_reels_tag", "ig_stream_tag", "ig_video_native_subtitle", "image_animation", "image_auto_crop",
  "image_background_gen", "image_banner", "image_brightness_and_contrast", "image_end_card", "image_enhancement", "image_templates",
  "image_text_translation", "image_touchups", "image_uncrop", "inline_comment", "local_store_extension", "media_liquidity_animated_image",
  "media_order", "media_type_automation", "multi_creative_post_carousel", "multi_photo_to_video", "music_generation", "pac_genai_recomposition",
  "pac_recomposition", "pac_relaxation", "product_browsing", "product_extensions", "product_metadata_automation", "product_tags",
  "profile_card", "profile_extension", "replace_media_text", "reveal_details_over_time", "show_destination_blurbs", "show_summary",
  "site_extensions", "standard_enhancements_catalog", "text_extraction_for_headline", "text_extraction_for_tap_target",
  "text_formatting_optimization", "text_generation", "text_optimizations", "text_overlay_translation", "text_translation", "translate_voiceover",
  "video_auto_crop", "video_filtering", "video_highlight", "video_highlights", "video_to_image", "video_uncrop", "video_uncrop_9x16_to_9x18",
  "video_voiceover", "wa_mm_image_filtering", "wa_mm_text_truncation_length",
] as const;

/** Nomes em português das melhorias mais comuns (para a tela). As demais aparecem com o nome do Meta. */
export const FEATURE_LABELS: Record<string, string> = {
  inline_comment: "Comentários em destaque",
  show_summary: "Resumo do anúncio",
  reveal_details_over_time: "Revelar detalhes aos poucos",
  show_destination_blurbs: "Textos do destino",
  video_uncrop: "Ampliar vídeo (descorte)",
  video_auto_crop: "Corte automático do vídeo",
  video_filtering: "Filtros no vídeo",
  pac_relaxation: "Trocar vídeo entre posicionamentos",
  text_optimizations: "Ajustar o texto",
  enhance_cta: "Melhorar o botão",
  image_touchups: "Retoque de imagem",
  image_animation: "Animar imagem",
  adapt_to_placement: "Adaptar ao posicionamento",
  music_generation: "Música automática",
  audio: "Áudio automático",
  text_translation: "Traduzir texto",
  translate_voiceover: "Traduzir narração",
  site_extensions: "Links do site",
  product_extensions: "Produtos do catálogo",
  standard_enhancements: "Melhorias padrão (pacote antigo)",
};

/** Posicionamentos manuais combinados com o Ander (28/11/2026): Feed, Explorar, Stories e Reels do Facebook e do Instagram. */
export const MANUAL_PLACEMENTS = {
  publisher_platforms: ["facebook", "instagram"],
  facebook_positions: ["feed", "story", "facebook_reels"],
  instagram_positions: ["stream", "story", "reels", "explore", "explore_home"],
} as const;

/** Onde vai o vídeo VERTICAL quando o criativo tem um vídeo por posicionamento (o outro vai para o resto). */
export const VERTICAL_PLACEMENTS = {
  publisher_platforms: ["facebook", "instagram"],
  facebook_positions: ["story", "facebook_reels"],
  instagram_positions: ["story", "reels"],
} as const;

export type PlacementMode = "manual" | "automatic";

/** Escolhas do "Controle total". O padrão é TUDO desligado: o Meta só faz o que você pediu. */
export interface AutomationControl {
  /** Deixar o Meta aplicar as melhorias Advantage+ do criativo (retoques, cortes, comentários, música...). */
  enhancements: boolean;
  /** Deixar o Meta mostrar o anúncio junto de anúncios de outros anunciantes. */
  multiAdvertiser: boolean;
  /** Posicionamentos: escolhidos (Feed, Explorar, Stories, Reels) ou automáticos (o Meta escolhe, inclusive Audience Network). */
  placements: PlacementMode;
  /** Parâmetros de rastreio (UTM) somados ao link de todos os anúncios. Vazio = nenhum. */
  urlTags: string;
}

export const DEFAULT_CONTROL: AutomationControl = { enhancements: false, multiAdvertiser: false, placements: "manual", urlTags: "" };

export const SUGGESTED_URL_TAGS = "utm_source=meta&utm_medium=paid&utm_campaign={{campaign.name}}&utm_content={{ad.name}}";

/** Lê o JSON salvo e devolve escolhas completas (o que faltar volta para o padrão: desligado). */
export function normalizeControl(raw: unknown): AutomationControl {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    enhancements: r.enhancements === true,
    multiAdvertiser: r.multiAdvertiser === true,
    placements: r.placements === "automatic" ? "automatic" : "manual",
    urlTags: typeof r.urlTags === "string" ? r.urlTags.trim().slice(0, 500) : "",
  };
}

/** Problema nos parâmetros de rastreio (ou null se estão bons). */
export function urlTagsProblem(tags: string): string | null {
  if (!tags) return null;
  if (tags.startsWith("?")) return "Os parâmetros de rastreio não começam com ?: comece direto, ex.: utm_source=meta.";
  if (/\s/.test(tags)) return "Os parâmetros de rastreio não podem ter espaços.";
  if (!/^[^=&]+=[^&]*(&[^=&]+=[^&]*)*$/.test(tags)) return "Os parâmetros de rastreio precisam ser no formato nome=valor, separados por &.";
  return null;
}

/** `degrees_of_freedom_spec` que desliga todas as melhorias conhecidas. */
export function optOutSpec(): { creative_features_spec: Record<string, { enroll_status: "OPT_OUT" }> } {
  return { creative_features_spec: Object.fromEntries(META_CREATIVE_FEATURES.map((f) => [f, { enroll_status: "OPT_OUT" as const }])) };
}

/**
 * Melhorias LIGADAS segundo a leitura de volta do Meta. Aceita os dois formatos que o Meta devolve:
 * `creative_features_spec: { nome: { enroll_status } }` e `creative_features: [{ feature, enroll_status }]`.
 */
export function enabledFeatures(spec: unknown): string[] {
  if (!spec || typeof spec !== "object") return [];
  const s = spec as Record<string, unknown>;
  const on: string[] = [];
  const map = s.creative_features_spec;
  if (map && typeof map === "object") {
    for (const [name, v] of Object.entries(map as Record<string, unknown>)) {
      if ((v as { enroll_status?: string } | null)?.enroll_status === "OPT_IN") on.push(name);
    }
  }
  if (Array.isArray(s.creative_features)) {
    for (const v of s.creative_features as { feature?: string; enroll_status?: string }[]) {
      if (v?.enroll_status === "OPT_IN" && typeof v.feature === "string" && !on.includes(v.feature)) on.push(v.feature);
    }
  }
  return on.sort();
}

/** Resultado da leitura de volta, guardado em publish_items.automations_check. */
export type AutomationsCheck =
  | { kind: "criativo"; ligadas: string[] }
  | { kind: "conjunto"; advantageAudience: boolean; placements: PlacementMode };

/** Leitura de volta do conjunto: Público Advantage+ e posicionamentos. */
export function adSetCheck(targeting: unknown): AutomationsCheck {
  const t = (targeting && typeof targeting === "object" ? targeting : {}) as Record<string, unknown>;
  const aa = (t.targeting_automation as { advantage_audience?: number } | undefined)?.advantage_audience;
  return { kind: "conjunto", advantageAudience: aa === 1, placements: Array.isArray(t.publisher_platforms) && t.publisher_platforms.length ? "manual" : "automatic" };
}

export const featureLabel = (f: string) => FEATURE_LABELS[f] ?? f;
