# Ponto de restauração — antes de "Tracking T3.1: contatos e papel Vendedor" (23/10/2026, noite)

| Parte | Identificação desta versão |
|---|---|
| **Código** (branch `claude/meta-google-ads-dashboard-8g4wfg`) | commit **`34d857a`** |
| **Banco** (Supabase) | última migração **`20261023220501 tracking_regras_permissao_servidor`** |

## Como voltar
1. Trocar o papel dos usuários Vendedor (Configurações → Usuários).
2. **Banco:** rodar `supabase/rollback/voltar_contatos_vendedor_2026_10_23.sql` (desliga contatos e o papel; nada é apagado).
3. **Código e site:** pedir "volte os contatos" — eu reverto os commits dessa mudança em cima da branch.

---

# Ponto de restauração — antes de "Tracking T2: regras sem Tag Manager" (23/10/2026, noite)

| Parte | Identificação desta versão |
|---|---|
| **Código** (branch `claude/meta-google-ads-dashboard-8g4wfg`) | commit **`f69a497`** (plano do tracking) |
| **Banco** (Supabase) | última migração **`20261023195405 clientes_excluir`** |

## Como voltar
1. **Banco:** rodar `supabase/rollback/voltar_tracking_regras_2026_10_23.sql` (devolve a fila do Meta como era e desliga as regras; as tabelas ficam guardadas).
2. **Código e site:** pedir "volte as regras do tracking" — eu reverto os commits dessa mudança em cima da branch.

---

# Ponto de restauração — antes de "Contas ativas/desativadas" e "Excluir cliente" (23/10/2026, tarde)

| Parte | Identificação desta versão |
|---|---|
| **Código** (branch `claude/meta-google-ads-dashboard-8g4wfg`) | commit **`08e7752`** |
| **Banco** (Supabase) | última migração **`20261023125125 clientes_desativar`** |

## Como voltar
1. **Banco:** rodar `supabase/rollback/voltar_clientes_excluir_2026_10_23.sql` (tira o Excluir, limpa `excluded_at` e devolve as checagens de acesso anteriores).
2. **Código e site:** pedir "volte o excluir cliente" — eu reverto os commits dessa mudança em cima da branch.

---

# Ponto de restauração — antes de "Desativar cliente" (23/10/2026)

| Parte | Identificação desta versão |
|---|---|
| **Código** (branch `claude/meta-google-ads-dashboard-8g4wfg`) | commit **`2c9c89f`** |
| **Banco** (Supabase) | última migração **`20261021210425 ri_campanha_nao_achada`** |

## Como voltar
1. **Banco:** rodar `supabase/rollback/voltar_clientes_desativar_2026_10_23.sql` (tira os gatilhos e devolve as funções antigas; não apaga dados).
2. **Código e site:** pedir "volte o desativar cliente" — eu reverto os commits dessa mudança em cima da branch.

---

# Ponto de restauração — antes da correção da conta da Inteligência de Resultados (21/10/2026, noite)

Criado antes de ligar os IDs do Meta que estão nas colunas de nome da planilha e de mostrar o aviso "sem campanha".

| Parte | Identificação desta versão |
|---|---|
| **Código** (branch `claude/meta-google-ads-dashboard-8g4wfg`) | commit **`cf9a853`** |
| **Banco** (Supabase) | última migração **`20261021192656 ri_meta_counts`** |
| **Leitor da planilha** (Edge Function `sheets`) | versão 3 (a correção é a versão 4) |

## Como voltar
1. **Banco:** rodar `supabase/rollback/voltar_ri_conta_2026_10_21.sql` (troca o nome das funções de volta; não apaga nada).
2. **Código e site:** pedir "volte a conta da Inteligência de Resultados" — eu reverto os commits dessa correção em cima da branch.
3. **Leitor da planilha:** publicar de novo o `supabase/functions/sheets` do commit `cf9a853`.

---

# Ponto de restauração — antes da nova apresentação da Inteligência de Resultados (21/10/2026)

Criado antes de mudar as abas por perfil (Lojistas, Sacoleiros, Consumidores finais) para mostrar campanhas, conjuntos e criativos de uma vez.

| Parte | Identificação desta versão |
|---|---|
| **Código** (branch `claude/meta-google-ads-dashboard-8g4wfg`) | commit **`d65b324`** |
| **Banco** (Supabase) | última migração **`20261019201248 ri_params`** |

## Como voltar
1. **Site:** no painel da Vercel (projeto `web` → Deployments), promover o deploy do commit `d65b324` ("Relatórios: várias campanhas…") com **Promote to Production / Instant Rollback**.
2. **Banco:** rodar `supabase/rollback/voltar_ri_apresentacao_2026_10_21.sql` (devolve a função de resultados à versão anterior; não apaga nada).
3. **Código:** pedir "volte a Inteligência de Resultados para o ponto de volta de 21/10" — eu reverto os commits dessa mudança em cima da branch, sem apagar histórico.

---

# Ponto de restauração — CRM antes do Agente de IA

Criado em 26/09/2026, antes de qualquer desenvolvimento da **Etapa 33 (Agente de IA)**.
Esta é a versão completa e validada do CRM (Etapas 0 a 31; 19 e 32 em espera).

## Os três "endereços" desta versão

| Parte | Identificação desta versão |
|---|---|
| **Código** (GitHub, branch `claude/meta-google-ads-dashboard-8g4wfg`) | commit **`25c5aef4751217e00caa4947a97b80b938844987`** |
| **Site** (Vercel, projeto `web`) | deploy **`dpl_2H9WaWzoq1uustYCpegsPurdPqFo`** (`web-73f0bowo2-andertrxs-projects.vercel.app`) |
| **Banco** (Supabase `dkatllzkmlzpginuzvis`) | última migração **`20260926225436 performance_structure_indexes`** |

## Como o Agente de IA foi construído para ser removível
- **Nada existente é alterado:** o agente só **acrescenta** coisas novas (tabelas `agent_*`, funções `agent_*`, a Edge Function `agent`, telas novas).
- **Chave geral:** o agente nasce **desligado**. Desligado, o CRM funciona exatamente como nesta versão.
- **Script de remoção do banco:** `supabase/rollback/remover_agente_ia.sql` (criado junto com a primeira parte do agente) apaga só o que o agente criou. Clientes, contas, campanhas, métricas, histórico e logs **não são tocados**.

## Como voltar para esta versão (se você não gostar)

### 1) Site — volta imediata (1 minuto, pelo painel da Vercel)
1. Abra **vercel.com → projeto `web` → Deployments**.
2. Encontre o deploy **`web-73f0bowo2`** (26/09/2026, mensagem "Etapa 33: proposta revisada…").
3. Clique em **⋯ → Promote to Production** (ou **Instant Rollback**).

O site volta na hora a ser a versão atual, sem o menu do agente.

### 2) Banco — remover o que o agente criou
- Rodar `supabase/rollback/remover_agente_ia.sql` no SQL Editor do Supabase (ou me pedir que eu rode).
- Isso também desliga os agendamentos do agente.

### 3) Código — voltar o repositório
- Me peça: **"volte o CRM para o ponto de restauração"**. Eu reverto os commits do agente em cima da branch (sem apagar histórico) e o site é republicado nesta versão.
- Manualmente, o commit de referência é `25c5aef`.

> Observação: tentei criar também uma *tag* no GitHub (`crm-v1-antes-do-agente-ia`), mas o ambiente só permite publicar na branch de trabalho. O commit acima já é permanente no histórico da branch e serve como ponto de restauração.

---

# Ponto de restauração — antes da Etapa 32 (melhorias visuais)

Criado em 27/09/2026. Detalhes e instruções: [`docs/etapa-32-referencias-visuais/README.md`](etapa-32-referencias-visuais/README.md).

| Parte | Versão |
|---|---|
| Código | commit **`81fa057`** |
| Site | deploy **`dpl_4rhgpvRdwK5VfBfinHFYy4G2SwtK`** (`web-mbk8agi6n`) |
| Banco | não muda na Etapa 32 |

Para voltar: Vercel → Deployments → `web-mbk8agi6n` → **Promote to Production**, ou me peça **"desfaça a etapa 32"**.
