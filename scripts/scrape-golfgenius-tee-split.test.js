// Evian Juniors Cup: nomes "APELIDO Nome (+HCP)" e escalões pelo tee de saída.
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { cleanTeeName, splitByTee, parsePlayerTees } = require('./scrape-golfgenius-node.js');

describe('cleanTeeName', () => {
  it('tira o HCP (plus → negativo) e passa o apelido para o fim', () => {
    expect(cleanTeeName('DIAS Santiago (+1.3)')).toEqual({ name: 'Santiago Dias', hcp: -1.3 });
    expect(cleanTeeName('SILVA PINTO Margarida (4.9)')).toEqual({ name: 'Margarida Silva Pinto', hcp: 4.9 });
    expect(cleanTeeName('AL-KHAFFAF Benjamin (1.2)')).toEqual({ name: 'Benjamin Al-Khaffaf', hcp: 1.2 });
  });
  it('deixa nomes normais intactos', () => {
    expect(cleanTeeName('Xavier Good')).toEqual({ name: 'Xavier Good', hcp: null });
  });
});

describe('parsePlayerTees', () => {
  it('lê o tee da tabela por jogador', () => {
    const html = "<tr class='player_row' data-course-id='1'><td class='player_name'>SANTOS Laura (1.5) <span class='tee_abbr'></span></td><td>11:55</td><td>Blue</td><td>X + Y</td></tr>";
    expect([...parsePlayerTees(html)]).toEqual([['laura santos', 'Blue']]);
  });
});

describe('splitByTee', () => {
  const mk = (name, pos, total) => ({ name, pos, total, rounds: [] });
  it('parte por tee, marca o sexo e renumera as posições dentro do escalão', () => {
    const out = { divisions: [{
      division: 'Evian', players: [mk('A Boy', '1', 70), mk('B Girl', '2', 71), mk('C Boy', 'T3', 72), mk('D Girl', 'T3', 72), mk('E Boy', '5', 72), mk('F Nada', '6', 80)],
      draws: { 1: { round: 1, groups: [{ time: '8:00', players: [{ name: 'A Boy' }, { name: 'C Boy' }] }, { time: '8:10', players: [{ name: 'B Girl' }] }] } },
    }] };
    const tees = new Map([['a boy', 'White'], ['c boy', 'White'], ['e boy', 'White'], ['b girl', 'Blue'], ['d girl', 'Blue']]);
    expect(splitByTee(out, tees, { White: 'Boys U14', Blue: 'Girls U14' })).toBe(3);
    const [boys, girls, rest] = out.divisions;
    expect(boys.division).toBe('Boys U14');
    expect(boys.players.map((p) => `${p.pos} ${p.name} ${p.sex}`)).toEqual(['1 A Boy M', 'T2 C Boy M', 'T2 E Boy M']);
    expect(girls.players.map((p) => `${p.pos} ${p.name} ${p.sex}`)).toEqual(['1 B Girl F', '2 D Girl F']);
    expect(boys.draws[1].groups).toHaveLength(1);
    expect(girls.draws[1].groups[0].time).toBe('8:10');
    // Sem tee conhecido → fica no label original, sem sexo inventado.
    expect(rest.division).toBe('Evian');
    expect(rest.players[0].sex).toBeUndefined();
  });
});
