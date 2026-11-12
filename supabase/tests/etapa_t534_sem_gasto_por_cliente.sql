-- T5.34 — o aviso "sem gastar" com período mínimo de 6 h e período por cliente. Transação desfeita no final.
do $$
declare adm uuid; cli uuid; n int := 0; err text; ok boolean;
begin
  select id into adm from public.profiles where role = 'admin' and active limit 1;
  select id into cli from public.clients where status = 'ativo' limit 1;
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  set local role authenticated;

  -- 1) período geral abaixo de 6 horas é recusado
  begin
    perform public.wa_sem_gasto_config_save(8, 22, 60);
    err := null;
  exception when others then err := sqlstate;
  end;
  if err = '22023' then n := n + 1; end if;

  -- 2) 6 h e 12 h são aceitos
  perform public.wa_sem_gasto_config_save(8, 22, 360);
  perform public.wa_sem_gasto_config_save(8, 22, 720);
  if (select sem_gasto_minutos from public.wa_avisos_config where id) = 720 then n := n + 1; end if;

  -- 3) o período por cliente é salvo
  perform public.wa_sem_gasto_minutos_save(cli, 480);
  if exists (select 1 from public.wa_sem_gasto_minutos_clientes where cliente_id = cli and minutos = 480) then n := n + 1; end if;

  -- 4) período por cliente fora de 6 a 12 h é recusado
  begin
    perform public.wa_sem_gasto_minutos_save(cli, 120);
    err := null;
  exception when others then err := sqlstate;
  end;
  if err = '22023' then n := n + 1; end if;

  -- 5) null = usar o período geral (a linha some)
  perform public.wa_sem_gasto_minutos_save(cli, null);
  if not exists (select 1 from public.wa_sem_gasto_minutos_clientes where cliente_id = cli) then n := n + 1; end if;

  reset role;

  -- 6) a trava do banco: menos de 6 h não entra na tabela
  begin
    insert into public.wa_sem_gasto_minutos_clientes (cliente_id, minutos) values (cli, 60);
    ok := false;
  exception when others then ok := true;
  end;
  if ok then n := n + 1; end if;

  -- 7) alerta aberto ANTES de ligar o canal também avisa
  insert into public.alerts (alert_key, type, severity, client_id, description, status, first_seen_at, last_seen_at)
  values ('t5.34-alerta-antigo', 'sem_saldo', 'alta', cli, 'Alerta antigo do teste T5.34', 'aberto', now() - interval '3 days', now() - interval '3 days');
  update public.wa_avisos_config set ativo = true, ativo_desde = now(), grupo_id = '120363000000000055@g.us',
    tipos = array['sem_saldo'], notif_usuario_id = adm where id;
  perform private.wa_avisos_gerar();
  if exists (select 1 from public.wa_avisos where tipo = 'sem_saldo' and texto like '%Alerta antigo do teste T5.34%') then n := n + 1; end if;

  -- 8) notificação do sino das últimas horas também avisa (chave única: não repete)
  insert into public.ops_notifications (user_id, kind, title, link, dedupe_key, created_at)
  values (adm, 'tarefa.atribuida', 'Tarefa do teste T5.34', '/operacoes/tarefas', 't5.34-notif', now() - interval '1 hour');
  perform private.wa_avisos_gerar();
  if exists (select 1 from public.wa_avisos where tipo = 'n:tarefa.atribuida' and texto like '%Tarefa do teste T5.34%') then n := n + 1; end if;

  raise exception 'T5.34: % verificações OK de 8 (desfeito)', n;
end $$;
