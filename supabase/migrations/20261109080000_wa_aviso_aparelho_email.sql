-- T5.18 (09/11/2026): o aviso "WhatsApp dos envios sem conexão / voltou" também chega no aparelho (Web Push) e por e-mail.
-- Cada aviso de sino do tipo whatsapp.caiu / whatsapp.voltou (só administradores) vira uma linha em wa_saude_avisos,
-- e o servidor envio-aviso (o mesmo do aviso de aprovar envio) manda o push e o e-mail e anota o resultado.
-- Nada de telefone nem de conversa vai no aviso: só o texto do sino (situação e, se houver, o final do número).

create table public.wa_saude_avisos (
  id           bigint generated always as identity primary key,
  user_id      uuid not null references auth.users (id),
  tipo         text not null check (tipo in ('caiu', 'voltou')),
  titulo       text not null check (char_length(titulo) <= 200),
  corpo        text not null check (char_length(corpo) <= 500),
  created_at   timestamptz not null default now(),
  push_status  text not null default 'pendente' check (push_status in ('pendente', 'enviado', 'sem_aparelho', 'falhou')),
  email_status text not null default 'pendente' check (email_status in ('pendente', 'enviado', 'sem_email', 'falhou')),
  reason       text check (char_length(reason) <= 500)
);
comment on table public.wa_saude_avisos is 'Aviso de WhatsApp dos envios caiu/voltou no aparelho e por e-mail: um registro por administrador e por aviso do sino, com o resultado de cada canal. Poucos registros (só quando a conexão muda); guardado sem prazo.';
create index wa_saude_avisos_pendentes_idx on public.wa_saude_avisos (created_at) where push_status = 'pendente' or email_status = 'pendente';
create index wa_saude_avisos_user_idx on public.wa_saude_avisos (user_id, created_at desc);

alter table public.wa_saude_avisos enable row level security;
revoke all on table public.wa_saude_avisos from anon, authenticated;
grant select on table public.wa_saude_avisos to authenticated;
create policy "WhatsApp: administrador vê os avisos" on public.wa_saude_avisos for select to authenticated
  using (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin' and p.active));

-- Gatilho: cada aviso de sino do WhatsApp gera o aviso de aparelho/e-mail e chama o servidor na hora.
create function private.wa_saude_avisar()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text := (select value from private.app_settings where key = 'functions_url');
  v_secret text := (select decrypted_secret from vault.decrypted_secrets where name = 'sync_cron_secret');
begin
  if new.kind not in ('whatsapp.caiu', 'whatsapp.voltou') then return new; end if;
  insert into public.wa_saude_avisos (user_id, tipo, titulo, corpo)
  values (new.user_id, case when new.kind = 'whatsapp.caiu' then 'caiu' else 'voltou' end, left(new.title, 200), left(coalesce(new.body, ''), 500));
  if v_url is not null and v_secret is not null then
    perform net.http_post(
      url := v_url || '/envio-aviso',
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', v_secret),
      body := jsonb_build_object('action', 'send'),
      timeout_milliseconds := 60000);
  end if;
  return new;
end;
$$;
revoke all on function private.wa_saude_avisar() from public, anon, authenticated;
create trigger wa_saude_avisar after insert on public.ops_notifications
  for each row when (new.kind in ('whatsapp.caiu', 'whatsapp.voltou'))
  execute function private.wa_saude_avisar();

-- Para o agendador existente (a cada 5 min) também tentar de novo o que ficou pendente (ex.: servidor fora do ar na hora).
create or replace function private.trigger_envio_avisos()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text := (select value from private.app_settings where key = 'functions_url');
  v_secret text := (select decrypted_secret from vault.decrypted_secrets where name = 'sync_cron_secret');
begin
  perform private.envio_avisar();
  if v_url is null or v_secret is null then return; end if;
  if not exists (select 1 from public.ops_envio_avisos a where (a.push_status = 'pendente' or a.email_status = 'pendente') and a.created_at > now() - interval '3 hours')
     and not exists (select 1 from public.wa_saude_avisos w where (w.push_status = 'pendente' or w.email_status = 'pendente') and w.created_at > now() - interval '3 hours') then
    return;
  end if;
  perform net.http_post(
    url := v_url || '/envio-aviso',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', v_secret),
    body := jsonb_build_object('action', 'send'),
    timeout_milliseconds := 60000
  );
end;
$$;

-- Fila e marcação para o servidor (só a chave de serviço).
create function private.wa_saude_aviso_fila()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', w.id, 'tipo', w.tipo, 'titulo', w.titulo, 'corpo', w.corpo,
           'push_pendente', w.push_status = 'pendente', 'email_pendente', w.email_status = 'pendente',
           'email', p.email, 'nome_pessoa', p.full_name,
           'subscriptions', (select jsonb_agg(jsonb_build_object('id', s.id, 'endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth))
                               from public.ops_push_subscriptions s where s.user_id = w.user_id and s.disabled_at is null))
         order by w.id), '[]'::jsonb)
    from public.wa_saude_avisos w
    join public.profiles p on p.id = w.user_id
   where (w.push_status = 'pendente' or w.email_status = 'pendente')
     and w.created_at > now() - interval '3 hours'
$$;

create function private.wa_saude_aviso_mark(p_id bigint, p_canal text, p_status text, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_canal = 'push' and p_status in ('enviado', 'sem_aparelho', 'falhou') then
    update public.wa_saude_avisos set push_status = p_status, reason = coalesce(left(p_reason, 500), reason) where id = p_id;
  elsif p_canal = 'email' and p_status in ('enviado', 'sem_email', 'falhou') then
    update public.wa_saude_avisos set email_status = p_status, reason = coalesce(left(p_reason, 500), reason) where id = p_id;
  else
    raise exception 'Resultado de aviso inválido.' using errcode = '22023';
  end if;
end;
$$;
revoke all on function private.wa_saude_aviso_fila() from public, anon, authenticated;
revoke all on function private.wa_saude_aviso_mark(bigint, text, text, text) from public, anon, authenticated;
grant execute on function private.wa_saude_aviso_fila() to service_role;
grant execute on function private.wa_saude_aviso_mark(bigint, text, text, text) to service_role;

create function public.wa_saude_aviso_fila()
returns jsonb language sql stable set search_path = '' as $$ select private.wa_saude_aviso_fila() $$;
create function public.wa_saude_aviso_mark(p_id bigint, p_canal text, p_status text, p_reason text)
returns void language sql set search_path = '' as $$ select private.wa_saude_aviso_mark(p_id, p_canal, p_status, p_reason) $$;
revoke all on function public.wa_saude_aviso_fila() from public, anon, authenticated;
revoke all on function public.wa_saude_aviso_mark(bigint, text, text, text) from public, anon, authenticated;
grant execute on function public.wa_saude_aviso_fila() to service_role;
grant execute on function public.wa_saude_aviso_mark(bigint, text, text, text) to service_role;
