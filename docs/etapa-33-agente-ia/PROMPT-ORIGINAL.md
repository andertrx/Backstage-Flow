# ETAPA 33 — Prompt original (como enviado pelo Ander, 27/09/2026)

> Guardado para referência. A versão ajustada ao projeto é `PROMPT-REVISADO.md`.

ETAPA 33 — AGENTE DE IA PARA MONITORAMENTO, ANÁLISE E AUTOMAÇÃO DE META ADS E GOOGLE ADS

## CONTEXTO
O sistema já está funcionando e todas as etapas anteriores, de 0 a 32, devem ser consideradas existentes e funcionais.
A partir desta etapa, vamos adicionar um novo módulo: 🤖 AGENTE DE IA.
O Agente de IA será responsável por monitorar, interpretar e auxiliar na gestão das contas de Meta Ads e Google Ads.

IMPORTANTE:
- NÃO apagar funcionalidades existentes.
- NÃO reescrever as etapas 0–32.
- NÃO migrar banco de dados.
- NÃO criar um segundo banco de dados.
- NÃO alterar estruturas existentes sem necessidade.
- NÃO quebrar nenhuma funcionalidade já existente.
- Reutilizar autenticação, banco, APIs, componentes, serviços e estruturas já existentes.
- O Agente IA deve ser um módulo adicional e independente.
- Caso alguma estrutura existente precise ser utilizada, primeiro analisar como ela funciona.
- O sistema atual deve continuar funcionando mesmo se o módulo de IA estiver desligado.
- Se a IA apresentar erro, o dashboard principal deve continuar funcionando normalmente.

## 33.0 — AUDITORIA OBRIGATÓRIA
Antes de implementar qualquer coisa, fazer uma auditoria completa do sistema atual.

Analisar:
- estrutura do projeto, frontend, backend, banco de dados, autenticação;
- clientes, contas Meta, contas Google, campanhas, métricas;
- sincronizações, APIs, permissões, usuários, histórico, logs, notificações;
- componentes reutilizáveis;
- sistema de cron/jobs, caso exista;
- serviços existentes, variáveis de ambiente, sistema de armazenamento;
- arquitetura atual.

Identificar:
1. Onde estão os clientes.
2. Onde estão as contas de anúncios.
3. Onde estão as campanhas.
4. Onde estão as métricas históricas.
5. Como ocorre a sincronização.
6. Como o sistema identifica cada conta.
7. Como as ações são enviadas para Meta e Google.
8. Quais estruturas podem ser reutilizadas pelo Agente IA.
9. Quais estruturas precisam ser criadas.
10. Como implementar jobs agendados sem duplicar infraestrutura.
11. Como controlar consumo de IA.
12. Como registrar custos e tokens.

Nesta primeira execução, NÃO implementar o agente. Apenas apresentar a auditoria e o plano técnico. A implementação somente deverá começar após aprovação.

## 33.1 — OBJETIVO DO AGENTE
O Agente IA deverá:
- monitorar campanhas;
- analisar desempenho;
- identificar problemas e oportunidades;
- interpretar métricas;
- comparar períodos;
- detectar anomalias;
- analisar tendências;
- gerar recomendações;
- criar alertas;
- explicar o motivo das recomendações;
- executar ações quando houver autorização;
- registrar todas as ações;
- acompanhar os resultados das ações;
- aprender com o histórico operacional sem alterar regras de segurança.

Trabalhar com:
- Meta Ads, Google Ads;
- clientes, contas, campanhas, conjuntos de anúncios/ad sets, anúncios;
- métricas e orçamento;
- leads, CPL, CPA, ROAS, CTR, CPC, CPM, frequência, impressões, alcance, conversões;
- investimento e receita, quando disponível.

## 33.2 — MODOS DE OPERAÇÃO
- **MODO OBSERVADOR:** somente analisa. Não recomenda ações automaticamente, não altera campanhas, não altera orçamento, não pausa campanhas.
- **MODO COPILOTO:** analisa, identifica problemas, gera recomendações, apresenta ações sugeridas e solicita aprovação antes de executar.
  - Exemplo: "Campanha X apresentou aumento de 42% no CPL nos últimos 3 dias. Sugestão: reduzir orçamento em 15%. [APROVAR] [RECUSAR] [IGNORAR]"
- **MODO AUTÔNOMO:** executa automaticamente somente ações explicitamente autorizadas. NUNCA permitir acesso irrestrito a todas as ações.

## 33.3 — CONTROLE GLOBAL
Criar no dashboard a área AGENTE IA, com status 🟢 Ativo ou ⚪ Desativado.

Criar:
- ativar agente e desativar agente;
- pausar todas as automações;
- modo de operação;
- frequência de análise;
- limite de gastos;
- limite de alterações;
- permissões.

🚨 BOTÃO DE EMERGÊNCIA "DESATIVAR TODAS AS AUTOMAÇÕES". Ao clicar:
- interromper novas execuções;
- cancelar jobs pendentes quando possível;
- impedir novas alterações automáticas;
- manter histórico e análises;
- manter o dashboard funcionando.

## 33.4 — ATIVAÇÃO POR CLIENTE, CONTA E CAMPANHA
Hierarquia: CLIENTE → CONTA DE ANÚNCIOS → CAMPANHA, cada um com Agente 🟢 Ativo / ⚪ Inativo.
- Desativado no cliente: nenhuma conta ou campanha daquele cliente executa automações.
- Desativado na conta: nenhuma campanha daquela conta executa automações.
- Desativado na campanha: aquela campanha não pode ser alterada automaticamente.

## 33.5 — ATIVAÇÃO EM MASSA
Opções:
- ativar agente para todas as contas;
- desativar agente para todas;
- ativar ou desativar contas selecionadas;
- ativar ou desativar campanhas selecionadas.

Filtros por: cliente, plataforma, conta, status, investimento, modo e frequência.

## 33.6 — FREQUÊNCIA AJUSTÁVEL DA IA
Opções: desativado, 1x, 2x, 3x, 4x, 6x ou 12x por dia, a cada 1 hora, a cada 30 minutos, a cada 15 minutos, análise manual.
Padrão: 2x por dia (08:00 e 18:00), com horários alteráveis (ex.: 08:00, 12:00, 16:00 e 20:00).

## 33.7 — FREQUÊNCIA POR CONTA
Frequência diferente por conta/cliente. Exemplo: Cliente A 2/dia; B 4/dia; C 1/dia; D a cada 1 hora; E desativado.
A configuração específica sobrescreve a global quando permitido.

## 33.8 — ANÁLISE MANUAL
Botão "ANALISAR AGORA":
1. verificar permissões;
2. verificar se a conta está ativa;
3. verificar disponibilidade dos dados;
4. coletar métricas;
5. executar regras;
6. identificar pontos relevantes;
7. somente então chamar a IA quando necessário;
8. apresentar análise;
9. registrar consumo;
10. registrar custo estimado.

## 33.9 — ARQUITETURA DE ECONOMIA DE TOKENS
Não enviar todas as campanhas para a IA em todas as execuções.
Fluxo: MÉTRICAS → REGRAS DETERMINÍSTICAS → FILTRO → IA → RECOMENDAÇÃO → AÇÃO.

Regras simples sem IA, por exemplo:
- CPL acima de limite;
- CPA acima da meta;
- queda de conversões;
- aumento anormal de CPM;
- aumento de frequência;
- orçamento próximo do limite;
- campanha sem gasto;
- gasto acima do planejado;
- queda de CTR.

## 33.10 — EXEMPLO DE ECONOMIA
500 campanhas → regras → 493 normais e 7 suspeitas → IA analisa só as 7. Nunca 500 análises a cada 15 minutos.

## 33.11 — CONTROLE DE TOKENS
Área "CONSUMO DA IA":
- tokens hoje e no mês;
- tokens de entrada e de saída;
- custo estimado;
- número de análises e de chamadas;
- média de tokens e custo médio por análise;
- custo por cliente e por conta.

Exemplo: tokens hoje 18.450; mês 423.800; 46 análises; R$ 12,80.

## 33.12 — LIMITE DE TOKENS
Limite diário (ex.: 10.000) e mensal (ex.: 300.000). Ao atingir:
- interromper chamadas não essenciais;
- manter regras e monitoramento;
- gerar alerta;
- impedir novo uso até renovação ou autorização.

Nunca consumir indefinidamente.

## 33.13 — LIMITE DE CUSTO
Custo máximo diário e mensal (ex.: R$ 5,00/dia e R$ 100,00/mês). Ao atingir: "Limite de custo da IA atingido." e a IA é pausada automaticamente.

## 33.14 — ALERTA DE CONSUMO
Alertas em 50%, 70%, 80%, 90% e 100%. Exemplo: "Você já utilizou 82% do orçamento mensal de IA."

## 33.15 — OTIMIZAÇÃO DE TOKENS
- Enviar só métricas necessárias.
- Evitar repetição.
- Usar resumos e agregações.
- Reutilizar contexto.
- Evitar análise duplicada.
- Não enviar dados irrelevantes.
- Limitar histórico enviado.
- Aplicar regras antes da IA.
- Usar cache: se os dados não mudaram, não chamar de novo.

## 33.16 — REGRAS DETERMINÍSTICAS
Exemplos:
- SE CPL > R$ 50 por 3 dias E mínimo de 10 leads → sugerir redução de orçamento de 15%.
- SE gasto +40% E conversões −20% → alerta.

Regras configuráveis pelo administrador.

## 33.17 — AÇÕES PERMITIDAS
Permissões individuais:
- analisar;
- gerar recomendações;
- criar alertas;
- alterar orçamento, aumentar orçamento, reduzir orçamento;
- pausar campanha, ativar campanha;
- alterar conjunto de anúncios;
- alterar estratégia de lance;
- alterar segmentação;
- alterar criativos;
- excluir campanha.

Ações de alto risco começam desativadas (principalmente excluir, segmentação, criativos e estratégia de lance).

## 33.18 — LIMITES DE AUTOMAÇÃO
Exemplos configuráveis:
- alteração máxima de orçamento 20%;
- máximo 2 alterações por campanha/dia;
- máximo 10 por conta/dia;
- gasto adicional máximo R$ 500/dia.

## 33.19 — DRY RUN / SIMULAÇÃO
"Se a automação estivesse ativa, o agente faria: Campanha X, orçamento R$ 100 → R$ 85/dia. Motivo: CPL acima da meta por 3 dias. Nenhuma alteração será realizada." Botão [SIMULAR].

## 33.20 — CONFIRMAÇÃO HUMANA
No Copiloto, a IA apresenta:
- problema, dados e interpretação;
- recomendação e ação proposta;
- valor atual e novo valor;
- impacto esperado;
- regra utilizada.

Botões [APROVAR] [RECUSAR] [IGNORAR].

## 33.21 — PROTEÇÃO CONTRA LOOP
Não permitir reduzir e, 10 minutos depois, aumentar por outra regra. Usar:
- cooldown;
- histórico de ações;
- limite de alterações;
- bloqueio temporário;
- verificação de ações recentes.

## 33.22 — DADOS MÍNIMOS
Sem automação com dados insuficientes (ex.: 1 clique). Mínimos configuráveis de impressões, cliques, conversões, período e gasto.

## 33.23 — VERIFICAÇÃO DE DADOS
Antes de qualquer ação financeira, verificar:
- última sincronização;
- atualização dos dados;
- conexão com a API;
- status da conta;
- disponibilidade das métricas.

Se desatualizado, NÃO executar: "Dados insuficientemente atualizados para execução."

## 33.24 — CONFIANÇA DA ANÁLISE
Mostrar o contexto utilizado (ex.: 7 dias, 124 conversões, R$ 8.450, 35.200 cliques) e avisar quando houver pouca informação. Nunca apresentar como certeza absoluta com dados insuficientes.

## 33.25 — HISTÓRICO DO AGENTE
Registrar:
- data, hora;
- cliente, conta, campanha, plataforma;
- análise, recomendação, ação;
- usuário, modo, regra;
- valores antes/depois;
- resultado;
- tokens, custo estimado;
- status.

## 33.26 — CONFIRMAÇÃO DA EXECUÇÃO
Não assumir que funcionou. Consultar a API de novo: "Alteração solicitada." → "Alteração confirmada pela Meta." ou "Não foi possível confirmar a alteração."

## 33.27 — PAINEL DO AGENTE
Página 🤖 AGENTE IA com:
- status, modo, frequência;
- próxima e última análise;
- contas e campanhas monitoradas;
- alertas;
- recomendações pendentes;
- tokens hoje e custo estimado.

## 33.28 — RESUMO DA ANÁLISE
Após cada execução:
- problemas;
- oportunidades;
- recomendações;
- ações executadas e aguardando aprovação;
- contas sem ação necessária.

## 33.29 — CONVERSAÇÃO COM O AGENTE
Área "CONVERSAR COM A IA", com perguntas como:
- "Quais contas estão com pior CPL?"
- "Por que o CPL aumentou?"
- "Quais campanhas gastaram mais ontem?"
- "Quais campanhas deveriam ser analisadas?"
- "Mostre as campanhas com queda de conversão."
- "Quanto gastamos este mês?"
- "Quais clientes precisam de atenção?"

Respostas com os dados existentes do sistema.

## 33.30 — CONTROLE POR CLIENTE
Dentro do cliente:
- status;
- modo (Observador/Copiloto/Autônomo);
- frequência (1x, 2x, 3x, 4x, 6x, 12x/dia, 1h, 30 min, 15 min);
- limites diário e mensal de tokens;
- limite financeiro R$.

## 33.31 — CONTROLE POR CONTA
Dentro da conta:
- ativar agente ON/OFF;
- frequência e modo;
- permissões: analisar, recomendar, alertar, alterar orçamento, pausar, ativar, outras.

## 33.32 — CONTROLE POR CAMPANHA
Automação IA ON/OFF, permissões, limite de alteração, cooldown.

## 33.33 — PRIORIDADE DE CONFIGURAÇÃO
Global → Cliente → Conta → Campanha. A mais restritiva sempre prevalece (ex.: conta desativada → campanhas daquela conta não executam ações).

## 33.34 — AGENDAMENTO
Jobs agendados com a infraestrutura existente. Cada execução verifica:
1. agente ativo;
2. frequência;
3. horário;
4. conta habilitada;
5. campanha habilitada;
6. limites;
7. consumo;
8. última execução;
9. cooldown;
10. disponibilidade dos dados.

Evitar jobs duplicados e análises simultâneas da mesma conta.

## 33.35 — FALHAS
Falha da API da Meta, do Google ou do provedor de IA não quebra o sistema. Registrar erro, horário, conta, operação, tentativa e mensagem técnica. Mensagem amigável ao usuário.

## 33.36 — SEGURANÇA
- Nunca expor tokens, API keys, secrets ou credenciais.
- Nunca enviar secrets ao modelo.
- Backend seguro.
- Todas as ações autorizadas pelo backend; nunca confiar só no frontend.

## 33.37 — CUSTO POR CLIENTE
Relatório "CUSTO DE IA POR CLIENTE" (tokens e custo por cliente).

## 33.38 — CONTROLE DE MARGEM (futuro)
Custo da IA por cliente × valor cobrado pelo SaaS = margem estimada.

## 33.39 — RELATÓRIO DIÁRIO
"RESUMO DIÁRIO DO AGENTE":
- contas e campanhas analisadas;
- problemas;
- recomendações;
- ações realizadas, recusadas e pendentes;
- tokens, custo e erros.

## 33.40 — PRINCÍPIO FUNDAMENTAL
REGRAS PRIMEIRO, IA DEPOIS. A IA não faz o que o código resolve (ex.: "CPL acima de R$ 50"). Ela interpreta: "Por que o CPL aumentou?", "Quais fatores podem estar relacionados?", "O que deveria ser investigado?".

## 33.41 — PADRÃO INICIAL
| Item | Padrão |
|---|---|
| Agente | ativo somente quando autorizado |
| Modo | Copiloto |
| Frequência | 2x/dia (08:00 e 18:00) |
| Limites de tokens e financeiro | configuráveis |
| Automação financeira | desativada |
| Alto risco | desativado |
| Análise manual | disponível |
| Emergência | disponível |

## 33.42 — REGRA DE OURO
O agente nunca deve:
- decidir fora das permissões;
- ultrapassar limites;
- executar sem autorização;
- trabalhar com dados desatualizados;
- esconder erros;
- afirmar execução sem confirmação;
- consumir IA indefinidamente;
- alterar funcionalidades existentes;
- alterar o banco sem necessidade;
- quebrar o dashboard se a IA ficar indisponível.

## 33.43 — EXPERIÊNCIA DO USUÁRIO
Interface simples, mostrando: 🟢 agente ativo, 🤖 Copiloto, ⏱ 2 análises/dia, 💰 R$ consumidos, 🧠 tokens, ⚠️ alertas, ✅ ações, ⏳ próxima análise. Alterar a frequência sem acessar configurações técnicas.

## 33.44 — IMPLEMENTAÇÃO
Depois da aprovação da auditoria, em pequenas etapas:
1. estrutura;
2. configurações;
3. ativação por cliente, conta e campanha;
4. frequência;
5. scheduler;
6. regras;
7. controle de tokens e de custos;
8. integração com IA;
9. análise;
10. recomendações;
11. aprovação;
12. automações;
13. logs e histórico;
14. painel;
15. conversação;
16. testes;
17. proteção contra falhas;
18. testes de segurança.

Após cada etapa: testar, verificar logs, banco, APIs e funcionalidades existentes. Não avançar se quebrar a anterior.

## 33.45 — TESTE FINAL
Testar:
- **estados:** agente desligado e ligado;
- **frequências:** 1x, 2x e 4x/dia, 15 min, análise manual;
- **habilitação:** conta e campanha habilitadas e desabilitadas;
- **limites e controles:** limite de tokens, limite de custo, emergência, cooldown, limite de alterações;
- **falhas:** API indisponível, IA indisponível, dados desatualizados;
- **fluxo:** aprovação, recusa, automação, logs, confirmação da API.

Garantir que as etapas 0–32 continuem funcionando.

## RESULTADO ESPERADO
MONITORAR → FILTRAR → ANALISAR → RECOMENDAR → SOLICITAR APROVAÇÃO → EXECUTAR QUANDO AUTORIZADO → CONFIRMAR → REGISTRAR → MEDIR RESULTADO.

Com controle total de:
- frequência;
- contas, clientes e campanhas;
- permissões;
- tokens e custos;
- automações e limites;
- histórico;
- segurança.

Padrão inicial: 2 análises de IA por dia, ajustável globalmente ou por cliente/conta.
Prioridade: SEGURANÇA + CONTROLE + ECONOMIA DE TOKENS + AUTOMAÇÃO GRADUAL.
