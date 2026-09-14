/* Ordem de autenticação do roteador FPG (2026-08-30).
 *
 * O caminho público (sessão emitida pelo ack) não expira; as cookies duram ~9h
 * e morrem sempre a meio da janela de scrapes do fim-de-semana. Daí o público
 * ser o primário — com as cookies como fallback, nos dois sentidos. */
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import sessao from './fpg-session.js';

const { criarRoteador } = sessao;

const OK = { Result: 'OK', Records: [1], TotalRecordCount: 1 };
const rebenta = (msg, status) => { const e = new Error(msg); e.status = status; throw e; };

// ⚠ O caminho público faz `fetch` a sério. Sem este stub o teste dependia de a
// máquina NÃO ter rede: num runner com rede o pedido demora ~4 s (estourava os
// 5 s do vitest, falha intermitente) e, se a FPG respondesse, o fallback nem
// chegava a correr e o teste falhava por lógica. Aqui interessa a ORDEM do
// roteador, não a FPG — o público falha instantaneamente e de propósito.
let fetchOriginal;
beforeEach(() => {
  fetchOriginal = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('rede desligada no teste'); };
});

afterEach(() => {
  globalThis.fetch = fetchOriginal;
  delete process.env.FPG_AUTH_MODE;
});

describe('criarRoteador — ordem', () => {
  it('sem dgPost fica sempre público', () => {
    expect(criarRoteador({}).publico).toBe(true);
  });

  it('com o público em baixo, cai nas cookies (fallback bidireccional)', async () => {
    let cookiesUsadas = false;
    const r = criarRoteador({ dgPost: async () => { cookiesUsadas = true; return OK; } });
    await r.post('classif.aspx/ClassifLST', { tclub: '000', tcode: '1' }).catch(() => {});
    expect(cookiesUsadas).toBe(true);
  });

  it('FPG_AUTH_MODE=cookies restaura a ordem antiga', async () => {
    process.env.FPG_AUTH_MODE = 'cookies';
    const r = criarRoteador({ dgPost: async () => OK });
    expect(r.modo).toBe('cookies');
    await expect(r.post('classif.aspx/ClassifLST', { tclub: '000', tcode: '1' })).resolves.toEqual(OK);
  });

  it('FPG_AUTH_MODE=publico nunca usa as cookies', async () => {
    process.env.FPG_AUTH_MODE = 'publico';
    let cookiesUsadas = false;
    const r = criarRoteador({ dgPost: async () => { cookiesUsadas = true; return OK; } });
    expect(r.publico).toBe(true);
    await r.post('classif.aspx/ClassifLST', { tclub: '000', tcode: '1' }).catch(() => {});
    expect(cookiesUsadas).toBe(false);
  });

  it('modo inválido cai em auto', () => {
    process.env.FPG_AUTH_MODE = 'seja-o-que-for';
    expect(criarRoteador({ dgPost: async () => OK }).modo).toBe('auto');
  });

  it('erro das cookies propaga quando o público também falhou', async () => {
    process.env.FPG_AUTH_MODE = 'cookies';
    const r = criarRoteador({ dgPost: async () => rebenta('boom', 401) });
    await expect(r.post('classif.aspx/ClassifLST', { tclub: '000', tcode: '1' })).rejects.toThrow('boom');
  });
});
