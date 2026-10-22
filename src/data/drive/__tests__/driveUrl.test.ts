import { describe, it, expect, beforeAll } from "vitest";
import { useRealDataFetch } from "./realDataFetch";
import { loadDriveAdmissions, loadDriveData } from "../driveLoader";
import { attachDriveAdmissions, buildDriveSource, filterDriveSource } from "../driveSource";
import { buildDriveEntries } from "../driveCircuitData";
import {
  DRIVE_URL_DEFAULTS, driveDivTkey, driveFiltersForTkey, driveQueryString, driveRepDivision,
  legacyDriveT, parseDriveQuery, resolveDriveTkey,
} from "../driveUrl";
import type { Tournament } from "../../fpgTypes";

const q = (s: string) => parseDriveQuery(new URLSearchParams(s));

describe("query da /drive (decisão A)", () => {
  it("região, escalões e ano do URL ficam", () => {
    const st = q("series=challenge&region=madeira&esc=Sub+12&year=2024");
    expect(st).toMatchObject({ series: "challenge", region: "madeira", esc: ["Sub 12"], year: "2024" });
    expect(driveQueryString(st)).toBe("?series=challenge&region=madeira&esc=Sub+12&year=2024");
  });
  it("Ranking Sub-12: Challenge, Ranking e Evolução reabrem; `list` (nome antigo) é o Ranking", () => {
    expect(q("nav=ranking-sub12&s12s=challenge").s12s).toBe("challenge");
    expect(q("nav=ranking-sub12&s12v=ranking").s12v).toBe("ranking");
    expect(q("nav=ranking-sub12&s12v=evolucao").s12v).toBe("evolucao");
    expect(q("nav=ranking-sub12&s12v=list").s12v).toBe("ranking");
    for (const s of ["nav=ranking-sub12&s12s=challenge", "nav=ranking-sub12&s12s=aquapor&s12v=evolucao&s12r=madeira&s12x=F&s12e=all"]) {
      expect(driveQueryString(q(s))).toBe("?" + s);
    }
  });
  it("`region` sem `s12r` também filtra o Ranking e não se repete no URL", () => {
    const st = q("nav=ranking-sub12&region=acores");
    expect(st.s12r).toBe("acores");
    expect(driveQueryString(st)).toBe("?nav=ranking-sub12&region=acores");
  });
  it("por omissão, URL limpo; a aba só na vista de torneios", () => {
    expect(driveQueryString(DRIVE_URL_DEFAULTS)).toBe("");
    expect(driveQueryString(DRIVE_URL_DEFAULTS, "resumo")).toBe("?tab=resumo");
    expect(driveQueryString({ ...DRIVE_URL_DEFAULTS, nav: "ranking-sub12" }, "resumo")).toBe("?nav=ranking-sub12");
  });
});

describe("deep-links com os dados reais (decisão A)", () => {
  let src: Tournament[] = [];
  beforeAll(async () => {
    useRealDataFetch();
    const raw = (await loadDriveData()).raw;
    const { idx } = await loadDriveAdmissions();
    attachDriveAdmissions(raw, idx);
    src = buildDriveSource(raw, idx);
  }, 120000);

  it("torneio com várias voltas: o link fica com o tcode da FPG (sem …_R1) e reabre", () => {
    const multi = src.find(t => (t.rounds || 1) > 1 && t.series === "tour")!;
    const tk = `${multi.ccode}-${multi.tcode}`;
    const ents = buildDriveEntries(filterDriveSource(src, { series: "tour", year: multi.date.slice(0, 4), region: null }));
    const sel = resolveDriveTkey(ents, tk);
    expect(sel.id).toBeDefined();
    const div = ents.find(e => e.id === sel.id)!.divisions!.find(d => d.key === sel.divKey);
    expect(driveDivTkey(div)).toBe(tk);
    expect(driveDivTkey(div)).not.toMatch(/_R\d|_Total/);
    // o link antigo com sufixo também abre
    expect(resolveDriveTkey(ents, tk + "_R1").id).toBe(sel.id);
  });

  it("escalão de um evento Challenge: o link abre ESSE escalão", () => {
    const ents = buildDriveEntries(filterDriveSource(src, { series: "challenge", year: "2026", region: null }));
    const ev = ents.find(e => (e.divisions?.length ?? 0) > 2)!;
    const last = ev.divisions![ev.divisions!.length - 1];
    const sel = resolveDriveTkey(ents, driveDivTkey(last));
    expect(sel).toEqual({ id: ev.id, divKey: last.key });
  });

  it("torneio de outra série/ano: os filtros mudam para ele aparecer", () => {
    const old = src.find(t => t.series === "challenge" && t.date.startsWith("2023"))!;
    const tk = `${old.ccode}-${old.tcode}`;
    expect(driveFiltersForTkey(src, tk, DRIVE_URL_DEFAULTS, false)).toEqual({ series: "challenge", year: "2023" });
    expect(driveFiltersForTkey(src, tk, { ...DRIVE_URL_DEFAULTS, series: "all", esc: ["Sub 18"], region: "zz" }, false))
      .toEqual({ year: "2023", region: null, esc: [] });
    expect(driveFiltersForTkey(src, tk, DRIVE_URL_DEFAULTS, true)).toBeNull();
    expect(driveFiltersForTkey(src, "999-1", DRIVE_URL_DEFAULTS, false)).toBeNull();
  });

  it("a Final por jogar (só nas inscrições) e o provisório que lhe foi fundido", () => {
    const fin = src.find(t => t.date === "2026-11-07" && /Final Drive Tour/i.test(t.name))!;
    const ents = buildDriveEntries(filterDriveSource(src, { series: "tour", year: null, region: null }));
    expect(resolveDriveTkey(ents, `${fin.ccode}-${fin.tcode}`).id).toBeDefined();
    const merged = (fin as Tournament & { _mergedFrom?: string })._mergedFrom;
    if (merged) expect(resolveDriveTkey(ents, merged).id).toBe(resolveDriveTkey(ents, `${fin.ccode}-${fin.tcode}`).id);
  });

  it("?t={id} antigo → o caminho do torneio", () => {
    const ents = buildDriveEntries(src);
    const e = ents.find(x => (x.divisions?.length ?? 0) > 1)!;
    expect(legacyDriveT(ents, e.id)).toBe(driveDivTkey(driveRepDivision(e)));
    expect(legacyDriveT(ents, "nao-existe")).toBeNull();
  });
});
