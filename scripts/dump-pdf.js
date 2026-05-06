/**
 * scripts/dump-pdf.js — debug: descarrega 1 PDF e dump o texto raw
 *
 * Usa: node scripts/dump-pdf.js <pdf-url>
 *      node scripts/dump-pdf.js  (default: GP1 PIDF U12 Filles)
 */
const https = require("https");
const fs = require("fs");
const path = require("path");

const pdfParse = require("pdf-parse/lib/pdf-parse.js");

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { "User-Agent": "Mozilla/5.0" } }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) return resolve(fetchUrl(res.headers.location));
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve({ status: res.statusCode, body: Buffer.concat(chunks) }));
      res.on("error", reject);
    }).on("error", reject);
  });
}

(async () => {
  const url = process.argv[2] ||
    "https://www.lgpidf.com/models/gallerymedia/assets/6//6bdd9c4130c96_2026-gpj1-pidf-resultats-u12f-t2.pdf";
  console.log("Downloading:", url);
  const r = await fetchUrl(url);
  console.log("Status:", r.status, "Size:", r.body.length);
  // Save PDF to disk for inspection
  const filename = url.split("/").pop();
  const pdfPath = path.resolve(__dirname, "../tmp-" + filename);
  fs.writeFileSync(pdfPath, r.body);
  console.log("Saved:", pdfPath);
  // Parse
  const data = await pdfParse(r.body);
  const txtPath = pdfPath.replace(".pdf", ".txt");
  fs.writeFileSync(txtPath, data.text);
  console.log("Text saved:", txtPath);
  console.log("Pages:", data.numpages, "Text length:", data.text.length);
  console.log("\n--- FIRST 3000 CHARS ---\n");
  console.log(data.text.slice(0, 3000));
  console.log("\n--- LINES (first 50) ---");
  data.text.split("\n").slice(0, 50).forEach((l, i) => console.log(i, JSON.stringify(l.slice(0, 120))));
})();
