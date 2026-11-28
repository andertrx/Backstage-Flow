-- Fase J.3 — Biblioteca de textos do Criador: "pacotes" por cliente com textos, títulos, descrição, link, botão, UTM e mensagens de abordagem.
-- A Esteira de criativos (J.2) usa um pacote para preencher os textos de todos os criativos de uma vez.
-- Nunca apagado: arquivado (com Desfazer). Leitura pelo RLS (quem vê o Criador e o cliente); escrita só pelas funções (permissão "editar").

create table public.builder_copy_sets (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references public.clients (id),
  name        text not null check (char_length(btrim(name)) between 2 and 120),
  bodies      text[] not null default '{}' check (cardinality(bodies) <= 5),
  titles      text[] not null default '{}' check (cardinality(titles) <= 5),
  description text not null default '' check (char_length(description) <= 400),
  link        text not null default '' check (char_length(link) <= 2000),
  cta         text not null default '' check (cta ~ '^[A-Z_]{0,40}$'),
  url_tags    text not null default '' check (char_length(url_tags) <= 500),
  messages    text[] not null default '{}' check (cardinality(messages) <= 10),
  version     integer not null default 1,
  archived_at timestamptz,
  created_by  uuid references auth.users (id) on delete set null,
  updated_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
comment on table public.builder_copy_sets is 'Fase J.3: pacotes de texto do Criador por cliente (textos, títulos, descrição, link, botão, UTM e mensagens de abordagem). Permanente: arquivado, nunca apagado. version evita sobrescrever a mudança de outra pessoa.';
create unique index builder_copy_sets_name_uq on public.builder_copy_sets (client_id, lower(btrim(name))) where archived_at is null;
create index builder_copy_sets_client_idx on public.builder_copy_sets (client_id, updated_at desc);
create index builder_copy_sets_created_by_idx on public.builder_copy_sets (created_by);
create index builder_copy_sets_updated_by_idx on public.builder_copy_sets (updated_by);

alter table public.builder_copy_sets enable row level security;
revoke all on table public.builder_copy_sets from anon, authenticated;
grant select on table public.builder_copy_sets to authenticated;
create policy "Criador: vê os pacotes de texto dos clientes que enxerga" on public.builder_copy_sets for select to authenticated
  using ((select private.builder_pode_ver()) and (select private.can_view_client(client_id)));

-- Lista de textos limpa: só textos, sem vazios, cada um com o tamanho máximo.
create function private.builder_text_list(p jsonb, p_max_items integer, p_max_len integer, p_label text)
returns text[] language plpgsql immutable set search_path = '' as $$
declare v text[] := '{}'; x jsonb;
begin
  if p is null or jsonb_typeof(p) = 'null' then return v; end if;
  if jsonb_typeof(p) <> 'array' then raise exception '% inválidos.', p_label using errcode = '22023'; end if;
  for x in select * from jsonb_array_elements(p) loop
    if jsonb_typeof(x) <> 'string' then raise exception '% inválidos.', p_label using errcode = '22023'; end if;
    if btrim(x #>> '{}') = '' then continue; end if;
    if char_length(x #>> '{}') > p_max_len then raise exception '%: cada um pode ter até % letras.', p_label, p_max_len using errcode = '22023'; end if;
    v := v || (x #>> '{}');
  end loop;
  if cardinality(v) > p_max_items then raise exception '%: até % por pacote.', p_label, p_max_items using errcode = '22023'; end if;
  return v;
end;
$$;
revoke all on function private.builder_text_list(jsonb, integer, integer, text) from public, anon, authenticated;

-- Salvar: sem p_id cria; com p_id edita e confere a versão. p_data: { bodies, titles, description, link, cta, url_tags, messages }.
create function private.builder_copy_set_save_impl(p_id uuid, p_version integer, p_client uuid, p_name text, p_data jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_name text := btrim(coalesce(p_name, ''));
  v jsonb := coalesce(p_data, '{}'::jsonb);
  v_link text := btrim(coalesce(v ->> 'link', ''));
  v_tags text := btrim(coalesce(v ->> 'url_tags', ''));
  v_cta text := coalesce(v ->> 'cta', '');
  s public.builder_copy_sets;
begin
  if not private.builder_can('edit') then raise exception 'Você não tem permissão para editar a biblioteca de textos.' using errcode = '42501'; end if;
  if char_length(v_name) < 2 or char_length(v_name) > 120 then raise exception 'Dê um nome ao pacote (2 a 120 letras).' using errcode = '22023'; end if;
  if jsonb_typeof(v) <> 'object' then raise exception 'Dados do pacote inválidos.' using errcode = '22023'; end if;
  if v_link <> '' and v_link !~ '^https://' then raise exception 'O link precisa começar com https://.' using errcode = '22023'; end if;
  if v_cta !~ '^[A-Z_]{0,40}$' then raise exception 'Botão inválido.' using errcode = '22023'; end if;
  if char_length(v_tags) > 500 or v_tags ~ '\s' or v_tags like '?%' then raise exception 'Parâmetros de rastreio inválidos (sem espaços e sem ? no começo).' using errcode = '22023'; end if;
  if char_length(coalesce(v ->> 'description', '')) > 400 then raise exception 'A descrição pode ter até 400 letras.' using errcode = '22023'; end if;
  perform private.ads_builder_sem_segredo(v::text || ' ' || v_name);

  if p_id is null then
    if p_client is null or not private.can_edit_client(p_client) then raise exception 'Você não tem acesso a este cliente.' using errcode = '42501'; end if;
  else
    select * into s from public.builder_copy_sets where id = p_id and archived_at is null for update;
    if s.id is null then raise exception 'Pacote não encontrado.' using errcode = '22023'; end if;
    if not private.can_edit_client(s.client_id) then raise exception 'Você não tem acesso a este cliente.' using errcode = '42501'; end if;
    if p_version is distinct from s.version then raise exception 'Outra pessoa alterou este pacote. Recarregue antes de salvar.' using errcode = '40001'; end if;
  end if;
  if exists (select 1 from public.builder_copy_sets x where x.client_id = coalesce(s.client_id, p_client) and x.archived_at is null
              and lower(btrim(x.name)) = lower(v_name) and x.id is distinct from p_id) then
    raise exception 'Já existe um pacote com esse nome para este cliente.' using errcode = '22023';
  end if;

  if p_id is null then
    insert into public.builder_copy_sets (client_id, name, bodies, titles, description, link, cta, url_tags, messages, created_by, updated_by)
    values (p_client, v_name,
      private.builder_text_list(v -> 'bodies', 5, 2000, 'Textos'), private.builder_text_list(v -> 'titles', 5, 255, 'Títulos'),
      coalesce(v ->> 'description', ''), v_link, v_cta, v_tags, private.builder_text_list(v -> 'messages', 10, 1000, 'Mensagens de abordagem'),
      (select auth.uid()), (select auth.uid()))
    returning * into s;
    insert into public.audit_logs (actor_id, action, target_type, target_id, details)
    values ((select auth.uid()), 'builder.pacote.criar', 'builder_copy_set', s.id::text, jsonb_build_object('name', v_name, 'client_id', p_client));
  else
    update public.builder_copy_sets set name = v_name,
      bodies = private.builder_text_list(v -> 'bodies', 5, 2000, 'Textos'), titles = private.builder_text_list(v -> 'titles', 5, 255, 'Títulos'),
      description = coalesce(v ->> 'description', ''), link = v_link, cta = v_cta, url_tags = v_tags,
      messages = private.builder_text_list(v -> 'messages', 10, 1000, 'Mensagens de abordagem'),
      version = version + 1, updated_by = (select auth.uid()), updated_at = now()
     where id = s.id returning * into s;
    insert into public.audit_logs (actor_id, action, target_type, target_id, details)
    values ((select auth.uid()), 'builder.pacote.editar', 'builder_copy_set', s.id::text, jsonb_build_object('name', v_name, 'version', s.version));
  end if;
  return jsonb_build_object('id', s.id, 'version', s.version, 'updated_at', s.updated_at);
end;
$$;

-- Arquivar e desfazer (nunca apaga).
create function private.builder_copy_set_archive_impl(p_id uuid, p_archive boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare s public.builder_copy_sets;
begin
  if not private.builder_can('edit') then raise exception 'Você não tem permissão para editar a biblioteca de textos.' using errcode = '42501'; end if;
  select * into s from public.builder_copy_sets where id = p_id for update;
  if s.id is null or not private.can_edit_client(s.client_id) then raise exception 'Pacote não encontrado.' using errcode = '22023'; end if;
  if p_archive and s.archived_at is not null then raise exception 'O pacote já está arquivado.' using errcode = '22023'; end if;
  if not p_archive then
    if s.archived_at is null then raise exception 'O pacote já está ativo.' using errcode = '22023'; end if;
    if exists (select 1 from public.builder_copy_sets x where x.client_id = s.client_id and x.archived_at is null and lower(btrim(x.name)) = lower(btrim(s.name))) then
      raise exception 'Já existe outro pacote ativo com esse nome. Renomeie um deles.' using errcode = '22023';
    end if;
  end if;
  update public.builder_copy_sets set archived_at = case when p_archive then now() else null end, updated_by = (select auth.uid()), updated_at = now() where id = s.id;
  insert into public.audit_logs (actor_id, action, target_type, target_id, details)
  values ((select auth.uid()), case when p_archive then 'builder.pacote.arquivar' else 'builder.pacote.desarquivar' end, 'builder_copy_set', s.id::text, jsonb_build_object('name', s.name));
end;
$$;

revoke all on function private.builder_copy_set_save_impl(uuid, integer, uuid, text, jsonb), private.builder_copy_set_archive_impl(uuid, boolean) from public, anon;
grant execute on function private.builder_copy_set_save_impl(uuid, integer, uuid, text, jsonb), private.builder_copy_set_archive_impl(uuid, boolean) to authenticated;

create function public.builder_copy_set_save(p_id uuid, p_version integer, p_client uuid, p_name text, p_data jsonb)
returns jsonb language sql set search_path = '' as $$ select private.builder_copy_set_save_impl(p_id, p_version, p_client, p_name, p_data) $$;
create function public.builder_copy_set_archive(p_id uuid, p_archive boolean)
returns void language sql set search_path = '' as $$ select private.builder_copy_set_archive_impl(p_id, p_archive) $$;
revoke all on function public.builder_copy_set_save(uuid, integer, uuid, text, jsonb), public.builder_copy_set_archive(uuid, boolean) from public, anon;
grant execute on function public.builder_copy_set_save(uuid, integer, uuid, text, jsonb), public.builder_copy_set_archive(uuid, boolean) to authenticated;
