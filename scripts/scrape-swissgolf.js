#!/usr/bin/env node
/**
 * scripts/scrape-swissgolf.js
 *
 * Provas JUVENIS da Swiss Golf (federação suíça) → kids2. A Swiss Golf publica
 * tudo no GolfBox Livescoring (customer 1085) — API pública, sem conta, a mesma
 * do scrape-golfbox.js, de quem se reaproveita o `scrapeOne` (classificação,
 * voltas buraco a buraco, ano de nascimento, clube, handicap do dia, campo).
 *
 *   calendário: scores.golfbox.dk/Handlers/ScheduleHandler/GetSchedule/CustomerId/1085/Season/{ano}/
 *
 * Entram: Junior Tour (U16/U18), National Events U14, National Championships
 * U10–U18, finais U10/U12/U14/U18 e o Golf4Girls Championship. Ficam fora os
 * jogos por equipas contra regiões (match play), as provas de acompanhantes,
 * camps, family days, indoor e o U25.
 *
 * Porquê (Mariana, 04/11/2026): o EGR já trazia ~140 destas provas, mas só com
 * o total de cada volta; o GolfBox dá o resto. O dedup genérico do EGR
 * (util/egr-dedup.js) tira a versão EGR quando esta cobre a mesma prova.
 *
 * Saída: public/data/swissgolf/{competitionId}.json — JobFile (util/jobfile.js),
 * 1 ficheiro por prova; adaptador sources/swissgolf.js. Só kids2 (não vai à /major).
 *
 * Uso:
 *   node scripts/scrape-swissgolf.js                     # época corrente e a anterior
 *   node scripts/scrape-swissgolf.js --anos 2025,2026
 *   node scripts/scrape-swissgolf.js --ids 5359031,5358001
 *
 * Pedidos um a um, com pausa. Exit: 0 gravou · 2 nada de novo · 1 erro.
 */
"use strict";
const fs = require("fs");
const path = require("path");
const { fetchJsonp, scrapeOne } = require("./scrape-golfbox");
const { writeJsonGuarded } = require("./lib/shrink-guard");

const CUSTOMER = 1085;
const OUT_DIR = path.join(__dirname, "..", "public", "data", "swissgolf");
const PAUSA_MS = 2000;

/** Provas juvenis individuais pelo nome. */
const JUVENIL = /Junior Tour|National Event U\d|National Championship (?:Boys |Girls )?U1\d|National Championship U\d|Final U\d|Final\s+U\d|Golf4Girls Championship/i;
const FORA = /Accompagn|Begleit|Captains|Camp|Family|Indoor|beat the Pro|Match ?Play|U25|ANNUL|ABGESAGT/i;

const arg = (n) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : null; };
const dorme = (ms) => new Promise((r) => setTimeout(r, ms));
const hojeLisboa = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Lisbon" }).format(new Date());

async function provasDoCalendario(anos) {
  const hoje = hojeLisboa().replace(/-/g, "");
  const lista = [];
  for (const ano of anos) {
    const sc = await fetchJsonp(`https://scores.golfbox.dk/Handlers/ScheduleHandler/GetSchedule/CustomerId/${CUSTOMER}/Season/${ano}/?callback=x`);
    for (const se of Object.values(sc?.CompetitionData || {})) {
      for (const m of Object.values(se.Months || {})) {
        for (const e of Object.values(m.Entries || {})) {
          const nome = String(e.Name || "");
          const inicio = String(e.StartDate || "").slice(0, 8);
          if (!JUVENIL.test(nome) || FORA.test(nome)) continue;
          if (inicio && inicio > hoje) continue; // ainda não jogada
          lista.push({ id: String(e.ID), nome, inicio });
        }
      }
    }
    await dorme(PAUSA_MS);
  }
  return [...new Map(lista.map((p) => [p.id, p])).values()].sort((a, b) => a.inicio.localeCompare(b.inicio));
}

/** Jogadores com pelo menos uma volta — o que a guarda conta. O «U16» do Junior
 *  Tour e o «U12» dos Nacionais repetem miúdos do «U18»/«U14»: ficam as duas
 *  divisões tal como a fonte as dá; o jobfile.js deixa cada miúdo só no escalão
 *  mais específico (`umaDivisaoPorJogador`). */
const comVoltas = (d) => (d.divisions || []).reduce((n, dv) => n + (dv.players || []).filter((p) => (p.rounds || []).length || (p.roundGross || []).length).length, 0);

(async () => {
  const ids = arg("--ids");
  const anoAtual = Number(hojeLisboa().slice(0, 4));
  const anos = arg("--anos") ? arg("--anos").split(",").map((s) => Number(s.trim())) : [anoAtual - 1, anoAtual];
  const provas = ids ? ids.split(",").map((id) => ({ id: id.trim(), nome: "" })) : await provasDoCalendario(anos);
  console.log(`Swiss Golf: ${provas.length} prova(s) juvenis ${ids ? "(--ids)" : `de ${anos.join(", ")}`}`);
  fs.mkdirSync(OUT_DIR, { recursive: true });

  let gravados = 0, iguais = 0, vazios = 0, erros = 0;
  for (const p of provas) {
    try {
      const { out } = await scrapeOne(p.id, {});
      const file = path.join(OUT_DIR, `${p.id}.json`);
      const n = comVoltas(out);
      if (!n) { vazios++; console.log("   ⏭️  sem resultados — não gravado"); continue; }
      const data = { ...out, competitionId: p.id, customer: "Swiss Golf" };
      let anterior = null;
      try { anterior = JSON.parse(fs.readFileSync(file, "utf8")); } catch { /* ficheiro novo */ }
      const sem = (o) => { const c = { ...o }; delete c.scrapedAt; return JSON.stringify(c); };
      if (anterior && sem(anterior) === sem(data)) { iguais++; console.log("   ⏭️  sem alterações"); }
      else if (writeJsonGuarded(file, data, { count: comVoltas }).written) { gravados++; console.log(`   ✅ ${n} jogadores → ${path.basename(file)}`); }
      else { erros++; }
    } catch (e) {
      erros++;
      console.error(`   ❌ ${p.id} ${p.nome}: ${e.message}`);
    }
    await dorme(PAUSA_MS);
  }
  console.log(`\n🏁 ${gravados} gravada(s) · ${iguais} sem alterações · ${vazios} sem resultados · ${erros} erro(s)`);
  process.exitCode = erros && !gravados ? 1 : gravados ? 0 : 2;
})().catch((e) => { console.error("❌", e.message); process.exit(1); });
