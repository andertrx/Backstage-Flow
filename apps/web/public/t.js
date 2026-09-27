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

    // ---- Dados de contato: normalizados e cifrados (SHA-256) AQUI, no navegador.
    // Mesmas regras de packages/shared/src/tracking/identity.ts (normalizeLead*) (padrão do Meta).
    // O texto legível nunca é enviado. Site sem https (sem crypto.subtle): nada vai.
    var CONVERSIONS = { Lead: 1, CompleteRegistration: 1, SubmitApplication: 1, Schedule: 1, Purchase: 1 };
    var NOT_LETTER;
    try { NOT_LETTER = new RegExp("[^\\p{L}]", "gu"); } catch (e) { NOT_LETTER = /[^a-z\u00c0-\u024f]/g; }
    var norm = {
      em: function (v) { var t = String(v || "").trim().toLowerCase(); return /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/.test(t) && t.length <= 254 ? t : null; },
      ph: function (v) {
        var raw = String(v || ""), intl = /^\s*(\+|00)/.test(raw), n = raw.replace(/\D/g, "").replace(/^0+/, "");
        if (!intl && (n.length === 10 || n.length === 11)) n = "55" + n;
        return n.length >= 11 && n.length <= 15 ? n : null;
      },
      nm: function (v) { var t = String(v || "").trim().toLowerCase(); if (t.normalize) t = t.normalize("NFC"); t = t.replace(NOT_LETTER, ""); return t ? t.slice(0, 100) : null; }
    };
    var canHash = !!(w.crypto && w.crypto.subtle && w.TextEncoder);
    var hashCache = {};
    var sha = function (text) {
      if (hashCache[text]) return Promise.resolve(hashCache[text]);
      return w.crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)).then(function (buf) {
        var a = new Uint8Array(buf), h = "";
        for (var i = 0; i < a.length; i++) h += (a[i] < 16 ? "0" : "") + a[i].toString(16);
        hashCache[text] = h;
        return h;
      });
    };
    // {email, phone, first_name, last_name | name} → {em, ph, fn, ln} já normalizados (texto).
    var plainUser = function (u) {
      if (!u || typeof u !== "object") return {};
      var first = u.first_name || u.firstName, last = u.last_name || u.lastName;
      if (!first && u.name) {
        var parts = String(u.name).trim().split(/\s+/);
        first = parts[0];
        if (!last && parts.length > 1) last = parts[parts.length - 1];
      }
      var p = { em: norm.em(u.email), ph: norm.ph(u.phone), fn: norm.nm(first), ln: norm.nm(last) }, out = {};
      for (var k in p) if (p[k]) out[k] = p[k];
      return out;
    };
    // Já cifrado antes (ex.: ao sair do campo)? Então dá para enviar na hora, mesmo com a página indo embora.
    var hashNow = function (plain) {
      var out = {}, n = 0;
      for (var k in plain) { if (!hashCache[plain[k]]) return null; out[k] = hashCache[plain[k]]; n++; }
      return n ? out : null;
    };
    var hashUser = function (u) {
      var plain = plainUser(u), keys = [], jobs = [];
      if (!canHash) return Promise.resolve(null);
      for (var k in plain) { keys.push(k); jobs.push(sha(plain[k])); }
      return Promise.all(jobs).then(function (h) {
        if (!h.length) return null;
        var out = {};
        for (var i = 0; i < h.length; i++) out[keys[i]] = h[i];
        return out;
      });
    };
    var identity = null;
    try { if (consent) identity = JSON.parse(sessionStorage.getItem("_bfu") || "null"); } catch (e) { identity = null; }

    // ---- Meta: cookies _fbp/_fbc (mesmo formato do Pixel), para a API de Conversoes
    // reconhecer o clique no anuncio. Com data-pixel="ID", o Pixel do navegador tambem
    // dispara, com o MESMO event_id (o Meta junta os dois e conta uma vez so).
    var PIXEL = el.getAttribute("data-pixel");
    if (PIXEL && !/^\d{5,20}$/.test(PIXEL)) PIXEL = null;
    var FB_DAYS = 90 * 24 * 3600;
    var fbIds = function () {
      var fbp = getCookie("_fbp"), fbc = getCookie("_fbc"), now = Date.now(), clid = null;
      if (!fbp || !/^fb\.\d\.\d+\.\d+$/.test(fbp)) {
        fbp = "fb.1." + now + "." + String(Math.floor(Math.random() * 9e9) + 1e9);
        setCookie("_fbp", fbp, FB_DAYS);
      }
      try { clid = new URL(location.href).searchParams.get("fbclid"); } catch (e) { clid = null; }
      if (clid && /^[\x21-\x7e]{1,480}$/.test(clid) && (!fbc || fbc.split(".").slice(3).join(".") !== clid)) {
        fbc = "fb.1." + now + "." + clid;
        setCookie("_fbc", fbc, FB_DAYS);
      }
      return { fbp: fbp, fbc: fbc };
    };
    var STANDARD = { PageView: 1, ViewContent: 1, Contact: 1, Lead: 1, CompleteRegistration: 1, SubmitApplication: 1, Schedule: 1, AddToCart: 1, InitiateCheckout: 1, Purchase: 1 };
    var pixelStarted = false;
    var firePixel = function (name, data, eventId) {
      if (!PIXEL) return;
      try {
        if (!pixelStarted) {
          pixelStarted = true;
          if (!w.fbq) {
            var n = w.fbq = function () { if (n.callMethod) n.callMethod.apply(n, arguments); else n.queue.push(arguments); };
            if (!w._fbq) w._fbq = n;
            n.push = n; n.loaded = true; n.version = "2.0"; n.queue = [];
            var sc = d.createElement("script");
            sc.async = true;
            sc.src = "https://connect.facebook.net/en_US/fbevents.js";
            (d.head || d.documentElement).appendChild(sc);
          }
          w.fbq("init", PIXEL);
        }
        var pd = {};
        if (data && typeof data === "object") for (var k in data) if (typeof data[k] !== "object") pd[k === "transaction_id" ? "order_id" : k] = data[k];
        w.fbq(STANDARD[name] ? "track" : "trackCustom", name, pd, { eventID: eventId });
      } catch (e) { /* nunca quebra o site */ }
    };

    var send = function (name, data, ud) {
      if (!consent) {
        if (queue.length < 20) queue.push([name, data, Date.now(), location.href, d.referrer, ud]);
        return;
      }
      transmit(name, data, Date.now(), location.href, d.referrer, ud);
    };
    var transmit = function (name, data, at, url, referrer, ud) {
      var s = ids();
      var body = { k: KEY, v: s.visitor, s: s.session, e: at.toString(36) + "." + rand(12), n: name, t: at, u: url };
      if (referrer) body.r = referrer;
      if (s.isNew) body.nt = true;
      if (NEEDS_CONSENT) body.c = "concedido";
      if (data && typeof data === "object") body.cd = data;
      if (!ud && CONVERSIONS[name] && identity) ud = identity;
      if (ud) body.ud = ud;
      var fb = fbIds();
      body.fbp = fb.fbp;
      if (fb.fbc) body.fbc = fb.fbc;
      firePixel(name, data, body.e);
      var json = JSON.stringify(body);
      try {
        if (navigator.sendBeacon && navigator.sendBeacon(ENDPOINT, new Blob([json], { type: "text/plain" }))) return;
      } catch (e) { /* segue para o fetch */ }
      try {
        fetch(ENDPOINT, { method: "POST", body: json, keepalive: true, mode: "no-cors", headers: { "Content-Type": "text/plain" } });
      } catch (e) { /* nunca quebra o site */ }
    };
    var track = function (name, data, user) {
      if (!user) return send(name, data);
      var ready = canHash ? hashNow(plainUser(user)) : null;
      if (ready || !canHash) return send(name, data, ready);
      hashUser(user).then(function (ud) { send(name, data, ud); }, function () { send(name, data); });
    };

    var api = function (cmd, a, b, c) {
      try {
        if (cmd === "track" && typeof a === "string" && /^[A-Za-z][A-Za-z0-9_]{1,49}$/.test(a)) track(a, b, c);
        else if (cmd === "identify") {
          hashUser(a).then(function (ud) {
            if (!ud) return;
            identity = identity || {};
            for (var k in ud) identity[k] = ud[k];
            try { if (consent) sessionStorage.setItem("_bfu", JSON.stringify(identity)); } catch (e) { /* sem armazenamento */ }
          });
        } else if (cmd === "consent") {
          consent = a !== false;
          if (consent) {
            setCookie("_bfc", "1", 365 * 24 * 3600);
            var q = queue;
            queue = [];
            for (var i = 0; i < q.length; i++) transmit(q[i][0], q[i][1], q[i][2], q[i][3], q[i][4], q[i][5]);
          } else {
            queue = [];
            identity = null;
            try { sessionStorage.removeItem("_bfu"); } catch (e) { /* sem armazenamento */ }
            setCookie("_bfc", "0", 365 * 24 * 3600);
          }
        }
      } catch (e) { /* nunca quebra o site */ }
    };
    var pending = (w.bf && w.bf.q) || [];
    w.bf = api;

    // ---- Formulários (só com data-forms="lead"): envio com e-mail ou telefone = Lead.
    var fieldKind = function (inp) {
      var t = (inp.type || "").toLowerCase();
      if (t === "password" || t === "hidden" || t === "checkbox" || t === "radio" || t === "submit") return null;
      var n = ((inp.name || "") + " " + (inp.id || "") + " " + (inp.getAttribute("autocomplete") || "")).toLowerCase();
      if (t === "email" || /e-?mail/.test(n)) return "email";
      if (t === "tel" || /(phone|fone|tel|celular|whats)/.test(n)) return "phone";
      if (/(first|given|primeiro)/.test(n)) return "first_name";
      if (/(last|family|sobrenome|surname)/.test(n)) return "last_name";
      if (/(^|[\s_-])(nome|name|full)/.test(n)) return "name";
      return null;
    };
    if (el.getAttribute("data-forms") === "lead") {
      // Cifra ao sair do campo: no envio o hash já está pronto (a página pode ir embora logo depois).
      d.addEventListener("change", function (ev) {
        try {
          var k = ev.target && ev.target.tagName === "INPUT" ? fieldKind(ev.target) : null;
          if (k && canHash) { var u = {}; u[k] = ev.target.value; hashUser(u); }
        } catch (e) { /* nunca quebra o site */ }
      }, true);
      d.addEventListener("submit", function (ev) {
        try {
          var f = ev.target, u = {}, found = false;
          if (!f || !f.elements) return;
          for (var i = 0; i < f.elements.length; i++) {
            var inp = f.elements[i], k = inp.tagName === "INPUT" ? fieldKind(inp) : null;
            if (k && inp.value && !u[k]) {
              u[k] = inp.value;
              if (k === "email" || k === "phone") found = true;
            }
          }
          if (!found) return;
          track("Lead", { formulario: (f.getAttribute("id") || f.getAttribute("name") || "sem_nome").slice(0, 80) }, u);
        } catch (e) { /* nunca quebra o site */ }
      }, true);
    }

    // ---- Clique para o WhatsApp = Contact (desligar com data-whatsapp="off").
    if (el.getAttribute("data-whatsapp") !== "off") {
      d.addEventListener("click", function (ev) {
        try {
          var a = ev.target && ev.target.closest ? ev.target.closest("a[href]") : null;
          if (a && /^(https?:\/\/)?(wa\.me|api\.whatsapp\.com|web\.whatsapp\.com)(\/|$|\?)|^whatsapp:/i.test(a.getAttribute("href") || "")) {
            send("Contact", { canal: "whatsapp" });
          }
        } catch (e) { /* nunca quebra o site */ }
      }, true);
    }

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
