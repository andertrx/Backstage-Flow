# Passo a passo das suas pendências (Ander) — 07/11/2026

> Ordem pensada para destravar o mais importante primeiro. Cada item diz **por quê**, **como fazer**, **como saber que deu certo** e **o que me contar**.
> **Regra de ouro:** senhas, chaves e tokens **nunca** vão no chat. Eles vão só no campo do CRM (ou nos segredos do GitHub/Supabase). Se colar por engano, me avise e troque a chave.
> Marque aqui o que for fazendo e me diga que eu atualizo `docs/PENDENCIAS.md`.

---

## BLOCO 1 — Segurança do login (10 minutos, faça primeiro)
**Por quê:** o sistema guarda dados de clientes. Isto fecha as portas de entrada.
**Onde:** Supabase → seu projeto → **Authentication**.
1. **Desligar cadastro aberto:** Authentication → **Sign In / Providers** (ou *Providers → Email*) → desmarque **"Allow new users to sign up"** → Salvar. *(Só administradores criam usuários.)*
2. **Proteção contra senhas vazadas:** Authentication → **Sign In / Providers → Email** (ou *Policies/Password*) → ligue **"Prevent use of leaked passwords"** → Salvar. *(Pode exigir plano pago do Supabase; se não aparecer, me diga.)*
3. **Verificação em duas etapas (MFA):** Authentication → **Multi-Factor** → ligue **TOTP** → Salvar. Depois, na sua conta, ative com um app (Google Authenticator ou similar).
4. **GitHub privado:** abra github.com/andertrx/Backstage-Flow → Settings → role até **Danger Zone** → **Change visibility → Make private**. Teste numa aba anônima: deve dar 404.
**Deu certo se:** o aviso de "senha vazada" do Supabase some nos alertas de segurança.
**Me conte:** "feito" (ou o que não achou, com uma foto da tela).

---

## BLOCO 2 — Notificações no seu celular e computador (5 minutos)
**Por quê:** hoje você tem **0 aparelhos** ativados, por isso não era avisado do envio.
1. **Computador:** abra o CRM → **Central de Operações** → aba **Notificações** (também dá para chegar pelo **sininho** no topo → "Ver todas e preferências") → cartão **"Aviso no computador e no celular"** → **Ativar neste aparelho** → **Permitir** no navegador → **Enviar teste**.
2. **Celular Android:** mesmo caminho, no Chrome.
3. **iPhone:** abra o site no **Safari** → botão Compartilhar → **Adicionar à Tela de Início** → abra pelo **ícone novo** → faça o mesmo caminho acima.
4. **E-mail:** em **Perfil**, confira se o e-mail está certo. Em **Monitoramento → Configurações → Minhas notificações**, marque **"Por e-mail"** se quiser avisos também lá.
**Deu certo se:** o teste aparece como aviso no aparelho.
**Me conte:** se o teste chegou em cada aparelho.

---

## BLOCO 3 — Envios semanais (10 minutos)
1. **Central → Equipe:** marque a permissão **"Envios semanais"** para quem deve configurar os envios (você, administrador, já tem).
2. Me mande **a mensagem, o dia e o horário** de cada envio semanal. Os 25 grupos e quem marcar eu já tenho conferidos; **eu crio o envio**.
3. A tarefa agendada do Claude no navegador (ENV-001) continua valendo até o WhatsApp automático funcionar.

---

## BLOCO 4 — O servidor do WhatsApp (o maior item; ~1 hora, uma vez só)
**Por quê:** é o que liga o WhatsApp ao CRM (disparos para os clientes e avisos no seu grupo). **Sem isso, tudo que construí do WhatsApp fica desligado.**
**Você vai precisar de:** cartão para contratar o servidor, acesso ao Registro.br (seu domínio) e o **chip separado** com WhatsApp e o celular dele na mão.

**Passo 1 — Contratar o servidor (VPS).** Qualquer provedor conhecido. Escolha **Ubuntu 22.04 ou 24.04**, **2 GB de memória**, 20 GB de disco (o plano mais barato desse tamanho). Anote o **IP** e abra o **console** do servidor no próprio site do provedor.
**Passo 2 — Endereço.** Registro.br → seu domínio → **DNS** → novo registro **tipo A**, nome `whats`, valor = o **IP** do servidor. (Fica `whats.backstageflow.com.br`.) Espere uns minutos.
**Passo 3 — Docker.** No console do servidor, cole: `curl -fsSL https://get.docker.com | sh` e depois `docker --version` (tem que mostrar um número).
**Passo 4 — Arquivos.** Os arquivos prontos estão em `infra/whatsapp-evolution/` (`docker-compose.yml`, `Caddyfile`, `.env.example`). Eu te mando o conteúdo para colar:
```
mkdir -p ~/whatsapp && cd ~/whatsapp
nano docker-compose.yml     # cole, salve com Ctrl+O, Enter, Ctrl+X
nano Caddyfile              # idem
nano .env                   # cole o .env.example e preencha
openssl rand -hex 24        # rode 2 vezes: uma é a senha do banco, outra a chave de acesso
```
No `.env` preencha: `DOMAIN` (whats.backstageflow.com.br), `POSTGRES_PASSWORD` e `AUTHENTICATION_API_KEY`. **Anote a chave de acesso num lugar seguro** (gerenciador de senhas).
**Passo 5 — Ligar.** `docker compose up -d` → `docker compose ps` (os 4 programas "running"). Abra `https://whats.backstageflow.com.br` no navegador: deve responder (o cadeado pode levar 1–2 minutos).
**Passo 6 — Firewall.** No painel do provedor, abra só as portas **22, 80 e 443**.
**Passo 7 — Conectar no CRM.** **Configurações → Integrações → Comunicação → WhatsApp para envios automáticos**:
- Endereço `https://whats.backstageflow.com.br` · Instância `backstage` · Chave = a que você anotou (cole **só ali**).
- Marque **"Entendo o risco"** → **Salvar**.
- **Conectar por QR Code** (ou digite o telefone do chip e gere o código).
- No celular do chip: **WhatsApp → Aparelhos conectados → Conectar um aparelho** → leia o QR (ou digite o código).
- Quando mostrar **"WhatsApp conectado"**, ligue a **trava geral** (os envios automáticos).
**Deu certo se:** aparece "WhatsApp conectado" no CRM.
**Me conte:** o IP (pode), os erros em texto **sem a chave**, e quando conectar. **Eu acompanho cada passo**; mande print do que aparecer.
⚠️ Este guia nunca rodou num servidor real: se algo falhar, me mande o erro que eu ajusto.

---

## BLOCO 5 — Depois que o WhatsApp conectar
1. **Ligar cada grupo ao cliente:** Menu **Envios semanais** → **Grupos e @ dos clientes → Buscar e ligar grupos**. O sistema sugere pelo nome; confira e salve.
2. **Criar o grupo só seu** no WhatsApp (ex.: "Avisos Backstage"; pode ser só você + o próprio chip).
3. **Avisos:** Configurações → Integrações → Comunicação → **Avisos no WhatsApp** → Buscar grupos → escolha o seu grupo → marque os avisos (inclui "Cliente sem gastar") → escolha o silêncio → **Ligar** → **Salvar**.
4. **Primeiro teste real (sem risco para cliente):** num envio qualquer, **Enviar agora** só para **um grupo de teste seu**. Me diga se a mensagem chegou e como ficou.
5. **Só depois** ligue o **"Enviar sozinho"** nos envios semanais reais.
6. **Decidir o @ (marcar pessoas):** A) guardar o número numa tabela protegida (muda sua regra de nunca guardar telefone), B) achar pelo nome na hora (pode errar), C) enviar sem marcar (**é o que vale hoje**). Me diga A, B ou C.
**Me conte:** como foi o teste real; se algo veio errado, mande print.

---

## BLOCO 6 — Inteligência de Resultados / planilhas do Google (30 min)
1. **Google Cloud:** crie a **conta de serviço** e baixe a chave JSON. Passo a passo em `docs/etapa-39-inteligencia-de-resultados/39.1-CONEXAO-COM-A-PLANILHA.md`.
2. **Configurações → Integrações → Dados → Google Sheets:** cole a chave JSON **só ali** → **Testar conexão**. (Nunca mande a chave por chat.)
3. Em cada planilha de cliente: **Compartilhar** com o e-mail que o CRM mostra, como **Leitor**.
4. **Inteligência de Resultados:** escolha o cliente → conecte a planilha → **Atualizar agora**. Depois olhe a aba **Qualidade dos dados**.
5. **Armored:** troque a UTM das campanhas para o ID (`utm_campaign={{campaign.id}}`, `utm_term={{adset.id}}`, `utm_content={{ad.id}}`), como a Vonks já faz.

---

## BLOCO 7 — Tracking e Meta (quando for o piloto)
1. Escolha o **cliente piloto**.
2. Pegue o **ID do Pixel (conjunto de dados)** e o **código de teste** (Gerenciador de Eventos → Testar eventos).
3. Cole o **token da API de Conversões** **só no campo do CRM** (nunca no chat).
4. Nos anúncios, coloque o **ID da campanha no link** (`docs/etapa-34-tracking/34.4-ATRIBUICAO.md`).
5. No Gerenciador de Eventos: crie a conversão personalizada **"LeadLojista"**.
6. **WhatsApp oficial (T4.2):** `docs/etapa-34-tracking/T4.2-WHATSAPP-COEXISTENCE.md`, seção 4.
7. **Vendas (T3.2):** só quando houver cliente com sistema de vendas (`T3.2-VENDAS-WEBHOOK.md`, seção 10).

---

## BLOCO 8 — Para quando for conectar o Google Ads
No Google Cloud → APIs e serviços → Credenciais → seu cliente OAuth, adicione:
- **URIs de redirecionamento:** `https://www.backstageflow.com.br/configuracoes/integracoes/google/callback` e `https://backstageflow.com.br/configuracoes/integracoes/google/callback`
- **Origens JavaScript:** `https://www.backstageflow.com.br` e `https://backstageflow.com.br`
Sem isso, "Conectar Google Ads" dá erro de redirecionamento.

---

## BLOCO 9 — Opcionais (só se você quiser)
- **Publicação automática das funções pelo GitHub:** crie um token em Supabase → Account → Access Tokens e cole **só** em GitHub → Settings → Secrets → Actions. Aí eu monto a rotina. (Hoje as funções grandes `sync` e `ad-accounts` estão mais novas no GitHub que no ar; resolve também a carga de 12,7 milhões de atualizações de anúncios.)
- **Limpeza no Supabase (1 minuto):** SQL Editor → rode as 2 linhas da seção "Monitoramento (Etapa 37.3)" de `docs/PENDENCIAS.md`.

---

## Resumo em uma linha por bloco
1. Segurança do login → 10 min · 2. Notificações nos aparelhos → 5 min · 3. Permissão Envios + me mandar as mensagens → 10 min · 4. Servidor do WhatsApp → ~1 h · 5. Ligar grupos, avisos e testar → 30 min depois do 4 · 6. Planilhas → 30 min · 7. Tracking → no piloto · 8. Google Ads → quando for conectar · 9. Opcionais.
**Se for fazer só um hoje:** o **Bloco 2** (5 minutos) e o **Bloco 1**. O **Bloco 4** é o que libera tudo do WhatsApp.
