/**
 * Testes da guarda anti-degradação do histórico USKids.
 */
import { describe, it, expect } from "vitest";
import {
  fieldRichness, pickRicher, roundCompleteness,
  mergeRound, mergeTournament, mergeTournamentMaps,
} from "./uskids-merge-guard.js";

// Valores reais do incidente 2026-07-19 (validados contra a API USKids).
const YARDS_OK = [227, 231, 100, 285, 242, 290, 105, 230, 255, 218, 97, 225, 265, 271, 216, 224, 95, 210];
const PAR_OK   = [4, 4, 3, 5, 4, 5, 3, 4, 4, 4, 3, 4, 5, 5, 4, 4, 3, 4];
const ZEROS    = new Array(18).fill(0);
const STROKES_OK = [4, 5, 3, 4, 4, 4, 3, 5, 4, 4, 4, 3, 4, 5, 4, 4, 3, 4];

describe('fieldRichness', () => {
  it('distingue vazio de preenchido', () => {
    expect(fieldRichness(undefined)).toBe(-1);
    expect(fieldRichness(null)).toBe(-1);
    expect(fieldRichness([])).toBe(0);
    expect(fieldRichness(ZEROS)).toBe(0);
    expect(fieldRichness(YARDS_OK)).toBe(18);
    expect(fieldRichness('')).toBe(0);
    expect(fieldRichness('?')).toBe(0);
    expect(fieldRichness('Cash Draper')).toBe(1);
    expect(fieldRichness(0)).toBe(0);
    expect(fieldRichness(78)).toBe(1);
  });

  it('conta só os buracos jogados num cartão de 9 buracos', () => {
    expect(fieldRichness([3, 4, 2, 5, 6, 3, 4, 5, 5, 0, 0, 0, 0, 0, 0, 0, 0, 0])).toBe(9);
  });
});

describe('pickRicher', () => {
  it('nunca troca dados bons por vazios', () => {
    expect(pickRicher(YARDS_OK, [])).toBe(YARDS_OK);
    expect(pickRicher(YARDS_OK, ZEROS)).toBe(YARDS_OK);
    expect(pickRicher('Cash Draper', '?')).toBe('Cash Draper');
    expect(pickRicher('US', '')).toBe('US');
    expect(pickRicher(78, 0)).toBe(78);
  });

  it('deixa passar preenchimento e correcções (empate → novo)', () => {
    expect(pickRicher([], YARDS_OK)).toBe(YARDS_OK);
    expect(pickRicher('?', 'Cash Draper')).toBe('Cash Draper');
    expect(pickRicher(0, 1)).toBe(1);
    expect(pickRicher(230, 250)).toBe(250);      // correcção legítima de jardas
    expect(pickRicher('Boys 11', 'Boys 12')).toBe('Boys 12');
  });

  it('trata campos ausentes de cada lado', () => {
    expect(pickRicher(undefined, 5)).toBe(5);
    expect(pickRicher(5, undefined)).toBe(5);
  });
});

describe('mergeRound', () => {
  it('preserva a ronda boa inteira quando a nova vem a zeros', () => {
    // Caso 577652/21650: o scrape degradado trazia strokes a zeros E
    // startTime genérico "08:00"/grupo 0 — que empatariam campo-a-campo.
    const boa = { strokes: STROKES_OK, gross: 70, holes: 18, startTime: '09:40', group: 3, startHole: 10 };
    const ma  = { strokes: ZEROS,      gross: 0,  holes: 0,  startTime: '08:00', group: 0, startHole: 1 };
    expect(mergeRound(boa, ma)).toEqual(boa);
  });

  it('aceita a ronda nova quando traz mais informação', () => {
    const vazia = { strokes: ZEROS, gross: 0, holes: 0 };
    const cheia = { strokes: STROKES_OK, gross: 70, holes: 18 };
    expect(mergeRound(vazia, cheia)).toMatchObject({ gross: 70, holes: 18 });
  });

  it('funde campo-a-campo quando as duas estão completas', () => {
    const antiga = { strokes: STROKES_OK, gross: 70, holes: 18, startTime: '09:40', course: null };
    const nova   = { strokes: STROKES_OK, gross: 70, holes: 18, startTime: '10:20', course: 'Course No. 5' };
    const out = mergeRound(antiga, nova);
    expect(out.startTime).toBe('10:20');            // correcção passa
    expect(out.course).toBe('Course No. 5');        // campo novo entra
  });

  it('sobrevive a rondas ausentes de um dos lados', () => {
    const r = { strokes: STROKES_OK, gross: 70 };
    expect(mergeRound(undefined, r)).toBe(r);
    expect(mergeRound(r, undefined)).toBe(r);
  });
});

describe('mergeTournament', () => {
  it('recupera par/yards/place/totalStrokes degradados', () => {
    // Caso 618488/22080 e 592970/21667.
    const antigo = { par: PAR_OK, yards: YARDS_OK, place: 1, totalStrokes: 75, points: 60, rounds: {} };
    const novo   = { par: [],     yards: ZEROS,    place: 0, totalStrokes: 0,  points: 0,  rounds: {} };
    const out = mergeTournament(antigo, novo);
    expect(out.par).toEqual(PAR_OK);
    expect(out.yards).toEqual(YARDS_OK);
    expect(out.place).toBe(1);
    expect(out.totalStrokes).toBe(75);
    expect(out.points).toBe(60);
  });

  it('une rondas em vez de substituir o bloco', () => {
    const antigo = { rounds: { 1: { strokes: STROKES_OK, gross: 70, holes: 18 } } };
    const novo   = { rounds: { 2: { strokes: STROKES_OK, gross: 71, holes: 18 } } };
    const out = mergeTournament(antigo, novo);
    expect(Object.keys(out.rounds).sort()).toEqual(['1', '2']);
    expect(out.rounds[1].gross).toBe(70);
    expect(out.rounds[2].gross).toBe(71);
  });
});

describe('mergeTournamentMaps', () => {
  it('une torneios dos dois lados sem perder nenhum', () => {
    const cache = { 21650: { place: 1, rounds: {} }, 22080: { par: PAR_OK, rounds: {} } };
    const novos = { 22080: { par: [], rounds: {} },  22090: { place: 2, rounds: {} } };
    const out = mergeTournamentMaps(cache, novos);
    expect(Object.keys(out).sort()).toEqual(['21650', '22080', '22090']);
    expect(out[22080].par).toEqual(PAR_OK);   // degradação bloqueada
    expect(out[21650].place).toBe(1);         // torneio só em cache sobrevive
    expect(out[22090].place).toBe(2);         // torneio novo entra
  });

  it('reproduz o incidente: um scrape 100% degradado não perde nada', () => {
    const cache = {
      21650: {
        par: PAR_OK, yards: YARDS_OK, place: 1, totalStrokes: 141, status: 8,
        rounds: { 1: { strokes: STROKES_OK, gross: 70, holes: 18, startTime: '09:40', group: 3 } },
      },
    };
    const degradado = {
      21650: {
        par: [], yards: ZEROS, place: 0, totalStrokes: 0, status: 0,
        rounds: { 1: { strokes: ZEROS, gross: 0, holes: 0, startTime: '08:00', group: 0 } },
      },
    };
    expect(mergeTournamentMaps(cache, degradado)).toEqual(cache);
  });

  it('aceita mapas em falta', () => {
    expect(mergeTournamentMaps(null, { 1: { rounds: {} } })).toHaveProperty('1');
    expect(mergeTournamentMaps({ 1: { rounds: {} } }, null)).toHaveProperty('1');
  });
});

describe('roundCompleteness', () => {
  it('ordena rondas por informação real', () => {
    const cheia = { strokes: STROKES_OK, gross: 70, holes: 18 };
    const vazia = { strokes: ZEROS, gross: 0, holes: 0 };
    expect(roundCompleteness(cheia)).toBeGreaterThan(roundCompleteness(vazia));
    expect(roundCompleteness(undefined)).toBe(-1);
  });
});
