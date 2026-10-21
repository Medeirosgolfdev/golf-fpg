import { describe, it, expect } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const { compactDir } = require("./compact-deploy-json.js");

describe("compact-deploy-json", () => {
  it("compacta os .json (recursivo), deixa os inválidos e os outros ficheiros", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "compact-json-"));
    try {
      fs.mkdirSync(path.join(dir, "data", "sub"), { recursive: true });
      const obj = { a: [1, 2, { b: "ção" }], c: null };
      fs.writeFileSync(path.join(dir, "data", "x.json"), JSON.stringify(obj, null, 2));
      fs.writeFileSync(path.join(dir, "data", "sub", "y.json"), "[\n  1,\n  2\n]\n");
      fs.writeFileSync(path.join(dir, "data", "partido.json"), "{\n  \"a\": ");
      fs.writeFileSync(path.join(dir, "data", "nota.txt"), "{\n  \"a\": 1\n}");

      const r = compactDir(dir);
      expect(r.files).toBe(3);
      expect(r.compacted).toBe(2);
      expect(r.skipped).toBe(1);
      expect(fs.readFileSync(path.join(dir, "data", "x.json"), "utf8")).toBe(JSON.stringify(obj));
      expect(fs.readFileSync(path.join(dir, "data", "sub", "y.json"), "utf8")).toBe("[1,2]");
      expect(fs.readFileSync(path.join(dir, "data", "partido.json"), "utf8")).toBe("{\n  \"a\": ");
      expect(fs.readFileSync(path.join(dir, "data", "nota.txt"), "utf8")).toBe("{\n  \"a\": 1\n}");
      expect(r.after).toBeLessThan(r.before);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
