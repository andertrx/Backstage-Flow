-- =============================================================================
-- ETAPA 4 — Google Ads
--
--   * ad_accounts.manager_customer_id → conta administradora (MCC) usada para
--     acessar a conta (vai no cabeçalho login-customer-id da API).
--   * ad_accounts.is_test_account     → conta de teste do Google Ads.
--   * public.oauth_states             → "senha temporária" do login com o Google
--     (protege contra falsificação de requisição). Só o servidor lê e grava.
-- =============================================================================

alter table public.ad_accounts
  add column manager_customer_id text check (manager_customer_id is null or manager_customer_id ~ '^[0-9]{1,20}$'),
  add column is_test_account boolean;

comment on column public.ad_accounts.manager_customer_id is 'Google Ads: Customer ID da MCC que dá acesso à conta (login-customer-id). Null = acesso direto.';
comment on column public.ad_accounts.is_test_account is 'Google Ads: conta de teste (não gera dados reais).';

create table public.oauth_states (
  state        text primary key check (char_length(state) >= 32),
  provider     text not null references public.platforms (id),
  user_id      uuid not null references auth.users (id) on delete cascade,
  redirect_uri text not null,
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null default now() + interval '10 minutes'
);

comment on table public.oauth_states is 'Estados temporários do fluxo OAuth (10 min). Uso exclusivo do servidor.';

create index oauth_states_user_idx on public.oauth_states (user_id);
create index oauth_states_expires_idx on public.oauth_states (expires_at);

-- Nenhum acesso pelo site: só a Edge Function (service_role) usa esta tabela.
revoke all on public.oauth_states from anon, authenticated;
alter table public.oauth_states enable row level security;
