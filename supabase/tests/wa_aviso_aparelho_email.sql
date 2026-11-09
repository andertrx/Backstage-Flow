-- T5.18: aviso de WhatsApp caiu/voltou também no aparelho e por e-mail. Roda numa transação desfeita.
do $$
declare
  v_admin uuid; v_n int; v_fila jsonb; v_id bigint;
begin
  select id into v_admin from public.profiles where role = 'admin' and active limit 1;
  if v_admin is null then raise exception 'FALHOU: sem administrador para o teste'; end if;

  -- 1) o aviso de sino do WhatsApp gera o aviso de aparelho/e-mail
  perform private.ops_notify(v_admin, 'whatsapp.caiu', 'WhatsApp dos envios sem conexão', 'Há 10 min sem conexão: teste.', '/operacoes/whatsapp-conexao', 'teste.t518.caiu');
  select count(*), max(id) into v_n, v_id from public.wa_saude_avisos where user_id = v_admin and tipo = 'caiu' and corpo like '%teste.';
  if v_n <> 1 then raise exception 'FALHOU: esperava 1 aviso de aparelho/e-mail, veio %', v_n; end if;

  -- 2) o mesmo aviso repetido (mesma chave) não duplica
  perform private.ops_notify(v_admin, 'whatsapp.caiu', 'WhatsApp dos envios sem conexão', 'Há 10 min sem conexão: teste.', '/operacoes/whatsapp-conexao', 'teste.t518.caiu');
  select count(*) into v_n from public.wa_saude_avisos where user_id = v_admin and tipo = 'caiu' and corpo like '%teste.';
  if v_n <> 1 then raise exception 'FALHOU: aviso repetido duplicou (%)', v_n; end if;

  -- 3) outros tipos de aviso do sino não geram nada
  perform private.ops_notify(v_admin, 'tarefa.atribuida', 'Tarefa', 'x', '/operacoes/tarefas', 'teste.t518.tarefa');
  select count(*) into v_n from public.wa_saude_avisos where titulo = 'Tarefa';
  if v_n <> 0 then raise exception 'FALHOU: aviso de tarefa gerou aviso de WhatsApp'; end if;

  -- 4) a fila traz o aviso pendente e a marcação funciona
  v_fila := private.wa_saude_aviso_fila();
  if not exists (select 1 from jsonb_array_elements(v_fila) e where (e ->> 'id')::bigint = v_id and (e ->> 'push_pendente')::boolean and (e ->> 'email_pendente')::boolean) then
    raise exception 'FALHOU: a fila não trouxe o aviso pendente';
  end if;
  perform private.wa_saude_aviso_mark(v_id, 'push', 'enviado', null);
  perform private.wa_saude_aviso_mark(v_id, 'email', 'sem_email', null);
  if exists (select 1 from jsonb_array_elements(private.wa_saude_aviso_fila()) e where (e ->> 'id')::bigint = v_id) then
    raise exception 'FALHOU: aviso já marcado continuou na fila';
  end if;
  begin perform private.wa_saude_aviso_mark(v_id, 'push', 'qualquer', null); raise exception 'FALHOU: aceitou resultado inválido';
  exception when sqlstate '22023' then null; end;

  raise exception 'T5.18: 5 verificações OK (desfeito)';
end $$;
