# ETAPA 37 — BACKSTAGE FLOW | MONITORAMENTO INTELIGENTE DE DESEMPENHO, VARIAÇÕES DE MÉTRICAS E ALERTAS DE CAMPANHAS

## 1. CONTEXTO DO PROJETO

O Backstage Flow já possui módulos funcionais de gerenciamento de clientes, contas de anúncios, campanhas, métricas, saldos, relatórios e dashboards, desenvolvidos nas etapas anteriores.

Atualmente, o sistema permite visualizar os indicadores de desempenho das campanhas e acompanhar os saldos das contas de anúncios. Entretanto, ainda é necessário acessar individualmente as campanhas e analisar seus indicadores para identificar aumentos de custos, quedas de desempenho ou alterações significativas.

Esta etapa deverá adicionar um módulo profissional de **Monitoramento Inteligente de Desempenho**, para identificar automaticamente variações relevantes nas métricas de Meta Ads e Google Ads, destacar campanhas e criativos que merecem atenção e notificar os usuários responsáveis.

O objetivo é otimizar o tempo de gestão de tráfego, reduzir a necessidade de conferência manual e facilitar a identificação de situações que exigem uma análise humana.

### REGRA FUNDAMENTAL

**ESTA ETAPA DEVE SER ADICIONADA AO PROJETO EXISTENTE, SEM RECONSTRUIR, SUBSTITUIR OU PREJUDICAR NENHUMA FUNCIONALIDADE DAS ETAPAS ANTERIORES.**

O módulo deverá ser independente, integrado aos dados e serviços existentes e funcionar mesmo que suas notificações ou análises estejam desativadas.

O sistema deverá seguir o fluxo:

**COLETAR MÉTRICAS → COMPARAR PERÍODOS → IDENTIFICAR VARIAÇÕES → VALIDAR A QUALIDADE DOS DADOS → CLASSIFICAR A GRAVIDADE → NOTIFICAR → EXIBIR ANÁLISE → PERMITIR AÇÃO MANUAL.**

Não implementar pausas, alterações de orçamento, edição de anúncios ou qualquer outra ação automática nesta etapa.

---

# 2. ETAPA 37.0 — AUDITORIA OBRIGATÓRIA

Antes de desenvolver qualquer funcionalidade, realizar uma auditoria técnica completa do Backstage Flow.

Identificar:

* Arquitetura atual do frontend e backend.
* Banco de dados utilizado e estrutura das tabelas.
* Sistema de autenticação e permissões.
* Módulo atual de dashboard.
* Módulos de Meta Ads e Google Ads.
* Estrutura de campanhas, conjuntos de anúncios e anúncios.
* Identificação e relacionamento dos criativos.
* Histórico de métricas armazenadas.
* Frequência de sincronização das plataformas.
* Serviços de integração com as APIs.
* Sistema de notificações já existente.
* Sistema de logs e auditoria.
* Estrutura multiempresa ou multi-tenant, se existente.
* Recursos de gráficos e componentes visuais já disponíveis.
* Possibilidade de consultar métricas históricas por dia.
* Identificação de quais indicadores estão efetivamente disponíveis em cada plataforma.

## 2.1. Verificação do histórico de métricas

Verificar se o sistema já armazena dados históricos suficientes para realizar comparações confiáveis.

Determinar:

* Quais métricas são armazenadas.
* Qual é a granularidade temporal dos dados.
* Se existem registros diários por campanha, conjunto de anúncios e anúncio.
* Se é possível identificar os criativos associados aos anúncios.
* Se existem lacunas nos dados históricos.
* Se os dados são atualizados retroativamente.
* Se há diferenças entre as métricas retornadas pelas plataformas e as armazenadas no sistema.

Se o histórico não for suficiente, apresentar uma estratégia para começar a armazenar snapshots diários, sem apagar ou modificar os dados existentes.

Não inventar métricas históricas nem preencher lacunas com valores estimados sem identificá-los claramente.

## 2.2. Regras da auditoria

1. Não modificar o código durante a auditoria.
2. Não criar tabelas ou migrations antes de conhecer a estrutura existente.
3. Não implementar alertas com dados simulados em produção.
4. Identificar os componentes e serviços que podem ser reutilizados.
5. Apresentar os arquivos que serão criados ou modificados.
6. Apresentar os riscos de compatibilidade e de desempenho.
7. Propor a arquitetura do monitoramento e das notificações.
8. Identificar os limites das APIs e dos dados disponíveis.
9. Apresentar um plano de testes e validação.
10. Aguardar autorização expressa antes de iniciar a implementação.

**Ao finalizar a auditoria, apresentar o diagnóstico e interromper o processo até receber autorização para implementar.**

---

# 3. OBJETIVO DA FUNCIONALIDADE

Criar um sistema de monitoramento contínuo das campanhas de Meta Ads e Google Ads, capaz de identificar mudanças relevantes de desempenho e comunicar essas mudanças aos responsáveis.

O sistema deverá permitir que o gestor:

* Identifique rapidamente campanhas com aumento no custo por resultado.
* Identifique criativos cujo desempenho piorou significativamente.
* Visualize quedas no volume de resultados.
* Acompanhe aumentos de CPM, CPC e outros custos.
* Compare períodos diários, semanais e quinzenais.
* Consulte tendências de desempenho.
* Receba alertas de situações importantes.
* Visualize quais clientes e contas precisam de atenção.
* Identifique anúncios com dados insuficientes para uma conclusão.
* Abra diretamente a campanha ou o anúncio na plataforma de origem.
* Registre se o alerta foi analisado e qual providência foi tomada.

O sistema deverá reduzir a necessidade de abrir cada conta e verificar manualmente cada campanha.

---

# 4. ETAPA 37.1 — NOVO MÓDULO DE MONITORAMENTO

Adicionar ao Backstage Flow uma nova área chamada:

**Monitoramento de Desempenho**

O módulo deverá estar acessível pelo menu principal ou por uma aba específica dentro do dashboard, de acordo com a arquitetura e os padrões de navegação existentes.

A recomendação é possuir uma página independente, com acesso rápido pelo dashboard geral.

## 4.1. Navegação do módulo

Criar as seguintes abas:

1. **Visão Geral**
2. **Alertas**
3. **Campanhas**
4. **Criativos**
5. **Comparativos**
6. **Histórico**
7. **Configurações**

As abas deverão compartilhar filtros e informações contextuais quando apropriado.

## 4.2. Integração com o dashboard atual

Não substituir nem reconstruir o dashboard existente.

Adicionar uma área de monitoramento contendo:

* Alertas críticos ativos.
* Campanhas com variação relevante.
* Criativos que precisam de atenção.
* Clientes com alertas pendentes.
* Resumo de desempenho comparativo.
* Indicador de última sincronização.
* Botão para acessar o Monitoramento de Desempenho.

Permitir que o usuário escolha se deseja visualizar um resumo compacto ou acessar a página completa.

---

# 5. ETAPA 37.2 — MONITORAMENTO DE MÉTRICAS

O sistema deverá monitorar as métricas disponíveis nas contas de Meta Ads e Google Ads já conectadas ao Backstage Flow.

## 5.1. Métricas principais

Monitorar, quando disponíveis:

* Investimento.
* Resultados.
* Custo por resultado.
* Leads.
* Mensagens iniciadas.
* Compras ou conversões.
* Receita.
* ROAS.
* Impressões.
* Alcance, quando aplicável.
* Frequência, quando aplicável.
* CPM.
* CPC.
* CTR.
* Cliques.
* Visualizações de vídeo.
* Taxas de conversão.
* Métricas específicas da plataforma e do objetivo da campanha.

Não presumir que todas as métricas existem para todas as campanhas.

A interface deverá apresentar apenas os indicadores compatíveis com a plataforma, objetivo e dados efetivamente disponíveis.

## 5.2. Monitoramento em diferentes níveis

Permitir monitorar os indicadores em diferentes níveis:

* Conta de anúncios.
* Campanha.
* Conjunto de anúncios.
* Anúncio.
* Criativo, quando for possível identificar e relacionar o ativo criativo.

O sistema deverá preservar a hierarquia das campanhas e permitir navegar entre os níveis.

## 5.3. Identificação dos criativos

Para monitorar o desempenho dos criativos, utilizar os identificadores existentes dos anúncios e dos respectivos ativos, sempre que disponíveis.

Apresentar:

* Nome do anúncio.
* Nome da campanha.
* Conjunto de anúncios.
* Cliente.
* Conta de anúncios.
* Plataforma.
* Identificador do anúncio.
* Identificador do criativo, quando disponível.
* Miniatura ou prévia do criativo, se disponível.
* Data de início.
* Status atual.
* Métricas comparativas.

Se o mesmo criativo estiver sendo utilizado em mais de um anúncio ou campanha, apresentar os dados individualizados e, quando tecnicamente confiável, uma visão consolidada claramente identificada.

Não agrupar criativos apenas porque possuem nomes parecidos.

---

# 6. ETAPA 37.3 — COMPARAÇÃO DE PERÍODOS

Criar um sistema de comparação de métricas que permita identificar mudanças de desempenho em diferentes intervalos.

## 6.1. Períodos predefinidos

Disponibilizar os seguintes períodos:

* Hoje até o momento.
* Ontem.
* Últimas 24 horas, quando suportado pelos dados.
* Últimos 3 dias.
* Últimos 7 dias.
* Últimos 14 dias.
* Últimos 30 dias.
* Semana atual.
* Semana anterior.
* Mês atual.
* Mês anterior.
* Período personalizado.

## 6.2. Comparação com períodos anteriores

Para os períodos selecionados, disponibilizar comparações equivalentes.

Exemplos:

* Últimos 3 dias versus os 3 dias anteriores.
* Últimos 7 dias versus os 7 dias anteriores.
* Últimos 14 dias versus os 14 dias anteriores.
* Semana atual versus semana anterior, respeitando a quantidade de dias decorridos.
* Mês atual até hoje versus o mesmo número de dias do mês anterior.
* Período personalizado versus período anterior de igual duração.

Não comparar períodos de durações diferentes sem deixar isso explícito na interface.

## 6.3. Comparação diária

Criar uma visualização diária que permita identificar mudanças de um dia para o outro.

Exibir:

* Valor do indicador no dia atual.
* Valor no dia anterior.
* Diferença absoluta.
* Variação percentual.
* Tendência recente.
* Indicador de qualidade dos dados.

Considerar o fuso horário da conta ou a configuração já utilizada no sistema.

Evitar comparar um dia incompleto com um dia completo como se fossem períodos equivalentes.

Quando os dados do dia ainda estiverem sendo coletados, identificá-los como parciais.

## 6.4. Cálculo das variações

Para métricas em que uma variação percentual seja matematicamente aplicável:

$$
\text{Variação (\%)} =
\frac{\text{Valor atual} - \text{Valor anterior}}
{\text{Valor anterior}} \times 100
$$

Exemplo:

* Custo por resultado anterior: R$ 20,00.
* Custo por resultado atual: R$ 30,00.
* Aumento: 50%.

Quando o valor anterior for zero ou inexistente, não apresentar uma porcentagem enganosa. Utilizar uma indicação como:

* Novo resultado.
* Sem base comparativa.
* Dados insuficientes.

Para métricas em que valores menores são desejáveis, como custo por resultado, CPC e CPM, uma variação positiva representa aumento de custo, não melhora de desempenho.

Para métricas em que valores maiores podem ser desejáveis, como resultados, receita ou ROAS, interpretar a variação de acordo com o indicador.

---

# 7. ETAPA 37.4 — DETECÇÃO DE VARIAÇÕES E ANOMALIAS

Criar um mecanismo de identificação de variações relevantes.

O objetivo é detectar alterações que merecem atenção, sem inundar o gestor com alertas insignificantes.

## 7.1. Regras configuráveis

Permitir configurar limites de variação para cada métrica.

Exemplos de configuração inicial:

| Indicador           | Variação de atenção | Variação crítica |
| ------------------- | ------------------: | ---------------: |
| Custo por resultado |      Aumento de 20% |   Aumento de 40% |
| CPC                 |      Aumento de 20% |   Aumento de 40% |
| CPM                 |      Aumento de 20% |   Aumento de 40% |
| CTR                 |        Queda de 15% |     Queda de 30% |
| Resultados          |        Queda de 20% |     Queda de 40% |
| ROAS                |        Queda de 20% |     Queda de 40% |

Esses valores são sugestões iniciais de configuração, não regras universais de desempenho.

O administrador deverá poder ajustar os limites globalmente e por cliente, conta, campanha ou indicador, respeitando a hierarquia de configurações.

## 7.2. Tipos de variação

Identificar:

* Aumento repentino de custo.
* Aumento progressivo de custo.
* Queda expressiva de resultados.
* Queda de CTR.
* Aumento expressivo de CPM.
* Aumento de CPC.
* Redução de ROAS.
* Mudança brusca no investimento.
* Anúncio sem resultados após atingir critérios mínimos.
* Alteração significativa em relação à média recente.
* Recuperação de desempenho após uma queda.

## 7.3. Detecção de anomalias

Além dos limites percentuais fixos, permitir a detecção de alterações fora do padrão recente do próprio anúncio ou campanha.

A análise poderá utilizar:

* Média móvel.
* Mediana dos períodos anteriores.
* Variação diária.
* Desvio em relação ao histórico.
* Tendência recente.
* Comparação com períodos equivalentes.

Começar com métodos determinísticos, transparentes e explicáveis.

Não exigir IA para calcular variações ou detectar anomalias.

A identificação de uma anomalia deverá mostrar qual regra foi acionada e quais dados justificaram o alerta.

## 7.4. Volume mínimo de dados

Para evitar falsos positivos, configurar condições mínimas antes de gerar alertas conclusivos.

Exemplos:

* Investimento mínimo no período.
* Número mínimo de resultados.
* Quantidade mínima de dias com dados válidos.
* Existência de um período comparável.
* Disponibilidade de dados suficientemente atualizados.

Os valores deverão ser configuráveis e ajustáveis por métrica, objetivo e nível de análise.

Quando os critérios mínimos não forem cumpridos, o sistema poderá apresentar um aviso informativo, mas deverá identificar claramente que a amostra é insuficiente.

Não declarar que um criativo está ruim ou que uma campanha deve ser pausada apenas com base em poucos cliques ou poucos resultados.

## 7.5. Controle de sazonalidade e contexto

Quando tecnicamente possível, considerar:

* Dias da semana.
* Feriados.
* Períodos promocionais.
* Alterações de orçamento.
* Alterações de status.
* Início recente de campanhas.
* Mudanças de objetivo.
* Períodos de aprendizagem, quando essa informação estiver disponível.
* Diferenças entre períodos parciais e completos.

Esses fatores devem ser apresentados como contexto observável, não como explicações causais definitivas.

---

# 8. ETAPA 37.5 — CLASSIFICAÇÃO DOS ALERTAS

Criar um sistema visual de classificação para facilitar a priorização.

## 8.1. Níveis de prioridade

**Crítico — Vermelho**

Utilizar quando uma variação ultrapassar os limites críticos configurados e atender aos critérios mínimos de qualidade dos dados.

Exemplos:

* Aumento muito elevado do custo por resultado.
* Queda acentuada de conversões.
* Redução expressiva de ROAS.
* Desempenho fora dos limites definidos pelo gestor.

**Atenção — Laranja**

Utilizar quando a variação ultrapassar o limite de atenção, mas não atingir o nível crítico.

Exemplos:

* Aumento relevante do CPC.
* Aumento do CPM.
* Queda significativa de CTR.
* Aumento progressivo do custo por resultado.

**Informativo — Azul**

Utilizar para mudanças que merecem acompanhamento, mas não indicam necessariamente um problema.

Exemplos:

* Alteração de investimento.
* Mudança de status.
* Nova campanha sem histórico suficiente.
* Mudança recente em uma métrica.

**Normal — Verde**

Utilizar para indicar estabilidade ou recuperação de indicadores monitorados, sem afirmar que o desempenho geral está necessariamente bom.

## 8.2. Regras de classificação

A gravidade deverá ser determinada com base em:

* Magnitude da variação.
* Métrica afetada.
* Volume de dados.
* Recência dos dados.
* Regras configuradas.
* Contexto disponível.

O sistema deverá distinguir claramente:

* Alerta confirmado pelos dados disponíveis.
* Sinal de atenção com amostra limitada.
* Variação informativa.
* Alerta resolvido.

Não utilizar linguagem sensacionalista nem afirmar causalidade sem evidência.

---

# 9. ETAPA 37.6 — CENTRAL DE ALERTAS

Criar uma central única para reunir todos os alertas gerados pelo monitoramento.

## 9.1. Informações de cada alerta

Cada alerta deverá exibir:

* Prioridade.
* Cliente.
* Plataforma.
* Conta de anúncios.
* Campanha.
* Conjunto de anúncios, quando aplicável.
* Anúncio ou criativo, quando aplicável.
* Métrica afetada.
* Valor atual.
* Valor anterior.
* Variação absoluta.
* Variação percentual.
* Período analisado.
* Data e hora da detecção.
* Última atualização dos dados.
* Regra que gerou o alerta.
* Qualidade ou suficiência dos dados.
* Link para o registro correspondente.
* Estado de tratamento.

## 9.2. Estados do alerta

Disponibilizar:

* Novo.
* Visualizado.
* Em análise.
* Aguardando ação.
* Resolvido.
* Ignorado.

Registrar o usuário responsável por cada mudança de estado e o momento em que ela ocorreu.

## 9.3. Ações disponíveis

Permitir:

* Abrir detalhes.
* Abrir a campanha na plataforma de origem.
* Abrir o anúncio, quando houver um link válido.
* Visualizar os dados comparativos.
* Marcar como visualizado.
* Assumir o alerta.
* Atribuir a outro responsável.
* Adicionar comentário.
* Registrar uma providência.
* Marcar como resolvido.
* Ignorar o alerta, informando o motivo quando necessário.

O botão para abrir a plataforma deverá utilizar um link efetivamente disponível e validado. Não construir URLs de anúncios por suposição.

## 9.4. Agrupamento de alertas

Evitar gerar dezenas de alertas repetidos sobre a mesma ocorrência.

Permitir agrupar alertas relacionados por:

* Cliente.
* Conta.
* Campanha.
* Anúncio.
* Criativo.
* Métrica.
* Regra.
* Intervalo de tempo.

Quando a mesma condição persistir, atualizar o alerta existente em vez de criar um novo a cada sincronização, conforme a política de recorrência configurada.

## 9.5. Alertas reincidentes

Se um alerta resolvido voltar a ocorrer, criar uma nova ocorrência ou reabrir o alerta, de acordo com a configuração definida.

Preservar o histórico anterior e indicar que se trata de uma reincidência.

---

# 10. ETAPA 37.7 — NOTIFICAÇÕES AUTOMÁTICAS

O sistema deverá notificar os usuários responsáveis sem exigir que estejam acessando o dashboard constantemente.

Reutilizar o sistema de notificações atual, caso exista.

## 10.1. Canais de notificação

Implementar inicialmente as notificações internas do Backstage Flow.

Deixar a arquitetura preparada para possíveis integrações futuras com:

* E-mail.
* WhatsApp.
* Outros canais externos autorizados.

Não presumir que integrações externas estão configuradas. Apresentar as dependências e os requisitos durante a auditoria.

## 10.2. Destinatários

Permitir configurar os destinatários por:

* Administrador.
* Gestor de tráfego.
* Account Manager.
* Responsável pela conta.
* Responsável pelo cliente.
* Usuários selecionados.
* Grupo ou setor autorizado.

Respeitar as permissões de acesso aos clientes e contas.

## 10.3. Configuração de notificações

Permitir que cada usuário escolha quais alertas deseja receber.

Opções:

* Alertas críticos.
* Alertas de atenção.
* Alertas informativos.
* Alertas de campanhas específicas.
* Alertas de determinados clientes.
* Resumo diário.
* Resumo semanal.

Permitir configurar horários de recebimento e períodos de silêncio, quando aplicável.

## 10.4. Notificações imediatas e resumos

Permitir dois modelos de entrega:

**Imediato:** para alertas críticos ou condições selecionadas pelo administrador.

**Resumo periódico:** consolidação dos alertas de atenção e informativos em horários configurados.

O usuário deverá poder configurar a frequência de recebimento sem alterar a frequência de coleta de métricas.

## 10.5. Controle contra excesso de notificações

Implementar:

* Deduplicação.
* Agrupamento.
* Intervalos de silêncio por alerta.
* Limites de frequência.
* Controle de notificações repetidas.
* Preferências individuais.
* Histórico de entrega.

Uma notificação não deverá ser marcada como entregue se o serviço de envio não confirmar a operação.

---

# 11. ETAPA 37.8 — ANÁLISE VISUAL DE CAMPANHAS E CRIATIVOS

Criar uma área visual para identificar rapidamente quais campanhas e criativos apresentam mudanças relevantes.

## 11.1. Tabela de desempenho

Exibir uma tabela com:

| Cliente   | Campanha   | Criativo  | Indicador           |   Atual | Anterior | Variação | Status  |
| --------- | ---------- | --------- | ------------------- | ------: | -------: | -------: | ------- |
| Cliente A | Campanha X | Vídeo 01  | Custo por resultado |   R$ 30 |    R$ 20 |     +50% | Crítico |
| Cliente B | Campanha Y | Imagem 02 | CPC                 | R$ 1,80 |  R$ 1,50 |     +20% | Atenção |

Os dados acima são apenas exemplos de apresentação. Em produção, a tabela deverá ser alimentada exclusivamente por dados reais.

Permitir ordenar por prioridade, maior variação, cliente, campanha, métrica e data.

## 11.2. Visualização dos criativos

Quando houver uma imagem ou prévia disponível, apresentar miniatura do criativo.

Ao selecionar o criativo, abrir um painel com:

* Prévia.
* Nome do anúncio.
* Campanha.
* Conjunto de anúncios.
* Plataforma.
* Métricas atuais.
* Métricas anteriores.
* Gráfico de tendência.
* Alertas associados.
* Histórico de alterações, quando disponível.
* Link para abrir o anúncio na plataforma.

Se não houver prévia disponível, apresentar um identificador ou nome do anúncio, sem exibir uma imagem incorreta.

## 11.3. Identificação visual

Utilizar cores e indicadores claros para destacar:

* Aumento de custos.
* Queda de resultados.
* Queda de CTR.
* Redução de ROAS.
* Estabilidade.
* Recuperação.
* Dados insuficientes.

As cores deverão ser consistentes com a identidade visual do Backstage Flow e com a referência de interface já adotada.

## 11.4. Visualização rápida

O gestor deverá conseguir identificar, sem abrir cada campanha:

* Qual cliente possui um alerta.
* Qual campanha está envolvida.
* Qual criativo está envolvido.
* Qual métrica mudou.
* Quanto mudou.
* Em qual período ocorreu a mudança.
* Qual é a gravidade.
* Quando os dados foram atualizados.
* Onde abrir a campanha para investigar.

---

# 12. ETAPA 37.9 — GRÁFICOS E TENDÊNCIAS

Criar gráficos para acompanhar as variações dos principais indicadores.

## 12.1. Gráficos por campanha

Permitir visualizar a evolução de:

* Custo por resultado.
* Investimento.
* Resultados.
* CPC.
* CPM.
* CTR.
* ROAS.
* Receita, quando disponível.

## 12.2. Gráficos por criativo

Permitir comparar os anúncios e criativos de uma mesma campanha, desde que os dados sejam compatíveis.

Exibir:

* Evolução diária.
* Média do período.
* Variação entre períodos.
* Investimento acumulado.
* Volume de resultados.
* Indicadores de alerta.

Não comparar diretamente métricas de objetivos ou eventos diferentes sem contextualizar essa diferença.

## 12.3. Seleção de período

Permitir selecionar:

* 3 dias.
* 7 dias.
* 14 dias.
* 30 dias.
* Período personalizado.

Permitir alternar entre visualização diária e agregada.

## 12.4. Comparação de tendências

Permitir visualizar o período atual e o período anterior no mesmo gráfico, com legenda clara.

Identificar visualmente períodos incompletos, falhas de sincronização e ausência de dados.

---

# 13. ETAPA 37.10 — REGRAS PERSONALIZADAS DE MONITORAMENTO

Criar uma área para o administrador ou usuário autorizado configurar regras específicas.

## 13.1. Configuração das regras

Cada regra deverá permitir:

* Nome.
* Descrição.
* Plataforma.
* Cliente.
* Conta.
* Campanha.
* Anúncio ou criativo, quando aplicável.
* Métrica monitorada.
* Condição.
* Limite.
* Período de comparação.
* Volume mínimo de dados.
* Prioridade.
* Destinatários.
* Frequência de avaliação.
* Frequência máxima de notificação.
* Status ativo ou inativo.

## 13.2. Exemplos de regras

**Regra 1 — Aumento do custo por resultado**

Se o custo por resultado aumentar mais de 30% em comparação com os 7 dias anteriores, e houver volume mínimo de investimento e resultados, gerar um alerta de atenção.

**Regra 2 — Aumento crítico do custo**

Se o custo por resultado aumentar mais de 50% em comparação com o período anterior equivalente, atendendo aos critérios mínimos de dados, gerar um alerta crítico.

**Regra 3 — Queda de resultados**

Se o volume de resultados cair mais de 40% em relação ao período comparável, verificar se houve mudança relevante no investimento e gerar um alerta contextualizado.

**Regra 4 — Aumento de CPM**

Se o CPM aumentar acima do limite configurado, comparar também investimento, impressões e CTR, quando disponíveis.

**Regra 5 — Queda de CTR**

Se o CTR cair além do limite definido, gerar um alerta de atenção, desde que exista amostra suficiente.

**Regra 6 — Campanha sem resultados**

Se uma campanha ativa acumular investimento acima de um limite configurado sem gerar resultados, emitir um alerta informativo ou de atenção, conforme a configuração.

**Regra 7 — Alerta por cliente**

Permitir que um cliente possua limites diferentes dos limites globais.

**Regra 8 — Monitoramento de criativos**

Permitir configurar regras específicas para acompanhar o custo por resultado e outras métricas de anúncios individuais.

Esses exemplos deverão ser editáveis e desativáveis. Não devem ser interpretados como recomendações universais para todos os clientes.

## 13.3. Hierarquia de configuração

Respeitar a seguinte hierarquia:

1. Configuração global.
2. Configuração por cliente.
3. Configuração por conta.
4. Configuração por campanha.
5. Configuração por anúncio ou criativo.

Uma configuração mais específica poderá sobrescrever a configuração geral quando isso estiver explicitamente definido.

Exibir qual regra foi efetivamente aplicada ao gerar cada alerta.

---

# 14. ETAPA 37.11 — FREQUÊNCIA DE MONITORAMENTO E SINCRONIZAÇÃO

Separar a frequência de coleta dos dados da frequência de avaliação e da frequência de notificações.

## 14.1. Coleta de métricas

Reutilizar a sincronização existente sempre que possível.

Verificar os limites e a frequência permitida pelas APIs conectadas antes de configurar novas rotinas.

Permitir uma frequência adequada às capacidades do sistema e das plataformas, sem realizar requisições desnecessárias.

## 14.2. Avaliação de variações

Permitir configurar a avaliação das regras em intervalos como:

* A cada 15 minutos.
* A cada 30 minutos.
* A cada hora.
* A cada 3 horas.
* A cada 6 horas.
* Uma vez ao dia.

A disponibilidade de cada intervalo deverá depender da frequência real de atualização dos dados.

Não avaliar repetidamente dados que não foram atualizados, salvo quando uma regra exigir uma reavaliação específica.

## 14.3. Indicador de atualização

Exibir no módulo:

* Última sincronização.
* Próxima sincronização prevista, quando disponível.
* Última avaliação das regras.
* Estado da conexão.
* Situação da coleta.
* Eventuais erros ou atrasos.

## 14.4. Falhas de sincronização

Se a coleta falhar:

* Não gerar alertas de desempenho baseados em dados inválidos.
* Identificar a conta afetada.
* Registrar o erro.
* Permitir nova tentativa conforme a política existente.
* Informar ao usuário que os dados podem estar desatualizados.
* Evitar apresentar indicadores incompletos como se fossem atuais.

---

# 15. ETAPA 37.12 — HISTÓRICO DE ALERTAS E PROVIDÊNCIAS

Criar um histórico pesquisável de alertas e decisões humanas.

## 15.1. Registro do alerta

Armazenar:

* Identificador.
* Cliente.
* Conta.
* Campanha.
* Anúncio ou criativo.
* Métrica.
* Período analisado.
* Valores comparados.
* Variação calculada.
* Regra acionada.
* Gravidade.
* Data da detecção.
* Estado atual.
* Responsável pelo tratamento.

## 15.2. Registro de providências

Permitir registrar o que foi feito após a identificação do alerta.

Exemplos:

* Campanha revisada.
* Criativo analisado.
* Orçamento conferido.
* Segmentação conferida.
* Alteração realizada diretamente na plataforma.
* Nenhuma alteração necessária.
* Aguardando novos dados.
* Alerta ignorado por contexto específico.

Permitir incluir observações, data e usuário responsável.

O sistema não deverá afirmar que uma alteração foi realizada na Meta ou no Google se não houver integração e confirmação da ação.

## 15.3. Avaliação posterior

Permitir acompanhar o desempenho após uma providência manual.

Exemplo:

* Alerta detectado.
* Gestor registra que revisou a campanha.
* Gestor informa que realizou uma alteração externa.
* Sistema continua monitorando.
* O alerta é atualizado ou resolvido conforme os dados e critérios definidos.

A avaliação posterior deverá mostrar a evolução dos indicadores, sem atribuir automaticamente a melhora ou piora à ação realizada.

---

# 16. ETAPA 37.13 — TELA DE VISÃO GERAL

Criar uma página principal de monitoramento com leitura rápida e foco em produtividade.

## 16.1. Cabeçalho

Exibir:

* Título: Monitoramento de Desempenho.
* Período selecionado.
* Filtros de cliente, plataforma e conta.
* Estado da sincronização.
* Data da última atualização.
* Botão de configurações, conforme permissões.

## 16.2. Cartões de resumo

Exibir:

* Alertas críticos ativos.
* Alertas de atenção.
* Campanhas com variações relevantes.
* Criativos sinalizados.
* Clientes com alertas.
* Alertas aguardando análise.

## 16.3. Lista de prioridades

Apresentar uma lista ordenada por gravidade e recência, com os alertas mais importantes primeiro.

Cada item deverá mostrar o cliente, campanha, criativo, métrica, variação, período e link para detalhes.

A ordenação deverá ser transparente e baseada nas regras configuradas, sem gerar uma pontuação oculta de qualidade de campanha.

## 16.4. Resumo por cliente

Exibir os clientes com alertas ativos, permitindo expandir cada cliente para visualizar as campanhas e anúncios relacionados.

## 16.5. Resumo por plataforma

Separar os indicadores de Meta Ads e Google Ads, sem misturar métricas incompatíveis.

---

# 17. ETAPA 37.14 — EXPERIÊNCIA VISUAL E USABILIDADE

A interface deverá seguir o design atual do Backstage Flow, com fundo claro, componentes consistentes e cores funcionais para a leitura rápida.

## 17.1. Identidade visual

Utilizar a identidade já adotada pelo sistema, mantendo uma aparência profissional.

Sugestão de cores:

* Roxo para elementos principais.
* Vermelho para alertas críticos.
* Laranja para atenção.
* Azul para informações.
* Verde para estabilidade ou recuperação.
* Cinza para informações neutras.

## 17.2. Componentes

Utilizar:

* Cards de indicadores.
* Tabelas com filtros.
* Gráficos de tendências.
* Badges de prioridade.
* Ícones consistentes.
* Miniaturas dos criativos.
* Painéis laterais de detalhes.
* Menus de ações.
* Indicadores de carregamento.
* Mensagens de erro e sucesso.

## 17.3. Responsividade

Garantir compatibilidade com:

* Desktop.
* Notebook.
* Tablet.
* Celular.

No celular, priorizar a leitura dos alertas e o acesso às informações essenciais.

## 17.4. Acessibilidade

Garantir:

* Contraste adequado.
* Textos legíveis.
* Identificação de estados não dependente exclusivamente de cores.
* Navegação por teclado, quando aplicável.
* Rótulos claros para controles e gráficos.

---

# 18. ETAPA 37.15 — BANCO DE DADOS E PERSISTÊNCIA

Antes de criar estruturas, verificar se o sistema já possui tabelas adequadas para métricas históricas, notificações e auditoria.

Reutilizar as estruturas existentes quando apropriado.

Criar somente o necessário para suportar:

* Configurações de monitoramento.
* Regras de alerta.
* Snapshots históricos, caso ainda não existam.
* Ocorrências de alertas.
* Histórico de notificações.
* Preferências de usuários.
* Providências registradas.
* Execuções de avaliação.
* Logs de sincronização, se necessário.

A modelagem deverá seguir os padrões do projeto e preservar a compatibilidade com os dados existentes.

## 18.1. Integridade dos dados

Garantir:

* Relacionamentos válidos.
* Índices para consultas frequentes.
* Identificação única das ocorrências.
* Deduplicação de alertas.
* Persistência do histórico.
* Tratamento de atualizações concorrentes.
* Controle de acesso por organização.
* Migrations seguras e reversíveis, quando aplicável.

## 18.2. Histórico diário

Se não houver dados históricos diários suficientes, implementar um mecanismo de captura e armazenamento progressivo.

Não reconstruir retrospectivamente métricas que não estejam disponíveis nas fontes confiáveis.

Identificar claramente:

* Dados históricos reais.
* Dados coletados após a implementação.
* Períodos sem dados.
* Dados parciais.
* Dados atualizados retroativamente pela plataforma.

---

# 19. ETAPA 37.16 — SEGURANÇA E PERMISSÕES

Reutilizar o sistema atual de autenticação e autorização.

Criar permissões específicas para:

* Visualizar monitoramento.
* Visualizar alertas.
* Visualizar clientes e contas monitoradas.
* Gerenciar regras.
* Configurar notificações.
* Atribuir alertas.
* Registrar providências.
* Marcar alertas como resolvidos.
* Consultar históricos.
* Administrar o módulo.

Restringir os dados conforme as permissões do usuário, cliente, conta e organização.

Todas as validações deverão ocorrer no backend.

Não permitir que um usuário visualize dados de clientes ou contas aos quais não tenha acesso.

---

# 20. ETAPA 37.17 — DESEMPENHO E OTIMIZAÇÃO DE CUSTOS

O módulo deverá ser eficiente e não causar sobrecarga nas APIs ou no banco de dados.

Implementar, conforme necessário:

* Reutilização dos dados já sincronizados.
* Avaliação incremental de métricas.
* Consultas otimizadas.
* Processamento em segundo plano.
* Cache controlado.
* Deduplicação.
* Limites de requisição.
* Retentativas com espera progressiva.
* Monitoramento de falhas.
* Paginação de históricos.
* Carregamento sob demanda.

Não utilizar IA como requisito para o funcionamento do monitoramento.

As comparações, cálculos, regras e classificações iniciais deverão ser determinísticos e explicáveis.

---

# 21. ETAPA 37.18 — INTEGRAÇÃO COM OS MÓDULOS EXISTENTES

## 21.1. Dashboard

Adicionar acesso ao monitoramento e um resumo dos alertas, preservando todos os componentes e indicadores atuais.

## 21.2. Meta Ads

Utilizar as contas, campanhas, anúncios, métricas e identificadores já disponíveis no sistema.

Criar links para os registros da plataforma quando os dados necessários estiverem disponíveis.

## 21.3. Google Ads

Utilizar os dados existentes, respeitando as diferenças entre os tipos de campanha, conversões e métricas da plataforma.

## 21.4. Clientes

Permitir visualizar os alertas relacionados a um cliente na sua ficha existente, sem duplicar o cadastro.

## 21.5. Central de Operações

Se a Etapa 36 já estiver implementada, permitir que um usuário autorizado converta um alerta em uma tarefa operacional.

A tarefa deverá incluir:

* Cliente.
* Plataforma.
* Conta.
* Campanha.
* Anúncio ou criativo, quando disponível.
* Métrica afetada.
* Variação identificada.
* Período comparado.
* Link para o alerta.
* Descrição da ocorrência.

A criação da tarefa deverá ser explícita, sem gerar tarefas automaticamente por padrão.

---

# 22. ETAPA 37.19 — TESTES E VALIDAÇÃO

Executar testes funcionais, de integração, segurança, desempenho e regressão.

## 22.1. Testes de métricas

Validar:

* Cálculo percentual.
* Diferença absoluta.
* Comparação de períodos equivalentes.
* Tratamento de valores zero.
* Dados parciais.
* Dados ausentes.
* Fuso horário.
* Métricas incompatíveis.
* Identificação de anúncios e criativos.
* Precisão das regras de alerta.

## 22.2. Testes de alertas

Validar:

* Geração de alerta.
* Classificação de gravidade.
* Critérios mínimos de dados.
* Deduplicação.
* Agrupamento.
* Reincidência.
* Alteração de status.
* Atribuição de responsáveis.
* Registro de providências.
* Resolução de alertas.

## 22.3. Testes de notificações

Validar:

* Destinatários corretos.
* Preferências individuais.
* Notificações imediatas.
* Resumos periódicos.
* Deduplicação.
* Histórico de entrega.
* Falhas de envio.
* Respeito às permissões.

## 22.4. Testes de integração

Validar:

* Meta Ads.
* Google Ads.
* Dashboard existente.
* Cadastro de clientes.
* Cadastro de usuários.
* Histórico de métricas.
* Central de Operações, caso esteja disponível.
* Permissões e isolamento de dados.

## 22.5. Testes de regressão

Confirmar que continuam funcionando:

* Login.
* Clientes.
* Usuários.
* Contas de anúncios.
* Campanhas.
* Métricas.
* Saldos.
* Relatórios.
* Dashboards.
* Integrações.
* Demais módulos já existentes.

Não declarar testes aprovados sem executá-los.

---

# 23. ETAPA 37.20 — CRITÉRIOS DE ACEITE

A etapa somente poderá ser considerada concluída quando:

1. O monitoramento estiver integrado ao Backstage Flow.
2. Os dashboards atuais continuarem funcionando.
3. As métricas reais puderem ser comparadas entre períodos.
4. O sistema identificar variações de custo por resultado.
5. O sistema identificar variações de CPC, CPM, CTR e demais métricas disponíveis.
6. Houver monitoramento por campanha, conjunto e anúncio, conforme os dados disponíveis.
7. Houver identificação dos criativos quando tecnicamente possível.
8. Os alertas considerarem volume mínimo e qualidade dos dados.
9. Os alertas tiverem classificação e justificativa visíveis.
10. A central de alertas permitir filtrar, pesquisar e acompanhar ocorrências.
11. As notificações internas funcionarem de acordo com as permissões.
12. Os alertas repetidos forem controlados.
13. O usuário conseguir abrir a campanha ou anúncio de origem quando houver link válido.
14. O histórico das ocorrências for preservado.
15. O usuário conseguir registrar providências.
16. A configuração das regras for acessível aos usuários autorizados.
17. O monitoramento não depender de IA.
18. O sistema não alterar ou pausar campanhas automaticamente.
19. O módulo não prejudicar os dados nem o funcionamento das etapas anteriores.
20. Os testes de regressão, segurança e integração forem executados e documentados.

---

# 24. ETAPA 37.21 — DOCUMENTAÇÃO E ENTREGA

Ao concluir a implementação, apresentar um relatório técnico contendo:

* Resumo das funcionalidades implementadas.
* Arquitetura adotada.
* Arquivos criados.
* Arquivos modificados.
* Estruturas de dados adicionadas.
* Migrations executadas.
* Métricas monitoradas.
* Regras de alerta disponíveis.
* Frequência de sincronização e avaliação.
* Canais de notificação implementados.
* Permissões configuradas.
* Integrações validadas.
* Testes executados e resultados.
* Limitações conhecidas.
* Instruções para configuração.
* Instruções para utilização.
* Próximas melhorias possíveis.

Não apresentar como funcional uma integração que não tenha sido efetivamente validada.

Não ocultar limitações das APIs, dados ausentes ou funcionalidades pendentes.

---

# 25. PRINCÍPIOS INEGOCIÁVEIS

1. Preservar integralmente as funcionalidades já desenvolvidas no Backstage Flow.
2. Implementar o monitoramento como módulo independente e integrado.
3. Reutilizar as métricas e sincronizações existentes.
4. Não criar bancos de dados paralelos.
5. Não inventar dados históricos.
6. Não comparar períodos incompatíveis sem sinalização.
7. Não gerar alertas conclusivos com amostras insuficientes.
8. Não confundir aumento de custo com melhora de desempenho.
9. Não utilizar IA como requisito para monitoramento.
10. Não pausar campanhas automaticamente.
11. Não modificar orçamentos, anúncios, públicos ou estratégias automaticamente.
12. Não enviar notificações sem respeitar permissões e preferências.
13. Não inundar o usuário com alertas repetidos.
14. Não ocultar falhas de sincronização.
15. Não apresentar dados desatualizados como atuais.
16. Permitir que o gestor tome a decisão final.
17. Registrar os alertas e as providências para consulta posterior.
18. Executar auditoria antes da implementação.
19. Aguardar autorização antes de alterar o projeto.
20. Validar a implementação sem prejudicar os módulos existentes.

---

# DIRETRIZ FINAL

A Etapa 37 deverá transformar o dashboard do Backstage Flow em uma ferramenta proativa de acompanhamento de desempenho, reduzindo a dependência de verificações manuais.

O sistema deverá identificar alterações relevantes nas campanhas e nos criativos, mostrar exatamente quais métricas mudaram, comparar os períodos, classificar a importância do alerta e notificar os responsáveis.

O gestor deverá conseguir abrir o painel e identificar rapidamente quais clientes, campanhas e anúncios precisam de atenção, sem precisar percorrer manualmente todas as contas.

A ferramenta não deverá tomar decisões de otimização pelo usuário. Seu papel será **monitorar, comparar, identificar, explicar e notificar**, deixando a análise final e as alterações nas plataformas sob responsabilidade do gestor.

**FLUXO FINAL:**

**MONITORAMENTO AUTOMÁTICO → DETECÇÃO DE VARIAÇÕES → ALERTA PRIORIZADO → NOTIFICAÇÃO → ANÁLISE DO GESTOR → AÇÃO MANUAL NA PLATAFORMA → ACOMPANHAMENTO DOS RESULTADOS.**

**REGRA DE EXECUÇÃO: PRIMEIRO AUDITAR O BACKSTAGE FLOW. DEPOIS APRESENTAR O PLANO TÉCNICO. SOMENTE APÓS AUTORIZAÇÃO, IMPLEMENTAR A ETAPA 37.**