-- Avisos no WhatsApp: "Casos críticos de campanhas". Transação desfeita no final.
do $$
declare
  adm uuid; m public.monitor_alerts; n int := 0; v_desde timestamptz;
  a_novo bigint; a_antigo bigint; a_anuncio bigint; a_atencao bigint; a_resolvido bigint; cnt int; tx text;
  tipos_antes text[]; fn jsonb;
begin
  select id into adm from public.profiles where role = 'admin' and active limit 1;
  select * into m from public.monitor_alerts where level = 'campaign' and severity = 'critico' limit 1;
  select tipos into tipos_antes from public.wa_avisos_config where id;
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.wa_avisos_config_save(true, '120363000000000000@g.us', 'Grupo teste', array['campanha_critica'], 23, 5, 12);
  reset role;
  select campanha_critica_desde into v_desde from public.wa_avisos_config where id;
  if v_desde is not null then n := n + 1; end if;                                  -- 1: marcou o momento em que ligou
  -- 5 casos: novo/campanha/crítico (vale), antigo (antes de ligar), de anúncio, de atenção, resolvido
  insert into public.monitor_alerts overriding system value select (jsonb_populate_record(null::public.monitor_alerts, to_jsonb(m) || jsonb_build_object(
    'id', (select coalesce(max(id), 0) + 1 from public.monitor_alerts), 'dedupe_key', 'teste-novo', 'status', 'novo', 'first_detected_at', now()))).* returning id into a_novo;
  insert into public.monitor_alerts overriding system value select (jsonb_populate_record(null::public.monitor_alerts, to_jsonb(m) || jsonb_build_object(
    'id', (select max(id) + 1 from public.monitor_alerts), 'dedupe_key', 'teste-antigo', 'status', 'novo', 'first_detected_at', v_desde - interval '2 days'))).* returning id into a_antigo;
  insert into public.monitor_alerts overriding system value select (jsonb_populate_record(null::public.monitor_alerts, to_jsonb(m) || jsonb_build_object(
    'id', (select max(id) + 1 from public.monitor_alerts), 'dedupe_key', 'teste-anuncio', 'level', 'ad', 'status', 'novo', 'first_detected_at', now()))).* returning id into a_anuncio;
  insert into public.monitor_alerts overriding system value select (jsonb_populate_record(null::public.monitor_alerts, to_jsonb(m) || jsonb_build_object(
    'id', (select max(id) + 1 from public.monitor_alerts), 'dedupe_key', 'teste-atencao', 'severity', 'atencao', 'status', 'novo', 'first_detected_at', now()))).* returning id into a_atencao;
  insert into public.monitor_alerts overriding system value select (jsonb_populate_record(null::public.monitor_alerts, to_jsonb(m) || jsonb_build_object(
    'id', (select max(id) + 1 from public.monitor_alerts), 'dedupe_key', 'teste-resolvido', 'status', 'resolvido', 'first_detected_at', now()))).* returning id into a_resolvido;
  perform private.wa_avisos_gerar();
  select count(*) into cnt from public.wa_avisos where tipo = 'campanha_critica';
  if cnt = 1 then n := n + 1; end if;                                                -- 2: só 1 aviso (o novo, de campanha, crítico, aberto)
  if exists (select 1 from public.wa_avisos where chave = 'campcrit:' || a_novo || ':0') then n := n + 1; end if;   -- 3: é o certo
  select texto into tx from public.wa_avisos where chave = 'campcrit:' || a_novo || ':0';
  if tx like '🚨 %' and char_length(tx) <= 600 and position(m.explanation in tx) > 0 then n := n + 1; end if;       -- 4: texto curto com cliente/campanha/explicação
  perform private.wa_avisos_gerar();
  select count(*) into cnt from public.wa_avisos where tipo = 'campanha_critica';
  if cnt = 1 then n := n + 1; end if;                                                -- 5: não repete na mesma rodada
  -- desligar a opção e ligar de novo zera o "desde" (os que já existem deixam de contar como novos)
  set local role authenticated;
  perform public.wa_avisos_config_save(true, '120363000000000000@g.us', 'Grupo teste', array['sem_saldo'], 23, 5, 12);
  reset role;
  if (select campanha_critica_desde from public.wa_avisos_config where id) is null then n := n + 1; end if;          -- 6
  raise exception 'avisos campanha crítica: % verificações OK de 6 (desfeito)', n;
end $$;
