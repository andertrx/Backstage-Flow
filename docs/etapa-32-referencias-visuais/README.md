# Etapa 32 — Melhorias visuais (sem referências externas)

> Você decidiu não mandar referências: as melhorias partem do visual atual, que você aprovou.
> **Só aparência.** Nenhum dado, regra, permissão, tabela ou função do servidor foi alterado.

## Ponto de volta (se você não gostar)

| Parte | Versão ANTES da Etapa 32 |
|---|---|
| Código | commit **`81fa057`** (Etapa 34.4) |
| Site (Vercel) | deploy **`dpl_4rhgpvRdwK5VfBfinHFYy4G2SwtK`** (`web-mbk8agi6n-andertrxs-projects.vercel.app`) |
| Banco | nada muda nesta etapa (não precisa voltar nada) |

**Como voltar:**
1. **Na hora, pelo painel:** vercel.com → projeto `web` → Deployments → deploy `web-mbk8agi6n` → **⋯ → Promote to Production** (ou Instant Rollback).
2. **De vez, no código:** me diga **"desfaça a etapa 32"**. Eu desfaço o commit desta etapa (sem apagar histórico) e o site é republicado como antes.

## O que mudou

| # | Onde | Antes | Depois |
|---|---|---|---|
| 1 | **Dashboard → Saldo por conta** | Cada cartão tinha até 11 linhas; várias repetiam "Informação não disponível pela API." | **Valor disponível** e **Previsão de duração** em destaque no topo. Só aparecem as linhas que a plataforma informa. O que ela não informa fica numa nota só no rodapé ("Orçamento, Crédito disponível e Valor devido: Informação não disponível pela API."). Nada foi escondido nem inventado. |
| 2 | **Saldo por conta** | Conta com problema só tinha uma etiqueta | Faixa colorida à esquerda: **vermelha** (crítico: sem saldo, pagamento pendente) e **amarela** (atenção: saldo baixo). A previsão fica em laranja quando há alerta. |
| 3 | **Tabelas de campanhas, conjuntos e anúncios** | No celular a coluna do nome ocupava quase toda a tela | Coluna do nome mais estreita no celular (continua fixa ao rolar para o lado), com uma linha separando das outras colunas; a linha inteira fica destacada ao passar o mouse. |
| 4 | **Tracking → números do topo** | Cartões menores e diferentes do Dashboard | Mesmo tamanho e estilo dos cartões do Dashboard. |
| 5 | **Números dos cartões** | Largura dos algarismos variável | Algarismos com a mesma largura (os valores ficam alinhados). |

Resultado no Dashboard (tela de computador): a página ficou cerca de **10% mais curta** e os cartões de saldo cerca de **20% mais baixos**.
Comparação: `antes-dashboard.png` e `depois-dashboard.png` nesta pasta.

## Arquivos alterados
- `apps/web/src/features/balance/BalanceAccountCard.tsx` (cartão de saldo)
- `apps/web/src/components/data/MetricsTable.tsx` (tabelas de campanhas/conjuntos/anúncios)
- `apps/web/src/features/tracking/TrackingPage.tsx` (cartões do topo)
- `apps/web/src/features/dashboard/KpiCard.tsx` (algarismos alinhados)

## Testes
- Todos os testes de regras (web e compartilhado) passaram.
- Todas as 30 baterias de testes de navegador passaram, inclusive as do saldo, que conferem que nada é inventado quando a API não informa.

## Como testar manualmente
1. Abra o CRM (ou `/demo`) → **Dashboard** → role até **Saldo por conta**.
2. Confira: disponível e previsão no topo de cada cartão; contas com problema com a faixa colorida; nota no rodapé com o que a API não informa.
3. No celular, abra **Campanhas** e role a tabela para o lado: o nome da campanha fica parado à esquerda.
