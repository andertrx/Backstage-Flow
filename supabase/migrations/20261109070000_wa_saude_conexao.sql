-- T5.17 (09/11/2026): saúde da conexão do WhatsApp dos envios (o número do chip e o servidor).
-- A cada 5 minutos o banco confere o servidor (Evolution): conectado, desconectado, trocando de número, sem resposta ou chave recusada.
-- Se ficar fora por mais de 10 minutos, os administradores recebem um aviso no sino (Tarefas/Central) e, quando volta, outro aviso.
-- Nada de telefone completo é guardado: só os 4 últimos dígitos e o nome do perfil, para você saber qual chip está ligado.

-- 1) Colunas e tipos de aviso
alter table public.wa_gateway_settings
  add column if not exists health_state text,
  add column if not exists health_message text,
  add column if not exists health_since timestamptz,
  add column if not exists last_ok_at timestamptz,
  add column if not exists owner_tail text,
  add column if not exists profile_name text,
  add column if not exists health_req_id bigint,
  add column if not exists alert_sent boolean not null default false,
  add column if not exists last_alert_at timestamptz;

alter table public.ops_notifications drop constraint ops_notifications_kind_check;
alter table public.ops_notifications add constraint ops_notifications_kind_check check (kind = any (array[
  'tarefa.atribuida', 'tarefa.mencao', 'tarefa.comentario', 'tarefa.concluida', 'tarefa.prazo', 'tarefa.atrasada',
  'reuniao.convite', 'reuniao.hoje', 'reuniao.item', 'cliente.am', 'lead.responsavel', 'envio.aprovar', 'cliente.reuniao',
  'whatsapp.caiu', 'whatsapp.voltou']));

-- 2) A conferência (roda no banco, sem Edge Function): resolve o pedido anterior e já dispara o próximo.
create function private.wa_health_tick()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.wa_gateway_settings;
  r record;
  v_body jsonb; v_item jsonb;
  v_state text; v_msg text; v_tail text; v_name text; v_raw text;
  v_key text; v_min integer; a record;
begin
  select * into s from public.wa_gateway_settings where id;
  if s.base_url is null or not s.has_key then return; end if;

  -- a) resultado do pedido anterior
  if s.health_req_id is not null then
    select * into r from net._http_response where id = s.health_req_id;
    if found then
      if r.timed_out or r.status_code is null then
        v_state := 'sem_resposta'; v_msg := 'O servidor não respondeu (pode estar reiniciando, fora do ar ou trocando de número).';
      elsif r.status_code in (401, 403) then
        v_state := 'chave'; v_msg := 'O servidor recusou a chave de acesso. Confira a chave em Integrações.';
      elsif r.status_code >= 500 then
        v_state := 'erro_servidor'; v_msg := 'O servidor do WhatsApp deu erro interno.';
      elsif r.status_code = 200 then
        begin v_body := r.content::jsonb; exception when others then v_body := null; end;
        v_item := case when jsonb_typeof(v_body) = 'array' then v_body -> 0 else v_body end;
        v_raw := lower(coalesce(v_item ->> 'connectionStatus', ''));
        if v_item is null or v_item = 'null'::jsonb then
          v_state := 'sem_instancia'; v_msg := 'A instância não existe no servidor. Conecte o WhatsApp de novo em Integrações.';
        elsif v_raw = 'open' then
          v_state := 'conectado'; v_msg := null;
          v_tail := right(regexp_replace(coalesce(v_item ->> 'ownerJid', ''), '@.*$', ''), 4);
          v_name := left(v_item ->> 'profileName', 60);
        elsif v_raw = 'connecting' then
          v_state := 'aguardando_leitura'; v_msg := 'Esperando a leitura do QR Code ou do código (troca de número em andamento).';
        else
          v_state := 'desconectado'; v_msg := 'O WhatsApp está desconectado no servidor. Conecte de novo em Integrações.';
        end if;
      else
        v_state := 'erro_servidor'; v_msg := 'Resposta inesperada do servidor (código ' || r.status_code || ').';
      end if;

      update public.wa_gateway_settings set
        health_state = v_state, health_message = v_msg,
        health_since = case when health_state is distinct from v_state then now() else health_since end,
        last_ok_at = case when v_state = 'conectado' then now() else last_ok_at end,
        owner_tail = case when v_state = 'conectado' then nullif(v_tail, '') else owner_tail end,
        profile_name = case when v_state = 'conectado' then v_name else profile_name end
      where id;

      -- mantém a situação mostrada na tela coerente quando o servidor respondeu de verdade
      if v_state = 'conectado' and s.connection_state is distinct from 'conectado' then perform private.wa_gateway_state_set('conectado', null);
      elsif v_state = 'desconectado' and s.connection_state is distinct from 'desconectado' then perform private.wa_gateway_state_set('desconectado', v_msg);
      end if;

      -- b) avisos no sino dos administradores
      select * into s from public.wa_gateway_settings where id;
      v_min := floor(extract(epoch from (now() - coalesce(s.health_since, now()))) / 60);
      if s.health_state <> 'conectado' and v_min >= 10
         and (not s.alert_sent or coalesce(s.last_alert_at, '-infinity') < now() - interval '6 hours') then
        v_key := 'wa.caiu.' || extract(epoch from now())::bigint;
        for a in select id from public.profiles where role = 'admin' and active loop
          perform private.ops_notify(a.id, 'whatsapp.caiu', 'WhatsApp dos envios sem conexão',
            'Há ' || v_min || ' min sem conexão: ' || coalesce(s.health_message, 'sem detalhe') || ' Os avisos nos grupos não saem até voltar.',
            '/configuracoes/integracoes', v_key);
        end loop;
        update public.wa_gateway_settings set alert_sent = true, last_alert_at = now() where id;
      elsif s.health_state = 'conectado' and s.alert_sent then
        v_key := 'wa.voltou.' || extract(epoch from now())::bigint;
        for a in select id from public.profiles where role = 'admin' and active loop
          perform private.ops_notify(a.id, 'whatsapp.voltou', 'WhatsApp dos envios voltou',
            'A conexão voltou' || case when s.owner_tail is not null then ' (número terminado em ' || s.owner_tail || ')' else '' end || '.',
            '/configuracoes/integracoes', v_key);
        end loop;
        update public.wa_gateway_settings set alert_sent = false where id;
      end if;
    end if;
  end if;

  -- c) o próximo pedido (a chave é lida aqui dentro e nunca aparece em log nem em resposta)
  update public.wa_gateway_settings set health_req_id = (
    select net.http_get(
      url := rtrim(s.base_url, '/') || '/instance/fetchInstances?instanceName=' || s.instance_name,
      headers := jsonb_build_object('apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'wa_gateway_key')),
      timeout_milliseconds := 15000)
  ) where id;
end;
$$;
revoke all on function private.wa_health_tick() from public, anon, authenticated;

select cron.schedule('wa-health', '*/5 * * * *', 'select private.wa_health_tick()');
