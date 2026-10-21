/* O push dos workflows de dados (scripts/ci/push-generated.sh) contra um
 * origin bare local: fusão de alterações concorrentes, regeneração dos
 * agregados, conflito real recusado, retry depois de um push perdido.
 * Os cenários vivem no test-push-generated.sh; aqui só se corre e confere. */
import { describe, it, expect } from "vitest";
import { spawnSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const temBash = spawnSync("bash", ["--version"]).status === 0;

describe.skipIf(!temBash)("push-generated.sh", () => {
  it("passa os cenários de push concorrente", () => {
    const r = spawnSync("bash", [path.join(dir, "test-push-generated.sh")], {
      encoding: "utf8",
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0", GITHUB_OUTPUT: "", GITHUB_REF_NAME: "main" },
    });
    const out = (r.stdout || "") + (r.stderr || "");
    expect(out, out).toMatch(/RESULTADO: \d+ passaram, 0 falharam/);
    expect(r.status, out).toBe(0);
  }, 120_000);
});
