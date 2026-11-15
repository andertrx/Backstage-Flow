-- T5.36 — o aviso "sem gastar" só sai quando NÃO houve entrega (impressões, alcance, cliques) nas
-- últimas 2 horas. Transação desfeita no final.
do $$
declare
  adm uuid; cli uuid; conta uuid; hoje date; n int := 0;
begin
  select id into adm from public.profiles where role = 'admin' and active limit 1;
  select id into cli from public.clients where status = 'ativo' limit 1;
  if cli is null then raise exception 'T5.36: o teste precisa de um cliente ativo'; end if;
  hoje := (now() at time zone 'America/Sao_Paulo')::date;

  -- conta e campanha do teste
  insert into public.ad_accounts (platform_id, external_id, client_id, name, currency, timezone, status)
  values ('meta', 't536' || substr(md5(random()::text), 1, 10), cli, 'Conta do teste T5.36', 'BRL', 'America/Sao_Paulo', 'ativa')
  returning id into conta;
  insert into public.campaigns (ad_account_id, client_id, platform_id, external_id, name, status, effective_status)
  values (conta, cli, 'meta', 'camp-t536', 'Campanha do teste T5.36', 'ativa', 'ACTIVE');

  -- o dinheiro está parado: duas leituras com o MESMO valor (12 h de diferença)
  insert into public.account_snapshots (ad_account_id, client_id, platform_id, captured_at, status, amount_spent_micros, payload)
  values (conta, cli, 'meta', now() - interval '12 hours', 'ativa', 1000000, '{}'),
         (conta, cli, 'meta', now(), 'ativa', 1000000, '{}');

  -- canal ligado, tipo "sem_gasto" e janela o dia inteiro (o teste não depende da hora)
  update public.wa_avisos_config set ativo = true, ativo_desde = now(), grupo_id = '120363000000000055@g.us',
    tipos = array['sem_gasto'], sem_gasto_inicio = 0, sem_gasto_fim = 24, sem_gasto_minutos = 360, notif_usuario_id = adm where id;
  delete from public.wa_sem_gasto_silenciados where cliente_id = cli;
  delete from public.wa_sem_gasto_minutos_clientes where cliente_id = cli;

  -- 1) com ENTREGA (impressões subindo) não avisa
  delete from public.account_delivery_readings where ad_account_id = conta;
  insert into public.account_delivery_readings (ad_account_id, client_id, platform_id, date, captured_at, impressions, reach, clicks)
  values (conta, cli, 'meta', hoje, now() - interval '3 hours', 100, 10, 5),
         (conta, cli, 'meta', hoje, now() - interval '30 minutes', 500, 40, 20);
  perform private.wa_sem_gasto_gerar();
  if not exists (select 1 from public.wa_avisos where chave like 'semgasto:' || conta::text || '%') then n := n + 1; end if;
  delete from public.wa_avisos where chave like 'semgasto:' || conta::text || '%';

  -- 2) SEM entrega (nada subiu) avisa
  delete from public.account_delivery_readings where ad_account_id = conta;
  insert into public.account_delivery_readings (ad_account_id, client_id, platform_id, date, captured_at, impressions, reach, clicks)
  values (conta, cli, 'meta', hoje, now() - interval '3 hours', 100, 10, 5),
         (conta, cli, 'meta', hoje, now() - interval '30 minutes', 100, 10, 5);
  perform private.wa_sem_gasto_gerar();
  if exists (select 1 from public.wa_avisos where chave like 'semgasto:' || conta::text || '%') then n := n + 1; end if;
  -- e o texto do aviso diz que não houve entrega
  if exists (select 1 from public.wa_avisos where chave like 'semgasto:' || conta::text || '%' and texto like '%sem entrega nas últimas 2 h%') then n := n + 1; end if;
  delete from public.wa_avisos where chave like 'semgasto:' || conta::text || '%';

  -- 3) alcance subindo também é entrega (pessoas novas atingidas)
  delete from public.account_delivery_readings where ad_account_id = conta;
  insert into public.account_delivery_readings (ad_account_id, client_id, platform_id, date, captured_at, impressions, reach, clicks)
  values (conta, cli, 'meta', hoje, now() - interval '3 hours', 100, 10, 5),
         (conta, cli, 'meta', hoje, now() - interval '30 minutes', 100, 25, 5);
  perform private.wa_sem_gasto_gerar();
  if not exists (select 1 from public.wa_avisos where chave like 'semgasto:' || conta::text || '%') then n := n + 1; end if;
  delete from public.wa_avisos where chave like 'semgasto:' || conta::text || '%';

  -- 4) alcance NULL (o Google não informa alcance) não impede o aviso
  delete from public.account_delivery_readings where ad_account_id = conta;
  insert into public.account_delivery_readings (ad_account_id, client_id, platform_id, date, captured_at, impressions, reach, clicks)
  values (conta, cli, 'meta', hoje, now() - interval '3 hours', 100, null, 5),
         (conta, cli, 'meta', hoje, now() - interval '30 minutes', 100, null, 5);
  perform private.wa_sem_gasto_gerar();
  if exists (select 1 from public.wa_avisos where chave like 'semgasto:' || conta::text || '%') then n := n + 1; end if;
  delete from public.wa_avisos where chave like 'semgasto:' || conta::text || '%';

  -- 5) sem leitura do dia não dá para afirmar nada: não avisa
  delete from public.account_delivery_readings where ad_account_id = conta;
  perform private.wa_sem_gasto_gerar();
  if not exists (select 1 from public.wa_avisos where chave like 'semgasto:' || conta::text || '%') then n := n + 1; end if;

  -- 6) a sincronização grava a leitura de entrega (o batimento)
  perform public.ingest_metrics_daily(jsonb_build_array(jsonb_build_object(
    'date', hoje, 'ad_account_id', conta, 'level', 'account', 'entity_external_id', 't536-acc',
    'currency', 'BRL', 'spend_micros', 500000, 'impressions', 1234, 'reach', 77, 'clicks', 12)));
  if exists (select 1 from public.account_delivery_readings
              where ad_account_id = conta and date = hoje and impressions = 1234 and reach = 77 and clicks = 12) then n := n + 1; end if;

  -- 7) e ela grava mesmo quando a plataforma não devolve nada para o dia (leitura sem números = "não houve entrega")
  perform public.ingest_metrics_daily(jsonb_build_array(jsonb_build_object(
    'date', (hoje - 1), 'ad_account_id', conta, 'level', 'account', 'entity_external_id', 't536-acc',
    'currency', 'BRL', 'spend_micros', 500000, 'impressions', 900, 'reach', 60, 'clicks', 9)));
  if exists (select 1 from public.account_delivery_readings
              where ad_account_id = conta and date = hoje and impressions is null and reach is null and clicks is null) then n := n + 1; end if;

  raise exception 'T5.36: % verificações OK de 8 (desfeito)', n;
end $$;
