-- Botão "Pausar envio" (24/11/2026, pedido do Ander: "fiz um envio, me arrependi e preciso cortar a operação").
-- Pausar = (1) o envio fica PAUSADO (o agendador e o "liberado agora" do Claude param de usar) e (2) tudo que ainda estava NA FILA e não saiu
-- é cortado: vira "pulado" com o motivo, e fica no histórico de execuções. Nada é apagado.
-- O que JÁ foi enviado não volta, e a mensagem que estava saindo no exato instante do clique pode sair (no máximo uma).
-- Retomar só reabre o envio: quem foi cortado NÃO volta sozinho para a fila (o agendador não repete quem já tem disparo na semana);
-- para mandar de novo, use "Reenviar" de propósito.
create function private.wa_envio_pausar_impl(p_envio uuid, p_pausar boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_n integer := 0; v_voo integer; d record;
begin
  perform private.ops_need('ops.envios');
  if not exists (select 1 from public.ops_envios e where e.id = p_envio and e.arquivado_em is null) then
    raise exception 'Envio não encontrado ou arquivado.' using errcode = '22023';
  end if;
  update public.ops_envios set ativo = not coalesce(p_pausar, true), updated_at = now() where id = p_envio;
  if coalesce(p_pausar, true) then
    for d in select x.id from public.wa_disparos x where x.envio_id = p_envio and x.status = 'pendente' order by x.id for update loop
      perform private.wa_disparo_fechar(d.id, 'pulado', 'Cortado: o envio foi pausado antes de sair.');
      v_n := v_n + 1;
    end loop;
  end if;
  select count(*) into v_voo from public.wa_disparos x where x.envio_id = p_envio and x.status = 'enviando';
  insert into public.audit_logs (actor_id, action, target_type, target_id, details)
  values ((select auth.uid()), case when coalesce(p_pausar, true) then 'wa_envio.pausar' else 'wa_envio.retomar' end, 'ops_envio', p_envio::text,
          jsonb_build_object('cortados_da_fila', v_n, 'saindo_no_momento', v_voo));
  return jsonb_build_object('pausado', coalesce(p_pausar, true), 'cortados', v_n, 'saindo_agora', v_voo);
end;
$$;
revoke all on function private.wa_envio_pausar_impl(uuid, boolean) from public, anon;
grant execute on function private.wa_envio_pausar_impl(uuid, boolean) to authenticated;
create function public.wa_envio_pausar(p_envio uuid, p_pausar boolean default true)
returns jsonb language sql set search_path = '' as $$ select private.wa_envio_pausar_impl(p_envio, p_pausar) $$;
revoke all on function public.wa_envio_pausar(uuid, boolean) from public, anon;
grant execute on function public.wa_envio_pausar(uuid, boolean) to authenticated;
