import { describe, expect, it } from "vitest";
import {
  applyPrepared, baseName, checkEsteira, esteiraPlan, esteiraPublishBlockers, isEsteira, mediaToPrepare, newEsteira, newEsteiraItem,
  normalizeEsteira, pairDriveFiles, slotOf, toMedia, type DriveMediaFile, type EsteiraDraft,
} from "./esteira.ts";

const vid = (id: string, name: string, width: number | null = null, height: number | null = null): DriveMediaFile => ({ id: `${id}xxxxxxxxxx`, name, kind: "video", width, height });

function ready(): EsteiraDraft {
  const d = newEsteira();
  d.target = { adSetId: "120250174283950625", adSetName: "CJ-03", campaignId: "1202", campaignName: "CP-7.6", destinationType: "WHATSAPP" };
  d.pageId = "328104960376244";
  d.instagramId = "17841402908048736";
  const item = newEsteiraItem(d, { name: "OFERTA-01", feed: { ...toMedia(vid("a", "OFERTA-01_4x5.mp4")), metaVideoId: "111", metaThumb: "https://x/t.jpg" }, vertical: { ...toMedia(vid("b", "OFERTA-01_9x16.mp4")), metaVideoId: "222", metaThumb: "https://x/u.jpg" } });
  item.bodies = ["Texto 1", "Texto 2", "Texto 3"];
  item.titles = ["Título 1", "Título 2", "Título 3"];
  d.items = [item];
  return d;
}

describe("Fase J.2 — Esteira de criativos", () => {
  it("decide o posicionamento pelo formato real e, sem formato, pelo nome", () => {
    expect(slotOf({ name: "x.mp4", width: 1080, height: 1920 })).toBe("vertical");
    expect(slotOf({ name: "x.mp4", width: 1080, height: 1350 })).toBe("feed");
    expect(slotOf({ name: "x.mp4", width: 1080, height: 1080 })).toBe("feed");
    expect(slotOf({ name: "OFERTA_stories.mp4", width: null, height: null })).toBe("vertical");
    expect(slotOf({ name: "OFERTA_feed.mp4", width: null, height: null })).toBe("feed");
    expect(slotOf({ name: "OFERTA.mp4", width: null, height: null })).toBeNull();
  });

  it("tira as marcas de formato do nome", () => {
    expect(baseName("OFERTA-01_9x16.mp4")).toBe("OFERTA-01");
    expect(baseName("OFERTA-01_4x5.mp4")).toBe("OFERTA-01");
    expect(baseName("Black Friday - stories.mov")).toBe("Black Friday");
  });

  it("junta vertical + feed com o mesmo nome-base num criativo só", () => {
    const r = pairDriveFiles([vid("a", "OFERTA-01_9x16.mp4", 1080, 1920), vid("b", "OFERTA-01_4x5.mp4", 1080, 1350), vid("c", "OFERTA-02.mp4", 1080, 1080)]);
    expect(r).toHaveLength(2);
    expect(r[0]).toMatchObject({ name: "OFERTA-01", paired: true });
    expect(r[0].vertical?.name).toBe("OFERTA-01_9x16.mp4");
    expect(r[0].feed?.name).toBe("OFERTA-01_4x5.mp4");
    expect(r[1]).toMatchObject({ name: "OFERTA-02", paired: false, vertical: null });
  });

  it("não junta imagem com vídeo nem dois arquivos do mesmo formato", () => {
    const img: DriveMediaFile = { id: "imgxxxxxxxxxx", name: "OFERTA_9x16.jpg", kind: "image", width: 1080, height: 1920 };
    expect(pairDriveFiles([img, vid("b", "OFERTA_4x5.mp4", 1080, 1350)]).every((x) => !x.paired)).toBe(true);
    expect(pairDriveFiles([vid("a", "A_feed.mp4", 1080, 1080), vid("b", "A_1x1.mp4", 1080, 1080)]).every((x) => !x.paired)).toBe(true);
  });

  it("rascunho completo passa; sem arquivo enviado ao Meta não sobe", () => {
    const d = ready();
    expect(checkEsteira(d).filter((x) => x.level === "erro")).toEqual([]);
    expect(esteiraPublishBlockers(d)).toEqual([]);
    d.items[0].vertical!.metaVideoId = "";
    expect(esteiraPublishBlockers(d).map((x) => x.message).join(" ")).toMatch(/ainda não foram enviados/);
    expect(mediaToPrepare(d)).toHaveLength(1);
  });

  it("grava o código do Meta em todos os criativos que usam o mesmo arquivo", () => {
    const d = ready();
    d.items.push({ ...d.items[0], id: "outro" });
    d.items.forEach((i) => { i.feed!.metaVideoId = ""; });
    expect(mediaToPrepare(d)).toHaveLength(1);
    const n = applyPrepared(d, d.items[0].feed!.fileId, { videoId: "999", thumbnail: "https://x/z.jpg" });
    expect(n.items.map((i) => i.feed?.metaVideoId)).toEqual(["999", "999"]);
    expect(mediaToPrepare(n)).toHaveLength(0);
  });

  it("confere destino, página, link de site, textos e tipos dos arquivos", () => {
    const d = ready();
    d.target!.destinationType = "ON_AD";
    expect(checkEsteira(d).some((x) => x.level === "erro" && /leva para "ON_AD"/.test(x.message))).toBe(true);
    d.target!.destinationType = "WEBSITE";
    const msgs = checkEsteira(d).map((x) => x.message).join(" | ");
    expect(msgs).toMatch(/link de destino/);
    expect(msgs).toMatch(/botão/);
    const e = ready();
    e.items[0].bodies = ["", " "];
    e.items[0].vertical = { ...e.items[0].vertical!, kind: "image" };
    const m2 = checkEsteira(e).map((x) => x.message).join(" | ");
    expect(m2).toMatch(/pelo menos um texto/);
    expect(m2).toMatch(/mesmo tipo/);
  });

  it("lê o rascunho salvo com segurança e monta o plano criativo → anúncio", () => {
    expect(isEsteira({ kind: "esteira" })).toBe(true);
    expect(isEsteira({ campaign: {} })).toBe(false);
    const d = normalizeEsteira(JSON.parse(JSON.stringify(ready())));
    expect(d.items[0].bodies).toHaveLength(3);
    expect(d.target?.destinationType).toBe("WHATSAPP");
    const bad = normalizeEsteira({ kind: "esteira", pageId: "abc", items: [{ feed: { fileId: "../x" }, bodies: ["a", "b", "c", "d", "e", "f", "g"] }] });
    expect(bad.pageId).toBe("");
    expect(bad.items[0].feed).toBeNull();
    expect(bad.items[0].bodies).toHaveLength(5);
    expect(esteiraPlan(ready()).map((p) => p.kind)).toEqual(["criativo", "anuncio"]);
  });
});
