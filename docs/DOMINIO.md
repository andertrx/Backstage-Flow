# Domínio próprio: backstageflow.com.br

> **Situação:** passos 1, 2 e 3 feitos. O endereço principal ficou **www.backstageflow.com.br** (quem digita `backstageflow.com.br` é levado para o `www`). Passo 4 pendente — ver [PENDENCIAS.md](PENDENCIAS.md).

> Feito em 27/09/2026. O endereço antigo (`web-ivory-three-49.vercel.app`) **continua funcionando**.

## O que já foi feito (código e servidor)

| Parte | Mudança |
|---|---|
| Funções do servidor (Supabase) | Aceitam chamadas vindas de `https://backstageflow.com.br` e `https://www.backstageflow.com.br` (além do endereço antigo). Republicadas: `sync`, `ad-accounts`, `admin-users`, `tracking-destinations`, `tracking-whatsapp`. |
| Código de instalação do tracking | Passa a usar `https://www.backstageflow.com.br/t.js`. Sites que já têm o código antigo continuam funcionando. |
| Documentação | README e docs do tracking com o novo endereço. |

Não muda: banco de dados, endereço do webhook do WhatsApp (é do Supabase), envio ao Meta.

## O que você precisa fazer (painéis que eu não consigo acessar)

### 1) Vercel — ligar o domínio ao site
1. vercel.com → projeto **web** → **Settings → Domains** → **Add**.
2. Digite `backstageflow.com.br` → Add. Aceite a sugestão de também adicionar `www.backstageflow.com.br` redirecionando para o principal.
3. A Vercel mostra os registros de DNS que faltam (normalmente um registro **A** para `backstageflow.com.br` e um **CNAME** para `www`). Deixe essa tela aberta.

### 2) Registro.br — apontar o domínio
1. registro.br → seu domínio → **DNS** → **Editar zona** (ou "Configurar endereçamento").
2. Crie exatamente os registros que a Vercel mostrou (tipo, nome e valor).
3. Salve. Leva de alguns minutos a algumas horas. Quando a Vercel mostrar **Valid Configuration**, o site abre no novo endereço (com cadeado/HTTPS automático).

### 3) Supabase — login e "esqueci a senha"
Supabase → projeto → **Authentication → URL Configuration**:
- **Site URL:** `https://backstageflow.com.br`
- **Redirect URLs:** adicionar `https://backstageflow.com.br/**` e `https://www.backstageflow.com.br/**` (mantenha o endereço antigo).

Sem isso, o link do e-mail de "esqueci a senha" volta para o endereço antigo.

### 4) Google Cloud — conexão com o Google Ads (só se for usar)
Google Cloud Console → **APIs e serviços → Credenciais** → o cliente OAuth do CRM:
- **URIs de redirecionamento autorizados:** adicionar `https://www.backstageflow.com.br/configuracoes/integracoes/google/callback` (e o mesmo sem `www`)
- **Origens JavaScript autorizadas:** adicionar `https://www.backstageflow.com.br` (e o mesmo sem `www`)

## Atenção
- Os sites que já têm o código antigo não precisam ser alterados.
