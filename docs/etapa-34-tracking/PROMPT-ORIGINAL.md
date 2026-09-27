# ETAPA 34 — Prompt original (como enviado pelo Ander, 27/09/2026)

> Guardado para referência. A análise, os ajustes e o plano estão em `ANALISE-E-PLANO.md`.
> Pedido adicional feito na mesma conversa: **rastrear também as conversões de WhatsApp** (incluído no plano, seção 4-B e fase 34.5-W).

**ETAPA 34 — TRACKING & ATTRIBUTION ENGINE** — sistema avançado de rastreamento, tracking, Conversions API e atribuição.

**Contexto:** considera as etapas 0–33 implementadas (clientes, contas Meta/Google, campanhas, métricas, histórico, relatórios, sincronização, dashboard, alertas, Agente IA, automações, controle de contas, permissões).

Novo módulo 🎯 **TRACKING & ATTRIBUTION ENGINE**: infraestrutura própria de rastreamento e atribuição, semelhante ao Google Tag Manager, porém:
- mais simples, mais direto, integrado ao SaaS e fácil de configurar;
- orientado a Meta Ads e Google Ads;
- com captura de parâmetros, jornada, First/Last Touch, atribuição, Meta CAPI, server-side, deduplicação, eventos, histórico, diagnóstico, painel visual e rastreamento de origem.

**Regra fundamental:**
- Não alterar etapas 0–33, o banco (de forma destrutiva), a autenticação, o dashboard, as integrações, o Agente IA nem os relatórios.
- Módulo adicional, reutilizando a infraestrutura.
- Sem segundo banco e sem duplicar sistemas.

## Itens

**34.0 Auditoria obrigatória (sem implementar).**
- Identificar: banco, clientes, usuários, contas Meta/Google, campanhas, métricas, APIs, autenticação, backend, frontend, rotas, armazenamento, logs, jobs, webhooks, permissões, domínio, infraestrutura, variáveis de ambiente, eventos, WhatsApp, formulários, landing pages, relatórios.
- Verificar se já existe: Pixel, Google Tag, GTM, GA4, Meta CAPI, UTMs, webhooks, CRM, leads, identificação de usuários, parâmetros de URL.
- Apresentar: arquitetura, reutilizáveis, o que criar, riscos, dependências e plano. Não implementar antes da aprovação.

**34.1 Objetivo principal.** Responder "de onde veio essa conversão?", com a jornada completa. Exemplo:

> Meta Ads → campanha → conjunto → anúncio → landing page → página de produto → WhatsApp → formulário → lead → compra → receita R$ 497.

**34.2 Princípio de atribuição.** Confirmada, provável ou desconhecida. Nunca inventar origem nem transformar estimativa em certeza.

**34.3 First Touch.** Primeira origem conhecida, com todos os parâmetros.

**34.4 Last Touch.** Última origem antes da conversão, mantendo a cadeia histórica.

**34.5 Multi-touch.** Guardar todos os touchpoints. Modelo matemático complexo não é obrigatório de início.

**34.6 Captura de parâmetros.**
- UTMs: source, medium, campaign, content, term.
- Meta: fbclid. Google: gclid, wbraid, gbraid.
- Outros parâmetros relevantes.
- Não sobrescrever sem histórico.

**34.7 Normalização.** Ex.: facebook/fb/instagram → plataforma. Guardar RAW e NORMALIZED.

**34.8 tracking_id próprio.** Relaciona sessão, visitante, eventos, leads, conversões, touchpoints e campanhas. Não depender de cookies de terceiros.

**34.9 session_id.** Início, fim, origem, landing page, páginas, eventos, campanha e dispositivo (quando permitido).

**34.10 visitor ID persistente**, com consentimento e sem fingerprinting invasivo. Priorizar:
- cookies first-party;
- local storage;
- session IDs;
- IDs fornecidos pelo usuário;
- IDs do backend.

**34.11 Consentimento.** Registrar consentimento, data, versão, finalidade e status. LGPD. Minimizar dados.

**34.12 Eventos.**
- Básicos: PageView, ViewContent, Lead, FormSubmit, Contact, WhatsAppClick, AddToCart, InitiateCheckout, Purchase.
- Eventos personalizados criados pelo administrador.

**34.13 event_id por evento.**

**34.14 Deduplicação.** Browser + Server = mesmo evento, contado uma vez só, com o event_id como elemento central.

**34.15 Meta Conversions API oficial.**
- Configurar Pixel, dataset e credenciais.
- Enviar eventos server-side.
- Registrar respostas e erros.
- Retry seguro, sem duplicidade.

**34.16 Eventos Meta:** PageView, ViewContent, Lead, Contact, CompleteRegistration, AddToCart, InitiateCheckout, Purchase e personalizados, com os parâmetros adequados.

**34.17 Matching.** E-mail, telefone, nome, cidade, país etc., quando fornecidos legitimamente: normalizar → hash → enviar. Nunca guardar texto puro sem necessidade.

**34.18 _fbc/_fbp.** Preservar quando disponíveis. Não inventar valores.

**34.19 Google.** Preservar gclid, wbraid e gbraid, com origem, campanha, sessão, conversão e timestamp.

**34.20 Google Conversions.** Estrutura para Google Ads, GA4 e conversões offline, com envio de volta quando houver credenciais.

**34.21 Click IDs.** Nunca perder fbclid, gclid, wbraid e gbraid. Associar a tracking_id, session_id, touchpoint, lead e conversão.

**34.22 Cadeia.** CLICK → SESSION → VISIT → EVENT → LEAD → SALE → REVENUE.

**34.23 Lead.** Criar ou atualizar lead_id, com tracking_id, session_id, first/last touch, touchpoints, UTMs, click IDs, timestamp, landing page, formulário e origem.

**34.24 WhatsApp.**
- Registrar WhatsAppClick com tracking_id, session_id, campanha, ad set, ad, UTMs, click ID, landing page e timestamp.
- Com integração CRM/WhatsApp: lead → conversa → venda.

**34.25 Conversão offline.** Anúncio → landing page → WhatsApp → vendedor → venda no sistema → R$ 1.500, associada ao tracking original.

**34.26 CRM.** Lead → qualificado → reunião → proposta → contrato → venda, mantendo a origem.

**34.27 Receita.** revenue, currency, transaction_id, purchase_id, timestamp, source, campaign, adset, ad, tracking_id.

**34.28 transaction_id.** Nenhuma compra contada duas vezes.

**34.29–34.31 Atribuição por campanha, conjunto e anúncio.** Cliques → sessões → leads → conversões → receita → ROAS.

**34.32 Painel 🎯 TRACKING.** Visitas, leads, conversões, receita, eventos, conversões atribuídas e conversões sem origem.

**34.33 Qualidade do tracking.** 🟢/🟡/🔴 com motivos. Ex.: % de conversões sem click ID ou sem UTM, sem sessão, eventos duplicados.

**34.34 Diagnóstico automático.**
- Pixel e CAPI funcionando; eventos chegando.
- Duplicados; UTMs; click IDs.
- Eventos sem sessão ou sem origem; conversões sem identificação.
- Erros de API, atraso, discrepância entre plataformas.

**34.35 Testar tracking.** Informar uma URL e ver UTMs, fbclid, tracking ID e session ID.

**34.36 Testar conversão.**
- Browser e server OK, deduplicação OK.
- Meta e Google recebidos.
- event_id e timestamp.

**34.37 Event log.** Data, hora, evento, origem, campanha, ad set, ad, tracking ID, session ID, event ID, status, plataforma e resposta.

**34.38 API log.** Endpoint, plataforma, timestamp, request ID, event ID, status, resposta, erro e retry. Sem secrets.

**34.39 Retry.** Backoff, limite de tentativas e fila de erros. Sem duplicidade.

**34.40 Fila de eventos.** Evento → fila → processamento → Meta/Google → confirmação → log.

**34.41 Arquitetura híbrida.** O browser captura; o servidor processa e é a fonte de verdade para eventos críticos.

**34.42 Não depender só de cookies.** Não depender apenas de cookies de terceiros, browser, JS ou Pixel. Combinar:
- IDs first-party, session, tracking ID;
- click IDs, UTMs;
- backend, CRM, transaction ID;
- eventos server-side.

**34.43 Cross-domain.** Site A → LP B → checkout C → WhatsApp → CRM.

**34.44 Redirect tracking** (/go/...), preservando parâmetros.

**34.45 Gerador de link rastreável.** Fonte, meio, campanha, conteúdo, termo, ID interno e destino → URL final.

**34.46 Padrão de nomenclatura**, personalizável. Ex.:
```
utm_source=meta
utm_medium=paid_social
utm_campaign=cliente_black_friday
utm_content=video_03
utm_term=publico_x
```

**34.47 Histórico de alterações.** Usuário, data, hora, configuração anterior e nova.

**34.48 Modelos de atribuição.** First Touch, Last Touch, Linear e "Data available". Sempre mostrar o modelo usado, nunca como verdade absoluta.

**34.49 Comparação.** First × Last × plataforma. Ex.: Meta 120 × interno 104 = diferença 16. Não esconder discrepâncias.

**34.50 Reconciliação.** Interno × Meta × Google × CRM × vendas: eventos, leads, vendas, receita e divergências.

**34.51 Explicação de divergência.** Só causas verificáveis:
- janela de atribuição, atraso;
- perda de IDs, consentimento, bloqueadores;
- definição de conversão, duplicados;
- conversões offline, timezone, diferenças de plataforma.

Não afirmar sem evidência.

**34.52 "De onde estão vindo as conversões?"** Meta, Google, orgânico, direto, referral, WhatsApp, outros e desconhecido.

**34.53 Jornada individual (timeline).** Ex.: 09:21 Meta Ads → 09:22 LP → 09:24 ViewContent → 09:28 WhatsApp → 09:35 Lead → 11:42 venda R$ 497. É uma das principais funcionalidades.

**34.54 Detalhe da conversão.**
- IDs: tracking ID, session ID, lead ID, transaction ID.
- Origem: first/last touch, touchpoints, UTMs.
- Click IDs: FBCLID, FBC, FBP, GCLID, WBRAID, GBRAID.
- Contexto: landing page, device, timestamp.
- Valor: revenue, currency.
- Eventos e status nas plataformas.

**34.55 Privacidade.** Minimização, controle de acesso, criptografia, hashing, retenção, exclusão e auditoria. Sem fingerprinting.

**34.56 Retenção configurável** (90/180/365 dias/custom), depois anonimizar ou excluir.

**34.57 Permissões.**
- Visualizar tracking; configurar tracking.
- Ver leads; ver conversões; ver dados sensíveis.
- Configurar CAPI; configurar Google.
- Gerenciar eventos; gerenciar integrações.
- Ver logs.

**34.58 Multi-tenant.** Isolamento obrigatório no backend.

**34.59 Integração com o Agente IA.** Ex.: por que as vendas da Meta caíram, campanhas com leads sem vendas, conversões sem origem, tracking quebrado, maior receita.

**34.60 Alertas.**
- CAPI parou; Google parou.
- Aumento de conversões sem origem; queda de 30% no volume.
- Aumento de duplicados.
- GCLID ou FBCLID não preservados.

**34.61 Health check periódico.** Eventos, APIs, webhooks, filas, erros, atraso, duplicação e volume.

**34.62 Status das integrações.** Meta conectado, CAPI funcionando, último evento; Google idem.

**34.63 Eventos perdidos.** Recebidos, processados, falhos, reprocessados e confirmados.

**34.64 Observabilidade.** Quantos eventos chegaram, foram enviados, aceitos, falharam, duplicados, atribuídos e sem origem.

**34.65 Performance.** Script leve, assíncrono, que não bloqueia e tolera falhas.

**34.66 Resiliência.** O site funciona mesmo se o tracking, a Meta ou o Google falharem. Eventos armazenados e reprocessados.

**34.67 Credenciais.** Nenhum token ou secret no frontend.

**34.68 Testes automatizados.**
- Captura: UTM, FBCLID, GCLID, FBC, FBP.
- Identidade: session, tracking ID, event ID.
- Envio: dedup, CAPI, Google.
- Conversões: conversão, venda, offline, retry.
- Casos difíceis: cross-domain, perda de parâmetros, dados incompletos.

**34.69 Teste end-to-end.**
1. Abrir link.
2. Capturar parâmetros.
3. Criar tracking ID e session ID.
4. Registrar PageView e evento.
5. Gerar lead e conversão.
6. Enviar a Meta e Google e confirmar.
7. Ver no dashboard, com logs.

**34.70 Confiabilidade.** "Não sei" em vez de "acho que veio da Meta". "Origem não determinada".

**34.71 Fonte da verdade.** Registro próprio. As plataformas não são a única verdade.

**34.72 Sem prometer atribuição perfeita.** "104 de 112 conversões possuem origem identificada."

**34.73 Attribution Overview.**
- Investimento → cliques → sessões → leads → conversões → receita → ROAS.
- Filtros: cliente, plataforma, conta, campanha, período, origem e modelo.

**34.74 Relatório por cliente.** Origem de leads e vendas, receita, ROAS e sem origem.

**34.75 Exportação** CSV/Excel/PDF, respeitando permissões e privacidade.

**34.76 API interna** `POST /tracking/events`. Campos:
- identificação: event_name, event_id, tracking_id, session_id, timestamp, page_url;
- UTMs: source, medium, campaign, content, term;
- click IDs: fbclid, gclid, wbraid, gbraid;
- valores: revenue, currency, user_data.

Com autenticação/validação.

**34.77 Webhooks:** lead, venda, CRM, pagamento, cancelamento e eventos externos.

**34.78 Idempotência** por event_id/transaction_id.

**34.79 Timezone.** UTC no backend; fuso do cliente na tela.

**34.80 Documentação "Como instalar o tracking"** em 7 passos.

**34.81 Instalação simplificada** sem programação:
1. Cliente.
2. Domínio.
3. Meta.
4. Google.
5. Eventos.
6. Código.
7. Teste.
8. Publicar.

**34.82 Gerador de código** com instruções para HTML, WordPress, Shopify, landing pages etc.

**34.83 Containers estilo GTM** por cliente (tags, eventos, triggers, configurações), bem mais simples.

**34.84 Event builder.** Nome, quando, e enviar para tracking interno, Meta, Google ou CRM.

**34.85 Triggers:**
- página visitada, URL contém;
- botão clicado, elemento clicado;
- formulário enviado;
- WhatsApp clicado;
- compra concluída;
- evento recebido.

**34.86 Tags:** Meta, Google, interno, webhook e CRM. Prioridade: simplicidade.

**34.87 Preview mode.** Ver no site quais eventos disparam e quais integrações receberam.

**34.88 Debug mode.** Evento, payload sanitizado, destino, status e resposta. Sem secrets.

**34.89 Versionamento** (v1, v2, v3): publicar, voltar e ver alterações.

**34.90 Rollback** de configuração.

**34.91 Ambientes** dev/staging/prod quando possível. Não enviar teste para produção sem identificação.

**34.92 Rate limit**, validação, autenticação, antispam e limites.

**34.93 Antifraude básico.** Duplicados, picos, transaction IDs repetidos, automação. Só sinalizar.

**34.94 Métricas do tracking.**
- eventos por hora e por dia;
- conversões por dia;
- % sem origem, % de duplicação, % de falha de API;
- tempo de processamento e de confirmação.

**34.95 Integração com relatórios existentes** como novas métricas/dimensões, sem alterar de forma destrutiva:
- leads e vendas rastreados;
- receita atribuída, origem, campanha;
- ROAS interno;
- discrepância Meta e Google.

**34.96 Agente IA** apontando discrepâncias com os dados usados.

**34.97 Alertas automáticos.** Quebra → alerta → diagnóstico → possível causa → ação recomendada.

**34.98 Custo de infraestrutura.** Eventos processados, armazenamento, API, webhooks e custo estimado.

**34.99 Escalabilidade** de 10 para 10.000 clientes sem reescrever.

**34.100 Testes de segurança.**
- Isolamento entre clientes; acesso não autorizado.
- Exposição de tokens e de PII.
- Endpoints públicos; abuso de API.
- Replay; duplicação.
- Manipulação de tracking IDs; injeção de parâmetros.

**34.101 Regressão** das etapas 0–33.

**34.102 Checklist final**, cobrindo todos os itens acima.

**Resultado final:** infraestrutura de tracking, eventos, attribution, CAPI, Google conversions, first/last/multi-touch, server-side, deduplicação, CRM attribution, offline, diagnóstico, monitoramento e auditoria. Reconstruir ANÚNCIO → CLIQUE → SESSÃO → VISITA → EVENTO → LEAD → VENDA → RECEITA e dizer "Origem não determinada" quando não houver dados.

**Prioridades:** confiabilidade, rastreabilidade, deduplicação, privacidade, auditabilidade, simplicidade e escalabilidade. Sem complexidade por si só. Configurável sem ser especialista.
