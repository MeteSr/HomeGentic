/**
 * IconBadge — real logic worth locking down:
 *   - default badgeSize (44) and radius ("50%") apply when omitted
 *   - custom size/badgeSize/radius override the defaults
 *   - the icon component receives the given size and color
 */

import { render } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { IconBadge } from "@/components/IconBadge";
import { Home } from "lucide-react";

describe("IconBadge — defaults", () => {
  it("uses badgeSize 44 and radius 50% when omitted", () => {
    const { container } = render(<IconBadge Icon={Home} color="#fff" bg="#2B34FF" />);
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper).toHaveStyle({ width: "44px", height: "44px", borderRadius: "50%", background: "#2B34FF" });
  });

  it("passes the default icon size (20) and color to the icon", () => {
    const { container } = render(<IconBadge Icon={Home} color="#123456" bg="#fff" />);
    const svg = container.querySelector("svg")!;
    expect(svg).toHaveAttribute("width", "20");
    expect(svg).toHaveAttribute("stroke", "#123456");
  });
});

describe("IconBadge — custom sizing", () => {
  it("applies a custom size/badgeSize/radius", () => {
    const { container } = render(<IconBadge Icon={Home} color="#fff" bg="#000" size={32} badgeSize={64} radius={8} />);
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper).toHaveStyle({ width: "64px", height: "64px", borderRadius: "8px" });
    expect(container.querySelector("svg")).toHaveAttribute("width", "32");
  });
});
