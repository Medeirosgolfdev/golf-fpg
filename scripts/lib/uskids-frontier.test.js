import { describe, it, expect } from 'vitest';
import f from './uskids-frontier.js';

const { criarFronteira, proximoNumero, aplicarResultado, buracosARever,
        planoBackfill, planearFase2, ordemFase2, MARGEM } = f;

/** Corre a fronteira contra um "servidor" dado por uma função t → resultado. */
function correr(inicio, resposta, opts = {}) {
  let st = criarFronteira({ ultimoExistente: inicio, ...opts });
  const pedidos = [];
  for (let t = proximoNumero(st); t != null; t = proximoNumero(st)) {
    pedidos.push(t);
    st = aplicarResultado(st, t, resposta(t));
  }
  return { st, pedidos };
}

describe('fronteira — só para a frente, um de cada vez', () => {
  it('sem nada de novo custa exactamente MARGEM pedidos', () => {
    const { st, pedidos } = correr(23714, () => 'nao-existe');
    expect(pedidos.length).toBe(MARGEM);
    expect(pedidos[0]).toBe(23715);
    expect(st.fim).toBe('fronteira');
    expect(st.ultimoExistente).toBe(23714);
  });

  it('um dia normal: acha os novos e acaba MARGEM depois do último', () => {
    const novos = new Set([23716, 23719, 23721]);
    const { st, pedidos } = correr(23714, t => novos.has(t) ? 'existe' : 'nao-existe');
    expect(st.ultimoExistente).toBe(23721);
    expect(pedidos.at(-1)).toBe(23721 + MARGEM);
  });

  it('o maior falhanço medido (15) não pára a procura', () => {
    const { st } = correr(100, t => (t === 101 || t === 117) ? 'existe' : 'nao-existe');
    expect(st.ultimoExistente).toBe(117);
  });

  it('os inexistentes deixados para trás passam a buracos', () => {
    const { st } = correr(100, t => (t === 103) ? 'existe' : 'nao-existe');
    expect(st.buracosNovos).toEqual([101, 102]);
  });

  it('⚠ um número sem resposta PÁRA — não se passa à frente de um número por confirmar', () => {
    const { st, pedidos } = correr(100, t => t === 102 ? 'erro' : t === 101 ? 'existe' : 'nao-existe');
    expect(st.fim).toBe('sem-resposta');
    expect(pedidos).toEqual([101, 102]);
    // a corrida seguinte recomeça em ultimoExistente + 1 = 102
    expect(criarFronteira({ ultimoExistente: st.ultimoExistente }).cursor).toBe(102);
  });

  it('à primeira recusa pára de imediato', () => {
    const { st, pedidos } = correr(100, () => 'recusa');
    expect(st.fim).toBe('rate-limit');
    expect(pedidos).toEqual([101]);
  });

  it('tem um tecto de pedidos por corrida', () => {
    const { st, pedidos } = correr(100, () => 'existe', { maxPedidos: 25 });
    expect(pedidos.length).toBe(25);
    expect(st.fim).toBe('orcamento');
  });
});

describe('buracos — revistos durante 7 dias', () => {
  it('não revê no próprio dia, revê até ao 6.º, expira ao 7.º', () => {
    const r = buracosARever({ 10: '2026-09-14', 11: '2026-09-13', 12: '2026-09-08', 13: '2026-09-07' }, '2026-09-14');
    expect(r.rever).toEqual([11, 12]);
    expect(r.expirados).toEqual([13]);
  });
});

describe('catálogo — enche-se para trás aos poucos', () => {
  it('desce do cursor, salta os já catalogados, respeita o orçamento e o piso', () => {
    expect(planoBackfill({ cursor: 105, piso: 100, orcamento: 3, catalogados: new Set([104]) }))
      .toEqual([105, 103, 102]);
    expect(planoBackfill({ cursor: 101, piso: 100, orcamento: 10, catalogados: new Set() }))
      .toEqual([101, 100]);
  });
});

describe('inscritos — quem se pede hoje', () => {
  const base = { diaSemana: 0, diarios: new Set([14]), doManuel: new Set([21]) };
  const prev = (over = {}) => ({ escaloes: [{ age_group: 12 }], ...over });

  it('torneio novo ou com registo falhado: completo', () => {
    const p = planearFase2([{ t: 1 }, { t: 2 }], new Map([[2, prev({ stale: true })]]), base);
    expect(p.get(1)).toBe('completo');
    expect(p.get(2)).toBe('completo');
  });

  it('15/09: TODOS os torneios são vistos todos os dias — nenhum fica sem pedido', () => {
    const tt = Array.from({ length: 30 }, (_, i) => ({ t: 23000 + i }));
    const p = planearFase2(tt, new Map(tt.map(x => [x.t, prev()])), base);
    expect([...p.values()].every(v => v === 'contagens' || v === 'completo')).toBe(true);
  });

  it('no seu dia da semana (t % 7) cada torneio refaz os nomes por inteiro', () => {
    const tt = [{ t: 8 }, { t: 7 }];
    const p = planearFase2(tt, new Map(tt.map(x => [x.t, prev()])), base);   // diaSemana 0
    expect(p.get(8)).toBe('contagens');
    expect(p.get(7)).toBe('completo');
  });

  it('a ordem põe o Manuel e os marcados primeiro', () => {
    const tt = [{ t: 1, date_inicio: '2026-12-01' }, { t: 21, date_inicio: '2026-12-30' }, { t: 14, date_inicio: '2026-12-20' }];
    const plano = new Map([[1, 'contagens'], [21, 'contagens'], [14, 'contagens']]);
    const o = ordemFase2(tt, plano, { ...base, dataISO: (s) => s });
    expect(o.map(x => x.t)).toEqual([21, 14, 1]);
  });
});
