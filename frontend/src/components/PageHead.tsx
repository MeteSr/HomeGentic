import { Children, isValidElement, useLayoutEffect, type ReactElement, type ReactNode } from "react";

/**
 * Per-page <head> tags: <title>, <meta name|property>, <link rel> and
 * <script type="application/ld+json">. Replaces react-helmet-async.
 *
 * Why not React 19's native <title>/<meta> hoisting: it appends new tags but
 * leaves index.html's defaults in place, and browsers and crawlers read the
 * first <title>/description. Like Helmet, this updates the matching existing
 * tag in place and restores it when the page unmounts.
 */

type HeadProps = Record<string, unknown> & { children?: ReactNode };

function textOf(children: ReactNode): string {
  return Children.toArray(children).map((c) => (typeof c === "string" || typeof c === "number" ? String(c) : "")).join("");
}

/** The existing tag this element should overwrite, if it has a stable identity. */
function findExisting(tag: string, props: HeadProps): Element | null {
  const key = tag === "meta" ? (props.name != null ? "name" : props.property != null ? "property" : null)
            : tag === "link" ? "rel"
            : null;
  if (!key) return null;
  const want = String(props[key]);
  for (const el of Array.from(document.head.getElementsByTagName(tag))) {
    if (el.getAttribute(key) === want) return el;
  }
  return null;
}

function setAttributes(el: Element, props: HeadProps) {
  for (const [k, v] of Object.entries(props)) {
    if (k === "children" || v == null) continue;
    el.setAttribute(k === "httpEquiv" ? "http-equiv" : k === "charSet" ? "charset" : k, String(v));
  }
}

function apply(el: ReactElement<HeadProps>): () => void {
  const tag = el.type as string;
  const props = el.props;

  if (tag === "title") {
    const prev = document.title;
    document.title = textOf(props.children);
    return () => { document.title = prev; };
  }

  const existing = tag === "script" ? null : findExisting(tag, props);
  if (existing) {
    const prev = Array.from(existing.attributes).map((a) => [a.name, a.value] as const);
    setAttributes(existing, props);
    return () => {
      for (const a of Array.from(existing.attributes)) existing.removeAttribute(a.name);
      for (const [n, v] of prev) existing.setAttribute(n, v);
    };
  }

  const created = document.createElement(tag);
  setAttributes(created, props);
  if (tag === "script") created.textContent = textOf(props.children);
  document.head.appendChild(created);
  return () => created.remove();
}

export function PageHead({ children }: { children: ReactNode }) {
  const elements = Children.toArray(children).filter(
    (c): c is ReactElement<HeadProps> => isValidElement(c) && typeof c.type === "string",
  );
  // Re-apply only when the tags' content changes, not on every render.
  const signature = JSON.stringify(elements.map((e) => [e.type, e.props]));

  useLayoutEffect(() => {
    const restores = elements.map(apply);
    return () => { for (const restore of restores.reverse()) restore(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  return null;
}
