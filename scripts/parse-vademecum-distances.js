/**
 * scripts/parse-vademecum-distances.js
 *
 * Lê o Vademecum FFG (PDF 388 páginas) e extrai a tabela de distâncias
 * recomendadas por categoria de idade, da secção:
 *   §3-6-4 "Recommandations de la longueur des terrains pour les jeunes"
 * (página ~271).
 *
 * USO:
 *   1. Descarrega o PDF:
 *      Invoke-WebRequest "https://www.ffgolf.org/content/download/54677/file/Vademecum%202024.pdf" `
 *        -OutFile public\data\Vademecum2024.pdf
 *
 *   2. Corre:
 *      node scripts/parse-vademecum-distances.js
 *
 * Output:
 *   - public/data/_vademecum-section-jeunes.txt — secção bruta para inspecção
 *   - public/data/ffg-categories-age.json — actualizado com distancesParCategorie
 */

const fs = require("fs");
const path = require("path");
const pdfParse = require("pdf-parse/lib/pdf-parse.js");

const args = process.argv.slice(2);
const pdfPath = args.indexOf("--pdf") >= 0
  ? args[args.indexOf("--pdf") + 1]
  : path.resolve(__dirname, "../public/data/Vademecum2024.pdf");
const outJson = path.resolve(__dirname, "../public/data/ffg-categories-age.json");
const dumpTxt = path.resolve(__dirname, "../public/data/_vademecum-section-jeunes.txt");

if (!fs.existsSync(pdfPath)) {
  console.error(`❌ PDF não encontrado: ${pdfPath}`);
  process.exit(1);
}

(async () => {
  console.log(`📖 A ler ${pdfPath} ...`);
  const buf = fs.readFileSync(pdfPath);
  const data = await pdfParse(buf);
  console.log(`   ${data.numpages} páginas, ${data.text.length} chars`);

  const text = data.text;

  // 1. Procurar a secção §3-6-4 "Recommandations de la longueur des terrains pour les jeunes"
  // Ocorre 2× — uma no índice (offset baixo) e outra no conteúdo (offset alto)
  const recMatches = [...text.matchAll(/[Rr]ecommandations\s+de\s+la\s+longueur\s+des\s+terrains?\s+pour\s+les\s+jeunes/g)];
  console.log(`   "Recommandations de la longueur" — ${recMatches.length} ocorrências`);

  // 2. Procurar a secção §3-6-3 "Marques de départs et catégories d'âge"
  const marquesMatches = [...text.matchAll(/[Mm]arques\s+de\s+d[ée]parts?\s+et\s+cat[ée]gories\s+d['’]\s*[âa]ge/g)];
  console.log(`   "Marques de départs et catégories d'âge" — ${marquesMatches.length} ocorrências`);

  // Estratégia: usar a ÚLTIMA ocorrência da §3-6-3 (que é o conteúdo, não o índice).
  // A §3-6-3 e §3-6-4 estão próximas — capturar bloco a partir da última 3-6-3 até ~30kB.
  let sectionIdx = -1;
  let sectionLabel = "";
  if (marquesMatches.length > 0) {
    sectionIdx = marquesMatches[marquesMatches.length - 1].index;
    sectionLabel = "§3-6-3 Marques de départs et catégories d'âge (+ §3-6-4)";
  } else if (recMatches.length > 0) {
    sectionIdx = recMatches[recMatches.length - 1].index;
    sectionLabel = "§3-6-4 Recommandations de la longueur des terrains pour les jeunes";
  } else {
    console.error(`❌ Nenhuma secção encontrada.`);
    process.exit(1);
  }

  console.log(`   📍 Usar offset ${sectionIdx}: ${sectionLabel}`);
  const section = text.slice(sectionIdx, sectionIdx + 40000);
  fs.writeFileSync(dumpTxt, section, "utf-8");
  console.log(`   💾 ${dumpTxt}`);

  // 3. Estrutura da secção §3-6-4 — duas tabelas:
  //    Tabela 1 (épreuve départementale): "U10 U8" header + 9 linhas par-data + 1 linha total
  //    Tabela 2 (Mérite National Jeunes): "Minimes Benjamins U12" header + 9 linhas + total
  //
  // Linha header: "U10 U8" (categorias separadas por espaço)
  // Sub-header: "Nbre Trous Garçons Filles Nbre Trous Garçons Filles ..."
  // Linhas dados: "<n> <distM> <distF> <n> <distM> <distF> [...]"
  // Linha TOTAL: "18 <totalM> <totalF> 18 <totalM> <totalF> [...]" (n.º buracos)
  const lines = section.split("\n").map((l) => l.trim()).filter((l) => l);

  // Localizar headers de tabelas — linhas com 1-3 categorias (U8/U10/U12/Minimes/Benjamins/Cadets)
  const CAT_REGEX = /^(?:U(?:8|10|12|14|16|18)|Minimes?|Benjamins?|Cadets?|Poucets?|Poussins?)$/i;
  const tables = [];
  for (let i = 0; i < lines.length; i++) {
    const tokens = lines[i].split(/\s+/);
    const allCats = tokens.every((t) => CAT_REGEX.test(t)) && tokens.length >= 1 && tokens.length <= 4;
    if (allCats && tokens.length > 0) {
      // Próxima linha deve ser o sub-header "Nbre Trous Garçons Filles ..." (repetido)
      const nextLine = lines[i + 1] || "";
      if (/Nbre\s+Trous|Garçons|Filles/i.test(nextLine)) {
        tables.push({ headerLine: i, categories: tokens, dataStart: i + 2 });
      }
    }
  }

  console.log(`\n📊 ${tables.length} tabelas encontradas`);

  const matches = {};
  for (const t of tables) {
    // Encontrar linha TOTAL — primeira linha onde o número-de-trous é >= 9 e múltiplo de 9
    // (i.e., 9, 18) — cada categoria deve ter 3 números na total: trous, totalG, totalF
    let totalLine = null;
    for (let i = t.dataStart; i < lines.length; i++) {
      const nums = (lines[i].match(/\d+/g) || []).map(Number);
      // Esperado: 3 × N categorias números, e o primeiro de cada grupo de 3 é o nº de buracos (>= 9)
      if (nums.length === t.categories.length * 3) {
        const trousValues = [];
        for (let c = 0; c < t.categories.length; c++) trousValues.push(nums[c * 3]);
        if (trousValues.every((n) => n >= 9 && n <= 18)) {
          totalLine = nums;
          break;
        }
      }
      // Parar se aparecer outro header
      if (lines[i] && CAT_REGEX.test(lines[i].split(/\s+/)[0]) && i > t.dataStart) break;
    }
    if (!totalLine) continue;

    for (let c = 0; c < t.categories.length; c++) {
      const cat = t.categories[c];
      matches[cat] = {
        trous: totalLine[c * 3],
        Garcons: totalLine[c * 3 + 1],
        Filles: totalLine[c * 3 + 2],
      };
    }
  }

  console.log(`\n📊 Distâncias detectadas:`);
  if (Object.keys(matches).length === 0) {
    console.log(`   ⚠ Nenhuma distância detectada. Inspecciona ${dumpTxt}`);
    console.log(`\n--- Primeiras 30 linhas da secção ---`);
    lines.slice(0, 30).forEach((l, i) => console.log(`   ${i.toString().padStart(2, " ")}: ${l.slice(0, 120)}`));
  } else {
    console.log(`   ${"Categoria".padEnd(12)} ${"#Trous".padStart(7)} ${"Garçons".padStart(8)} ${"Filles".padStart(7)}`);
    for (const [cat, d] of Object.entries(matches)) {
      console.log(`   ${cat.padEnd(12)} ${String(d.trous).padStart(7)} ${String(d.Garcons).padStart(8)}m ${String(d.Filles).padStart(6)}m`);
    }
  }

  // 4. Atualizar ffg-categories-age.json
  let json = {};
  if (fs.existsSync(outJson)) json = JSON.parse(fs.readFileSync(outJson, "utf-8"));
  json.distancesParCategorie = {
    _source: "Vademecum FFG — " + sectionLabel,
    _extractedAt: new Date().toISOString(),
    _pdfPath: pdfPath,
    _note: "Distâncias máximas em metros (par 72 indicativo). Categoria → {trous, Garcons, Filles}.",
    matches,
  };
  fs.writeFileSync(outJson, JSON.stringify(json, null, 2), "utf-8");
  console.log(`\n✅ Atualizado: ${outJson}`);
})();
