/**
 * Auditoria de celular: acha texto cortado por uma caixa que corta (sem reticências) e coisa que passa da largura da tela.
 * Uso: AUDIT_W=390 node e2e/<teste>.mjs   (qualquer teste de navegador; no fim, imprime o que achou)
 */
export const auditFn = () => {
  const out = [];
  const vw = document.documentElement.clientWidth;
  const seen = new Set();
  for (const el of document.querySelectorAll("body *")) {
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden") continue;
    if (el.closest(".sr-only")) continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    const hasText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 1);
    if (hasText) {
      // texto cortado por uma caixa que corta (overflow hidden) sem reticências
      for (let p = el; p && p !== document.body; p = p.parentElement) {
        const pc = getComputedStyle(p);
        if (/(auto|scroll)/.test(pc.overflowX)) break; // rola: tudo bem
        if (!/(hidden|clip)/.test(pc.overflowX)) continue;
        const pr = p.getBoundingClientRect();
        const range = document.createRange();
        range.selectNodeContents(el);
        const tr = range.getBoundingClientRect();
        const ellipsis = pc.textOverflow === "ellipsis" || cs.textOverflow === "ellipsis";
        if ((tr.right > pr.right + 1 || tr.left < pr.left - 1) && !ellipsis && pr.width > 0 && pc.position !== "fixed") {
          const key = el.tagName + el.className + el.textContent.slice(0, 20);
          if (!seen.has(key)) {
            seen.add(key);
            out.push(`CORTADO "${el.textContent.trim().slice(0, 40)}" <${el.tagName.toLowerCase()} class="${String(el.className).slice(0, 60)}"> (texto ${Math.round(tr.right - tr.left)}px, caixa ${Math.round(pr.width)}px)`);
          }
          break;
        }
      }
    }
    const inScroll = (() => { for (let q = el.parentElement; q && q !== document.body; q = q.parentElement) if (/(auto|scroll)/.test(getComputedStyle(q).overflowX)) return true; return false; })();
    if (hasText && !inScroll) {
      // texto que passa da borda do "cartão" onde está (a vizinha cobre o resto, como no Saldo cortado)
      let card = el.parentElement;
      while (card && card !== document.body) {
        const cc = getComputedStyle(card);
        const hasBg = cc.backgroundColor !== "rgba(0, 0, 0, 0)" || cc.backgroundImage !== "none";
        if ((hasBg || cc.boxShadow !== "none") && !/(auto|scroll)/.test(cc.overflowX) && card.getBoundingClientRect().width < vw - 4) break;
        card = card.parentElement;
      }
      if (card && card !== document.body) {
        const range = document.createRange();
        range.selectNodeContents(el);
        const tr = range.getBoundingClientRect();
        const cr = card.getBoundingClientRect();
        const ecs = cs.textOverflow === "ellipsis";
        if (!ecs && tr.width > 0 && (tr.right > cr.right + 1 || tr.left < cr.left - 1) && getComputedStyle(card).position !== "fixed") {
          const key = "ESTOURA" + el.tagName + el.className + el.textContent.slice(0, 20);
          if (!seen.has(key)) {
            seen.add(key);
            out.push(`ESTOURA O CARTÃO "${el.textContent.trim().slice(0, 40)}" <${el.tagName.toLowerCase()} class="${String(el.className).slice(0, 50)}"> (texto ${Math.round(tr.width)}px, cartão ${Math.round(cr.width)}px)`);
          }
        }
      }
    }
    if (r.right > vw + 1 && !el.closest("[class*=overflow-x-auto],[class*=overflow-auto],[class*=overflow-x-scroll]") && cs.position !== "fixed") {
      const key = "VAZA" + el.tagName + el.className;
      if (!seen.has(key)) {
        seen.add(key);
        out.push(`VAZA <${el.tagName.toLowerCase()} class="${String(el.className).slice(0, 60)}"> ${el.textContent.trim().slice(0, 30)} (direita ${Math.round(r.right)} > ${vw})`);
      }
    }
  }
  if (document.documentElement.scrollWidth > vw) out.push(`PÁGINA rola para o lado (${document.documentElement.scrollWidth - vw}px)`);
  return out;
};

export function installAudit(page, browser, width) {
  const found = new Map();
  let busy = false;
  const timer = setInterval(async () => {
    if (busy) return;
    busy = true;
    try {
      const u = new URL(page.url());
      const path = u.pathname + u.search;
      const items = await page.evaluate(auditFn);
      for (const m of items) found.set(`${path}|${m.replace(/\(\d+px.*$/, "")}`, `${path}: ${m}`);
    } catch { /* página trocando */ } finally { busy = false; }
  }, 500);
  const close = browser.close.bind(browser);
  browser.close = async () => {
    clearInterval(timer);
    for (const v of found.values()) console.log(`AUDIT[${width}] ${v}`);
    return close();
  };
}
