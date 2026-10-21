-- Ponto de volta (21/10/2026): desfaz a migração ri_ids_na_coluna_de_nome.
-- As funções antigas ficaram guardadas com o sufixo _antes_2026_10_21; aqui elas voltam
-- para o nome original e as novas ficam guardadas com o sufixo _nova_2026_10_21.
-- Rodar inteiro no SQL Editor do Supabase.
begin;
alter function private.ri_rows(uuid) rename to ri_rows_nova_2026_10_21;
alter function private.ri_rows_antes_2026_10_21(uuid) rename to ri_rows;
alter function private.ri_results_impl(uuid, date, date, text, uuid, uuid) rename to ri_results_impl_nova_2026_10_21;
alter function private.ri_results_impl_antes_2026_10_21(uuid, date, date, text, uuid, uuid) rename to ri_results_impl;
alter function private.ri_records_impl(uuid, date, date, text, uuid, uuid, uuid, text, integer, integer) rename to ri_records_impl_nova_2026_10_21;
alter function private.ri_records_impl_antes_2026_10_21(uuid, date, date, text, uuid, uuid, uuid, text, integer, integer) rename to ri_records_impl;
revoke all on function private.ri_results_impl_nova_2026_10_21(uuid, date, date, text, uuid, uuid) from public, anon, authenticated;
revoke all on function private.ri_records_impl_nova_2026_10_21(uuid, date, date, text, uuid, uuid, uuid, text, integer, integer) from public, anon, authenticated;
grant execute on function private.ri_results_impl(uuid, date, date, text, uuid, uuid) to authenticated;
grant execute on function private.ri_records_impl(uuid, date, date, text, uuid, uuid, uuid, text, integer, integer) to authenticated;
commit;
