import { describe, it, expect } from 'vitest';
import classify from './uskids-classify.js';

const { incluirTorneio, ehInternacional, TIPOS_INCLUIR, TIPO_LABEL } = classify;

describe('uskids-classify — tipo oficial do GetMeta', () => {
  // ⚠ Os três que a app perdeu enquanto a decisão era só pelo nome (medido
  // 2026-08-30, todos com inscrições abertas e dentro da zona já varrida).
  it.each([
    [22986, 'PGA Golf Club Invitational 2026'],   // caía no exclude 'golf club'
    [23318, 'Colonial Williamsburg Classic 2026'],// 'classic' não era include
    [23420, 'Monterey Challenge 2026'],           // 'challenge' não era include
  ])('inclui o Regional t=%i (%s)', (t, nome) => {
    expect(incluirTorneio(t, nome, 1)).toBe(true);
    expect(ehInternacional(nome)).toBe(false); // só pelo nome continuaria fora
  });

  it('inclui State Invitationals e International Championships', () => {
    expect(incluirTorneio(22539, '2026 Gulf Coast State Invitational', 7)).toBe(true);
    expect(incluirTorneio(22243, 'Venice Open 2026', 8)).toBe(true);
  });

  it('deixa de fora Local Tour, Tour Championship, Teen Series e Girls', () => {
    expect(incluirTorneio(22592, 'The Legends Golf Club', 5)).toBe(false);
    expect(incluirTorneio(22604, 'Penn National Golf Club - Iron Forge Course (Tour Championship)', 6)).toBe(false);
    expect(incluirTorneio(22606, 'Teen Series at Longleaf (NC)', 2)).toBe(false);
    expect(incluirTorneio(23049, '2026 Girls Invitational - Longleaf (NC)', 12)).toBe(false);
  });

  it('Parent/Child fica fora mesmo com um tipo da whitelist', () => {
    // KEYWORDS_EXCLUIR_SEMPRE corre ANTES do tipo — as variantes pais/filhos
    // herdam o nome do evento principal.
    expect(incluirTorneio(23386, 'Holiday Classic Parent/Child 2026', 1)).toBe(false);
    expect(incluirTorneio(22095, 'World Championship Parent/Child 2026 - Boys', 8)).toBe(false);
  });

  it('só Regional (1), State (7) e Internacional (8) entram pelo tipo', () => {
    expect([...TIPOS_INCLUIR].sort()).toEqual([1, 7, 8]);
    for (const ty of Object.keys(TIPO_LABEL).map(Number)) {
      expect(incluirTorneio(999999, 'Nome Sem Palavras Chave', ty))
        .toBe(TIPOS_INCLUIR.has(ty));
    }
  });
});

describe('uskids-classify — camada de palavras-chave (Local Tours seguidos)', () => {
  it('mantém as etapas de Local Tour que seguimos de propósito', () => {
    expect(incluirTorneio(22767, 'Azata Golf', 5)).toBe(true);
    expect(incluirTorneio(22272, 'Santa Maria Country Club & Club de Golf de Panama', 5)).toBe(true);
    expect(incluirTorneio(22984, 'International Teen Series at Al Hamra (UAE)', 13)).toBe(true);
  });

  it('entradas de cache antigas (sem tipo) continuam a ser lidas pelo nome', () => {
    expect(incluirTorneio(22539, '2026 Gulf Coast State Invitational', undefined)).toBe(true);
    expect(incluirTorneio(22592, 'The Legends Golf Club', undefined)).toBe(false);
  });

  it('FORCAR_EXCLUIR vence o tipo e FORCAR_INCLUIR vence o nome', () => {
    expect(incluirTorneio(22140, 'OPEN.9 Golf Eichenried', 8)).toBe(false);
    expect(incluirTorneio(21667, 'World Teen Championship 2026', 2)).toBe(true);
  });
});
