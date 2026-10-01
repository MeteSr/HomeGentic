/**
 * Push service worker — shows HomeGentic push notifications and opens the
 * right page when one is clicked. Registered by services/pushNotifications.ts.
 *
 * Payload (from agents/notifications/vapidDispatcher.ts):
 *   { title: string, body: string, route?: string }
 * route is the same deep link the mobile app uses ("jobs/JOB_1", "leads",
 * "leads/REQ_1"); routeToPath maps it onto a web page.
 */
/* eslint-disable no-restricted-globals */

function routeToPath(route) {
  if (typeof route !== "string") return "/dashboard";
  if (route === "jobs" || route.startsWith("jobs/")) return "/jobs";
  if (route === "leads" || route.startsWith("leads/")) return "/contractor-dashboard";
  return "/dashboard";
}

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "HomeGentic", body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "HomeGentic", {
      body: data.body || "",
      data: { path: routeToPath(data.route) },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const path = (event.notification.data && event.notification.data.path) || "/dashboard";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      for (const w of windows) {
        if (new URL(w.url).origin === self.location.origin && "focus" in w) {
          w.navigate(path);
          return w.focus();
        }
      }
      return self.clients.openWindow(path);
    }),
  );
});
