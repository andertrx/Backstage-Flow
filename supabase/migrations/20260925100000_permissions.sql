-- =============================================================================
-- ETAPA 20 — Permissões (revisão geral)
--
-- A revisão de todas as tabelas e funções encontrou uma brecha: o perfil
-- CLIENTE ainda conseguia ler três informações internas da agência:
--   * account_snapshots → fotografias de saldo (inclui a descrição do cartão
--                         e a resposta bruta da plataforma);
--   * entity_changes    → histórico de alterações das campanhas;
--   * sync_state        → estado da sincronização (com a mensagem de erro).
-- Agora só a equipe (admin, gestor, operador, visualizador) lê essas tabelas,
-- sempre limitada aos clientes liberados. Nenhum dado é apagado.
--
-- Camada extra: funções de gatilho (triggers) não podem mais ser chamadas
-- diretamente pela API. Os gatilhos continuam funcionando normalmente.
-- =============================================================================

drop policy "Vê fotografias dos clientes liberados" on public.account_snapshots;
create policy "Equipe vê fotografias dos clientes liberados" on public.account_snapshots for select to authenticated
  using (client_id in (select private.visible_client_ids()) and (select private.current_user_role()) <> 'cliente');

drop policy "Vê alterações dos clientes liberados" on public.entity_changes;
create policy "Equipe vê alterações dos clientes liberados" on public.entity_changes for select to authenticated
  using (client_id in (select private.visible_client_ids()) and (select private.current_user_role()) <> 'cliente');

drop policy "Vê o estado de sincronização das contas visíveis" on public.sync_state;
create policy "Equipe vê o estado de sincronização das contas visíveis" on public.sync_state for select to authenticated
  using (
    (select private.current_user_role()) <> 'cliente'
    and exists (select 1 from public.ad_accounts a where a.id = sync_state.ad_account_id and (select private.can_view_client(a.client_id)))
  );

-- Funções de gatilho: só o banco as executa (o Postgres não confere EXECUTE ao disparar um gatilho).
revoke execute on function private.audit_row_change() from public, anon, authenticated;
revoke execute on function private.clients_set_audit_columns() from public, anon, authenticated;
revoke execute on function private.grant_creator_access() from public, anon, authenticated;
revoke execute on function private.handle_new_user() from public, anon, authenticated;
revoke execute on function private.handle_user_email_change() from public, anon, authenticated;
revoke execute on function private.touch_updated_at() from public, anon, authenticated;
revoke execute on function private.track_entity_changes() from public, anon, authenticated;
revoke execute on function private.user_client_access_set_granted_by() from public, anon, authenticated;
