# T5 — Tracking pronto para página de formulário e WhatsApp (sem cliente real)

Pedido do Ander (08/11/2026): deixar o tracking estruturado e testado, **sem colocar em nenhum cliente real**, pronto para sites com formulário/páginas prontas e para WhatsApp. GoHighLevel e Kommo ficam de fora (stand-by).

## Decisões
- A skill "Metrik Rastreio" (um sistema separado por cliente, GHL/Kommo) **não substitui** o nosso: o nosso guarda só hash, não guarda texto do WhatsApp, usa cofre e vive dentro do CRM. Ideias aproveitadas: cliques em botões/links, campos escondidos nos formulários, leitura do anúncio de WhatsApp (`ctwa_clid`) por servidor não oficial, e a lista "só está pronto quando…".
- **Responde App** só aceita o número do Pixel (não aceita colar o nosso script). Fica Pixel do navegador; o CRM só recebe o lead se o Responde App tiver webhook (conferir na T5.2).
- **Vendas do WhatsApp:** a frase marca sozinha (T4.1). A IA (Sonnet, 1 vez por dia) só **sugere**; o Ander confere a conversa e confirma; só então vai ao Meta.
- **Conversas guardadas 30 dias** (pode cair para 15), só admin/gestor veem, nunca em log/histórico, apagadas sozinhas, sem grupos. Exige aviso na política de privacidade/contrato do cliente.

## Fases
| Fase | O que | Estado |
|---|---|---|
| T5.1 | Aba Tracking com abas internas (Sites, Origem e jornada, WhatsApp, Leads e contatos); menu sem "(em construção)" | ✅ pronta |
| T5.2 | Script: cliques em botões e links, campos escondidos com a origem | ✅ pronta |
| T5.2b | Link de grupo do WhatsApp (Contato) e lead por webhook (Responde App e outros formulários) | ✅ pronta |
| T5.3 | WhatsApp por servidor não oficial: código do site, origem do anúncio, ignorar grupos e mensagens enviadas pela agência | a fazer |
| T5.4 | Site de teste num cliente fictício, do começo ao fim (com Pixel de teste do Ander) | a fazer |
| T5.5 | Lista "pronto para cliente" (aba Saúde) | a fazer |
| T5.6 | Conversas por 30 dias + Vendas sugeridas pelo Sonnet | a fazer |
| Stand-by | GoHighLevel e Kommo | tarefa futura |
