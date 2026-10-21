-- Teste da correção de 21/10/2026 (só leitura; termina com um erro de propósito para desfazer tudo).
-- 1) Toda linha com ID do Meta numa coluna de NOME, cujo ID existe no CRM, fica ligada.
-- 2) "campanha em branco" + "campanha não ligada" + "ligada" = total de linhas.
-- 3) Os filtros novos de ri_records existem.
do $$
declare
  v_bad int; v_tot int; v_sum int; v_ok int := 0;
begin
  select count(*) into v_bad
  from public.ri_sources s, private.ri_rows(s.client_id) r
  where r.campaign_id is null and r.sheet_campaign ~ '^[0-9]{6,}$'
    and exists (select 1 from public.campaigns c where c.client_id = s.client_id and c.external_id = r.sheet_campaign);
  if v_bad <> 0 then raise exception 'ID na coluna de nome sem ligação: %', v_bad; end if;
  v_ok := v_ok + 1;

  select count(*),
         count(*) filter (where sheet_campaign is null and campaign_id is null)
       + count(*) filter (where sheet_campaign is not null and campaign_id is null)
       + count(*) filter (where campaign_id is not null)
    into v_tot, v_sum
  from public.ri_sources s, private.ri_rows(s.client_id) r;
  if v_tot <> v_sum then raise exception 'A soma não fecha: % de %', v_sum, v_tot; end if;
  v_ok := v_ok + 1;

  if position('campanha_nao_ligada' in pg_get_functiondef('private.ri_records_impl(uuid,date,date,text,uuid,uuid,uuid,text,integer,integer)'::regprocedure)) = 0 then
    raise exception 'Filtro campanha_nao_ligada ausente';
  end if;
  v_ok := v_ok + 1;

  if not exists (select 1 from pg_proc where proname = 'ri_rows_antes_2026_10_21') then raise exception 'Ponto de volta ausente'; end if;
  v_ok := v_ok + 1;
  raise exception 'R: % verificações OK', v_ok;
end $$;
