/**
 * Integração: a procura REAL do fetch-uskids-field.js contra um signupanytime
 * a fingir, servido por um HTTP local (nunca toca no signupanytime).
 *
 * O que isto protege:
 *  • a 2026-09-12 o scraper insistiu com o servidor muito depois de ele ter
 *    dito "Too many requests" — continuar a martelar é o que faz um limite
 *    temporário virar bloqueio. Agora pára ao PRIMEIRO pedido recusado;
 *  • a 2026-09-13 o run morreu na temporal dead zone do hojeISO porque nenhum
 *    teste EXECUTAVA a descoberta de ponta a ponta;
 *  • a procura nova (14/09) custa ~6 + MARGEM pedidos num dia normal — este
 *    teste conta-os, para ninguém a voltar a transformar numa rajada.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

let servidor, pedidos = 0;
/** O que o "servidor" responde a cada número (t → corpo). */
let responder = () => 'Too many requests';
let dirDados;

beforeAll(async () => {
  servidor = http.createServer((req, res) => {
    pedidos++;
    const t = Number(new URL(req.url, 'http://x').searchParams.get('t'));
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end(responder(t));
  });
  await new Promise(r => servidor.listen(0, '127.0.0.1', r));
  process.env.USKIDS_API_BASE = `http://127.0.0.1:${servidor.address().port}/LinksAJAX.aspx`;
  // A descoberta escreve em DIR — nunca em public/data durante os testes.
  dirDados = fs.mkdtempSync(path.join(os.tmpdir(), 'uskids-teste-'));
  process.env.USKIDS_DATA_DIR = dirDados;
  process.env.USKIDS_DELAY_MS = '0';
});

afterAll(async () => {
  delete process.env.USKIDS_API_BASE;
  delete process.env.USKIDS_DATA_DIR;
  delete process.env.USKIDS_DELAY_MS;
  fs.rmSync(dirDados, { recursive: true, force: true });
  await new Promise(r => servidor.close(r));
});

const ler = (f) => JSON.parse(fs.readFileSync(path.join(dirDados, f), 'utf8'));
const limpar = () => { for (const f of fs.readdirSync(dirDados)) fs.rmSync(path.join(dirDados, f)); };

describe('um pedido contra a fonte', () => {
  it('uma recusa é "recusa", à primeira e sem repetir', async () => {
    const { consultar } = await import('../fetch-uskids-field.js');
    responder = () => 'Too many requests';
    pedidos = 0;
    expect((await consultar(1)).r).toBe('recusa');
    expect(pedidos).toBe(1);
  });

  it('um número inexistente (200 + corpo vazio) é "nao-existe", não recusa', async () => {
    const { consultar, metaTournament } = await import('../fetch-uskids-field.js');
    responder = () => '';
    expect(await metaTournament(1)).toBe(null);
    expect((await consultar(1)).r).toBe('nao-existe');
  });
});

describe('descobrirTorneios — de ponta a ponta', () => {
  it('com a fonte a recusar: não rebenta, pára ao 1.º pedido e di-lo na cache', async () => {
    const { descobrirTorneios } = await import('../fetch-uskids-field.js');
    limpar();
    responder = () => 'Too many requests';
    pedidos = 0;

    const torneios = await descobrirTorneios();

    expect(Array.isArray(torneios)).toBe(true);
    expect(pedidos).toBe(1);
    expect(ler('uskids-discovery-cache.json').varredura.fim).toBe('rate-limit');
  });

  it('um dia normal: acha os novos, guarda o buraco, e custa 3 + MARGEM pedidos', async () => {
    const { descobrirTorneios } = await import('../fetch-uskids-field.js');
    const { MARGEM } = await import('./uskids-frontier.js');
    limpar();
    // Fronteira em 1000; existem o 1001 (Internacional) e o 1003 (Local Tour,
    // excluído — mas vai para o catálogo). O 1002 não existe.
    fs.writeFileSync(path.join(dirDados, 'uskids-discovery-cache.json'),
      JSON.stringify({ torneios: [], varredura_max_t: 1000 }));
    const meta = {
      1001: { name: 'Venice Open 2027', type: 8, tour: 'International Championships Tour', start_date: '8/20/2027' },
      1003: { name: 'The Legends Golf Club', type: 5, tour: 'Mobile Tour', start_date: '8/21/2027' },
    };
    responder = (t) => meta[t] ? JSON.stringify({ tournament: meta[t] }) : '';
    pedidos = 0;

    const torneios = await descobrirTorneios();

    // 3 FORCAR_INCLUIR (fora do catálogo) + 1001…1003 + MARGEM inexistentes.
    // O backfill não pede nada: a fronteira está abaixo do piso.
    expect(pedidos).toBe(3 + 3 + MARGEM);
    expect(torneios.map(t => t.t)).toEqual([1001]);
    const cache = ler('uskids-discovery-cache.json');
    expect(cache.varredura.fim).toBe('fronteira');
    expect(cache.varredura_max_t).toBe(1003);
    const cat = ler('uskids-tcode-catalog.json');
    expect(Object.keys(cat.entradas).sort()).toEqual(['1001', '1003']);
    expect(Object.keys(cat.buracos)).toEqual(['1002']);
  });

  it('uma regra nova aplica-se ao catálogo sem pedir nada', async () => {
    const { descobrirTorneios } = await import('../fetch-uskids-field.js');
    const { MARGEM } = await import('./uskids-frontier.js');
    // O catálogo já tem um Tour Championship dos EUA, visto quando ainda não
    // entrava; a cache não o tem. Tem de entrar sem nenhum pedido a ele.
    const cat = ler('uskids-tcode-catalog.json');
    cat.entradas['1004'] = { n: 'Longleaf (Tour Championship)', ty: 6, tour: 'Sandhills, NC Tour', s: '12/1/2027' };
    fs.writeFileSync(path.join(dirDados, 'uskids-tcode-catalog.json'), JSON.stringify(cat));
    responder = () => '';
    pedidos = 0;

    const torneios = await descobrirTorneios();

    expect(torneios.map(t => t.t)).toContain(1004);
    // Os 3 forçados (que aqui não existem, logo não ficaram no catálogo) e a
    // fronteira a partir do 1004 — nenhum pedido ao próprio 1004.
    expect(pedidos).toBe(3 + MARGEM);
  });
});
