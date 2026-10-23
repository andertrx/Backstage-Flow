# Tracking completo para Meta Ads — reanálise e plano novo (23/10/2026)

> Status: **proposta**. Nada foi implementado. Aguarda as respostas e o "pode avançar" do Ander.
> Pedido: "rastrear via API de Conversões tudo que for necessário para minhas campanhas, rastrear os contatos de
> WhatsApp (de onde veio), tracking completo para Meta Ads, sem Tag Manager, sem planilhas, com controle total".

## 1. Situação real hoje (conferida no banco)
| Item | Situação |
|---|---|
| Código do tracking (script, servidor, CAPI, atribuição, WhatsApp) | **Pronto e testado** (Etapas 34.1 a 34.4, 34.5-W, 34.5-W2) |
| Uso real | **Nunca foi usado.** Só existe 1 site de teste (`www.teste.com.br`, do cliente desativado), **0 eventos**, **nenhum Pixel configurado** |
| Menu | "Tracking (em construção)" |
| Vendas fora do site (34.5) | Só planejada, não feita |
| Eventos sem GTM (34.7) | Não feita: o script só capta sozinho visita, formulário (Lead) e clique no WhatsApp (Contact); o resto precisa de código no site |
| Links dos anúncios com ID da campanha | Pendência sua (nenhum anúncio tem `bf_c` ainda) |
| Monitoramento do tracking (34.9) | Não feita |
| Planilhas | 4 clientes ainda dependem da planilha (Inteligência de Resultados) para saber lead/SQL/lojista/venda |

**Conclusão:** a base está certa e será aproveitada quase inteira. O que falta não é "mais código de envio": é
**(a)** colocar no ar com um cliente, **(b)** captar eventos sem GTM, **(c)** trazer a qualificação e a venda para dentro do
CRM (o que substitui a planilha e é o que mais melhora a otimização do Meta) e **(d)** o WhatsApp sem depender de código digitado.

## 2. O que o Meta precisa para otimizar bem (e onde estamos)
| Sinal | Para quê | Hoje |
|---|---|---|
| Eventos do site pelo servidor (CAPI) + Pixel com o mesmo `event_id` | Contar sem duplicar, mesmo com bloqueador | ✅ pronto |
| Dados de correspondência (e-mail, telefone, nome em hash, `fbp`, `fbc`, IP, navegador) | Qualidade da correspondência (EMQ) | ✅ pronto (hash no navegador) |
| Eventos de funil (ViewContent, AddToCart, InitiateCheckout, Purchase) | Lojas virtuais | ⚠️ só com código manual no site |
| **Qualificação do lead e venda** (lead virou SQL / lojista / venda) | O Meta aprende quem **compra**, não só quem preenche | ❌ hoje está na planilha |
| Conversa do WhatsApp ligada ao anúncio (`ctwa_clid`) | Otimizar anúncio de WhatsApp por venda | ⚠️ só com a API oficial |
| Saúde (eventos parados, token vencido, EMQ caindo) | Não perder dias de dados sem perceber | ❌ |

## 3. WhatsApp — o que é possível de verdade
| Caminho | De onde veio? | Precisa de |
|---|---|---|
| Botão do site com código "(ref. …)" | ✅ campanha/conjunto/anúncio | Nada novo (pronto). Limite: se a pessoa apagar o código, perde |
| Anúncio que abre o WhatsApp direto (clique para WhatsApp) | ✅ anúncio exato + `ctwa_clid` | **API oficial** recebendo as mensagens (pronto no CRM, 34.5-W2) |
| Continuar usando o **app** WhatsApp Business **e** receber os dados pela API | ✅ | Recurso do Meta de "coexistência" (mesmo número no app e na API). **A confirmar no momento da configuração**: normalmente exige um app do Meta verificado como provedor de tecnologia ou um provedor parceiro (BSP) |
| Pessoa que chamou sem anúncio e sem site | "Direto no WhatsApp" (nunca inventamos origem) | — |

**O texto das conversas continua nunca sendo guardado.**

## 4. Plano novo (aproveitando o que existe)
| Fase | Entrega | Depende de você? |
|---|---|---|
| **T1 — Colocar no ar (piloto)** | Escolher 1 cliente; instalar o script; Pixel + token **colados no CRM**; código de teste; conferir deduplicação e EMQ no Gerenciador de Eventos; tirar o "(em construção)" do menu | **Sim**: cliente piloto, ID do Pixel, token no CRM |
| **T2 — Eventos sem GTM** | No CRM, por site: "página de obrigado → Lead", "clique neste botão/link → Contato/Agendamento", "formulário X → Lead", "página de produto → ViewContent", valor fixo ou lido da página; publicar versão e voltar versão; botão "Testar" | Não |
| **T3 — Leads e vendas no CRM (fim da planilha)** | Lista de contatos de cada cliente (site + WhatsApp + manual), com etapas configuráveis (ex.: Novo → SQL/Lojista → Venda / Perdido). Cada etapa vira evento no Meta (Lead → evento de lead qualificado → Purchase com valor). Venda manual e por webhook (sistemas de venda). A Inteligência de Resultados passa a ler daqui em vez da planilha | **Sim**: quem marca (pergunta 2) |
| **T4 — WhatsApp sem código digitado** | Conectar o número pela API oficial (ou coexistência, se disponível para o número) em 1 cliente; conversas chegam com a origem do anúncio; marcar etapa pela conversa → Meta (`business_messaging`) | **Sim**: acesso ao número/conta do WhatsApp Business do cliente |
| **T5 — Links dos anúncios** | O CRM lê os anúncios do Meta (só leitura) e aponta os que estão **sem** os parâmetros `bf_c/bf_s/bf_a`; mostra o texto pronto para colar | Não (só colar nos anúncios) |
| **T6 — Saúde do tracking** | Alertas no Monitoramento: site sem eventos há X horas, envio ao Meta falhando, token vencido, EMQ do Meta caindo, compras sem nº do pedido | Não |
| Depois (se precisar) | Lojas virtuais (Nuvemshop, Shopify, WooCommerce) mandando a compra direto do servidor; conversões para o Google | Só se algum cliente for loja / usar Google |

Ordem recomendada: **T1 → T3 → T2 → T5 → T4 → T6**. T1 prova que funciona; T3 é o que mais ajuda as campanhas e tira a planilha.

## 5. O que fica igual (regras)
- Sem Tag Manager: tudo configurado no CRM, um script só no site.
- Dados pessoais só em hash (SHA-256 no navegador); texto do WhatsApp nunca guardado.
- Nunca inventar origem: sem dado, "Sem origem identificada".
- Moedas separadas; nada apagado automaticamente.
- Cliente desativado não recebe nem envia nada (regra de 23/10).

## 6. Perguntas
1. **Cliente piloto:** qual cliente, e o site dele é feito em quê (WordPress/Elementor, página pronta tipo Hotmart/RD, loja Nuvemshop/Shopify…)? A venda acontece no site ou no WhatsApp?
2. **Quem marca SQL/lojista/venda** quando a planilha sair: a **sua equipe** (já tem acesso) ou a **equipe do cliente** (precisaria de um login novo só para marcar os contatos, sem ver o resto)?
