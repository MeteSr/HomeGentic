import { describe, it, expect, vi } from "vitest";
import { csvCell, downloadText } from "@/utils/csv";

describe("csvCell", () => {
  it("quotes cells with commas, quotes or line breaks", () => {
    expect(csvCell("plain")).toBe("plain");
    expect(csvCell('a, "b"')).toBe('"a, ""b"""');
    expect(csvCell("a\nb")).toBe('"a\nb"');
  });

  it("stops a spreadsheet from running a cell as a formula", () => {
    expect(csvCell("=SUM(A1)")).toBe("'=SUM(A1)");
    expect(csvCell("-1")).toBe("'-1");
    expect(csvCell("@x")).toBe("'@x");
  });
});

describe("downloadText", () => {
  it("saves the text under the given file name", () => {
    const createObjectURL = vi.fn(() => "blob:x");
    const revokeObjectURL = vi.fn();
    Object.assign(URL, { createObjectURL, revokeObjectURL });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      expect(this.download).toBe("inventory.csv");
      expect(this.href).toBe("blob:x");
    });
    downloadText("a,b", "inventory.csv");
    expect(click).toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:x");
    click.mockRestore();
  });
});
