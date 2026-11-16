/**
 * Teste de navegador — T5.38 fase B: conectar o WhatsApp de um cliente por QR Code, dentro do Tracking.
 * Servidor de WhatsApp e Supabase SIMULADOS. Nenhum número real é usado.
 */
import { check, launch, login, mockSupabase, SHOTS } from "./support.mjs";

const CLI = "e0000000-0000-4000-8000-000000005338";
const client = (id, name) => ({ id, name, company: null, cnpj: null, owner_name: null, phone: null, email: null, notes: null, status: "ativo",
  timezone: "America/Sao_Paulo", is_demo: false, created_at: "2026-01-01T00:00:00Z", updated_at: "", created_by: null });
function seed(db) {
  db.clients.push(client(CLI, "Acollar"));
  db.trackingContainers.push({ id: "t-cont", client_id: CLI, name: "acollar.com.br", public_key: "bf_0123456789abcdef01234567", allowed_domains: ["acollar.com.br"],
    status: "ativo", test_mode: false, consent_mode: "nao_exigir", retention_days: 180, created_at: "2026-10-01T00:00:00Z", rules_version: null });
  db.whatsappConnections.push({ id: "c0000000-0000-4000-8000-0000000000aa", container_id: "t-cont", client_id: CLI, phone_number_id: "558195067876", waba_id: null,
    enabled: false, last_webhook_at: null, last_error_at: null, last_error_message: null, mode: "nao_oficial", display_phone: "558195067876", verified_name: null,
    has_inbound_key: true, inbound_key_hint: "abcd", instance_name: null, gateway_state: null });
}

async function openModal(page) {
  await login(page, "/tracking?secao=config");
  await page.getByRole("button", { name: "WhatsApp pelo servidor: acollar.com.br" }).click();
  const qr = page.getByTestId("wa-qr");
  await qr.waitFor();
  return qr;
}

// ------------------------------------------------------------ administrador
{
  const { browser, page, errors } = await launch();
  const db = await mockSupabase(page, { role: "admin" });
  seed(db);
  const qr = await openModal(page);
  check(await qr.getByText("Ainda não conectado").isVisible(), "começa como 'Ainda não conectado'");
  check(await qr.getByText("um número nunca lê as mensagens de outro", { exact: false }).isVisible(), "explica que cada cliente tem a sua conexão");
  check(await qr.getByText("não oficial", { exact: false }).isVisible(), "avisa do risco do caminho não oficial");

  // Conectar por QR Code
  await qr.getByRole("button", { name: "Conectar por QR Code" }).click();
  await qr.getByTestId("wa-qr-box").waitFor();
  check(await qr.getByRole("img", { name: "QR Code do WhatsApp" }).isVisible(), "mostra o QR Code");
  check((await qr.getByTestId("wa-qr-box").innerText()).includes("558195067876"), "diz de qual número é o QR (o celular certo)");
  check(await qr.getByText("Aguardando a leitura").isVisible(), "estado: aguardando a leitura");
  const c = db.whatsappConnections[0];
  check(/^bf-[0-9a-f]{12}$/.test(c.instance_name), "a conexão do cliente tem nome próprio (bf-...), nunca a da agência");
  check(db.waInst.hookKeys.length === 1 && /^[0-9a-f]{48}$/.test(c.inbound_key), "o aviso automático foi configurado com uma chave nova");
  check(!(await page.locator("body").innerText()).includes(c.inbound_key), "a chave nova nunca aparece na tela");
  await page.getByRole("dialog").first().screenshot({ path: `${SHOTS}/t538-qr-aguardando.png` });

  // O cliente lê o QR (simulado: depois de 2 conferências) → conecta e liga sozinho
  await qr.getByText("Conectado", { exact: true }).waitFor({ timeout: 15000 });
  check(await qr.getByText("As mensagens deste número já chegam ao CRM", { exact: false }).isVisible(), "ao conectar, avisa que as mensagens já chegam");
  check((await qr.getByRole("img", { name: "QR Code do WhatsApp" }).count()) === 0, "o QR some depois de conectar");
  check(c.enabled === true && c.gateway_state === "conectado", "conectar liga a conexão sozinha");
  check(await qr.getByText("celular do cliente precisa continuar com internet", { exact: false }).isVisible(), "lembra que o celular precisa ficar com internet");
  await page.getByRole("dialog").first().screenshot({ path: `${SHOTS}/t538-qr-conectado.png` });

  // Desconectar
  page.once("dialog", (d) => d.accept());
  await qr.getByRole("button", { name: "Desconectar" }).click();
  await qr.getByText("Desconectado", { exact: true }).waitFor();
  check(c.enabled === false, "desconectar desliga a conexão");

  // Conectar por código usa o número cadastrado
  await qr.getByRole("button", { name: "Conectar por código" }).click();
  await qr.getByTestId("wa-qr-code").waitFor();
  check((await qr.getByTestId("wa-qr-code").innerText()).includes("ABCD-1234"), "o código de pareamento aparece");

  // Remover
  page.once("dialog", (d) => d.accept());
  await qr.getByRole("button", { name: "Remover conexão do servidor" }).click();
  await qr.getByText("contatos e as conversas continuam guardados", { exact: false }).waitFor();
  check(c.instance_name === null && db.whatsappConnections.length === 1, "remover limpa a instância e mantém o cadastro do número");
  check(errors.length === 0, "sem erros no navegador");
  await browser.close();
}

// ------------------------------------------------------------ servidor recusa o aviso automático
{
  const { browser, page } = await launch();
  const db = await mockSupabase(page, { role: "admin" });
  seed(db);
  db.waInst.webhookOk = false;
  const qr = await openModal(page);
  await qr.getByRole("button", { name: "Conectar por QR Code" }).click();
  await qr.getByText("não aceitou o aviso automático", { exact: false }).waitFor();
  check(true, "se o servidor recusa o aviso, a tela avisa que as mensagens não chegam (não finge que funcionou)");
  await browser.close();
}

// ------------------------------------------------------------ gestor pode; operador não
{
  const { browser, page } = await launch();
  const db = await mockSupabase(page, { role: "gestor" });
  seed(db);
  const qr = await openModal(page);
  await qr.getByRole("button", { name: "Conectar por QR Code" }).click();
  await qr.getByTestId("wa-qr-box").waitFor();
  check(true, "gestor conecta por QR Code");
  await browser.close();
}
{
  const { browser, page } = await launch();
  const db = await mockSupabase(page, { role: "operador" });
  seed(db);
  await login(page, "/tracking?secao=config");
  const open = page.getByRole("button", { name: "WhatsApp pelo servidor: acollar.com.br" });
  if (await open.count()) {
    await open.click();
    await page.getByTestId("wa-server").waitFor();
    check((await page.getByTestId("wa-qr").count()) === 0, "operador não vê a conexão por QR Code");
  } else {
    check(true, "operador nem abre a configuração do WhatsApp");
  }
  await browser.close();
}
console.log("OK: wa-qr");
