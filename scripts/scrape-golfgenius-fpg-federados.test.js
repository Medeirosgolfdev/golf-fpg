// Federados FPG num campo GolfGenius: federado na FPG não é o mesmo que
// português, e o 99 «Sem HCP» não é um handicap (Grand Final Faldo 2026:
// Alwin Türklitz, alemão federado na Quinta do Lago, saía PT com HCP 99).
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import os from 'os';
import path from 'path';
const require = createRequire(import.meta.url);
const { applyFpgFederados } = require('./scrape-golfgenius-node.js');

function comFederados(players) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fpgfed-'));
  const file = path.join(dir, 'federados.json');
  fs.writeFileSync(file, JSON.stringify({ generated: '2026-11-11', players }));
  return file;
}

const out = () => ({ divisions: [{ players: [
  { name: 'Santiago Dias', country: null },
  { name: 'Alwin Türklitz', country: 'DE' },
  { name: 'Ricky Mohun', country: null },
] }] });

const FED = [
  { federation_code: '42908', name: 'Santiago Dias', birthdate: '2012-05-29', club_name: 'Oporto Golf Clube', acronym: 'Oporto', country_prefix: 'PT', hcp_exact: -2, hcp_status_id: 10 },
  { federation_code: '57934', name: 'Alwin Turklitz', birthdate: '2011-05-13', club_name: 'Clube de Golfe da Quinta do Lago', country_prefix: 'DE', hcp_exact: 99, hcp_status_id: 99 },
  { federation_code: '1', name: 'Ricky Mohun', birthdate: '2012-01-01', club_name: 'X', country_prefix: '@1', hcp_exact: 3.1, hcp_status_id: 10 },
];

describe('applyFpgFederados', () => {
  it('país pelo country_prefix da FPG e sem o 99 «Sem HCP»', () => {
    const o = out();
    applyFpgFederados(o, { file: comFederados(FED) });
    const [santi, alwin, ricky] = o.divisions[0].players;
    expect(santi).toMatchObject({ country: 'PT', hcp: -2, fed: '42908', dob: '2012-05-29' });
    expect(alwin).toMatchObject({ country: 'DE', fed: '57934', dob: '2011-05-13' });
    expect(alwin.hcp).toBeUndefined();
    expect(ricky).toMatchObject({ country: 'GB-ENG', hcp: 3.1 });
  });
});
