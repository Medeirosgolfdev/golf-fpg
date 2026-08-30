import { describe, it, expect } from 'vitest';
import liveness from './fpg-liveness.js';

const { sondarFpg, diagnosticar, explicar, EXIT, CONTROL_ASPNET, CONTROL_REACH } = liveness;

/** fetch falso: mapa url → {status, body}. */
function fakeFetch(mapa) {
  return async (url) => {
    const r = mapa[url] ?? mapa._default;
    if (r instanceof Error) throw r;
    return { status: r.status, text: async () => r.body ?? '' };
  };
}
const PAGINA_OK  = { status: 200, body: '<html><body>' + 'x'.repeat(800) + '</body></html>' };
const RUNTIME500 = { status: 500, body: '<html><head><title>Runtime Error</title></head></html>' };

describe('fpg-liveness — sondas sem credenciais', () => {
  it('ASP.NET de pé → a fonte não está em baixo', async () => {
    const s = await sondarFpg({ fetchImpl: fakeFetch({ _default: PAGINA_OK }) });
    expect(s.aspnet.up).toBe(true);
    expect(s.fonteEmBaixo).toBe(false);
  });

  it('ASP.NET a arder e ASP clássico de pé → fonte em baixo (o caso de 2026-08-30)', async () => {
    const s = await sondarFpg({ fetchImpl: fakeFetch({
      [CONTROL_ASPNET]: RUNTIME500, [CONTROL_REACH]: PAGINA_OK }) });
    expect(s.fonteEmBaixo).toBe(true);
    expect(s.reach.up).toBe(true);
  });

  it('"Runtime Error" com HTTP 200 também conta como em baixo', async () => {
    const s = await sondarFpg({ fetchImpl: fakeFetch({
      _default: { status: 200, body: '<title>Runtime Error</title>' } }) });
    expect(s.aspnet.up).toBe(false);
    expect(s.aspnet.runtimeError).toBe(true);
  });

  it('erro de rede não rebenta — conta como em baixo', async () => {
    const s = await sondarFpg({ fetchImpl: fakeFetch({ _default: new Error('ECONNRESET') }) });
    expect(s.fonteEmBaixo).toBe(true);
    expect(s.aspnet.status).toBe(0);
  });
});

describe('fpg-liveness — veredicto', () => {
  const emBaixo = { fonteEmBaixo: true,  aspnet: { up: false, status: 500 }, reach: { up: true } };
  const dePe    = { fonteEmBaixo: false, aspnet: { up: true,  status: 200 }, reach: { up: true } };

  it('autenticou → ok, seja qual for a sonda', () => {
    expect(diagnosticar(true, emBaixo)).toBe('ok');
    expect(diagnosticar(true, dePe)).toBe('ok');
  });

  it('falhou COM cookies mas o controlo SEM cookies responde → são os cookies', () => {
    expect(diagnosticar(false, dePe)).toBe('cookies');
    expect(explicar('cookies', dePe)).toMatch(/segredo/);
  });

  it('falhou e o controlo sem cookies falha igual → fonte em baixo', () => {
    // ⚠ É o coração da correcção: um pedido sem credenciais não pode estar a
    // falhar por causa das nossas credenciais.
    expect(diagnosticar(false, emBaixo)).toBe('fonte-em-baixo');
    expect(explicar('fonte-em-baixo', emBaixo)).toMatch(/NÃO resolve/);
  });

  it('sem sondas (falha ao sondar) cai no lado conservador: cookies', () => {
    expect(diagnosticar(false, null)).toBe('cookies');
  });

  it('exit codes distintos para os dois diagnósticos', () => {
    expect(EXIT.COOKIES).toBe(2);
    expect(EXIT.FONTE_EM_BAIXO).toBe(3);
    expect(EXIT.OK).toBe(0);
  });
});
