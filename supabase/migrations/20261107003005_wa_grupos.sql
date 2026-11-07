-- Etapa 44.2 (07/11/2026) — liga o grupo do WhatsApp de cada cliente (para o envio automático da 44.3).
-- O CRM guarda o identificador do grupo (termina em @g.us; NÃO é telefone) e o nome do grupo como estava ao ligar.
-- Cada cliente tem no máximo UM grupo ligado, e cada grupo serve a UM cliente só (evita mandar o envio de um cliente para o grupo de outro).
-- Desligar não apaga: o registro fica com a data (histórico permanente).

create table public.wa_grupos (
  id               uuid primary key default gen_random_uuid(),
  cliente_id       uuid not null references public.clients (id),
  grupo_id         text not null check (grupo_id ~ '^[0-9A-Za-z._-]{5,60}@g\.us$'),
  grupo_nome       text check (char_length(grupo_nome) <= 200),
  criado_por       uuid references auth.users (id),
  created_at       timestamptz not null default now(),
  desvinculado_em  timestamptz,
  desvinculado_por uuid references auth.users (id)
);
comment on table public.wa_grupos is 'Etapa 44.2: grupo do WhatsApp ligado a cada cliente (identificador @g.us, não é telefone). Um grupo ativo por cliente e um cliente por grupo. Desligar guarda a data; nada é apagado.';
create unique index wa_grupos_cliente_ativo_uk on public.wa_grupos (cliente_id) where desvinculado_em is null;
create unique index wa_grupos_grupo_ativo_uk on public.wa_grupos (grupo_id) where desvinculado_em is null;
create index wa_grupos_criado_por_idx on public.wa_grupos (criado_por);
create index wa_grupos_desvinculado_por_idx on public.wa_grupos (desvinculado_por);

alter table public.wa_grupos enable row level security;
revoke all on public.wa_grupos from anon, authenticated;
grant select on public.wa_grupos to authenticated;
create policy "Envios semanais: quem tem a permissão vê os grupos ligados" on public.wa_grupos for select to authenticated
  using ((select private.ops_can('ops.envios')));

create function private.wa_grupo_vincular_impl(p_cliente uuid, p_grupo_id text, p_grupo_nome text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_grupo text := trim(coalesce(p_grupo_id, ''));
  v_outro text;
  v_id uuid;
begin
  perform private.ops_need('ops.envios');
  if not exists (select 1 from public.clients c where c.id = p_cliente and c.excluded_at is null) then
    raise exception 'Cliente não encontrado.' using errcode = '22023';
  end if;
  if v_grupo !~ '^[0-9A-Za-z._-]{5,60}@g\.us$' then
    raise exception 'Identificador de grupo inválido. Escolha o grupo na lista do WhatsApp.' using errcode = '22023';
  end if;
  select c.name into v_outro from public.wa_grupos g join public.clients c on c.id = g.cliente_id
   where g.grupo_id = v_grupo and g.desvinculado_em is null and g.cliente_id <> p_cliente;
  if v_outro is not null then
    raise exception 'Este grupo já está ligado a outro cliente (%). Desligue lá primeiro.', v_outro using errcode = '22023';
  end if;
  -- mesmo grupo já ligado a este cliente: nada a fazer
  select g.id into v_id from public.wa_grupos g where g.cliente_id = p_cliente and g.grupo_id = v_grupo and g.desvinculado_em is null;
  if v_id is not null then
    update public.wa_grupos set grupo_nome = left(p_grupo_nome, 200) where id = v_id;
    return v_id;
  end if;
  update public.wa_grupos set desvinculado_em = now(), desvinculado_por = (select auth.uid())
   where cliente_id = p_cliente and desvinculado_em is null;
  insert into public.wa_grupos (cliente_id, grupo_id, grupo_nome, criado_por)
  values (p_cliente, v_grupo, left(p_grupo_nome, 200), (select auth.uid())) returning id into v_id;
  insert into public.audit_logs (actor_id, action, target_type, target_id, details)
  values ((select auth.uid()), 'wa_grupo.vincular', 'client', p_cliente::text, jsonb_build_object('grupo_nome', left(p_grupo_nome, 200)));
  return v_id;
end;
$$;
revoke all on function private.wa_grupo_vincular_impl(uuid, text, text) from public, anon;
grant execute on function private.wa_grupo_vincular_impl(uuid, text, text) to authenticated;

create function private.wa_grupo_desvincular_impl(p_cliente uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.ops_need('ops.envios');
  update public.wa_grupos set desvinculado_em = now(), desvinculado_por = (select auth.uid())
   where cliente_id = p_cliente and desvinculado_em is null;
  if found then
    insert into public.audit_logs (actor_id, action, target_type, target_id, details)
    values ((select auth.uid()), 'wa_grupo.desvincular', 'client', p_cliente::text, '{}'::jsonb);
  end if;
end;
$$;
revoke all on function private.wa_grupo_desvincular_impl(uuid) from public, anon;
grant execute on function private.wa_grupo_desvincular_impl(uuid) to authenticated;

create function public.wa_grupo_vincular(p_cliente uuid, p_grupo_id text, p_grupo_nome text default null)
returns uuid language sql set search_path = '' as $$ select private.wa_grupo_vincular_impl(p_cliente, p_grupo_id, p_grupo_nome) $$;
create function public.wa_grupo_desvincular(p_cliente uuid)
returns void language sql set search_path = '' as $$ select private.wa_grupo_desvincular_impl(p_cliente) $$;
revoke all on function public.wa_grupo_vincular(uuid, text, text) from public, anon;
revoke all on function public.wa_grupo_desvincular(uuid) from public, anon;
grant execute on function public.wa_grupo_vincular(uuid, text, text) to authenticated;
grant execute on function public.wa_grupo_desvincular(uuid) to authenticated;
