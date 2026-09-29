# Como trabalhar neste projeto (guia técnico para o Claude)

> Complementa o [CLAUDE.md](../../CLAUDE.md). Aqui estão os comandos e os cuidados que
> funcionaram na prática. Onde houver `$S`, use a pasta de rascunho (scratchpad) da sessão.

## 1. Acessos necessários
- **GitHub:** repositório `andertrx/Backstage-Flow`, branch `claude/meta-google-ads-dashboard-8g4wfg`.
- **Supabase** (ferramentas MCP `mcp__Supabase__*`), projeto **`dkatllzkmlzpginuzvis`**.
  - Sem ele não dá para aplicar migrations, rodar testes SQL nem publicar Edge Functions. Se não estiver conectado, avise o Ander antes de começar.
  - O ambiente da sessão costuma **não conseguir** chamar `*.supabase.co` por `curl` (o proxy bloqueia). Use as ferramentas MCP.
- **Vercel** (opcional; ferramentas `mcp__Vercel__*`): o site é o projeto `web`. A configuração está em `apps/web/vercel.json` (CSP, rewrites).
- **Chave publicável do Supabase** (necessária para o build local e os testes de navegador): pegue com `mcp__Supabase__get_publishable_keys`. Ela é pública por natureza, mas **não** a grave em arquivos do repositório. A `service_role` **nunca** é usada no site.

## 2. Banco de dados (migrations)
1. **Antes de mudar,** leia o que existe: `list_tables` ou `execute_sql` em `information_schema`/`pg_proc`. Confira nomes de colunas, valores de `check` e funções auxiliares.
2. **Aplique** com `mcp__Supabase__apply_migration` (nome em snake_case). Migrations grandes vão em partes (`..._part1`, `..._part2`).
3. **Copie para o repositório:** busque a versão com
   `select version, name from supabase_migrations.schema_migrations order by version desc limit 3;`
   e salve o mesmo SQL em `supabase/migrations/<version>_<name>.sql`.
4. **Nunca edite** uma migration já aplicada: corrija com uma nova (ex.: `..._fix`).
5. **Padrão de segurança:**
   - função pública `language sql` fina → `private.<nome>_impl` (`security definer`, `set search_path = ''`), que confere a permissão;
   - `revoke all ... from public, anon` e `grant execute ... to authenticated`;
   - RLS em toda tabela nova; tabela só de leitura para o site; gravação só por função.
6. **Erros com mensagem para o usuário:**
   - `raise exception '...' using errcode = '22023'`: o site mostra a mensagem (em português);
   - `42501` = sem permissão;
   - `40001` = alguém alterou antes (controle por `version`).
7. **Central de Operações:** permissões com `private.ops_can('ops.xxx')`, `ops_need`, `ops_require_admin`. Visibilidade com `ops_task_visible`, `ops_client_visible`, `ops_meeting_visible`.
8. **Remoção:** módulos novos grandes ganham seção no script de `supabase/rollback/`. Teste o trecho novo numa transação desfeita e confira 0 tabelas/funções restantes.
9. **Depois de mudar:** `mcp__Supabase__get_advisors` (security). Hoje só existem 2 avisos antigos e aceitos (ver ESTADO-ATUAL).

## 3. Testes SQL (`supabase/tests/`)
- Um arquivo por fase: cria usuários/dados de teste, confere cada regra e termina com `rollback` (nada fica gravado).
- **Para rodar pelo MCP** (`execute_sql`):
  - mande o conteúdo começando com `begin;`, sem o `rollback` final;
  - no fim, um bloco que faz `raise exception 'R: ...'` com o resultado. O erro desfaz tudo e mostra o resultado.
  - Modelo: junte os resultados numa tabela temporária `r(what, v)` e compare com um `jsonb` de esperados, listando **todas** as diferenças de uma vez.
- **Armadilhas conhecidas:**
  - Uma função `stable` não enxerga o que a mesma instrução acabou de gravar: separe em instruções diferentes.
  - Ao simular o `pg_cron`/sistema, zere o usuário: `set local request.jwt.claims = '{}'`.
  - Gatilhos adiados (`deferred`) só disparam com `set constraints all immediate`.
  - Para simular tempo (datas antigas), use `set local session_replication_role = replica` e volte com `origin` (desliga gatilhos de `updated_at`).
  - `account_snapshots.payload` é `not null` (use `'{}'`). Fotografias do Meta passam por um gatilho que recalcula o disponível a partir de `payload` + `funding_description`.

## 4. Site e testes
```bash
npm install                                            # na raiz (workspaces)
npm run typecheck && npm run lint && npm test          # tipos, lint e unitários (web + shared)
npm run test:functions && npm run check:functions      # Edge Functions (Deno)
npm run check:secrets
```
- O **teste de arquitetura** (`apps/web/src/features/platforms/architecture.test.ts`) proíbe escrever "meta"/"google" fixo nas telas: use o catálogo (`getPlatform(...)`).
- O **menu** tem ordem fixada em teste.

### Testes de navegador (e2e, Playwright com servidor simulado)
```bash
cd apps/web
# 1) build de desenvolvimento (use a URL e a chave publicável do projeto)
VITE_SUPABASE_URL=https://dkatllzkmlzpginuzvis.supabase.co VITE_SUPABASE_PUBLISHABLE_KEY=<chave publicável> npx vite build --mode development
# 2) servidor de prévia (morre depois de pausas longas: confira com curl e suba de novo)
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:5173/ || (setsid nohup npx vite preview --port 5173 --strictPort > $S/preview.log 2>&1 &)
# 3) um teste
CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome node e2e/balance.mjs
```
- **Conjunto completo:**
  - a lista está no script `e2e` de `apps/web/package.json` (41 arquivos, mais de 1.200 verificações);
  - rode em segundo plano, um arquivo por vez, guardando o log de cada um.
- **Servidor simulado:** `apps/web/src/demo/mockBackend.js`, com a Central em `mockOpsTasks.js`.
  - Toda função nova do banco (RPC) precisa de um tratador lá, com as **mesmas regras** do banco.
  - Na Central, os tratadores ficam **antes** do bloqueio "só admin" e o prefixo da RPC entra na lista `prefixes`.
- **Imagens** para a documentação saem em `apps/web/test-results/` (`page.screenshot`). Copie para a pasta da etapa em `docs/`.
- **Falhas conhecidas e antigas** (não são regressão):
  - `charts.mjs` falha às **segundas-feiras** (agrupamento semanal com um ponto só);
  - `tracking.mjs` pode falhar entre 00h00 e 00h20 UTC;
  - `health.mjs` falhou uma vez e passou ao repetir.

## 5. Edge Functions (servidor)
- O código fica em `supabase/functions/<nome>/index.ts`, com partes comuns em `_shared/`.
- **Testes:** `npm run test:functions`. **Tipos:** `npm run check:functions`.
- **Publicar** (não há CLI com token na sessão; use `mcp__Supabase__deploy_edge_function`):
  1. Empacote num arquivo só:
     `npx -y deno@latest bundle --config supabase/functions/deno.json --external 'npm:*' --external 'jsr:*' -o $S/<nome>.bundle.js supabase/functions/<nome>/index.ts`
  2. Opcional, para caber melhor: `npx -y esbuild@0.25.5 $S/<nome>.bundle.js --minify --line-limit=400 --format=esm --outfile=$S/<nome>.min.js`
  3. Publique com os arquivos `index.ts` (o pacote) e `deno.json` = `{"nodeModulesDir":"none","compilerOptions":{"strict":true}}`, com `import_map_path: deno.json`.
     - Mantenha o `verify_jwt` que a função já tem (`list_edge_functions` mostra).
     - `sync`, `track`, `capi-sender`, `whatsapp-webhook`, `client-report-*` usam `false`, porque conferem o acesso por conta própria.
  4. **Confira:** `get_edge_function` e compare com o arquivo local.
- **Atenção:** `sync` e `ad-accounts` estão **mais novas no GitHub** do que as publicadas (correção do saldo, 28/09/2026). O banco já aplica a regra, então nada quebra, mas publique as duas na próxima mudança de servidor.

## 6. Documentação e relatório (a cada fase)
1. **Documento da fase** em `docs/etapa-XX-.../`, seguindo o formato das anteriores:
   - status;
   - o que mudou;
   - regras;
   - tabela das tabelas novas (nome, para quê, campos, ligações, índices, por quanto tempo é guardada);
   - arquivos;
   - testes com números reais.
2. **README:** o item da etapa com ✅. **`docs/PENDENCIAS.md`:** o que depender do Ander.
3. **Commit, push e relatório** no chat (cerca de 10 seções), terminando com **"Aguardo o Pode avançar."**
