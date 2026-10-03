# Pendências — lembretes para você (Ander)

> Lista do que ficou para depois. Eu (Claude) confiro e lembro esta lista nos relatórios.
> Quando fizer um item, me avise que eu marco como feito.

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

## Segurança do login (Supabase → Authentication)
- [ ] Desligar cadastro aberto (só administradores criam usuários)
- [ ] Ligar a proteção contra senhas vazadas
- [ ] Ligar a verificação em duas etapas (MFA)
