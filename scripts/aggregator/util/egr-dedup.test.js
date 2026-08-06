import { describe, it, expect } from "vitest";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { dedupeEgrTournaments, rosterKey } = require("./egr-dedup.js");

/** Torneio sintético com um roster de nomes. */
function tourn(sourceKey, name, date, names, extra = {}) {
  return {
    sourceKey, name, date, startDate: date,
    flights: [{ flightKey: "geral", results: names.map((n) => ({ playerName: n })) }],
    ...extra,
  };
}
const names = (n, prefix = "Player") => Array.from({ length: n }, (_, i) => `${prefix} Num${i}`);

function build(egrTourns, otherTourns, otherId = "rfeg") {
  const egr = { sourceId: "egr", tournaments: egrTourns };
  const other = { sourceId: otherId, tournaments: otherTourns };
  return { egr, other, raw: [other, egr] };
}

describe("rosterKey", () => {
  it("casa 'Apelido, Nome' com 'Nome Apelido' e ignora diacríticos", () => {
    expect(rosterKey("MOOSLECHNER, Eva")).toBe(rosterKey("Eva Mooslechner"));
    expect(rosterKey("João Sousa")).toBe(rosterKey("Joao SOUSA"));
  });
});

describe("dedupeEgrTournaments", () => {
  it("remove evento EGR com roster igual na mesma data (fonte dedicada ganha)", () => {
    const roster = names(20);
    const { egr, raw } = build(
      [tourn("egr1", "Spanish U16 Champs 2025", "2025-05-02", roster)],
      [tourn("rf1", "Campeonato de España Sub 16", "2025-05-02", roster)],
    );
    const { dropped } = dedupeEgrTournaments(raw);
    expect(dropped).toHaveLength(1);
    expect(dropped[0].coveredBy).toBe("rfeg");
    expect(egr.tournaments).toHaveLength(0);
  });

  it("remove EGR subset (egr% >= 0.7) mesmo com datas desfasadas 2 dias", () => {
    const big = names(140);
    const sub = big.slice(0, 60); // 60/60 = 100% do lado EGR
    const { egr, raw } = build(
      [tourn("egr1", "Championnat U14 Boys 2025", "2025-07-22", sub)],
      [tourn("ff1", "CFJ 2025 - U14", "2025-07-20", big)],
      "ffgolf",
    );
    expect(dedupeEgrTournaments(raw).dropped).toHaveLength(1);
    expect(egr.tournaments).toHaveLength(0);
  });

  it("remove EGR superset quando a fonte dedicada está ~toda contida (ovMin >= 0.85, sh >= 15)", () => {
    const egrRoster = names(56);
    const jornada = egrRoster.slice(0, 36); // 36/36 = 1.0 do lado dedicado; 36/56 = 0.64 do EGR
    const { egr, raw } = build(
      [tourn("egr1", "Catalunya Girls U18 Ranking 2025", "2025-05-16", egrRoster)],
      [tourn("fcg1", "Jornada 1", "2025-05-16", jornada)],
      "fcg",
    );
    expect(dedupeEgrTournaments(raw).dropped).toHaveLength(1);
    expect(egr.tournaments).toHaveLength(0);
  });

  it("mantém eventos distintos no mesmo fim-de-semana com pool parcial partilhado", () => {
    // Falso positivo clássico: 8 dos 25 do evento pequeno também jogam o grande
    // (0.32 do min, 0.09 do EGR) — tem de ficar.
    const big = names(93);
    const small = [...big.slice(0, 8), ...names(17, "Other")];
    const { egr, raw } = build(
      [tourn("egr1", "England U16 Girls 2025", "2025-07-29", big)],
      [tourn("en1", "Bronte Law Series - Moor Allerton", "2025-07-29", small)],
      "england",
    );
    expect(dedupeEgrTournaments(raw).dropped).toHaveLength(0);
    expect(egr.tournaments).toHaveLength(1);
  });

  it("mantém quando o overlap é 50/50 (zona de falsos positivos medida)", () => {
    // Caso real: Danish Marbæk U18 (46) vs Danish Junior Games (70), sh=23.
    const shared = names(23, "Shared");
    const egrRoster = [...shared, ...names(23, "EgrOnly")];
    const otherRoster = [...shared, ...names(47, "OtherOnly")];
    const { egr, raw } = build(
      [tourn("egr1", "Danish Juniors Int. U18 2026", "2026-03-30", egrRoster)],
      [tourn("gj1", "Danish Junior Games 2026", "2026-03-29", otherRoster)],
      "gjgl",
    );
    expect(dedupeEgrTournaments(raw).dropped).toHaveLength(0);
    expect(egr.tournaments).toHaveLength(1);
  });

  it("mantém rosters iguais mas datas afastadas (> 3 dias)", () => {
    const roster = names(20);
    const { egr, raw } = build(
      [tourn("egr1", "Evento A", "2025-05-02", roster)],
      [tourn("rf1", "Evento B", "2025-05-20", roster)],
    );
    expect(dedupeEgrTournaments(raw).dropped).toHaveLength(0);
    expect(egr.tournaments).toHaveLength(1);
  });

  it("ignora rosters minúsculos (< 5 partilhados) e sources sem egr", () => {
    const { raw } = build(
      [tourn("egr1", "Micro evento", "2025-05-02", names(4))],
      [tourn("rf1", "Micro evento", "2025-05-02", names(4))],
    );
    expect(dedupeEgrTournaments(raw).dropped).toHaveLength(0);
    expect(dedupeEgrTournaments([{ sourceId: "rfeg", tournaments: [] }]).dropped).toHaveLength(0);
  });
});
