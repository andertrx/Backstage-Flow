-- T5.24 (achados 1, 2 e 3 da análise): (1) pulados por aprovação/pausa/prazo voltam à fila quando o envio é aprovado de novo;
-- (2) o reenvio (origem manual) também só sai com a aprovação da semana válida; (3) mensagem presa em "enviando" não volta à fila
-- (evita envio em dobro): vira "falhou, conferir".
create or replace function private.wa_envios_enfileirar()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  e record;
  c record;
  v_hoje jsonb := private.envio_hoje();
  v_sem date := (v_hoje ->> 'semana')::date;
  v_ini timestamptz;
  v_n integer := 0;
  v_rows integer;
begin
  if not coalesce((select s.enabled from public.wa_gateway_settings s where s.id), false) then return 0; end if;
  for e in select x.* from public.ops_envios x join public.wa_envio_config k on k.envio_id = x.id and k.automatico
            where x.ativo and x.arquivado_em is null
              and private.envio_situacao(x.id) ->> 'situacao_hoje' = 'aprovado' loop
    v_ini := private.envio_inicio_envio(e.id);
    continue when v_ini is null or now() < v_ini or now() >= v_ini + interval '3 hours';
    for c in select oc.cliente_id, g.grupo_id
               from public.ops_envio_clientes oc
               join public.clients cl on cl.id = oc.cliente_id and cl.excluded_at is null and private.client_is_active(cl.id)
               left join public.wa_grupos g on g.cliente_id = oc.cliente_id and g.desvinculado_em is null
              where oc.envio_id = e.id and oc.ativo and oc.removido_em is null
                and not exists (select 1 from public.ops_envio_semana_clientes s where s.envio_id = e.id and s.cliente_id = oc.cliente_id
                                   and s.semana = v_sem and not s.receber)
                and not exists (select 1 from public.ops_envio_execucoes x where x.envio_id = e.id and x.cliente_id = oc.cliente_id
                                   and x.status = 'enviado' and x.executado_em >= (v_hoje ->> 'inicio_semana')::timestamptz)
                and not exists (select 1 from public.wa_disparos d where d.envio_id = e.id and d.cliente_id = oc.cliente_id and d.semana = v_sem
                                   and d.origem = 'automatico'
                                   and (d.status in ('pendente', 'enviando', 'enviado', 'falhou')
                                        or (d.status = 'pulado' and coalesce(d.detalhe, '') not like 'Cliente sem grupo%'
                                            and coalesce(d.detalhe, '') not like 'Desmarcado%'
                                            and coalesce(d.detalhe, '') not like 'A aprovação da semana não vale mais%'
                                            and coalesce(d.detalhe, '') not like 'Envio arquivado ou pausado%'
                                            and coalesce(d.detalhe, '') not like 'Passou do prazo%'))) loop
      if c.grupo_id is null then
        if not exists (select 1 from public.wa_disparos d where d.envio_id = e.id and d.cliente_id = c.cliente_id and d.semana = v_sem
                          and d.origem = 'automatico' and d.status = 'pulado' and d.detalhe like 'Cliente sem grupo%') then
          insert into public.wa_disparos (envio_id, cliente_id, grupo_id, semana, origem, status, versao_envio, detalhe)
          values (e.id, c.cliente_id, '000000@g.us', v_sem, 'automatico', 'pulado', e.versao, 'Cliente sem grupo do WhatsApp ligado.');
          insert into public.ops_envio_execucoes (envio_id, cliente_id, status, detalhe, origem)
          values (e.id, c.cliente_id, 'pulado', 'Cliente sem grupo do WhatsApp ligado.', 'whatsapp');
        end if;
      else
        insert into public.wa_disparos (envio_id, cliente_id, grupo_id, semana, origem, versao_envio)
        values (e.id, c.cliente_id, c.grupo_id, v_sem, 'automatico', e.versao) on conflict do nothing;
        get diagnostics v_rows = row_count;
        v_n := v_n + v_rows;
      end if;
    end loop;
  end loop;
  return v_n;
end;
$$;

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
  v_ini timestamptz;
  v_nums text[];
  v_txt text;
begin
  select * into s from public.wa_gateway_settings where id;
  if not s.enabled or s.connection_state <> 'conectado' then return null; end if;
  -- Presa em "enviando" por mais de 5 minutos: NÃO volta para a fila (poderia sair em dobro se a mensagem já foi enviada
  -- e só o registro do resultado falhou). Vira "falhou, conferir" e pode ser reenviada de propósito ("Reenviar só para quem não recebeu").
  for d in select * from public.wa_disparos x where x.status = 'enviando' and x.atualizado_em < now() - interval '5 minutes' for update skip locked loop
    perform private.wa_disparo_fechar(d.id, 'falhou', 'Resultado não confirmado: confira no grupo antes de reenviar.');
  end loop;
  if (select count(*) from public.wa_disparos x where x.status = 'enviado'
        and x.enviado_em >= (date_trunc('day', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo')) >= 60 then return null; end if;
  if exists (select 1 from public.wa_disparos x where x.status in ('enviando', 'enviado') and coalesce(x.enviado_em, x.atualizado_em) > now() - interval '45 seconds') then return null; end if;
  loop
    select * into d from public.wa_disparos x where x.status = 'pendente' order by x.created_at, x.id for update skip locked limit 1;
    if d.id is null then return null; end if;
    select * into e from public.ops_envios where id = d.envio_id;
    if e.arquivado_em is not null or not e.ativo then
      perform private.wa_disparo_fechar(d.id, 'pulado', 'Envio arquivado ou pausado.'); continue;
    end if;
    -- A aprovação da semana vale para qualquer origem (automático ou reenvio pedido pelo CRM).
    if private.envio_situacao(e.id) ->> 'situacao_hoje' <> 'aprovado' then
      perform private.wa_disparo_fechar(d.id, 'pulado', 'A aprovação da semana não vale mais (envio editado ou recusado).'); continue;
    end if;
    if d.origem = 'automatico' then
      v_ini := private.envio_inicio_envio(e.id);
      if v_ini is null or now() >= v_ini + interval '3 hours' then
        perform private.wa_disparo_fechar(d.id, 'pulado', 'Passou do prazo do envio (3 horas depois do horário ou da aprovação).'); continue;
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
