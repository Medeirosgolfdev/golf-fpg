// Opções do <select> do GolfGenius que só mudam a RONDA, não o escalão.
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { isRoundOnlyLabel } = require('./scrape-golfgenius-node.js');

describe('isRoundOnlyLabel', () => {
  it('«Final Round (data)» é só a ronda (Junior Invitational 2026: os rapazes desapareciam)', () => {
    for (const l of ['Final Round (Sat, March 14)', 'Round 3 (Fri, March 13)', 'Round 1 (Wed, March 11)', 'Final Round']) {
      expect(isRoundOnlyLabel(l)).toBe(true);
    }
  });
  it('um escalão com a ronda continua a ser escalão', () => {
    expect(isRoundOnlyLabel('Boys 12-14 Final Round - Palmer Course')).toBe(false);
    expect(isRoundOnlyLabel('Girls 10 Round 2')).toBe(false);
  });
});
