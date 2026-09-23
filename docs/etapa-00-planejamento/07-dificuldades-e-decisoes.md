# 07 — Dificuldades técnicas e decisões pendentes

## 1. Dificuldades previstas (e como vamos lidar)

| # | Dificuldade | Impacto | Como lidamos |
|---|---|---|---|
| 1 | **App Review e verificação da empresa no Meta** | Sem isso, só acessamos contas do próprio BM do desenvolvedor | Usar System User do BM da agência; iniciar a verificação cedo |
| 2 | **Developer Token do Google** começa em modo teste | Não lê contas reais até o Google aprovar | Solicitar o nível de acesso logo; desenvolver com conta de teste enquanto isso |
| 3 | **Saldo pré-pago não disponível nas APIs** (Meta e Google) | A tela "Saldo" não terá "saldo disponível" para contas pré-pagas | Mostrar "Informação não disponível pela API." e exibir o que existe (gasto acumulado, limite, valor devido, orçamento da conta). **Nunca inventar.** |
| 4 | **Alcance não soma** entre dias | Alcance de período personalizado pode não estar disponível | Buscar alcance pronto de períodos padrão e guardar em `periodReach` |
| 5 | **Números mudam depois** (atribuição/conversões atrasadas) | Dados de ontem podem mudar hoje | Ressincronizar 7 dias diariamente e 30 dias semanalmente |
| 6 | **Limites de uso das APIs** | Muitas contas → bloqueios temporários | Fila com velocidade controlada, espera crescente, cache no Firebase |
| 7 | **Versões das APIs expiram** | Código para de funcionar quando a versão é aposentada | Versão da API em configuração, adaptadores isolados, alerta de depreciação |
| 8 | **Sem biblioteca oficial Google Ads para Node.js** | — | Usar a interface REST oficial + `google-auth-library` oficial |
| 9 | **Custo do Firestore** com muitas escritas | Sincronizar tudo de hora em hora sai caro | Hora em hora só "hoje" em nível conta/campanha; anúncios 1–2×/dia; escrever só o que mudou |
| 10 | **Plano Blaze obrigatório** | Precisa de cartão cadastrado no Firebase | Configurar alerta de orçamento no Google Cloud |
| 11 | **Fusos diferentes** entre contas de um mesmo cliente | Totais do "dia" podem não bater exatamente | Guardar no fuso da conta e avisar na tela |
| 12 | **Mapeamento de "lead" e "mensagem"** varia por conta | Leads podem ser contados errado | Mapeamento configurável por conta, com padrão e lista original guardada |
| 13 | Tokens pessoais do Meta expiram (~60 dias) | Sincronização para | Preferir System User; alertar antes de expirar quando houver data |

## 2. Estratégia de atualização dos dados (resumo)

- Automática de hora em hora (configurável), com fila e prioridade.
- Botão "Sincronizar agora" com limite de uso.
- Fechamento diário (snapshot do dia) no fuso de cada cliente.
- Backfill ao conectar conta nova.
- Tela mostra sempre "Última sincronização" e "Próxima sincronização".

## 3. O que vou precisar de você (não é para agora — só quando chegarmos lá)

| Quando | O quê |
|---|---|
| Etapa 1 | Um **projeto Firebase** (posso te guiar passo a passo). Idealmente dois: `dev` (testes/demonstração) e `prod` (real). Ativar o plano **Blaze** quando formos usar funções |
| Etapa 3 | Acesso de administrador ao **Business Manager** da agência para criar o App e o System User |
| Etapa 4 | Conta **MCC** do Google Ads da agência e um projeto no **Google Cloud** para o OAuth; solicitar o Developer Token |

Até lá, desenvolvemos e testamos tudo no **emulador local do Firebase** com dados
marcados como **MODO DEMONSTRAÇÃO**.

## 4. Decisões que gostaria que você confirmasse ao aprovar

1. **Stack**: React + Vite + TypeScript no site; Cloud Functions no servidor; Firestore.
2. **Papéis**: administrador, gestor, operador, visualizador **e cliente** (5 papéis —
   junção das Etapas 1 e 20).
3. **Intervalo de sincronização padrão**: 60 minutos.
4. **Retenção de logs técnicos** (`syncRuns`): 400 dias — ou prefere guardar para sempre?
   (Métricas e histórico de negócio: **para sempre**, sem exceção.)
5. **Uma agência só** (a sua) por enquanto. A estrutura permite virar multi-agência
   depois, mas não vamos complicar agora.
