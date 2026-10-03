# Histórico do projeto e das decisões do Ander

> Resumo organizado das conversas até 29/09/2026, para quem continuar o trabalho entender **por que**
> as coisas são como são. Os detalhes de cada etapa estão na pasta dela em `docs/`.
>
> **Por que não está aqui a conversa inteira:** o registro bruto tem mais de 23 MB, quase tudo
> saída de ferramentas (comandos, testes, código). Ele também pode conter dados que não devem ir
> para o GitHub. Por isso ficaram só as **decisões, pedidos e aprendizados** que importam para continuar.

## 1. Como a parceria funciona (o que o Ander espera)
- **Ritmo:**
  - Ele manda o pedido da etapa, muitas vezes um texto longo com dezenas de itens numerados.
  - Pedidos grandes viram **auditoria + plano em fases**, e cada fase só começa com **"pode avançar"**.
  - Em correções, ele pede **"diga antes se entendeu"**. Nesse caso, primeiro se explica o entendimento com base nos dados reais, depois se espera o **"pode fazer"**.
- **Relatórios:** português simples, cerca de 10 seções, tabelas novas explicadas (campos, ligações, índices, guarda) e o fim **"Aguardo o Pode avançar."**
- **Qualidade:**
  - antes de responder, confira nos dados reais (banco, API);
  - teste de banco, de servidor e de navegador em cada fase;
  - ao final, rode o conjunto completo.
- **Ele valoriza:**
  - honestidade sobre limitações ("a API não informa isso");
  - explicar o que depende dele (em `docs/PENDENCIAS.md`);
  - nunca inventar número.
- **Interrupções:** às vezes o limite de uso dele acaba no meio do trabalho. Quando volta, diz "continue". Retome de onde parou, sem repetir o que já foi feito.

## 2. Linha do tempo das etapas
| Etapas | O que foi feito | Decisões marcantes |
|---|---|---|
| 0 | Planejamento: arquitetura, banco, integrações Meta/Google | Supabase + Vercel; toda tabela é explicada e aprovada antes |
| 1–2 | Login, usuários, papéis (admin, gestor, operador, visualizador, cliente); clientes | O banco confere o papel a cada pedido (RLS), não só o login |
| 3–4 | Conexão Meta Ads e Google Ads (contas, BM/MCC) | Só APIs oficiais; tokens no cofre |
| 5, 23 | Banco histórico (métricas diárias, partições) | Histórico nunca é apagado |
| 6 | Dashboard principal | Moedas separadas, nunca somar BRL com USD |
| 7 | Saldo das contas | Média de gasto dos **2 dias anteriores** (antes eram 7; mudou a pedido em 27/09) |
| 8–15 | Saúde das contas, campanhas, conjuntos/anúncios, gráficos, comparação, visões Meta/Google, alertas | "Informação não disponível pela API" em vez de estimar |
| 16–18 | Sincronização automática (`pg_cron` + Edge Function `sync`), logs, relatórios | |
| 19 | Dashboard do cliente (19.1 PDF; 19.2 login e link secreto; 19.3 idade/gênero/horário/local; 19.4 logo + e-mail semanal via Resend) | A chave do Resend é colada no CRM, nunca no chat |
| 20–31 | Permissões, design, busca global, cache, erros, segurança, modo demonstração, novas plataformas, executivo, performance, responsividade | |
| 32 | Melhorias visuais | O Ander não mandou referências: partiu do visual aprovado, com ponto de volta |
| 33 | Agente de IA | **Em espera a pedido (27/09).** Plano pronto; ponto de restauração criado antes |
| 34 | Tracking & CAPI (34.1–34.4, 34.5-W, 34.5-W2) | Dados pessoais **só em hash** feito no navegador; CAPI prioritário; WhatsApp incluído a pedido; menu "Tracking (em construção)" |
| 35 | Campaign Builder do Meta | Pedido enviado **por engano**: auditoria guardada, em espera |
| 36 | Central de Operações (36.1–36.7) | Ver seção 3 |
| — | Correção do saldo (28/09) | Ver seção 4 |
| 37 | Monitoramento de Desempenho (37.1–37.6) | Ver seção 4.1 |

## 3. Central de Operações (Etapa 36): decisões
- **Módulo independente:**
  - ligado só a clientes e usuários;
  - não mexe nos anúncios;
  - sem IA;
  - permissões no banco;
  - sem botões de mentira.
- **Respostas do Ander à auditoria 36.0:**
  - grupo **"Operações"** no menu, logo depois de Visão geral: **sim**;
  - papel novo **"Equipe"**, que vê só a Central e nada de anúncios: **sim**;
  - leads com telefone e e-mail legíveis, só para Comercial e admin: aceito.
- **Visual:**
  - ele mandou uma referência (`docs/etapa-36-central-operacoes/referencia/`) e pediu: **"O TOM DE ROXO PODE SER MUDADO PARA AZUL, MAS O RESTANTE QUERO NA REFERÊNCIA"**;
  - na dúvida entre fundo claro e escuro, ele só respondeu "pode avançar", então ficou o **claro**.
- **Fases entregues:**
  - 36.1 setores, equipe e permissões;
  - 36.2 tarefas;
  - 36.3 Kanban de clientes, filas e demandas;
  - 36.4 comercial (leads, perda, conversão sem duplicar);
  - 36.5 dailies e reuniões;
  - 36.6 sino, avisos de prazo e repetição;
  - 36.7 painel, visões salvas, busca da Central e atalho no dashboard geral.
- **Relatório final:** `docs/etapa-36-central-operacoes/36.16-RELATORIO-FINAL.md`.

## 4. Correção do saldo (28/09/2026)
- **Pedido:** "algumas contas estão exibindo o limite do cartão de crédito como se fosse saldo disponível". Exemplos: Golfinho Moda Praia (cartão) e Estilo de Ser Kids (cartão cadastrado, mas carregada por PIX na época).
- **O que se descobriu nos dados reais:**
  - o CRM calculava "limite de gastos − gasto";
  - o Meta informa a forma de pagamento em uso (tipo 1 = cartão; tipo 20 = saldo pré-pago, com o texto "Saldo disponível (R$1.345,32 BRL)").
- **Respostas do Ander:**
  - a Estilo de Ser passou a pagar no cartão, então R$ 0,00 está certo;
  - no Google haverá PIX, cartão e boleto: aplicar a mesma lógica quando conectar.
- **Resultado:**
  - cartão = R$ 0,00;
  - pré-paga = saldo exato do Meta;
  - etiqueta da forma de pagamento em cada conta;
  - cartão não gera alerta falso de "sem saldo";
  - regra aplicada também no banco (gatilho + leitura).

## 4.1 Monitoramento de Desempenho (Etapa 37): decisões
- **Auditoria 37.0 aprovada** ("pode avançar" = propostas aceitas): item "Monitoramento" no grupo Análise, antes de Alertas; azul; o alerta antigo "Queda de resultados" foi desligado na 37.3; só o link oficial de prévia do Meta.
- **03/10:** Ander pediu **"somente campanhas, conjuntos e criativos ativos. Os desativados pode descartar"**. Item desativado não gera alerta e o alerta dele é encerrado (fica no histórico).
- **37.5:** o Monitoramento ganhou **ícone de avisos próprio** (o sino da Central não mudou), para os dois módulos continuarem independentes. WhatsApp só "preparado".
- **37.6:** faixa curta no dashboard e nas visões Meta/Google, bloco na ficha do cliente, aba Histórico. Tudo de leitura; nada é pausado nas plataformas.
- **Relatório final:** `docs/etapa-37-monitoramento/37.7-RELATORIO-FINAL.md`.

## 5. Aprendizados técnicos (armadilhas que já custaram tempo)
- **Transações e funções:** uma função `stable` não enxerga o que a mesma instrução gravou. Nos testes, separe em instruções diferentes.
- **Servidor simulado dos testes de navegador:** toda RPC nova precisa de tratador com as mesmas regras do banco. Na Central, ele fica antes do bloqueio "só admin".
- **Servidor de prévia:** morre após pausas. Confira com `curl` e suba de novo.
- **Testes que dependem de data/hora:** `charts.mjs` falha às segundas e `tracking.mjs` perto de 00h UTC. Não confunda com regressão.
- **Publicar Edge Function:** é preciso empacotar num arquivo só. Quando for arriscado, prefira colocar a regra também no banco (como na correção do saldo) para não depender da publicação.
- **Documentação oficial do Meta:** o site `developers.facebook.com` fica bloqueado no ambiente. Use os dados reais que a API já devolveu (guardados no banco) para confirmar o comportamento, e diga isso ao Ander.
- **Ferramenta do banco (MCP):** `execute_sql`/`apply_migration` travam ("timeout") quando o SQL tem `TRUNCATE`, `DELETE` ou `DROP`. Use nomes novos em vez de apagar, ou deixe a linha para o Ander rodar no SQL Editor.
- **Testes de navegador:** `page.goto` perde o login simulado; navegue clicando nos links do menu. Contas simuladas precisam de `assets: []` para a ficha do cliente abrir.
- **Nomes de plataforma nas telas:** o teste de arquitetura proíbe escrever "meta"/"google" fixo. Use o catálogo de plataformas.

## 6. Onde está cada coisa
- **Regras e jeito de trabalhar:** [CLAUDE.md](../../CLAUDE.md).
- **Comandos e passo a passo:** [COMO-TRABALHAR.md](COMO-TRABALHAR.md).
- **Situação e próximos passos:** [ESTADO-ATUAL.md](ESTADO-ATUAL.md).
- **Pendências do Ander:** [../PENDENCIAS.md](../PENDENCIAS.md). **Domínio:** [../DOMINIO.md](../DOMINIO.md). **Voltar versão:** [../PONTO-DE-RESTAURACAO.md](../PONTO-DE-RESTAURACAO.md).
