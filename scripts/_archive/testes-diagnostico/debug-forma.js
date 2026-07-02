const fs = require("fs");
const path = require("path");
const REPO = path.resolve(__dirname, "..");
const ADM = path.join(REPO, "public/data/fpg-admissions-draws.json");
console.log('__dirname:', __dirname);
console.log('REPO:', REPO);
console.log('ADM:', ADM);
console.log('exists:', fs.existsSync(ADM));
const stat = fs.statSync(ADM);
console.log('size:', stat.size);
const t = fs.readFileSync(ADM, 'utf8');
console.log('utf8 len:', t.length);
const t2 = fs.readFileSync(ADM); // buffer
console.log('buffer len:', t2.length);
console.log('first 20 bytes hex:', t2.slice(0,20).toString('hex'));
console.log('first 20 chars:', t.slice(0,20));
try { JSON.parse(t); console.log('PARSE OK'); }
catch(e) { console.log('PARSE FAIL:', e.message.slice(0,100)); }
