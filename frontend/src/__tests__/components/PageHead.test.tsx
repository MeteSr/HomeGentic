import { render } from "@testing-library/react";
import { describe, it, expect, beforeEach } from "vitest";
import { PageHead } from "@/components/PageHead";

// Mirrors the defaults index.html ships with.
function seedIndexHtmlDefaults() {
  document.head.innerHTML = `
    <title>HomeGentic – default</title>
    <meta name="description" content="default description">
    <meta property="og:title" content="default og">
  `;
  document.title = "HomeGentic – default";
}

const meta = (attr: string, value: string) =>
  Array.from(document.head.querySelectorAll("meta")).filter((m) => m.getAttribute(attr) === value);

beforeEach(seedIndexHtmlDefaults);

describe("PageHead", () => {
  it("overwrites index.html's defaults in place instead of adding duplicates", () => {
    render(
      <PageHead>
        <title>Pricing | HomeGentic</title>
        <meta name="description" content="Plans and pricing" />
        <meta property="og:title" content="Pricing" />
      </PageHead>,
    );
    expect(document.title).toBe("Pricing | HomeGentic");
    expect(document.head.querySelectorAll("title")).toHaveLength(1);
    expect(meta("name", "description")).toHaveLength(1);
    expect(meta("name", "description")[0].getAttribute("content")).toBe("Plans and pricing");
    expect(meta("property", "og:title")[0].getAttribute("content")).toBe("Pricing");
  });

  it("restores the previous values when the page unmounts", () => {
    const { unmount } = render(
      <PageHead>
        <title>Pricing</title>
        <meta name="description" content="Plans" />
      </PageHead>,
    );
    unmount();
    expect(document.title).toBe("HomeGentic – default");
    expect(meta("name", "description")[0].getAttribute("content")).toBe("default description");
  });

  it("adds tags that don't exist yet and removes them on unmount", () => {
    const { unmount } = render(
      <PageHead>
        <link rel="canonical" href="https://homegentic.app/pricing" />
        <meta name="twitter:card" content="summary" />
      </PageHead>,
    );
    expect(document.head.querySelector("link[rel='canonical']")?.getAttribute("href")).toBe("https://homegentic.app/pricing");
    expect(meta("name", "twitter:card")).toHaveLength(1);
    unmount();
    expect(document.head.querySelector("link[rel='canonical']")).toBeNull();
    expect(meta("name", "twitter:card")).toHaveLength(0);
  });

  it("puts JSON-LD in <head> with its text content", () => {
    const { unmount } = render(
      <PageHead>
        <script type="application/ld+json">{JSON.stringify({ "@type": "FAQPage" })}</script>
      </PageHead>,
    );
    const script = document.head.querySelector("script[type='application/ld+json']");
    expect(script?.textContent).toBe('{"@type":"FAQPage"}');
    unmount();
    expect(document.head.querySelector("script[type='application/ld+json']")).toBeNull();
  });

  it("joins mixed title children into one string", () => {
    const address = "12 Oak St";
    render(<PageHead><title>{address} | HomeGentic</title></PageHead>);
    expect(document.title).toBe("12 Oak St | HomeGentic");
  });

  it("updates when the content changes and leaves no duplicates behind", () => {
    const { rerender } = render(<PageHead><title>Loading…</title><meta name="description" content="a" /></PageHead>);
    rerender(<PageHead><title>12 Oak St</title><meta name="description" content="b" /></PageHead>);
    expect(document.title).toBe("12 Oak St");
    expect(meta("name", "description")).toHaveLength(1);
    expect(meta("name", "description")[0].getAttribute("content")).toBe("b");
  });

  it("restores correctly when pages swap (outer page, then inner override)", () => {
    const outer = render(<PageHead><title>Outer</title></PageHead>);
    const inner = render(<PageHead><title>Inner</title></PageHead>);
    expect(document.title).toBe("Inner");
    inner.unmount();
    expect(document.title).toBe("Outer");
    outer.unmount();
    expect(document.title).toBe("HomeGentic – default");
  });
});
