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
- [Etapa 10 — Conjuntos e Anúncios](docs/etapa-10-conjuntos-anuncios/README.md) *(aguardando validação)*

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
```
