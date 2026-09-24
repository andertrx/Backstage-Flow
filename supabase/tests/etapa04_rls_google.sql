-- =============================================================================
-- Testes da Etapa 4 — Google Ads (estado do OAuth e colunas novas)
-- Rodar inteiro no SQL Editor. Transação desfeita no final.
-- =============================================================================
begin;

insert into auth.users (id, instance_id, aud, role, email) values
  ('00000000-0000-0000-0000-0000000004a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin@t4.local');
update public.profiles set active = true, role = 'admin' where id = '00000000-0000-0000-0000-0000000004a1';

insert into public.oauth_states (state, provider, user_id, redirect_uri)
values (repeat('a', 64), 'google', '00000000-0000-0000-0000-0000000004a1', 'https://app/configuracoes/integracoes/google/callback');

do $$
begin
  -- estado expira em 10 minutos
  if (select expires_at - created_at from public.oauth_states where state = repeat('a', 64)) <> interval '10 minutes' then
    raise exception 'FALHOU: estado do OAuth deveria valer 10 minutos';
  end if;
  begin
    insert into public.oauth_states (state, provider, user_id, redirect_uri) values ('curto', 'google', '00000000-0000-0000-0000-0000000004a1', 'x');
    raise exception 'FALHOU: estado curto (fácil de adivinhar) aceito';
  exception when check_violation then null;
  end;
  begin
    insert into public.ad_accounts (platform_id, external_id, client_id, name, manager_customer_id)
    select 'google', '1234567890', gen_random_uuid(), 'x', '12-34';
    raise exception 'FALHOU: MCC com formato inválido aceita';
  exception when check_violation or foreign_key_violation then null;
  end;
end $$;

-- Nem o próprio admin lê os estados pelo site
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000004a1","role":"authenticated"}';
do $$
begin
  perform 1 from public.oauth_states;
  raise exception 'FALHOU: site leu oauth_states';
exception when insufficient_privilege then null;
end $$;
reset role;

rollback;

select 'TODOS OS TESTES PASSARAM' as resultado;
