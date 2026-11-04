-- Aviso para aprovar o envio semanal (pedido do Ander, 04/11/2026).
-- Antes, o pedido de aprovação só aparecia como pop-up com o CRM aberto (das 7h até o horário). Terça (03/11) ele não
-- estava com o CRM aberto, nada o avisou e a semana fechou "sem resposta".
-- Agora, no dia do envio e enquanto não houver decisão, o CRM avisa por 3 caminhos, em 3 momentos:
--   caminhos: sino do CRM, notificação no aparelho (Web Push) e e-mail;
--   momentos: abertura da janela (7h; envio até 7h: 1h antes), 30 minutos antes e 10 minutos antes do horário.
-- Quem recebe: administradores e quem tem a permissão "Envios semanais". Quem desligou o tipo "Aprovar o envio semanal"
-- em Notificações não recebe nenhum dos 3. Nada é apagado.

-- ---------------------------------------------------------------- Novo tipo de aviso no sino
alter table public.ops_notifications drop constraint ops_notifications_kind_check;
alter table public.ops_notifications add constraint ops_notifications_kind_check check (kind = any (array[
  'tarefa.atribuida', 'tarefa.mencao', 'tarefa.comentario', 'tarefa.concluida', 'tarefa.prazo', 'tarefa.atrasada',
  'reuniao.convite', 'reuniao.hoje', 'reuniao.item', 'cliente.am', 'lead.responsavel', 'envio.aprovar']));

create or replace function private.ops_notification_prefs_save_impl(p_muted text[])
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_kinds text[] := array['tarefa.atribuida', 'tarefa.mencao', 'tarefa.comentario', 'tarefa.concluida', 'tarefa.prazo', 'tarefa.atrasada',
                          'reuniao.convite', 'reuniao.hoje', 'reuniao.item', 'cliente.am', 'lead.responsavel', 'envio.aprovar'];
begin
  perform private.ops_need('ops.access');
  if exists (select 1 from unnest(coalesce(p_muted, '{}')) k where k <> all (v_kinds)) then
    raise exception 'Tipo de notificação desconhecido.' using errcode = '22023';
  end if;
  insert into public.ops_notification_prefs (user_id, muted, updated_at)
  values ((select auth.uid()), array(select distinct k from unnest(coalesce(p_muted, '{}')) k order by 1), now())
  on conflict (user_id) do update set muted = excluded.muted, updated_at = now();
end;
$$;

-- ---------------------------------------------------------------- Registro dos avisos (um por envio, semana, momento e pessoa)
create table public.ops_envio_avisos (
  id           bigint generated always as identity primary key,
  envio_id     uuid not null references public.ops_envios (id),
  semana       date not null,
  momento      text not null check (momento in ('inicio', 'meio', 'fim')),
  user_id      uuid not null references auth.users (id),
  created_at   timestamptz not null default now(),
  push_status  text not null default 'pendente' check (push_status in ('pendente', 'enviado', 'sem_aparelho', 'falhou')),
  email_status text not null default 'pendente' check (email_status in ('pendente', 'enviado', 'sem_email', 'falhou')),
  reason       text check (char_length(reason) <= 500),
  unique (envio_id, semana, momento, user_id)
);
comment on table public.ops_envio_avisos is 'Aviso para aprovar o envio semanal: um registro por envio, semana, momento (inicio/meio/fim) e pessoa, com o resultado do aviso no aparelho e por e-mail. Permanente (poucos registros por semana).';
create index ops_envio_avisos_semana_idx on public.ops_envio_avisos (semana desc, envio_id);
create index ops_envio_avisos_pendentes_idx on public.ops_envio_avisos (created_at) where push_status = 'pendente' or email_status = 'pendente';
create index ops_envio_avisos_user_idx on public.ops_envio_avisos (user_id);

alter table public.ops_envio_avisos enable row level security;
revoke all on table public.ops_envio_avisos from anon, authenticated;
grant select on table public.ops_envio_avisos to authenticated;
create policy "Envios semanais: quem tem a permissão vê os avisos" on public.ops_envio_avisos for select to authenticated
  using ((select private.ops_can('ops.envios')));

-- Quem recebe: reaproveita private.ops_user_can(usuário, permissão) (administrador ou membro ativo com a permissão).

-- ---------------------------------------------------------------- Gerar os avisos (agendador, a cada 5 minutos)
create function private.envio_avisar()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  e record;
  u record;
  v_hoje jsonb := private.envio_hoje();
  v_semana date := (v_hoje ->> 'semana')::date;
  v_now integer := split_part(v_hoje ->> 'hora', ':', 1)::int * 60 + split_part(v_hoje ->> 'hora', ':', 2)::int;
  v_h integer;
  v_ini integer;
  v_mom text;
  v_id bigint;
  v_grupos integer;
  v_n integer := 0;
begin
  for e in select x.* from public.ops_envios x where private.envio_situacao(x.id) ->> 'situacao_hoje' = 'aguardando_aprovacao' loop
    v_h := extract(hour from e.horario)::int * 60 + extract(minute from e.horario)::int;
    v_ini := case when v_h <= 420 then greatest(v_h - 60, 0) else 420 end;   -- 7h; envio até 7h: 1h antes
    continue when v_now < v_ini;
    v_mom := case when v_now >= v_h - 10 then 'fim' when v_now >= v_h - 30 then 'meio' else 'inicio' end;
    select count(*) into v_grupos from public.ops_envio_clientes c where c.envio_id = e.id and c.ativo and c.removido_em is null;
    for u in select p.id from public.profiles p
              where p.active and private.ops_user_can(p.id, 'ops.envios')
                and not exists (select 1 from public.ops_notification_prefs f where f.user_id = p.id and 'envio.aprovar' = any (f.muted)) loop
      v_id := null;
      insert into public.ops_envio_avisos (envio_id, semana, momento, user_id) values (e.id, v_semana, v_mom, u.id)
      on conflict do nothing returning id into v_id;
      if v_id is null then continue; end if;
      v_n := v_n + 1;
      perform private.ops_notify(u.id, 'envio.aprovar',
        case v_mom when 'fim' then 'Última chamada: aprove o envio de hoje até ' else 'Aprove o envio de hoje até ' end || to_char(e.horario, 'HH24:MI'),
        e.codigo || ' · ' || e.nome || ' · ' || v_grupos || ' grupo(s). Sem a sua aprovação até as ' || to_char(e.horario, 'HH24:MI') || ' o envio não sai.',
        '/operacoes/envios', 'envio-aprovar:' || e.id || ':' || v_semana || ':' || v_mom);
    end loop;
  end loop;
  return v_n;
end;
$$;
revoke all on function private.envio_avisar() from public, anon, authenticated;

-- ---------------------------------------------------------------- Fila para o servidor (aparelho e e-mail)
create function private.ops_envio_aviso_fila()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', a.id, 'momento', a.momento, 'nome', e.nome, 'codigo', e.codigo, 'horario', to_char(e.horario, 'HH24:MI'),
           'grupos', (select count(*) from public.ops_envio_clientes c where c.envio_id = e.id and c.ativo and c.removido_em is null),
           'push_pendente', a.push_status = 'pendente', 'email_pendente', a.email_status = 'pendente',
           'email', p.email, 'nome_pessoa', p.full_name,
           'subscriptions', (select jsonb_agg(jsonb_build_object('id', s.id, 'endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth))
                               from public.ops_push_subscriptions s where s.user_id = a.user_id and s.disabled_at is null))
         order by a.id), '[]'::jsonb)
    from public.ops_envio_avisos a
    join public.ops_envios e on e.id = a.envio_id
    join public.profiles p on p.id = a.user_id
   where (a.push_status = 'pendente' or a.email_status = 'pendente')
     and a.created_at > now() - interval '3 hours'
$$;
revoke all on function private.ops_envio_aviso_fila() from public, anon, authenticated;
grant execute on function private.ops_envio_aviso_fila() to service_role;

create function private.ops_envio_aviso_mark(p_id bigint, p_canal text, p_status text, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_canal = 'push' and p_status in ('enviado', 'sem_aparelho', 'falhou') then
    update public.ops_envio_avisos set push_status = p_status, reason = coalesce(left(p_reason, 500), reason) where id = p_id;
  elsif p_canal = 'email' and p_status in ('enviado', 'sem_email', 'falhou') then
    update public.ops_envio_avisos set email_status = p_status, reason = coalesce(left(p_reason, 500), reason) where id = p_id;
  else
    raise exception 'Resultado de aviso inválido.' using errcode = '22023';
  end if;
end;
$$;
revoke all on function private.ops_envio_aviso_mark(bigint, text, text, text) from public, anon, authenticated;
grant execute on function private.ops_envio_aviso_mark(bigint, text, text, text) to service_role;

create function public.ops_envio_aviso_fila()
returns jsonb language sql stable set search_path = '' as $$ select private.ops_envio_aviso_fila() $$;
create function public.ops_envio_aviso_mark(p_id bigint, p_canal text, p_status text, p_reason text)
returns void language sql set search_path = '' as $$ select private.ops_envio_aviso_mark(p_id, p_canal, p_status, p_reason) $$;
revoke all on function public.ops_envio_aviso_fila() from public, anon, authenticated;
revoke all on function public.ops_envio_aviso_mark(bigint, text, text, text) from public, anon, authenticated;
grant execute on function public.ops_envio_aviso_fila() to service_role;
grant execute on function public.ops_envio_aviso_mark(bigint, text, text, text) to service_role;

-- ---------------------------------------------------------------- Agendador: a cada 5 minutos gera os avisos e chama o servidor se houver fila
create function private.trigger_envio_avisos()
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
  if not exists (select 1 from public.ops_envio_avisos a where (a.push_status = 'pendente' or a.email_status = 'pendente') and a.created_at > now() - interval '3 hours') then return; end if;
  perform net.http_post(
    url := v_url || '/envio-aviso',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', v_secret),
    body := jsonb_build_object('action', 'send'),
    timeout_milliseconds := 60000
  );
end;
$$;
revoke all on function private.trigger_envio_avisos() from public, anon, authenticated;
select cron.schedule('envio-avisos', '*/5 * * * *', $cron$select private.trigger_envio_avisos()$cron$);
