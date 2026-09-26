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
