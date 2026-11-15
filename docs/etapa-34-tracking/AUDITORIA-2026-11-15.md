# Auditoria completa do Tracking — Backstage Flow (15/11/2026)

> **Só diagnóstico.** Nenhum código, tabela, migração ou configuração foi alterado para fazer este relatório.
> Fontes: o código do repositório (script `t.js`, funções do servidor, migrações, telas), o banco real (consultas só de leitura, sem ler dados pessoais) e a documentação das etapas 34/T1–T5.
> Regra deste relatório: **o que existe no código ≠ o que está ligado ≠ o que já recebeu dados.** Cada item abaixo diz em qual das três situações está.

---

## 0. Resumo em 10 linhas (leia só isto, se quiser)

1. O tracking está **construído quase por inteiro e o envio ao Meta funciona de verdade**: 63 eventos enviados, o Meta confirmou o recebimento de 63, **0 erros**, último envio com sucesso hoje.
2. **Mas nenhum evento veio do script do site.** Dos 64 eventos no banco: 58 vieram do **WhatsApp** (servidor de WhatsApp não oficial), 6 vieram do **CRM** (marcações feitas por vocês ou testes). **Zero** `PageView`, zero clique de anúncio (`fbclid`), zero UTM, zero `fbp`/`fbc`.
3. O script `t.js` existe, está completo e testado, mas **nunca registrou uma visita real** nos 7 containers cadastrados.
4. Por isso, hoje **a atribuição por anúncio não está acontecendo**: os 58 contatos de WhatsApp ficaram com origem **"Desconhecida"** e o Meta recebeu esses contatos **sem os dados que ele usa para ligar a pessoa a um anúncio** (só um identificador interno em hash).
5. **3 compras de teste (R$ 2,99, R$ 1,02 e R$ 0,10) foram enviadas ao Pixel real** como se fossem vendas (não estavam em modo teste). Elas contam nos números do Pixel.
6. O servidor (Supabase) **cumpre papel essencial**: valida o domínio, impede duplicidade, recalcula a origem, guarda tudo no banco, guarda o token no cofre e envia ao Meta por fila com tentativa automática.
7. **Google Ads: só captura de parâmetros** (`gclid`, `wbraid`, `gbraid`). **Não existe envio de conversão ao Google.**
8. **Campaign Builder / Criador de Anúncios: não está ligado ao tracking.** Ele só gera um texto-pedido; não coloca `bf_c`/UTM nos anúncios.
9. **Relatórios do cliente, Painel e Executivo não leem o tracking.** Os dados do tracking só aparecem dentro das telas do próprio Tracking e em Contatos/Vendas. A Inteligência de Resultados ainda lê **planilha**.
10. **Vale manter a arquitetura própria** (é mais controle e menos custo recorrente que GTM + planilhas), **desde que se feche o buraco principal: colocar o script em um site real com tráfego e colar os parâmetros nos anúncios.** Sem isso, a estrutura está "pronta e vazia" onde mais importa.

---

## 1. Arquitetura e tecnologias

| Camada | O que é | Onde está |
|---|---|---|
| **Script no site do cliente** | JavaScript único, sem dependências, ~570 linhas. Cola-se uma linha `<script src=".../t.js" data-key="bf_...">` | `apps/web/public/t.js` (servido por `www.backstageflow.com.br/t.js`) |
| **Servidor público de eventos** | Edge Function (Deno) `track`, sem login; protegida por chave do site + domínio autorizado + limite de uso | `supabase/functions/track/index.ts` e `logic.ts` |
| **Banco** | Postgres (Supabase) com RLS em todas as tabelas, tabela de eventos **particionada por mês** | migrações `20260927004348_tracking_foundation.sql` e seguintes |
| **Fila e envio ao Meta** | Tabela `tracking_capi_queue` + Edge Function `capi-sender` chamada **todo minuto** pelo agendador do banco (`cron: tracking-capi`) | `supabase/functions/capi-sender/`, `_shared/capi/meta.ts` e `sender.ts` |
| **Configuração do Meta por site** | Edge Function `tracking-destinations` (salvar Pixel/token, testar). Token vai direto para o **Cofre (Vault)** e nunca volta para a tela | `supabase/functions/tracking-destinations/index.ts` |
| **Regras de evento sem GTM** | Rascunho → Publicar → Voltar versão; o script busca as regras publicadas (`GET /track?k=`) | tabelas `tracking_rules`, `tracking_rule_versions`; função `tracking_rules_for_key` |
| **WhatsApp** | 4 caminhos (ver seção 4): código no botão, servidor não oficial, API oficial, Coexistência | `wa-inbound`, `tracking-whatsapp`, `whatsapp-webhook`, `wa-gateway`, `_shared`… |
| **Vendas/leads de fora do site** | Webhooks `lead-webhook` e `sales-webhook` + marcação manual no CRM ("Contatos e vendas") | `supabase/functions/lead-webhook`, `sales-webhook`; tela `features/contacts` |
| **Telas** | Painel, Atribuição, Leads, WhatsApp, Saúde, Configurações | `apps/web/src/features/tracking/*` |
| **Regras compartilhadas (testadas)** | Leitura de UTM/click IDs, classificação da origem, normalização/hash de contato | `packages/shared/src/tracking/*` |

---

## 2. De onde vêm os dados e como são capturados (script `t.js`)

**Instalação:** 1 linha no site, com opções por atributo (`data-pixel`, `data-forms`, `data-whatsapp`, `data-wa-code`, `data-fields`, `data-clicks`, `data-consent`).

**O que o script capta sozinho:**
| O quê | Como | Observação |
|---|---|---|
| Visita (`PageView`) | a cada carga e a cada troca de página em sites de página única | |
| Visitante e sessão | cookies do **próprio site**: `_bft` (visitante, 1 ano) e `_bfs` (sessão, 30 min; nova sessão se mudar a campanha na URL) | cookie de 1ª parte, no domínio principal |
| Parâmetros de campanha | `utm_*`, `fbclid`, `gclid`, `wbraid`, `gbraid`, `msclkid`, `ttclid`, `li_fat_id`, `bf_c`, `bf_s`, `bf_a` | lidos da URL |
| Cookies do Meta | cria/lê `_fbp` e `_fbc` no mesmo formato do Pixel | `_fbc` é montado a partir do `fbclid` |
| Formulário | só com `data-forms="lead"`: envio com e-mail/telefone vira `Lead` | e-mail, telefone e nome são **cifrados (SHA-256) no navegador**; texto legível nunca sai |
| Clique no WhatsApp | vira `Contact`; com `data-wa-code="1"` acrescenta "(ref. K7Q2M9)" na mensagem | grupos de WhatsApp contam como contato com origem |
| Regras do CRM | página, clique, formulário (ex.: "/obrigado" = Compra), com valor fixo ou lido da página | só valem **depois de Publicar** |
| Cliques em botões | `data-clicks="on"` → evento `bf_click` **só no CRM** (nunca vai ao Meta) | |

**Privacidade na entrada:** o servidor recusa texto legível em `ud`, remove de `custom_data` o que parece e-mail/telefone/CPF e **descarta da URL tudo que não é parâmetro de campanha**. IP e navegador só ficam na fila de envio ao Meta e são apagados depois.

---

## 3. UTMs, FBCLID, FBC e FBP — como funcionam aqui

| Item | O que é | Quem cria | Para onde vai |
|---|---|---|---|
| **UTMs** | etiquetas de origem que **você** coloca no link do anúncio | você (ou o anúncio, por macros) | guardadas no "ponto de contato" (`tracking_touchpoints`); usadas para classificar o canal |
| **fbclid** | identificador que o **Meta** acrescenta ao link quando alguém clica no anúncio | Meta | guardado no ponto de contato; **vira o `_fbc`** |
| **_fbp** | cookie "navegador do Meta" (identifica o navegador) | o script (mesmo formato do Pixel) | vai ao Meta na API de Conversões |
| **_fbc** | cookie "clique do Meta" (liga o evento ao anúncio clicado) | o script, a partir do `fbclid` da URL | vai ao Meta na API de Conversões |
| **bf_c / bf_s / bf_a** | IDs de campanha / conjunto / anúncio, via macros `{{campaign.id}}`, `{{adset.id}}`, `{{ad.id}}` | o anúncio (você precisa colar no link) | ligam a visita à campanha do CRM **com certeza** |
| **gclid, wbraid, gbraid** | equivalentes do Google | Google | **só guardados** (não são usados para enviar nada ao Google) |

**Regra de ouro do sistema:** nunca inventar origem. Sem prova, a origem fica "provável" ou "desconhecida" (arquivo `packages/shared/src/tracking/params.ts`, funções `captureParams` e `classifyTouch`).

Detalhe técnico a saber: o `_fbc` é gravado com a **hora em que o script viu o `fbclid`**, não a hora do clique. Na prática, na maioria dos casos isso é o mesmo instante.

---

## 4. Função do servidor e o que passa por ele

Caminho de um evento do site (`track/index.ts`): **valida tamanho → valida campos → acha o site pela chave → confere domínio (cabeçalho `Origin` + endereço da página) → confere se o site está ativo e se há consentimento (quando exigido) → limita uso por site e por IP cifrado → monta o pacote (origem recalculada no servidor) → grava (`tracking_ingest`) → enfileira para o Meta.**

O servidor é importante porque:
1. **Segurança:** só domínios autorizados enviam; o navegador não decide a origem.
2. **Duplicidade:** `event_id` único por destino; compra repetida é barrada pelo número do pedido.
3. **Dados confiáveis:** IP e navegador reais (do pedido HTTP) são anexados **no servidor**, onde o navegador não pode falsificar.
4. **Segredo:** o token do Meta fica no **Vault**; nunca vai ao navegador.
5. **Resiliência:** fila com tentativas; se o Meta cair, o evento espera (não se perde).
6. **Funciona sem site:** WhatsApp, webhooks e marcações do CRM não passam pelo navegador, mas usam o mesmo caminho de gravação e de envio.

---

## 5. Pixel da Meta, API de Conversões e deduplicação

- **Pixel no navegador:** só dispara se o site tiver `data-pixel="ID"`. O script carrega `fbevents.js` e dispara o mesmo evento com **`eventID` = o mesmo `event_id`** que vai ao servidor.
- **API de Conversões (servidor):** `capi-sender` (a cada minuto) pega a fila (`tracking_capi_claim`), monta o evento (`buildMetaEvent`), envia em lotes de 200 e registra o resultado (`tracking_capi_log`). Se o Meta recusar um lote por dado inválido, reenvia um a um para achar o culpado.
- **Deduplicação:** o Meta junta Pixel + servidor quando `event_id` e nome do evento são iguais. Aqui o `event_id` nasce **uma vez**, no script (`hora.aleatório`), e vai nos dois caminhos. Na fila do CRM há uma trava extra (`unique (destination_id, event_id)`).
- **Dados de correspondência enviados:** `external_id` (hash do visitante), e-mail/telefone/nome em hash (quando existem), IP, navegador, `fbp`, `fbc`. Para anúncio de clique-para-WhatsApp pela API oficial: `ctwa_clid` + conta do WhatsApp Business (formato `business_messaging`).
- **Modo teste:** site em modo teste **sem** código de teste do Meta → evento **não é enviado** (fica "descartado"). Isso evita teste parecer venda — mas **só funciona se o site estiver marcado como teste** (ver achado 4 da seção 12).
- **Token inválido/vencido:** o erro vira mensagem em português na tela; o envio não tenta de novo à toa (erro de autenticação).

---

## 6. Onde os dados ficam e como se ligam a clientes e campanhas

```
clients ──< tracking_containers (um por site / por "WhatsApp sem site")
                  │      │
                  │      └──< tracking_destinations (Pixel + token no Vault) ──< tracking_capi_queue ──< tracking_capi_log
                  │
                  ├──< tracking_visitors ──< tracking_sessions
                  ├──< tracking_touchpoints   (canal, UTM, fbclid, gclid, bf_c/bf_s/bf_a, evidência)
                  ├──< tracking_events        (particionada por mês)
                  ├──< tracking_leads         (e-mail/telefone/nome só em HASH)
                  ├──< tracking_purchases     (valor, moeda, nº do pedido, 1ª e última origem)
                  ├──< tracking_rules / tracking_rule_versions
                  └──< tracking_whatsapp_clicks / _connections / _conversations ──< tracking_wa_messages (opt-in)
campaigns (vêm da sincronização Meta/Google) ◄── ligadas por: bf_c = campaigns.external_id  (certeza)
                                                  ou utm_campaign = nome da campanha, se for único (aproximação)
```

- **Retenção:** cada site tem `retention_days` (padrão 180), mas **a limpeza automática não está ligada** (o próprio comentário da tabela diz "só será ligada com aprovação"). Hoje os eventos **ficam guardados sem prazo**. Mensagens de WhatsApp têm regras próprias (opt-in; limpeza só pelo admin).
- **Vínculo com campanhas:** na função `tracking_attribution` (migração `20260927042159`). Casa por **ID** (`bf_c` = `campaigns.external_id`, de mesmo cliente e plataforma) ou por **nome** (só quando o nome da campanha é único). Cruza com o gasto (`metrics_daily`) para mostrar custo por lead/venda.

---

## 7. Tracking Engine × Campaign Builder

| Pergunta | Resposta (conferida no código) |
|---|---|
| Existe "Campaign Builder"? | A **Etapa 35 (Campaign Builder) nunca foi construída** (`docs/etapa-35-campaign-builder/35.0-AUDITORIA.md` = "em espera"). O que existe é o **Criador de Anúncios (Etapa 42)**. |
| O que o Criador faz? | Monta um **pedido em texto** para colar no Claude (com conector do Meta). **Não cria nada no Meta por conta própria.** |
| Liga ao tracking? | **Não.** Só tem um campo livre "UTMs (opcional)" (`site_utms` em `packages/shared/src/ads/builder.ts`) que é copiado para o pedido. **Não insere `bf_c`/`bf_s`/`bf_a`, não busca o código do site, não confere se o anúncio está rastreável.** |
| Onde está a "ponte" hoje? | **Manual:** a tela Tracking mostra o modelo de parâmetros (`apps/web/src/features/tracking/logic.ts`, linhas ~95–101) para colar no anúncio, e a tela "Saúde" avisa quando visitas pagas chegam sem ID de campanha. |

---

## 8. Google Ads: integração real ou só parâmetros?

| Parte | Situação |
|---|---|
| **Ler métricas/campanhas do Google Ads (API)** | ✅ Existe (sincronização, `_shared/platforms/google`). Não é tracking. |
| **Capturar `gclid`/`wbraid`/`gbraid` e `{campaignid}`/`{adgroupid}`/`{creative}`** | ✅ Capturado e guardado (script + servidor). |
| **Enviar conversão ao Google** (conversões offline / enhanced conversions / GA4 Measurement Protocol) | ❌ **Não existe.** Não há chamada de upload em nenhuma parte do código (fase 34.8 do plano, nunca feita). |
| **Atribuir venda a campanha do Google no CRM** | ⚠️ Só se o clique chegar ao site **com `bf_c`** e o script estiver instalado. Sem isso, a campanha do Google não recebe a venda. |

Conclusão: **para o Google há captura de parâmetros, não integração de conversões.**

---

## 9. Como os dados chegam aos relatórios do Backstage Flow

| Tela / saída | Lê o tracking? |
|---|---|
| **Tracking** (Painel, Atribuição, Leads, WhatsApp, Saúde) | ✅ Sim (`tracking_overview`, `tracking_conversions_summary`, `tracking_attribution`, `tracking_quality`, `tracking_lead_journey`) |
| **Contatos e vendas** (ficha do cliente) | ✅ Sim (leads e vendas marcados) |
| **Relatório do cliente / portal / e-mail do cliente** | ❌ Não |
| **Painel geral, Executivo, Dashboard do cliente** | ❌ Não |
| **Inteligência de Resultados** | ❌ Não lê o tracking: lê **planilha** (função `sheets`, `packages/shared/src/results/*`) |
| **MCP (Claude)** | ⚠️ Só informa a permissão "Tracking"; **não há ferramenta que leia os dados de tracking** |

Ou seja: **os números do tracking existem, mas ficam "dentro" do módulo**. Não alimentam os relatórios que o cliente vê.

---

## 10. Fluxogramas dos caminhos reais

### 10.1 Site (script) — **construído, mas hoje sem tráfego real**
```
Anúncio (Meta/Google)
   │  clique  (Meta acrescenta fbclid; o link deve ter UTM e bf_c/bf_s/bf_a)
   ▼
Site do cliente  ── t.js lê a URL (UTM, fbclid, gclid, bf_*) e cria cookies _bft/_bfs/_fbp/_fbc
   │  (formulário/clique/página → e-mail/telefone em HASH no navegador)
   ├─────────► Pixel Meta (navegador)  [só se data-pixel]   ─────────────┐ mesmo event_id
   ▼                                                                       │ (deduplica)
Servidor  track (Edge Function): valida chave+domínio+limites; recalcula origem; anexa IP/navegador
   ▼
Banco: tracking_events / sessions / touchpoints / leads / purchases
   ▼
Fila tracking_capi_queue ──(cron, todo minuto)──► capi-sender ──► Meta API de Conversões ◄───────┘
   ▼
Backstage Flow (telas do Tracking: Atribuição cruza com campaigns + gasto)
```

### 10.2 WhatsApp — **é o único caminho com dados reais hoje**
```
Pessoa manda mensagem no WhatsApp do cliente
   │
   ├─ A) veio de BOTÃO DO SITE com "(ref. XXXXXX)" ─► liga à visita e campanha  [exige o script no site]
   ├─ B) SERVIDOR NÃO OFICIAL (wa-inbound) ─► conta a conversa; lê ref e ctwaClid; número em HASH   ◄── ATIVO (3 conexões, 1 ligada)
   ├─ C) API OFICIAL (whatsapp-webhook) ─► ctwa_clid + business_messaging                        ◄── código pronto, 0 conexões
   └─ D) COEXISTÊNCIA (tracking-whatsapp/coex) ─► app + API ao mesmo tempo                         ◄── código pronto, não usado
   ▼
Banco: tracking_whatsapp_conversations  → cria Contato (tracking_events)  [hoje: origem "desconhecida"]
   ▼
Marcação de etapa/venda (equipe, por frase ou botão) → tracking_leads/purchases
   ▼
Fila CAPI → capi-sender → Meta  (action_source "chat"; só com ctwa+WABA vira "business_messaging")
```

### 10.3 CRM, webhooks e marcações — **ativo, com dados de teste**
```
Equipe marca Lead/Venda no CRM  ┐
lead-webhook (formulário externo) ├─► tracking_ingest ─► tracking_leads/purchases ─► fila CAPI ─► Meta
sales-webhook (sistema de venda) ┘
```

### 10.4 Dados de campanha (para o relatório de atribuição)
```
Meta Ads API / Google Ads API ──(sync a cada 5 min)──► campaigns, metrics_daily (gasto)
                                                         │
tracking_touchpoints.ad_campaign_id (bf_c) ──casa com──► campaigns.external_id
                                                         ▼
                                   tracking_attribution → custo por lead/venda → tela Tracking
        (NÃO segue para: relatório do cliente, Painel, Executivo, Inteligência de Resultados)
```

---

## 11. Tabela de evidências: o que existe, está ativo e o que falta

Legenda: **Código** = implementado e testado. **Ligado** = configurado em uso real. **Dados** = recebeu dados reais.

| # | Funcionalidade | Código | Ligado | Dados reais | Onde está | Tabelas / endpoints | O que falta |
|---|---|---|---|---|---|---|---|
| 1 | Script `t.js` (visita, sessão, UTM, click IDs) | ✅ | ⚠️ não comprovado | ❌ **0 PageView** | `apps/web/public/t.js` | `POST/GET /functions/v1/track` | Instalar em site real com tráfego |
| 2 | Cookies `_fbp/_fbc` | ✅ | ⚠️ | ❌ (0 `fbp`, 0 `fbc` na fila) | `t.js` (`fbIds`) | — | Mesmo item 1 |
| 3 | Servidor `track` (validação, domínio, limites, dedupe) | ✅ | ✅ (v11 no ar) | ❌ sem tráfego de navegador | `supabase/functions/track` | `tracking_containers`, `track_limits` | Tráfego real |
| 4 | Gravação (eventos, sessões, pontos de contato, leads, compras) | ✅ | ✅ | ✅ 64 eventos, 58 visitantes, 1 lead, 3 compras (testes) | migrações `…tracking_foundation/leads` | `tracking_*` | — |
| 5 | Atribuição de origem (canal/evidência) | ✅ | ✅ | ⚠️ 58 pontos, **todos "WhatsApp / desconhecida"** | `params.ts`, `tracking_attribution` | `tracking_touchpoints` | Parâmetros nos anúncios |
| 6 | Pixel Meta no navegador (`data-pixel`) | ✅ | ⚠️ não comprovado | ❌ | `t.js` (`firePixel`) | — | Instalar com `data-pixel` e conferir no Gerenciador de Eventos |
| 7 | API de Conversões (fila + envio) | ✅ | ✅ (cron a cada minuto) | ✅ **63 enviados, 63 recebidos, 0 erros** | `capi-sender`, `_shared/capi/*` | `tracking_capi_queue`, `tracking_capi_log` | Qualidade dos dados enviados (ver seção 12) |
| 8 | Deduplicação Pixel × servidor | ✅ | ⚠️ não comprovável sem o Pixel do site | ❌ | `t.js` + `meta.ts` | `unique(destination_id,event_id)` | Teste real no Gerenciador de Eventos |
| 9 | Token do Meta no Vault + teste de envio | ✅ | ✅ (1 destino, ligado) | ✅ | `tracking-destinations` | `tracking_destinations`, Vault | — |
| 10 | Regras de evento sem GTM (página/clique/formulário) | ✅ | ❌ **0 regras criadas** | ❌ | `t.js`, `rules.ts`, `tracking_rules_*` | `tracking_rules`, `tracking_rule_versions` | Criar e publicar as regras do piloto |
| 11 | Lead por webhook | ✅ | ⚠️ | ⚠️ 1 lead (CRM) | `lead-webhook` | `tracking_leads` | Configurar nos formulários reais |
| 12 | Venda por webhook | ✅ | ⚠️ | ⚠️ compras são testes | `sales-webhook` | `tracking_purchases` | Ligar ao sistema de venda real |
| 13 | WhatsApp — código no botão do site | ✅ | ⚠️ | ❌ 0 cliques registrados | `t.js`, `tracking_whatsapp_register` | `tracking_whatsapp_clicks` | Script no site |
| 14 | WhatsApp — servidor não oficial | ✅ | ✅ (1 de 3 ligada) | ✅ 58 conversas, 530 mensagens | `wa-inbound`, `waGateway.ts` | `tracking_whatsapp_*`, `tracking_wa_messages` | Origem do anúncio (`ctwaClid`) **não chegou em nenhuma conversa** |
| 15 | WhatsApp — API oficial | ✅ | ❌ 0 conexões | ❌ | `whatsapp-webhook`, `tracking-whatsapp` | `tracking_whatsapp_connections` | Conta WhatsApp Business oficial |
| 16 | WhatsApp — Coexistência | ✅ | ❌ | ❌ | `tracking-whatsapp/coex.ts` | `wa_app_settings` | App Meta verificado / provedor |
| 17 | Marcar etapa/venda por frase ou botão | ✅ | ✅ | ⚠️ | `wa-inbound`, `waTriggers.ts` | `tracking_wa_triggers` | — |
| 18 | Vendas sugeridas por IA | ✅ | ⚠️ | ⚠️ | `wa-ai` | `tracking_wa_suggestions` | Opt-in por cliente |
| 19 | Saúde do tracking (tela) | ✅ | ✅ | — | `ReadinessSection.tsx` | — | Alertas no Monitoramento (não existem) |
| 20 | Ferramenta de link com parâmetros | ✅ | ✅ | — | `features/tracking/logic.ts` | — | Passo automático nos anúncios |
| 21 | Ligação com Criador de Anúncios | ❌ | ❌ | ❌ | — | — | Tudo |
| 22 | Conversões para o Google | ❌ | ❌ | ❌ | — | — | Tudo (fase 34.8) |
| 23 | Tracking nos relatórios do cliente/Painel/Executivo | ❌ | ❌ | ❌ | — | — | Tudo |
| 24 | Limpeza automática por retenção | ❌ | ❌ | — | só o campo `retention_days` | — | Rotina + aprovação |
| 25 | Alertas de tracking no Monitoramento (site parado, token vencido, EMQ) | ❌ | ❌ | — | — | — | Tudo (fase T6 do plano) |

**Containers hoje (7):** 3 "WhatsApp sem site", 4 sites — `loja.com.br` (modo teste), `www.teste.com.br`, `sdadasd.com.br` (nome sem sentido, parece teste) e `wlp-excalibur-ten.vercel.app` (único com eventos, **todos vindos do WhatsApp/CRM**). **1 Pixel** configurado (`1025089933690047`), ligado, com token.

---

## 12. Achados importantes (por ordem de importância)

1. **O script do site nunca coletou uma visita real.** Todos os 64 eventos vieram de WhatsApp (58) ou do CRM (6). Sem isso não há UTM, `fbclid`, `fbp`, `fbc` nem origem de anúncio.
2. **Os 58 "Contact" enviados ao Meta quase não ajudam a otimizar anúncio.** Na fila: `fbp = 0`, `fbc = 0`, `ip = 0`, `navegador = 0`, `ctwa_clid = 0`. Eles carregam só um identificador interno em hash. O Meta recebe e conta (por isso "63 recebidos"), mas **não consegue ligar a pessoa a um anúncio**. É um falso "tudo certo": o envio funciona, a **qualidade** é baixa.
3. **Origem de anúncio de WhatsApp: 0 de 58.** O servidor não oficial procura `ctwaClid`, mas nenhuma conversa trouxe. Pode ser que não houve anúncio de clique-para-WhatsApp, ou que o servidor/versão não entrega esse campo. **Não dá para concluir qual das duas sem teste real** (a própria documentação já avisa que servidores diferentes podem precisar de ajuste).
4. **3 compras de teste foram para o Pixel real** (R$ 2,99; R$ 1,02; R$ 0,10, todas `test = false`). O "modo teste sem código de teste não envia" só protege quando o **site** está marcado como teste. Aqui o site que gerou os eventos **não** estava.
5. **Anúncios sem `bf_c`:** sem os IDs, a ligação com a campanha cai para "pelo nome" (aproximada, só se o nome for único) ou não liga.
6. **Retenção não é aplicada** (dados ficam sem prazo apesar do campo de 180 dias).
7. **Regras T2 prontas, nenhuma criada**: o que dependeria de "página de obrigado" ou "clique em botão" não está rodando.
8. **Domínio de site de teste cadastrado com nome sem sentido** (`sdadasd.com.br`) e containers de teste ainda ativos: não faz mal, mas polui a lista e pode confundir.
9. **Não foi possível verificar, daqui, se o `t.js` publicado responde no endereço público** nem o tráfego recente do endpoint (o log consultado não retornou linhas de `track` nas últimas 24 h, o que **combina** com o banco, mas não é prova isolada).

---

## 13. Comparação: nossa estrutura × Google Tag Manager + planilhas

| Critério | **Estrutura própria (hoje)** | **GTM + planilhas** |
|---|---|---|
| **Vantagem técnica** | Servidor valida e recalcula origem; deduplicação garantida por `event_id`; token no cofre; WhatsApp e CRM entram no mesmo fluxo; regras versionadas (publicar/voltar). | Rápido para começar; muita gente conhece; Pixel/GA4 prontos em modelos. |
| **Desvantagens** | Mais código para manter; **só tem valor se estiver instalado** (hoje não está); depende de você/da equipe técnica para ajustes; Google ainda não integrado. | Eventos do servidor (CAPI) exigem **GTM Server-side** (infra paga e técnica); WhatsApp e CRM ficam fora; planilha vira ponto frágil. |
| **Custo de manutenção** | Sem mensalidade extra (usa o Supabase já pago). Custo = horas de desenvolvimento quando algo muda. | GTM web é grátis; **GTM server-side tem hospedagem mensal**; planilha exige alguém atualizar/conferir **toda semana**. |
| **Confiabilidade** | Fila com tentativas; log de cada envio; falha visível em tela. | Pixel no navegador perde dado com bloqueadores e Safari/iOS; planilha depende de digitação. |
| **Segurança/privacidade** | Hash no navegador; RLS em tudo; Vault para tokens; texto de conversa só com opt-in. | Cada tag de terceiros pode vazar dado; planilha compartilhada espalha telefone/e-mail sem controle. |
| **Escalabilidade** | Tabela de eventos particionada; limite por site/IP; hoje volume minúsculo (64 eventos). **Falta provar com tráfego real.** | GTM escala bem no navegador; planilha **não escala** (limite de linhas, lentidão, erro humano). |
| **Facilidade de manutenção** | Regras no CRM (sem mexer no site); mas quem mantém precisa entender o sistema. | Interface visual conhecida; mas contêineres bagunçam com o tempo, sem histórico claro. |
| **Controle dos dados** | **Total**: tudo no seu banco, por cliente, com exclusão e histórico. | Dados ficam espalhados (Google, Meta, planilhas). |
| **Integração com CRM** | **Nativa** (cliente, campanha, lead, venda, WhatsApp). | Manual/por exportação; difícil ligar venda à campanha. |

**Onde GTM ganharia:** instalar o Pixel/GA4/Google Ads num site novo em minutos, e conversões do Google Ads (já suportadas pelas tags prontas) enquanto o CRM não tem esse envio.

---

## 14. Conclusão sincera (respostas às 7 perguntas)

1. **O tracking está realmente funcionando?**
   **Em parte.** O **envio ao Meta funciona** (63/63 recebidos, 0 erros, token válido, fila rodando todo minuto). **A coleta pelo site não está funcionando na prática** porque nunca recebeu visita real. O que funciona de ponta a ponta hoje é **WhatsApp → CRM → Meta**, com qualidade baixa de atribuição.

2. **O servidor está cumprindo uma função importante?**
   **Sim, e é o coração do sistema.** Valida, deduplica, guarda, protege o token, recalcula a origem e envia ao Meta com tentativas. Ele **já provou valor no WhatsApp e nas marcações do CRM** (que não passariam por GTM).

3. **Estamos armazenando os dados corretamente?**
   **Sim, tecnicamente:** estrutura certa, RLS, hash de dados pessoais, partições, nada apagado sem aprovação. **Pontos de atenção:** dados de teste misturados aos reais; retenção declarada mas não aplicada; containers de teste ativos.

4. **Estamos perdendo informações de atribuição?**
   **Sim, e é a maior perda hoje.** Não vêm UTM/`fbclid`/`fbc`/`fbp` (sem script em site real), não vêm IDs de campanha (links sem `bf_c`), e os contatos de WhatsApp chegam sem `ctwa_clid`. Resultado: 58 contatos "de origem desconhecida" e eventos que o Meta não consegue ligar a anúncios.

5. **A estrutura própria é superior a GTM neste cenário?**
   **Sim para o seu objetivo** (agência com vários clientes, WhatsApp, CRM, controle de dados, "sem planilha"). **Não é superior hoje em entrega prática**, porque o GTM já estaria coletando e a nossa estrutura ainda não. A superioridade só se confirma depois de ligar o script a um site real. Para **Google Ads**, o GTM leva vantagem enquanto não houver o envio de conversões (fase 34.8).

6. **O que precisa ser corrigido?** (diagnóstico, não implementado)
   - Instalar o script em **um site real** com tráfego pago e conferir PageView, `fbc/fbp`, deduplicação e EMQ no Gerenciador de Eventos.
   - **Colar `bf_c/bf_s/bf_a` e UTM nos anúncios** (a tela já entrega o modelo).
   - Investigar por que **`ctwa_clid` não chega** no WhatsApp (testar com um anúncio real de clique-para-WhatsApp e ver a mensagem bruta do servidor) ou migrar o cliente para **API oficial/Coexistência**.
   - **Separar o que é teste do que é real:** marcar sites de teste como "modo teste" e revisar as 3 compras de teste no Pixel real.
   - Criar e **publicar as regras do site** (página de obrigado, clique, formulário).
   - **Levar o tracking para os relatórios** (cliente, Painel, Executivo) e para o MCP.
   - Decidir sobre **retenção** (ligar a limpeza, com aprovação).
   - **Google:** só quando houver cliente que dependa disso.

7. **O que devemos manter?**
   - O **servidor `track`** e a **fila + `capi-sender`** (funcionam e são seguros).
   - **Hash no navegador, token no Vault, RLS, regras do "nunca inventar origem"**.
   - **WhatsApp + marcação de venda + Contatos e vendas** (já dá valor real).
   - **Regras sem GTM** e a tela de **Saúde**.
   - A decisão de **não guardar texto de conversa por padrão**.

**Recomendação final:** manter a arquitetura própria. O risco atual não é "a arquitetura é errada", é **"ela está pronta, mas ainda não está conectada ao tráfego real"**. O próximo passo de maior retorno é um **piloto de verdade**: 1 cliente, 1 site com o script, anúncios com os parâmetros, e conferir no Gerenciador de Eventos do Meta.

---

## 15. Como esta auditoria foi feita (e o que NÃO foi feito)

- **Feito:** leitura do código real (`t.js`, `track`, `capi-sender`, `tracking-destinations`, `_shared/capi`, `params.ts`, funções SQL de ingestão/atribuição/fila), consulta **somente leitura** ao banco (contagens e estados, sem ler e-mail/telefone/nome), lista de funções publicadas e agendamentos.
- **Não feito:** nenhuma alteração de código, tabela, migração ou configuração; nenhum teste de navegador em site de cliente; nenhuma chamada ao Meta; nenhuma conferência no Gerenciador de Eventos (não tenho acesso). Por isso, **deduplicação Pixel×servidor e qualidade de correspondência (EMQ) real não puderam ser medidas** — só deduzidas do código e dos dados da fila.

---

## 16. Atualização: o que mudou na branch durante a auditoria (T5.34 a T5.36, 12–14/11)

Ao enviar este relatório, encontrei no repositório trabalho novo de outra sessão. Conferi o que muda no diagnóstico:

| Novidade | Efeito no diagnóstico |
|---|---|
| **T5.35 etapa 1:** aba Configurações do Tracking reorganizada **por cliente e por tipo de conexão** (Site · WhatsApp oficial · não oficial) | Só tela. Nada muda nos fluxos. |
| **T5.35 etapa 2:** **excluir um site** (coluna `excluded_at` em `tracking_containers`) | Resolve em parte o achado 8 (containers de teste poluindo a lista): agora dá para excluir sem perder referências. |
| **T5.35 etapa 3:** **ficha de rastreio do contato** (canal, anúncio, `ctwa_clid`, envios ao Meta) | Mostra na tela dados que já eram gravados. **Não cria origem nova:** se o contato não tem origem, a ficha também não terá. |
| **T5.35 etapa 4:** **Visão de marketing** ("de onde veio cada venda", arquivo `features/tracking/MarketingView.tsx`) | Continua **dentro do módulo Tracking**. Relatório do cliente, Painel e Executivo **continuam sem ler o tracking** (seção 9 segue valendo). |
| **T5.35 etapa 5:** aviso de site/conexão **sem uso** ("Nunca recebeu evento", "Sem uso desde…") e testador de link com criativo/conjunto | Ajuda a ver o achado 1 na própria tela: um site sem evento agora é sinalizado. |
| **T5.34/T5.36:** aviso "cliente sem gastar" confirmado pela entrega | Não é tracking (é monitoramento de contas). |
| **MCP 1.6.0** (publicação pela CLI) | O MCP continua **sem ferramenta que leia dados de tracking**. |

Os números do banco (seção 0 e 11) foram lidos **ao vivo no dia 15/11** e já refletem o estado atual. O código do `t.js`, do `track` e do envio ao Meta **não mudou** nessas etapas.
