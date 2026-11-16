/**
 * `fetch-uskids-results.js --replay <ficheiro>` (16/11/2026): os resultados vêm da secção «resultados»
 * do ficheiro gravado pela consola do browser (scripts/uskids-consola.js), sem browser nem pedidos.
 * Página que a consola não pediu = página vazia. Corre numa pasta temporária (USKIDS_DATA_DIR).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const SCRIPT = path.join(__dirname, '..', 'fetch-uskids-results.js');
const T = 999002;
let dir;

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'uskids-res-replay-'));
  fs.writeFileSync(path.join(dir, 'uskids-discovery-cache.json'), JSON.stringify({
    torneios: [{ t: T, name: 'Teste TC', date_inicio: '11/15/2026', date_fim: '11/15/2026', rondas: 1 }],
  }));
  fs.writeFileSync(path.join(dir, 'uskids-results.json'), JSON.stringify({
    gerado_em: '2026-11-03T00:00:00.000Z', resultados: [{ t: 1, name: 'Antigo', date_inicio: '11/1/2026', escaloes: [] }],
  }));
  const pars = [4, 4, 3, 5, 4, 4, 3, 5, 4];
  const jog = (first, last, status, strokes) => ({ first, last, country: 'us', place: 'X', status,
    rounds: { 1: { strokes, num_strokes: strokes.reduce((a, b) => a + b, 0), num_holes: 9 } } });
  fs.writeFileSync(path.join(dir, 'replay.json'), JSON.stringify({
    gerado_em: '2026-11-16T18:00:00.000Z', torneios: [], respostas: {},
    resultados: {
      torneios: [T],
      respostas: {
        [`GetMeta:${T}`]: {
          tournament: { name: 'Teste TC', start_date: '11/15/2026', end_date: '11/15/2026', rounds: 1, courses: 'Campo' },
          age_groups: { 5: { name: 'Boys 12', holes_per_round: 9 }, 6: { name: 'Girls 11-12', holes_per_round: 9 } },
          flights: { 11: { age_group: 5, registered: 3 }, 22: { age_group: 6, registered: 2 } },
          flight_rounds: { 900: { flight: 11, round: 1, course: 7 } },
          flight_courses: { 900: { course: 7, pars, lengths: pars.map(() => 300) } },
          courses: { 7: { name: 'Campo Teste' } },
        },
        // Página 1 com o flight todo (3, um deles WD); a 2 não foi pedida.
        'GetPlayerTeeTimes:11:1:1': { flight_players: {
          1: jog('Ana', 'Um', 1, [4, 4, 3, 5, 4, 4, 3, 5, 4]),
          2: jog('Bia', 'Dois', 1, [5, 4, 3, 5, 4, 4, 3, 5, 4]),
          3: jog('Cris', 'Tres', 8, [0, 0, 0, 0, 0, 0, 0, 0, 0]),
        } },
      },
    },
  }));
});

afterAll(() => { fs.rmSync(dir, { recursive: true, force: true }); });

describe('fetch-uskids-results --replay', () => {
  it('monta o torneio do ficheiro (só os Boys, sem os WD) e actualiza o índice', () => {
    const r = spawnSync(process.execPath, [SCRIPT, '--replay', path.join(dir, 'replay.json')], {
      env: { ...process.env, USKIDS_DATA_DIR: dir }, encoding: 'utf8', timeout: 60000,
    });
    expect(r.status, r.stdout + r.stderr).toBe(0);
    const out = JSON.parse(fs.readFileSync(path.join(dir, 'uskids-results.json'), 'utf8'));
    expect(out.resultados.map(x => x.t).sort()).toEqual([1, T]);
    const t = out.resultados.find(x => x.t === T);
    expect(t.escaloes.map(e => e.nome)).toEqual(['Boys 12']);
    const r1 = t.escaloes[0].rondas[0];
    expect(r1.total_par).toBe(36);
    expect(r1.leaderboard.map(j => `${j.nome} ${j.score} ${j.to_par}`)).toEqual(['Ana Um 36 0', 'Bia Dois 37 1']);
    const idx = JSON.parse(fs.readFileSync(path.join(dir, 'uskids-results-index.json'), 'utf8'));
    expect(idx.t).toEqual([1, T]);
  }, 60000);

  it('sem a secção «resultados» recusa o ficheiro e não grava nada', () => {
    fs.writeFileSync(path.join(dir, 'mau.json'), JSON.stringify({ torneios: [], respostas: {} }));
    const antes = fs.readFileSync(path.join(dir, 'uskids-results.json'), 'utf8');
    const r = spawnSync(process.execPath, [SCRIPT, '--replay', path.join(dir, 'mau.json')], {
      env: { ...process.env, USKIDS_DATA_DIR: dir }, encoding: 'utf8', timeout: 60000,
    });
    expect(r.status).toBe(1);
    expect(fs.readFileSync(path.join(dir, 'uskids-results.json'), 'utf8')).toBe(antes);
  }, 60000);
});
