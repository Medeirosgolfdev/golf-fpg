// GolfBox deixou de publicar nascimento, HCP, clube e equipa (18/11/2026): o que a
// fonte deixa de dar fica o que estava em disco; o HCP da inscrição só preenche o vazio.
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import os from 'os';
import path from 'path';
const require = createRequire(import.meta.url);
const { completarDoDisco } = require('./scrape-golfbox.js');

function emDisco(obj) {
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'gb-')), 'prova.json');
  fs.writeFileSync(f, JSON.stringify(obj));
  return f;
}

describe('completarDoDisco', () => {
  const antes = { divisions: [{ division: 'Boys U16', players: [
    { name: 'Arthur Marti Animägi', detailId: 'gb1', dob: '2009-07-07', birthYear: 2009, hcp: 3.2, club: 'EGCC', team: null },
    { name: 'Kris Kenzap', detailId: 'gb2', birthYear: 2010, hcp: 7.4, club: 'Niitvälja' },
  ] }] };

  it('mantém o que a fonte deixou de dar; não apaga o que ela ainda dá', () => {
    const f = emDisco(antes);
    const out = { divisions: [{ division: 'Boys U16', players: [
      { name: 'Arthur Marti Animagi', detailId: 'gb1', dob: null, birthYear: null, hcp: null, club: null },
      { name: 'Kris Kenzap', detailId: 'gb9', birthYear: null, hcp: 6.9, club: 'Outro', hcpInscricao: 5 },
    ] }] };
    completarDoDisco(f, out);
    const [a, k] = out.divisions[0].players;
    expect([a.dob, a.birthYear, a.hcp, a.club]).toEqual(['2009-07-07', 2009, 3.2, 'EGCC']);
    expect([k.birthYear, k.hcp, k.club]).toEqual([2010, 6.9, 'Outro']);
    expect('hcpInscricao' in k).toBe(false);
  });

  it('o HCP da inscrição só entra quando nem a fonte nem o disco têm', () => {
    const f = emDisco({ divisions: [{ division: 'Girls U14', players: [{ name: 'Nova', detailId: 'gb5' }] }] });
    const out = { divisions: [{ division: 'Girls U14', players: [{ name: 'Nova', detailId: 'gb5', hcp: null, hcpInscricao: 13.1 }] }] };
    completarDoDisco(f, out);
    expect(out.divisions[0].players[0].hcp).toBe(13.1);
  });

  it('sem ficheiro em disco não faz nada', () => {
    const out = { divisions: [{ division: 'X', players: [{ name: 'A', hcp: null }] }] };
    expect(completarDoDisco(path.join(os.tmpdir(), 'nao-existe-gb.json'), out)).toBe(0);
  });
});
