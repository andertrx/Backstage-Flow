-- Correção da tracking_regras: o servidor (Edge Function track) lê as regras publicadas pela função interna.
grant execute on function private.tracking_rules_for_key(text) to service_role;
