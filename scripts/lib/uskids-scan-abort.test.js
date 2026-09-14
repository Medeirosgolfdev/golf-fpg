/**
 * Integração: a varredura REAL do fetch-uskids-field.js contra uma fonte que
 * recusa, servida por um HTTP local (nunca toca no signupanytime).
 *
 * O que isto protege: a 2026-09-12 o scraper insistiu com o servidor muito
 * depois de ele ter dito "Too many requests" — cada tcode ainda gastava 3
 * tentativas e foram ~540 tcodes até o disjuntor disparar. Continuar a
 * martelar é o que faz um limite temporário virar bloqueio.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

let servidor, base, pedidos = 0, corpo = 'Too many requests';
let dirDados;

beforeAll(async () => {
  servidor = http.createServer((_req, res) => {
    pedidos++;
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end(corpo);
  });
  await new Promise(r => servidor.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${servidor.address().port}/LinksAJAX.aspx`;
  process.env.USKIDS_API_BASE = base;
  // A descoberta escreve a cache em DIR — nunca em public/data durante os testes.
  dirDados = fs.mkdtempSync(path.join(os.tmpdir(), 'uskids-teste-'));
  process.env.USKIDS_DATA_DIR = dirDados;
});

afterAll(async () => {
  delete process.env.USKIDS_API_BASE;
  delete process.env.USKIDS_DATA_DIR;
  fs.rmSync(dirDados, { recursive: true, force: true });
  await new Promise(r => servidor.close(r));
});

describe('varredura contra uma fonte em rate limit', () => {
  it('pára ao primeiro "Too many requests" em vez de varrer o bloco todo', async () => {
    const { varrerIntervalo } = await import('../fetch-uskids-field.js');
    pedidos = 0;

    const r = await varrerIntervalo(1, 60, () => {});

    expect(r.travado).toBe(true);
    expect(r.total).toBe(0);
    // O bloco tem 60 tcodes e a concorrência é 5: sem o corte seriam 60+
    // pedidos (e com as 3 tentativas por tcode, muito mais). Com o corte,
    // só os que já estavam em voo quando a recusa chegou.
    expect(pedidos).toBeLessThanOrEqual(10);
  });

  it('um intervalo travado NÃO é repetido (a repetição é para rede instável)', async () => {
    const { varrerIntervaloFiavel } = await import('../fetch-uskids-field.js');
    pedidos = 0;

    const r = await varrerIntervaloFiavel(1, 60, () => {});

    expect(r.travado).toBe(true);
    // Uma repetição duplicaria a conta contra um servidor que já recusou.
    expect(pedidos).toBeLessThanOrEqual(10);
  });

  it('um tcode inexistente (200 + corpo vazio) não é confundido com recusa', async () => {
    const { metaTournament } = await import('../fetch-uskids-field.js');
    const anterior = corpo;
    corpo = '';
    try {
      // null = "não existe", que é diferente do sentinela de erro de rede.
      expect(await metaTournament(1)).toBe(null);
    } finally { corpo = anterior; }
  });
});

/**
 * O que isto protege: a 2026-09-13 o run morreu com "Cannot access 'hojeISO'
 * before initialization" — um `const hojeISO` local, declarado no fim da
 * `descobrirTorneios`, ensombrava a função do módulo em toda a função e a
 * Passagem A rebentava ao carimbar a cache. Nenhum teste chegava a EXECUTAR a
 * descoberta: os unitários cobriam a lib pura e os de integração só a
 * varredura. Contra uma fonte que recusa, as duas passagens abortam de
 * imediato, por isso a orquestração inteira corre em milissegundos — e passa
 * exactamente pela linha que rebentou.
 */
describe('descobrirTorneios — a orquestração corre de ponta a ponta', () => {
  it('não rebenta e carimba a cache mesmo com a fonte a recusar', async () => {
    const { descobrirTorneios } = await import('../fetch-uskids-field.js');

    const torneios = await descobrirTorneios();

    expect(Array.isArray(torneios)).toBe(true);

    const cache = JSON.parse(
      fs.readFileSync(path.join(dirDados, 'uskids-discovery-cache.json'), 'utf8'),
    );
    // O carimbo da linha que rebentava.
    expect(cache.ultima_varredura_profunda).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // E a fonte recusou, logo a Passagem B tem de o dizer.
    expect(cache.varredura.fim).toBe('rate-limit');
  });
});
