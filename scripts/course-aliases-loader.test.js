/**
 * A canonização de nomes de campo vive SÓ em src/utils/courseAliases.ts. Os
 * scripts Node (scripts/lib/course-aliases.cjs) e o pipeline (lib/course-aliases.js)
 * carregam esse ficheiro — o que só funciona com Node ≥ 22.18. Este teste corre
 * um Node a sério (não o do vitest), como o whs-loader.test.js, e confirma que
 * as três portas dão exactamente o mesmo resultado que o site.
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { describe, it, expect } from "vitest";
import * as site from "../src/utils/courseAliases";

const NOMES = [
  "PGA Aroeira No.2 - CNJ FPG", "PGA  Aroeira No.2 — CNJ FPG", "X - CN", "Y — CNS FPG", "Aroeira Challenge",
  "Aroeira I", "aroeira pines classic", "Tróia", "troia", "Porto Santo", "Santo Estevão", "Oceânico Faldo",
  "Oceânico O'Connor", "Oeiras", "Oeiras Golf", "Golf Val d'Europe", "golf paris val d'europe disneyland - red/blue",
  "Vila Sol (Prestige / Prime)", "Vila Sol - Prestige", "Pinheiros Altos - Olives/Pines", "Castro Marim - Grouse",
  "Ribagolfe I", "Ribagolfe II", "Santo da Serra - Serras-Machico", "Sto da Serra - Machico/Serras",
  "S. da Serra - Desertas", "Penha Longa - Atlântico", "Campo Inexistente", "",
];
const PARS = [
  [4, 5, 4, 5, 3, 4, 4, 3, 4, 4, 5, 3, 4, 3, 4, 4, 4, 5], // Aroeira No.2 antiga
  [5, 4, 4, 3, 4, 4, 4, 3, 5, 5, 4, 4, 4, 3, 5, 3, 4, 4], // Aroeira No.1
  [4, 5, 4, 4, 3, 5, 4, 3, 4, 4, 4, 5, 4, 4, 3, 5, 3, 4], // Ribagolfe Lakes
  [5, 4, 4, 4, 3, 4, 4, 3, 5, 4, 4, 5, 3, 4, 4, 5, 3, 4], // SdS Serras+Machico
  [5, 4, 4, 4, 3, 4, 4, 3, 5],                            // SdS Serras (9)
  [5, 3, 4, 4, 5, 4, 3, 4, 4, 4, 4, 4, 3, 4, 5, 3, 5, 4], // Vila Sol Prestige+Prime
  [4, 3, 4, 5, 5, 3, 4, 4, 4],                            // Castro Marim Grouse (9)
];
const SONDAS = ["Aroeira II", "Ribagolfe I", "Santo da Serra", "Vila Sol", "Pinheiros Altos", "Castro Marim"];

function calcular(m) {
  const out = { nomes: {}, pars: [] };
  for (const n of NOMES) {
    out.nomes[n] = [
      m.norm(n), m.canonicalCourseName(n), m.resolveRibagolfeKeyByName(n),
      m.resolveSantoDaSerraKeyByName(n), m.resolveMultiloopKeyByName(n), m.canonicalSantoDaSerraNameOnly(n),
    ];
  }
  for (const n of SONDAS) for (const p of PARS) {
    out.pars.push([
      m.resolveAroeiraIIByPar(n, p), m.resolveRibagolfeKeyByPar(n, p), m.resolveSantoDaSerraKeyByPar(n, p),
      m.resolveMultiloopKeyByPar(n, p), m.resolveSantoDaSerraByPar(n, p),
    ]);
  }
  return out;
}

// O mesmo cálculo, mas num Node a sério e a partir de cada porta dos scripts.
function calcularNoNode(porta) {
  const code =
    `const m=require(${JSON.stringify(porta)});` +
    `const NOMES=${JSON.stringify(NOMES)},PARS=${JSON.stringify(PARS)},SONDAS=${JSON.stringify(SONDAS)};` +
    `const calcular=${calcular.toString()};` +
    `process.stdout.write(JSON.stringify(calcular(m)))`;
  return JSON.parse(execFileSync(process.execPath, ["-e", code], { cwd: path.join(__dirname, ".."), encoding: "utf8" }));
}

describe("scripts/lib/course-aliases.cjs carrega src/utils/courseAliases.ts", () => {
  it("dá exactamente o mesmo resultado que o site", () => {
    const noSite = calcular(site);
    expect(calcularNoNode("./scripts/lib/course-aliases.cjs")).toEqual(noSite);
    // valores de referência (se mudarem, é uma decisão — actualizar aqui)
    expect(noSite.nomes["PGA Aroeira No.2 - CNJ FPG"][1]).toBe("PGA Aroeira No.2");
    expect(noSite.nomes["Tróia"][1]).toBe("Troia Golf");
    expect(noSite.nomes["Oceânico Faldo"][1]).toBe("Faldo Course");
    expect(noSite.nomes["Oeiras"][1]).toBe("Oeiras Green Valley");
    expect(noSite.nomes["Ribagolfe II"][2]).toBe("ribagolfe-oaks");
  });

  it("lib/course-aliases.js (pipeline) usa as mesmas funções", () => {
    const code =
      "const l=require('./lib/course-aliases.js'),s=require('./scripts/lib/course-aliases.cjs');" +
      "const r={};for(const k of Object.keys(l))r[k]=(l[k]===s[k]);" +
      "const rec={};const o=s.AROEIRA2_OLD_PAR;for(let i=1;i<=18;i++){rec['par_'+i]=o[i-1];rec['gross_'+i]=i;}" +
      "r.rodou=l.rotateAroeira2RecordIfNeeded(rec);r.gross1=rec.gross_1;r.par1=rec.par_1;" +
      "process.stdout.write(JSON.stringify(r))";
    const r = JSON.parse(execFileSync(process.execPath, ["-e", code], { cwd: path.join(__dirname, ".."), encoding: "utf8" }));
    expect(r).toEqual({
      canonicalCourseName: true, rotateAroeira2RecordIfNeeded: true, resolveAroeiraIIByPar: true,
      resolveSantoDaSerraByPar: true, canonicalSantoDaSerraNameOnly: true, AROEIRA2_OLD_PAR: true,
      rodou: true, gross1: 13, par1: 4,
    });
  });
});
