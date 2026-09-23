# 07 — Dificuldades técnicas e decisões pendentes

## 1. Dificuldades previstas (e como vamos lidar)

| # | Dificuldade | Impacto | Como lidamos |
|---|---|---|---|
| 1 | **App Review e verificação da empresa no Meta** | Sem isso, só acessamos contas do próprio BM do desenvolvedor | Usar System User do BM da agência; iniciar a verificação cedo |
| 2 | **Developer Token do Google** começa em modo teste | Não lê contas reais até o Google aprovar | Solicitar o nível de acesso logo; desenvolver com conta de teste enquanto isso |
| 3 | **Saldo pré-pago não disponível nas APIs** (Meta e Google) | A tela "Saldo" não terá "saldo disponível" para contas pré-pagas | Mostrar "Informação não disponível pela API." e exibir o que existe (gasto acumulado, limite, valor devido, orçamento da conta). **Nunca inventar.** |
| 4 | **Alcance não soma** entre dias | Alcance de período personalizado pode não estar disponível | Buscar alcance pronto de períodos padrão e guardar em `period_reach` |
| 5 | **Números mudam depois** (atribuição/conversões atrasadas) | Dados de ontem podem mudar hoje | Ressincronizar 7 dias diariamente e 30 dias semanalmente |
| 6 | **Limites de uso das APIs** | Muitas contas → bloqueios temporários | Fila com velocidade controlada, espera crescente, cache no Supabase |
| 7 | **Versões das APIs expiram** | Código para quando a versão é aposentada | Versão da API em configuração, adaptadores isolados, alerta de depreciação |
| 8 | **Sem biblioteca oficial Google Ads para Node/Deno** | — | Usar a interface REST oficial + OAuth 2.0 oficial do Google |
| 9 | **Tempo máximo das Edge Functions** (alguns minutos por execução) | Sincronizações grandes (backfill) não cabem numa execução | Dividir em pedaços pequenos na fila (Supabase Queues). Se ainda não bastar, o "robô" pode migrar para um serviço separado sem mudar o banco |
| 10 | **Plano Free pausa o projeto após 1 semana sem uso** e tem 500 MB | Não serve para produção | Free para testes; **Pro (US$ 25/mês)** para produção |
| 11 | **Crescimento do espaço em disco** (~3–5 GB/ano com 200 contas) | Custo de espaço extra | Particionamento, colunas enxutas, só gravar o que mudou; monitorar |
| 12 | **Fusos diferentes** entre contas de um mesmo cliente | Totais do "dia" podem não bater exatamente | Guardar no fuso da conta e avisar na tela |
| 13 | **Mapeamento de "lead" e "mensagem"** varia por conta | Leads podem ser contados errado | Mapeamento configurável por conta, com padrão e lista original guardada |
| 14 | Tokens pessoais do Meta expiram (~60 dias) | Sincronização para | Preferir System User; alertar antes de expirar quando houver data |
| 15 | **Desenvolvimento local do Supabase precisa de Docker** | Pode não estar disponível em todo ambiente | Usar um **projeto Supabase de desenvolvimento** na nuvem, separado da produção |

## 2. Estratégia de atualização dos dados (resumo)

- Automática de hora em hora (configurável), com fila e prioridade.
- Botão "Sincronizar agora" com limite de uso.
- Fechamento diário (snapshot do dia) no fuso de cada cliente.
- Backfill ao conectar conta nova, em pedaços.
- A tela mostra sempre "Última sincronização" e "Próxima sincronização".

## 3. O que vou precisar de você (só quando chegarmos lá)

| Quando | O quê |
|---|---|
| Etapa 1 | Um **projeto Supabase de desenvolvimento** (posso criar pela conexão com o Supabase desta sessão, com sua aprovação) e, antes de dados reais, um **projeto de produção** (plano Pro). Um projeto na **Vercel** para publicar o site |
| Etapa 3 | Acesso de administrador ao **Business Manager** da agência para criar o App e o System User |
| Etapa 4 | Conta **MCC** do Google Ads da agência e um projeto no **Google Cloud** para o OAuth; solicitar o Developer Token |

Até lá, desenvolvemos e testamos tudo no projeto de desenvolvimento, com dados
marcados como **MODO DEMONSTRAÇÃO**.

## 4. Decisões para você confirmar ao aprovar

1. **Stack**: React + Vite + TypeScript no site (hospedado na Vercel); Supabase
   (PostgreSQL, Auth, Edge Functions, Cron, Queues, Vault, Storage) no servidor e banco.
2. **Papéis**: administrador, gestor, operador, visualizador **e cliente** (5 papéis —
   junção das Etapas 1 e 20).
3. **Intervalo de sincronização padrão**: 60 minutos.
4. **Retenção de logs técnicos** (`sync_runs`): 400 dias — ou prefere guardar para
   sempre? (Métricas e histórico de negócio: **para sempre**, sem exceção.)
5. **Uma agência só** (a sua) por enquanto. A estrutura permite virar multi-agência
   depois, mas não vamos complicar agora.
