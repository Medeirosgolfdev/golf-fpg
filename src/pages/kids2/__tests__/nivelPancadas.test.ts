import { describe, it, expect } from "vitest";
import { calcularNiveis, type NivelTorneio } from "../nivelPancadas";

const PAR = Array(18).fill(4);
/** Uma prova de 1 volta: [id do jogador, gross]. */
function prova(id: string, date: string, linhas: [string, number, number?][], extra: Partial<NivelTorneio> & { label?: string; metros?: number } = {}): NivelTorneio {
  return {
    id, name: extra.name ?? `Prova ${id}`, sourceId: "teste", date,
    flights: [{
      flightKey: "b12", label: extra.label ?? "Boys 12", par: PAR, metros: extra.metros, fieldSize: linhas.length,
      results: linhas.map(([juniorId, gross, metros]) => ({ juniorId, rounds: [{ round: 1, gross, ...(metros ? { metros } : {}) }] })),
    }],
  };
}
const geracao = () => "2014_M";

describe("calcularNiveis (Nível em pancadas)", () => {
  it("quem faz menos pancadas que os mesmos adversários fica melhor", () => {
    const ts = [
      prova("t1", "2026-09-01", [["A", 74], ["B", 80], ["C", 86]]),
      prova("t2", "2026-10-01", [["A", 75], ["B", 81], ["C", 85]]),
      prova("t3", "2026-10-15", [["A", 73], ["B", 79], ["C", 87]]),
    ];
    // fields de 3 de propósito: sem a ligação (que os pesaria quase a zero)
    const n = calcularNiveis(ts, geracao, "2026-11-05", { ligacao: 0 });
    expect(n.get("A")!.nivel).toBeLessThan(n.get("B")!.nivel);
    expect(n.get("B")!.nivel).toBeLessThan(n.get("C")!.nivel);
    // ~6 pancadas entre A e B (encolhidas um pouco para a média da geração)
    expect(n.get("B")!.nivel - n.get("A")!.nivel).toBeGreaterThan(4);
  });

  it("um campo mais difícil não piora quem lá jogou: conta a comparação com os outros", () => {
    const ts = [
      prova("t1", "2026-09-01", [["A", 74], ["B", 80]]),
      prova("t2", "2026-10-01", [["A", 84], ["B", 90]]), // dia/campo 10 pancadas mais difícil
      prova("t3", "2026-10-02", [["C", 80], ["B", 80]]),
    ];
    const n = calcularNiveis(ts, geracao, "2026-11-05");
    // C empata com B no mesmo dia → C ≈ B, e ambos pior que A
    expect(Math.abs(n.get("C")!.nivel - n.get("B")!.nivel)).toBeLessThan(2);
    expect(n.get("A")!.nivel).toBeLessThan(n.get("C")!.nivel);
  });

  it("só o último ano conta para o nível", () => {
    const ts = [
      prova("t0", "2025-06-01", [["A", 100], ["B", 80]]), // há mais de um ano
      prova("t1", "2026-09-01", [["A", 74], ["B", 80]]),
      prova("t2", "2026-10-01", [["A", 75], ["B", 81]]),
    ];
    const n = calcularNiveis(ts, geracao, "2026-11-05");
    expect(n.get("A")!.nivel).toBeLessThan(n.get("B")!.nivel);
    expect(n.get("A")!.voltas).toBe(2);
  });

  it("formatos de equipa (Parent/Child, scramble) não contam", () => {
    const ts = [
      prova("t1", "2026-09-01", [["A", 60], ["B", 62]], { name: "World Championship 2026 Parent/Child" }),
      prova("t2", "2026-10-01", [["A", 80], ["B", 78]]),
    ];
    const n = calcularNiveis(ts, geracao, "2026-11-05");
    expect(n.get("A")!.voltas).toBe(1);
  });

  it("as voltas recentes pesam mais", () => {
    const ts = [prova("t1", "2026-05-01", [["A", 80], ["B", 80]]), prova("t2", "2026-11-01", [["A", 80], ["B", 80]])];
    const n = calcularNiveis(ts, geracao, "2026-11-05", { ligacao: 0 });
    expect(n.get("A")!.peso).toBeLessThan(2);
    expect(n.get("A")!.peso).toBeGreaterThan(1.3);
  });

  it("pitch & putt não conta (pelo nome ou por buracos curtos demais)", () => {
    const ts = [
      prova("t1", "2026-09-01", [["A", 60], ["B", 62]], { name: "Campeonato de Andalucía Sub 16 P&P" }),
      prova("t2", "2026-09-15", [["A", 60], ["B", 62]], { metros: 1310 }),
      prova("t3", "2026-10-01", [["A", 80], ["B", 78]]),
    ];
    const n = calcularNiveis(ts, geracao, "2026-11-05");
    expect(n.get("A")!.voltas).toBe(1);
  });

  it("uma volta num field minúsculo pesa pouco; num field grande pesa quase tudo", () => {
    // 40 jogadores que se medem bem entre si em 3 provas grandes
    const outros = Array.from({ length: 40 }, (_, i) => `o${i}`);
    const grande = (id: string, date: string, extra: [string, number][]) =>
      prova(id, date, [...outros.map((o, i): [string, number] => [o, 76 + (i % 10)]), ...extra]);
    const ts = [
      grande("g1", "2026-06-01", [["L", 88], ["M", 82]]),
      grande("g2", "2026-07-01", [["L", 88], ["M", 82]]),
      grande("g3", "2026-08-01", [["L", 88], ["M", 82]]),
      // o L ganha sozinho, por muito, em provas locais de 1 jogador
      ...Array.from({ length: 6 }, (_, i) => prova(`l${i}`, `2026-10-0${i + 1}`, [["L", 66]])),
    ];
    const n = calcularNiveis(ts, geracao, "2026-11-05");
    // nos fields grandes o M fez 6 pancadas a menos: as vitórias sozinho não o passam à frente
    expect(n.get("M")!.nivel).toBeLessThan(n.get("L")!.nivel);
  });
});
