/**
 * Testes das regras de seguimento da carreira dos rivais USKids.
 */
import { describe, it, expect } from "vitest";
import {
  idadesDoEscalao, escalaoDaGeracao, anoDaData, associarPorOrdem,
} from "./uskids-geracao.js";

describe('idadesDoEscalao', () => {
  it('lê idades simples, intervalos e "& Under"', () => {
    expect(idadesDoEscalao('Boys 12')).toEqual([12, 12]);
    expect(idadesDoEscalao('Boys 13-14')).toEqual([13, 14]);
    expect(idadesDoEscalao('Boys 7 & Under')).toEqual([0, 7]);
    expect(idadesDoEscalao('Boys 6 & Under')).toEqual([0, 6]);
    expect(idadesDoEscalao('')).toBeNull();
  });
});

describe('escalaoDaGeracao (Manuel, n. 2014)', () => {
  it('2026: Boys 11 e Boys 12 (a data de corte varia entre torneios)', () => {
    expect(escalaoDaGeracao('Boys 11', 2026)).toBe(true);   // Marco Simone 2026
    expect(escalaoDaGeracao('Boys 12', 2026)).toBe(true);   // European/Venice 2026
    expect(escalaoDaGeracao('Boys 10', 2026)).toBe(false);
    expect(escalaoDaGeracao('Boys 13', 2026)).toBe(false);
  });
  it('2025: Boys 10 e Boys 11', () => {
    expect(escalaoDaGeracao('Boys 11', 2025)).toBe(true);   // Venice/Rome 2025
    expect(escalaoDaGeracao('Boys 12', 2025)).toBe(false);
  });
  it('2023: Boys 8 e Boys 9 (El Prat)', () => {
    expect(escalaoDaGeracao('Boys 9', 2023)).toBe(true);
    expect(escalaoDaGeracao('Boys 8', 2023)).toBe(true);
  });
  it('intervalos de idades contam', () => {
    expect(escalaoDaGeracao('Boys 13-14', 2027)).toBe(true); // 13 ou 12
    expect(escalaoDaGeracao('Boys 7 & Under', 2021)).toBe(true);
  });
  it('raparigas e anos desconhecidos nunca', () => {
    expect(escalaoDaGeracao('Girls 12', 2026)).toBe(false);
    expect(escalaoDaGeracao('Boys 12', null)).toBe(false);
  });
});

describe('anoDaData', () => {
  it('formatos USKids', () => {
    expect(anoDaData('12/21/2026')).toBe(2026);
    expect(anoDaData('2025-10-03')).toBe(2025);
    expect(anoDaData('')).toBeNull();
  });
});

describe('associarPorOrdem', () => {
  // Formato real: flights pela ordem do GetMeta, alfabético dentro de cada uma.
  const b10 = [{ first: 'Zed', last: 'Young' }, { first: 'Ann', last: 'Adams' }];
  const b12 = [{ first: 'Tripp', last: 'West', country: 'us' }, { first: 'Noah Birk', last: 'Andersen', country: 'dk' }];
  const mids = [101, 102, 201, 202]; // Adams, Young | Andersen, West

  it('associa bloco a bloco, por apelido', () => {
    const { mapa, motivo } = associarPorOrdem(mids, [b10, b12]);
    expect(motivo).toBeNull();
    expect(mapa['101'].name).toBe('Ann Adams');
    expect(mapa['102'].name).toBe('Zed Young');
    expect(mapa['201']).toEqual({ name: 'Noah Birk Andersen', country: 'DK', place: '' });
    expect(mapa['202'].name).toBe('Tripp West');
  });

  it('confirma contra nomes já conhecidos (espaços e maiúsculas não contam)', () => {
    const conhecido = (m) => ({ '201': 'noah  birk andersen', '102': '?' }[m] || null);
    const r = associarPorOrdem(mids, [b10, b12], conhecido);
    expect(r.motivo).toBeNull();
    expect(r.confirmados).toBe(1);
  });

  it('pontuação e acentos não contam (caso real do Holiday Classic 2026)', () => {
    const b = [[{ first: 'Humberto (Tres)', last: 'Izquierdo, III' }, { first: 'José', last: 'Zúñiga' }]];
    const conhecido = (m) => ({ '1': 'Humberto "Tres" Izquierdo, III', '2': 'Jose Zuniga' }[m] || null);
    const r = associarPorOrdem([1, 2], b, conhecido);
    expect(r.motivo).toBeNull();
    expect(r.confirmados).toBe(2);
  });

  it('versões do mesmo nome contam como iguais (caso real do Spanish Open 2026)', () => {
    const b = [[{ first: 'Martín', last: 'Troccoli-Vivas' }]];
    const r = associarPorOrdem([7], b, () => 'Martín Andrés  Troccoli Vivas');
    expect(r.motivo).toBeNull();
    expect(r.confirmados).toBe(1);
  });

  it('uma discordância anula tudo', () => {
    const r = associarPorOrdem(mids, [b10, b12], (m) => (m === '202' ? 'Tom Wells' : null));
    expect(r.mapa).toEqual({});
    expect(r.motivo).toMatch(/discordância/);
  });

  it('contagens diferentes → nada (não adivinha)', () => {
    const r = associarPorOrdem([101, 102, 201], [b10, b12]);
    expect(r.mapa).toEqual({});
    expect(r.motivo).toMatch(/contagens/);
  });
});
