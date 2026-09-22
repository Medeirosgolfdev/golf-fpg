// Evian Juniors Cup: nomes "APELIDO Nome (+HCP)" e escalões pelo tee de saída.
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { cleanTeeName, splitByTee, parsePlayerTees, applyTeeCards } = require('./scrape-golfgenius-node.js');

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

describe('splitByTee — casos-limite', () => {
  it('leaderboard vazio não deixa o ficheiro sem divisões', () => {
    const out = { divisions: [{ division: 'Evian', players: [] }] };
    expect(splitByTee(out, new Map([['a b', 'White']]), { White: 'Boys' })).toBe(0);
    expect(out.divisions).toHaveLength(1);
  });
  it('o tee lido do leaderboard misto só fica no escalão desse tee', () => {
    const out = { divisions: [{ division: 'Evian', teeName: 'White', meters: [1], courseRating: 73, slope: 149, cardSource: 'gg-tee-card',
      players: [{ name: 'A Boy', rounds: [] }, { name: 'B Girl', rounds: [] }] }] };
    splitByTee(out, new Map([['a boy', 'White'], ['b girl', 'Blue']]), { White: 'Boys', Blue: 'Girls' });
    const [boys, girls] = out.divisions;
    expect([boys.teeName, boys.courseRating]).toEqual(['White', 73]);
    expect([girls.teeName, girls.courseRating, girls.meters]).toEqual(['Blue', null, null]);
  });
});

describe('applyTeeCards — CR/slope por omissão', () => {
  it('tira o CR/slope quando tees de comprimentos diferentes têm todos a mesma avaliação', async () => {
    const mk = (division, m) => ({ division, meters: Array(18).fill(m), courseRating: 72, slope: 144, cardSource: 'gg-tee-card', players: [] });
    const out = { divisions: [mk('Boys 10-11', 300), mk('Girls 10-12', 270)] };
    await applyTeeCards(out);
    expect(out.divisions.map((d) => [d.courseRating, d.slope, d.meters[0]])).toEqual([[null, null, 300], [null, null, 270]]);
  });
  it('mantém avaliações diferentes por tee', async () => {
    const out = { divisions: [
      { division: 'Boys', meters: Array(18).fill(320), courseRating: 73, slope: 149, cardSource: 'gg-tee-card', players: [] },
      { division: 'Girls', meters: Array(18).fill(290), courseRating: 74, slope: 150, cardSource: 'gg-tee-card', players: [] },
    ] };
    await applyTeeCards(out);
    expect(out.divisions.map((d) => d.courseRating)).toEqual([73, 74]);
  });
});
