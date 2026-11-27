import { assert, assertEquals, assertRejects } from "jsr:@std/assert@1";
import { DriveClient, driveApiError, MAX_IMAGE_BYTES, parseDriveFolderId } from "./drive.ts";
import { SheetsError } from "./sheets.ts";

Deno.test("pasta: aceita link do Drive ou o ID puro; recusa lixo", () => {
  assertEquals(parseDriveFolderId("https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOp?usp=sharing"), "1AbCdEfGhIjKlMnOp");
  assertEquals(parseDriveFolderId("https://drive.google.com/open?id=1AbCdEfGhIjKlMnOp"), "1AbCdEfGhIjKlMnOp");
  assertEquals(parseDriveFolderId("1AbCdEfGhIjKlMnOp"), "1AbCdEfGhIjKlMnOp");
  assertEquals(parseDriveFolderId("oi"), null);
  assertEquals(parseDriveFolderId("https://site.com/x"), null);
});

Deno.test("erros do Drive: API desligada, pasta não compartilhada (com o e-mail certo) e limite", () => {
  assertEquals(driveApiError(403, { error: { message: "Google Drive API has not been used in project 1 before or it is disabled.", status: "PERMISSION_DENIED" } }, "robo@x.iam.gserviceaccount.com").code, "DRIVE_API_DISABLED");
  const e = driveApiError(404, null, "robo@x.iam.gserviceaccount.com");
  assertEquals(e.code, "DRIVE_NOT_SHARED");
  assert(e.userMessage.includes("robo@x.iam.gserviceaccount.com"));
  assertEquals(driveApiError(429, null, "a").code, "DRIVE_RATE_LIMITED");
});

// Cliente com token falso: o Drive simulado responde por rota.
async function fakeClient(routes: (url: string) => Response) {
  const pair = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
  const der = new Uint8Array(await crypto.subtle.exportKey("pkcs8", pair.privateKey));
  let bin = "";
  for (const b of der) bin += String.fromCharCode(b);
  const pem = `-----BEGIN PRIVATE KEY-----\n${btoa(bin)}\n-----END PRIVATE KEY-----`;
  const f = ((url: string | URL) => {
    const u = String(url);
    if (u.startsWith("https://oauth2.googleapis.com/token")) return Promise.resolve(new Response(JSON.stringify({ access_token: "tok", expires_in: 3600 })));
    return Promise.resolve(routes(u));
  }) as unknown as typeof fetch;
  return new DriveClient({ client_email: `d${Math.random()}@x.iam.gserviceaccount.com`, private_key: pem }, f);
}

Deno.test("listar pasta: separa subpastas e imagens JPG/PNG; conta o resto sem mostrar", async () => {
  const c = await fakeClient(() => new Response(JSON.stringify({ files: [
    { id: "f1", name: "Black Friday", mimeType: "application/vnd.google-apps.folder" },
    { id: "i1", name: "ADS-01.png", mimeType: "image/png", size: "12345" },
    { id: "i2", name: "ADS-02.jpg", mimeType: "image/jpeg", size: "999" },
    { id: "v1", name: "video.mp4", mimeType: "video/mp4", size: "9999999" },
  ] })));
  const r = await c.list("pasta123456");
  assertEquals(r.folders, [{ id: "f1", name: "Black Friday" }]);
  assertEquals(r.images.map((i) => i.name), ["ADS-01.png", "ADS-02.jpg"]);
  assertEquals(r.images[0].size, 12345);
  assertEquals(r.others, 1);
});

Deno.test("baixar imagem: recusa o que não é JPG/PNG e o que passa do limite ANTES de baixar", async () => {
  let downloaded = false;
  const c = await fakeClient((u) => {
    if (u.includes("alt=media")) { downloaded = true; return new Response(new Uint8Array([1, 2, 3])); }
    if (u.includes("/files/video")) return new Response(JSON.stringify({ id: "video", name: "v.mp4", mimeType: "video/mp4", size: "10" }));
    if (u.includes("/files/gigante")) return new Response(JSON.stringify({ id: "gigante", name: "g.png", mimeType: "image/png", size: String(MAX_IMAGE_BYTES + 1) }));
    return new Response(JSON.stringify({ id: "ok", name: "a.png", mimeType: "image/png", size: "3" }));
  });
  const e1 = await assertRejects(() => c.downloadImage("video"), SheetsError);
  assertEquals(e1.code, "DRIVE_NOT_IMAGE");
  const e2 = await assertRejects(() => c.downloadImage("gigante"), SheetsError);
  assertEquals(e2.code, "DRIVE_TOO_BIG");
  assertEquals(downloaded, false);
  const ok = await c.downloadImage("ok");
  assertEquals([...ok.bytes], [1, 2, 3]);
  assertEquals(ok.name, "a.png");
});
