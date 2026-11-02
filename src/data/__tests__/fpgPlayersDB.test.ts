import { describe, it, expect, vi } from "vitest";

// O players.json da cache — o MESMO objecto que o AppContext dá à /jogadores.
const players = { "52884": { name: "Manuel Medeiros", sex: "M" } } as Record<string, Record<string, unknown>>;

vi.mock("../loader", () => ({ loadPlayers: () => Promise.resolve(players) }));
vi.mock("../fetchCache", () => ({
  cachedFetchJson: (url: string) => Promise.resolve(
    url.includes("players-nationality") ? {
      byFed: { "52884": "PT", "9793": "PT" },
      info: { "52884": { dob: "2014-04-29" }, "9793": { name: "A. G. Tayob", sex: "M" } },
    }
    : url.includes("juniors-links") ? { j: [["u1", "Bonnie Xinyi Wu", [], null, null, null, "CN", "F"]] }
    : null),
}));

describe("loadFpgPlayersDB — nunca suja o players.json partilhado", () => {
  it("as entradas de consulta (federados antigos, kids:*) ficam só na cópia", async () => {
    const { loadFpgPlayersDB } = await import("../fpgPlayersDB");
    const pdb = await loadFpgPlayersDB();
    expect(pdb["9793"]?.name).toBe("A. G. Tayob");
    expect(pdb["kids:bonnie_xinyi_wu"]?.name).toBe("Bonnie Xinyi Wu");
    expect(pdb["52884"]?.country).toBe("PT");
    // O objecto da cache continua só com os nossos, sem campos novos.
    expect(Object.keys(players)).toEqual(["52884"]);
    expect(players["52884"]).toEqual({ name: "Manuel Medeiros", sex: "M" });
  });
});
