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
- **03/10 (pedido extra):** filtro de objetivo com vários objetivos, salvo por pessoa, em todas as abas. "End form" é evento personalizado e conta como **Leads**; "engajamento" = conversas.
- **04/10:** Ander pediu **só alertas críticos** e nada de campanha desativada; e a janela do alerta estava cortada no celular. Padrão virou "só críticos" (configurável pelo admin); abas de comparação só com ativos. Depois, com prints, "continua cortando": eram os painéis dos sininhos do topo (alinhados ao sininho, vazavam pela esquerda); passaram a abrir na largura da tela no celular. Em seguida pediu menos abas: Campanhas, Conjuntos, Anúncios, Criativos e Contas viraram níveis dentro de Alertas, com filtro de gravidade; o Monitoramento ficou com 4 abas. Em 05/10 apontou resultados diferentes do Gerenciador (Shineray: 2 conversas mostradas como "—"): o resultado passou a seguir a meta de otimização do conjunto; Vonks estava certo (a 2ª venda era de outro anúncio do conjunto).
- **05/10 (Etapa 38):** Ander achou a Central confusa e pediu o comercial separado da operação, com o cliente passando para a operação quando liberado; a aba "Clientes" virou "Operação". Plano em 2 fases (38.1 telas; 38.2 botão de liberar).
- **Relatório final:** `docs/etapa-37-monitoramento/37.7-RELATORIO-FINAL.md`.
- **21/10 (apresentação por perfil):** Ander achou confuso ter de clicar campanha → conjunto → anúncio. Pediu ver de cara campanhas, conjuntos e a lista de criativos que trouxeram cada perfil (ex.: 10 lojistas: 5 de um criativo, 5 de outro), com ponto de volta. Feito: três tabelas na mesma aba, filtro por clique, Leads/Mensagens do Meta.
- **21/10 (só a planilha):** Ander não quer nada do gerenciador (BM) na Inteligência de Resultados: só a divisão por perfil contada na planilha ("tem 50 nomes, 20 são sacoleiros, 20 são lojistas e 10 são consumidores finais"). Saíram Leads/Mensagens (Meta), Investimento e Custo da tela e da exportação; a apresentação ficou igual.
- **21/10 (conta errada):** Ander achou a conta errada. Conferido nos dados reais: a planilha da Vonks tem o ID do Meta nas colunas utm (ligadas como nome) e a da Armored repete a coluna "ID". Corrigido (ID em coluna de nome vale como ID; ID repetido só é cópia com o mesmo contato) e criado o aviso "N lojistas sem campanha preenchida na planilha". Ver `39.8-CORRECAO-DA-CONTA.md`.
- **21/10 (direção):** Ander gostou e pediu ordenar "da maior quantidade para a menor e vice-versa". Campo Direção nas abas de perfil; a posição (#) continua a de quem mais trouxe.
- **21/10 (setinhas):** Ander pediu só as setinhas, ordenando pela coluna SQL (quantidade do perfil), maior em cima por padrão, em campanhas, conjuntos e anúncios. Saíram as caixas Ordenar por/Direção.
- **22/10 (Google OAuth):** para publicar o app no Google, Ander pediu Política de Privacidade e Termos de Serviço genéricos na tela inicial. Criadas `/privacidade` e `/termos` (públicas) e links na entrada. Ver `docs/POLITICA-E-TERMOS.md`.
- **22/10 (Google Ads com erro):** a conexão do Google Ads deu "não tem acesso a esta conta". O log do servidor mostrou a causa real: a Google Ads API estava desligada no projeto do Google Cloud. Mensagem corrigida no código (`API_DISABLED`); Ander precisa ativar a API.
- **22/10 (modo CNPJ):** cliente cuja planilha só pede o CNPJ. Ander definiu: CNPJ com 14 números = Lojista; vazio ou outra coisa = Não identificado; só quando marcado (caso específico). Feito sem tabela nova (regra `__cnpj__`), CNPJ não guardado. Ver `39.9-MODO-CNPJ.md`.
- **23/10 (desativar cliente):** Ander pediu um botão para desabilitar clientes "tudo que envolve isso". Decisões dele: tracking para; períodos passados ficam. Feito com a situação 'encerrado' (agora "Desativado"), só admin, nada apagado. Ver `docs/CLIENTE-DESATIVADO.md`.
- **23/10 (contas ativas/desativadas + excluir):** Ander viu a conta do cliente desativado em Contas como ativa. Pediu separar ou sumir, e que "excluir" faça sumir. Feito: abas em Contas e botão Excluir (só admin, só desativado, digitando o nome; exclusão lógica com `excluded_at`, nada apagado). Achado e corrigido: o RLS ainda usava a checagem antiga, então o login do cliente desativado não estava bloqueado de verdade.
- **23/10 (tracking reanalisado):** Ander quer tracking completo para o Meta, sem Tag Manager e sem planilhas. Reanálise: tudo pronto, mas nunca usado (0 eventos). Plano novo T1–T6 (`REANALISE-2026-10-23.md`). Decisões dele: e-commerce já dispara a compra (CRM só registra, não reenvia); formulário com "tipo de cliente" — só **lojista** treina o Lead; WhatsApp: manual agora, depois API oficial com frase de venda (inspirado no Tintim), **sem QR Code**. Aprovou com "pode".
- **23/10 (T2 — regras sem Tag Manager):** regras por site no CRM (página, clique, formulário com resposta), como vai ao Meta (mesmo nome, outro nome, não enviar), valor lido da página, rascunho → publicar → voltar versão. Ver `etapa-34-tracking/T2-REGRAS-SEM-TAG-MANAGER.md`.
- **19/10 (parâmetros da planilha):** Ander mandou a lista de parâmetros (Nome, Número, Perfil de Lojista (SQL), Data, UTMs, IDs, gclid, fbclid) e pediu personalizados. Decidiu: o campo de perfil se chama só "SQL"; **continuar sem guardar dados pessoais** (chegou a pedir nome e número legíveis, mas voltou atrás: "a planilha é só leitura, não quero guardar dados"); o resto do funcionamento fica igual.
- **18/10 (Etapa 39.5):** aprovada com "pode avancar". Qualidade olha a planilha inteira e diz o que corrigir em cada problema; exportação CSV/Excel por perfil, sem dados pessoais. Etapa 39 fechada no código; o teste final é a primeira leitura real.
- **17/10 (Etapa 39.4):** aprovada com "pode". Tela com abas por perfil, ranking que abre campanha → conjunto → anúncio, registros sem dados pessoais e atalho na ficha do cliente; configuração da planilha passou para a aba "Planilha".
- **17/10 (Etapa 39.3):** aprovada com "pode". Decisões: perfil e origem calculados na hora da consulta (regra nova vale sem reler a planilha); nome só liga quando é único (senão "nome ambíguo"); linhas sem origem contam no total, fora do ranking; custo por contato só numa moeda.
- **17/10 (Etapa 39.2):** leitura da planilha aprovada ("pode avancar"). Decisão técnica: guardar só a **última leitura** de cada planilha (trocada a cada leitura, contato só em hash), para os rankings não dependerem do Google a cada clique; falha mantém os números da última leitura boa.
- **17/10 (Etapa 39):** Ander pediu o módulo Inteligência de Resultados (perfil lojista/sacoleiro/consumidor por campanha, conjunto e anúncio, vindo do Google Sheets). Ao aprovar, mudou o plano: **a planilha é o banco de dados** (não guardar contatos), leitura **3 vezes por dia (8h, 12h, 16h)** com botão para atualizar na hora; no futuro pode ir para outro banco. Aceitou conta de serviço e não guardar dados pessoais.
- **13/10 (relatórios):** Ander achou ruim a frase "28 lead (end form)" e pediu a frase opcional ou editável. Ficou: frase editável por cliente com marcadores (números sempre reais), desligar vale também no e-mail, nome do resultado como foi escrito.
- **13/10 (saldo):** a Estilo de Ser Kids tem cartão cadastrado, mas roda com PIX; o Meta informa só o cartão e não informa o saldo PIX pela API. Ander escolheu **informar as recargas no CRM** (opção a), **só nessa conta**. Ver `docs/etapa-07-verificacao-saldo/CORRECAO-2026-10-13-SALDO-PIX-INFORMADO.md`.

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
- **23 a 25/10 (T3.1 — contatos e vendedor):** respostas do Ander: quem marca é a **equipe do cliente** (papel novo Vendedor) e as etapas padrão (só Lojista e Venda vão ao Meta). Feito: tela Contatos, papel Vendedor travado no resto do CRM, marcação enviada pelo caminho do tracking. Os testes acharam 2 problemas antes da entrega (contato manual; permissão por coluna das tabelas novas, inclusive as da T2). A sessão reiniciou no meio; os arquivos das migrações foram refeitos e conferidos com o banco (md5 igual). Ver `etapa-34-tracking/T3.1-CONTATOS-E-VENDEDOR.md`.
- **25/10 (T3.2 — vendas por webhook):** Ander pediu que funcione com **qualquer sistema com webhook** (mapeamento de campos configurável) e aprovou cifrar telefone/e-mail **no servidor, na chegada** (exceção à regra "só no navegador"; o texto legível nunca é guardado). Pediu também que a Inteligência de Resultados continue vindo da planilha por ora. Ver `etapa-34-tracking/T3.2-VENDAS-WEBHOOK.md`.
- **25/10 (T4.1 — frases do WhatsApp):** Ander: sem cliente piloto e sem sistema de vendas definido ("deixa em aberto"); **não quer usuário Vendedor**: quem atende marca no WhatsApp, pelo número, como no Tintim; o resto (site, landing page, formulário) por API de Conversões. Pesquisado o Tintim (frase-gatilho + valor na mensagem; conexão por QR, Coexistence ou API). "Pode fazer" sem escolher: segui o recomendado (Coexistence oficial; frases). Coexistence exige Tech Provider no Meta → dividido em T4.1 (frases, pronta) e T4.2 (ligar o número). Ver `etapa-34-tracking/T4.1-FRASES-WHATSAPP.md`.
- **25-26/10 (T4.2 — Coexistence):** "pode" do Ander. Cadastro por redirecionamento (o site bloqueia scripts de fora), app do Meta da agência configurado em Integrações (só admin), botão no Tracking (admin e gestor). O teste do banco achou e a correção fechou a falha "sem usuário passava na conferência de admin". Ver `etapa-34-tracking/T4.2-WHATSAPP-COEXISTENCE.md`.
- **26/10 (Central 36.17 — lembrete de tarefa vencida):** Ander pausou o tracking e pediu pop-up de tarefa vencida às 8h, 12h e 17h até visualizar; respondeu: **só para o responsável**, e também no computador, no celular e no Chrome ("eu autorizo"). Feito com notificação padrão do navegador (Web Push), sem serviço pago. Ver `etapa-36-central-operacoes/36.17-LEMBRETES-PRAZO.md`.
