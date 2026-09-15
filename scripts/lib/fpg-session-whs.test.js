/* WHS público pela ficha do federado (gate page=fedhcp) — 2026-09-15.
 *
 * O fpg-scrape-node.js compara o que descarrega com o que está em disco por
 * JSON.stringify: se o caminho público devolvesse registos com uma vírgula de
 * diferença, cada troca entre público e cookies reescrevia os ~200 whs.json.
 * Daí os testes da normalização, e do encaminhamento do ScoreCard para a
 * página pública (que não se chama como no my.fpg.pt). Sem rede: fetch falso. */
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import sessao from './fpg-session.js';

const { criarRoteador, normalizarRegistosWhs } = sessao;

describe('normalizarRegistosWhs', () => {
  it('tira o confirm_status das voltas e mantém a ordem das chaves', () => {
    const pub = [{ id: 1, sgd: 5.5, cba: 0, confirm_status: 0, holes: 18 }];
    const out = normalizarRegistosWhs('PlayerWHS.aspx/HCPWhsFederLST', pub);
    expect(JSON.stringify(out)).toBe(JSON.stringify([{ id: 1, sgd: 5.5, cba: 0, holes: 18 }]));
  });

  it('repõe o HTML do scdisplay como o my.fpg.pt o dá', () => {
    const pub = '<tr><th></th><th>HCP Exacto</th></tr><td><img src="Content/Images/red.gif"/></td>';
    const priv = '<tr><th>Tee</th><th>HCP Exacto</th></tr><td><img src="/Content/Images/red.gif"/></td>';
    const [r] = normalizarRegistosWhs('PlayerWHS.aspx/ScoreCard', [{ score_id: 9, gross_1: 4, scdisplay: pub }]);
    expect(r.scdisplay).toBe(priv);
    expect(r.gross_1).toBe(4);
  });

  it('não mexe noutros PageMethods', () => {
    const recs = [{ confirm_status: 1 }];
    expect(normalizarRegistosWhs('classif.aspx/ClassifLST', recs)).toBe(recs);
  });
});

// ── Encaminhamento com um servidor FPG de mentira ──
let fetchOriginal, pedidos;
const json = d => new Response(JSON.stringify({ d }), { status: 200, headers: { 'Content-Type': 'application/json' } });

beforeEach(() => {
  fetchOriginal = globalThis.fetch;
  pedidos = [];
  globalThis.fetch = async (url, opts = {}) => {
    const u = String(url);
    pedidos.push(`${opts.method || 'GET'} ${u}`);
    if (u.includes('tournaments.asp')) return new Response('<html>datalink</html>', { status: 200 });
    if (u.includes('1PreparePage.aspx') && u.includes('page=fedhcp')) {
      return new Response('', { status: 302, headers: { Location: '/pt/fed_hcp.aspx?fedno=52884', 'Set-Cookie': 'ASP.NET_SessionId=abc; path=/' } });
    }
    if (u.includes('fed_hcp.aspx?fedno=')) return new Response('<html>ficha</html>', { status: 200 });
    if (u.includes('/HCPWhsFederLST')) return json({ Result: 'OK', TotalRecordCount: 1, Records: [{ id: 1, confirm_status: 0 }] });
    if (u.includes('fed_hcp.aspx/ScoreCard')) return json({ Result: 'OK', Records: [{ score_id: 7, scdisplay: '<th></th><th>HCP Exacto</th>' }] });
    return new Response('Runtime Error', { status: 500 });
  };
});

afterEach(() => {
  globalThis.fetch = fetchOriginal;
  delete process.env.FPG_AUTH_MODE;
});

describe('criarRoteador — WHS', () => {
  it('sem cookies descarrega o WHS pelo gate fedhcp e normaliza', async () => {
    const r = criarRoteador({});
    const d = await r.post('PlayerWHS.aspx/HCPWhsFederLST', { fed_code: '52884', jtStartIndex: '0', jtPageSize: '100' }, 'fed_code=52884');
    expect(d.Records).toEqual([{ id: 1 }]);
    expect(pedidos.some(p => p.startsWith('GET') && p.includes('page=fedhcp&fedno=52884'))).toBe(true);
  });

  it('o ScoreCard vai para fed_hcp.aspx/ScoreCard (não PlayerWHS.aspx)', async () => {
    const r = criarRoteador({});
    const d = await r.post('PlayerWHS.aspx/ScoreCard', { score_id: '7', scoringtype: '1', competitiontype: '10' }, 'score_id=7', { fed: '52884' });
    expect(d.Records[0].scdisplay).toBe('<th>Tee</th><th>HCP Exacto</th>');
    expect(pedidos.some(p => p.startsWith('POST') && p.includes('/pt/fed_hcp.aspx/ScoreCard'))).toBe(true);
    expect(pedidos.some(p => p.includes('PlayerWHS.aspx/ScoreCard'))).toBe(false);
  });

  it('abre a sessão pública uma vez para vários federados', async () => {
    const r = criarRoteador({});
    await r.post('PlayerWHS.aspx/HCPWhsFederLST', { fed_code: '1' }, '');
    await r.post('PlayerWHS.aspx/HCPWhsFederLST', { fed_code: '2' }, '');
    expect(pedidos.filter(p => p.includes('1PreparePage.aspx')).length).toBe(1);
  });

  it('com o público em baixo cai nas cookies', async () => {
    globalThis.fetch = async () => new Response('Runtime Error', { status: 500 });
    let cookies = 0;
    const r = criarRoteador({ dgPost: async () => { cookies++; return { Result: 'OK', Records: [{ id: 1 }] }; } });
    const d = await r.post('PlayerWHS.aspx/HCPWhsFederLST', { fed_code: '52884' }, '');
    expect(cookies).toBe(1);
    expect(d.Records).toEqual([{ id: 1 }]);
  });
});
