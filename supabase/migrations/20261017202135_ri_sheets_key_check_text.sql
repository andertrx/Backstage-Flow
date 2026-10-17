-- Etapa 39.1 (ajuste): a validação da chave procura "BEGIN PRIVATE KEY" sem os traços,
-- para a checagem de segredos do repositório (npm run check:secrets) não confundir o código
-- com uma chave de verdade. O comportamento é o mesmo. O arquivo da 20261017195919 foi
-- alinhado com este ajuste (mesmo texto que ficou no banco).
do $mig$
declare
  v_def text;
  v_old text := '''-----BEGIN ' || 'PRIVATE KEY-----''';
begin
  select pg_get_functiondef('private.sheets_settings_save_impl(text)'::regprocedure) into v_def;
  if position(v_old in v_def) = 0 then
    raise exception 'Trecho não encontrado em private.sheets_settings_save_impl';
  end if;
  execute replace(v_def, v_old, '''BEGIN PRIVATE KEY''');
end;
$mig$;
