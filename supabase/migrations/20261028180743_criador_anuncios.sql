-- Etapa 42 — Criador de Anúncios. A página só monta um PEDIDO em texto para colar no Claude (que cria os anúncios no Meta).
-- O CRM não fala com o Meta aqui. Guarda os modelos (da equipe) e o histórico dos pedidos gerados.
-- Quem usa: administrador, gestor e operador. Nada de senha, token ou cartão em nenhum campo (recusado aqui e na tela).
-- "tipo" deixa a estrutura pronta para, no futuro, pedir também campanhas e conjuntos.

-- -----------------------------------------------------------------------------
-- Tabelas
-- -----------------------------------------------------------------------------
create table public.ads_builder_modelos (
  id             uuid primary key default gen_random_uuid(),
  nome           text not null check (char_length(btrim(nome)) between 2 and 120),
  dados          jsonb not null check (jsonb_typeof(dados) = 'object' and pg_column_size(dados) <= 200000),
  criado_por     uuid,
  atualizado_por uuid,
  arquivado_em   timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
comment on table public.ads_builder_modelos is 'Etapa 42: modelos do Criador de Anúncios (dados do formulário), da equipe. Nunca apagado: arquivado_em.';
create unique index ads_builder_modelos_nome_key on public.ads_builder_modelos (lower(btrim(nome))) where arquivado_em is null;

create table public.ads_builder_pedidos (
  id               bigint generated always as identity primary key,
  tipo             text not null default 'anuncios' check (tipo in ('anuncios')),
  conta            text not null check (char_length(conta) between 1 and 300),
  campanha         text not null check (char_length(campanha) between 1 and 300),
  conjunto         text not null check (char_length(conjunto) between 1 and 300),
  dados            jsonb not null check (jsonb_typeof(dados) = 'object' and pg_column_size(dados) <= 200000),
  texto            text not null check (char_length(texto) between 1 and 60000),
  origem_pedido_id bigint references public.ads_builder_pedidos (id),
  criado_por       uuid,
  created_at       timestamptz not null default now()
);
comment on table public.ads_builder_pedidos is 'Etapa 42: histórico permanente dos pedidos gerados no Criador de Anúncios (texto copiado para o Claude e os dados do formulário). origem_pedido_id = duplicado de outro pedido.';
create index ads_builder_pedidos_quando_idx on public.ads_builder_pedidos (created_at desc);

alter table public.ads_builder_modelos enable row level security;
alter table public.ads_builder_pedidos enable row level security;
revoke all on table public.ads_builder_modelos, public.ads_builder_pedidos from anon, authenticated;
grant select on table public.ads_builder_modelos, public.ads_builder_pedidos to authenticated;

-- Quem pode: administrador, gestor e operador ativos
create function private.ads_builder_pode()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(private.current_user_role()::text in ('admin', 'gestor', 'operador'), false)
$$;
revoke all on function private.ads_builder_pode() from public, anon;
grant execute on function private.ads_builder_pode() to authenticated;

create policy "Criador de Anúncios: equipe de anúncios vê os modelos" on public.ads_builder_modelos for select to authenticated
  using ((select private.ads_builder_pode()));
create policy "Criador de Anúncios: equipe de anúncios vê os pedidos" on public.ads_builder_pedidos for select to authenticated
  using ((select private.ads_builder_pode()));

-- -----------------------------------------------------------------------------
-- Nada de senha, token ou cartão
-- -----------------------------------------------------------------------------
create function private.ads_builder_luhn(p_digits text)
returns boolean language plpgsql immutable set search_path = '' as $$
declare v_sum int := 0; v_n int; i int; v_len int := char_length(p_digits);
begin
  for i in 0 .. v_len - 1 loop
    v_n := substr(p_digits, v_len - i, 1)::int;
    if i % 2 = 1 then v_n := v_n * 2; if v_n > 9 then v_n := v_n - 9; end if; end if;
    v_sum := v_sum + v_n;
  end loop;
  return v_sum % 10 = 0;
end;
$$;

create function private.ads_builder_sem_segredo(p_text text)
returns void language plpgsql immutable set search_path = '' as $$
declare m text[];
begin
  if p_text ~ '(^|[^A-Za-z0-9])EAA[A-Za-z0-9]{20,}'
     or p_text ~ 'eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}'
     or p_text ~ '(sk|pk|rk)_(live|test)_[A-Za-z0-9]{10,}|sk-[A-Za-z0-9_-]{20,}|ya29\.[A-Za-z0-9_-]{20,}|AIza[A-Za-z0-9_-]{30,}'
     or p_text ~* '(senha|password|passwd|token|secret|client_secret|api[_-]?key)\s*[:=]\s*\S{4,}' then
    raise exception 'Parece que há uma senha, token ou chave num dos campos. Não coloque senhas, tokens nem dados de pagamento.' using errcode = '22023';
  end if;
  for m in select regexp_matches(p_text, '(?:\d[ .-]?){15,19}', 'g') loop
    if char_length(regexp_replace(m[1], '\D', '', 'g')) between 15 and 19 and private.ads_builder_luhn(regexp_replace(m[1], '\D', '', 'g')) then
      raise exception 'Parece que há um número de cartão num dos campos. Não coloque dados de pagamento.' using errcode = '22023';
    end if;
  end loop;
end;
$$;
revoke all on function private.ads_builder_luhn(text), private.ads_builder_sem_segredo(text) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Modelos
-- -----------------------------------------------------------------------------
create function private.ads_builder_modelos_impl()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.ads_builder_pode() then raise exception 'Sem permissão para o Criador de Anúncios.' using errcode = '42501'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'nome', m.nome, 'dados', m.dados, 'updated_at', m.updated_at,
            'atualizado_por_nome', p.full_name) order by lower(m.nome)), '[]')
            from public.ads_builder_modelos m left join public.profiles p on p.id = m.atualizado_por
           where m.arquivado_em is null);
end;
$$;

-- Salvar: sem p_id, um modelo com o mesmo nome é substituído (a tela pergunta antes).
create function private.ads_builder_modelo_save_impl(p_id uuid, p_nome text, p_dados jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_nome text := btrim(coalesce(p_nome, '')); v_id uuid := p_id;
begin
  if not private.ads_builder_pode() then raise exception 'Sem permissão para o Criador de Anúncios.' using errcode = '42501'; end if;
  if char_length(v_nome) < 2 or char_length(v_nome) > 120 then raise exception 'Dê um nome ao modelo (2 a 120 letras).' using errcode = '22023'; end if;
  if p_dados is null or jsonb_typeof(p_dados) <> 'object' then raise exception 'Dados do modelo inválidos.' using errcode = '22023'; end if;
  if pg_column_size(p_dados) > 200000 then raise exception 'Modelo grande demais.' using errcode = '22023'; end if;
  perform private.ads_builder_sem_segredo(p_dados::text || ' ' || v_nome);
  if v_id is null then
    select id into v_id from public.ads_builder_modelos where arquivado_em is null and lower(btrim(nome)) = lower(v_nome);
  end if;
  if v_id is null then
    insert into public.ads_builder_modelos (nome, dados, criado_por, atualizado_por) values (v_nome, p_dados, (select auth.uid()), (select auth.uid()))
    returning id into v_id;
  else
    update public.ads_builder_modelos set nome = v_nome, dados = p_dados, atualizado_por = (select auth.uid()), updated_at = now()
     where id = v_id and arquivado_em is null;
    if not found then raise exception 'Modelo não encontrado.' using errcode = '22023'; end if;
  end if;
  insert into public.audit_logs (actor_id, action, target_type, target_id, details)
  values ((select auth.uid()), 'ads_builder.modelo.save', 'ads_builder_modelo', v_id::text, jsonb_build_object('nome', v_nome));
  return v_id;
end;
$$;

create function private.ads_builder_modelo_archive_impl(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_nome text;
begin
  if not private.ads_builder_pode() then raise exception 'Sem permissão para o Criador de Anúncios.' using errcode = '42501'; end if;
  update public.ads_builder_modelos set arquivado_em = now(), atualizado_por = (select auth.uid()), updated_at = now()
   where id = p_id and arquivado_em is null returning nome into v_nome;
  if v_nome is null then raise exception 'Modelo não encontrado.' using errcode = '22023'; end if;
  insert into public.audit_logs (actor_id, action, target_type, target_id, details)
  values ((select auth.uid()), 'ads_builder.modelo.archive', 'ads_builder_modelo', p_id::text, jsonb_build_object('nome', v_nome));
end;
$$;

-- -----------------------------------------------------------------------------
-- Pedidos (histórico)
-- -----------------------------------------------------------------------------
create function private.ads_builder_pedido_add_impl(p_dados jsonb, p_texto text, p_origem bigint)
returns bigint language plpgsql security definer set search_path = '' as $$
declare v_id bigint; v_tipo text := coalesce(p_dados ->> 'tipo', 'anuncios');
begin
  if not private.ads_builder_pode() then raise exception 'Sem permissão para o Criador de Anúncios.' using errcode = '42501'; end if;
  if p_dados is null or jsonb_typeof(p_dados) <> 'object' then raise exception 'Dados do pedido inválidos.' using errcode = '22023'; end if;
  if v_tipo not in ('anuncios') then raise exception 'Tipo de pedido ainda não disponível.' using errcode = '22023'; end if;
  if btrim(coalesce(p_dados ->> 'conta', '')) = '' or btrim(coalesce(p_dados ->> 'campanha', '')) = '' or btrim(coalesce(p_dados ->> 'conjunto', '')) = '' then
    raise exception 'Informe a conta, a campanha e o conjunto.' using errcode = '22023';
  end if;
  if btrim(coalesce(p_texto, '')) = '' then raise exception 'O pedido está vazio.' using errcode = '22023'; end if;
  if char_length(p_texto) > 60000 or pg_column_size(p_dados) > 200000 then raise exception 'Pedido grande demais.' using errcode = '22023'; end if;
  perform private.ads_builder_sem_segredo(p_texto || ' ' || p_dados::text);
  if p_origem is not null and not exists (select 1 from public.ads_builder_pedidos where id = p_origem) then p_origem := null; end if;
  insert into public.ads_builder_pedidos (tipo, conta, campanha, conjunto, dados, texto, origem_pedido_id, criado_por)
  values (v_tipo, left(btrim(p_dados ->> 'conta'), 300), left(btrim(p_dados ->> 'campanha'), 300), left(btrim(p_dados ->> 'conjunto'), 300),
          p_dados, p_texto, p_origem, (select auth.uid()))
  returning id into v_id;
  return v_id;
end;
$$;

-- f: {busca?, limite? (até 300)}
create function private.ads_builder_pedidos_impl(f jsonb)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_lim int := least(greatest(coalesce((f ->> 'limite')::int, 100), 1), 300);
  v_q text := nullif(btrim(coalesce(f ->> 'busca', '')), '');
begin
  if not private.ads_builder_pode() then raise exception 'Sem permissão para o Criador de Anúncios.' using errcode = '42501'; end if;
  return (select coalesce(jsonb_agg(x order by (x ->> 'id')::bigint desc), '[]') from (
    select jsonb_build_object('id', r.id, 'tipo', r.tipo, 'conta', r.conta, 'campanha', r.campanha, 'conjunto', r.conjunto, 'dados', r.dados,
             'texto', r.texto, 'origem_pedido_id', r.origem_pedido_id, 'criado_por_nome', p.full_name, 'created_at', r.created_at) x
      from public.ads_builder_pedidos r left join public.profiles p on p.id = r.criado_por
     where v_q is null or r.conta ilike '%' || v_q || '%' or r.campanha ilike '%' || v_q || '%' or r.conjunto ilike '%' || v_q || '%'
     order by r.id desc
     limit v_lim) t);
end;
$$;

revoke all on function private.ads_builder_modelos_impl(), private.ads_builder_modelo_save_impl(uuid, text, jsonb), private.ads_builder_modelo_archive_impl(uuid),
  private.ads_builder_pedido_add_impl(jsonb, text, bigint), private.ads_builder_pedidos_impl(jsonb) from public, anon;
grant execute on function private.ads_builder_modelos_impl(), private.ads_builder_modelo_save_impl(uuid, text, jsonb), private.ads_builder_modelo_archive_impl(uuid),
  private.ads_builder_pedido_add_impl(jsonb, text, bigint), private.ads_builder_pedidos_impl(jsonb) to authenticated;

-- Funções públicas finas
create function public.ads_builder_modelos()
returns jsonb language sql set search_path = '' as $$ select private.ads_builder_modelos_impl() $$;
create function public.ads_builder_modelo_save(p_id uuid, p_nome text, p_dados jsonb)
returns uuid language sql set search_path = '' as $$ select private.ads_builder_modelo_save_impl(p_id, p_nome, p_dados) $$;
create function public.ads_builder_modelo_archive(p_id uuid)
returns void language sql set search_path = '' as $$ select private.ads_builder_modelo_archive_impl(p_id) $$;
create function public.ads_builder_pedido_add(p_dados jsonb, p_texto text, p_origem bigint default null)
returns bigint language sql set search_path = '' as $$ select private.ads_builder_pedido_add_impl(p_dados, p_texto, p_origem) $$;
create function public.ads_builder_pedidos(f jsonb default '{}')
returns jsonb language sql set search_path = '' as $$ select private.ads_builder_pedidos_impl(f) $$;

revoke all on function public.ads_builder_modelos(), public.ads_builder_modelo_save(uuid, text, jsonb), public.ads_builder_modelo_archive(uuid),
  public.ads_builder_pedido_add(jsonb, text, bigint), public.ads_builder_pedidos(jsonb) from public, anon;
grant execute on function public.ads_builder_modelos(), public.ads_builder_modelo_save(uuid, text, jsonb), public.ads_builder_modelo_archive(uuid),
  public.ads_builder_pedido_add(jsonb, text, bigint), public.ads_builder_pedidos(jsonb) to authenticated;
