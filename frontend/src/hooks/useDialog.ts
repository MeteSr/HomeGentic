import { useEffect, useRef } from "react";

/**
 * Accessibility plumbing shared by every modal and drawer (WCAG 2.1.2, 2.4.3, 4.1.2).
 *
 * Spread the returned props on the dialog *panel* (not the backdrop):
 *
 *   const dialog = useDialog(isOpen, onClose, { label: "Add room" });
 *   <div {...dialog} style={...}>…</div>
 *
 * While open it:
 *  - moves focus into the panel (the first `[data-autofocus]` element, else the
 *    panel itself) and returns it to whatever had focus when it closes;
 *  - keeps Tab / Shift+Tab inside the panel;
 *  - closes on Escape — only the topmost dialog when several are stacked.
 *
 * Pass `onClose` as undefined for dialogs that must not be dismissed (e.g. a
 * payment in progress); Escape then does nothing.
 */

const FOCUSABLE =
  'a[href], area[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), ' +
  'select:not([disabled]), textarea:not([disabled]), iframe, [tabindex]:not([tabindex="-1"]), ' +
  '[contenteditable="true"]';

// Open dialogs in the order they opened. Only the topmost reacts to Escape and Tab.
const stack: HTMLElement[] = [];

// The most recently opened dialog, or a dialog nested inside it (a nested one
// mounted in the same render registers first, because child effects run first).
function topmost(): HTMLElement | undefined {
  let top = stack[stack.length - 1];
  for (let moved = true; moved && top; ) {
    moved = false;
    for (const p of stack) if (p !== top && top.contains(p)) { top = p; moved = true; break; }
  }
  return top;
}

export interface DialogOptions {
  /** Accessible name when there is no visible heading to point at. */
  label?: string;
  /** id of the visible heading that names the dialog. Preferred over `label`. */
  labelledBy?: string;
  /** "alertdialog" for confirmations that interrupt the user. */
  role?: "dialog" | "alertdialog";
}

export function useDialog(open: boolean, onClose: (() => void) | undefined, options: DialogOptions = {}) {
  const ref = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const panel = ref.current;
    if (!panel) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    stack.push(panel);

    const initial = panel.querySelector<HTMLElement>("[data-autofocus]") ?? panel;
    // preventScroll: the panel may sit below a scrolled page on phones.
    initial.focus({ preventScroll: true });

    const onKeyDown = (e: KeyboardEvent) => {
      if (topmost() !== panel) return;
      if (e.key === "Escape") {
        if (onCloseRef.current) {
          e.stopPropagation();
          onCloseRef.current();
        }
        return;
      }
      if (e.key !== "Tab") return;
      const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE))
        .filter((el) => el.offsetParent !== null || el === document.activeElement);
      if (items.length === 0) { e.preventDefault(); panel.focus(); return; }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || active === panel || !panel.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !panel.contains(active))) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      const i = stack.lastIndexOf(panel);
      if (i !== -1) stack.splice(i, 1);
      if (previouslyFocused && document.contains(previouslyFocused)) {
        previouslyFocused.focus({ preventScroll: true });
      }
    };
  }, [open]);

  return {
    ref,
    role: options.role ?? "dialog",
    "aria-modal": true as const,
    "aria-label": options.labelledBy ? undefined : options.label,
    "aria-labelledby": options.labelledBy,
    tabIndex: -1,
  };
}
