// Classificação mista (Overall Leaderboard): cada jogador fica com o tee da sua
// divisão. Na Grand Final Faldo 2026 o cartão do Overall saiu de duas raparigas
// e os rapazes ficaram com o White (5.226 m, CR 67.5) em vez do Black.
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { applyOwnDivisionTee } = require('./scrape-golfgenius-node.js');

const volta = () => [{ day: 1, date: 'Tue, November 17', scores: Array(18).fill(4), gross: 72 }];
const black = { teeName: 'Black', meters: Array(18).fill(370), courseRating: 72.7, slope: 135 };
const white = { teeName: 'White', meters: Array(18).fill(310), courseRating: 67.5, slope: 129 };

function prova() {
  return {
    divisions: [
      { division: 'Boys 16 & Under', ...black, players: [{ name: 'Rapaz Um', rounds: volta() }] },
      { division: 'Boys WAGR', ...black, players: [{ name: 'Rapaz Um', rounds: volta() }, { name: 'Rapaz Dois', rounds: volta() }] },
      { division: 'Girls 16 & Under', ...white, players: [{ name: 'Rapariga Um', rounds: volta() }] },
      { division: 'Overall Leaderboard', ...white, players: [
        { name: 'Rapariga Um', rounds: volta() }, { name: 'Rapaz Um', rounds: volta() }, { name: 'Rapaz Dois', rounds: volta() },
      ] },
    ],
  };
}

describe('applyOwnDivisionTee', () => {
  it('os rapazes do Overall levam o Black, volta a volta', () => {
    const out = prova();
    applyOwnDivisionTee(out);
    const ov = out.divisions[3].players;
    for (const nome of ['Rapaz Um', 'Rapaz Dois']) {
      const r = ov.find((p) => p.name === nome).rounds[0];
      expect(r.teeName).toBe('Black');
      expect(r.courseRating).toBe(72.7);
      expect(r.slope).toBe(135);
      expect(r.meters[0]).toBe(370);
    }
  });
  it('as raparigas do Overall e as divisões próprias não mudam', () => {
    const out = prova();
    applyOwnDivisionTee(out);
    expect(out.divisions[3].players.find((p) => p.name === 'Rapariga Um').rounds[0].teeName).toBeUndefined();
    expect(out.divisions[0].players[0].rounds[0].teeName).toBeUndefined();
    expect(out.divisions[1].players[0].rounds[0].teeName).toBeUndefined();
  });
  it('quem só está no WAGR e no Overall não herda o tee do Overall', () => {
    const out = prova();
    applyOwnDivisionTee(out);
    expect(out.divisions[1].players.find((p) => p.name === 'Rapaz Dois').rounds[0].teeName).toBeUndefined();
  });
});

// Idade lida no GolfGenius («14 AGE») → ano de nascimento estimado (dois anos).
const { birthFromAge } = require('./scrape-golfgenius-node.js');
describe('birthFromAge', () => {
  it('14 anos a 17/11/2026 → nascido em 2011 ou 2012, com a nota da fonte', () => {
    const out = { divisions: [{ players: [{ name: 'A', age: 14, ageDate: '2026-11-17' }, { name: 'B', age: 14, ageDate: '2026-11-17', dob: '2012-05-29' }] }] };
    expect(birthFromAge(out)).toBe(1);
    const [a, b] = out.divisions[0].players;
    expect([a.birthYearEst, a.birthYearEstMax]).toEqual([2011, 2012]);
    expect(a.estNote).toBe('GolfGenius: 14 anos a 17/11/2026');
    expect(b.birthYearEst).toBeUndefined();
  });
});
