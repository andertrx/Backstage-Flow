# ETAPA 33 — Agente de IA · **EM ESPERA** (a pedido, 27/09/2026)

Nada do agente foi implementado. Esta pasta guarda tudo o que foi conversado e decidido para retomar depois.

## Arquivos desta pasta
| Arquivo | O que é |
|---|---|
| `PROMPT-ORIGINAL.md` | O prompt da Etapa 33 como você escreveu (33.0 a 33.45) |
| `PROMPT-REVISADO.md` | A versão ajustada ao projeto, dividida nas fases 33.0 a 33.9 — **é a que vale** |
| `33.0-AUDITORIA.md` | Auditoria do sistema atual + plano técnico, tabelas propostas, custos estimados |
| `../PONTO-DE-RESTAURACAO.md` | Como voltar o CRM para a versão anterior ao agente |

## Resumo da conversa

### O que você pediu
- IA que **analisa** as campanhas e faz **recomendações**.
- **Criar campanhas** pelo CRM (manual e com ajuda da IA).
- A IA poder **fazer alterações** nas campanhas.
- Um jeito de **voltar** à versão atual do CRM se não gostar.

### Viabilidade (conclusões)
- **É possível fazer as três coisas.**
- **MCP.** O MCP do Meta funciona no aplicativo do Claude porque ali você autorizou o conector com o seu login. O CRM é outro sistema e não herda isso.
  - **Recomendado:** a IA do CRM usa **ferramentas próprias** do sistema, que chamam a API oficial do Meta/Google pelo servidor. O poder é o mesmo do MCP, mas passando pelas travas do CRM (permissões, limites, aprovação, auditoria, token no cofre).
  - O conector de MCP da API da Anthropic existe (beta). Não está confirmado que o MCP do Meta aceite uso por servidor, então não foi escolhido. Fica como opção futura.
- **Pré-requisitos:**
  1. **Meta:** permissão `ads_management` (em geral com revisão do app / acesso avançado) para alterar ou criar. Hoje o CRM só lê.
  2. **Google Ads:** ainda **não conectado**. Para escrever, o developer token precisa de acesso Básico ou Padrão.
  3. **Chave da Anthropic** (`ANTHROPIC_API_KEY`) nos segredos das Edge Functions do Supabase.

### Principais ajustes feitos no seu prompt
- Etapas 19 e 32 estão em espera, não "0 a 32 funcionando".
- **Tabelas novas permitidas só por adição.** As existentes não são alteradas.
- A **criação de campanhas** entrou como fase própria (33.6). As campanhas **nascem pausadas**.
- As fases de escrita (33.5 em diante) dependem das permissões das plataformas.
- **15/30 min** rodam só as regras (grátis). A IA só é chamada se os dados mudaram, porque cada conta atualiza de hora em hora.
- **O limite principal é o custo em R$**, não 10 mil tokens/dia, que é pouco para uma análise. O custo real é em US$ e a tela mostra a conversão.
- **Ações:**
  - "Excluir" **não existe** no agente; ele usa pausar.
  - Aumentar orçamento, ativar e criar **nunca** são automáticos.
  - O Autônomo só **pausa** e **reduz orçamento**, com limites, depois de um período em Copiloto ou simulação.
- **"Aprender"** significa medir o resultado das ações 3 e 7 dias depois, sem treinar modelo e sem mudar as regras de segurança.
- **Outras proteções:**
  - propostas expiram;
  - nomes de campanha não viram ordens para a IA;
  - o chat usa as permissões de quem pergunta;
  - o cliente não acessa o agente;
  - o motor de alertas existente é reaproveitado.
- **Fases:** 33.0 Auditoria → 33.1 Fundação → 33.2 Regras e agendamento → 33.3 IA e custos → 33.4 Conversa → 33.5 Ações manuais → 33.6 Criar campanhas → 33.7 Copiloto → 33.8 Autônomo limitado → 33.9 Relatórios e testes.

### Estimativa de custo da IA
Valores estimados, a medir na prática, com cotação ilustrativa de R$ 5,50:

| Cenário | Opus 5 | Sonnet 5 |
|---|---|---|
| 2 análises por dia | ≈ R$ 180/mês | ≈ R$ 70/mês |
| 1 análise por dia | metade | metade |

### Ponto de restauração
| Parte | Referência |
|---|---|
| Código | commit `25c5aef` |
| Site | deploy Vercel `web-73f0bowo2` |
| Banco | última migração `20260926225436` |

Guia completo em `../PONTO-DE-RESTAURACAO.md`. Nada do agente foi criado, então não há nada a remover por enquanto.

## Decisões pendentes (para quando retomar)
1. Aprovar a auditoria e as 7 tabelas propostas.
2. Criar a chave da Anthropic (necessária a partir da 33.3).
3. Modelo inicial: Opus 5 ou Sonnet 5.
4. Limites de custo (sugestão: R$ 5/dia e R$ 100/mês) e a cotação para exibir em R$.
5. Quem pode reativar campanha (só admin ou também gestor).
6. Tempo mínimo em Copiloto antes de liberar o Autônomo (sugestão: 14 dias).

## Como retomar
Diga **"vamos retomar a Etapa 33"**. Começo pela **33.1 (Fundação)**, depois de revisar a auditoria com o que tiver mudado no sistema até lá (por exemplo, a Etapa 34).
