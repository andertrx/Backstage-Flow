# Auditoria técnica e de desempenho — 08/11/2026

Medido no banco real (somente leitura). Nada foi apagado e nenhuma tabela, política, gatilho ou migração foi alterada. Única mudança feita: **código** (gravação da sincronização), com testes, ainda **não publicado**.

## 1. Tamanho do banco (limite do plano: 500 MB)
| Item | Tamanho |
|---|---|
| Banco inteiro | **397 MB** (79% do limite) |
| Histórico diário por mês (`history.metrics_daily_*`, 14 meses) | **213 MB** (54%) |
| 5 maiores tabelas de `public` (`metrics_breakdown_daily`, `ads`, `sync_runs`, `account_snapshots`, `period_reach`) | 117 MB |
| Log do agendador (`cron.job_run_details`) | 17 MB (99 mil linhas, +20 mil por semana) |

Arquivos do Supabase Storage **não** entram nesses 397 MB e não foram medidos.

**Maiores tabelas** (total com índices): `metrics_breakdown_daily` 43 MB (80 mil linhas), `ads` 32 MB (16,8 mil linhas; 15 MB só de índices), `metrics_daily_2026_10` 26 MB, `sync_runs` 17 MB, `cron.job_run_details` 17 MB, `account_snapshots` 16 MB, `period_reach` 9 MB.

**O que pesa no histórico:** a coluna `raw_actions` (JSON bruto "para auditoria") ocupa **12 MB dos 20 MB de dados** de um mês (`metrics_daily_2026_10`), ou seja, cerca de 60%. Nenhuma tela lê essa coluna (só é gravada). Estimativa: ~120 MB dos 213 MB do histórico.

**Crescimento (estimativa):** o histórico mensal soma ~25–30 MB por mês, mais as tabelas de quebra, snapshots e logs. Com 103 MB livres, o limite chegaria em poucos meses sem ação. Não há medição exata de crescimento diário.

## 2. O problema de Disk I/O (não é o limite de 500 MB)
Contadores do banco desde o último reinício das estatísticas:

| Tabela | Linhas | Inserções | **Atualizações** | por linha |
|---|---|---|---|---|
| `ads` | 16,8 mil | 16,8 mil | **13.268.787** | ~790 |
| `ad_groups` | 3,0 mil | 3,0 mil | **2.482.597** | ~820 |
| `campaigns` | 1,4 mil | 1,6 mil | **1.186.502** | ~740 |
| `period_reach` | 35,8 mil | 35,8 mil | **1.337.748** | ~37 |
| `metrics_breakdown_daily` | 80 mil | 80 mil | **1.105.931** | ~14 |

**Causa:** a cada sincronização (cada conta ~18 vezes por dia) o sistema regrava **todas** as campanhas, grupos e anúncios com "visto por último = agora", mesmo sem nenhuma mudança. O Postgres cria uma versão nova da linha a cada vez.

**Log de escrita (WAL) por consulta** (`pg_stat_statements`): gravação de `ads` **≈ 47,6 GB** + 5,3 GB; `ad_groups` 3,5 GB; `campaigns` 1,5 GB; `period_reach` 1,4 GB; chamadas RPC de métricas/quebras ≈ 9,7 GB. **Total ≈ 70 GB** de escrita para uma base de 397 MB. Esse é o provável responsável pelo alto Disk I/O. As atualizações são quase todas "HOT" (não mexem nos índices), o que ameniza, mas o volume segue enorme. Não foi possível ler o painel de métricas de I/O do Supabase.

Outros pontos medidos:
- `ingest_metrics_daily` **já** pula linhas iguais (compara um hash). Bom. As atualizações do histórico (~14 por linha) são revisões reais do Meta.
- `ingest_breakdowns` (quebras por idade/gênero/etc.) **não** pula linhas iguais: reescreve tudo a cada sync.
- `account_snapshots` e `sync_runs`: 1 linha por sync (≈ 4,5 mil por semana cada), 1.978 snapshots foram gravados na mesma hora do anterior da mesma conta; payload pequeno (195 bytes), então o peso vem do número de linhas e índices.
- Autovacuum está funcionando (poucas linhas mortas).
- Índices **sem nenhum uso** (desde o reinício das estatísticas): `ads_client_external_idx` 1,7 MB, `metrics_breakdown_daily_client_idx` 1,2 MB, `ad_groups_name_search_idx` 0,8 MB. Total ~4 MB: ganho pequeno.
- Agendador: 10.080 execuções/semana do `tracking-capi` (todo minuto) e 2.287 do `wa-send`; quase todas sem trabalho, mas custam linhas no log do agendador.

## 3. Frontend (React)
- Cache global já correto: `staleTime` 30 s e sem recarregar ao voltar para a janela.
- Atualização automática: Contatos a cada 15 s (3 consultas), Tracking a cada 60 s (9 consultas), alertas a cada 5 min. Só rodam com a tela aberta e param em aba de fundo. Impacto baixo; sem mudança.
- `select("*")` em 7 consultas de tabelas pequenas (perfis, clientes, regras): impacto desprezível; sem mudança.
- Não foi feita análise de renderização (React Profiler): **não medido**.

## 4. O que foi alterado (só código, com testes, não publicado)
`supabase/functions/_shared/sync/`:
- `diff.ts` (novo): decide linha a linha se vale gravar. Grava se a linha é nova, se algum campo mudou, ou **1 vez por dia** para renovar "visto por último". A miniatura do anúncio não conta como mudança (o Meta troca a assinatura da imagem a cada consulta; ela é renovada junto com a gravação diária).
- `store.ts`: campanhas, grupos, anúncios e alcance (`period_reach`) passam a gravar só o que mudou. Os ids de todas as linhas continuam sendo devolvidos como antes.
- Testes novos: `diff_test.ts` (6) e `store_test.ts` (2, com banco de mentira): 1ª rodada grava tudo; 2ª (nada mudou, miniatura trocada) não grava; mudança grava só a linha; alcance igual não é reescrito. Funções: 211 testes passando; tipos sem erro.
- Reversível: voltar os dois arquivos ao commit anterior.

**Efeito esperado (estimativa, não medido):** estrutura passa de ~18 gravações por linha por dia para ~1 (mais as mudanças reais): cerca de **94% menos atualizações** em `ads`, `ad_groups`, `campaigns` e boa parte de `period_reach`, e queda proporcional do log de escrita. Depois de publicado, medir de novo (ver seção 7).

Mudança de comportamento (pequena): "visto por último" passa a ser renovado no máximo 1 vez por dia, não a cada sync. Ele só serve para desempatar a ordem na busca global e escolher entre registros repetidos; a busca continua ordenando por situação e nome.

## 5. Propostas que precisam da sua autorização (banco)
| # | Proposta | Ganho | Risco |
|---|---|---|---|
| A | `ingest_breakdowns`: só atualizar linha se algum valor mudou (mudar a função) | Corta ~1,1 milhão de atualizações iguais e o log de escrita das quebras | Baixo; mesma regra de resultado |
| B | `raw_actions` (JSON de auditoria que nenhuma tela lê): **parar de gravar daqui para frente** e **esvaziar o que tem mais de 90 dias** | Até ~100 MB livres, e para o crescimento | **Apaga dado de auditoria**; só aceite se não precisar dele |
| C | Limpeza diária do log do agendador (`cron.job_run_details`), mantendo 7 dias | -15 MB e fim do crescimento de ~20 mil linhas/semana | Baixo |
| D | `account_snapshots`: guardar todas por 30 dias e depois 1 por dia por conta | ~-10 MB e menos crescimento | Médio: o gráfico de saldo antigo fica com menos pontos |
| E | `sync_runs`: manter 90 dias de execuções | ~-8 MB e menos crescimento | Baixo |
| F | Remover os 3 índices sem uso (~4 MB) | Pequeno | Baixo; esperar mais dias de estatística |
| G | Limpar o espaço morto das tabelas depois de A e B (rodada de limpeza) | Devolve o espaço de verdade | Bloqueia a tabela por instantes; fazer de madrugada |

Recomendação: **A, B (com a regra de 90 dias), C e E** primeiro. D só se você aceitar menos pontos no gráfico antigo; F e G por último.

## 6. Não alterado por risco ou falta de medição
- Nada em autenticação, permissões, políticas de segurança, gatilhos ou tabelas.
- `account_snapshots` e `sync_runs`: são o histórico de saldo e das execuções; mexer muda o que a tela mostra.
- Não foi possível medir: Storage, métricas de I/O do painel do Supabase, tempo de renderização do React, crescimento exato por dia.

## 7. Como conferir depois de publicado
Anotar agora (linha de base) e comparar depois de 24 h:
- `n_tup_upd` de `ads` = 13.268.787, `ad_groups` = 2.482.597, `campaigns` = 1.186.502, `period_reach` = 1.337.748, `metrics_breakdown_daily` = 1.105.931.
- WAL da gravação de `ads` (`pg_stat_statements`) ≈ 47,6 GB.
- Tamanho do banco: 397 MB.

## 8. Publicação
A mudança está só no código (branch `tracking-t5`). Para valer, é preciso **publicar a função `sync` no Supabase**. Atenção: a `sync` publicada está **mais antiga** do que a do GitHub (correção de saldo de 28/09 e mensagem "Google Ads API desligada" de 22/10). Publicar traz essas duas junto. Depende do seu "Publique".

## 9. Execução (08/11/2026, depois da autorização do Ander)
| Item | Situação |
|---|---|
| Código da sincronização (grava só o que mudou) | **Publicado**: função `sync` v16 no Supabase (a v15 teve dois trechos do botão "Sincronizar agora" copiados errados e foi substituída). |
| A, quebras só se mudou | Aplicada (`otimiza_quebras_so_se_mudou`); 3 verificações SQL. |
| C e E, limpeza diária dos logs técnicos | Aplicada (`maintenance_cleanup`, 03h20 de Brasília). |
| B, `raw_actions` | Código para de gravar; histórico com mais de 90 dias esvaziado e compactado em 12 partições; a limpeza diária esvazia o que passar de 90 dias. Banco **397 MB → 342 MB**; histórico **213 MB → 158 MB**; 176.753 linhas de métricas intactas. |
| D, F, G | **Não feitos**: aguardam autorização. |

**Validação:** as sincronizações agendadas rodaram com sucesso na v15 (16:25 UTC) e na v16 (16:30 UTC). O botão "Sincronizar agora" (caminho manual) **não foi exercitado** depois da publicação.

**Linha de base para medir (16:33 UTC):** `n_tup_upd` ads 13.288.968; ad_groups 2.485.991; campaigns 1.188.008; period_reach 1.339.872; metrics_breakdown_daily 1.107.140. Comparar depois de 24 h: o aumento deve ser muito menor que o anterior (cerca de 20 mil atualizações em `ads` a cada ~5 minutos de sincronização antes da mudança).
