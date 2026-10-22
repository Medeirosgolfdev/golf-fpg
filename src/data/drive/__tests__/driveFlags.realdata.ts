import { describe, it, expect } from "vitest";
import { useRealDataFetch } from "./realDataFetch";
import { loadDriveData } from "../driveLoader";

/** Decisão F: a /drive usa o playersDB da /FPG (`loadFpgPlayersDB`) — os
 *  federados estrangeiros trazem o país (bandeira antes do nome). */
describe("bandeiras na /drive (decisão F)", () => {
  it("Joe Short (51804) é GB e aparece num torneio do Drive", async () => {
    useRealDataFetch();
    const { players, raw } = await loadDriveData();
    expect(players["51804"]?.country).toBe("GB");
    expect(raw.some(t => t.players.some(p => String(p.fed) === "51804"))).toBe(true);
    const estrangeiros = new Set(raw.flatMap(t => t.players.map(p => String(p.fed))).filter(f => players[f]?.country && players[f]!.country !== "PT"));
    expect(estrangeiros.size).toBeGreaterThan(5);
    // Nascimento: o do federados.json (o players-nationality.json tem um dia a menos em ~9 mil)
    expect(players["48990"]?.dob).toBe("2010-07-23");
    // «@1» do players-nationality não é país (dava 🏴)
    expect(Object.values(players).some(p => p && typeof p === "object" && /^@/.test(String((p as { country?: string }).country ?? "")))).toBe(false);
  }, 120000);
});
