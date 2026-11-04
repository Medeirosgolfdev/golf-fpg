import { describe, it, expect } from "vitest";
import { paisDaBandeira, clubeDe, jogadorDaEntrada, cartaoDaVolta, sexoPeloTee } from "./scottishgolf.js";

const flag = (c) => `https://static.clubhouse.scottishgolf.org/countries/${c}.png`;

describe("scottishgolf — leitura da API", () => {
  it("bandeira → código do site (subdivisões do Reino Unido)", () => {
    expect(paisDaBandeira(flag("gb-sct"))).toBe("GB-SCT");
    expect(paisDaBandeira(flag("eng"))).toBe("GB-ENG");
    expect(paisDaBandeira(flag("ie"))).toBe("IE");
    expect(paisDaBandeira(null)).toBe(null);
  });

  it("ClubCountry: clube dos escoceses, país (=sem clube) dos estrangeiros", () => {
    expect(clubeDe({ ClubCountry: "East Kilbride Golf Club", CountryFlag: flag("gb-sct") })).toBe("East Kilbride Golf Club");
    expect(clubeDe({ ClubCountry: "England", CountryFlag: flag("eng") })).toBe(null);
    expect(clubeDe({ ClubCountry: "Netherlands", CountryFlag: flag("nl") })).toBe(null);
    expect(clubeDe({ ClubCountry: "Royal Dornoch", CountryFlag: flag("gb-sct") })).toBe("Royal Dornoch");
  });

  it("linha da classificação → jogador (nome, posição, MC, voltas)", () => {
    const p = jogadorDaEntrada({
      RSEntryId: 1276562, DisplayName: "Meldrum, Cameron", PlayerNames: ["Cameron Meldrum"], ToPar: "+10",
      NoHTML: "<b title='Missed Cut'>MC</b>", ClubCountry: "East Kilbride Golf Club", CountryFlag: flag("gb-sct"),
      EntryRound: { RoundTotal: "149", Rounds: ["<a class='round_link' href='#' round='1'>71</a>", "<a round='2'>78</a>", "-"] },
    });
    expect(p).toMatchObject({ pos: "MC", name: "Cameron Meldrum", country: "GB-SCT", club: "East Kilbride Golf Club", toPar: 10, total: 149, roundGross: [71, 78], detailId: "sg1276562" });
    expect(jogadorDaEntrada({ RSEntryId: 1, DisplayName: "Van Emmenis, Aj", ToPar: "E", NoHTML: "1", EntryRound: { Rounds: [] } }))
      .toMatchObject({ name: "Aj Van Emmenis", toPar: 0, pos: "1" });
  });

  it("cartão: pancadas, par, jardas → metros; vazio = null", () => {
    const c = { StartTee: 1 };
    for (let i = 1; i <= 18; i++) { c[`Gross${i}`] = 4; c[`Par${i}`] = 4; c[`Dist${i}`] = 400; }
    const r = cartaoDaVolta(c);
    expect(r.gross).toBe(72);
    expect(r.par).toHaveLength(18);
    expect(r.meters[0]).toBe(366);
    expect(cartaoDaVolta({ ...c, ...Object.fromEntries(Array.from({ length: 18 }, (_, i) => [`Gross${i + 1}`, 0])) })).toBe(null);
    expect(cartaoDaVolta({ ...c, ScoresHidden: true })).toBe(null);
  });

  it("U14 misto: o tee mais comprido é o dos rapazes; um só tee = não decide", () => {
    const j = (m) => ({ rounds: [{ meters: Array(18).fill(m) }] });
    const a = j(300), b = j(330);
    const s = sexoPeloTee([a, b, j(300)]);
    expect(s(a)).toBe("F");
    expect(s(b)).toBe("M");
    expect(sexoPeloTee([a, j(300)])).toBe(null);
  });
});
