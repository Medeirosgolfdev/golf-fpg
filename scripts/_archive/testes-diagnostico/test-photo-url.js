#!/usr/bin/env node
/**
 * test-photo-url.js — Testa URL de fotos FPG via Node.
 *
 * Descoberto 2026-04-16: as fotos estão em hcp-portugal.datagolf.pt/photos/{path}
 * e são públicas (sem cookies necessários).
 *
 * Uso: node scripts/test-photo-url.js [photo_path]
 *   Default: 1/503e183d-c52c-47eb-8e0d-fe09ae646ec5.jpeg (A. Pedro Cabral)
 */

const PHOTO_PATH = process.argv[2] || "1/503e183d-c52c-47eb-8e0d-fe09ae646ec5.jpeg";

async function main() {
  const url = `https://hcp-portugal.datagolf.pt/photos/${PHOTO_PATH}`;

  console.log(`=== Teste de foto FPG ===`);
  console.log(`URL: ${url}`);
  console.log();

  try {
    const r = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "image/*,*/*;q=0.8",
      },
    });

    const ct = r.headers.get("content-type") || "";
    const cl = r.headers.get("content-length") || "?";
    const cors = r.headers.get("access-control-allow-origin") || "(nenhum)";

    console.log(`HTTP ${r.status}`);
    console.log(`Content-Type: ${ct}`);
    console.log(`Content-Length: ${cl}`);
    console.log(`CORS: ${cors}`);

    if (!r.ok) {
      console.log(`\n❌ Falhou com HTTP ${r.status}`);
      return;
    }

    const buf = Buffer.from(await r.arrayBuffer());
    console.log(`Bytes recebidos: ${buf.length}`);

    if (ct.includes("image")) {
      console.log(`\n✅ Foto carregada com sucesso! (${buf.length} bytes, ${ct})`);
      console.log(`\nPadrão confirmado:`);
      console.log(`  https://hcp-portugal.datagolf.pt/photos/{photo_path}`);
      console.log(`  Público, sem cookies necessários.`);
    } else {
      console.log(`\n⚠️  Resposta OK mas Content-Type inesperado: ${ct}`);
      console.log(`Preview: ${buf.toString("utf8").substring(0, 200)}`);
    }
  } catch (err) {
    console.log(`\n❌ Erro: ${err.message}`);
  }
}

main();
