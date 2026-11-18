/**
 * HCP da ficha no juniors-scout.json (`h`), 18/11/2026: o Scout mostrava o da federação sem
 * data (Maxence Donnarel 4,5 da FFG; Leon Schneitter «–») e o Draw, pelo histórico `hh`, 3,8 e
 * 7,2 — dois valores na mesma app. Regra: o da FPG; senão o mais recente de `hh`; só sem
 * histórico o da federação sem data.
 */
import { describe, it, expect } from 'vitest';
const { buildScout } = require('./scout');

const prova = { id: 't1', date: '2026-10-01', name: 'Prova', flights: [] };
const jr = (id, extra) => ({ id, name: id, tournamentIds: ['t1'], sources: {}, ...extra });

describe('buildScout — HCP da ficha', () => {
  const out = buildScout([
    jr('ffg', { sources: { ffgolf: { hcp: 4.5 } }, hcpHistory: [{ date: '2026-10-10', hcpExact: 4.5 }, { date: '2026-11-01', hcpExact: 3.8 }] }),
    jr('soHist', { hcpHistory: [{ date: '2026-10-03', hcpExact: 7.2 }] }),
    jr('fpg', { sources: { fpg: { hcpExact: 6.4 } }, hcpHistory: [{ date: '2026-11-10', hcpExact: 6.8 }] }),
    jr('semHist', { sources: { ffgolf: { hcp: 12.1 } } }),
    // O da federação com data mais recente do que o histórico ganha-lhe.
    jr('fedNovo', { sources: { ffgolf: { hcp: 4.1, hcpDate: '2026-11-12' } }, hcpHistory: [{ date: '2026-11-01', hcpExact: 3.8 }] }),
  ], [prova], '2026-11-18T12:00:00.000Z').players;

  it('o mais recente do histórico ganha ao da federação sem data', () => {
    expect(out.ffg.h).toBe(3.8);
    expect(out.ffg.hh[0]).toEqual(['2026-11-01', 3.8]);
  });
  it('sem federação, o do histórico', () => { expect(out.soHist.h).toBe(7.2); });
  it('o da FPG (oficial, de hoje) ganha sempre', () => { expect(out.fpg.h).toBe(6.4); });
  it('sem histórico, o da federação', () => { expect(out.semHist.h).toBe(12.1); });
  it('o da federação entra no histórico com a sua data', () => {
    expect(out.fedNovo.h).toBe(4.1);
    expect(out.fedNovo.hh[0]).toEqual(['2026-11-12', 4.1]);
  });
});
