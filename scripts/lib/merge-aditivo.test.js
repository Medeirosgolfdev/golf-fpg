/**
 * Testes da gravação aditiva (EGR/WAGR apagam o que tem mais de 2 anos).
 */
import { describe, it, expect } from "vitest";
import { juntarPorChave, chaveJogador, chaveEvento } from "./merge-aditivo.js";

describe('juntarPorChave — classificações', () => {
  it('o novo actualiza, o antigo que desapareceu da fonte fica', () => {
    const antes = [{ id: 1, name: 'Ana', pos: 3 }, { id: 2, name: 'Rui', pos: 9 }];
    const agora = [{ id: 1, name: 'Ana', pos: 2 }]; // o Rui caducou no WAGR
    const r = juntarPorChave(antes, agora, chaveJogador);
    expect(r).toHaveLength(2);
    expect(r[0]).toEqual({ id: 1, name: 'Ana', pos: 2 });
    expect(r[1]).toMatchObject({ id: 2, name: 'Rui', pos: 9, _mantido: true });
  });
  it('sem id, junta por nome + país (acentos e maiúsculas não contam)', () => {
    const r = juntarPorChave([{ name: 'José Silva', country: 'Portugal', total: 150 }],
      [{ name: 'jose silva', country: 'PORTUGAL', total: 149 }], chaveJogador);
    expect(r).toHaveLength(1);
    expect(r[0].total).toBe(149);
  });
  it('sem ficheiro anterior fica só o novo', () => {
    expect(juntarPorChave(null, [{ id: 1 }], chaveJogador)).toEqual([{ id: 1 }]);
  });
  it('nunca encolhe', () => {
    const antes = Array.from({ length: 50 }, (_, i) => ({ id: i }));
    expect(juntarPorChave(antes, [], chaveJogador)).toHaveLength(50);
  });
});

describe('juntarPorChave — eventos da ficha EGR', () => {
  it('eventos que saíram da janela de 2 anos ficam', () => {
    const antes = [{ eventId: '100', pos: '5' }, { eventId: '200', pos: '1' }];
    const agora = [{ eventId: '200', pos: '1' }, { eventId: '300', pos: '7' }];
    const r = juntarPorChave(antes, agora, chaveEvento);
    expect(r.map((e) => e.eventId)).toEqual(['200', '300', '100']);
    expect(r[2]._mantido).toBe(true);
  });
});
