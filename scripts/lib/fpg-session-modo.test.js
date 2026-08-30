/* Ordem de autenticação do roteador FPG (2026-08-30).
 *
 * O caminho público (sessão emitida pelo ack) não expira; as cookies duram ~9h
 * e morrem sempre a meio da janela de scrapes do fim-de-semana. Daí o público
 * ser o primário — com as cookies como fallback, nos dois sentidos. */
import { describe, it, expect, afterEach } from 'vitest';
import sessao from './fpg-session.js';

const { criarRoteador } = sessao;

const OK = { Result: 'OK', Records: [1], TotalRecordCount: 1 };
const rebenta = (msg, status) => { const e = new Error(msg); e.status = status; throw e; };

afterEach(() => { delete process.env.FPG_AUTH_MODE; });

describe('criarRoteador — ordem', () => {
  it('sem dgPost fica sempre público', () => {
    expect(criarRoteador({}).publico).toBe(true);
  });

  it('por defeito não toca nas cookies quando o público responde', async () => {
    let cookiesUsadas = false;
    const r = criarRoteador({ dgPost: async () => { cookiesUsadas = true; return OK; } });
    // o público falha aqui (sem rede no teste) → cai nas cookies
    await r.post('classif.aspx/ClassifLST', { tclub: '000', tcode: '1' }).catch(() => {});
    expect(cookiesUsadas).toBe(true);   // fallback bidireccional funcionou
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
