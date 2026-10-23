# Desativar cliente (23/10/2026)

> Ander: "Crie um botão para desabilitar clientes, tudo que envolve isso."
> Respostas dele: o tracking deve parar; os períodos passados continuam no Dashboard.
> **Ponto de volta criado antes** (ver `docs/PONTO-DE-RESTAURACAO.md`).

![Ficha de um cliente desativado](cliente-desativado.png)

## Como usar
- Na ficha do cliente, o administrador vê **"Desativar cliente"** (pede confirmação) ou, se já estiver desativado, **"Reativar cliente"**.
- A situação "Encerrado" virou **"Desativado"** (é a mesma no banco). No formulário "Editar" ela não aparece: só pelo botão.
- Quem não é admin não vê o botão; o banco recusa a mudança por qualquer outro caminho.

## O que para quando o cliente é desativado
| O quê | Como |
|---|---|
| Sincronização automática do Meta/Google e recuperação do histórico | as contas do cliente não entram na fila (`sync_claim_due`, `sync_claim_backfill`) |
| Monitoramento e alertas | as contas ficam fora da avaliação; os alertas abertos são encerrados com o motivo "cliente desativado" |
| Leitura automática da planilha | a leitura do cliente é recusada (`ri_read_claim`) |
| E-mail semanal de relatório | o cliente sai da lista de envio (`client_report_email_due`) |
| Acesso do cliente | link secreto recusado ("Link inválido ou desativado") e login do cliente sem acesso aos dados (`can_view_client`) |
| Tracking do site e WhatsApp | eventos recusados (`tracking_ingest`, `tracking_whatsapp_register`, `tracking_whatsapp_inbound`) |
| Envio à API de Conversões do Meta | a fila do cliente não sai (`tracking_capi_claim`); com mais de 7 dias o Meta não aceita mais e os eventos são descartados |
| Central de Operações | repetições de tarefas/reuniões do cliente param ("Parada automaticamente: o cliente foi desativado") |
| Telas do dia a dia | some da escolha de cliente (Dashboard, Campanhas, Relatórios, Meta/Google, Comparativo, Executivo, Monitoramento, Inteligência de Resultados, Tracking, Alertas). Continua na lista de Clientes (aba "Desativado"), no Histórico e nos Logs |

## O que não muda
- **Nada é apagado.** Métricas, histórico, campanhas, planilha, tarefas e alertas antigos continuam guardados.
- Os **números de períodos passados** continuam no Dashboard (pedido do Ander).
- Ao **reativar**, tudo volta a funcionar e a sincronização roda logo (a recuperação de lacunas busca os dias que faltaram).
  As repetições da Central que pararam **não voltam sozinhas** (reative-as na Central, se quiser).
- Desativar e reativar ficam no histórico de auditoria (`client.deactivate` / `client.reactivate`).

## Banco
- Migração `20261023125125_clientes_desativar.sql`. **Nenhuma tabela nova.**
  - `private.client_is_active(cliente)`: regra única usada por todas as checagens.
  - Gatilhos em `clients`: `clients_status_guard` (só admin desativa/reativa) e `clients_status_effects` (encerra alertas, para repetições, auditoria, sincroniza ao reativar).
- Ponto de volta: as versões anteriores ficaram em `private.*_antes_2026_10_23`; `supabase/rollback/voltar_clientes_desativar_2026_10_23.sql` desfaz tudo.

## Testes
- SQL: `supabase/tests/clientes_desativar.sql` — 11 verificações OK no banco real (desfeito no fim).
- Navegador: `e2e/client-deactivate.mjs` — confirmação, etiqueta, alertas encerrados, some do Dashboard, aba Desativado, reativar, gestor sem botão e recusado.
