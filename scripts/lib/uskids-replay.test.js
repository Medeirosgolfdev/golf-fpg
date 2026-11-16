/**
 * `fetch-uskids-field.js --replay <ficheiro>` (16/11/2026): os inscritos vêm de um ficheiro gravado
 * pela consola do browser (scripts/uskids-consola.js), sem browser nem pedidos. O
 * processamento é o de sempre — quem desiste (WD, status 8) sai dos inscritos e entra em `removed`,
 * as contagens actualizam-se — e corre numa pasta temporária (USKIDS_DATA_DIR), nunca em public/data.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const SCRIPT = path.join(__dirname, '..', 'fetch-uskids-field.js');
let dir;

const T = 999001;
const futuro = (() => { const d = new Date(Date.now() + 20 * 86400000); return `${d.getUTCMonth() + 1}/${d.getUTCDate()}/${d.getUTCFullYear()}`; })();
const jog = (nome, pid) => ({ nome, pais: 'PT', cidade: 'Funchal', pid, firstSeen: '2026-10-01T00:00:00.000Z' });
// 10 inscritos no Boys 12; o último (Jogador J) desiste — perda de 10%, dentro da guarda (30%).
const LETRAS = 'ABCDEFGHIJ'.split('');

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'uskids-replay-'));
  const torneio = { t: T, name: 'Teste Open', date_inicio: futuro, date_fim: futuro, rondas: 3, campo: 'Campo', fee_18: '1', tour: 'International Championships Tour', type: 8 };
  fs.writeFileSync(path.join(dir, 'uskids-discovery-cache.json'), JSON.stringify({ torneios: [torneio] }));
  fs.writeFileSync(path.join(dir, 'uskids-field.json'), JSON.stringify({
    gerado_em: '2026-11-10T00:00:00.000Z', rate_limit_hits: 0,
    torneios: [{
      ...torneio, total_inscritos: 16, total_maximo: 24, ultima_atualizacao: '2026-11-10T00:00:00.000Z',
      escaloes: [
        { age_group: 1, nome: 'Boys 12', genero: 'Boys', holes: 18, flight_id: 11, inscritos: 10, maximo: 10, vagas: 0, pct_cheio: 100,
          jogadores: LETRAS.map((l, i) => jog(`Jogador ${l}`, 101 + i)), paises: [{ pais: 'PT', n: 10 }],
          // Desinscrito há muito (antes havia uma janela de 60 dias): fica até o torneio acabar.
          removed: [{ nome: 'Saiu Antigo', removedAt: '2026-01-01T00:00:00.000Z', pais: 'ES' }] },
        { age_group: 2, nome: 'Girls 11-12', genero: 'Girls', holes: 18, flight_id: 22, inscritos: 4, maximo: 6, vagas: 2, pct_cheio: 67,
          jogadores: null, paises: null },
        { age_group: 3, nome: 'Boys 10', genero: 'Boys', holes: 18, flight_id: 33, inscritos: 2, maximo: 8, vagas: 6, pct_cheio: 25,
          jogadores: [jog('Outro A', 201), jog('Outro B', 202)], paises: [{ pais: 'PT', n: 2 }] },
      ],
    }],
  }));
  const p = (first, last, status) => ({ first, last, country: 'pt', place: 'Funchal', status });
  fs.writeFileSync(path.join(dir, 'replay.json'), JSON.stringify({
    gerado_em: '2026-11-16T16:00:00.000Z', pedidos: 2, recusa: null,
    torneios: [{ t: T, modo: 'completo' }],
    respostas: {
      [`GetMeta:${T}`]: {
        tournament: { name: 'Teste Open', start_date: futuro, end_date: futuro, rounds: 3, courses: 'Campo', fee_18: '1', tour: 'International Championships Tour', type: 8 },
        age_groups: { 1: { name: 'Boys 12', gender: 'Boys', holes_per_round: 18 }, 2: { name: 'Girls 11-12', gender: 'Girls', holes_per_round: 18 }, 3: { name: 'Boys 10', gender: 'Boys', holes_per_round: 18 } },
        // `registered` conta o WD; `active` não — a app grava o `active`.
        flights: { 11: { age_group: 1, registered: 10, active: 9, max_entry: 10 }, 22: { age_group: 2, registered: 5, active: 5, max_entry: 6 },
          33: { age_group: 3, registered: 3, active: 3, max_entry: 8 } },
      },
      // + um WD que nunca vimos inscrito (Novo WD): entra nos desinscritos pela marca da USKids.
      'GetPlayerTeeTimes:11': { flight_players: { ...Object.fromEntries(LETRAS.map((l, i) => [101 + i, p('Jogador', l, l === 'J' ? 8 : 1)])), 199: p('Novo', 'WD', 8) } },
    },
  }));
});

afterAll(() => { fs.rmSync(dir, { recursive: true, force: true }); });

describe('fetch-uskids-field --replay', () => {
  it('lê o ficheiro da consola: o WD sai dos inscritos e vai para removed; as contagens actualizam-se', () => {
    const r = spawnSync(process.execPath, [SCRIPT, '--replay', path.join(dir, 'replay.json')], {
      env: { ...process.env, USKIDS_DATA_DIR: dir, USKIDS_DELAY_FETCH_MS: '0', USKIDS_DELAY_MS: '0', USKIDS_API_BASE: 'http://127.0.0.1:9/nunca' },
      encoding: 'utf8', timeout: 60000,
    });
    expect(r.status, r.stdout + r.stderr).toBe(0);
    const out = JSON.parse(fs.readFileSync(path.join(dir, 'uskids-field.json'), 'utf8'));
    const t = out.torneios.find(x => x.t === T);
    const b12 = t.escaloes.find(e => e.nome === 'Boys 12');
    expect(b12.inscritos).toBe(9);
    expect(b12.jogadores).toHaveLength(9);
    expect(b12.jogadores.some(j => j.nome === 'Jogador J')).toBe(false);
    expect(b12.removed.map(x => x.nome).sort()).toEqual(['Jogador J', 'Novo WD', 'Saiu Antigo']);
    expect(b12.removed.filter(x => x.wd).map(x => x.nome).sort()).toEqual(['Jogador J', 'Novo WD']);
    expect(b12.desistentes).toBe(1); // registered 10 − active 9
    expect(t.escaloes.find(e => e.nome === 'Girls 11-12').inscritos).toBe(5);
    // Boys 10: a lista não veio no ficheiro — ficam os nomes que havia, nunca «sem nomes».
    const b10 = t.escaloes.find(e => e.nome === 'Boys 10');
    expect(b10.inscritos).toBe(3);
    expect(b10.jogadores.map(j => j.nome)).toEqual(['Outro A', 'Outro B']);
    expect(t.total_inscritos).toBe(17);
    // Um --replay não é um run completo: o cabeçalho fica o do último run inteiro.
    expect(out.gerado_em).toBe('2026-11-10T00:00:00.000Z');
  }, 60000);

  it('sem «respostas» recusa o ficheiro e não grava nada', () => {
    fs.writeFileSync(path.join(dir, 'mau.json'), JSON.stringify({ torneios: [] }));
    const antes = fs.readFileSync(path.join(dir, 'uskids-field.json'), 'utf8');
    const r = spawnSync(process.execPath, [SCRIPT, '--replay', path.join(dir, 'mau.json')], {
      env: { ...process.env, USKIDS_DATA_DIR: dir }, encoding: 'utf8', timeout: 60000,
    });
    expect(r.status).toBe(1);
    expect(fs.readFileSync(path.join(dir, 'uskids-field.json'), 'utf8')).toBe(antes);
  }, 60000);
});
