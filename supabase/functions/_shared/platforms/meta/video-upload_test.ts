import { assertEquals } from "jsr:@std/assert@1";
import { MAX_CHUNK_BYTES, newUploadState, uploadProgress, uploadStep, type UploadDeps } from "./video-upload.ts";

/** Meta e Drive simulados: o Meta pede pedaços de 4 bytes; o relógio anda 10 ms por pedaço. */
function fake(size: number, opts: { failTransferAt?: number; videoStatus?: string } = {}) {
  let clock = 0;
  const calls: string[] = [];
  const received: number[] = [];
  const file = new Uint8Array(size).map((_, i) => i % 256);
  const deps: UploadDeps = {
    readRange: (a, b) => { calls.push(`ler ${a}-${b}`); return Promise.resolve(file.slice(a, b)); },
    start: (n) => { calls.push(`start ${n}`); return Promise.resolve({ uploadSessionId: "S1", videoId: "V1", startOffset: 0, endOffset: Math.min(4, n) }); },
    transfer: (_s, start, chunk) => {
      clock += 10;
      if (opts.failTransferAt === start) return Promise.reject(new Error("O Meta recusou o pedaço."));
      calls.push(`envia ${start}+${chunk.length}`);
      received.push(...chunk);
      const next = start + chunk.length;
      return Promise.resolve({ startOffset: next, endOffset: Math.min(next + 4, size) });
    },
    finish: () => { calls.push("finish"); return Promise.resolve(); },
    videoStatus: () => Promise.resolve({ status: opts.videoStatus ?? "ready", picture: "https://cdn/v.jpg" }),
    now: () => clock,
  };
  return { deps, calls, received, file };
}

Deno.test("vídeo grande: envia em pedaços, finaliza e fica pronto com a miniatura do Meta", async () => {
  const f = fake(10);
  const s = await uploadStep(f.deps, newUploadState(10));
  assertEquals(s.status, "pronto");
  assertEquals(s.metaVideoId, "V1");
  assertEquals(s.thumbnail, "https://cdn/v.jpg");
  assertEquals(f.calls, ["start 10", "ler 0-4", "envia 0+4", "ler 4-8", "envia 4+4", "ler 8-10", "envia 8+2", "finish"]);
  assertEquals(f.received, [...f.file]);
});

Deno.test("vídeo grande: para no limite de tempo e a próxima chamada continua de onde parou", async () => {
  const f = fake(40);
  const s1 = await uploadStep(f.deps, newUploadState(40), 25);
  assertEquals(s1.status, "enviando");
  assertEquals(s1.startOffset, 12);
  assertEquals(Math.round(uploadProgress(s1) * 100), 30);
  const s2 = await uploadStep(f.deps, s1, 1000);
  assertEquals(s2.status, "pronto");
  assertEquals(f.calls.filter((c) => c.startsWith("start")).length, 1);
  assertEquals(f.received, [...f.file]);
});

Deno.test("vídeo grande: erro do Meta guarda a posição; tentar de novo continua do mesmo pedaço", async () => {
  const f = fake(12, { failTransferAt: 4 });
  const s1 = await uploadStep(f.deps, newUploadState(12));
  assertEquals(s1.status, "enviando");
  assertEquals(s1.startOffset, 4);
  assertEquals(s1.errorMessage, "O Meta recusou o pedaço.");
  const ok = fake(12);
  const s2 = await uploadStep(ok.deps, s1);
  assertEquals(s2.status, "pronto");
  assertEquals(ok.calls[0], "ler 4-8");
});

Deno.test("vídeo grande: processamento com erro vira falhou; pedaço grande demais é recusado", async () => {
  const f = fake(4, { videoStatus: "error" });
  assertEquals((await uploadStep(f.deps, newUploadState(4))).status, "falhou");
  const g = fake(8);
  const s = await uploadStep(g.deps, { ...newUploadState(8), uploadSessionId: "S1", metaVideoId: "V1", startOffset: 0, endOffset: MAX_CHUNK_BYTES + 1 });
  assertEquals(s.status, "enviando");
  assertEquals(s.errorMessage.includes("grande demais"), true);
});
