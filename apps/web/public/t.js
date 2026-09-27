/*! Backstage Flow — script de tracking (Etapa 34). Sem dados pessoais. */
(function (w, d) {
  "use strict";
  try {
    if (w.__bfLoaded) return;
    w.__bfLoaded = true;
    var el = d.currentScript || d.querySelector("script[data-key][src*='t.js']");
    var KEY = el && el.getAttribute("data-key");
    if (!KEY || !/^bf_[0-9a-f]{24}$/.test(KEY)) return;
    var ENDPOINT = (el && el.getAttribute("data-endpoint")) || "https://dkatllzkmlzpginuzvis.supabase.co/functions/v1/track";
    var NEEDS_CONSENT = el.getAttribute("data-consent") === "aguardar";
    var SESSION_MS = 30 * 60 * 1000;
    var CAMPAIGN_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "fbclid", "gclid", "wbraid", "gbraid", "msclkid", "ttclid", "li_fat_id", "bf_c", "bf_s", "bf_a"];

    var rand = function (n) {
      var a = new Uint8Array(n), s = "", c = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
      (w.crypto || w.msCrypto).getRandomValues(a);
      for (var i = 0; i < n; i++) s += c.charAt(a[i] & 63);
      return s;
    };
    var getCookie = function (name) {
      var m = d.cookie.match(new RegExp("(?:^|; )" + name + "=([^;]*)"));
      return m ? decodeURIComponent(m[1]) : null;
    };
    // Cookie do próprio site, no domínio principal (www.loja.com.br → loja.com.br).
    var setCookie = function (name, value, maxAgeSec) {
      var parts = location.hostname.split("."), base = "; path=/; max-age=" + maxAgeSec + "; SameSite=Lax" + (location.protocol === "https:" ? "; Secure" : "");
      for (var i = Math.max(parts.length - 2, 0); i >= 0; i--) {
        var dom = parts.slice(i).join(".");
        d.cookie = name + "=" + encodeURIComponent(value) + base + (parts.length > 1 ? "; domain=" + dom : "");
        if (getCookie(name) === value) return;
      }
      d.cookie = name + "=" + encodeURIComponent(value) + base;
    };

    var consent = !NEEDS_CONSENT || getCookie("_bfc") === "1";
    var queue = [];

    var campaignSignature = function (url) {
      try {
        var p = new URL(url).searchParams, sig = "";
        for (var i = 0; i < CAMPAIGN_KEYS.length; i++) if (p.get(CAMPAIGN_KEYS[i])) sig += CAMPAIGN_KEYS[i] + "=" + p.get(CAMPAIGN_KEYS[i]) + "&";
        return sig ? String(sig.length) + sig.slice(0, 40).replace(/[^A-Za-z0-9]/g, "") : "";
      } catch (e) {
        return "";
      }
    };

    // Visitante (1 ano) e sessão (30 min parado, ou nova campanha na URL).
    var ids = function () {
      var visitor = getCookie("_bft");
      if (!visitor || !/^[A-Za-z0-9_-]{8,64}$/.test(visitor)) visitor = rand(22);
      setCookie("_bft", visitor, 365 * 24 * 3600);
      var now = Date.now(), raw = (getCookie("_bfs") || "").split("."), sig = campaignSignature(location.href);
      var isNew = !raw[0] || !/^[A-Za-z0-9_-]{8,64}$/.test(raw[0]) || !(now - Number(raw[1]) < SESSION_MS) || (sig && sig !== raw[2]);
      var session = isNew ? rand(20) : raw[0];
      setCookie("_bfs", session + "." + now + "." + (sig || raw[2] || ""), SESSION_MS / 1000);
      return { visitor: visitor, session: session, isNew: !!isNew };
    };

    var send = function (name, data) {
      if (!consent) {
        if (queue.length < 20) queue.push([name, data, Date.now(), location.href, d.referrer]);
        return;
      }
      transmit(name, data, Date.now(), location.href, d.referrer);
    };
    var transmit = function (name, data, at, url, referrer) {
      var s = ids();
      var body = { k: KEY, v: s.visitor, s: s.session, e: at.toString(36) + "." + rand(12), n: name, t: at, u: url };
      if (referrer) body.r = referrer;
      if (s.isNew) body.nt = true;
      if (NEEDS_CONSENT) body.c = "concedido";
      if (data && typeof data === "object") body.cd = data;
      var json = JSON.stringify(body);
      try {
        if (navigator.sendBeacon && navigator.sendBeacon(ENDPOINT, new Blob([json], { type: "text/plain" }))) return;
      } catch (e) { /* segue para o fetch */ }
      try {
        fetch(ENDPOINT, { method: "POST", body: json, keepalive: true, mode: "no-cors", headers: { "Content-Type": "text/plain" } });
      } catch (e) { /* nunca quebra o site */ }
    };

    var api = function (cmd, a, b) {
      try {
        if (cmd === "track" && typeof a === "string" && /^[A-Za-z][A-Za-z0-9_]{1,49}$/.test(a)) send(a, b);
        else if (cmd === "consent") {
          consent = a !== false;
          if (consent) {
            setCookie("_bfc", "1", 365 * 24 * 3600);
            var q = queue;
            queue = [];
            for (var i = 0; i < q.length; i++) transmit(q[i][0], q[i][1], q[i][2], q[i][3], q[i][4]);
          } else {
            queue = [];
            setCookie("_bfc", "0", 365 * 24 * 3600);
          }
        }
      } catch (e) { /* nunca quebra o site */ }
    };
    var pending = (w.bf && w.bf.q) || [];
    w.bf = api;

    send("PageView");
    for (var i = 0; i < pending.length; i++) api.apply(null, pending[i]);

    // Sites de página única (troca de página sem recarregar).
    var last = location.href;
    var onNav = function () {
      if (location.href === last) return;
      var ref = last;
      last = location.href;
      if (!consent) return;
      transmit("PageView", null, Date.now(), last, ref);
    };
    var wrap = function (fn) {
      return function () {
        var r = fn.apply(this, arguments);
        setTimeout(onNav, 0);
        return r;
      };
    };
    if (history.pushState) {
      history.pushState = wrap(history.pushState);
      w.addEventListener("popstate", onNav);
    }
  } catch (e) { /* nunca quebra o site */ }
})(window, document);
