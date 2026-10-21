import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const { buildIndex } = require("./build-fpg-files-index.js");
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("build-fpg-files-index", () => {
  it("separa as séries, ordena e ignora o resto", () => {
    const idx = buildIndex([
      "pull-torneios001.json", "pull-torneios000.json", "pull-torneios.json",
      "drive-data-2026-02.json", "drive-data-2026-01.json",
      "aquapor-data-2026-10.json", "aquapor-data-2026-1.json",
      "CLUBES2026.json", "fpg-files-index.json",
    ]);
    expect(idx["pull-torneios"]).toEqual(["pull-torneios000.json", "pull-torneios001.json"]);
    expect(idx["drive-data"]).toEqual(["drive-data-2026-01.json", "drive-data-2026-02.json"]);
    expect(idx["aquapor-data"]).toEqual(["aquapor-data-2026-10.json"]);
  });

  it("corre no predev e no prebuild (o Vercel gera o índice em cada deploy)", () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
    expect(pkg.scripts.prebuild).toContain("build-fpg-files-index.js");
    expect(pkg.scripts.predev).toContain("build-fpg-files-index.js");
  });
});
