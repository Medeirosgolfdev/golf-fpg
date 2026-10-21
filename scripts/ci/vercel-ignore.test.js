/* Regra do «Ignored Build Step» do Vercel: errar para o lado de saltar um
 * deploy com public/ deixaria o site desactualizado — por isso testa-se. */
import { describe, it, expect } from "vitest";
import { createRequire } from "module";
const { deveIgnorar } = createRequire(import.meta.url)("./vercel-ignore.js");

describe("vercel-ignore — deveIgnorar", () => {
  it("salta commits só de data-archive/, docs/, .github/ e testes", () => {
    expect(deveIgnorar(["data-archive/analytics/2026-10-20.json"])).toBe(true);
    expect(deveIgnorar(["docs/claude/workflows.md", ".github/workflows/update-data.yml"])).toBe(true);
    expect(deveIgnorar(["scripts/lib/digest-extract.test.js", "scripts/ci/push-generated.sh"])).toBe(true);
    expect(deveIgnorar(["data-archive/uskids-rich-players/1.json", "data-archive/uskids-rich-run-summary.json"])).toBe(true);
    expect(deveIgnorar(["scripts/fcg-scope.json", "scripts/draw-mail-processed.json"])).toBe(true);
    expect(deveIgnorar(["CLAUDE.md", "docs/x.md", "ranking-pja/README.md"])).toBe(true);
  });

  it("faz deploy quando algo do site muda", () => {
    expect(deveIgnorar(["data-archive/x.json", "public/data/juniors.json"])).toBe(false);
    expect(deveIgnorar(["src/App.tsx"])).toBe(false);
    expect(deveIgnorar(["api/datagolf.js"])).toBe(false);
    expect(deveIgnorar(["lib/process-data.js"])).toBe(false);
    expect(deveIgnorar(["output/52884/analysis/data.json"])).toBe(false);
    expect(deveIgnorar(["ranking-pja/pja-rules.mjs"])).toBe(false); // importado pelo src
    expect(deveIgnorar(["shared/tee-colors.json"])).toBe(false);
    expect(deveIgnorar(["package.json"])).toBe(false);
    expect(deveIgnorar(["vercel.json"])).toBe(false);
    expect(deveIgnorar(["public/docs/guia.md"])).toBe(false); // markdown servido
    expect(deveIgnorar(["scripts/build-ics.js"])).toBe(false); // corre no prebuild
    expect(deveIgnorar(["scripts/prune-deploy-output.js"])).toBe(false);
    expect(deveIgnorar(["scripts/lib/whs.cjs"])).toBe(false);
  });

  it("sem ficheiros (commit vazio, base desconhecida) → deploy", () => {
    expect(deveIgnorar([])).toBe(false);
    expect(deveIgnorar([""])).toBe(false);
  });
});
