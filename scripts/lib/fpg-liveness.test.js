import { describe, it, expect } from 'vitest';
import liveness from './fpg-liveness.js';

const { sondarFpg, diagnosticar, explicar, EXIT, CONTROL_REACH } = liveness;

function fakeFetch(mapa) {
  return async (url) => {
    const r = mapa[url] ?? mapa._default;
    if (r instanceof Error) throw r;
    return { status: r.status, text: async () => r.body ?? '' };
  };
}
const OK        = { status: 200, body: '<html>' + 'x'.repeat(800) + '</html>' };
const RUNTIME500 = { status: 500, body: '<title>Runtime Error</title>' };

describe('fpg-liveness — sonda de alcançabilidade', () => {
  it('rota pública responde → a FPG está alcançável', async () => {
    const s = await sondarFpg({ fetchImpl: fakeFetch({ [CONTROL_REACH]: OK }) });
    expect(s.reach.up).toBe(true);
    expect(s.fonteEmBaixo).toBe(false);
  });

  it('rota pública em baixo → fonte em baixo', async () => {
    const s = await sondarFpg({ fetchImpl: fakeFetch({ _default: RUNTIME500 }) });
    expect(s.fonteEmBaixo).toBe(true);
  });

  it('"Runtime Error" com HTTP 200 também conta como em baixo', async () => {
    const s = await sondarFpg({ fetchImpl: fakeFetch({
      _default: { status: 200, body: '<title>Runtime Error</title>' } }) });
    expect(s.reach.up).toBe(false);
  });

  it('erro de rede não rebenta', async () => {
    const s = await sondarFpg({ fetchImpl: fakeFetch({ _default: new Error('ECONNRESET') }) });
    expect(s.fonteEmBaixo).toBe(true);
    expect(s.reach.status).toBe(0);
  });
});

describe('fpg-liveness — veredicto (deliberadamente conservador)', () => {
  const emBaixo = { fonteEmBaixo: true,  reach: { up: false, status: 500 } };
  const dePe    = { fonteEmBaixo: false, reach: { up: true,  status: 200 } };

  it('autenticou → ok', () => {
    expect(diagnosticar(true, emBaixo)).toBe('ok');
    expect(diagnosticar(true, dePe)).toBe('ok');
  });

  it('falhou e a FPG nem responde na rota pública → fonte em baixo', () => {
    expect(diagnosticar(false, emBaixo)).toBe('fonte-em-baixo');
    expect(explicar('fonte-em-baixo')).toMatch(/não resolve/);
  });

  it('falhou mas a FPG responde → INDETERMINADO, nunca "está tudo bem"', () => {
    // ⚠ A 1ª versão dizia "são os cookies" aqui, com base num controlo ASP.NET
    // sem credenciais. Medido às 18:15 de 2026-08-30: esse controlo dava 500
    // com a FPG recuperada e o scrape do Drive a correr bem — ou seja,
    // mascararia cookies mortos como "não é connosco". Não sabemos isolar a
    // causa, e o veredicto tem de o dizer.
    expect(diagnosticar(false, dePe)).toBe('indeterminado');
    expect(explicar('indeterminado')).toMatch(/confirmar abrindo o linkpage/);
  });

  it('indeterminado sai 2 → o alarme toca (nunca silêncio)', () => {
    expect(EXIT.INDETERMINADO).toBe(2);
    expect(EXIT.FONTE_EM_BAIXO).toBe(3);
  });

  it('sem sondas cai no lado barulhento', () => {
    expect(diagnosticar(false, null)).toBe('indeterminado');
  });
});
