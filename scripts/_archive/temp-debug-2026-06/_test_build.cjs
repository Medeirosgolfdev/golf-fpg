
const fs = require('fs');
const path = require('path');
const REPO = path.resolve(__dirname, '..');
const ADM = path.join(REPO, 'public/data/fpg-admissions-draws.json');
const PLAYERS = path.join(REPO, 'public/data/players.json');
console.log('ADM:', ADM, 'exists:', fs.existsSync(ADM));
console.log('size:', fs.statSync(ADM).size);
console.log('ADM mtime:', fs.statSync(ADM).mtime);
const txt = fs.readFileSync(ADM, 'utf8');
console.log('utf8 len:', txt.length);
console.log('first 50:', txt.slice(0,50));
try { const j = JSON.parse(txt); console.log('OK', j.tournaments.length); }
catch(e) { console.log('FAIL:', e.message.slice(0,100)); console.log('around 103940:', JSON.stringify(txt.slice(103940, 103970))); }
