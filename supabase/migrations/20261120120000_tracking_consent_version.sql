-- T5.36: consent_version — código da versão do aviso de LGPD aceita pelo visitante.
-- O campo é opcional e vem do navegador (t.js lê data-consent-version e envia como "cv").
alter table public.tracking_containers
  add column consent_version text;
