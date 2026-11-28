-- Fase J.2 — Esteira de criativos: a lista de rascunhos passa a dizer o tipo (campanha nova ou esteira de criativos),
-- para a tela abrir o editor certo. Nenhuma tabela nova: a esteira fica em builder_drafts.data com "kind": "esteira".
create or replace function private.builder_draft_list_impl(p_client uuid default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.builder_pode_ver() then raise exception 'Sem permissão para o Campaign Builder.' using errcode = '42501'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('id', d.id, 'client_id', d.client_id, 'client_name', c.name,
            'ad_account_id', d.ad_account_id, 'ad_account_name', a.name, 'name', d.name, 'version', d.version,
            'updated_at', d.updated_at, 'updated_by_name', u.full_name,
            'kind', case when d.data->>'kind' = 'esteira' then 'esteira' else 'campanha' end) order by d.updated_at desc), '[]')
            from public.builder_drafts d
            join public.clients c on c.id = d.client_id
            left join public.ad_accounts a on a.id = d.ad_account_id
            left join public.profiles u on u.id = d.updated_by
           where d.archived_at is null
             and (p_client is null or d.client_id = p_client)
             and private.can_view_client(d.client_id));
end;
$$;
