/*
 * Backstage Flow — service worker só para as notificações da Central (36.17).
 * Recebe o aviso do servidor (Web Push) e mostra a notificação no computador ou no celular.
 * Não guarda nada em cache (o site continua funcionando como sempre).
 */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = {}; }
  const title = data.title || "Backstage Flow";
  event.waitUntil(self.registration.showNotification(title, {
    body: data.body || "",
    icon: "/favicon.png",
    badge: "/favicon.png",
    tag: data.tag || "backstage",
    renotify: true,
    requireInteraction: true,
    data: { url: data.url || "/operacoes/tarefas" },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/operacoes/tarefas", self.location.origin);
  if (url.origin !== self.location.origin) return; // só abre o próprio CRM
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of all) {
      if (new URL(c.url).origin === url.origin) {
        await c.focus();
        if ("navigate" in c) await c.navigate(url.href);
        return;
      }
    }
    await self.clients.openWindow(url.href);
  })());
});
