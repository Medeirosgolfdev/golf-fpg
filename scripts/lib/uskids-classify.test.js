import { describe, it, expect } from 'vitest';
import classify from './uskids-classify.js';

const { incluirTorneio, ehInternacional, TIPOS_INCLUIR, TIPOS_EXCLUIR, TIPO_LABEL } = classify;

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

  it('14/09/2026: entram os Mundiais (4 e 3) e as Teen Series (2 e 13)', () => {
    expect(incluirTorneio(21610, 'World Championship 2026', 4)).toBe(true);
    expect(incluirTorneio(21667, 'World Teen Championship 2026', 3)).toBe(true);
    expect(incluirTorneio(22606, 'Teen Series at Longleaf (NC)', 2)).toBe(true);
    expect(incluirTorneio(23999, 'International Teen Series at Somewhere', 13)).toBe(true);
  });

  it('14/09/2026: entram TODOS os Tour Championships, dos EUA incluídos', () => {
    expect(incluirTorneio(22402, 'Qualquer Golf Club (Tour Championship)', 6, 'Northern Virginia Tour')).toBe(true);
    expect(incluirTorneio(22241, 'Qualquer Golf Club (Tour Championship)', 6, 'Lima (PE) Tour')).toBe(true);
  });

  it('"não procures os GIRLS": os Girls ficam fora, seja qual for o nome', () => {
    expect(incluirTorneio(23049, '2026 Girls Invitational - Longleaf (NC)', 12)).toBe(false);
    expect(incluirTorneio(23050, 'Girls Venice Open', 12)).toBe(false);
  });

  it('Local Tour normal continua fora', () => {
    expect(incluirTorneio(22592, 'The Legends Golf Club', 5)).toBe(false);
    expect(ehInternacional('Golf Club Varese', 5)).toBe(false);
  });

  it('Parent/Child, Veteran e Van Horn ficam fora mesmo com um tipo da lista', () => {
    expect(incluirTorneio(23386, 'Holiday Classic Parent/Child 2026', 1)).toBe(false);
    expect(incluirTorneio(22095, 'World Championship Parent/Child 2026 - Boys', 8)).toBe(false);
    expect(incluirTorneio(21666, 'Veteran Golfers Association World Championship Qualifier 2026', 4)).toBe(false);
    expect(incluirTorneio(29999, 'World Van Horn Cup 2027', 4)).toBe(false);
  });

  it('cada tipo conhecido entra ou sai só pelo tipo', () => {
    expect([...TIPOS_INCLUIR].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 6, 7, 8, 13]);
    expect([...TIPOS_EXCLUIR].sort((a, b) => a - b)).toEqual([9, 12]);
    for (const ty of Object.keys(TIPO_LABEL).map(Number)) {
      expect(incluirTorneio(999999, 'Nome Sem Palavras Chave', ty)).toBe(TIPOS_INCLUIR.has(ty));
    }
  });
});

describe('uskids-classify — camada de palavras-chave (Local Tours seguidos)', () => {
  it('mantém as etapas de Local Tour que seguimos de propósito', () => {
    expect(incluirTorneio(22767, 'Azata Golf', 5)).toBe(true);
    expect(incluirTorneio(22272, 'Santa Maria Country Club & Club de Golf de Panama', 5)).toBe(true);
  });

  it('entradas de cache antigas (sem tipo) continuam a ser lidas pelo nome', () => {
    expect(incluirTorneio(22539, '2026 Gulf Coast State Invitational', undefined)).toBe(true);
    expect(incluirTorneio(22592, 'The Legends Golf Club', undefined)).toBe(false);
  });

  it('FORCAR_EXCLUIR vence o tipo e FORCAR_INCLUIR vence o nome', () => {
    expect(incluirTorneio(22140, 'OPEN.9 Golf Eichenried', 8)).toBe(false);
    expect(incluirTorneio(21080, 'Nome Qualquer', 5)).toBe(true);
  });
});
