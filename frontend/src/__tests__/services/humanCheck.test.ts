/**
 * humanCheck.ts — the one-time Turnstile dialog before free AI calls (CD-1).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { ensureHuman } from "@/services/humanCheck";

let solve: ((token: string) => void) | null = null;
const render = vi.fn((_el: HTMLElement, opts: { sitekey: string; callback: (t: string) => void }) => {
  solve = opts.callback;
  return "widget-1";
});
const remove = vi.fn();

beforeEach(() => {
  solve = null;
  render.mockClear();
  remove.mockClear();
  (window as any).turnstile = { render, remove };
});
afterEach(() => {
  delete (window as any).turnstile;
  document.body.innerHTML = "";
});

const flush = () => new Promise((r) => setTimeout(r, 0));

describe("ensureHuman", () => {
  it("shows a labelled dialog, renders the widget with the site key and verifies the token", async () => {
    const verify = vi.fn(async () => true);
    const p = ensureHuman("site-1", verify);
    await flush();
    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog?.getAttribute("aria-modal")).toBe("true");
    expect(document.getElementById(dialog!.getAttribute("aria-labelledby")!)?.textContent).toBe("Quick check");
    expect(render.mock.calls[0][1].sitekey).toBe("site-1");
    solve!("ts-token");
    expect(await p).toBe(true);
    expect(verify).toHaveBeenCalledWith("ts-token");
    expect(remove).toHaveBeenCalledWith("widget-1");
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it("resolves false without verifying when the user presses Escape", async () => {
    const verify = vi.fn(async () => true);
    const p = ensureHuman("site-1", verify);
    await flush();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(await p).toBe(false);
    expect(verify).not.toHaveBeenCalled();
  });

  it("shares one dialog between concurrent callers", async () => {
    const verify = vi.fn(async () => true);
    const a = ensureHuman("site-1", verify);
    const b = ensureHuman("site-1", verify);
    await flush();
    expect(document.querySelectorAll('[role="dialog"]').length).toBe(1);
    solve!("t");
    expect(await Promise.all([a, b])).toEqual([true, true]);
    expect(verify).toHaveBeenCalledTimes(1);
  });
});
