# Backstage Flow

Dashboard de performance de tráfego pago (Meta Ads + Google Ads) com histórico persistente no Supabase.

Site publicado: https://www.backstageflow.com.br (endereço antigo, ainda ativo: https://web-ivory-three-49.vercel.app)

**Pendências para você:** [docs/PENDENCIAS.md](docs/PENDENCIAS.md)

**Para o Claude (ou quem continuar o projeto):** comece por [CLAUDE.md](CLAUDE.md) e pela pasta [docs/claude/](docs/claude/) — regras, jeito de trabalhar, estado atual e histórico das decisões.

O projeto é construído em etapas. A documentação de cada etapa fica em [`docs/`](docs/).

- [Etapa 0 — Planejamento](docs/etapa-00-planejamento/README.md) ✅ aprovada
- [Etapa 1 — Login e usuários](docs/etapa-01-login-usuarios/README.md) ✅ concluída
- [Etapa 2 — Clientes](docs/etapa-02-clientes/README.md) ✅ concluída
- [Etapa 3 — Meta Ads](docs/etapa-03-meta-ads/README.md) ✅ concluída
- [Etapa 4 — Google Ads](docs/etapa-04-google-ads/README.md) ✅ concluída
- [Etapa 5 — Banco histórico](docs/etapa-05-banco-historico/README.md) ✅ concluída
- [Etapa 6 — Dashboard principal](docs/etapa-06-dashboard-principal/README.md) ✅ concluída
- [Etapa 7 — Verificação de saldo](docs/etapa-07-verificacao-saldo/README.md) ✅ concluída
  - [Correção de 28/09/2026 — valor disponível real e forma de pagamento (cartão × PIX/boleto)](docs/etapa-07-verificacao-saldo/CORRECAO-2026-09-28-FORMA-DE-PAGAMENTO.md) ✅
  - [Correção de 13/10/2026 — saldo PIX informado no CRM (Estilo de Ser Kids)](docs/etapa-07-verificacao-saldo/CORRECAO-2026-10-13-SALDO-PIX-INFORMADO.md) ✅
- [Etapa 8 — Saúde das contas](docs/etapa-08-saude-contas/README.md) ✅ concluída
- [Etapa 9 — Campanhas](docs/etapa-09-campanhas/README.md) ✅ concluída
- [Etapa 10 — Conjuntos e Anúncios](docs/etapa-10-conjuntos-anuncios/README.md) ✅ concluída
- [Etapa 11 — Gráficos](docs/etapa-11-graficos/README.md) ✅ concluída
- [Etapa 12 — Comparação de períodos](docs/etapa-12-comparacao-periodos/README.md) ✅ concluída
- [Etapa 13 — Visão Meta Ads](docs/etapa-13-visao-meta-ads/README.md) ✅ concluída
- [Etapa 14 — Visão Google Ads](docs/etapa-14-visao-google-ads/README.md) ✅ concluída
- [Etapa 15 — Central de alertas](docs/etapa-15-central-alertas/README.md) ✅ concluída
- [Etapa 16 — Sincronização](docs/etapa-16-sincronizacao/README.md) ✅ concluída
- [Etapa 17 — Logs](docs/etapa-17-logs/README.md) ✅ concluída
- [Etapa 18 — Relatórios](docs/etapa-18-relatorios/README.md) ✅ concluída
- [Etapa 19.1 — Dashboard do cliente (modelo por cliente + PDF)](docs/etapa-19-dashboard-cliente/19.1-DASHBOARD.md) ✅ concluída
- [Etapa 19.2 — Acesso do cliente (login e link secreto)](docs/etapa-19-dashboard-cliente/19.2-ACESSO-DO-CLIENTE.md) ✅ concluída
- [Etapa 19.3 — Quem viu e onde (idade, gênero, horário, aparelho, plataforma, localização)](docs/etapa-19-dashboard-cliente/19.3-DIVISOES.md) ✅ concluída
- [Etapa 19.4 — Logo do cliente e e-mail semanal (Resend)](docs/etapa-19-dashboard-cliente/19.4-LOGO-EMAIL.md) ✅ concluída (falta verificar o domínio no Resend e colar a chave no CRM)
  - [Correção de 13/10/2026 — frase do resumo editável ou opcional](docs/etapa-19-dashboard-cliente/CORRECAO-2026-10-13-FRASE-DO-RESUMO.md) ✅
- [Etapa 20 — Permissões](docs/etapa-20-permissoes/README.md) ✅ concluída
- [Etapa 21 — Design](docs/etapa-21-design/README.md) ✅ concluída
- [Etapa 22 — Busca global](docs/etapa-22-busca-global/README.md) ✅ concluída
- [Etapa 23 — Banco histórico](docs/etapa-23-banco-historico/README.md) ✅ concluída
- [Etapa 24 — Cache](docs/etapa-24-cache/README.md) ✅ concluída
- [Etapa 25 — Tratamento de erros](docs/etapa-25-tratamento-de-erros/README.md) ✅ concluída
- [Etapa 26 — Segurança](docs/etapa-26-seguranca/README.md) ✅ concluída
- [Etapa 27 — Dados fictícios (modo demonstração)](docs/etapa-27-dados-ficticios/README.md) ✅ concluída
- [Etapa 28 — Preparação para novas plataformas](docs/etapa-28-novas-plataformas/README.md) ✅ concluída
- [Etapa 29 — Dashboard executivo](docs/etapa-29-dashboard-executivo/README.md) ✅ concluída
- [Etapa 30 — Performance](docs/etapa-30-performance/README.md) ✅ concluída
- [Etapa 31 — Responsividade](docs/etapa-31-responsividade/README.md) ✅ concluída
- [Etapa 32 — Melhorias visuais](docs/etapa-32-referencias-visuais/README.md) ✅ concluída (com ponto de volta)
- [Etapa 33 — Agente de IA](docs/etapa-33-agente-ia/README.md) *(em espera, a pedido — auditoria e plano prontos, nada implementado)*
- [Etapa 34 — Tracking & Atribuição (CAPI)](docs/etapa-34-tracking/ANALISE-E-PLANO.md) *(em andamento)*
  - [34.1 — Fundação: script no site, recepção de eventos e origem](docs/etapa-34-tracking/34.1-FUNDACAO.md)
  - [34.2 — Eventos de conversão, leads (dados só em hash) e jornada](docs/etapa-34-tracking/34.2-EVENTOS-E-LEADS.md)
  - [34.3 — Envio das conversões ao Meta (API de Conversões)](docs/etapa-34-tracking/34.3-META-CAPI.md)
  - [34.4 — De onde vêm as conversões: atribuição por campanha e qualidade do tracking](docs/etapa-34-tracking/34.4-ATRIBUICAO.md)
  - [34.5-W — WhatsApp (aplicativo comum): código de rastreio e marcação de Lead/Venda](docs/etapa-34-tracking/34.5-W-WHATSAPP.md)
  - [34.5-W2 — WhatsApp pela API oficial: conversas automáticas, anúncios de WhatsApp e envio business_messaging](docs/etapa-34-tracking/34.5-W2-WHATSAPP-API.md)
  - [Reanálise e plano novo do tracking completo para o Meta (23/10)](docs/etapa-34-tracking/REANALISE-2026-10-23.md)
  - [T2 — Regras do site sem Tag Manager (formulário lojista, página, clique, publicar/voltar versão)](docs/etapa-34-tracking/T2-REGRAS-SEM-TAG-MANAGER.md) ✅ 23/10
  - [T3.1 — Contatos no CRM (no lugar da planilha) e papel Vendedor do cliente](docs/etapa-34-tracking/T3.1-CONTATOS-E-VENDEDOR.md) ✅ 25/10
  - [T3.2 — Vendas pelo webhook de qualquer sistema de vendas](docs/etapa-34-tracking/T3.2-VENDAS-WEBHOOK.md) ✅ 25/10
  - [T4.1 — Frases do WhatsApp (marcação como no Tintim, pelo número)](docs/etapa-34-tracking/T4.1-FRASES-WHATSAPP.md) ✅ 25/10
  - [T4.2 — Ligar o WhatsApp pelo cadastro oficial do Meta (Coexistence)](docs/etapa-34-tracking/T4.2-WHATSAPP-COEXISTENCE.md) ✅ 26/10
  - [T5 — Tracking pronto para página de formulário e WhatsApp, sem cliente real (plano)](docs/etapa-34-tracking/T5-PLANO.md) *(em andamento)*
  - [T5.1 — Aba Tracking organizada em abas](docs/etapa-34-tracking/T5.1-ABAS.md) ✅ 08/11
  - [T5.2 — Cliques em botões e links, e campos escondidos com a origem](docs/etapa-34-tracking/T5.2-CLIQUES-E-CAMPOS.md) ✅ 08/11
  - [T5.2b — Link de grupo do WhatsApp e lead por webhook (Responde App)](docs/etapa-34-tracking/T5.2b-GRUPO-E-LEAD-POR-WEBHOOK.md) ✅ 08/11
  - [T5.3 — WhatsApp do cliente pelo servidor não oficial (conversas, origem do anúncio, frases)](docs/etapa-34-tracking/T5.3-WHATSAPP-SERVIDOR.md) ✅ 08/11
  - [T5.4 — Jornada completa de um lead provada no banco, sem cliente real](docs/etapa-34-tracking/T5.4-JORNADA-COMPLETA.md) ✅ 08/11 *(falta só o teste com o Pixel do Ander)*
  - [T5.5 — Lista "pronto para cliente" (aba Saúde do Tracking)](docs/etapa-34-tracking/T5.5-PRONTO-PARA-CLIENTE.md) ✅ 08/11
  - [T5.9 — Ficha do cliente com abas (tudo do cliente dentro dele; marcar venda só em Conversas)](docs/etapa-34-tracking/T5.9-FICHA-DO-CLIENTE.md) ✅ 09/11
  - [T5.10 — Tracking com Painel e Configurações (as abas circuladas saem da ficha e vão para o Tracking)](docs/etapa-34-tracking/T5.10-TRACKING-PAINEL-E-CONFIGURACOES.md) ✅ 09/11
  - [T5.11 — Correção: nova venda de quem já está na etapa Venda](docs/etapa-34-tracking/T5.11-VENDA-REPETIDA.md) ✅ 09/11
  - [T5.12 — Pedido repetido: confere também a fila do Meta](docs/etapa-34-tracking/T5.12-PEDIDO-REPETIDO.md) ✅ 09/11
  - [T5.13 — Configurações do Tracking em seções; WhatsApp dividido (ligar × acompanhar)](docs/etapa-34-tracking/T5.13-CONFIGURACOES-EM-SECOES.md) ✅ 09/11
  - [T5.14 — IA que sugere vendas, por WhatsApp (empresa)](docs/etapa-34-tracking/T5.14-IA-POR-WHATSAPP.md) ✅ 09/11
  - [T5.15 — Divisões claras (seções) nas telas com vários blocos](docs/etapa-34-tracking/T5.15-SECOES-NAS-TELAS.md) ✅ 09/11
  - [T5.16 — Situação da conversa mostra valor e nº do pedido (e novo logo)](docs/etapa-34-tracking/T5.16-VENDA-NA-CONVERSA.md) ✅ 09/11
  - [53.1 — Novo layout estilo Vertix: base visual (azul, menu lateral mantido)](docs/etapa-53-layout-vertix/53.1-BASE-VISUAL.md) ✅ 09/11
  - [53.2 — Novo layout: moldura (menu flutuante e cabeçalho em pílula)](docs/etapa-53-layout-vertix/53.2-MOLDURA.md) ✅ 09/11
  - [53.3 — Novo layout: cartões de números e barras hachuradas](docs/etapa-53-layout-vertix/53.3-CARTOES-E-BARRAS.md) ✅ 09/11
  - [53.4 — Novo layout: tema escuro e animações](docs/etapa-53-layout-vertix/53.4-TEMA-ESCURO-E-ANIMACOES.md) ✅ 09/11
  - [T5.7 — Conversas do WhatsApp estilo Tintim (texto sem prazo, telefone completo, marcar venda)](docs/etapa-34-tracking/T5.7-CONVERSAS-WHATSAPP.md) ✅ 08/11 *(falta revisão jurídica do texto e confirmar o aviso no site)*
  - [T5.6 — Vendas sugeridas pela IA (texto 2 dias; sugestão até decidir)](docs/etapa-34-tracking/T5.6-VENDAS-SUGERIDAS.md) ✅ 08/11 *(falta a chave da Anthropic e conversas reais)*
- [Etapa 35 — Meta Ads Campaign Builder (auditoria e plano)](docs/etapa-35-campaign-builder/35.0-AUDITORIA.md) *(em espera: prompt enviado por engano; auditoria guardada para depois)*
- [Etapa 36 — Central de Operações](docs/etapa-36-central-operacoes/36.16-RELATORIO-FINAL.md) ✅ concluída ([auditoria e plano](docs/etapa-36-central-operacoes/36.0-AUDITORIA.md))
  - [36.1 — Setores, equipe e permissões](docs/etapa-36-central-operacoes/36.1-SETORES-EQUIPE.md) ✅ concluída
  - [36.2 — Tarefas: Kanban, lista, Minhas tarefas, comentários, anexos e status](docs/etapa-36-central-operacoes/36.2-TAREFAS.md) ✅ concluída
  - [36.3 — Kanban operacional: onboarding, Account Manager, filas por setor e demandas](docs/etapa-36-central-operacoes/36.3-KANBAN-OPERACIONAL.md) ✅ concluída
  - [36.4 — Kanban comercial: leads, motivos de perda e conversão em cliente sem duplicar](docs/etapa-36-central-operacoes/36.4-KANBAN-COMERCIAL.md) ✅ concluída
  - [36.5 — Dailies e reuniões: agenda, ata, presença e pendência → tarefa](docs/etapa-36-central-operacoes/36.5-DAILIES-E-REUNIOES.md) ✅ concluída
  - [36.6 — Notificações (sino), avisos de prazo e repetição de tarefas e reuniões](docs/etapa-36-central-operacoes/36.6-NOTIFICACOES-E-REPETICAO.md) ✅ concluída
  - [36.7 — Painel operacional, visões salvas, busca da Central e atalho no dashboard geral](docs/etapa-36-central-operacoes/36.7-PAINEL-E-FINAL.md) ✅ concluída
  - [36.17 — Lembrete de tarefa vencida (8h, 12h e 17h) no CRM, no computador e no celular](docs/etapa-36-central-operacoes/36.17-LEMBRETES-PRAZO.md) ✅ 26/10
- [Etapa 37 — Monitoramento de Desempenho](docs/etapa-37-monitoramento/37.7-RELATORIO-FINAL.md) ✅ concluída
  - [37.1 — Base: permissões, limites e regras, situação da coleta, ID do criativo](docs/etapa-37-monitoramento/37.1-BASE.md) ✅ concluída
  - [37.2 — Comparativos, Campanhas e Criativos (miniaturas, tendência, dia a dia)](docs/etapa-37-monitoramento/37.2-COMPARATIVOS.md) ✅ concluída
  - [37.3 — Motor de alertas de desempenho (avaliação automática, aba Alertas, reincidência)](docs/etapa-37-monitoramento/37.3-MOTOR-DE-ALERTAS.md) ✅ concluída
  - [37.4 — Tratar alertas (estados, responsável, comentários, providências, tarefa, avaliação posterior)](docs/etapa-37-monitoramento/37.4-TRATAR-ALERTAS.md) ✅ concluída
  - [37.5 — Notificações (ícone de avisos, preferências, e-mail, resumo diário, histórico de envios)](docs/etapa-37-monitoramento/37.5-NOTIFICACOES.md) ✅ concluída
  - [37.6 — Visão geral, aba Histórico e integração (dashboard, ficha do cliente, Meta/Google)](docs/etapa-37-monitoramento/37.6-VISAO-GERAL-E-INTEGRACAO.md) ✅ concluída
  - [Filtro de objetivo da campanha (vários, salvo por pessoa)](docs/etapa-37-monitoramento/37.8-FILTRO-DE-OBJETIVO.md) ✅ concluído
  - [Correção: só alertas críticos, só itens ativos e janela do alerta e painéis dos sininhos no celular](docs/etapa-37-monitoramento/37.9-CORRECAO-SO-CRITICOS-E-CELULAR.md) ✅ concluída
  - [Correção: Campanhas, Conjuntos, Anúncios, Criativos e Contas como níveis dentro de Alertas](docs/etapa-37-monitoramento/37.10-NIVEIS-DENTRO-DE-ALERTAS.md) ✅ concluída
  - [Correção: resultado pela meta de otimização do conjunto (igual ao Gerenciador)](docs/etapa-37-monitoramento/37.11-RESULTADO-PELA-META.md) ✅ concluída
  - [Botão "Resolver" direto na lista de alertas](docs/etapa-37-monitoramento/37.12-BOTAO-RESOLVIDO.md) ✅ concluída
- **Etapa 38 — Comercial separado da Operação** ([plano](docs/etapa-38-comercial-e-operacao/38.0-PLANO.md))
  - [38.1 — Abas reorganizadas: Comercial (funil, ganhos e perdidos) e Operação](docs/etapa-38-comercial-e-operacao/38.1-ABAS-E-COMERCIAL.md) ✅ concluída
  - [38.2 — "Liberar para a operação", Operação começando em Onboarding Pendente e Filas dentro da Operação](docs/etapa-38-comercial-e-operacao/38.2-LIBERAR-E-OPERACAO.md) ✅ concluída
- **Etapa 39 — Inteligência de Resultados (Google Sheets)** ([plano](docs/etapa-39-inteligencia-de-resultados/39.0-PLANO.md))
  - [39.1 — Conexão com a planilha (conta de serviço do Google, assistente de colunas e perfis)](docs/etapa-39-inteligencia-de-resultados/39.1-CONEXAO-COM-A-PLANILHA.md) ✅ concluída (falta a chave do Google)
  - [39.2 — Leitura da planilha (8h, 12h e 16h + botão "Atualizar agora", qualidade, falhas)](docs/etapa-39-inteligencia-de-resultados/39.2-LEITURA-DA-PLANILHA.md) ✅ concluída (falta a chave do Google)
  - [39.3 — Perfis e origem (classificação, ligação por ID ou nome único, contatos únicos, rankings no banco)](docs/etapa-39-inteligencia-de-resultados/39.3-PERFIS-E-ORIGEM.md) ✅ concluída (falta a chave do Google)
  - [39.4 — Tela dos resultados (cards, perfis por dia, rankings campanha → conjunto → anúncio, registros)](docs/etapa-39-inteligencia-de-resultados/39.4-TELA-DOS-RESULTADOS.md) ✅ concluída (falta a chave do Google)
  - [39.5 — Qualidade dos dados, exportação CSV/Excel e fechamento](docs/etapa-39-inteligencia-de-resultados/39.5-QUALIDADE-E-EXPORTACAO.md) ✅ concluída (falta a leitura real com a chave do Google)
  - [Parâmetros da planilha refeitos (Nome, Número, SQL, Data, UTMs, IDs, gclid/fbclid, personalizados)](docs/etapa-39-inteligencia-de-resultados/39.6-PARAMETROS-DA-PLANILHA.md) ✅ 19/10
  - [Apresentação por perfil: campanhas, conjuntos e criativos de uma vez](docs/etapa-39-inteligencia-de-resultados/39.7-APRESENTACAO-POR-PERFIL.md) ✅ 21/10
  - [Correção da conta: IDs da planilha e aviso "sem campanha"](docs/etapa-39-inteligencia-de-resultados/39.8-CORRECAO-DA-CONTA.md) ✅ 21/10
  - [Modo CNPJ: planilha que só pede o CNPJ](docs/etapa-39-inteligencia-de-resultados/39.9-MODO-CNPJ.md) ✅ 22/10
- [Etapa 40 — Servidor MCP (conectar o Claude ao Backstage Flow, só leitura)](docs/etapa-40-mcp/40-SERVIDOR-MCP.md) ✅ 26/10 ([auditoria](docs/etapa-40-mcp/40.0-AUDITORIA.md))
  - [40.2 — MCP mexe na Central: criar e editar tarefas, status, pessoas, comentários, arquivar; configurações (admin)](docs/etapa-40-mcp/40.2-ESCRITA-NA-CENTRAL.md) ✅ 26/10
  - [40.3 — MCP no Monitoramento (tratar alertas, regras) e no onboarding dos clientes; histórico mostra "via Claude (MCP)"](docs/etapa-40-mcp/40.3-MONITORAMENTO-CLIENTES-E-ORIGEM.md) ✅ 26/10
  - [40.4 — MCP no Comercial (leads, sem devolver contatos à IA) e nas Reuniões (agendar, ata, itens, virar tarefa, cancelar)](docs/etapa-40-mcp/40.4-COMERCIAL-E-REUNIOES.md) ✅ 27/10
- [Etapa 41 — Envios semanais (Central: mensagem de feedback semanal para grupos de WhatsApp; o CRM guarda, o Claude envia pelo MCP)](docs/etapa-41-envios-semanais/41.1-ENVIOS-SEMANAIS.md)
  - [41.1 — banco, tela, copiar comando e histórico](docs/etapa-41-envios-semanais/41.1-ENVIOS-SEMANAIS.md) ✅ 27/10
  - [41.2 — aprovação semanal (pop-up das 7h ao horário), ferramentas do MCP e instrução da tarefa agendada](docs/etapa-41-envios-semanais/41.2-APROVACAO-E-MCP.md) ✅ 27/10
  - [41.3 — grupo e @ padrão de cada cliente, com ligar/desligar por pessoa](docs/etapa-41-envios-semanais/41.3-GRUPOS-E-ARROBAS.md) ✅ 27/10
  - [41.4 — no envio, só ligar/desligar clientes (Selecionar todos / Tirar todos), sempre com a última configuração](docs/etapa-41-envios-semanais/41.4-LISTA-DE-CLIENTES-NO-ENVIO.md) ✅ 27/10
  - [41.5 — código de cada envio (ENV-001) na instrução da tarefa; MCP 1.5.0](docs/etapa-41-envios-semanais/41.5-CODIGO-DO-ENVIO.md) ✅ 28/10
  - [41.6 — avisos para aprovar o envio (sino, aparelho e e-mail)](docs/etapa-41-envios-semanais/41.6-AVISOS-DE-APROVACAO.md) ✅ 04/11
  - [43.0 — levantamento: pendências, lentidão e organização](docs/etapa-43-organizacao/43.0-LEVANTAMENTO.md) ✅ 06/11
  - [43.1 — medição e otimização segura (alertas mais leves)](docs/etapa-43-organizacao/43.1-MEDICAO-E-OTIMIZACAO.md) ✅ 06/11
  - [43.2 — tela "Hoje" (pré-visualização em /hoje)](docs/etapa-43-organizacao/43.2-TELA-HOJE.md) ✅ 06/11
  - [44.0 — plano: WhatsApp por API não oficial (só plano)](docs/etapa-43-organizacao/44.0-PLANO-WHATSAPP-NAO-OFICIAL.md) 📝 06/11
  - [44.1 — conexão do WhatsApp não oficial (QR Code/código, trava geral)](docs/etapa-43-organizacao/44.1-CONEXAO-WHATSAPP-NAO-OFICIAL.md) ✅ 06/11 (nada é enviado ainda)
  - [44.2 — ligar o grupo do WhatsApp de cada cliente (nada é enviado)](docs/etapa-43-organizacao/44.2-LIGAR-GRUPOS-DO-WHATSAPP.md) ✅ 07/11 (regra substituída pela 47.2)
  - [44.3 — disparos pelo WhatsApp conectado, sem marcar @ (enviar sozinho e enviar agora)](docs/etapa-43-organizacao/44.3-DISPAROS-PELO-WHATSAPP.md) ✅ 07/11 (testado só com servidor simulado)
  - [45.1 — avisos no WhatsApp (motor: fila, agrupamento, silêncio; sem tela ainda)](docs/etapa-43-organizacao/45.1-AVISOS-NO-WHATSAPP.md) ✅ 07/11 (testado só no banco; sem envio real)
  - [45.2 — aviso "cliente sem gastar" no WhatsApp (motor, sem tela; precisão ~1 h)](docs/etapa-43-organizacao/45.2-AVISO-CLIENTE-SEM-GASTAR.md) ✅ 07/11
  - [45.3 — tela dos avisos no WhatsApp (grupo, tipos, silêncio, sem gasto por cliente)](docs/etapa-43-organizacao/45.3-TELA-DOS-AVISOS-NO-WHATSAPP.md) ✅ 07/11
  - [43.3 — mapa "quem vê o quê" e proposta de organização por função (só proposta)](docs/etapa-43-organizacao/43.3-MAPA-QUEM-VE-O-QUE-E-PROPOSTA.md) ✅ 07/11 (aguarda resposta)
  - [43.3 fase 1 — Integrações em seções e "o que cada papel vê" em Papéis e permissões](docs/etapa-43-organizacao/43.3-ORGANIZACAO-INTEGRACOES-E-PAPEIS.md) ✅ 07/11
  - [43.3 fase 2 — modelos de função (Gestor de tráfego, Operação, Comercial) na equipe da Central](docs/etapa-43-organizacao/43.3-MODELOS-DE-FUNCAO.md) ✅ 07/11
  - [43.3 fase 3 — menu com grupos recolhíveis (Sistema recolhido para quem acompanha anúncios)](docs/etapa-43-organizacao/43.3-MENU-POR-FUNCAO.md) ✅ 07/11
  - [43.4 — aba Notificações na Central (ativar aviso no aparelho)](docs/etapa-43-organizacao/43.4-ABA-NOTIFICACOES.md) ✅ 07/11
  - [43.5 — três sininhos identificados (Contas, Campanhas, Tarefas) e Alertas em 3 abas](docs/etapa-43-organizacao/43.5-TRES-SININHOS-E-ALERTAS-EM-ABAS.md) ✅ 07/11
  - [43.6 — Comercial e Envios semanais com menu próprio, separados da Central de Operações](docs/etapa-43-organizacao/43.6-COMERCIAL-E-ENVIOS-SEPARADOS.md) ✅ 07/11
  - [43.7 — Reuniões separadas, aba Onboarding e botões Google Agenda/.ics (sincronização automática depende de você)](docs/etapa-43-organizacao/43.7-REUNIOES-ONBOARDING-E-GOOGLE-AGENDA.md) ✅ 07/11
  - [43.8 — ordem do menu (Comercial, Onboarding, Central de Operações, Reuniões, Envios) e Onboarding como menu separado](docs/etapa-43-organizacao/43.8-ORDEM-DO-MENU-E-ONBOARDING-SEPARADO.md) ✅ 07/11
  - [46.0 — plano: Google Agenda de cada pessoa, nos dois sentidos (só plano)](docs/etapa-43-organizacao/46.0-PLANO-GOOGLE-AGENDA.md) 📝 07/11 (respondido)
  - [47.1 — Onboarding Pendente exige reunião realizada (vincular/criar, avisos, lembrete diário)](docs/etapa-43-organizacao/47.1-ONBOARDING-EXIGE-REUNIAO.md) ✅ 07/11
  - [47.2 — Onboarding por etapas: Agendado exige reunião agendada, Realizado exige realizada, cancelar = Onboarding Cancelado](docs/etapa-43-organizacao/47.2-ONBOARDING-ETAPAS-REUNIAO.md) ✅ 07/11
  - [48.1 — Comercial: histórico do lead do mais recente ao mais antigo e "Último contato" no cartão](docs/etapa-43-organizacao/48.1-COMERCIAL-ULTIMO-CONTATO.md) ✅ 07/11
  - [49.1 — Painel e Notificações com menu próprio](docs/etapa-43-organizacao/49.1-PAINEL-NOTIFICACOES-MENU.md) ✅ 07/11
  - [49.2 — Contrato Pago libera para o Onboarding (textos do Comercial)](docs/etapa-43-organizacao/49.2-CONTRATO-PAGO-LIBERA-ONBOARDING.md) ✅ 07/11
  - [49.3 — Onboarding Cancelado é livre (sem reunião)](docs/etapa-43-organizacao/49.3-ONBOARDING-CANCELADO-LIVRE.md) ✅ 07/11
  - [49.4 — Onboarding Realizado exige tarefa para o time de operação](docs/etapa-43-organizacao/49.4-ONBOARDING-EXIGE-TAREFA-OPERACAO.md) ✅ 07/11
  - [49.5 — Liberar demanda já vem na primeira etapa do onboarding](docs/etapa-43-organizacao/49.5-DEMANDA-ETAPA-PADRAO.md) ✅ 07/11
  - [50.0 — plano: tarefas padrão do onboarding (só plano)](docs/etapa-43-organizacao/50.0-PLANO-TAREFAS-PADRAO-ONBOARDING.md) 📝 07/11 (substituído pela 50.1)
  - [50.1 — Tarefas padrão do onboarding (marcar no cartão, setor inteiro ou pessoa; cadastro em Configurações)](docs/etapa-43-organizacao/50.1-TAREFAS-PADRAO-ONBOARDING.md) ✅ 07/11
  - [50.2 — Descrição nas tarefas do onboarding (campo maior na nova, opcional nas padrão)](docs/etapa-43-organizacao/50.2-TAREFAS-DESCRICAO.md) ✅ 07/11
  - [50.3 — Arrastar cartões no celular (segurar e arrastar)](docs/etapa-43-organizacao/50.3-ARRASTAR-NO-CELULAR.md) ✅ 07/11 (testado com toque emulado, não em aparelho físico)
  - [50.4 — Nome do cliente em evidência nos cartões do Onboarding](docs/etapa-43-organizacao/50.4-NOMES-EM-EVIDENCIA.md) ✅ 07/11
  - [50.5 — Nome da empresa em evidência nas tarefas e no Comercial](docs/etapa-43-organizacao/50.5-EMPRESA-EM-EVIDENCIA.md) ✅ 07/11
  - [50.6 — Configurações da Central com menu próprio (abaixo de Reuniões)](docs/etapa-43-organizacao/50.6-CONFIGURACOES-DA-CENTRAL-NO-MENU.md) ✅ 07/11
  - [50.7 — Equipe dentro das Configurações da Central](docs/etapa-43-organizacao/50.7-EQUIPE-DENTRO-DAS-CONFIGURACOES.md) ✅ 07/11
  - [51.1 — Ficha do cliente no Onboarding (dados, o que veio do Comercial, contatos e observações; cliente novo direto)](docs/etapa-43-organizacao/51.1-FICHA-DO-CLIENTE-NO-ONBOARDING.md) ✅ 07/11
  - [51.2 — Onboarding enxuto (sem Liberar demanda, Registrar atividade, Resumo e Tarefas) e "Mover para…" com pop-up da regra](docs/etapa-43-organizacao/51.2-ONBOARDING-ENXUTO-E-MOVER-PARA.md) ✅ 07/11
  - [51.3 — Arquivar e excluir cartões (tarefas e leads) e aba "Arquivados e excluídos"](docs/etapa-43-organizacao/51.3-ARQUIVAR-E-EXCLUIR-CARTOES.md) ✅ 07/11
  - [51.4 — "Reunião realizada" no cartão do Onboarding (mesma janela do menu Reuniões)](docs/etapa-43-organizacao/51.4-REUNIAO-REALIZADA-NO-CARTAO.md) ✅ 07/11
  - [51.5 — "Trocar reunião" no cartão do Onboarding (usar outra ou criar nova; a anterior é substituída)](docs/etapa-43-organizacao/51.5-SUBSTITUIR-REUNIAO.md) ✅ 07/11
  - [46.1 — conectar o Google Agenda de cada pessoa (Reuniões e Minha conta)](docs/etapa-43-organizacao/46.1-CONECTAR-GOOGLE-AGENDA.md) ✅ 07/11 (testado só com Google simulado)
  - [47.0 — plano: Onboarding Pendente exige reunião realizada (só plano)](docs/etapa-43-organizacao/47.0-PLANO-ONBOARDING-EXIGE-REUNIAO.md) 📝 07/11 (respondido)
  - [47.1 — Onboarding Pendente exige reunião realizada (vincular/criar, avisos, lembrete diário)](docs/etapa-43-organizacao/47.1-ONBOARDING-EXIGE-REUNIAO.md) ✅ 07/11
  - [44.1 — passo a passo do servidor do WhatsApp (arquivos prontos em `infra/whatsapp-evolution/`)](docs/etapa-43-organizacao/44.1-SERVIDOR-PASSO-A-PASSO.md) 📝 07/11
  - [45.0 — plano: disparos e avisos pelo WhatsApp + divisão empresa × cliente (só plano)](docs/etapa-43-organizacao/45.0-PLANO-DISPAROS-E-AVISOS-NO-WHATSAPP.md) 📝 07/11
- [Etapa 42 — Criador de Anúncios (monta o pedido em texto para o Claude criar anúncios no Meta; modelos e histórico; 42.1: cliente → BM → conta → campanha → conjunto nas listas do CRM)](docs/etapa-42-criador-de-anuncios/42-CRIADOR-DE-ANUNCIOS.md) ✅ 28/10
- [Política de Privacidade e Termos de Serviço (páginas públicas)](docs/POLITICA-E-TERMOS.md) ✅ 22/10
- [Desativar cliente (para sincronização, alertas, planilha, e-mail, acesso e tracking)](docs/CLIENTE-DESATIVADO.md) ✅ 23/10
- [Contas ativas × clientes desativados e Excluir cliente](docs/CLIENTE-DESATIVADO.md#contas-ativas--desativadas-e-excluir-cliente-23102026-à-tarde) ✅ 23/10

## Estrutura

```
apps/web/          site (React + Vite + Tailwind)
packages/shared/   código compartilhado (papéis, permissões, CNPJ, telefone, fórmulas de métricas e períodos)
supabase/          migrações do banco, testes de segurança e Edge Functions
docs/              documentação etapa por etapa
```

## Comandos

```bash
npm install
npm run dev        # site em http://localhost:5173 (requer apps/web/.env.local)
npm test           # testes unitários
npm run typecheck  # verificação de tipos
npm run test:functions  # testes das Edge Functions (Deno)
npm run check:secrets   # procura tokens/chaves no código e no site gerado
```
