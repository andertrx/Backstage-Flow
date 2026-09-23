# 06 — Métricas, datas e moedas

## 1. Definições das métricas

Todas as fórmulas ficam num único lugar (`packages/shared/src/metrics`), usado pelo
site e pelo servidor — assim o número é sempre o mesmo em qualquer tela.

| Métrica | Fórmula | Observação |
|---|---|---|
| Investimento | soma do gasto | na moeda da conta |
| CTR | Cliques ÷ Impressões × 100 | |
| CPC | Investimento ÷ Cliques | |
| CPM | Investimento ÷ Impressões × 1000 | |
| CPL | Investimento ÷ Leads | |
| CPA / Custo por conversão | Investimento ÷ Conversões | |
| Custo por mensagem | Investimento ÷ Mensagens | só Meta |
| ROAS | Receita (valor de conversão) ÷ Investimento | |
| Frequência | Impressões ÷ Alcance | só com alcance do **mesmo período** |
| Custo por resultado | Investimento ÷ Resultados | "resultado" definido por conta |

Regras:
- **Dia/entidade isolado**: priorizamos o valor oficial da plataforma quando ela
  entrega pronto (ex.: CTR do Meta).
- **Períodos e somas de várias contas**: recalculamos a partir das somas (gasto,
  cliques, impressões). Fazer **média de CTRs** daria número errado.
- **Divisão por zero**: mostra "—" (sem dado), nunca 0 nem infinito.
- **Métricas incompatíveis não se misturam**: "clique" do Meta (todos os cliques) é
  diferente de "clique no link"; guardamos os dois e deixamos claro qual está na tela.
  Leads do Meta e do Google podem ser somados no consolidado, mas o detalhamento por
  plataforma fica sempre visível.
- Cada card terá **tooltip** com a definição acima.

## 2. Datas e fuso horário

- Cada conta tem o próprio fuso (vindo da API). Um "dia" é gravado **no fuso da conta**
  (`date: "2026-09-23"`), exatamente como a plataforma o reporta.
- O cliente também tem um fuso (padrão `America/Sao_Paulo`) usado para "Hoje/Ontem" e
  para o fechamento diário.
- Horários de sistema (quando sincronizou) são gravados em UTC e **exibidos** no fuso
  do usuário: "Última sincronização: 23/09/2026 18:20".
- Se contas de um mesmo cliente tiverem fusos diferentes, a tela avisa.

## 3. Moedas

- A moeda vem da conta (`currency`). Suporte inicial completo para **BRL**; estrutura
  pronta para **USD** e **EUR**.
- Rollups são **separados por moeda**. O sistema **nunca soma BRL com USD**.
- Se um dia fizermos conversão, ela será opcional, com a cotação e a data exibidas e o
  aviso "valor convertido".
- Formatação: `R$ 1.250,00` (pt-BR), `US$ 1,250.00`, `€ 1.250,00`.
