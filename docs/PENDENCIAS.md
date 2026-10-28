# Pendências — lembretes para você (Ander)

> Lista do que ficou para depois. Eu (Claude) confiro e lembro esta lista nos relatórios.
> Quando fizer um item, me avise que eu marco como feito.

## Planilhas da Inteligência de Resultados (21/10/2026)
- [ ] **Armored:** 441 linhas têm na coluna `utm_campaign` um nome de campanha que não existe no Meta como está escrito (ex.: "CP-36 … [LP]" na planilha; no Meta o CP-36 é "[FORM]" e o CP-37 é "[LP]"). O melhor é trocar a UTM para o ID (`utm_campaign={{campaign.id}}`, `utm_term={{adset.id}}`, `utm_content={{ad.id}}`), como a Vonks já faz. As linhas aparecem no aviso amarelo com "Ver linhas".

## Servidor MCP — conectar o Claude ao Backstage Flow (Etapa 40, 26/10/2026)
- [x] **Supabase → Authentication → OAuth Server:** ligar; em *Authorization path* colocar `/oauth/consent`; ligar **Allow dynamic client registration**. Salvar. (Hoje está desligado; sem isso o login do Claude não abre.)
- [x] (Feito: o Claude já está conectado, 26/10/2026.) No computador com o Claude Code: `claude mcp add --transport http --scope user backstage-flow https://www.backstageflow.com.br/mcp` → abrir o Claude Code → `/mcp` → backstage-flow → **Authenticate** → entrar no CRM → **Permitir**. Depois peça "use o backstage_status" e me conte o resultado (passo a passo em `docs/etapa-40-mcp/40-SERVIDOR-MCP.md`, seção 8).

## Envios semanais (Etapa 41, 27/10/2026)
- [ ] Em Central → Equipe, marcar a permissão **"Envios semanais"** para quem mais deve configurar os envios (o administrador já tem).
- [ ] Mandar **a mensagem, o dia e o horário** do envio semanal: os 25 grupos com quem marcar já estão conferidos; eu crio o envio.
- [x] (28/10: Ander criou a tarefa do ENV-001) No app do Claude **no computador**: criar **uma tarefa agendada por envio** (ex.: ENV-001), no dia do envio ~5 min depois do horário (ou todo dia), colando a instrução do botão **"Instrução da tarefa"** do card daquele envio. Precisa: conector do Backstage Flow, Claude no Chrome e WhatsApp Web logado (ver `docs/etapa-41-envios-semanais/41.5-CODIGO-DO-ENVIO.md`).

## Central — aviso de tarefa vencida no aparelho (36.17, 26/10/2026)
- [ ] Em cada aparelho (computador e celular): abrir o CRM → Central → Notificações → **Ativar neste aparelho** → Permitir → **Enviar teste**. Me diga se o aviso chegou (ainda não foi testado num aparelho real).
- [ ] **iPhone:** abrir o site no Safari → Compartilhar → "Adicionar à Tela de Início" → abrir pelo ícone e ativar por lá.

## Domínio backstageflow.com.br
- [x] 1. Vercel: domínio adicionado (27/09/2026)
- [x] 2. Registro.br: DNS apontado (27/09/2026)
- [x] 3. Supabase: Site URL e Redirect URLs (27/09/2026)
- [ ] **4. Google Cloud — só quando for conectar o Google Ads.** No cliente OAuth do CRM (APIs e serviços → Credenciais), adicionar:
  - URIs de redirecionamento autorizados: `https://www.backstageflow.com.br/configuracoes/integracoes/google/callback` e `https://backstageflow.com.br/configuracoes/integracoes/google/callback`
  - Origens JavaScript autorizadas: `https://www.backstageflow.com.br` e `https://backstageflow.com.br`

  Sem isso, o botão "Conectar Google Ads" dá erro de redirecionamento no Google.

## GitHub
- [ ] Deixar o repositório **privado** (em 27/09/2026 o GitHub ainda informava "público"). Teste: abrir github.com/andertrx/Backstage-Flow numa aba anônima → deve aparecer 404.

## Monitoramento (Etapa 37.3) — limpeza de 1 minuto, quando der
- [ ] No Supabase → SQL Editor, rodar estas 2 linhas:
  ```sql
  drop function if exists private.monitor_probe_tmp();
  drop function if exists public.monitor_alerts_list(boolean, integer), private.monitor_alerts_list_impl(boolean, integer);
  ```
  A 1ª é uma função vazia que sobrou de um teste meu. A 2ª é a lista antiga de alertas, trocada na 37.4 por `monitor_alerts_query` (a tela não usa mais a antiga).
  Nenhuma delas guarda dados. A minha ferramenta não consegue apagar coisas no banco sem uma confirmação que ela não mostra.

## Monitoramento (Etapa 37.5) — avisos por e-mail, quando quiser
- [ ] Em **Monitoramento → Configurações → Minhas notificações**, marcar "Por e-mail" (e, se quiser, os alertas de atenção ou o resumo diário). Hoje você recebe só no sistema (ícone no topo), que é o padrão.
  - Quando o primeiro e-mail chegar, me avise para eu marcar o envio real como testado.

## Publicação do servidor (Edge Functions) — proposta, só se você quiser
- [ ] **Publicação automática pelo GitHub.** Hoje, publicar as funções grandes (`sync`, `ad-accounts`) exige colar o arquivo inteiro à mão, o que é arriscado; por isso elas estão **mais novas no GitHub** do que no ar (ID do criativo da Etapa 37.1 e correção do saldo de 28/09 — o saldo já funciona pelo banco).
  - Solução: você cria um "token de acesso" no Supabase (Account → Access Tokens) e cola **só nos segredos do GitHub** (Settings → Secrets → Actions), nunca no chat. Aí eu crio a rotina que publica sozinha a cada envio.
  - Me avise se quiser; até lá eu aviso nos relatórios o que está pendente de publicar.

## Tracking / Meta
- [ ] Escolher o cliente piloto
- [ ] ID do Pixel (conjunto de dados) do piloto
- [ ] Token da API de Conversões (colar direto no CRM, nunca por chat)
- [ ] Código de teste do Meta (Gerenciador de Eventos → Testar eventos)
- [ ] Nos anúncios, colocar o ID da campanha no link (ver `docs/etapa-34-tracking/34.4-ATRIBUICAO.md`)
- [ ] No Gerenciador de Eventos do Meta: criar a **conversão personalizada "LeadLojista"** para otimizar campanhas pelo lojista
- [ ] Vendas (T3.2): em aberto. Quando houver cliente com sistema de vendas, cadastrar o webhook (passo a passo em `docs/etapa-34-tracking/T3.2-VENDAS-WEBHOOK.md`, seção 10)
- [ ] WhatsApp (T4.2): colocar o app da agência no **Tech Provider** do Meta e configurar em Integrações → WhatsApp (Coexistence). Passo a passo em `docs/etapa-34-tracking/T4.2-WHATSAPP-COEXISTENCE.md`, seção 4. Depois: ligar o número do cliente piloto no Tracking

## Segurança do login (Supabase → Authentication)
- [ ] Desligar cadastro aberto (só administradores criam usuários)
- [ ] Ligar a proteção contra senhas vazadas
- [ ] Ligar a verificação em duas etapas (MFA)

## Inteligência de Resultados (Etapa 39) — conta de serviço do Google
- [ ] Criar a conta de serviço no Google Cloud, colar a chave JSON em **Configurações → Integrações → Google Sheets** e clicar em **Testar conexão**. Passo a passo em `docs/etapa-39-inteligencia-de-resultados/39.1-CONEXAO-COM-A-PLANILHA.md`. **Nunca mande a chave por chat.**
- [ ] Compartilhar cada planilha de cliente com o e-mail que o CRM mostra, como **Leitor**.
- [ ] Em **Inteligência de Resultados**, escolher o cliente, conectar a planilha dele e clicar em **Atualizar agora**. Essa primeira leitura real é o teste final da Etapa 39 (depois disso, conferir a aba **Qualidade dos dados**).
