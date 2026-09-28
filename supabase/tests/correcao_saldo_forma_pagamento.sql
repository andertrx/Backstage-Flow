-- =============================================================================
-- Testes da correção de 28/09/2026 — valor disponível e forma de pagamento.
-- O limite de gastos (ou do cartão) nunca vira "disponível".
-- Rodar inteiro no SQL Editor. Transação desfeita no final: nada fica gravado.
-- (Usa as contas reais Golfinho Moda Praia e Abraço de Algodão só dentro da transação.)
-- =============================================================================
begin;
create temp table r (what text, v text) on commit drop;
insert into r select 'texto pt-BR', private.meta_prepaid_micros('Saldo disponível (R$1.345,32 BRL)', 'BRL')::text;
insert into r select 'texto en-US', private.meta_prepaid_micros('Available balance ($1,234.50 USD)', 'USD')::text;
insert into r select 'sem centavos', private.meta_prepaid_micros('Saldo disponível (R$12.345 BRL)', 'BRL')::text;
insert into r select 'moeda diferente', coalesce(private.meta_prepaid_micros('Saldo disponível (R$1.345,32 BRL)', 'USD')::text, 'nulo');
insert into r select 'cartão', coalesce(private.meta_prepaid_micros('Mastercard *2596', 'BRL')::text, 'nulo');

-- Gravação como a versão antiga do servidor faria (limite − gasto como disponível): o gatilho corrige.
with acc as (select a.id, a.client_id from public.ad_accounts a join public.clients c on c.id = a.client_id
              where c.name = 'Golfinho Moda Praia' and a.platform_id = 'meta' limit 1)
insert into public.account_snapshots (ad_account_id, client_id, platform_id, status, currency, amount_spent_micros, spend_cap_micros,
                                      available_micros, available_basis, funding_description, issues, payload)
select id, client_id, 'meta', 'ativa', 'BRL', 1567860000, 5000000000, 3432140000, 'meta_spend_cap', 'Mastercard *2596', '{sem_saldo}',
       '{"funding_source_type":1,"is_prepay_account":false}' from acc;
insert into r select 'gatilho cartão', (select coalesce(available_micros::text, 'nulo') || '|' || available_basis || '|' || array_to_string(issues, ',')
  from public.account_snapshots s join public.clients c on c.id = s.client_id where c.name = 'Golfinho Moda Praia' order by captured_at desc limit 1);

with acc as (select a.id, a.client_id from public.ad_accounts a join public.clients c on c.id = a.client_id
              where c.name = 'Abraço de Algodão' and a.platform_id = 'meta' limit 1)
insert into public.account_snapshots (ad_account_id, client_id, platform_id, status, currency, spend_cap_micros, amount_spent_micros,
                                      available_micros, available_basis, funding_description, issues, payload)
select id, client_id, 'meta', 'ativa', 'BRL', 8214430000, 7032570000, 1181860000, 'meta_spend_cap', 'Saldo disponível (R$0,00 BRL)', '{}',
       '{"funding_source_type":20,"is_prepay_account":true}' from acc;
insert into r select 'gatilho pré-pago zerado', (select available_micros::text || '|' || available_basis || '|' || array_to_string(issues, ',')
  from public.account_snapshots s join public.clients c on c.id = s.client_id where c.name = 'Abraço de Algodão' order by captured_at desc limit 1);

insert into r select 'leitura golfinho', (select coalesce(available_micros::text, 'nulo') || '|' || available_basis
  from public.account_balances(null, array['meta']) where client_name = 'Golfinho Moda Praia');

do $$
declare
  e jsonb := jsonb_build_object(
    'texto pt-BR', '1345320000',
    'texto en-US', '1234500000',
    'sem centavos', '12345000000',
    'moeda diferente', 'nulo',
    'cartão', 'nulo',
    'gatilho cartão', 'nulo|meta_card|',
    'gatilho pré-pago zerado', '0|meta_prepaid_balance|sem_saldo',
    'leitura golfinho', 'nulo|meta_card');
  x record;
begin
  for x in select * from r loop
    if e ->> x.what is distinct from x.v then raise exception 'FALHOU: % = % (esperado %)', x.what, x.v, e ->> x.what; end if;
  end loop;
  if (select count(*) from r) <> (select count(*) from jsonb_object_keys(e)) then raise exception 'FALHOU: faltou verificação'; end if;
  raise notice 'Correção do saldo: % verificações OK', (select count(*) from r);
end $$;

rollback;
