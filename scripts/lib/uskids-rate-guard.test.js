/**
 * Defesas do monitor de field USKids — casos reais do incidente de 2026-09-12
 * e da queda LEGÍTIMA de 2026-08-01, que é a que distingue uma guarda útil de
 * uma que congela o ficheiro em silêncio.
 */
import { describe, it, expect } from 'vitest';
import {
  ehRateLimit, erroRateLimit, deveVarrerProfundo,
  inscritosPorTorneio, perdaNosComuns, deveRecusarEscrita,
  PERDA_MAXIMA, DIAS_VARREDURA_PROFUNDA,
} from './uskids-rate-guard.js';

const torneio = (t, inscritos) => ({
  t,
  escaloes: inscritos === 0 ? [] : [{ nome: 'Boys 12', jogadores: Array.from({ length: inscritos }, (_, i) => ({ nome: `J${i}` })) }],
});

describe('ehRateLimit', () => {
  it('reconhece o corpo real do signupanytime', () => {
    // É assim que chega: texto cru, HTTP 200.
    expect(ehRateLimit('Too many requests')).toBe(true);
    expect(ehRateLimit('Too Many Requests. Please try again later.')).toBe(true);
  });

  it('não confunde com JSON válido nem com corpo vazio', () => {
    expect(ehRateLimit('{"tournament":{"name":"Venice Open"}}')).toBe(false);
    expect(ehRateLimit('')).toBe(false);
    expect(ehRateLimit(null)).toBe(false);
    expect(ehRateLimit(undefined)).toBe(false);
    expect(ehRateLimit('<html>500</html>')).toBe(false);
  });

  it('erroRateLimit é distinguível de uma falha de rede', () => {
    expect(erroRateLimit().rateLimited).toBe(true);
    expect(new Error('ECONNRESET').rateLimited).toBeUndefined();
  });
});

describe('deveVarrerProfundo', () => {
  it('corre na primeira vez (cache sem marca)', () => {
    expect(deveVarrerProfundo({ ultima: null, hoje: '2026-09-12' }).correr).toBe(true);
  });

  it('não corre dentro do intervalo', () => {
    const r = deveVarrerProfundo({ ultima: '2026-09-10', hoje: '2026-09-12' });
    expect(r.correr).toBe(false);
    expect(r.dias).toBe(2);
  });

  it('corre ao fim do intervalo', () => {
    expect(deveVarrerProfundo({ ultima: '2026-09-05', hoje: '2026-09-12' }).correr).toBe(true);
    // …e a fronteira do intervalo é inclusiva
    expect(deveVarrerProfundo({ ultima: '2026-09-06', hoje: '2026-09-12' }).correr).toBe(false);
  });

  it('--full-scan corre sempre', () => {
    const r = deveVarrerProfundo({ ultima: '2026-09-12', hoje: '2026-09-12', forcar: true });
    expect(r.correr).toBe(true);
    expect(r.porque).toBe('--full-scan');
  });

  it('a cadência é semanal', () => {
    expect(DIAS_VARREDURA_PROFUNDA).toBe(7);
  });
});

describe('perdaNosComuns — os dois casos REAIS do histórico', () => {
  it('2026-08-01: total cai 39% mas é legítimo (um torneio saiu do radar)', () => {
    // Medido nos commits 15e86241fc → 4f43ac324a: 19→18 torneios, 1500→916
    // inscritos. O que saiu foi UM evento já jogado, com 587 inscritos.
    const antes = [torneio(1, 587), torneio(2, 500), torneio(3, 413)];
    const novo  = [torneio(2, 500), torneio(3, 416)];   // nos comuns até subiu
    const r = perdaNosComuns(antes, novo);
    expect(r.comuns).toBe(2);
    expect(r.perda).toBeLessThanOrEqual(0);
    expect(deveRecusarEscrita(antes, novo).recusar).toBe(false);
  });

  it('2026-09-12: os mesmos torneios ficam a zero — recusa', () => {
    const antes = [torneio(1, 1000), torneio(2, 1018)];
    const novo  = [torneio(1, 0), torneio(2, 0)];       // rate limit em 87/87
    const r = deveRecusarEscrita(antes, novo);
    expect(r.perda).toBe(1);
    expect(r.recusar).toBe(true);
  });
});

describe('perdaNosComuns — restantes', () => {
  it('build idêntico grava', () => {
    const d = [torneio(1, 50), torneio(2, 30)];
    expect(deveRecusarEscrita(d, d).recusar).toBe(false);
  });

  it('perda dentro do limiar grava, acima recusa', () => {
    const antes = [torneio(1, 100)];
    expect(deveRecusarEscrita(antes, [torneio(1, 75)]).recusar).toBe(false);  // −25%
    expect(deveRecusarEscrita(antes, [torneio(1, 60)]).recusar).toBe(true);   // −40%
  });

  it('--force grava de qualquer maneira', () => {
    const antes = [torneio(1, 100)];
    expect(deveRecusarEscrita(antes, [torneio(1, 0)], { forcar: true }).recusar).toBe(false);
  });

  it('sem base de comparação não acusa (disco vazio ou radar novo)', () => {
    expect(deveRecusarEscrita([], [torneio(1, 50)]).recusar).toBe(false);
    // radar totalmente renovado: nenhum torneio em comum
    expect(deveRecusarEscrita([torneio(1, 99)], [torneio(2, 1)]).recusar).toBe(false);
  });

  it('torneios NOVOS não mascaram a perda nos que já seguíamos', () => {
    // Sem o corte aos comuns, um torneio novo grande escondia o colapso dos outros.
    const antes = [torneio(1, 500)];
    const novo  = [torneio(1, 0), torneio(9, 500)];
    expect(deveRecusarEscrita(antes, novo).recusar).toBe(true);
  });

  it('o limiar é 30%', () => {
    expect(PERDA_MAXIMA).toBe(0.30);
  });
});

describe('inscritosPorTorneio', () => {
  it('soma os escalões e aceita torneios vazios', () => {
    const m = inscritosPorTorneio([
      { t: 1, escaloes: [{ jogadores: [1, 2] }, { jogadores: [3] }] },
      { t: 2, escaloes: [] },
      { t: 3 },
    ]);
    expect(m.get(1)).toBe(3);
    expect(m.get(2)).toBe(0);
    expect(m.get(3)).toBe(0);
  });
});
