/**
 * One-time human check before free AI calls (cycle-drain audit CD-1).
 *
 * When the voice Worker answers 403 `human_verification_required`, it includes
 * the Cloudflare Turnstile site key. We show the Turnstile widget in a small
 * dialog, post the token to /api/human/verify with the caller's session, and
 * the Worker remembers the account as human for a year. Concurrent AI calls
 * share one dialog.
 */

const TURNSTILE_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

interface TurnstileApi {
  render(
    el: HTMLElement,
    opts: {
      sitekey: string;
      callback: (token: string) => void;
      "error-callback"?: () => void;
      "expired-callback"?: () => void;
    },
  ): string;
  remove(widgetId: string): void;
}

let scriptLoad: Promise<TurnstileApi> | null = null;

function loadTurnstile(): Promise<TurnstileApi> {
  const w = window as unknown as { turnstile?: TurnstileApi };
  if (w.turnstile) return Promise.resolve(w.turnstile);
  if (!scriptLoad) {
    scriptLoad = new Promise<TurnstileApi>((resolve, reject) => {
      const s = document.createElement("script");
      s.src = TURNSTILE_SRC;
      s.async = true;
      s.onload = () => (w.turnstile ? resolve(w.turnstile) : reject(new Error("Turnstile did not load")));
      s.onerror = () => {
        scriptLoad = null;
        reject(new Error("Turnstile did not load"));
      };
      document.head.appendChild(s);
    });
  }
  return scriptLoad;
}

/** Show the dialog and resolve with a Turnstile token, or null if the user closes it. */
function askForToken(siteKey: string): Promise<string | null> {
  return new Promise((resolve) => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const backdrop = document.createElement("div");
    backdrop.setAttribute(
      "style",
      "position:fixed;inset:0;background:rgba(11,13,26,0.55);display:flex;align-items:center;justify-content:center;z-index:10000;",
    );
    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.setAttribute("aria-labelledby", "hg-human-check-title");
    dialog.setAttribute(
      "style",
      "background:#fff;color:#0B0D1A;border-radius:16px;padding:24px;max-width:360px;width:calc(100% - 32px);font-family:'Hanken Grotesk',system-ui,sans-serif;box-shadow:0 12px 40px rgba(0,0,0,0.25);",
    );
    const title = document.createElement("h2");
    title.id = "hg-human-check-title";
    title.textContent = "Quick check";
    title.setAttribute(
      "style",
      "margin:0 0 8px;font-size:20px;font-family:'Bricolage Grotesque',system-ui,sans-serif;",
    );
    const text = document.createElement("p");
    text.textContent =
      "Before you use the AI assistant, please confirm you're a person. You'll only need to do this once.";
    text.setAttribute("style", "margin:0 0 16px;line-height:1.5;font-size:15px;");
    const widget = document.createElement("div");
    widget.setAttribute("style", "min-height:65px;margin-bottom:16px;");
    const status = document.createElement("p");
    status.setAttribute("role", "status");
    status.setAttribute("style", "margin:0 0 12px;font-size:14px;color:#B42318;");
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.textContent = "Cancel";
    cancel.setAttribute(
      "style",
      "border:1px solid #0B0D1A;background:#fff;color:#0B0D1A;border-radius:100px;padding:8px 18px;font-size:15px;cursor:pointer;",
    );
    dialog.append(title, text, widget, status, cancel);
    backdrop.appendChild(dialog);
    document.body.appendChild(backdrop);
    cancel.focus();

    let widgetId: string | null = null;
    let api: TurnstileApi | null = null;
    const finish = (token: string | null) => {
      document.removeEventListener("keydown", onKey);
      if (api && widgetId) {
        try {
          api.remove(widgetId);
        } catch {
          /* already gone */
        }
      }
      backdrop.remove();
      previousFocus?.focus?.();
      resolve(token);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") finish(null);
    };
    document.addEventListener("keydown", onKey);
    cancel.addEventListener("click", () => finish(null));

    loadTurnstile()
      .then((t) => {
        api = t;
        widgetId = t.render(widget, {
          sitekey: siteKey,
          callback: (token) => finish(token),
          "error-callback": () => {
            status.textContent = "The check didn't load. Please try again.";
          },
          "expired-callback": () => {
            status.textContent = "The check expired. Please try again.";
          },
        });
      })
      .catch(() => {
        status.textContent = "The check couldn't load. Check your connection and try again.";
      });
  });
}

let inflight: Promise<boolean> | null = null;

/**
 * Run the human check once (shared between concurrent callers). `verify`
 * posts the token to the Worker; resolves true when the Worker accepted it.
 */
export function ensureHuman(siteKey: string, verify: (token: string) => Promise<boolean>): Promise<boolean> {
  if (!inflight) {
    inflight = askForToken(siteKey)
      .then((token) => (token ? verify(token) : false))
      .catch(() => false)
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}
