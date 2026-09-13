#!/usr/bin/env node
'use strict';

/**
 * Canário do monitor de field USKids.
 *
 * A avaria de 2026 durou 7 SEMANAS porque o workflow ficava verde a descobrir
 * zero torneios. Isto falha o job (= o GitHub manda email) quando a varredura
 * parou a sério — e cala-se quando a fonte simplesmente nos recusou naquele
 * dia, que é coisa que se resolve sozinha na corrida seguinte.
 *
 * A decisão vive em lib/uskids-rate-guard.js (pura, testada); aqui só se lêem
 * os dois ficheiros. Exit 0 = ok · 1 = alarme.
 */

const fs = require('fs');
const path = require('path');
const { avaliarCanario } = require('./lib/uskids-rate-guard');

const DIR = process.env.USKIDS_DATA_DIR || path.join(__dirname, '..', 'public', 'data');
const ler = (f) => { try { return JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8')); } catch { return {}; } };

const cache = ler('uskids-discovery-cache.json');
// A prova de recusa vem do field.json: a Fase 2 corre DEPOIS de a cache ser
// escrita, por isso é lá que o nº de recusas deste run fica registado.
const field = ler('uskids-field.json');

console.log(`sem torneios novos: ${cache.dias_sem_descoberta}d | ` +
            `sem a fronteira avançar: ${cache.dias_sem_avanco}d | ` +
            `último tcode vivo: ${cache.varredura_max_t}`);
console.log(`varredura: ${JSON.stringify(cache.varredura || {})}`);
if (field.rate_limit_hits) console.log(`recusas da fonte neste run: ${field.rate_limit_hits}`);

const r = avaliarCanario({
  varredura: cache.varredura,
  diasSemDescoberta: cache.dias_sem_descoberta,
  diasSemAvanco: cache.dias_sem_avanco,
  rateLimitHits: field.rate_limit_hits || 0,
});

for (const a of r.avisos) console.log(`::warning::USKids: ${a}.`);
if (!r.falhar) { console.log('OK'); process.exit(0); }

console.log(`::error::USKids: a varredura pode estar parada — ${r.erros.join('; ')}. ` +
            'Ver a secção da varredura de tcodes no CLAUDE.md.');
process.exit(1);
