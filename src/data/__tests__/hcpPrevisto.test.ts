import { describe, it, expect } from "vitest";
import { hcpPrevisto, type HcpInfo, type RoundData } from "../playerDataLoader";

const HCP: HcpInfo = { current: 6.4, lowHcp: 6.4, softCap: null, hardCap: null, scoreAvg: 6.4, qtyScores: 20, qtyCalc: 8, adjustTotal: 0 };
const volta = (dia: number, sd: number | "", extra = false) =>
  ({ scoreId: `${extra ? "extra_" : ""}${dia}`, dateSort: dia, sd, hi: 6.4, ...(extra ? { _isExtra: true } : {}) }) as unknown as RoundData;
const dados = (rounds: RoundData[]) => ({ DATA: [{ rounds }] as never, HCP_INFO: HCP });

// 20 voltas oficiais: as 8 melhores são 6.4 (as duas mais antigas) e mais seis 6.4 → índice 6.4.
const oficiais = Array.from({ length: 20 }, (_, i) => volta(100 + i, i < 8 ? 6.4 : 12));

describe("hcpPrevisto — voltas que a FPG ainda não tem (23/11/2026)", () => {
  it("sem extra_rounds com SD na janela não há previsto", () => {
    expect(hcpPrevisto(dados([...oficiais, volta(200, "", true)]))).toBeNull();
  });
  it("as voltas por publicar empurram as mais antigas para fora e mudam o índice", () => {
    const p = hcpPrevisto(dados([...oficiais, volta(201, 15, true), volta(202, 15, true)]));
    expect(p).not.toBeNull();
    expect(p!.oficial).toBe(6.4);
    expect(p!.provisorias.map(r => r.scoreId)).toEqual(["extra_202", "extra_201"]);
    // saem as duas mais antigas (6.4 cada) → entram dois 12 nas 8 melhores: (6×6.4 + 2×12)/8 = 7.8
    expect(p!.info.current).toBe(7.8);
    expect(p!.info.qtyScores).toBe(20);
  });
});
