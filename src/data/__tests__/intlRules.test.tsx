import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { isNoCardGross } from "../intlCommon";
import { buildFPGTournament, parOrNone, type IntlPlayerIn } from "../intlTournament";
import { isLgsCard, rfegolfToFPGTournament } from "../rfeg/toTournament";
import { expandMultiRound } from "../fpgUtils";
import { ScorecardLeaderboard } from "../../ui/ScorecardLeaderboard";
import { normalizeBlueGolf } from "../major/bluegolf";
import TotalsResumo from "../../ui/circuit/TotalsResumo";

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
