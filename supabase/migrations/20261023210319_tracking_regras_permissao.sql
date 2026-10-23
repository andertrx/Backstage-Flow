-- Correção da tracking_regras: as funções finas chamam as internas, que conferem o papel por dentro.
grant execute on function private.tracking_rules_publish_impl(uuid, integer) to authenticated;
grant execute on function private.tracking_rules_restore_impl(uuid, integer) to authenticated;
