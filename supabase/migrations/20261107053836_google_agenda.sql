-- Etapa 46.1 — conexão do Google Agenda de cada pessoa. A chave de acesso (refresh token) fica no Vault e só o servidor lê.
create table public.google_agenda_conexoes (
  user_id        uuid primary key references auth.users (id) on delete cascade,
  google_email   text check (char_length(google_email) <= 320),
  google_sub     text check (char_length(google_sub) <= 64),
  status         text not null default 'conectada' check (status in ('conectada', 'erro', 'desconectada')),
  scopes         text,
  vault_secret_id uuid,
  connected_at   timestamptz not null default now(),
  last_sync_at   timestamptz,
  last_error     text check (char_length(last_error) <= 500),
  sync_token     text,
  updated_at     timestamptz not null default now()
);
comment on table public.google_agenda_conexoes is 'Etapa 46.1: uma linha por pessoa que conectou o Google Agenda. A chave de acesso fica no Vault (nunca aqui). Ao desconectar, a chave é apagada do cofre e a linha fica como "desconectada".';
create index google_agenda_conexoes_status_idx on public.google_agenda_conexoes (status);

alter table public.google_agenda_conexoes enable row level security;
revoke all on public.google_agenda_conexoes from anon, authenticated;
-- Só leitura: cada pessoa vê a sua; o administrador vê o estado de todas (sem chaves: elas não estão nesta tabela).
grant select (user_id, google_email, status, scopes, connected_at, last_sync_at, last_error, updated_at) on public.google_agenda_conexoes to authenticated;
create policy "Cada pessoa vê a sua conexão; admin vê todas" on public.google_agenda_conexoes for select to authenticated
  using (user_id = (select auth.uid()) or (select private.current_user_role()) = 'admin');

-- Cofre: só o servidor (service_role) executa
create function public.gcal_secret_set(p_user uuid, p_secret text)
returns void language plpgsql security definer set search_path = '' as $$
declare existing uuid; created uuid;
begin
  select vault_secret_id into existing from public.google_agenda_conexoes where user_id = p_user;
  if not found then raise exception 'conexão não encontrada'; end if;
  if existing is not null then
    perform vault.update_secret(existing, p_secret);
  else
    created := vault.create_secret(p_secret, 'gcal:' || p_user::text, 'Chave de acesso do Google Agenda de uma pessoa');
    update public.google_agenda_conexoes set vault_secret_id = created, updated_at = now() where user_id = p_user;
  end if;
end;
$$;
create function public.gcal_secret_get(p_user uuid)
returns text language sql stable security definer set search_path = '' as $$
  select s.decrypted_secret from public.google_agenda_conexoes c join vault.decrypted_secrets s on s.id = c.vault_secret_id
   where c.user_id = p_user and c.status <> 'desconectada'
$$;
create function public.gcal_secret_delete(p_user uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare existing uuid;
begin
  select vault_secret_id into existing from public.google_agenda_conexoes where user_id = p_user;
  if existing is not null then
    delete from vault.secrets where id = existing;
    update public.google_agenda_conexoes set vault_secret_id = null, updated_at = now() where user_id = p_user;
  end if;
end;
$$;
revoke all on function public.gcal_secret_set(uuid, text), public.gcal_secret_get(uuid), public.gcal_secret_delete(uuid) from public, anon, authenticated;
grant execute on function public.gcal_secret_set(uuid, text), public.gcal_secret_get(uuid), public.gcal_secret_delete(uuid) to service_role;
