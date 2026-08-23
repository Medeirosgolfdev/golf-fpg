import { describe, it, expect } from 'vitest';
import { criarPlano, proximoIntervalo, aplicarResultado } from './uskids-scan-plan.js';

/** Corre o plano contra um universo de tcodes vivos e devolve o que varreu. */
function correr(vivos, opts = {}) {
  const set = new Set(vivos);
  let st = criarPlano({ inicio: 1000, ...opts });
  const visitados = [];
  let guarda = 0;
  for (;;) {
    const iv = proximoIntervalo(st);
    if (!iv) break;
    if (++guarda > 20000) throw new Error('não convergiu');
    let total = 0, ultimoT = 0;
    for (let t = iv.de; t <= iv.ate; t++) { visitados.push(t); if (set.has(t)) { total++; ultimoT = t; } }
    st = aplicarResultado(st, iv, { total, ultimoT });
  }
  return { st, visitados: new Set(visitados), pedidos: visitados.length };
}

const zona = (de, ate, passo = 3) => {
  const v = []; for (let t = de; t <= ate; t += passo) v.push(t); return v;
};

describe('varredura densa', () => {
  it('segue a zona viva e regista o último vivo', () => {
    const { st } = correr(zona(1000, 1400));
    expect(st.ultimoVivo).toBe(1399);
    expect(st.terminou).toBe(true);
    expect(st.motivo).toBe('fronteira-esgotada');
  });

  it('a margem é medida do último VIVO, por isso a vida empurra o fim', () => {
    // zona longa: se a margem fosse medida do início, parava a meio
    const { st } = correr(zona(1000, 9000));
    expect(st.ultimoVivo).toBe(8998);   // último múltiplo de 3 a partir de 1000
  });
});

describe('buracos — a garantia que interessa', () => {
  it('atravessa o buraco de 632 que matou a varredura antiga', () => {
    const { st, visitados } = correr([...zona(1000, 1010), ...zona(1700, 1800)]);
    expect(st.ultimoVivo).toBe(1799);
    expect(visitados.has(1700)).toBe(true);
    expect(st.retomas).toBe(0);          // coberto pela rede densa, sem sondas
  });

  it('atravessa um buraco de 1400 (dentro da margem densa)', () => {
    const { st } = correr([...zona(1000, 1010), ...zona(2400, 2500)]);
    expect(st.ultimoVivo).toBe(2499);
  });

  it('atravessa um buraco ABSURDO de 6000 pela rede das sondas', () => {
    const { st } = correr([...zona(1000, 1010), ...zona(7000, 7300)]);
    expect(st.ultimoVivo).toBe(7300);
    expect(st.retomas).toBeGreaterThan(0);   // aqui as sondas foram precisas
  });

  it('atravessa buracos absurdos encadeados', () => {
    const { st } = correr([...zona(1000, 1010), ...zona(6000, 6300), ...zona(12000, 12300)]);
    expect(st.ultimoVivo).toBe(12300);
  });
});

describe('paragem', () => {
  it('termina sempre, mesmo com tcodes esparsos', () => {
    const v = []; for (let t = 1000; t <= 9000; t++) if (t % 7 === 0) v.push(t);
    const { st } = correr(v);
    expect(st.terminou).toBe(true);
    expect(st.ultimoVivo).toBe(8995);
  });

  it('não varre para lá do alcance das sondas', () => {
    const { visitados } = correr([1000]);
    expect(Math.max(...visitados)).toBeLessThanOrEqual(1000 + 20000 + 20);
  });

  it('o custo de uma fronteira morta fica contido', () => {
    // sem vida nenhuma: densa (1500) + sondas espaçadas, não 20000 pedidos
    const { pedidos } = correr([]);
    expect(pedidos).toBeLessThan(4000);
  });
});
