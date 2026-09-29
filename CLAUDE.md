# CLAUDE.md — Backstage Flow

> Leia este arquivo inteiro antes de qualquer tarefa. Ele resume **como o dono do projeto
> gosta de trabalhar** e as regras que valem desde a Etapa 0. Os detalhes estão em
> [`docs/claude/`](docs/claude/):
> - [COMO-TRABALHAR.md](docs/claude/COMO-TRABALHAR.md): passo a passo técnico (banco, testes, publicação, armadilhas).
> - [ESTADO-ATUAL.md](docs/claude/ESTADO-ATUAL.md): onde o projeto está, o que está pendente e as próximas etapas possíveis.
> - [HISTORICO.md](docs/claude/HISTORICO.md): linha do tempo das etapas e das decisões do dono (o "porquê" das coisas).

## 1. O projeto e o dono
- **Backstage Flow** é um CRM para agência de tráfego pago: Meta Ads, Google Ads, histórico, saldo, alertas, relatórios, dashboard do cliente, tracking/CAPI e a Central de Operações (tarefas, clientes, comercial, reuniões).
- **Site:** https://www.backstageflow.com.br (Vercel, projeto `web`). **Banco:** Supabase, projeto `dkatllzkmlzpginuzvis`.
- **Dono: Ander.** Não é programador.
  - Fala português e escreve rápido, às vezes com erros de digitação ("pode avanvar" = "pode avançar").
  - Quer entender **o que muda para ele**, não o código.

## 2. Jeito de trabalhar (obrigatório)
1. **Por etapas.** Cada etapa (ou fase, como 36.1, 36.2…) começa com auditoria e plano quando é grande, e só avança quando Ander responde **"pode avançar"** (ou "pode fazer").
   - Nunca pule para a próxima etapa sozinho.
   - Se ele mandar "pode avançar" repetido no meio do trabalho, é só confirmação: continue a fase atual.
2. **Correção ou pedido novo:** quando ele diz "diga antes se entendeu", **não mexa em nada**.
   - Investigue (só leitura) e explique em linguagem simples o que entendeu e o que encontrou nos dados reais.
   - Proponha o caminho e faça, no máximo, duas perguntas objetivas.
   - Espere o "pode fazer".
3. **Relatório final de cada fase:** em português simples, com cerca de **10 seções numeradas**.
   - O que você ganhou, o que mudou, regras, quem pode, tabelas novas, testes, arquivos, documentação/commit etc.
   - **Toda tabela nova é explicada:** nome, para quê, campos principais, ligações, índices e **por quanto tempo é guardada**.
   - Termine **sempre** com a frase: **"Aguardo o Pode avançar."**
4. **Honestidade:** diga o que foi testado e o que não foi, o que falhou e por quê.
   - Nunca diga que algo foi publicado ou testado sem ter feito.
   - Falha conhecida e antiga (ver `docs/claude/ESTADO-ATUAL.md`) deve ser dita como tal.
5. **Documentação de cada fase** em `docs/etapa-XX-.../`, com imagem da tela quando houver (sai do teste de navegador).
   - Atualize o `README.md` (lista de etapas com ✅) e o `docs/PENDENCIAS.md` quando algo depender do Ander.
6. **Commit e push ao fim de cada fase** (ver seção 5). Sem Pull Request, a não ser que ele peça.

## 3. Regras de produto (valem sempre)
- **Nunca inventar dados.**
  - Só números das APIs oficiais (Meta Marketing API, Google Ads API) ou do banco.
  - Sem informação → mostre "Informação não disponível pela API" ou "—", nunca uma estimativa.
- **Nunca apagar histórico automaticamente.** Arquivar/cancelar em vez de apagar; histórico de mudanças é permanente.
- **Fuso e moeda:**
  - respeitar o fuso da conta (padrão America/Sao_Paulo);
  - **nunca somar BRL com USD** (cada moeda separada).
- **Saldo das contas** (correção de 28/09/2026):
  - "disponível" é **dinheiro real**: o saldo pré-pago (PIX/boleto) informado pelo Meta ou o orçamento do Google;
  - conta paga no cartão = R$ 0,00;
  - o limite de gastos ou do cartão **nunca** é mostrado como saldo.
  - Ver `docs/etapa-07-verificacao-saldo/CORRECAO-2026-09-28-FORMA-DE-PAGAMENTO.md`.
- **Menu lateral com ordem fixa:** Visão geral · Operações · Anúncios · Análise · Sistema. Itens novos só com aprovação; o teste `architecture.test` fixa a ordem.
- **Sem botões de mentira:** nada que não funcione aparece na tela.
- **Central de Operações** (Etapa 36): módulo independente, ligado só a clientes e usuários.
  - Não altera os módulos de anúncios. Sem IA.
  - Permissões conferidas **no banco**.
  - Tema claro com destaque **azul** (o roxo da referência virou azul, a pedido).
- **Visual:** tema claro, componentes de `apps/web/src/components/ui`, Tailwind. Mudanças visuais grandes pedem aprovação.

## 4. Segurança (inegociável)
- **Nunca expor** tokens de acesso, client secrets, refresh tokens, service role ou chaves privadas, nem no código, nem em logs, nem no chat.
  - Credenciais ficam **só** no Supabase Vault ou nos segredos das Edge Functions.
  - `npm run check:secrets` precisa passar antes de todo commit.
- **Senhas e tokens que o Ander cola:**
  - a senha temporária de admin nunca vai para arquivo ou repositório;
  - o token da API de Conversões do Meta e a chave do Resend são colados **só no campo do CRM**, nunca no chat. Se ele colar no chat, avise e peça para trocar.
- **O e-mail do Ander** fica só em `private.app_settings` (banco), nunca no código.
- **Dados pessoais:**
  - tracking: guardados **só como hash SHA-256** (feito no navegador);
  - leads comerciais (Central) têm contato legível, protegido por RLS (Comercial + admin), e **nunca** vão para logs ou histórico;
  - texto de conversa do WhatsApp **nunca** é guardado.
- **Banco:**
  - RLS ligado em **todas** as tabelas;
  - funções públicas finas chamam funções `private.*_impl` (security definer) que conferem a permissão.
  - Rodar os avisos de segurança do Supabase (`get_advisors`) após mudanças no banco.

## 5. Git
- **Branch de trabalho:** `claude/meta-google-ads-dashboard-8g4wfg` (todo o projeto foi feito nela). Commit e `git push -u origin <branch>`. Se a sessão indicar outra branch, siga a sessão e avise o Ander.
- **Mensagens de commit** em português, dizendo o que mudou. **Não** colocar nome/ID de modelo de IA em commits, código ou documentos.
- Se a ferramenta de sessão pedir linhas de atribuição (Co-Authored-By etc.), siga o que ela mandar para a sessão atual.

## 6. Estrutura do código
```
apps/web/            site (React 19 + Vite + Tailwind v4 + TanStack Query + React Router 7)
  src/features/      uma pasta por módulo (dashboard, balance, operations, tracking...)
  src/demo/          servidor simulado usado pelo modo demonstração e pelos testes de navegador
  e2e/               testes de navegador (Playwright, um arquivo .mjs por módulo)
packages/shared/     regras compartilhadas + testes (vitest): permissões, fórmulas, saldo, Central...
supabase/
  migrations/        mudanças do banco, em ordem (nunca editar uma já aplicada: crie outra)
  functions/         Edge Functions (Deno): sync, ad-accounts, admin-users, track, capi-sender...
  tests/             testes SQL por etapa (rodam numa transação desfeita)
  rollback/          scripts de remoção de módulos (ex.: remover_central_operacoes.sql)
docs/                documentação por etapa, pendências, domínio, ponto de restauração
```

## 7. Checagens antes de entregar
```bash
npm run typecheck && npm run lint && npm test          # tipos, lint, testes unitários
npm run test:functions && npm run check:functions      # Edge Functions (Deno)
npm run check:secrets                                  # nenhum segredo no código/site
```
Mais: teste SQL da fase, testes de navegador do módulo e, ao fim de cada fase, o conjunto completo. Veja os comandos exatos em [COMO-TRABALHAR.md](docs/claude/COMO-TRABALHAR.md).
