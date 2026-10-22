import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { isNoCardGross } from "../intlCommon";
import { buildFPGTournament, parOrNone, type IntlPlayerIn } from "../intlTournament";
import { isLgsCard, rfegolfToFPGTournament, mitarjetaToFPGTournament } from "../rfeg/toTournament";
import { rfegPaisLookup } from "../rfeg/flags";
import { normEs } from "../rfeg/text";
import { isPtCountry } from "../../utils/flagUtils";
import { isPT } from "../../utils/ptPlayers";
import { expandMultiRound } from "../fpgUtils";
import { ScorecardLeaderboard } from "../../ui/ScorecardLeaderboard";
import { normalizeBlueGolf } from "../major/bluegolf";
import type React from "react";
import TotalsResumo from "../../ui/circuit/TotalsResumo";
import { ncTotalsPlayers } from "../rfeg/divisionData";

/**
 * Regras comuns das fontes de fora da FPG (decisões da Mariana, 22/10/2026).
 * Cada regra vive num só sítio e vale para todas as fontes.
 */

const par18 = Array(18).fill(4) as number[];
const card = (g: number) => ({ gross: g, scores: Array(18).fill(Math.round(g / 18)) });

describe("1. Gross ≥ 900 = sem cartão (isNoCardGross)", () => {
  it("900, 998 e 999 são «sem cartão»; 899 e null não", () => {
    expect([899, 900, 998, 999, null, undefined].map((g) => isNoCardGross(g))).toEqual([false, true, true, true, false, false]);
    expect(isLgsCard(998)).toBe(false);
    expect(isLgsCard(85)).toBe(true);
  });

  it("buildFPGTournament: a volta sem cartão não conta e o total ≥ 900 não é resultado", () => {
    const players: IntlPlayerIn[] = [
      { id: "a", name: "A", pos: 1, total: 160, rounds: [card(80), card(80)] },
      { id: "b", name: "B", pos: 2, total: 998, toPar: 854, rounds: [card(82), { gross: 998 }] },
    ];
    const t = buildFPGTournament({ name: "T", tcode: "t", rounds: 2 }, { par: par18 }, players);
    const b = t.players[1] as typeof t.players[1] & { _wd?: boolean };
    expect(b.roundScores?.map((r) => r.gross)).toEqual([82]);
    expect([b.grossTotal, b.toPar, b.pos, b._wd]).toEqual([null, null, null, true]);
    expect(t.players[0].toPar).toBe(160 - 144);
  });

  it("BlueGolf: total ≥ 900 sem posição e no fim", () => {
    const r = (g: number) => ({ day: 1, scores: Array(18).fill(5), f9: null, b9: null, gross: g });
    const d = normalizeBlueGolf({ par: par18, players: [
      { name: "X", country: "PT", pos: null, result: null, total: 998, rounds: [r(998)] },
      { name: "Y", country: "PT", pos: null, result: null, total: 90, rounds: [r(90)] },
    ] });
    expect(d.players.map((p) => [p.name, p.pos])).toEqual([["Y", 1], ["X", null]]);
  });

  it("TotalsResumo: volta e total ≥ 900 ficam fora das classificações e da média", () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <TotalsResumo parPerRound={72} players={[
          { name: "A", rounds: [80], total: 80 },
          { name: "B", rounds: [998], total: 998 },
        ]} />
      </MemoryRouter>,
    );
    expect(html).toContain("1 classif.");
    expect(html).toContain("1 inc.");
    expect(html).toContain("Média 80.0");
    expect(html).not.toContain(">998<");
  });
});

describe("2. Sem par oficial fica SEM PAR (nunca 4×18 inventado)", () => {
  it("parOrNone: só o par da fonte com um valor por buraco", () => {
    expect(parOrNone(null, 18)).toEqual([]);
    expect(parOrNone([4, 4, 3], 18)).toEqual([]);
    expect(parOrNone(par18, 18)).toBe(par18);
  });

  it("RFEGolf (PDF): sem par por buraco nem par total; o ±par é o do PDF", () => {
    const t = rfegolfToFPGTournament({
      compId: 1, ok: true, scrapedAt: "", coursePar: null,
      meta: { name: "X", dateStart: "2026-05-01", dateEnd: null, course: null, courseClubId: null, players: 1, hcpLimitMen: null, hcpLimitWomen: null, mode: null, style: null, category: null, sex: null, federation: null, federationCatId: null },
      inscritos: { admitidos: [], reservas: [], bajas: [], invitados: [], noAdmitidos: [], provisional: [], counts: { admitidos: 0, reservas: 0, bajas: 0, invitados: 0, noAdmitidos: 0, provisional: 0 } },
      results: [{ label: "", nRounds: 2, players: [{ pos: 1, name: "SILVA, LUIS", toPar: -4, rounds: [70, 68], total: 138 }] }],
    } as never)!;
    const p = t.players[0];
    expect([p.par, p.parTotal, p.toPar, p.nholes]).toEqual([[], undefined, -4, 18]);
  });

  it("expandMultiRound: sem par, cada volta fica sem ±par e o total guarda o da fonte", () => {
    const t = buildFPGTournament({ name: "T", tcode: "t", rounds: 2 }, { par: [], holes: 18, parTotal: null },
      [{ id: "a", name: "A", total: 150, toPar: 6, rounds: [{ gross: 74 }, { gross: 76 }] }], { keepNoRounds: true, raw: true });
    const [r1, , tot] = expandMultiRound(t);
    expect(r1.players[0].toPar).toBeNull();
    expect(tot.players[0].toPar).toBe(6);
  });

  it("ScorecardLeaderboard sem par: buracos pelos cartões, linha PAR vazia, sem ±par por nine", () => {
    const html = renderToStaticMarkup(
      <ScorecardLeaderboard par={[]} showScorecard rows={[{ key: 1, pos: 1, gross: 72, toPar: null, scores: Array(18).fill(4), nameContent: "A" }]} />,
    );
    const heads = [...html.matchAll(/<th class="lb-hole[^"]*"[^>]*>(\d+)/g)].map((m) => m[1]);
    expect(heads).toHaveLength(18);
    expect(html).toMatch(/PAR<\/td><td class="lb-topar"><\/td><td class="lb-gross"><\/td>/);
    expect(html).not.toContain("(E)");
  });
});

describe("3. Totais do NextCaddy no TotalsResumo (peça única)", () => {
  it("ncTotalsPlayers: nome, ±par da fonte, sexo, licença, clube e bandeira dos estrangeiros", () => {
    const [p] = ncTotalsPlayers([{ pos: 2, name: "PEREZ, JUAN", licencia: "AM1", pais: "PORTUGAL", hcp: 3.1, catEdad: null, sexo: "M", club: "REAL CLUB X", dob: null, estado: null, total: 150, toPar: 6 }]);
    expect(p).toMatchObject({ name: "Juan Perez", pos: 2, total: 150, toPar: 6, fed: "AM1", sex: "M", country: "PT", club: "Real Club X" });
  });

  it("TotalsResumo: ±par directo, SexBadge, FED; destaques sem coluna Total e ordenáveis", () => {
    const wrap = (n: React.ReactNode) => renderToStaticMarkup(<MemoryRouter>{n}</MemoryRouter>);
    const html = wrap(<TotalsResumo parPerRound={null} players={[{ name: "A", rounds: [], total: 150, toPar: 6, sex: "F", fed: "AM1" }]} />);
    expect(html).toContain("±Par");
    expect(html).toContain("+6");
    expect(html).toContain("FED");
    expect(html).toContain("sex-badge");
    const hl = wrap(<TotalsResumo parPerRound={null} players={[{ name: "B", rounds: [], birdie: 3 }]}
      extra={[{ header: "🐦 Birdie", value: (p) => p.birdie as number, sortValue: (p) => -(p.birdie as number) }]} />);
    expect(hl).toContain("1 jogadores");
    expect(hl).not.toContain(">Tot<");
    expect(hl).toMatch(/<th class="lb-sortable[^"]*"[^>]*>(?:(?!<\/th>).)*🐦 Birdie/);
    expect(hl).not.toContain("🥇");
  });
});

describe("4. Destaque PT pela regra comum (isPtCountry)", () => {
  const meta = { name: "X", dateStart: "2026-05-01", dateEnd: null, course: null, courseClubId: null, players: 1, hcpLimitMen: null, hcpLimitWomen: null, mode: null, style: null, category: null, sex: null, federation: null, federationCatId: null };
  const ins = (list: object[]) => ({ admitidos: list, reservas: [], bajas: [], invitados: [], noAdmitidos: [], provisional: [], counts: { admitidos: list.length, reservas: 0, bajas: 0, invitados: 0, noAdmitidos: 0, provisional: 0 } });

  it("PT, PRT, POR e Portugal; a excepção por nome só na FFG (isPT)", () => {
    expect(["PT", "PRT", "POR", "Portugal", "PORTUGAL", "FR", null].map((c) => isPtCountry(c))).toEqual([true, true, true, true, true, false, false]);
    expect(isPT("FRA", null, "Ricardo Castro Ferreira")).toBe(true);
    expect(isPT("PRT")).toBe(true);
  });

  it("RFEGolf (PDF): o país vem dos inscritos — Luis Antonio Silva destacado", () => {
    const t = rfegolfToFPGTournament({
      compId: 15923, ok: true, scrapedAt: "", coursePar: null, meta,
      inscritos: ins([{ pos: 22, name: "SILVA , LUIS ANTONIO", licencia: "XXXXXPOR07", pais: "Portugal" }]),
      results: [{ label: "", nRounds: 1, players: [{ pos: 50, name: "SILVA, LUIS ANTONIO", toPar: 3, rounds: [72], total: 72 }, { pos: 51, name: "PEREZ, JUAN", toPar: 4, rounds: [73], total: 73 }] }],
    } as never)!;
    expect(t.players.map((p) => [p.name, !!p._isPortuguese])).toEqual([["Luis Antonio Silva", true], ["Juan Perez", false]]);
  });

  it("mitarjeta: país dos inscritos por licença — Catarina Sousa Conceicao destacada", () => {
    const t = mitarjetaToFPGTournament({
      compId: 16189, ok: true, scrapedAt: "", coursePar: null, meta,
      inscritos: ins([{ name: "SOUSA CONCEICAO, CATARINA", licencia: "AM00414469", pais: "PORTUGAL" }]),
      results: [{ label: "", nRounds: 1, players: [{ pos: 43, name: "SOUSA CONCEICAO, Catarina", licencia: "AM00414469", toPar: 15, rounds: [87], total: 87 }] }],
    } as never)!;
    expect(t.players[0]._isPortuguese).toBe(true);
  });

  it("rfegPaisLookup: 1.º país não vazio, por licença ou nome", () => {
    const f = rfegPaisLookup({ reservas: [{ name: "JOHANSEN , MARTIM", licencia: "X8", pais: null }], provisional: [{ name: "JOHANSEN , MARTIM", licencia: "X8", pais: "Portugal" }] }, normEs);
    expect([f("X8", null), f(null, "Johansen, Martim"), f(null, "Outro")]).toEqual(["Portugal", "Portugal", null]);
  });
});
