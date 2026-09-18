/**
 * Testes das regras de seguimento da carreira dos rivais USKids.
 */
import { describe, it, expect } from "vitest";
import {
  idadesDoEscalao, escalaoDaGeracao, anoDaData, associarPorOrdem, escaloesPelaOrdem, podeEntrar, mesmoNome,
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

describe('escalaoDaGeracao (gerações 2012-2015)', () => {
  it('2026: Boys 10 a 14 (2015 com a data de corte cai nos Boys 10)', () => {
    expect(escalaoDaGeracao('Boys 11', 2026)).toBe(true);   // Marco Simone 2026 (Manuel)
    expect(escalaoDaGeracao('Boys 12', 2026)).toBe(true);   // European/Venice 2026 (Manuel)
    expect(escalaoDaGeracao('Boys 13-14', 2026)).toBe(true); // 2012-2013, vai cruzar-se com ele
    expect(escalaoDaGeracao('Boys 10', 2026)).toBe(true);
    expect(escalaoDaGeracao('Boys 9', 2026)).toBe(false);
    expect(escalaoDaGeracao('Boys 15-18', 2026)).toBe(false);
  });
  it('2025: Boys 9 a 13', () => {
    expect(escalaoDaGeracao('Boys 11', 2025)).toBe(true);   // Venice/Rome 2025 (Manuel)
    expect(escalaoDaGeracao('Boys 13', 2025)).toBe(true);
    expect(escalaoDaGeracao('Boys 14', 2025)).toBe(false);
    expect(escalaoDaGeracao('Boys 8', 2025)).toBe(false);
  });
  it('2023: Boys 7 a 11 (El Prat)', () => {
    expect(escalaoDaGeracao('Boys 9', 2023)).toBe(true);
    expect(escalaoDaGeracao('Boys 7 & Under', 2023)).toBe(true);
    expect(escalaoDaGeracao('Boys 6 & Under', 2023)).toBe(false);
    expect(escalaoDaGeracao('Boys 12', 2023)).toBe(false);
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

  it('gralhas no primeiro nome passam, nomes diferentes não (casos reais, World 2019)', () => {
    expect(mesmoNome('Alexander Dunmall', 'Alexaner Dunmall')).toBe(true);
    expect(mesmoNome('Samuel Perrodin', 'Sameul Perrodin')).toBe(true);
    expect(mesmoNome('Benji Botham', 'Harley Botham')).toBe(false);
    expect(mesmoNome('Thomas Wu', 'Siyang Wu')).toBe(false);
    expect(mesmoNome('Ivan Smith', 'Ivy Smith')).toBe(false); // curtos: sem tolerância
    expect(mesmoNome('Samuel Rogers', 'Sam Rogers')).toBe(true); // diminutivo
    expect(mesmoNome('Carson Ayuso', 'Cruz Ayuso')).toBe(false);
  });

  it('irmãos com o mesmo apelido: liga pelo nome, não pela posição (World 2019)', () => {
    const b = [[{ first: 'Clarkson', last: 'Johnson' }, { first: 'Jaxon', last: 'Johnson' }, { first: 'Zed', last: 'Young' }]];
    // A USKids pôs o Jaxon primeiro; nós ordenamos Clarkson primeiro.
    const r = associarPorOrdem([1, 2, 3], b, (m) => (m === '1' ? 'Jaxon Johnson' : null));
    expect(r.motivo).toBeNull();
    expect(r.mapa['1'].name).toBe('Jaxon Johnson');
    expect(r.mapa['2'].name).toBe('Clarkson Johnson'); // sobrou um nome e um miúdo
    expect(r.mapa['3'].name).toBe('Zed Young');
  });

  it('irmãos sem nenhum conhecido: ficam sem nome (não se adivinha)', () => {
    const b = [[{ first: 'Clarkson', last: 'Johnson' }, { first: 'Jaxon', last: 'Johnson' }]];
    const r = associarPorOrdem([1, 2], b);
    expect(r.motivo).toBeNull();
    expect(r.mapa).toEqual({});
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

describe('escaloesPelaOrdem', () => {
  // Forma real do GetMeta (Venice 2026 abreviado): flights pela ordem, com `registered`.
  const meta = {
    flights: {
      '1': { age_group: 12, registered: '2' },
      '2': { age_group: 20, registered: '1' },
    },
    age_groups: { 12: { name: 'Boys 12' }, 20: { name: 'Girls 12' } },
  };

  it('corta a lista em blocos pelo número de inscritos de cada flight', () => {
    const { mapa, motivo } = escaloesPelaOrdem(meta, [11, 12, 21]);
    expect(motivo).toBeNull();
    expect(mapa).toEqual({ '11': 'Boys 12', '12': 'Boys 12', '21': 'Girls 12' });
  });

  it('confirma contra escalões já sabidos; uma discordância anula tudo', () => {
    expect(escaloesPelaOrdem(meta, [11, 12, 21], (m) => (m === '21' ? 'Girls 12' : null)).motivo).toBeNull();
    const r = escaloesPelaOrdem(meta, [11, 12, 21], (m) => (m === '12' ? 'Girls 12' : null));
    expect(r.mapa).toEqual({});
    expect(r.motivo).toMatch(/discordância/);
  });

  it('soma diferente da lista → nada (não adivinha)', () => {
    const r = escaloesPelaOrdem(meta, [11, 12]);
    expect(r.mapa).toEqual({});
    expect(r.motivo).toMatch(/contagens/);
  });
});

describe('podeEntrar (regra de entrada, substitui o top-5)', () => {
  it('gerações 2012-2015 entram em qualquer torneio seguido', () => {
    expect(podeEntrar('Boys 12', 2026)).toBe(true);
    expect(podeEntrar('Boys 13-14', 2026)).toBe(true);
    expect(podeEntrar('Boys 9', 2023)).toBe(true);
  });
  it('mais velhos, mais novos e edições antigas ficam de fora', () => {
    expect(podeEntrar('Boys 15-18', 2026)).toBe(false);
    expect(podeEntrar('Boys 7 & Under', 2026)).toBe(false);
    expect(podeEntrar('Boys 12', 2016)).toBe(false);   // nascidos em 2004
    expect(podeEntrar('Boys 8', 2025)).toBe(false);
  });
  it('torneios do Manuel e lista "todos": Boys 10-13 entram, os outros não', () => {
    expect(podeEntrar('Boys 10', 2025, { torneioDoManuel: true })).toBe(true);  // n. 2015, já pela geração
    expect(podeEntrar('Boys 13', 2024, { listaTodos: true })).toBe(true);        // n. 2011
    expect(podeEntrar('Boys 13', 2024)).toBe(false);
    expect(podeEntrar('Boys 7', 2026, { listaTodos: true })).toBe(false);
    expect(podeEntrar('Boys 15-18', 2026, { torneioDoManuel: true })).toBe(false);
  });
  it('raparigas nunca', () => {
    expect(podeEntrar('Girls 12', 2026, { torneioDoManuel: true })).toBe(false);
  });
});
