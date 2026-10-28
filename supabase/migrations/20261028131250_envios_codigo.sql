-- Etapa 41.5 — Envios semanais: código curto de identificação por envio (ENV-001, ENV-002…).
-- A instrução da tarefa agendada de cada envio leva o código; o MCP devolve só aquele envio.

create sequence public.ops_envios_codigo_seq;
alter table public.ops_envios add column codigo text not null
  default ('ENV-' || lpad(nextval('public.ops_envios_codigo_seq')::text, 3, '0'));
alter table public.ops_envios add constraint ops_envios_codigo_key unique (codigo);
comment on column public.ops_envios.codigo is 'Etapa 41.5: identificação curta do envio (ENV-001…), usada na instrução da tarefa agendada e no MCP. Nunca muda.';
revoke all on sequence public.ops_envios_codigo_seq from anon, authenticated;

-- Envio completo: + codigo
create or replace function private.envio_json_codigo(p_id uuid, p_so_ativos boolean)
returns jsonb language sql stable security definer set search_path = '' as $$
  select private.envio_json(p_id, p_so_ativos) || jsonb_build_object('codigo', (select codigo from public.ops_envios where id = p_id))
$$;
revoke all on function private.envio_json_codigo(uuid, boolean) from public, anon, authenticated;

-- f: {so_ativos?, arquivados?, codigo? (ENV-001; também aceita o ID longo)}
create or replace function private.ops_envio_list_impl(f jsonb)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_so_ativos boolean := coalesce((f ->> 'so_ativos')::boolean, false);
  v_arquivados boolean := coalesce((f ->> 'arquivados')::boolean, false);
  v_codigo text := upper(btrim(coalesce(f ->> 'codigo', '')));
begin
  perform private.ops_need('ops.envios');
  return jsonb_build_object(
    'hoje', private.envio_hoje(),
    'envios', (select coalesce(jsonb_agg(private.envio_json_codigo(e.id, v_so_ativos) order by e.dia_semana, e.horario, e.nome), '[]')
                 from public.ops_envios e
                where (case when v_arquivados then e.arquivado_em is not null else e.arquivado_em is null end)
                  and (not v_so_ativos or e.ativo)
                  and (v_codigo = '' or e.codigo = v_codigo or e.id::text = lower(v_codigo))));
end;
$$;

create or replace function private.ops_envio_get_impl(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v jsonb;
begin
  perform private.ops_need('ops.envios');
  if not exists (select 1 from public.ops_envios where id = p_id) then raise exception 'Envio não encontrado.' using errcode = '22023'; end if;
  v := private.envio_json_codigo(p_id, false);
  return v;
end;
$$;

-- Pop-up de aprovação: + codigo
create or replace function private.ops_envio_pendentes_impl()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.ops_can('ops.envios') then return '[]'::jsonb; end if;
  return (select coalesce(jsonb_agg(private.envio_json_codigo(e.id, true) order by e.horario, e.nome), '[]')
            from public.ops_envios e
           where e.ativo and e.arquivado_em is null
             and private.envio_situacao(e.id) ->> 'situacao_hoje' = 'aguardando_aprovacao');
end;
$$;
