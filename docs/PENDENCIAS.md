# Pendências — lembretes para você (Ander)

> Lista do que ficou para depois. Eu (Claude) confiro e lembro esta lista nos relatórios.
> Quando fizer um item, me avise que eu marco como feito.

## Planilhas da Inteligência de Resultados (21/10/2026)
- [ ] **Armored:** 441 linhas têm na coluna `utm_campaign` um nome de campanha que não existe no Meta como está escrito (ex.: "CP-36 … [LP]" na planilha; no Meta o CP-36 é "[FORM]" e o CP-37 é "[LP]"). O melhor é trocar a UTM para o ID (`utm_campaign={{campaign.id}}`, `utm_term={{adset.id}}`, `utm_content={{ad.id}}`), como a Vonks já faz. As linhas aparecem no aviso amarelo com "Ver linhas".

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
- [ ] WhatsApp (T4.1/T4.2): para ligar o número por **Coexistence**, o app da agência no Meta precisa entrar no programa **Tech Provider** (verificação da empresa + aprovação do app). Ver `docs/etapa-34-tracking/T4.1-FRASES-WHATSAPP.md`, seção 4

## Segurança do login (Supabase → Authentication)
- [ ] Desligar cadastro aberto (só administradores criam usuários)
- [ ] Ligar a proteção contra senhas vazadas
- [ ] Ligar a verificação em duas etapas (MFA)

## Inteligência de Resultados (Etapa 39) — conta de serviço do Google
- [ ] Criar a conta de serviço no Google Cloud, colar a chave JSON em **Configurações → Integrações → Google Sheets** e clicar em **Testar conexão**. Passo a passo em `docs/etapa-39-inteligencia-de-resultados/39.1-CONEXAO-COM-A-PLANILHA.md`. **Nunca mande a chave por chat.**
- [ ] Compartilhar cada planilha de cliente com o e-mail que o CRM mostra, como **Leitor**.
- [ ] Em **Inteligência de Resultados**, escolher o cliente, conectar a planilha dele e clicar em **Atualizar agora**. Essa primeira leitura real é o teste final da Etapa 39 (depois disso, conferir a aba **Qualidade dos dados**).
