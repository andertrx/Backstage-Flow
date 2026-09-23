# ETAPA 0 — PLANEJAMENTO

> Status: **aguardando aprovação** (versão 2 — banco de dados trocado para **Supabase**).
> Nenhum código de aplicação foi escrito ainda.
> Quando você disser **"Pode avançar"**, começamos a Etapa 1 (login e usuários).

Este diretório é a "planta da casa" do sistema. Antes de levantar paredes, a gente
decide onde fica cada cômodo, por onde passam os canos e onde fica o cadeado.

| Arquivo | O que explica |
|---|---|
| [01-arquitetura.md](01-arquitetura.md) | As peças do sistema, a tecnologia escolhida e a estrutura de pastas |
| [02-banco-de-dados.md](02-banco-de-dados.md) | Como o Supabase (PostgreSQL) vai guardar tudo, inclusive o histórico |
| [03-integracoes-meta-google.md](03-integracoes-meta-google.md) | Como conversamos com Meta Ads e Google Ads e o que cada API entrega (ou não) |
| [04-sincronizacao-cache-historico.md](04-sincronizacao-cache-historico.md) | Como e quando os dados são buscados, salvos e reaproveitados |
| [05-seguranca-permissoes-erros-logs.md](05-seguranca-permissoes-erros-logs.md) | Login, papéis de usuário, proteção de tokens, erros e logs |
| [06-metricas-datas-moedas.md](06-metricas-datas-moedas.md) | Fórmulas das métricas, fuso horário e moedas |
| [07-dificuldades-e-decisoes.md](07-dificuldades-e-decisoes.md) | Riscos técnicos, limitações das APIs e o que precisamos de você |

## Resumo em uma frase

As plataformas (Meta e Google) são **fontes**; um **robô no servidor** busca os dados,
**guarda tudo no Supabase** como um diário que nunca é apagado, e o **dashboard só lê
esse diário** — por isso ele continua funcionando mesmo quando a API está fora do ar ou
já "esqueceu" dados antigos.

```
Meta Ads / Google Ads
        │  (API oficial)
        ▼
Backend (Supabase Edge Functions) ── credenciais trancadas no cofre (Supabase Vault / Secrets)
        │  normaliza, calcula, verifica alertas
        ▼
Supabase PostgreSQL  ◄── histórico permanente (métricas diárias, snapshots, logs)
        │  (Row Level Security: cada usuário só enxerga o que pode)
        ▼
Dashboard (navegador)
        ▼
Usuário
```

## Tradução do prompt mestre (Firebase → Supabase)

O prompt mestre cita Firebase em várias etapas. A partir de agora, leia assim:

| No prompt mestre | No nosso projeto |
|---|---|
| Firebase / Firestore | **Supabase PostgreSQL** |
| Firebase Authentication | **Supabase Auth** |
| Regras do Firestore | **Row Level Security (RLS)** do PostgreSQL |
| Índices Firestore | **Índices do PostgreSQL** |
| Firebase Storage | **Supabase Storage** |
| Backend / Cloud Functions | **Supabase Edge Functions** |
| Sincronização agendada | **Supabase Cron** + **Supabase Queues** |

## Ordem das próximas etapas

Seguiremos exatamente a ordem do prompt mestre (Etapas 1 a 32), uma de cada vez,
esperando sua autorização entre elas.
