/**
 * Badge — real logic worth locking down:
 *   - defaults to the "default"/"md" style when no variant/size given
 *   - each variant maps to its own background/color/border
 *   - legacy aliases (success/warning/error/info) resolve to the same
 *     styles as their V2 semantic counterparts
 *   - size controls padding/fontSize
 */

import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { Badge } from "@/components/Badge";

describe("Badge — defaults", () => {
  it("uses the default variant and md size when none given", () => {
    render(<Badge>Text</Badge>);
    const el = screen.getByText("Text");
    expect(el).toHaveStyle({ backgroundColor: "rgb(247, 248, 251)", color: "rgb(107, 112, 128)" });
    expect(el).toHaveStyle({ padding: "0.2rem 0.625rem", fontSize: "0.65rem" });
  });
});

describe("Badge — variants", () => {
  it("applies the verified variant style", () => {
    render(<Badge variant="verified">Verified</Badge>);
    expect(screen.getByText("Verified")).toHaveStyle({ color: "rgb(43, 52, 255)" });
  });

  it("applies the risk variant style", () => {
    render(<Badge variant="risk">Risk</Badge>);
    expect(screen.getByText("Risk")).toHaveStyle({ backgroundColor: "rgb(255, 232, 227)" });
  });

  it("resolves legacy aliases to the same colors as their V2 counterparts", () => {
    render(<Badge variant="success">Success</Badge>);
    expect(screen.getByText("Success")).toHaveStyle({ color: "rgb(43, 52, 255)" });

    render(<Badge variant="error">Error</Badge>);
    expect(screen.getByText("Error")).toHaveStyle({ backgroundColor: "rgb(255, 232, 227)" });
  });
});

describe("Badge — sizes", () => {
  it("applies smaller padding/font for size sm", () => {
    render(<Badge size="sm">Small</Badge>);
    expect(screen.getByText("Small")).toHaveStyle({ padding: "0.1rem 0.5rem", fontSize: "0.6rem" });
  });

  it("applies larger padding/font for size lg", () => {
    render(<Badge size="lg">Large</Badge>);
    expect(screen.getByText("Large")).toHaveStyle({ padding: "0.3rem 0.75rem", fontSize: "0.75rem" });
  });
});
