// Importador FFG → JobFile: reparação de acentos perdidos e labels de escalão.
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { resolveName, divisionLabel, roundDate } = require('./import-ffgolf-jobfile.js');

const pool = [
  { name: 'Amélia Gabin', key: 'amelia gabin', country: 'PT' },
  { name: 'Anaïs Nicolas', key: 'anais nicolas', country: 'FR' },
  { name: 'Anaïs Nicolau', key: 'anais nicolau', country: 'ES' },
];

describe('resolveName', () => {
  it('repara o acento que a FFG trocou por espaço quando há um só candidato', () => {
    const r = resolveName({ namePrenom: 'Am lia', nameNom: 'GABIN' }, pool);
    expect(r.name).toBe('Amélia Gabin');
    expect([...r.hit.countries]).toEqual(['PT']);
  });
  it('não mexe sem candidato único', () => {
    expect(resolveName({ namePrenom: 'Ol via', nameNom: 'GRACHOV' }, pool).name).toBe('Ol Via Grachov');
  });
  it('nomes normais só passam a Nome Apelido', () => {
    expect(resolveName({ namePrenom: 'Martim', nameNom: 'JOHANSEN' }, pool)).toEqual({ name: 'Martim Johansen', repaired: false });
  });
});

describe('divisionLabel / roundDate', () => {
  it('séries FFG → labels do GolfGenius', () => {
    expect(divisionLabel({ label: '1ère Série Messieurs' })).toBe('Boys');
    expect(divisionLabel({ label: '1ère Série Dames' })).toBe('Girls');
  });
  it('datas por ronda no formato do GG', () => {
    expect(roundDate('20/09/2022', 2)).toEqual({ iso: '2022-09-22', label: 'Thu, September 22' });
  });
});
