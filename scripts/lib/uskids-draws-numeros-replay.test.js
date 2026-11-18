/**
 * Ficheiro da consola do browser (scripts/uskids-consola.js), 18/11/2026 — as duas secções novas:
 *  • `fetch-uskids-draws.js --replay <ficheiro>`: os draws (secção «draws») viram grupos por volta
 *    no uskids-draws.json; volta que a consola não pediu = volta sem grupos; WD não entra.
 *  • `fetch-uskids-field.js --numeros <ficheiro>`: os números novos (secção «numeros») entram no
 *    catálogo, e só os que interessam na descoberta; a fronteira avança.
 *  • `fetch-uskids-results.js --replay` de um torneio A DECORRER: entra com as voltas jogadas e fica
 *    nos `parciais` do índice (a consola volta a pedi-lo); com a última volta jogada, sai de lá.
 * Corre numa pasta temporária (USKIDS_DATA_DIR), nunca em public/data.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const DRAWS = path.join(__dirname, '..', 'fetch-uskids-draws.js');
const FIELD = path.join(__dirname, '..', 'fetch-uskids-field.js');
const RESULTS = path.join(__dirname, '..', 'fetch-uskids-results.js');
const T = 999003;
const futuro = (() => { const d = new Date(Date.now() + 2 * 86400000); return `${d.getUTCMonth() + 1}/${d.getUTCDate()}/${d.getUTCFullYear()}`; })();
let dir;

const correr = (script, args) => spawnSync(process.execPath, [script, ...args], {
  env: { ...process.env, USKIDS_DATA_DIR: dir }, encoding: 'utf8',
});
const ler = (f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'uskids-draws-num-'));
  // Um torneio antigo já com draw: tem de continuar lá.
  fs.writeFileSync(path.join(dir, 'uskids-draws.json'), JSON.stringify({ torneios: [{
    t: 1, name: 'Antigo', date_inicio: '1/1/2026', date_fim: '1/2/2026', rondas_total: 1,
    escaloes: [{ age_group: 1, nome: 'Boys 12', rondas: [{ ronda: 1, grupos: [{ group_number: 1, tee_time: '08:00', start_hole: 1, course: 'X', jogadores: [{ nome: 'A', pais: 'PT', cidade: '' }] }] }] }],
  }] }));
  const j = (first, last, status, r, rd) => ({ first, last, country: 'pt', place: 'Funchal', status, rounds: { [r]: rd } });
  fs.writeFileSync(path.join(dir, 'consola.json'), JSON.stringify({
    gerado_em: '2026-11-18T10:00:00.000Z', torneios: [], respostas: {},
    draws: {
      torneios: [{ t: T, name: 'Teste Open', date_inicio: futuro, date_fim: futuro, campo: 'Campo', rondas: 3,
        alvos: [{ age_group: 5, nome: 'Boys 12', flight_id: 11, is_manuel: true, adjacent: false },
                { age_group: 4, nome: 'Boys 11', flight_id: 10, is_manuel: false, adjacent: true }] }],
      respostas: {
        // Boys 12, volta 1 em duas páginas; o WD (status 8) não entra no draw.
        'GetPlayerTeeTimes:11:1:1': { flight_players: {
          1: j('Manuel', 'Medeiros', 1, 1, { group_number: 3, start_time: '09:10', start_hole: 1, course_name: 'Old' }),
          2: j('Rival', 'Um', 1, 1, { group_number: 3, start_time: '09:10', start_hole: 1, course_name: 'Old' }),
          3: j('Saiu', 'WD', 8, 1, { group_number: 4, start_time: '09:20', start_hole: 1, course_name: 'Old' }),
        } },
        'GetPlayerTeeTimes:11:1:2': { flight_players: {
          4: j('Rival', 'Dois', 1, 1, { group_number: 4, start_time: '09:20', start_hole: 1, course_name: 'Old' }),
        } },
        // Volta 2 por publicar: todos às 08:00 com group_number 0 (Spanish Open 2026, 18/11) — não é draw.
        'GetPlayerTeeTimes:11:2:1': { flight_players: {
          1: j('Manuel', 'Medeiros', 1, 2, { group_number: 0, start_time: '08:00', start_hole: 1 }),
          2: j('Rival', 'Um', 1, 2, { group_number: 0, start_time: '08:00', start_hole: 1 }),
        } },
        'GetPlayerTeeTimes:10:1:1': { flight_players: {
          5: j('Mais', 'Novo', 1, 1, { group_number: 1, start_time: '08:30', start_hole: 10, course_name: 'Old' }),
        } },
      },
    },
    numeros: {
      inicio: 23943, fim: 23970, completo: true, vazios: [23944],
      entradas: {
        23943: { n: 'Irish Open 2027', ty: 8, tour: 'International Championships Tour', s: '6/30/2027', e: '7/1/2027', st: 1, r: 2, c: 'Campo', f: '400.00' },
        23945: { n: 'Some Golf Club', ty: 5, tour: 'Phoenix Tour', s: '1/10/2027', e: '1/10/2027', st: 1, r: 1, c: 'X', f: '95.00' },
      },
    },
  }));
  fs.writeFileSync(path.join(dir, 'uskids-discovery-cache.json'), JSON.stringify({
    torneios: [], varredura_max_t: 23967, fronteira_max_t_visto: 23942,
  }));
  fs.writeFileSync(path.join(dir, 'uskids-tcode-catalog.json'), JSON.stringify({
    gerado_em: null, backfill: { cursor: 1, piso: 1 }, buracos: {},
    entradas: { 23942: { n: 'Antigo', ty: 9, tour: 'Team Golf Tour', s: '12/13/2026' } },
  }));
});
afterAll(() => { fs.rmSync(dir, { recursive: true, force: true }); });

describe('fetch-uskids-draws.js --replay', () => {
  it('grava os grupos de cada escalão e mantém os torneios antigos', () => {
    const r = correr(DRAWS, ['--replay', path.join(dir, 'consola.json')]);
    expect(r.status, r.stderr + r.stdout).toBe(0);
    const out = ler('uskids-draws.json');
    expect(out.torneios.map(t => t.t)).toEqual([1, T]);
    const t = out.torneios.find(x => x.t === T);
    expect(t.rondas_total).toBe(3);
    const b12 = t.escaloes[0];
    expect(b12.nome).toBe('Boys 12');
    expect(b12.is_manuel).toBe(true);
    expect(b12.rondas).toHaveLength(3);
    const g = b12.rondas[0].grupos;
    expect(g.map(x => [x.tee_time, x.jogadores.map(p => p.nome)])).toEqual([
      ['09:10', ['Manuel Medeiros', 'Rival Um']],
      ['09:20', ['Rival Dois']],
    ]);
    expect(b12.rondas[1].grupos).toEqual([]); // volta 2 por publicar (08:00, grupo 0)
    expect(b12.rondas[2].grupos).toEqual([]); // volta 3 não pedida
    expect(t.escaloes[1].rondas[0].grupos[0].start_hole).toBe(10);
  });

  it('sem secção «draws» é erro', () => {
    fs.writeFileSync(path.join(dir, 'vazio.json'), JSON.stringify({ torneios: [], respostas: {} }));
    expect(correr(DRAWS, ['--replay', path.join(dir, 'vazio.json')]).status).toBe(1);
  });
});

describe('fetch-uskids-field.js --numeros', () => {
  it('catálogo com todos, descoberta só com os que interessam, fronteira avança', () => {
    const r = correr(FIELD, ['--numeros', path.join(dir, 'consola.json')]);
    expect(r.status, r.stderr + r.stdout).toBe(0);
    const cat = ler('uskids-tcode-catalog.json');
    expect(Object.keys(cat.entradas).sort()).toEqual(['23942', '23943', '23945']);
    expect(cat.entradas['23943'].via).toMatch(/^consola /);
    expect(Object.keys(cat.buracos)).toEqual(['23944']);
    const cache = ler('uskids-discovery-cache.json');
    expect(cache.torneios.map(t => t.t)).toEqual([23943]); // o Local Tour (tipo 5) não entra
    expect(cache.fronteira_max_t_visto).toBe(23945);
    expect(cache.varredura_max_t).toBe(23945);
  });

  it('segunda vez: nada de novo (exit 2)', () => {
    expect(correr(FIELD, ['--numeros', path.join(dir, 'consola.json')]).status).toBe(2);
  });
});

describe('fetch-uskids-results.js --replay de um torneio a decorrer', () => {
  const TR = 999004;
  const pars = [4, 4, 3, 5, 4, 4, 3, 5, 4];
  const meta = {
    tournament: { name: 'A Decorrer Open', start_date: futuro, end_date: futuro, rounds: 2, courses: 'Campo' },
    age_groups: { 5: { name: 'Boys 12', holes_per_round: 9 } },
    flights: { 11: { age_group: 5, registered: 2 } },
    flight_rounds: { 900: { flight: 11, round: 1, course: 7 }, 901: { flight: 11, round: 2, course: 7 } },
    flight_courses: { 900: { course: 7, pars, lengths: pars.map(() => 300) }, 901: { course: 7, pars, lengths: pars.map(() => 300) } },
    courses: { 7: { name: 'Campo Teste' } },
  };
  const jog = (first, r1, r2) => ({ first, last: 'X', country: 'pt', place: 'F', status: 1, rounds: {
    1: { strokes: r1, num_strokes: r1.reduce((a, b) => a + b, 0), num_holes: 9 },
    2: r2 ? { strokes: r2, num_strokes: r2.reduce((a, b) => a + b, 0), num_holes: 9 } : { strokes: [], num_strokes: 0, num_holes: 9 } } });
  const ficheiro = (comR2) => {
    const fp = { 1: jog('Ana', pars, comR2 ? pars : null), 2: jog('Bia', pars.map(p => p + 1), comR2 ? pars : null) };
    const f = path.join(dir, `decorrer-${comR2 ? 2 : 1}.json`);
    fs.writeFileSync(f, JSON.stringify({ gerado_em: '2026-11-18T10:00:00.000Z', torneios: [], respostas: {},
      resultados: { torneios: [TR], respostas: { [`GetMeta:${TR}`]: meta,
        'GetPlayerTeeTimes:11:1:1': { flight_players: fp }, 'GetPlayerTeeTimes:11:2:1': { flight_players: fp } } } }));
    return f;
  };
  beforeAll(() => {
    fs.writeFileSync(path.join(dir, 'uskids-discovery-cache.json'), JSON.stringify({ torneios: [{ t: TR, name: 'A Decorrer Open', date_inicio: futuro, date_fim: futuro, rondas: 2 }] }));
    fs.writeFileSync(path.join(dir, 'uskids-results.json'), JSON.stringify({ resultados: [] }));
  });

  it('só a 1.ª volta jogada → fica nos parciais', () => {
    const r = correr(RESULTS, ['--replay', ficheiro(false)]);
    expect(r.status, r.stderr + r.stdout).toBe(0);
    const t = ler('uskids-results.json').resultados.find(x => x.t === TR);
    expect(t.escaloes[0].rondas.map(x => x.leaderboard.length)).toEqual([2, 0]);
    expect(ler('uskids-results-index.json').parciais).toEqual([TR]);
  });

  it('com a última volta → sai dos parciais', () => {
    const r = correr(RESULTS, ['--replay', ficheiro(true)]);
    expect(r.status, r.stderr + r.stdout).toBe(0);
    const idx = ler('uskids-results-index.json');
    expect(idx.t).toEqual([TR]);
    expect(idx.parciais).toEqual([]);
  });
});
