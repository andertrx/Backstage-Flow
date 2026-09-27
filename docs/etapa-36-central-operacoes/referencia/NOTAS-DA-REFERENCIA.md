# Referência visual da Central de Operações (enviada em 27/09/2026)

Arquivos:
- `stg-flow-referencia.html` (página de escopo)
- `tela-5.webp` a `tela-8.webp`: Kanban, Tarefas, Clientes, Dailies

A referência é **escura**. No Backstage Flow ela é aplicada ao **tema claro** atual: as mesmas cores (roxo `#7C3AED`/`#A855F7`, ciano `#06B6D4`/`#22D3EE`, verde `#10B981`, amarelo `#F59E0B`, vermelho `#EF4444`) em abas, cabeçalhos de coluna, selos, bordas e indicadores. O fundo continua branco.

**Decisão (27/09/2026):** o **roxo de destaque vira azul** (abas ativas, ícones e detalhes: `#2563EB` → `#0EA5E9`); o restante segue a referência.

## Padrões visuais usados
- **Abas em "pílula"** com ícone. A aba ativa fica em degradê **azul** com brilho suave; as outras ficam com contorno.
- **Cabeçalho de módulo:** cartão com número em degradê (01 Kanban, 02 Tarefas, 03 Clientes, 04 Dashboard, 05 Dailies), título, descrição e ícone à direita.
- **Kanban:**
  - colunas com título colorido em maiúsculas e ícone;
  - cartões com bolinha de prioridade (vermelho alta, amarelo média, verde baixa);
  - linha de detalhe: segmento, responsável e data/valor;
  - rolagem horizontal.
- **Faixa de fluxo:** "Comercial & Atendimento (Prospecção → Contrato Pago) ⟶ Account Manager & Operacional (Onboarding → Execução Paralela por Setor)".
- **Selos de status:** Não Iniciado (ciano), Em Andamento (amarelo), Aguardando Cliente (amarelo), Finalizado (verde); prioridade Alta em vermelho.

## Diferenças entre a referência e o texto da Etapa 36 (decidir em cada fase)
| Assunto | Texto da Etapa 36 | Referência | Proposta |
|---|---|---|---|
| Colunas comerciais | … Contrato Enviado, Contrato Assinado, Aguardando Pagamento, Contrato Pago, Perdido | … Negociação, **Não Fechado**, **Contrato Efetivado**, Contrato Pago | Colunas configuráveis. A lista inicial é confirmada com você na 36.4. |
| Motivo da perda | "motivos de perda" | Sem fit com a empresa · Sem interesse no plano · Valor incompatível · Sem retorno · Outros motivos | Usar a lista da referência (configurável). |
| Passagem para o AM | conversão em cliente | "Contrato Pago → Account Manager recebe o cliente" | Na 36.4 a passagem é um **botão** (converter/vincular cliente), nunca automática sem regra. |
| Onboarding | 9 etapas | Reunião de Start → Onboarding → Coleta de Acessos → AC (dados no CRM) → Liberar para Setores → Finalizado | Configurável. A lista inicial é confirmada na 36.3. |
| Status das tarefas | 8 status | 4 (Não Iniciado, Em Andamento, Aguardando Cliente, Finalizado) | Os 8 do texto, que incluem os 4 da referência. |
| Ficha do cliente | não duplicar o cadastro | nicho, cidade, investimento diário/mensal, tipo de pagamento, desde quando, histórico de alterações | Na 36.5 os campos entram como **dados operacionais** ligados ao cliente existente, com histórico de alterações. |
| Dashboard de marketing | dashboard **operacional** | leads, CPL, ROAS, alertas | O de marketing já existe (Dashboard e alertas atuais). A Central terá o operacional. |
| Envio de relatórios por WhatsApp | não enviar nada externo sem integração | citado na visão geral | Fora da Etapa 36. |
