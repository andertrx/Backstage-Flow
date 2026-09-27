# Backstage Flow

Dashboard de performance de tráfego pago (Meta Ads + Google Ads) com histórico persistente no Supabase.

Site publicado: https://web-ivory-three-49.vercel.app

O projeto é construído em etapas. A documentação de cada etapa fica em [`docs/`](docs/).

- [Etapa 0 — Planejamento](docs/etapa-00-planejamento/README.md) ✅ aprovada
- [Etapa 1 — Login e usuários](docs/etapa-01-login-usuarios/README.md) ✅ concluída
- [Etapa 2 — Clientes](docs/etapa-02-clientes/README.md) ✅ concluída
- [Etapa 3 — Meta Ads](docs/etapa-03-meta-ads/README.md) ✅ concluída
- [Etapa 4 — Google Ads](docs/etapa-04-google-ads/README.md) ✅ concluída
- [Etapa 5 — Banco histórico](docs/etapa-05-banco-historico/README.md) ✅ concluída
- [Etapa 6 — Dashboard principal](docs/etapa-06-dashboard-principal/README.md) ✅ concluída
- [Etapa 7 — Verificação de saldo](docs/etapa-07-verificacao-saldo/README.md) ✅ concluída
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
- Etapa 19 — Dashboard do cliente *(em espera, a pedido)*
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
- Etapa 32 — Referências visuais *(em espera, a pedido — aguardando prints/modelos)*
- [Etapa 33 — Agente de IA](docs/etapa-33-agente-ia/README.md) *(em espera, a pedido — auditoria e plano prontos, nada implementado)*
- [Etapa 34 — Tracking & Atribuição (CAPI)](docs/etapa-34-tracking/ANALISE-E-PLANO.md) *(em andamento)*
  - [34.1 — Fundação: script no site, recepção de eventos e origem](docs/etapa-34-tracking/34.1-FUNDACAO.md)
  - [34.2 — Eventos de conversão, leads (dados só em hash) e jornada](docs/etapa-34-tracking/34.2-EVENTOS-E-LEADS.md)
  - [34.3 — Envio das conversões ao Meta (API de Conversões)](docs/etapa-34-tracking/34.3-META-CAPI.md)
  - [34.4 — De onde vêm as conversões: atribuição por campanha e qualidade do tracking](docs/etapa-34-tracking/34.4-ATRIBUICAO.md)
  - [34.5-W — WhatsApp (aplicativo comum): código de rastreio e marcação de Lead/Venda](docs/etapa-34-tracking/34.5-W-WHATSAPP.md)
  - [34.5-W2 — WhatsApp pela API oficial: conversas automáticas, anúncios de WhatsApp e envio business_messaging](docs/etapa-34-tracking/34.5-W2-WHATSAPP-API.md)

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
