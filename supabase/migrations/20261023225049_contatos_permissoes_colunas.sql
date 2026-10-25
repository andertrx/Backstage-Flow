-- Correção (T2 e T3.1): tira as permissões padrão das tabelas novas e dá só o que a tela precisa.
-- Sem isto, a permissão por coluna não esconde o hash do telefone/e-mail dos contatos.
revoke all on public.tracking_contacts, public.tracking_contact_history, public.tracking_contact_profiles,
              public.tracking_contact_stages, public.tracking_rules, public.tracking_rule_versions from anon, authenticated;
grant select, insert, update on public.tracking_contact_profiles, public.tracking_contact_stages, public.tracking_rules to authenticated;
grant select on public.tracking_rule_versions, public.tracking_contact_history to authenticated;
grant select (id, client_id, container_id, origin, lead_id, ref_code, profile_id, stage_id, sales, created_at, last_change_at, archived_at)
  on public.tracking_contacts to authenticated;
