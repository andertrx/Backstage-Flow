# ETAPA 34 — Tracking & Attribution Engine · Análise e plano

> Status: **análise para aprovação**. Nada foi implementado.
> Prompt original guardado em `PROMPT-ORIGINAL.md` (nesta pasta).
> Ponto de restauração do CRM: `../PONTO-DE-RESTAURACAO.md`.

---

## 1. Veredito

O objetivo é **viável e faz sentido**: reconstruir a jornada anúncio → clique → sessão → evento → lead → venda → receita e enviar as conversões ao Meta pela **API de Conversões (CAPI)**. Os princípios do prompt são corretos e combinam com as regras do projeto:
- "Origem não determinada" em vez de inventar;
- deduplicação por `event_id`;
- idempotência por `transaction_id`;
- privacidade;
- atribuição sem prometer 100%.

**Mas o prompt descreve um produto inteiro** (um "GTM + CAPI + atribuição + CRM"), com 102 itens, e parte deles depende de coisas que **não existem** no sistema. Precisa ser dividido em fases, começando pelo que você pediu como prioridade: **o CAPI**.

---

## 2. O que muda em relação a tudo que fizemos até agora

Até aqui, o CRM é **interno**: só sua equipe acessa, e ele **lê** dados das plataformas.
O Tracking é **externo**: um código roda **nos sites dos seus clientes**, recebe eventos de **qualquer visitante da internet** e envia dados ao Meta/Google.

Consequências:

| Tema | Hoje | Com o Tracking |
|---|---|---|
| Quem acessa o servidor | Só usuários logados do CRM | **Qualquer visitante** dos sites dos clientes (endpoint público) |
| Volume de dados | ~144 mil linhas/ano | Pode ser **milhões de eventos** (cada visita vira PageView) |
| Dados pessoais | Nenhum dado de lead | **E-mail e telefone de leads** (para o matching do Meta) → LGPD |
| Segurança | CORS só para o site oficial | Endpoint aberto, com chave pública por cliente, domínios autorizados, limite de requisições e antiabuso |

Isso não impede o projeto. Só exige o desenho certo desde o início (seção 4).

---

## 3. Ajustes necessários no prompt

1. **"Etapas 0–33 implementadas".** Na verdade 19, 32 e 33 estão **em espera**.
   - Os itens que usam o **Agente IA** (34.59 e 34.96) ficam para quando a 33 for feita.
   - O **relatório visto pelo próprio cliente** (34.74) depende da **Etapa 19** (Dashboard do cliente).
2. **Não existe WhatsApp, CRM de vendas, formulários nem landing pages** no sistema hoje. Por isso:
   - **WhatsApp:** foi incluído no plano, a pedido (seção 4-B): clique no botão do site com código na mensagem, e anúncios que abrem o WhatsApp direto via API oficial do WhatsApp Business.
   - **CRM/vendas:** criamos um registro **simples** de leads e vendas: por formulário do site, por webhook do sistema do cliente ou por lançamento manual. O funil completo (qualificado → reunião → proposta → contrato) fica preparado e é feito depois.
3. **Google Ads ainda não está conectado ao CRM.**
   - **Conversões do Google** (upload de conversões offline/enhanced conversions pela Google Ads API, e GA4 Measurement Protocol) entram numa fase própria, depois da conexão.
   - O **gclid/wbraid/gbraid** é **capturado e guardado desde o início**, para não perder nada.
4. **Ligar o tracking às campanhas do CRM com precisão.** Nomes de campanha mudam e se repetem. O jeito confiável é o anúncio mandar os **IDs** na URL:
   - **Meta:** parâmetros dinâmicos `{{campaign.id}}`, `{{adset.id}}`, `{{ad.id}}`;
   - **Google:** ValueTrack `{campaignid}`, `{adgroupid}`, `{creative}`.
   - Sem os IDs, a atribuição fica por UTM (nome), que é marcada como **"provável"**, não "confirmada".
5. **`_fbc` não é inventado.** A Meta documenta como montar o `fbc` a partir do `fbclid` (`fb.1.<timestamp>.<fbclid>`). Seguir a regra oficial não é inventar. O `_fbp` só é usado se o Pixel o criou.
6. **Ambientes dev/staging/prod.** A infraestrutura atual tem um ambiente só. Em vez disso:
   - **modo teste** por container;
   - **código de evento de teste** do Meta (`test_event_code`), que não mistura com produção.
7. **Escala para 10.000 clientes.** Com o servidor atual (~1 GB), não é realista guardar todos os PageViews de milhares de sites. O plano:
   - guardar **eventos importantes** completos;
   - resumir PageViews em contagens por dia;
   - usar tabelas particionadas por mês e retenção configurável.
   - Isso atende dezenas a centenas de clientes no plano atual. Para crescer mais, aumenta-se o plano do Supabase **sem reescrever**.
8. **Custo:** o tracking não usa IA. O custo é de infraestrutura (banco e processamento). Mostramos volumes e uma estimativa simples.
9. **LGPD.**
   - O seu SaaS passa a ser **operador de dados pessoais** dos clientes.
   - O **site do cliente** precisa de política de privacidade e, se usar banner de cookies, o script respeita o consentimento.
   - E-mail e telefone são **normalizados e criptografados (hash)** antes de guardar e enviar.
   - "Visualizar dados sensíveis" (34.57) só funciona se guardarmos o dado original **cifrado**. Isso é uma decisão sua (seção 7).
   - *Isto não é orientação jurídica. Vale conversar com quem cuida dos contratos.*
10. **"GTM style".** Mantemos a ideia de **container por cliente** com eventos, gatilhos e destinos, mas **bem simples**:
    - eventos prontos (formulário, WhatsApp, compra) configurados em poucos cliques;
    - versões com "publicar" e "voltar versão".
    - Um GTM completo, com qualquer gatilho em qualquer elemento, ficaria complexo demais e fica para depois.

---

## 4. Arquitetura proposta (sem segundo banco, sem nova infraestrutura)

```
Site do cliente
  └─ script leve (t.js, servido pelo site do CRM na Vercel)
       • captura UTMs, fbclid, gclid, wbraid, gbraid, _fbp/_fbc
       • cria tracking_id (visitante) e session_id — cookies first-party no domínio do cliente
       • respeita consentimento
       • dispara o Pixel do Meta com o MESMO event_id (para deduplicar)
       • envia o evento, sem travar a página
            ↓
Edge Function pública `track` (Supabase)
  • chave pública do container + domínio autorizado + limite de requisições + validação
  • grava o evento (idempotente por event_id) e atualiza sessão/touchpoints
  • coloca na fila os eventos que vão para Meta/Google
            ↓
Fila (tabela no mesmo banco) + pg_cron (mesmo padrão da sincronização)
  • envia ao Meta CAPI (token no Vault, como os outros)
  • tentativas com espera crescente, limite e "caixa de erros"
  • registra request/resposta sem segredos
            ↓
Telas no CRM: 🎯 Tracking (status, eventos, jornada, atribuição, diagnóstico, logs)
```

- **Tabelas novas** (explicadas uma a uma antes de criar): containers, versões de configuração, visitantes, sessões, touchpoints, eventos (particionada por mês), leads (dados pessoais só em hash ou cifrados), vendas, fila de envio, log de API e consentimentos.
- **Nada existente é alterado.** O módulo nasce **desligado** e pode ser removido por script, como previsto no ponto de restauração.
- **Reaproveitado:**
  - Vault para os tokens;
  - `pg_cron` + Edge Functions;
  - limite de requisições;
  - `error_logs` e auditoria;
  - permissões por papel;
  - RLS por cliente;
  - relatórios e exportação (Etapa 22);
  - catálogo de plataformas;
  - tabela de campanhas, para ligar os IDs.

---

## 4-B. WhatsApp (pedido adicional — incluído no plano)

Existem **dois caminhos** de conversão pelo WhatsApp, e o sistema vai cobrir os dois:

### Caminho 1 — Anúncio → site → botão do WhatsApp
- O script do site registra o clique no botão do WhatsApp (**WhatsAppClick / Contact**), com campanha, conjunto, anúncio, UTMs, click ID, página e horário.
- O link do WhatsApp sai com um **código curto de rastreamento** na mensagem pré-preenchida (ex.: "Olá! Quero saber mais. [ref: A7K2]"). Quando a conversa virar venda, o vendedor (ou a integração) informa o código e o sistema liga a venda à origem.
- Envio ao Meta pelo CAPI como **Contact** e, depois, **Lead/Purchase**.
- **Funciona com qualquer WhatsApp**, inclusive o app comum.

### Caminho 2 — Anúncio que abre o WhatsApp direto (Click-to-WhatsApp, sem site)
- Aqui não passa por site, então o script não vê nada. A informação de origem chega **dentro da primeira mensagem** que o cliente recebe no WhatsApp: a Meta envia o anúncio de origem e um identificador de clique (`ctwa_clid`).
- **Só é possível receber isso pela Plataforma do WhatsApp Business (API oficial / Cloud API)**, diretamente ou por um provedor oficial (BSP), com **webhook**. O aplicativo WhatsApp Business comum **não fornece** esses dados para sistemas externos.
- O CRM recebe o webhook e cria o contato com a origem (campanha/anúncio). Quando o lead evolui (qualificado, venda), envia ao Meta pelo **CAPI para mensagens** (origem da ação "mensagens"), para o Meta otimizar os anúncios de WhatsApp pelos resultados reais.
- **Não armazenamos o conteúdo das conversas.** Só os dados necessários: telefone em hash, origem, datas e etapas.

### Nova fase no plano
| Fase | Entrega | Depende de |
|---|---|---|
| **34.5-W** | WhatsApp: rastreio do botão com código na mensagem (caminho 1), webhook da Plataforma WhatsApp Business com origem do anúncio (caminho 2), marcar Lead/Venda da conversa, envio ao Meta CAPI | 34.3; caminho 2 também depende de o cliente usar a **API oficial do WhatsApp** (direto ou por provedor) |

## 5. Fases propostas (cada uma com aprovação)

| Fase | Entrega | Depende de |
|---|---|---|
| **34.0** | Auditoria e plano (este documento) | — |
| **34.1** | **Fundação:** container por cliente, domínios autorizados, script `t.js`, endpoint `track`, captura de UTMs e click IDs, tracking_id/session_id, PageView, consentimento, retenção, "Testar tracking (URL)" | aprovação |
| **34.2** | **Eventos e leads:** Lead, envio de formulário, clique no WhatsApp, Contact, Purchase; `event_id`; leads com dados pessoais em hash; `transaction_id` sem duplicar; first/last touch e todos os touchpoints; **jornada individual** (timeline) | 34.1 |
| **34.3** | **Meta CAPI (prioridade):** Pixel/Dataset + token no Vault; fila, envio, tentativas; **deduplicação navegador + servidor**; fbc/fbp; matching com hash; código de teste; **log de API**; status "CAPI funcionando / último evento" | 34.2 + **dados do Pixel do cliente** |
| **34.4** | **Atribuição e painéis:** por campanha, conjunto e anúncio (pelos IDs); "De onde vêm as conversões"; First × Last × plataforma; qualidade do tracking com motivos; reconciliação e divergências | 34.3 |
| **34.5** | **Vendas offline e webhooks:** lançar venda manual ou por webhook; ligar ao tracking original; enviar ao Meta como conversão offline; funil do CRM preparado | 34.3 |
| **34.5-W** | **WhatsApp:** botão do site com código de rastreio; anúncios Click-to-WhatsApp via webhook da API oficial; Lead/Venda da conversa → Meta CAPI | 34.3 (+ API oficial do WhatsApp no caminho 2) |
| **34.6** | **Links rastreáveis:** gerador de URL com padrão de nomenclatura; `/go/...` com redirecionamento | 34.1 |
| **34.7** | **Containers "estilo GTM" simplificado:** criar evento, gatilhos, destinos; preview e debug; versões e rollback | 34.3 |
| **34.8** | **Google:** conversões offline/enhanced conversions pela Google Ads API e GA4 Measurement Protocol | **conexão Google Ads** |
| **34.9** | **Monitoramento:** alertas de tracking, health check, métricas, custo, exportação, testes de segurança e regressão | todas |
| *Futuro* | Integração com Agente IA (33), relatório do próprio cliente (19), CRM completo | etapas em espera |

**Para ter o CAPI funcionando o quanto antes:** 34.1 → 34.2 → 34.3 → 34.5-W (WhatsApp). As outras fases vêm depois.

---

## 6. Passo a passo do que **você** vai precisar fazer

> Recomendo começar com **1 cliente piloto** que tenha site próprio (ou landing page) e Pixel do Meta.

### Antes da fase 34.1
1. **Escolher o cliente piloto.**
2. **Garantir acesso ao site dele** (painel do WordPress/Elementor, Shopify, construtor de landing page ou quem edita o site) para colar um código no cabeçalho.
3. **Confirmar se o site tem política de privacidade** e se usa banner de cookies. Se usar, me diga qual.

### Antes da fase 34.3 (CAPI)
4. **Acesso ao Pixel do cliente** no Business Manager: você como administrador do conjunto de dados, ou a sua BM como parceira.
5. **Copiar o ID do Pixel/Conjunto de dados:** Gerenciador de Eventos → Fontes de dados → selecione o Pixel → o número aparece no topo.
6. **Gerar o token do CAPI:** Gerenciador de Eventos → selecione o Pixel → **Configurações** → seção **API de Conversões** → **Gerar token de acesso**.
   - Você vai **colar esse token no CRM**, e ele vai direto para o cofre.
   - Não mande o token por chat ou e-mail.
7. **Verificar o domínio** do site do cliente: Configurações do negócio → Segurança da marca → Domínios.
8. **Separar o código de teste:** Gerenciador de Eventos → **Eventos de teste** → copiar o código (ex.: `TEST12345`). Ele é usado só nos testes.

### Nos anúncios (para a atribuição ser "confirmada", não só "provável")
9. **Meta:** em cada anúncio, no campo **Parâmetros de URL**, colar:
   ```
   utm_source=meta&utm_medium=paid_social&utm_campaign={{campaign.name}}&utm_content={{ad.name}}&utm_term={{adset.name}}&bf_c={{campaign.id}}&bf_s={{adset.id}}&bf_a={{ad.id}}
   ```
   Depois o gerador da fase 34.6 monta isso para você.
10. **Google (depois):** modelo de acompanhamento com `{campaignid}`, `{adgroupid}` e `{creative}`. Detalho na fase 34.8.

### Para vendas fora do site (fase 34.5)
11. **Decidir como as vendas chegam ao CRM:** lançamento manual, planilha ou webhook do sistema do cliente (Hotmart, loja, ERP etc.).

### Para o WhatsApp (fase 34.5-W)
12. **Descobrir qual WhatsApp o cliente usa:** aplicativo WhatsApp Business comum, ou a **API oficial** (Cloud API / provedor como Twilio, Zenvia, Take Blip, 360dialog etc.).
    - Com o **app comum**, fazemos o caminho 1 (botão do site + código na mensagem) e o vendedor marca a venda no CRM.
    - Para o caminho 2 (anúncio direto para o WhatsApp), o número precisa estar na **API oficial**, e você precisa de acesso para **configurar o webhook** apontando para o CRM (eu passo o endereço e a chave).
13. **Anúncios Click-to-WhatsApp:** confirmar que a conta do WhatsApp está **conectada à Página/BM** que roda os anúncios.
14. **Definir quem marca o lead e a venda** das conversas (vendedor no CRM, ou o sistema de atendimento via webhook).

### Para o Google (fase 34.8)
15. Conectar o **Google Ads** no CRM (Integrações). Depois, criar a **ação de conversão** no Google Ads. Se quiser GA4, gerar o **API secret** do Measurement Protocol.

---

## 7. Decisões que dependem de você
1. **Aprovar** o plano e a ordem das fases (CAPI na 34.3).
2. **Cliente piloto.**
3. **Dados pessoais:** guardar só **hash** de e-mail e telefone (mais seguro, suficiente para o CAPI) ou guardar também o valor **cifrado** para poder visualizar o lead no CRM (exige a permissão "visualizar dados sensíveis").
4. **Retenção padrão:** sugestão de **180 dias** para eventos detalhados, com totais por dia permanentes.
5. **WhatsApp:** qual o cliente piloto usa (app comum ou API oficial/provedor)?
6. **O script dispara o Pixel do Meta** (recomendado, garante a deduplicação) ou o cliente mantém o Pixel já instalado. Nesse caso, precisamos garantir o mesmo `event_id` nos dois.
