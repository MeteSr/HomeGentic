import { describe, it, expect } from "vitest";
import { spawnSync } from "child_process";
import { mkdtempSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { createZip, crc32 } from "@/utils/zip";

const enc = new TextEncoder();

describe("createZip", () => {
  it("computes the standard CRC-32", () => {
    expect(crc32(enc.encode("123456789"))).toBe(0xcbf43926);
    expect(crc32(new Uint8Array())).toBe(0);
  });

  it("writes an archive a standard unzipper reads back byte for byte", () => {
    const photo = new Uint8Array(70_000).map((_, i) => (i * 31) % 256);
    const zip = createZip([
      { name: "data.json", data: enc.encode('{"ok":true}') },
      { name: "photos/prop-1/PHOTO_1.jpg", data: photo, modified: new Date(2026, 10, 2, 9, 30) },
      { name: "README – café.txt", data: enc.encode("hé") },
    ]);
    const file = join(mkdtempSync(join(tmpdir(), "zip-")), "t.zip");
    writeFileSync(file, zip);
    const py = `
import zipfile, sys, hashlib
z = zipfile.ZipFile(sys.argv[1])
assert z.testzip() is None
for i in z.infolist():
    d = z.read(i)
    print(i.filename, len(d), hashlib.sha256(d).hexdigest()[:16], i.date_time[:5] if i.filename.startswith("photos") else "")
`;
    const r = spawnSync("python3", ["-c", py, file], { encoding: "utf8" });
    expect(r.stderr).toBe("");
    const lines = r.stdout.trim().split("\n");
    expect(lines[0]).toMatch(/^data\.json 11 /);
    expect(lines[1]).toMatch(/^photos\/prop-1\/PHOTO_1\.jpg 70000 .* \(2026, 11, 2, 9, 30\)$/);
    expect(lines[2]).toMatch(/^README – café\.txt 3 /);
  });

  it("writes an empty archive", () => {
    expect(createZip([]).length).toBe(22);
  });
});
