-- T5.20 (09/11/2026): marcar pessoas (@) nos envios do WhatsApp.
-- O CRM já guarda os NOMES a marcar de cada cliente (ops_envio_padroes.contatos_marcar). O WhatsApp só marca por NÚMERO.
-- Aqui o administrador liga cada nome ao número da pessoa (escolhido na lista do grupo, uma vez) e o envio passa a
-- marcar sozinho: o texto ganha, no fim, "@número" de cada pessoa ligada e o servidor manda a lista `mentioned`.
-- Decisão do Ander (09/11/2026): guardar o número numa tabela protegida (só administrador lê e muda).

create table public.wa_marcacoes (
  id          bigint generated always as identity primary key,
  cliente_id  uuid not null references public.clients (id),
  nome        text not null check (char_length(nome) between 1 and 200),
  numero      text not null check (numero ~ '^[0-9]{10,15}$'),
  created_at  timestamptz not null default now(),
  created_by  uuid references auth.users (id),
  updated_at  timestamptz not null default now(),
  unique (cliente_id, nome)
);
comment on table public.wa_marcacoes is 'T5.20: número do WhatsApp (só dígitos, com DDI) de cada pessoa a marcar (@) nos envios de um cliente, ligado ao nome em ops_envio_padroes.contatos_marcar. Dado pessoal protegido: só administrador lê e muda; nunca vai para log, histórico ou relatório. Guardado até o administrador remover.';
create index wa_marcacoes_cliente_idx on public.wa_marcacoes (cliente_id);

alter table public.wa_marcacoes enable row level security;
revoke all on table public.wa_marcacoes from anon, authenticated;
grant select on table public.wa_marcacoes to authenticated;
create policy "WhatsApp: só administrador lê os números a marcar" on public.wa_marcacoes for select to authenticated
  using (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin' and p.active));

-- Ligar um nome a um número (só administrador). Aceita número com símbolos; 10 ou 11 dígitos viram Brasil (55).
create function private.wa_marcacao_salvar_impl(p_cliente uuid, p_nome text, p_numero text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_dig text := regexp_replace(coalesce(p_numero, ''), '\D', '', 'g');
  v_nome text := btrim(coalesce(p_nome, ''));
begin
  if not exists (select 1 from public.profiles p where p.id = v_uid and p.role = 'admin' and p.active) then
    raise exception 'Só o administrador liga pessoas aos números do WhatsApp.' using errcode = '42501';
  end if;
  if length(v_dig) in (10, 11) then v_dig := '55' || v_dig; end if;
  if v_dig !~ '^[0-9]{12,15}$' then raise exception 'Número inválido.' using errcode = '22023'; end if;
  if v_nome = '' then raise exception 'Informe quem marcar.' using errcode = '22023'; end if;
  if not exists (select 1 from public.ops_envio_padroes p where p.cliente_id = p_cliente and v_nome = any (p.contatos_marcar)) then
    raise exception 'Essa pessoa não está na lista de marcações do cliente.' using errcode = '22023';
  end if;
  insert into public.wa_marcacoes (cliente_id, nome, numero, created_by) values (p_cliente, v_nome, v_dig, v_uid)
  on conflict (cliente_id, nome) do update set numero = excluded.numero, updated_at = now();
  insert into public.audit_logs (actor_id, action, target_type, target_id, details)
  values (v_uid, 'wa.marcacao.salvar', 'cliente', p_cliente, jsonb_build_object('pessoa', v_nome));
end;
$$;

create function private.wa_marcacao_remover_impl(p_cliente uuid, p_nome text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if not exists (select 1 from public.profiles p where p.id = v_uid and p.role = 'admin' and p.active) then
    raise exception 'Só o administrador desliga pessoas dos números do WhatsApp.' using errcode = '42501';
  end if;
  delete from public.wa_marcacoes where cliente_id = p_cliente and nome = btrim(coalesce(p_nome, ''));
  insert into public.audit_logs (actor_id, action, target_type, target_id, details)
  values (v_uid, 'wa.marcacao.remover', 'cliente', p_cliente, jsonb_build_object('pessoa', btrim(coalesce(p_nome, ''))));
end;
$$;
revoke all on function private.wa_marcacao_salvar_impl(uuid, text, text) from public, anon, authenticated;
revoke all on function private.wa_marcacao_remover_impl(uuid, text) from public, anon, authenticated;

create function public.wa_marcacao_salvar(p_cliente uuid, p_nome text, p_numero text)
returns void language sql set search_path = '' as $$ select private.wa_marcacao_salvar_impl(p_cliente, p_nome, p_numero) $$;
create function public.wa_marcacao_remover(p_cliente uuid, p_nome text)
returns void language sql set search_path = '' as $$ select private.wa_marcacao_remover_impl(p_cliente, p_nome) $$;
revoke all on function public.wa_marcacao_salvar(uuid, text, text) from public, anon;
revoke all on function public.wa_marcacao_remover(uuid, text) from public, anon;
grant execute on function public.wa_marcacao_salvar(uuid, text, text) to authenticated;
grant execute on function public.wa_marcacao_remover(uuid, text) to authenticated;

-- Quem marcar num envio a um cliente: os nomes ligados (e não desligados no envio) que já têm número, na ordem da lista.
create function private.wa_marcacoes_do_envio(p_envio uuid, p_cliente uuid)
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(m.numero order by t.n), '{}')
    from public.ops_envio_clientes c
    left join public.ops_envio_padroes p on p.cliente_id = c.cliente_id
    cross join lateral unnest(coalesce(p.contatos_marcar, c.contatos_marcar)) with ordinality t(nome, n)
    join public.wa_marcacoes m on m.cliente_id = c.cliente_id and m.nome = t.nome
   where c.envio_id = p_envio and c.cliente_id = p_cliente and c.removido_em is null
     and not (t.nome = any (coalesce(p.contatos_desligados, c.contatos_desligados, '{}')))
$$;
revoke all on function private.wa_marcacoes_do_envio(uuid, uuid) from public, anon, authenticated;

-- O próximo disparo agora leva as marcações: texto + "@número" no fim e a lista `mentioned` (o servidor repassa ao WhatsApp).
create or replace function private.wa_disparo_proximo()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  d public.wa_disparos;
  e public.ops_envios;
  s public.wa_gateway_settings;
  v_hoje jsonb := private.envio_hoje();
  v_min integer := split_part(v_hoje ->> 'hora', ':', 1)::int * 60 + split_part(v_hoje ->> 'hora', ':', 2)::int;
  v_h integer;
  v_nums text[];
  v_txt text;
begin
  select * into s from public.wa_gateway_settings where id;
  if not s.enabled or s.connection_state <> 'conectado' then return null; end if;
  -- uma mensagem presa em "enviando" por mais de 5 minutos volta para a fila
  update public.wa_disparos set status = 'pendente', atualizado_em = now() where status = 'enviando' and atualizado_em < now() - interval '5 minutes';
  -- limite por dia (Brasília): 60 mensagens
  if (select count(*) from public.wa_disparos x where x.status = 'enviado'
        and x.enviado_em >= (date_trunc('day', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo')) >= 60 then return null; end if;
  -- ritmo: no mínimo 45 segundos entre uma mensagem e outra
  if exists (select 1 from public.wa_disparos x where x.status in ('enviando', 'enviado') and coalesce(x.enviado_em, x.atualizado_em) > now() - interval '45 seconds') then return null; end if;
  loop
    select * into d from public.wa_disparos x where x.status = 'pendente' order by x.created_at, x.id for update skip locked limit 1;
    if d.id is null then return null; end if;
    select * into e from public.ops_envios where id = d.envio_id;
    if e.arquivado_em is not null or not e.ativo then
      perform private.wa_disparo_fechar(d.id, 'pulado', 'Envio arquivado ou pausado.'); continue;
    end if;
    if d.origem = 'automatico' then
      if private.envio_situacao(e.id) ->> 'situacao_hoje' <> 'aprovado' then
        perform private.wa_disparo_fechar(d.id, 'pulado', 'A aprovação da semana não vale mais (envio editado, recusado ou outro dia).'); continue;
      end if;
      v_h := extract(hour from e.horario)::int * 60 + extract(minute from e.horario)::int;
      if v_min >= v_h + 180 then
        perform private.wa_disparo_fechar(d.id, 'pulado', 'Passou do prazo do envio (3 horas depois do horário).'); continue;
      end if;
    end if;
    update public.wa_disparos set status = 'enviando', tentativas = tentativas + 1, atualizado_em = now() where id = d.id;
    v_nums := private.wa_marcacoes_do_envio(d.envio_id, d.cliente_id);
    v_txt := e.mensagem;
    if cardinality(v_nums) > 0 then
      v_txt := v_txt || E'\n\n' || (select string_agg('@' || x, ' ' order by n) from unnest(v_nums) with ordinality t(x, n));
    end if;
    return jsonb_build_object('id', d.id, 'grupo_id', d.grupo_id, 'mensagem', v_txt, 'mentioned', to_jsonb(v_nums), 'tentativa', d.tentativas + 1);
  end loop;
end;
$$;
