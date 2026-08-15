import { describe, it, expect } from "vitest";
import { resolvePlayedTee, resolvePlayedMeters } from "../playedDistance";
import type { Course, Tee } from "../../data/types";

/**
 * Cenário real: Golf Della Montecchia White/Red, onde o Manuel jogou o Venice
 * Open de Boys 11 em 2025 e de Boys 12 em 2026. O catálogo do campo guarda as
 * marcações com o prefixo do circuito ("USKids Boys 12"); a FPG grava-as sem
 * ele ("Boys 12"). O escalão muda de ano para ano, por isso a resolução tem de
 * vir do tee da PRÓPRIA ronda — um override por campo daria sempre o mesmo.
 */
function tee(teeName: string, total: number, front9: number): Tee {
  return {
    teeId: `t-${teeName}`,
    sex: "M",
    teeName,
    ratings: { holes18: { par: 72, courseRating: 67.6, slopeRating: 118 } },
    holes: [],
    distances: { total, front9, back9: total - front9, holesCount: 18, complete18: true },
  } as unknown as Tee;
}

const montecchia: Course = {
  courseKey: "away-golf-della-montecchia-white-red",
  master: {
    courseId: "away-golf-della-montecchia-white-red",
    name: "Golf Della Montecchia - White/Red",
    links: { fpg: null, scorecards: null },
    tees: [tee("USKids Boys 12", 5177, 2574), tee("USKids Boys 11", 4615, 2399)],
  },
} as unknown as Course;

const COURSES = [montecchia];
const OTHER_FED = "99999";

describe("resolvePlayedTee — marcação por escalão com prefixo de circuito", () => {
  it("liga 'Boys 12' a 'USKids Boys 12'", () => {
    const t = resolvePlayedTee("Golf Della Montecchia - White/Red", "Boys 12", COURSES, OTHER_FED);
    expect(t?.teeName).toBe("USKids Boys 12");
  });

  it("liga 'Boys 11' a 'USKids Boys 11' — o mesmo campo, outro ano", () => {
    const t = resolvePlayedTee("Golf Della Montecchia - White/Red", "Boys 11", COURSES, OTHER_FED);
    expect(t?.teeName).toBe("USKids Boys 11");
  });

  it("devolve os metros certos por escalão", () => {
    const m26 = resolvePlayedMeters("Golf Della Montecchia - White/Red", "Boys 12", 18, COURSES, OTHER_FED);
    const m25 = resolvePlayedMeters("Golf Della Montecchia - White/Red", "Boys 11", 18, COURSES, OTHER_FED);
    expect(m26).toBe(5177);
    expect(m25).toBe(4615);
  });

  it("prefere o nome exacto ao sufixo", () => {
    const courses = [{
      ...montecchia,
      master: { ...montecchia.master, tees: [tee("Boys 12", 4000, 2000), tee("USKids Boys 12", 5177, 2574)] },
    }] as unknown as Course[];
    const t = resolvePlayedTee("Golf Della Montecchia - White/Red", "Boys 12", courses, OTHER_FED);
    expect(t?.distances.total).toBe(4000);
  });

  it("devolve null quando o campo não existe no catálogo", () => {
    expect(resolvePlayedTee("Campo Que Não Existe", "Boys 12", COURSES, OTHER_FED)).toBeNull();
  });

  // Nota: nomes de uma só palavra não passam pelo passo do sufixo (exige 2+
  // palavras), mas caem no passo seguinte — o da cor — que é um apanha-tudo
  // pré-existente e resolve qualquer nome não reconhecido para o primeiro tee.
  // Esse comportamento é anterior a este passo e não é aqui que se testa.
});
