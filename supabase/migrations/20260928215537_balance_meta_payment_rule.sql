-- =============================================================================
-- Correção (28/09/2026), parte 2: a regra do disponível do Meta também no banco.
--
-- O que o Meta informa e fica guardado em cada fotografia:
--   payload.funding_source_type (1 = cartão; 20 = saldo pré-pago),
--   payload.is_prepay_account e funding_description ("Saldo disponível (R$1.345,32 BRL)").
-- Regra (igual à do servidor, supabase/functions/_shared/platforms/meta/funding.ts):
--   * pré-paga (tipo 20 ou conta pré-paga) → disponível = saldo escrito pelo Meta
--     (só se a moeda do texto for a da conta) → 'meta_prepaid_balance';
--   * cartão (tipo 1) → sem saldo em conta → 'meta_card' (tela: R$ 0,00);
--   * outro caso → não informado.
--   O limite de gastos (spend_cap) nunca vira disponível.
-- Onde vale:
--   * gatilho ao gravar uma fotografia do Meta (qualquer versão do servidor);
--   * account_balances() reinterpreta as fotografias antigas ('meta_spend_cap')
--     na leitura, sem alterar o histórico guardado.
-- =============================================================================

-- "Saldo disponível (R$1.345,32 BRL)" → 1345320000 (micros). Moeda diferente → NULL.
create function private.meta_prepaid_micros(p_display text, p_currency text)
returns bigint language plpgsql immutable set search_path = '' as $$
declare
  v_inner text;
  v_code text;
  v_num text;
  v_dec text;
  v_whole text;
begin
  if p_display is null or p_currency is null then return null; end if;
  v_inner := (regexp_match(p_display, '\(([^()]*)\)'))[1];
  if v_inner is null then return null; end if;
  v_code := (regexp_match(v_inner, '([A-Z]{3})\s*$'))[1];
  if v_code is distinct from upper(p_currency) then return null; end if;
  v_num := (regexp_match(v_inner, '([0-9][0-9.,]*)'))[1];
  if v_num is null then return null; end if;
  v_dec := (regexp_match(v_num, '[.,]([0-9]{1,2})$'))[1];
  v_whole := regexp_replace(case when v_dec is null then v_num else left(v_num, length(v_num) - length(v_dec) - 1) end, '[.,]', '', 'g');
  if v_whole !~ '^[0-9]+$' then return null; end if;
  return round((v_whole || '.' || rpad(coalesce(v_dec, '00'), 2, '0'))::numeric * 1000000)::bigint;
end;
$$;

create function private.meta_available_basis(p_payload jsonb, p_display text, p_currency text)
returns text language sql immutable set search_path = '' as $$
  select case
    when (p_payload ->> 'funding_source_type' = '20' or p_payload ->> 'is_prepay_account' = 'true')
         and private.meta_prepaid_micros(p_display, p_currency) is not null then 'meta_prepaid_balance'
    when p_payload ->> 'funding_source_type' = '1' then 'meta_card'
    else null end
$$;

create function private.meta_available_micros(p_payload jsonb, p_display text, p_currency text)
returns bigint language sql immutable set search_path = '' as $$
  select case when private.meta_available_basis(p_payload, p_display, p_currency) = 'meta_prepaid_balance'
              then private.meta_prepaid_micros(p_display, p_currency) end
$$;

revoke all on function private.meta_prepaid_micros(text, text) from public, anon;
revoke all on function private.meta_available_basis(jsonb, text, text) from public, anon;
revoke all on function private.meta_available_micros(jsonb, text, text) from public, anon;
grant execute on function private.meta_prepaid_micros(text, text) to authenticated, service_role;
grant execute on function private.meta_available_basis(jsonb, text, text) to authenticated, service_role;
grant execute on function private.meta_available_micros(jsonb, text, text) to authenticated, service_role;

-- Gatilho: toda fotografia nova do Meta segue a regra, venha de qual versão do servidor vier.
create function private.account_snapshots_meta_payment()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.platform_id = 'meta' then
    new.available_basis := private.meta_available_basis(new.payload, new.funding_description, new.currency);
    new.available_micros := private.meta_available_micros(new.payload, new.funding_description, new.currency);
    new.issues := array_remove(coalesce(new.issues, '{}'), 'sem_saldo')
                  || case when new.available_micros = 0 then array['sem_saldo'] else '{}'::text[] end;
  end if;
  return new;
end;
$$;
create trigger account_snapshots_meta_payment before insert on public.account_snapshots
  for each row execute function private.account_snapshots_meta_payment();

-- (A leitura em account_balances() foi ajustada logo em seguida, na parte 3:
--  20260928215651_balance_meta_payment_rule_all_rows.sql)
