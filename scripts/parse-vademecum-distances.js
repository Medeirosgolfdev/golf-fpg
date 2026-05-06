/**
 * scripts/parse-vademecum-distances.js
 *
 * Lê o Vademecum FFG (PDF 388 páginas) e extrai as tabelas de:
 *  - Distâncias máximas por categoria de idade (Cahier des charges Grands Prix Jeunes)
 *  - Tees recomendados (cores, jardas/metros) por categoria
 *
 * Atualiza `public/data/ffg-categories-age.json` com os campos
 * `distancesParCategorie` populados.
 *
 * USO:
 *   1. Descarrega o Vademecum:
 *        Invoke-WebRequest "https://www.ffgolf.org/content/download/54677/file/Vademecum%202024.pdf" `
 *          -OutFile public\data\Vademecum2024.pdf
 *
 *   2. Corre:
 *        node scripts/parse-vademecum-distances.js
 *
 *   (alternativa: passa --pdf para usar outro caminho)
 *      node scripts/parse-vademecum-distances.js --pdf public/data/Vademecum2024.pdf
 *
 * O script:
 *   1. Carrega o PDF
 *   2. Procura a secção "Cahier des charges des Grands Prix Jeunes"
 *   3. Extrai tabelas de distâncias por categoria
 *   4. Atualiza ffg-categories-age.json
 */

const fs = require("fs");
const path = require("path");
const pdfParse = require("pdf-parse/lib/pdf-parse.js");

const args = process.argv.slice(2);
const pdfPath = args.indexOf("--pdf") >= 0
  ? args[args.indexOf("--pdf") + 1]
  : path.resolve(__dirname, "../public/data/Vademecum2024.pdf");
const outJson = path.resolve(__dirname, "../public/data/ffg-categories-age.json");

if (!fs.existsSync(pdfPath)) {
  console.error(`❌ PDF não encontrado: ${pdfPath}`);
  console.error(`   Descarrega primeiro:`);
  console.error(`   Invoke-WebRequest "https://www.ffgolf.org/content/download/54677/file/Vademecum%202024.pdf" -OutFile public\\data\\Vademecum2024.pdf`);
  process.exit(1);
}

(async () => {
  console.log(`📖 A ler ${pdfPath} ...`);
  const buf = fs.readFileSync(pdfPath);
  const data = await pdfParse(buf);
  console.log(`   ${data.numpages} páginas, ${data.text.length} chars`);

  // Localizar secção "Cahier des charges des Grands Prix Jeunes"
  const text = data.text;
  const sectionIdx = text.search(/cahier\s+des\s+charges\s+des\s+grands?\s+prix\s+jeunes/i);
  if (sectionIdx < 0) {
    console.error(`❌ Secção "Cahier des charges des Grands Prix Jeunes" não encontrada.`);
    process.exit(1);
  }
  console.log(`   Secção encontrada em offset ${sectionIdx}`);

  // Extrair contexto à volta (próximas 30000 chars — ~30 páginas)
  const section = text.slice(sectionIdx, sectionIdx + 30000);
  fs.writeFileSync(path.resolve(__dirname, "../public/data/_vademecum-section-jeunes.txt"), section, "utf-8");
  console.log(`   💾 Secção bruta guardada em public/data/_vademecum-section-jeunes.txt para inspecção`);

  // Procurar tabelas de distâncias — heurística: linhas com categoria + 2-3 números
  // Padrões esperados:
  //   "U10  ...  4500m"
  //   "Benjamin(e) 1  ...  5000-5500"
  //   "Poucet(te) 1  ...  3500"
  // Categorias típicas:
  const categories = [
    { key: "Enfant",        regex: /enfant/i },
    { key: "Poucet(te) 1",  regex: /poucet[^\s]*\s*1/i },
    { key: "Poucet(te) 2",  regex: /poucet[^\s]*\s*2/i },
    { key: "Poussin 1",     regex: /poussin\s*1/i },
    { key: "Poussin 2",     regex: /poussin\s*2/i },
    { key: "Benjamin(e) 1", regex: /benjamin[^\s]*\s*1/i },
    { key: "Benjamin(e) 2", regex: /benjamin[^\s]*\s*2/i },
    { key: "Minime 1",      regex: /minime\s*1/i },
    { key: "Minime 2",      regex: /minime\s*2/i },
    { key: "Cadet(te) 1",   regex: /cadet[^\s]*\s*1/i },
    { key: "Cadet(te) 2",   regex: /cadet[^\s]*\s*2/i },
  ];

  const lines = section.split(/\n/).map((l) => l.trim()).filter((l) => l);
  const distances = {};
  for (const line of lines) {
    for (const cat of categories) {
      if (cat.regex.test(line)) {
        // Apanhar números que parecem distâncias (3000-7000m)
        const nums = line.match(/\d{3,4}/g);
        if (nums && nums.length > 0) {
          const filtered = nums.map((n) => parseInt(n, 10)).filter((n) => n >= 1500 && n <= 7500);
          if (filtered.length > 0) {
            if (!distances[cat.key]) distances[cat.key] = [];
            distances[cat.key].push({ line: line.slice(0, 200), nums: filtered });
          }
        }
      }
    }
  }

  console.log(`\n📊 Distâncias detectadas (heurístico — verificar manualmente):`);
  for (const [cat, hits] of Object.entries(distances)) {
    console.log(`   ${cat}: ${hits.length} match(es)`);
    hits.slice(0, 2).forEach((h, i) => console.log(`      ${i+1}. nums=${h.nums.join(",")}  line="${h.line.slice(0, 80)}"`));
  }

  // Atualizar ffg-categories-age.json
  let json = {};
  if (fs.existsSync(outJson)) json = JSON.parse(fs.readFileSync(outJson, "utf-8"));
  json.distancesParCategorie = {
    _source: "Cahier des charges des Grands Prix Jeunes (Vademecum FFG)",
    _extractedAt: new Date().toISOString(),
    _pdfPath: pdfPath,
    _note: "Extraído heuristicamente do PDF — pode precisar de revisão manual.",
    matches: distances,
  };
  fs.writeFileSync(outJson, JSON.stringify(json, null, 2), "utf-8");
  console.log(`\n✅ Atualizado: ${outJson}`);
  console.log(`   Inspeccionar a secção raw em public/data/_vademecum-section-jeunes.txt para confirmar.`);
})();
