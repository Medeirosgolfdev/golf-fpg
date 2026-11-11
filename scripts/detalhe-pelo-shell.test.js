import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

/**
 * Trava da unificação «todos os torneios carregados iguais» (11/11/2026, Mariana:
 * «supostamente as páginas todas são circuit shell… porquê que não são todas
 * iguais?»).
 *
 * Uma página de torneios entrega DADOS ao CircuitShell (`results`, `totals`,
 * `roundDraws`, `admissions` e, para os torneios da federação, `detail`). O
 * `renderFull` — a página a desenhar o detalhe e a escolher as abas à mão — está
 * a SAIR, página a página. Esta lista só pode ENCOLHER: quando uma página migra,
 * tira-se daqui; uma página nova nunca entra.
 */
const AINDA_COM_RENDER_FULL = [
  "src/pages/FPGPage.tsx",
  "src/pages/uskids/uskidsCircuit.tsx",
];

/** Onde o `renderFull` é definido/lido por natureza (o contrato e o shell). */
const DO_SHELL = ["src/ui/circuit/types.ts", "src/ui/circuit/CircuitShell.tsx"];

function ficheiros(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "__tests__") continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) ficheiros(p, out);
    else if (/\.tsx?$/.test(e.name) && !/\.test\./.test(e.name)) out.push(p);
  }
  return out;
}

const RAIZ = path.join(__dirname, "..");
const rel = (f) => path.relative(RAIZ, f).replace(/\\/g, "/");
/** Atribui um `renderFull` (não conta comentários nem o `renderFullKeepHeader`). */
const usaRenderFull = (s) => s.split(/\r?\n/).some((l) => !/^\s*(\/\/|\*|\/\*)/.test(l) && /\brenderFull\s*[:=]/.test(l));

describe("detalhe do torneio montado pelo shell (o renderFull está a sair)", () => {
  const usam = ficheiros(path.join(RAIZ, "src")).filter((f) => usaRenderFull(fs.readFileSync(f, "utf8"))).map(rel)
    .filter((f) => !DO_SHELL.includes(f)).sort();

  it("nenhuma página NOVA desenha o detalhe com renderFull", () => {
    expect(usam.filter((f) => !AINDA_COM_RENDER_FULL.includes(f))).toEqual([]);
  });

  it("a lista das que faltam está em dia (quem já migrou sai da lista)", () => {
    expect(AINDA_COM_RENDER_FULL.filter((f) => !usam.includes(f))).toEqual([]);
  });

  it("um só caminho: sem adaptador, e o detalhe só é chamado pelo shell", () => {
    // O adaptador IntlTournView foi apagado a 11/11/2026 — as regras das provas
    // de fora vivem dentro do TournamentDetail. Não volta.
    expect(fs.existsSync(path.join(RAIZ, "src/ui/IntlTournView.tsx"))).toBe(false);
    // (uma chamada a sério leva props: «<TournamentDetail » — não conta o nome num comentário)
    const chamam = ficheiros(path.join(RAIZ, "src")).filter((f) => /<TournamentDetail\s/.test(fs.readFileSync(f, "utf8"))).map(rel).sort();
    expect(chamam).toEqual([
      ...AINDA_COM_RENDER_FULL,              // a sair
      "src/ui/ContestLeaderboard.tsx",       // análise BJGT (fora do shell)
      "src/ui/circuit/CircuitShell.tsx",     // O sítio
    ].sort());
  });

  it("as páginas já migradas entregam o detalhe em dados (`detail`) e não o desenham", () => {
    for (const f of ["src/pages/RecentTournamentsPage.tsx", "src/pages/DrivePage.tsx", "src/pages/MajorPage.tsx"]) {
      const s = fs.readFileSync(path.join(RAIZ, f), "utf8");
      expect(/\bdetail\s*[:=]\s*\{/.test(s), f).toBe(true);
      expect(s.includes("<TournamentDetail"), f).toBe(false);
    }
  });
});
