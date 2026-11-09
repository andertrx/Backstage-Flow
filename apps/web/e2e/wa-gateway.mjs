/**
 * Teste de navegador da Etapa 44.1 — conexão do WhatsApp por API não oficial (Integrações). Supabase e servidor de conexão SIMULADOS.
 * Confere: aceite do risco, chave que não volta, QR Code e código, estado, trava geral e que só admin vê.
 */
import { BASE, check, launch, login, mockSupabase, SHOTS } from "./support.mjs";

const KEY = "chave-do-servidor-1234567890";

// ---------------------------------------------------------------- Admin
{
  const { browser, page, errors } = await launch();
  const db = await mockSupabase(page, { role: "admin" });
  await login(page, "/configuracoes/integracoes");
  const card = page.getByTestId("wa-gateway-card");
  await card.waitFor();
  check((await card.innerText()).includes("Não oficial") && (await card.innerText()).includes("pode banir o número"), "aviso de conexão não oficial e risco de banimento");
  check(await card.getByRole("button", { name: /Conectar por QR Code/ }).isDisabled(), "sem salvar a configuração, não dá para conectar");
  check(await card.getByRole("button", { name: "Ligar" }).isDisabled(), "trava geral: não liga sem conexão");

  // Sem aceitar o risco, não salva; endereço inseguro é recusado
  await card.getByLabel("Endereço do servidor de conexão").fill("https://whats.exemplo.com.br");
  await card.getByLabel("Chave de acesso do servidor").fill(KEY);
  await card.getByRole("button", { name: "Salvar" }).click();
  await card.getByText("Marque que você entende o risco").waitFor();
  check(db.waGw.has_key === false, "sem aceitar o risco: nada salvo");
  await card.getByLabel("Endereço do servidor de conexão").fill("http://whats.exemplo.com.br");
  await card.getByRole("checkbox").check();
  await card.getByRole("button", { name: "Salvar" }).click();
  await card.getByText("precisa começar com https://").waitFor();
  check(db.waGw.has_key === false, "endereço sem https: recusado");

  // Salvar de verdade
  await card.getByLabel("Endereço do servidor de conexão").fill("https://whats.exemplo.com.br");
  await card.getByRole("button", { name: "Salvar" }).click();
  await card.getByText("A chave foi para o cofre").waitFor();
  check(db.waGw.has_key && db.waKey === KEY && db.waGw.base_url === "https://whats.exemplo.com.br" && db.waGw.risk_accepted_at, "salvo: chave no cofre e risco aceito");
  check(!(await card.innerHTML()).includes(KEY) && (await card.getByLabel(/Trocar a chave/).inputValue()) === "", "a chave nunca volta para a tela");
  check(JSON.stringify(db.rpcCalls).includes(KEY) === false, "a chave não fica no histórico de chamadas da tela");
  check(await card.getByTestId("wa-risk-accepted").count() === 1, "mostra \"Risco aceito em ...\" e não pede de novo");

  // QR Code
  await card.getByRole("button", { name: /Conectar por QR Code/ }).click();
  await card.getByTestId("wa-qr").waitFor();
  check((await card.getByTestId("wa-connection").innerText()).includes("Esperando você ler"), "estado: esperando a leitura");
  await page.screenshot({ path: `${SHOTS}/wa-gateway-qr.png`, fullPage: false });

  // Telefone inválido no código; telefone certo gera o código
  await card.getByLabel(/telefone do chip/).fill("123");
  await card.getByRole("button", { name: "Gerar código" }).click();
  await card.getByText("Telefone inválido").waitFor();
  await card.getByLabel(/telefone do chip/).fill("(11) 98765-4321");
  await card.getByRole("button", { name: "Gerar código" }).click();
  await card.getByTestId("wa-pairing").waitFor();
  check((await card.getByTestId("wa-pairing").innerText()).includes("WZYEH1YY"), "código de pareamento mostrado");
  check(db.functionCalls.some((c) => c.fn === "wa-gateway" && c.action === "connect" && c.number === "(11) 98765-4321"), "o telefone vai para o servidor para gerar o código");

  // O celular lê o QR: a tela percebe sozinha
  db.waSim.state = "open";
  await card.getByRole("button", { name: /Verificar agora/ }).click();
  await card.getByText("WhatsApp conectado").first().waitFor();
  check(db.waGw.connection_state === "conectado" && await card.getByTestId("wa-qr").count() === 0, "conectado: some o QR Code");

  // Trava geral
  await card.getByRole("button", { name: "Ligar" }).click();
  await card.getByTestId("wa-switch").getByText("LIGADOS", { exact: true }).waitFor();
  check(db.waGw.enabled === true, "trava ligada com o WhatsApp conectado");
  await page.screenshot({ path: `${SHOTS}/wa-gateway-conectado.png`, fullPage: false });
  await card.getByRole("button", { name: "Desligar tudo" }).click();
  await card.getByTestId("wa-switch").getByText("DESLIGADOS", { exact: true }).waitFor();
  check(db.waGw.enabled === false, "desligar tudo funciona");

  // Desconectar desliga a trava
  await card.getByRole("button", { name: "Ligar" }).click();
  await card.getByTestId("wa-switch").getByText("LIGADOS", { exact: true }).waitFor();
  page.once("dialog", (d) => d.accept());
  await card.getByRole("button", { name: /Desconectar/ }).click();
  await card.getByTestId("wa-switch").getByText("DESLIGADOS", { exact: true }).waitFor();
  check(db.waGw.connection_state === "desconectado" && db.waGw.enabled === false, "desconectar desliga a trava sozinho");

  // Servidor fora do ar / chave recusada: mensagens em português, sem detalhes técnicos
  db.waSim.up = false;
  await card.getByRole("button", { name: /Verificar agora/ }).click();
  await card.getByText("Não consegui falar com o servidor do WhatsApp").first().waitFor();
  check(true, "servidor fora do ar: mensagem clara");
  db.waSim.up = true; db.waSim.keyOk = false;
  await card.getByRole("button", { name: /Verificar agora/ }).click();
  await card.getByText("recusou a chave").first().waitFor();
  check(db.waGw.connection_state === "erro", "chave recusada: estado de erro");

  // Mudar o servidor desliga a trava e zera a conexão
  db.waSim.keyOk = true; db.waSim.state = "open";
  await card.getByRole("button", { name: /Verificar agora/ }).click();
  await card.getByText("WhatsApp conectado").first().waitFor();
  await card.getByRole("button", { name: "Ligar" }).click();
  await card.getByTestId("wa-switch").getByText("LIGADOS", { exact: true }).waitFor();
  await card.getByLabel("Endereço do servidor de conexão").fill("https://outro.exemplo.com.br");
  await card.getByRole("button", { name: "Salvar" }).click();
  await card.getByTestId("wa-switch").getByText("DESLIGADOS", { exact: true }).waitFor();
  check(db.waGw.connection_state === "desconhecido" && db.waGw.enabled === false, "mudar o servidor desliga a trava e zera a conexão");
  check(errors.length === 0, "sem erros no navegador (admin)", errors.join(" | "));
  await browser.close();
}

// ---------------------------------------------------------------- Gestor não vê o cartão
{
  const { browser, page } = await launch();
  await mockSupabase(page, { role: "gestor" });
  await login(page, "/configuracoes/integracoes");
  await page.waitForTimeout(1500);
  check(await page.getByTestId("wa-gateway-card").count() === 0 || new URL(page.url()).pathname !== "/configuracoes/integracoes", "gestor não vê a conexão do WhatsApp não oficial");
  await browser.close();
}


// ---------------------------------------------------------------- Saúde da conexão (T5.17)
{
  const { browser, page, errors } = await launch();
  const db = await mockSupabase(page, { role: "admin" });
  Object.assign(db.waGw, { has_key: true, base_url: "https://whats.exemplo.com.br", connection_state: "conectado", enabled: true,
    owner_tail: "6623", profile_name: "Ander", health_state: "conectado", last_ok_at: new Date().toISOString() });
  await login(page, "/configuracoes/integracoes");
  const h = page.getByTestId("wa-health");
  await h.waitFor();
  const txt = (await h.innerText()).replace(/\s+/g, " ");
  check(txt.includes("final 6623") && txt.includes("Ander"), "mostra o final do número ligado e o nome do perfil");
  check(txt.includes("a cada 5 minutos") && txt.includes("10 minutos"), "explica a conferência a cada 5 minutos e o aviso depois de 10");
  check(await page.getByTestId("wa-health-problem").count() === 0, "conectado: nenhum problema aparece");
  Object.assign(db.waGw, { health_state: "sem_resposta", health_message: "O servidor não respondeu (pode estar reiniciando, fora do ar ou trocando de número).", health_since: new Date().toISOString() });
  await page.reload();
  await page.getByTestId("wa-health-problem").waitFor();
  check((await page.getByTestId("wa-health-problem").innerText()).includes("não respondeu"), "com problema: mostra desde quando e a causa em português");
  check(errors.length === 0, `sem erros no navegador (${errors.join(" | ")})`);
  await browser.close();
}
console.log("Conexão WhatsApp não oficial (Etapa 44.1): tudo certo.");
