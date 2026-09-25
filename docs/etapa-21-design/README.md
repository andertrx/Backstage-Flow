# ETAPA 21 — Design

> Status: **concluída e validada**.

## 1. O que fizemos (explicado de forma simples)

O site já tinha menu lateral, cards, tabelas, gráficos e filtros (feitos nas etapas anteriores).
Nesta etapa demos o **acabamento de plataforma profissional** em tudo o que é comum a todas as telas:

| Antes | Agora |
|---|---|
| Menu lateral numa lista só | Menu em **4 grupos** (Visão geral, Anúncios, Análise, Sistema), **sem mudar a ordem** pedida |
| Item ativo só um pouco mais claro | Item ativo com **barrinha colorida** e ícone destacado |
| Menu sempre largo | Botão **"Recolher menu"**: vira uma faixa só de ícones (o site lembra a escolha) |
| Aba do navegador sempre "Backstage Flow" | Aba mostra a página: **"Clientes · Backstage Flow"** |
| Topo sem nome da seção | Topo **fixo** ao rolar, com o nome da seção e as **iniciais** do usuário |
| Fonte do sistema (muda em cada computador) | Fonte **Inter** em todos os computadores, guardada no próprio site (sem site externo) |
| Site inteiro baixado de uma vez (940 kB) | Cada página só é baixada quando é aberta: arquivo inicial com **357 kB** (**62% menor**) |
| Menu do celular fechava só no X | Fecha no X, tocando fora ou com **Esc** |
| — | Atalho **"Pular para o conteúdo"** para quem usa teclado; contorno de foco visível |
| — | Quem pede "menos animação" no computador recebe o site sem animações |
| — | Conteúdo com **largura máxima** em telas muito grandes (fica fácil de ler) |

Ordem do menu (fixa, como pedido):
Dashboard · Clientes · Contas · Meta Ads · Google Ads · Campanhas · Relatórios · Alertas · Sincronização · Logs · Configurações.

## 2. Por que fizemos

Um painel usado o dia todo precisa **abrir rápido**, deixar claro **onde você está** e **funcionar igual** em qualquer computador ou celular.

## 3. Arquivos

| Arquivo | Para que serve |
|---|---|
| `apps/web/src/components/layout/AppLayout.tsx` | Menu lateral (grupos, recolher), topo fixo, título da aba, atalho de teclado |
| `apps/web/src/components/layout/navigation.ts` (+ teste) | Ordem e grupos do menu, e qual item corresponde a cada endereço |
| `apps/web/src/components/layout/Logo.tsx` | Logo com versão compacta (menu recolhido) |
| `apps/web/src/lib/usePersistentState.ts` | Lembra se o menu está recolhido |
| `apps/web/src/app/router.tsx` | Cada página carregada só quando for aberta |
| `apps/web/src/index.css` | Fonte Inter, cores da marca, contorno de foco, "menos animação" |
| `apps/web/e2e/design.mjs` | Teste de navegador desta etapa |
| `apps/web/e2e/logs.mjs` | Teste deixado mais firme (espera um filtro terminar antes do próximo) |

Removido: `ComingSoon.tsx` (a tela "Em construção" não é mais usada — todas as páginas do menu existem).

## 4. Testes

- **Novo teste de navegador (`design.mjs`)**, 18 verificações:
  ordem exata do menu e grupos; item atual destacado; título da aba; nome da seção no topo;
  atalho de teclado; recolher/expandir e lembrar após recarregar;
  **as 11 páginas do menu cabem na tela do celular** sem rolagem lateral;
  gaveta do celular e Esc; fonte Inter carregada; nenhum erro no navegador.
- Todos os outros testes de navegador continuam passando (**556 verificações** no total).
- Testes automáticos: 83 (site) + 84 (regras compartilhadas); verificação de tipos e build sem erros.

## 5. Como testar você mesmo

1. Abra o site no computador. O menu aparece em 4 grupos, na mesma ordem de antes.
2. Clique em **Clientes**: a aba do navegador passa a dizer "Clientes · Backstage Flow".
3. Clique em **Recolher menu** (embaixo do menu): ficam só os ícones. Passe o mouse para ver o nome. Recarregue: continua recolhido.
4. No celular, toque no ☰, escolha uma página; toque fora do menu para fechar.
5. Role uma página comprida: o topo fica parado no lugar.

## 6. Resultado esperado

Visual limpo e igual em todas as páginas, abertura mais rápida e navegação clara no computador e no celular.
