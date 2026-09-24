# ETAPA 2 — Estrutura de clientes

> Status: **concluída e testada**, aguardando sua validação manual.

## 1. O que fizemos (explicado de forma simples)

Criamos o **fichário de clientes** da agência. Cada cliente é uma ficha com nome, empresa,
CNPJ, responsável, contato, observações, status e fuso horário.

Também criamos a **lista de chaves**: quem pode abrir a ficha de cada cliente.
- O **administrador** abre todas.
- Os demais só abrem as fichas que o administrador liberou para eles.
- Um **gestor** que cadastra um cliente ganha a chave dele automaticamente.

A ficha já tem os espaços para as **contas Meta e Google vinculadas**. Por enquanto eles
aparecem vazios, com o aviso de que serão preenchidos nas Etapas 3 e 4. Nada é inventado.

## 2. Por que agora

Tudo o que vem depois (contas de anúncio, campanhas, métricas, relatórios) **pertence a um
cliente**. Primeiro o fichário, depois o que vai dentro de cada ficha:

```
Cliente
 └─ Contas de anúncio (Etapas 3 e 4)
     └─ Campanhas
         └─ Conjuntos / Grupos
             └─ Anúncios
```

## 3. Tabelas criadas

### `clients` — os clientes

| Campo | Tipo | Regra |
|---|---|---|
| `id` | uuid | Identificador único |
| `name` | texto | Obrigatório, 2 a 120 caracteres |
| `company` | texto | Opcional, até 160 |
| `cnpj` | texto | Opcional. Guardado sem pontuação. **Validado no banco**, inclusive o **novo CNPJ com letras** (em vigor desde julho/2026). Não pode repetir |
| `owner_name` | texto | Responsável, opcional |
| `phone` | texto | Só dígitos com código do país (ex.: `5545999998888`) |
| `email` | texto | Formato validado, guardado em minúsculas |
| `notes` | texto | Observações, até 5.000 caracteres |
| `status` | `ativo` / `pausado` / `encerrado` | Padrão: ativo |
| `timezone` | texto | Padrão: `America/Sao_Paulo`. Define "hoje" e "ontem" deste cliente |
| `is_demo` | sim/não | Marca dados fictícios (Etapa 27). **O site não consegue alterar** |
| `created_at`, `updated_at`, `created_by` | data / usuário | Preenchidos pelo banco; o site não consegue falsificar |

- **Índices:** CNPJ único; status + nome (lista e filtros); quem cadastrou.
- **Retenção:** permanente. **Não existe "apagar"**: clientes são **encerrados**, e o histórico continua disponível.

### `user_client_access` — quem pode ver cada cliente

| Campo | Tipo | Para que serve |
|---|---|---|
| `user_id` | uuid → `profiles` | O usuário |
| `client_id` | uuid → `clients` | O cliente liberado |
| `granted_by` | uuid | Quem liberou (preenchido pelo banco) |
| `created_at` | data e hora | Quando foi liberado |

- **Chave:** a dupla usuário + cliente (não repete). **Índices:** por cliente e por quem liberou.
- **Retenção:** enquanto o acesso existir. Liberar e remover acesso ficam registrados na auditoria.

### `platforms` — plataformas de anúncio

Começa com duas linhas: `meta` (Meta Ads) e `google` (Google Ads). Para adicionar
**TikTok, LinkedIn ou Pinterest** no futuro basta **inserir uma linha**. Nada precisa ser reconstruído (Etapa 28).

### Auditoria automática

Toda alteração em clientes e em acessos vai para `audit_logs`, com **quem fez**, **quando**
e **o que mudou**, guardando só o campo alterado (antes → depois). Exemplo:
`{"status": {"before": "ativo", "after": "pausado"}}`.

## 4. Regras de permissão (verificadas no banco)

| Papel | Ver clientes | Cadastrar | Editar | Liberar acesso |
|---|---|---|---|---|
| Administrador | Todos | ✅ | Todos | ✅ |
| Gestor | Os liberados | ✅ (ganha acesso automático) | Os liberados | ❌ |
| Operador | Os liberados | ❌ | ❌ | ❌ |
| Visualizador | Os liberados | ❌ | ❌ | ❌ |
| Cliente | Só a própria empresa (na visão do cliente, Etapa 19) | ❌ | ❌ | ❌ |
| Usuário inativo | Nenhum, mesmo com acessos liberados | ❌ | ❌ | ❌ |

Ninguém apaga clientes pelo site.

## 5. Arquivos

**Criados**
```
supabase/migrations/20260924010000_clients.sql         → tabelas, CNPJ, permissões, auditoria
supabase/migrations/20260924011000_move_pg_net_schema.sql → correção de aviso de segurança
supabase/tests/etapa02_rls_clients.sql                  → testes de segurança do banco
packages/shared/src/clients/cnpj.ts                     → validar/formatar CNPJ (numérico e alfanumérico)
packages/shared/src/clients/phone.ts                    → normalizar/formatar telefone
packages/shared/src/clients/status.ts                   → status e fuso padrão
packages/shared/src/clients/clients.test.ts
apps/web/src/features/clients/                          → lista, formulário, detalhe, equipe com acesso
apps/web/src/lib/text.ts                                → busca sem acentos
apps/web/e2e/support.mjs                                → Supabase simulado para os testes de navegador
apps/web/e2e/clients.mjs                                → teste de navegador desta etapa
```

**Modificados**
```
apps/web/src/app/router.tsx                 → rotas /clientes e /clientes/:id
apps/web/src/components/layout/navigation.ts → "Clientes" deixa de ser "em construção"
apps/web/src/components/ui/field.tsx        → campo de texto longo (observações)
apps/web/src/components/ui/modal.tsx        → janela maior para formulários
apps/web/src/lib/errors.ts                  → mensagens amigáveis para erros do banco
apps/web/e2e/smoke.mjs                      → passa a usar o support.mjs
packages/shared/src/index.ts
```

## 6. Testes realizados

| Teste | Resultado |
|---|---|
| Banco: CNPJ (válido, dígito errado, repetido, alfanumérico, com pontuação) | ✅ |
| Banco: 26 verificações de permissão (admin, 2 gestores, visualizador, cliente, inativo), campos protegidos, dados inválidos, CNPJ duplicado e auditoria | ✅ Todas passaram |
| Supabase Advisor (segurança) | ✅ Nenhum aviso |
| Unitários: 15 no pacote compartilhado e 20 no site | ✅ |
| Navegador: 15 verificações da Etapa 1 e 20 da Etapa 2 (admin, visualizador e cliente) | ✅ |
| Verificação de tipos e montagem do site | ✅ |

**Problemas encontrados e corrigidos durante a etapa**
1. **Brecha de segurança (antes de ir para o banco):** um usuário **desativado** que ainda tivesse
   acessos liberados conseguiria ver clientes. Corrigido antes de aplicar e coberto por teste.
2. **Aviso de segurança do Supabase:** a extensão `pg_net`, criada na Etapa 1, estava no schema público.
   Foi movida.
3. **Telefone estrangeiro:** um número digitado com "+" ganhava o "55" do Brasil por engano. Corrigido.

## 7. Como testar manualmente

Pré-requisito: site publicado e seu administrador criado (Etapa 1, itens 6 e 7).

1. Menu **Clientes** → aparece "Nenhum cliente cadastrado ainda."
2. **Novo cliente** → clique em "Cadastrar cliente" sem nome → aparece "Informe o nome do cliente."
3. Preencha: nome **Excalibur Fitness**, CNPJ **11.222.333/0001-82** (dígito errado) → "CNPJ inválido".
   Corrija para **11.222.333/0001-81**, telefone **(45) 99999-8888** → Cadastrar.
4. Abre a ficha do cliente com o CNPJ e o telefone formatados e as seções **Contas Meta Ads** e
   **Contas Google Ads** vazias, com aviso das etapas.
5. **Equipe com acesso** → escolha um gestor → **Liberar acesso**. Entre como esse gestor em
   outra janela: ele vê só esse cliente. Clique **Remover** → o cliente some para ele.
6. **Editar** → mude o status para **Pausado**. Na lista, o filtro "Ativo" não mostra mais o
   cliente; "Pausado" e "Todos" mostram.
7. Busque por **excalíbur** (com acento) → encontra "Excalibur".
8. Tente cadastrar outro cliente com o **mesmo CNPJ** → "Já existe um cliente com este CNPJ."
9. Entre como **visualizador**: vê os clientes liberados, mas sem os botões "Novo cliente",
   "Editar" e sem a seção "Equipe com acesso".
10. No painel do Supabase (**Table Editor → audit_logs**) aparecem os registros `client.insert`,
    `client.update`, `client_access.insert` e `client_access.delete`.

### Resultado esperado

Cada pessoa vê só os clientes liberados para ela. Os dados ficam padronizados (CNPJ e telefone
sem pontuação no banco e formatados na tela) e toda alteração fica registrada.

## 8. Limitações conhecidas

- **Contas vinculadas:** o vínculo real com contas Meta e Google chega nas **Etapas 3 e 4**.
- **Visão do cliente:** o usuário do tipo "Cliente" vê só o Dashboard até a **Etapa 19**.
- **Lista de clientes:** carrega todos os clientes permitidos e pagina na tela (25 por página).
  Isso é adequado para centenas de clientes. Paginação no servidor fica para a **Etapa 30**, se precisar.
- **Fuso horário:** a lista oferece os fusos mais comuns (Brasil, EUA e Portugal). Outros
  podem ser incluídos quando necessário.
