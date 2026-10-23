# Tracking T3 — Contatos e vendas no CRM (fim da planilha): auditoria e plano

> Status: **proposta** (23/10/2026). Nada foi implementado. Aguarda as respostas e o "pode avançar" do Ander.

## 1. O que existe hoje (conferido no banco)
| Peça | Situação |
|---|---|
| Planilhas (Inteligência de Resultados) | 4 clientes: Vonks (4.979 linhas), Estilo de Ser (2.840), Florenc (2.298), Armored (870). Trazem data, coluna SQL/perfil (lojista…), campanha/conjunto/anúncio, UTMs, fbclid/gclid e o telefone **só em hash**. O nome do contato **não** é lido |
| Leads do site (`tracking_leads`) | Prontos (contato só em hash, primeira e última origem). 0 hoje: nenhum site instalado |
| WhatsApp (código "ref.") | Pronto: marcar Lead ou Venda pelo código |
| Venda fora do site | Não existe |
| Central de Operações → Comercial | É o comercial **da agência** (seus leads), não o dos clientes. Não será misturado |

## 2. O que a T3 entrega
Uma lista de **contatos de cada cliente** dentro do CRM, no lugar da planilha:
- **De onde vem cada contato:** formulário do site (T2), clique no WhatsApp com código, ou lançamento manual (telefone digitado na tela e cifrado ali mesmo).
- **Etapas** (configuráveis por cliente), por exemplo: **Novo → Qualificado (Lojista / Sacoleiro / Cliente final) → Venda / Perdido**.
- **Cada etapa pode virar evento no Meta**, escolhido por você. Exemplos:
  - **Qualificado como Lojista** → evento de lead qualificado: é o que mais treina a campanha;
  - Sacoleiro → registrado, sem enviar;
  - **Venda** → Compra com valor e nº do pedido.
- **Marcação rápida:** buscar pelo código "ref." da mensagem ou pelo telefone (cifrado antes de buscar). Tela pensada para o celular.
- **Histórico** de cada contato (quem mudou de etapa e quando), permanente.
- **Inteligência de Resultados lê do CRM:** a mesma tela de hoje (perfis, campanhas, conjuntos, anúncios), com a fonte "CRM" no lugar da planilha. A planilha continua funcionando enquanto você quiser; desligar é escolha sua, por cliente.

## 3. Regras
- Contato **só em hash** (como hoje na planilha e no site). O nome não é guardado. A busca é pelo telefone digitado (cifrado no navegador) ou pelo código "ref.".
- Moedas separadas; nada apagado (contato "Perdido" ou arquivado continua no histórico).
- Cliente desativado: não recebe contatos novos nem envia ao Meta.
- Sem duplicar: mesmo telefone no mesmo cliente = mesmo contato. Venda com o mesmo nº de pedido é recusada.
- **Menu:** sem item novo. "Contatos" fica **dentro de Tracking** (e na ficha do cliente).

## 4. Fases
| Fase | Entrega |
|---|---|
| **T3.1** | Contatos + etapas configuráveis + marcação (código / telefone / manual) + envio ao Meta por etapa + histórico |
| **T3.2** | Venda pelo sistema do cliente (endereço de webhook com chave por cliente) |
| **T3.3** | Inteligência de Resultados com a fonte "CRM" (mesmas telas), lado a lado com a planilha até você desligá-la |

## 5. Tabelas previstas (explicadas de novo no relatório de cada fase)
| Tabela | Para quê | Por quanto tempo |
|---|---|---|
| `tracking_contacts` | Um contato por pessoa e cliente: hash do telefone/e-mail, origem, etapa atual, tipo (lojista…), ligação com o lead do site e o clique do WhatsApp | Para sempre (arquivar, nunca apagar) |
| `tracking_contact_stages` | Etapas de cada cliente: nome, ordem, tipo (aberta / ganha / perdida), evento no Meta | Para sempre |
| `tracking_contact_history` | Cada mudança de etapa, valor da venda, quem e quando | Para sempre |

## 6. Perguntas
1. **Quem vai marcar as etapas?**
   - a) a **sua equipe**, que já tem acesso ao CRM;
   - b) a **equipe do cliente**, com um login novo de **"Vendedor"** que só vê e marca os contatos daquele cliente, sem ver o resto do CRM.
2. **Etapas padrão:** começo com **Novo → Qualificado (Lojista / Sacoleiro / Cliente final / Outro) → Venda / Perdido**, com só **Lojista** e **Venda** indo ao Meta? Cada cliente pode mudar depois.
