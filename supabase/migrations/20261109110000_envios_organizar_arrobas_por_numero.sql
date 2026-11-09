-- T5.22 (09/11/2026), Fase 1: marcação (@) só por NÚMERO, escolhido por cliente; fim do caminho antigo (Claude/MCP envia).
-- Espelha o que já foi aplicado no banco (migration "envios_organizar_arrobas_por_numero").
alter table public.wa_marcacoes add column if not exists ativo boolean not null default true;
comment on column public.wa_marcacoes.ativo is 'T5.22: se a pessoa entra nas marcações dos envios do cliente (o administrador pode desligar sem apagar).';

create or replace function private.wa_marcacao_salvar_impl(p_cliente uuid, p_nome text, p_numero text)
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
  if v_nome = '' or char_length(v_nome) > 200 then raise exception 'Dê um nome (apelido) à pessoa, até 200 letras.' using errcode = '22023'; end if;
  if not exists (select 1 from public.clients c where c.id = p_cliente and c.excluded_at is null) then
    raise exception 'Cliente não encontrado.' using errcode = '22023';
  end if;
  if exists (select 1 from public.wa_marcacoes m where m.cliente_id = p_cliente and m.numero = v_dig and m.nome <> v_nome) then
    raise exception 'Esse número já está ligado a outra pessoa deste cliente.' using errcode = '22023';
  end if;
  insert into public.wa_marcacoes (cliente_id, nome, numero, created_by) values (p_cliente, v_nome, v_dig, v_uid)
  on conflict (cliente_id, nome) do update set numero = excluded.numero, updated_at = now();
  insert into public.audit_logs (actor_id, action, target_type, target_id, details)
  values (v_uid, 'wa_marcacao.salvar', 'client', p_cliente::text, jsonb_build_object('pessoa', v_nome));
end;
$$;

create function private.wa_marcacao_ativar_impl(p_cliente uuid, p_nome text, p_ativo boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if not exists (select 1 from public.profiles p where p.id = v_uid and p.role = 'admin' and p.active) then
    raise exception 'Só o administrador liga ou desliga a marcação de pessoas.' using errcode = '42501';
  end if;
  update public.wa_marcacoes set ativo = coalesce(p_ativo, true), updated_at = now() where cliente_id = p_cliente and nome = btrim(coalesce(p_nome, ''));
  insert into public.audit_logs (actor_id, action, target_type, target_id, details)
  values (v_uid, 'wa_marcacao.ativar', 'client', p_cliente::text, jsonb_build_object('pessoa', btrim(coalesce(p_nome, '')), 'ativo', coalesce(p_ativo, true)));
end;
$$;
revoke all on function private.wa_marcacao_ativar_impl(uuid, text, boolean) from public, anon, authenticated;
grant execute on function private.wa_marcacao_ativar_impl(uuid, text, boolean) to authenticated;

create function public.wa_marcacao_ativar(p_cliente uuid, p_nome text, p_ativo boolean)
returns void language sql set search_path = '' as $$ select private.wa_marcacao_ativar_impl(p_cliente, p_nome, p_ativo) $$;
revoke all on function public.wa_marcacao_ativar(uuid, text, boolean) from public, anon;
grant execute on function public.wa_marcacao_ativar(uuid, text, boolean) to authenticated;

-- Quem marcar: os números ligados e ativos do cliente, na ordem em que foram cadastrados.
create or replace function private.wa_marcacoes_do_envio(p_envio uuid, p_cliente uuid)
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(m.numero order by m.id), '{}')
    from public.wa_marcacoes m
   where m.cliente_id = p_cliente and m.ativo
$$;

-- O caminho antigo (Claude/MCP envia) fecha: o CRM é quem envia, pela fila automática.
create or replace function private.envio_situacao(p_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with h as (select private.envio_hoje() j),
  e as (select * from public.ops_envios where id = p_id),
  au as (select exists (select 1 from public.wa_envio_config k where k.envio_id = p_id and k.automatico) v),
  a as (select x.* from public.ops_envio_aprovacoes x, e, h where x.envio_id = e.id and x.semana = ((select j from h) ->> 'semana')::date),
  dev as (select private.envio_devido_em(e.dia_semana, e.horario) t from e)
  select jsonb_build_object(
    'semana', (select j from h) ->> 'semana',
    'aprovacao', (select jsonb_build_object('decisao', a.decisao, 'versao_envio', a.versao_envio, 'decidido_em', a.decidido_em,
                    'decidido_por_nome', (select full_name from public.profiles where id = a.decidido_por), 'origem', a.origem,
                    'valida', a.decisao = 'aprovado' and a.versao_envio = e.versao) from a, e),
    'automatico', (select v from au),
    'aprovacao_tardia', (select v from au) and e.ativo and e.arquivado_em is null and now() >= (select t from dev)
      and not exists (select 1 from a where (a.decisao = 'aprovado' and a.versao_envio = e.versao) or a.decisao = 'recusado'),
    'situacao_hoje', case
      when not e.ativo or e.arquivado_em is not null then 'nao_hoje'
      when (select v from au) then case
        when exists (select 1 from a where a.decisao = 'aprovado' and a.versao_envio = e.versao) then 'aprovado'
        when exists (select 1 from a where a.decisao = 'recusado') then 'recusado'
        when now() >= (select t from dev) then 'nao_aprovado_a_tempo'
        when e.dia_semana <> ((select j from h) ->> 'dia_semana')::int then 'nao_hoje'
        when ((select j from h) ->> 'hora')::time >= case when e.horario <= time '07:00' then time '00:00' else time '07:00' end then 'aguardando_aprovacao'
        else 'antes_da_janela' end
      when e.dia_semana <> ((select j from h) ->> 'dia_semana')::int then 'nao_hoje'
      when exists (select 1 from a where a.decisao = 'aprovado' and a.versao_envio = e.versao) then 'aprovado'
      when exists (select 1 from a where a.decisao = 'recusado') then 'recusado'
      when ((select j from h) ->> 'hora')::time >= e.horario then 'nao_aprovado_a_tempo'
      when ((select j from h) ->> 'hora')::time >= case when e.horario <= time '07:00' then time '00:00' else time '07:00' end then 'aguardando_aprovacao'
      else 'antes_da_janela' end,
    'pode_enviar_agora', false)
  from e
$$;
