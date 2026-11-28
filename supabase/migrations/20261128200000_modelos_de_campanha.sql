-- Fase J.5 — Modelos de campanha do Criador: a estrutura de uma campanha (objetivo, orçamento, conjuntos, públicos genéricos, textos)
-- guardada para usar em qualquer conta. O que é de UMA conta (página, Instagram, pixel, públicos personalizados, arquivos) fica de fora.
-- Nunca apagado: arquivado (com Desfazer). Leitura: quem vê o Criador. Escrita: quem pode CRIAR rascunhos.

create table public.builder_templates (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(btrim(name)) between 2 and 120),
  description text not null default '' check (char_length(description) <= 500),
  objective   text not null default '' check (objective ~ '^[A-Z_]{0,40}$'),
  source      text not null default 'rascunho' check (source in ('rascunho', 'meta')),
  data        jsonb not null default '{}'::jsonb check (jsonb_typeof(data) = 'object' and pg_column_size(data) <= 200000),
  version     integer not null default 1,
  archived_at timestamptz,
  created_by  uuid references auth.users (id) on delete set null,
  updated_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
comment on table public.builder_templates is 'Fase J.5: modelos de campanha do Criador (estrutura sem página, pixel, públicos ou arquivos de uma conta). Permanente: arquivado, nunca apagado.';
create unique index builder_templates_name_uq on public.builder_templates (lower(btrim(name))) where archived_at is null;
create index builder_templates_objective_idx on public.builder_templates (objective, name) where archived_at is null;
create index builder_templates_created_by_idx on public.builder_templates (created_by);
create index builder_templates_updated_by_idx on public.builder_templates (updated_by);

alter table public.builder_templates enable row level security;
revoke all on table public.builder_templates from anon, authenticated;
grant select on table public.builder_templates to authenticated;
create policy "Criador: vê os modelos de campanha" on public.builder_templates for select to authenticated
  using ((select private.builder_pode_ver()));

create function private.builder_template_save_impl(p_id uuid, p_version integer, p_name text, p_description text, p_source text, p_data jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_name text := btrim(coalesce(p_name, ''));
  v_desc text := btrim(coalesce(p_description, ''));
  v_data jsonb := coalesce(p_data, '{}'::jsonb);
  v_obj text := coalesce(v_data #>> '{campaign,objective}', '');
  t public.builder_templates;
begin
  if not private.builder_can('create') then raise exception 'Você não tem permissão para criar modelos de campanha.' using errcode = '42501'; end if;
  if char_length(v_name) < 2 or char_length(v_name) > 120 then raise exception 'Dê um nome ao modelo (2 a 120 letras).' using errcode = '22023'; end if;
  if char_length(v_desc) > 500 then raise exception 'A descrição pode ter até 500 letras.' using errcode = '22023'; end if;
  if jsonb_typeof(v_data) <> 'object' or pg_column_size(v_data) > 200000 then raise exception 'Dados do modelo inválidos.' using errcode = '22023'; end if;
  if v_obj !~ '^[A-Z_]{0,40}$' then v_obj := ''; end if;
  perform private.ads_builder_sem_segredo(v_data::text || ' ' || v_name || ' ' || v_desc);
  if p_id is not null then
    select * into t from public.builder_templates where id = p_id and archived_at is null for update;
    if t.id is null then raise exception 'Modelo não encontrado.' using errcode = '22023'; end if;
    if p_version is distinct from t.version then raise exception 'Outra pessoa alterou este modelo. Recarregue antes de salvar.' using errcode = '40001'; end if;
  end if;
  if exists (select 1 from public.builder_templates x where x.archived_at is null and lower(btrim(x.name)) = lower(v_name) and x.id is distinct from p_id) then
    raise exception 'Já existe um modelo com esse nome.' using errcode = '22023';
  end if;
  if p_id is null then
    insert into public.builder_templates (name, description, objective, source, data, created_by, updated_by)
    values (v_name, v_desc, v_obj, case when p_source = 'meta' then 'meta' else 'rascunho' end, v_data, (select auth.uid()), (select auth.uid()))
    returning * into t;
    insert into public.audit_logs (actor_id, action, target_type, target_id, details)
    values ((select auth.uid()), 'builder.modelo.criar', 'builder_template', t.id::text, jsonb_build_object('name', v_name, 'source', t.source));
  else
    update public.builder_templates set name = v_name, description = v_desc, objective = v_obj, data = v_data, version = version + 1,
      updated_by = (select auth.uid()), updated_at = now() where id = t.id returning * into t;
    insert into public.audit_logs (actor_id, action, target_type, target_id, details)
    values ((select auth.uid()), 'builder.modelo.editar', 'builder_template', t.id::text, jsonb_build_object('name', v_name, 'version', t.version));
  end if;
  return jsonb_build_object('id', t.id, 'version', t.version);
end;
$$;

create function private.builder_template_archive_impl(p_id uuid, p_archive boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare t public.builder_templates;
begin
  if not private.builder_can('create') then raise exception 'Você não tem permissão para mexer nos modelos de campanha.' using errcode = '42501'; end if;
  select * into t from public.builder_templates where id = p_id for update;
  if t.id is null then raise exception 'Modelo não encontrado.' using errcode = '22023'; end if;
  if p_archive and t.archived_at is not null then raise exception 'O modelo já está arquivado.' using errcode = '22023'; end if;
  if not p_archive then
    if t.archived_at is null then raise exception 'O modelo já está ativo.' using errcode = '22023'; end if;
    if exists (select 1 from public.builder_templates x where x.archived_at is null and lower(btrim(x.name)) = lower(btrim(t.name))) then
      raise exception 'Já existe outro modelo ativo com esse nome. Renomeie um deles.' using errcode = '22023';
    end if;
  end if;
  update public.builder_templates set archived_at = case when p_archive then now() else null end, updated_by = (select auth.uid()), updated_at = now() where id = t.id;
  insert into public.audit_logs (actor_id, action, target_type, target_id, details)
  values ((select auth.uid()), case when p_archive then 'builder.modelo.arquivar' else 'builder.modelo.desarquivar' end, 'builder_template', t.id::text, jsonb_build_object('name', t.name));
end;
$$;

revoke all on function private.builder_template_save_impl(uuid, integer, text, text, text, jsonb), private.builder_template_archive_impl(uuid, boolean) from public, anon;
grant execute on function private.builder_template_save_impl(uuid, integer, text, text, text, jsonb), private.builder_template_archive_impl(uuid, boolean) to authenticated;
create function public.builder_template_save(p_id uuid, p_version integer, p_name text, p_description text, p_source text, p_data jsonb)
returns jsonb language sql set search_path = '' as $$ select private.builder_template_save_impl(p_id, p_version, p_name, p_description, p_source, p_data) $$;
create function public.builder_template_archive(p_id uuid, p_archive boolean)
returns void language sql set search_path = '' as $$ select private.builder_template_archive_impl(p_id, p_archive) $$;
revoke all on function public.builder_template_save(uuid, integer, text, text, text, jsonb), public.builder_template_archive(uuid, boolean) from public, anon;
grant execute on function public.builder_template_save(uuid, integer, text, text, text, jsonb), public.builder_template_archive(uuid, boolean) to authenticated;
