#!/usr/bin/env node
/**
 * scripts/scrape-golfbox-federacao.js
 *
 * Provas JUVENIS de uma federação que publica tudo no GolfBox Livescoring → kids2.
 * API pública, sem conta, a mesma do scrape-golfbox.js, de quem se reaproveita o
 * `scrapeOne` (classificação, voltas buraco a buraco, ano de nascimento, clube,
 * handicap do dia, campo). Uma entrada por federação em FEDERACOES:
 *
 *   swissgolf — Swiss Golf (customer 1085, 04/11/2026): Junior Tour (U16/U18),
 *     National Events U14, National Championships U10–U18, finais U10–U18.
 *     Fora: jogos por equipas contra regiões, acompanhantes, camps, family days,
 *     indoor, U25. (O Golf4Girls Championship não publica classificação.)
 *   rbgf — Royal Belgian Golf Federation (customer 22, 04/11/2026): Junior
 *     U12 & U14, Junior Opens, National Juniors Championship, Junior Masters,
 *     finais U12/U14. Fora: Interclubs (equipas), Bélgica × Países Baixos, Kids
 *     Tour (iniciação), provas canceladas.
 *   baltico — Letónia (federação, customer 911: BTA Junior Tour e Latvian Junior
 *     Open) e o Lithuanian Junior Open (customer 884, o clube que o organiza),
 *     04/11/2026. Fora as classes «Neto» (net), «LGF Dāmas/Kungi» (adultos).
 *
 *   calendário: scores.golfbox.dk/Handlers/ScheduleHandler/GetSchedule/CustomerId/{c}/Season/{ano}/
 *
 * As competições que já estão no scripts/golfbox-scope.json (ex.: o Albert
 * Vermeiren Trophy, fonte `avtrophy`) não se repetem aqui.
 *
 * Porquê (Mariana, 04/11/2026): o EGR já trazia muitas destas provas, mas só com
 * o total de cada volta. O dedup genérico do EGR (util/egr-dedup.js) tira a
 * versão EGR quando esta cobre a mesma prova. Classes repetidas (U16 dentro do
 * U18, U12 dentro do U14, «Overall») ficam como a fonte as dá: o jobfile.js
 * deixa cada miúdo só no escalão mais específico (`umaDivisaoPorJogador`).
 *
 * Saída: public/data/{fed}/{competitionId}.json — JobFile, 1 ficheiro por prova;
 * adaptadores sources/{swissgolf,rbgf,baltico,sgf,dgu,ngf,sgl,stars5}.js. Só kids2 (não vai à /major).
 *
 * Uso:
 *   node scripts/scrape-golfbox-federacao.js --fed swissgolf          # época corrente e a anterior
 *   node scripts/scrape-golfbox-federacao.js --fed rbgf --anos 2025,2026
 *   node scripts/scrape-golfbox-federacao.js --fed swissgolf --ids 5359031,5358001
 *
 * Pedidos um a um, com pausa. Exit: 0 gravou · 2 nada de novo · 1 erro.
 */
"use strict";
const fs = require("fs");
const path = require("path");
const { fetchJsonp, scrapeOne } = require("./scrape-golfbox");
const { writeJsonGuarded } = require("./lib/shrink-guard");

const FEDERACOES = {
  swissgolf: {
    nome: "Swiss Golf",
    customer: 1085,
    juvenil: /Junior Tour|National Event U\d|National Championship (?:Boys |Girls )?U1\d|National Championship U\d|Final\s+U\d|Golf4Girls Championship/i,
    fora: /Accompagn|Begleit|Captains|Camp|Family|Indoor|beat the Pro|Match ?Play|U25|ANNUL|ABGESAGT/i,
  },
  rbgf: {
    nome: "Royal Belgian Golf Federation",
    customer: 22,
    juvenil: /Junior U1\d|Junior Open|National Juniors? Championship|Junior Masters|Finals? Junior/i,
    fora: /Cancel|Interclubs|Kids Tour|Match|Albert Vermeiren/i,
  },
  // Suécia (SGF Juniortävlingar, customer 4): só o nível nacional — Svenska
  // Juniortouren Elit, a Final e o ANNIKA Invitational Europe (WAGR). Ficam fora as
  // ~350 regionais (Juniortouren Div./Vinter), os clubes e o match play.
  sgf: {
    nome: "Svenska Golfförbundet",
    customer: 4,
    juvenil: /Juniortouren Elit|Juniortouren Final|ANNIKA Invitational/i,
    fora: /Match|Vinter|Div\b|Div\.|Simulator|Klubblag/i,
  },
  // Dinamarca (Dansk Golf Union, customer 15): Dormy Elite Tour (Drenge U22 /
  // Piger), a Finale, o DM Juniorer (slagspil) e o Girls Only Tour. Fora o match
  // play (hulspil), seniores, para-golf e as filas de iniciação do Girls Only.
  dgu: {
    nome: "Dansk Golf Union",
    customer: 15,
    juvenil: /Dormy Elite Tour.*(Drenge|Piger)|Elite Tour Finale|DM Juniorer|Girls Only Tour/i,
    fora: /AFLYST|Hulspil|Senior|Para|Oprykning/i,
    // «Damer» = senhoras; GOT A/B = filas de iniciação; «WAGR-rækken» = outra vista
    classesFora: /^Damer$|\bA-r(æ|ae)kke|\bB-r(æ|ae)kke|^WAGR/i,
  },
  // Noruega (Norges Golfforbund, customer 18): o Srixon Tour (juvenil, U19) e o
  // Junior NM por pancadas. Fora o match play (Jr NM Match), Future Camps e Winter Open.
  ngf: {
    nome: "Norges Golfforbund",
    customer: 18,
    juvenil: /Srixon Tour/i,
    fora: /Match|Future Camp|Winter/i,
  },
  // Finlândia (Suomen Golfliitto, customer 332): FootJoy Finnish Junior Tour,
  // Junior SM por pancadas, Finnish International Junior (U14/U16) e a
  // qualificação do JR SM. Fora match play (reikäpeli), Challenge/Haastaja
  // (regionais), simulador, short course e o GJG (já vem pela fonte gjgl).
  sgl: {
    nome: "Suomen Golfliitto",
    customer: 332,
    juvenil: /Finnish Junior Tour|Finnish International Junior|Junioreiden lyöntipeli SM|JR SM rp karsinta/i,
    fora: /Reikäpeli|Challenge|Haastaja|Joukkue|Simulaattori|Short Course|GJG/i,
  },
  // Polónia: o 5 Stars Junior Cup by Adrian Meronk (customer 2299), o circuito
  // juvenil polaco no GolfBox.
  stars5: {
    nome: "5 Stars Junior Cup (Polónia)",
    customer: 2299,
    juvenil: /5 Stars/i,
    fora: /^$/,
    // «HCP klasa» = classificação por handicap (outra vista, net)
    classesFora: /HCP klasa/i,
  },
  // Letónia (federação, customer 911): Junior Tour e Latvian Junior Open;
  // Lituânia: só o Lithuanian Junior Open, no calendário do clube que o organiza
  // (European Centre Golf Club, customer 884 — a federação não está no GolfBox).
  baltico: {
    nome: "Bálticos (Letónia, Lituânia)",
    // «Neto Class» = a mesma volta em net; «LGF Dāmas/Kungi» = senhoras/homens
    // adultos; «Autobuss» = classe de convidados
    classesFora: /Neto|LGF D[aā]mas|LGF Kungi|Autobuss/i,
    calendarios: [
      { customer: 911, juvenil: /Junioru golfa t[uū]re|Junior Open/i, fora: /Chip|Short Game|Olimpi/i },
      { customer: 884, juvenil: /Lithuanian Junior Open/i, fora: /^$/ },
    ],
  },
};
const PAUSA_MS = 2000;
const SCOPE_GOLFBOX = path.join(__dirname, "golfbox-scope.json");

const arg = (n) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : null; };
const dorme = (ms) => new Promise((r) => setTimeout(r, ms));
const hojeLisboa = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Lisbon" }).format(new Date());

/** Competições já lidas pelo scrape-golfbox.js (scope) — não se repetem. */
function jaNoScope() {
  const raw = JSON.parse(fs.readFileSync(SCOPE_GOLFBOX, "utf8"));
  return new Set((raw.competitions || raw).map((e) => String(e.competitionId || e)));
}

async function provasDoCalendario(fed, anos) {
  const hoje = hojeLisboa().replace(/-/g, "");
  const scope = jaNoScope();
  const lista = [];
  // uma fonte pode ler vários calendários (Bálticos: federação letã + o clube lituano)
  const calendarios = fed.calendarios || [{ customer: fed.customer, juvenil: fed.juvenil, fora: fed.fora }];
  for (const cal of calendarios) {
    for (const ano of anos) {
      const sc = await fetchJsonp(`https://scores.golfbox.dk/Handlers/ScheduleHandler/GetSchedule/CustomerId/${cal.customer}/Season/${ano}/?callback=x`);
      for (const se of Object.values(sc?.CompetitionData || {})) {
        for (const m of Object.values(se.Months || {})) {
          for (const e of Object.values(m.Entries || {})) {
            const nome = String(e.Name || "");
            const inicio = String(e.StartDate || "").slice(0, 8);
            if (!cal.juvenil.test(nome) || cal.fora.test(nome) || scope.has(String(e.ID))) continue;
            if (inicio && inicio > hoje) continue; // ainda não jogada
            lista.push({ id: String(e.ID), nome, inicio });
          }
        }
      }
      await dorme(PAUSA_MS);
    }
  }
  return [...new Map(lista.map((p) => [p.id, p])).values()].sort((a, b) => a.inicio.localeCompare(b.inicio));
}

/** Jogadores com pelo menos uma volta — o que a guarda conta. */
const comVoltas = (d) => (d.divisions || []).reduce((n, dv) => n + (dv.players || []).filter((p) => (p.rounds || []).length || (p.roundGross || []).length).length, 0);

(async () => {
  const chave = arg("--fed");
  const fed = FEDERACOES[chave];
  if (!fed) { console.error(`Uso: --fed ${Object.keys(FEDERACOES).join("|")} [--anos 2025,2026] [--ids a,b]`); process.exit(1); }
  const outDir = path.join(__dirname, "..", "public", "data", chave);
  const ids = arg("--ids");
  const anoAtual = Number(hojeLisboa().slice(0, 4));
  const anos = arg("--anos") ? arg("--anos").split(",").map((s) => Number(s.trim())) : [anoAtual - 1, anoAtual];
  const provas = ids ? ids.split(",").map((id) => ({ id: id.trim(), nome: "" })) : await provasDoCalendario(fed, anos);
  console.log(`${fed.nome}: ${provas.length} prova(s) juvenis ${ids ? "(--ids)" : `de ${anos.join(", ")}`}`);
  fs.mkdirSync(outDir, { recursive: true });

  let gravados = 0, iguais = 0, vazios = 0, erros = 0;
  for (const p of provas) {
    try {
      const { out } = await scrapeOne(p.id, {});
      const file = path.join(outDir, `${p.id}.json`);
      const n = comVoltas(out);
      if (!n) { vazios++; console.log("   ⏭️  sem resultados — não gravado"); continue; }
      // classes sem ninguém (ex.: «Girls U18» sem inscritas) não entram
      // e as classes que não são juvenis nem individuais por pancadas (`classesFora`)
      const data = { ...out, divisions: (out.divisions || []).filter((dv) => (dv.players || []).length && !(fed.classesFora && fed.classesFora.test(dv.division || ""))), competitionId: p.id, customer: fed.nome };
      let anterior = null;
      try { anterior = JSON.parse(fs.readFileSync(file, "utf8")); } catch { /* ficheiro novo */ }
      const sem = (o) => { const c = { ...o }; delete c.scrapedAt; return JSON.stringify(c); };
      if (anterior && sem(anterior) === sem(data)) { iguais++; console.log("   ⏭️  sem alterações"); }
      else if (writeJsonGuarded(file, data, { count: comVoltas }).written) { gravados++; console.log(`   ✅ ${n} jogadores → ${chave}/${path.basename(file)}`); }
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
