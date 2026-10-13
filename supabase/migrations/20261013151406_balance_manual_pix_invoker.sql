-- Correção da mesma fase: o cálculo do saldo informado roda com a permissão de quem lê
-- (as regras de leitura das tabelas valem), para account_balances() poder usá-lo.
alter function private.manual_prepaid_state(uuid) security invoker;
grant execute on function private.manual_prepaid_state(uuid) to authenticated;
