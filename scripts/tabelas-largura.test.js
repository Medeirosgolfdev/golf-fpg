import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

/**
 * Trava: as tabelas `.dtable` ocupam a largura toda (regra do `.dtable` no
 * App.css). 04/11/2026, Mariana: «temos tabelas que se adaptam ao tamanho da
 * janela e outras que não… eu não gosto disto» — havia 7 com `u-w-auto`.
 */
function tsxFiles(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) tsxFiles(p, out);
    else if (e.name.endsWith(".tsx")) out.push(p);
  }
  return out;
}

describe("tabelas à largura toda", () => {
  it("nenhuma .dtable encolhe para o conteúdo (u-w-auto)", () => {
    const maus = [];
    for (const f of tsxFiles(path.join(__dirname, "..", "src"))) {
      const s = fs.readFileSync(f, "utf8");
      for (const m of s.matchAll(/className="([^"]*)"/g)) {
        const cls = m[1].split(/\s+/);
        if (cls.includes("dtable") && cls.includes("u-w-auto")) maus.push(path.relative(process.cwd(), f));
      }
    }
    expect(maus).toEqual([]);
  });
});
