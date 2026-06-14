/**
 * scripts/dump-local-pdf.js — despeja o texto de um PDF LOCAL (debug de draws).
 *
 * Uso:
 *   node scripts/dump-local-pdf.js "draws-cgss-2025\\Draw-DN26-Extenso.pdf"
 *
 * Imprime o texto todo na consola e grava-o ao lado do PDF (mesmo nome, .txt),
 * para se poder copiar/colar facilmente.
 */
const fs = require("fs");
const path = require("path");
const pdfParse = require("pdf-parse/lib/pdf-parse.js");

(async () => {
  const rel = process.argv[2];
  if (!rel) {
    console.error("Falta o caminho do PDF. Ex: node scripts/dump-local-pdf.js \"draws-cgss-2025\\Draw-DN26-Extenso.pdf\"");
    process.exit(1);
  }
  const pdfPath = path.resolve(process.cwd(), rel);
  if (!fs.existsSync(pdfPath)) {
    console.error("Não encontrei o ficheiro:", pdfPath);
    process.exit(1);
  }
  const buf = fs.readFileSync(pdfPath);
  const data = await pdfParse(buf);
  const txtPath = pdfPath.replace(/\.pdf$/i, ".txt");
  fs.writeFileSync(txtPath, data.text, "utf-8");
  console.log("Páginas:", data.numpages, "| Caracteres:", data.text.length);
  console.log("Texto gravado em:", txtPath);
  console.log("\n================= TEXTO DO PDF =================\n");
  console.log(data.text);
})();
