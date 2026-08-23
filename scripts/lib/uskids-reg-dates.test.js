import { describe, it, expect } from 'vitest';
import {
  inicioMonitorizacao, extrairAncoras, fundirAncoras, estimarDia, aplicarDatasInscricao,
} from './uskids-reg-dates.js';

const jog = (nome, pid, firstSeen) => ({ nome, pid, firstSeen });
const torn = (t, jogadores) => ({ t, escaloes: [{ nome: 'Boys 12', jogadores }] });

describe('inicioMonitorizacao', () => {
  it('é o firstSeen mais antigo do torneio', () => {
    expect(inicioMonitorizacao(torn(1, [
      jog('A', 100, '2026-05-10T09:00:00Z'),
      jog('B', 200, '2026-06-01T09:00:00Z'),
    ]))).toBe('2026-05-10');
  });
  it('null quando não há firstSeen', () => {
    expect(inicioMonitorizacao(torn(1, [{ nome: 'A', pid: 1 }]))).toBeNull();
  });
});

describe('extrairAncoras', () => {
  it('ignora o bulk do primeiro dia e aceita os que apareceram depois', () => {
    const a = extrairAncoras([torn(1, [
      jog('A', 100, '2026-05-10T09:00:00Z'),   // bulk — já lá estava
      jog('B', 110, '2026-05-10T09:00:00Z'),   // bulk
      jog('C', 300, '2026-06-01T09:00:00Z'),   // apareceu depois → âncora
    ])]);
    expect(a).toEqual([{ pid: 300, dia: '2026-06-01' }]);
  });
  it('salta jogadores sem pid', () => {
    expect(extrairAncoras([torn(1, [
      jog('A', 100, '2026-05-10T09:00:00Z'),
      { nome: 'B', firstSeen: '2026-06-01T09:00:00Z' },
    ])])).toEqual([]);
  });
});

describe('fundirAncoras', () => {
  it('dedup por pid ficando a data mais antiga', () => {
    expect(fundirAncoras(
      [{ pid: 10, dia: '2026-06-05' }],
      [{ pid: 10, dia: '2026-06-01' }],
    )).toEqual([{ pid: 10, dia: '2026-06-01' }]);
  });
  it('força monotonia (a data nunca recua com o pid)', () => {
    expect(fundirAncoras([], [
      { pid: 10, dia: '2026-06-10' },
      { pid: 20, dia: '2026-06-01' },   // ruído: recua
      { pid: 30, dia: '2026-06-20' },
    ])).toEqual([
      { pid: 10, dia: '2026-06-10' },
      { pid: 20, dia: '2026-06-10' },
      { pid: 30, dia: '2026-06-20' },
    ]);
  });
});

describe('estimarDia', () => {
  const anc = [
    { pid: 1000, dia: '2026-06-01' },
    { pid: 2000, dia: '2026-06-11' },   // 100 pids/dia
  ];
  it('interpola dentro do intervalo', () => {
    expect(estimarDia(1500, anc)).toEqual({ dia: '2026-06-06', fora: false });
  });
  it('extrapola abaixo e marca fora', () => {
    expect(estimarDia(500, anc)).toEqual({ dia: '2026-05-27', fora: true });
  });
  it('extrapola acima e marca fora', () => {
    expect(estimarDia(2500, anc)).toEqual({ dia: '2026-06-16', fora: true });
  });
  it('null sem âncoras suficientes', () => {
    expect(estimarDia(1500, [{ pid: 1000, dia: '2026-06-01' }])).toBeNull();
    expect(estimarDia(null, anc)).toBeNull();
  });
});

describe('aplicarDatasInscricao', () => {
  const anc = [
    { pid: 1000, dia: '2026-06-01' },
    { pid: 2000, dia: '2026-06-11' },
  ];
  it('marca observado quem apareceu depois do arranque e estima o resto', () => {
    const ts = [torn(1, [
      jog('bulk', 1500, '2026-05-20T09:00:00Z'),
      jog('novo', 1800, '2026-06-08T09:00:00Z'),
    ])];
    const r = aplicarDatasInscricao(ts, anc);
    const [bulk, novo] = ts[0].escaloes[0].jogadores;
    expect(novo).toMatchObject({ regDia: '2026-06-08', regObs: true });
    expect(bulk).toMatchObject({ regDia: '2026-06-06', regObs: false });
    expect(r).toMatchObject({ obs: 1, est: 1 });
  });
  it('torneio novo (todos com firstSeen de hoje) fica todo estimado', () => {
    const ts = [torn(9, [
      jog('A', 1200, '2026-08-23T09:00:00Z'),
      jog('B', 1900, '2026-08-23T09:00:00Z'),
    ])];
    aplicarDatasInscricao(ts, anc);
    const [a, b] = ts[0].escaloes[0].jogadores;
    expect(a).toMatchObject({ regDia: '2026-06-03', regObs: false });
    expect(b).toMatchObject({ regDia: '2026-06-10', regObs: false });
  });
  it('sem pid nem âncora útil não inventa data', () => {
    const ts = [torn(9, [{ nome: 'X', firstSeen: '2026-08-23T09:00:00Z' }])];
    aplicarDatasInscricao(ts, anc);
    expect(ts[0].escaloes[0].jogadores[0].regDia).toBeUndefined();
  });
});
