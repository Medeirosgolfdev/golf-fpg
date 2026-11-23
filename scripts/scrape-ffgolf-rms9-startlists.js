/**
 * scripts/scrape-ffgolf-rms9-startlists.js
 *
 * Para cada torneio FFG ligado ao RMS9 (ffgolf-rms9.json, ver
 * scrape-ffgolf-rms9.js), lê a lista de partidas de cada volta — os grupos
 * (flights) com hora, buraco de saída e jogadores. São os draws das provas
 * francesas (23/11/2026, Mariana: «queria mais draws de frança..»); o
 * pairings-build.js põe-nos nos Draws da ficha de cada jogador.
 *
 * Endpoints (API pública com os cabeçalhos x-tenant-id: fr_{tenant},
 * x-access-token vazio e Accept-Language: fr_FR — os mesmos do scrape-ffgolf-rms9-tees):
 *   tournaments/{id}/rounds                       → voltas (id, number, dateTime)
 *   tournaments/rounds/{roundId}/start-list       → groups[].flights[].items[].player
 * (rota tirada do código do A9online: setApiUrl("rs/cs/tournaments/rounds/{roundId}/start-list")).
 *
 * Incremental (só os trnId que faltam; --all refaz tudo). Um torneio SEM
 * partidas publicadas fica com `rounds: []` e `checkedAt`, e volta a ser pedido
 * passados 7 dias — só enquanto a prova tiver menos de 60 dias (o organizador
 * publica-as antes da prova; uma prova antiga sem elas não as vai ganhar). Um
 * pedido que FALHA não se grava — tenta-se outra vez na corrida seguinte.
 *
 * Output: public/data/ffgolf-rms9-startlists.json (a app não o lê — só o pairings-build)
 *   { generatedAt, tournaments: { trnId: { tenant, id, rounds: [{ number, date,
 *     flights: [{ t: "08:30", h: 1, p: [{ n: "Leo DAVY", c: "GOLF DE SAINT-MALO", i: 2.1 }] }] }],
 *     checkedAt? } } }
 */
const fs = require("fs");
const path = require("path");
const { writeJsonGuarded } = require("./lib/shrink-guard");

const DATA = path.resolve(__dirname, "../public/data");
const LINKS = path.join(DATA, "ffgolf-rms9.json");
const INDEX = path.join(DATA, "ffgolf-resultats-index.json");
const OUT = path.join(DATA, "ffgolf-rms9-startlists.json");
const ALL = process.argv.includes("--all");
const RECHECK_DIAS = 7;
const JANELA_DIAS = 60;
const DELAY_MS = 300;
const DIA = 86400000;

const semPartidas = (e) => !((e && e.rounds) || []).some((r) => r.flights.length);
/** Sem partidas, visto há mais de RECHECK_DIAS e a prova ainda é recente. */
const aRever = (e, dataIso) => semPartidas(e)
  && (!e.checkedAt || Date.now() - Date.parse(e.checkedAt) > RECHECK_DIAS * DIA)
  && (!dataIso || Date.now() - Date.parse(dataIso) < JANELA_DIAS * DIA);

const H = (t) => ({ "x-tenant-id": "fr_" + t, "x-access-token": "", "Accept-Language": "fr_FR" });
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
/** JSON da API; null = 404; undefined = falhou (não se grava nada). */
async function get(tenant, p) {
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(`https://${tenant}.rms9.fr/a9online/v1/rs/cs/${p}`, { headers: H(tenant) });
      if (r.status === 404) return null;
      if (!r.ok) throw new Error(r.status);
      return await r.json();
    } catch (e) {
      if (i === 2) { console.warn(`  ${tenant} ${p}: ${e.message}`); return undefined; }
      await sleep(1500 * (i + 1));
    }
  }
}

/** Os grupos de uma volta, pela ordem de saída. */
function flightsDe(sl) {
  const buraco = (tee) => (tee === 2 ? sl.teeTwoHoleNumber : sl.teeOneHoleNumber) ?? null;
  const out = [];
  for (const g of sl.groups || []) {
    for (const f of g.flights || []) {
      const p = (f.items || []).map((it) => it.player).filter(Boolean).map((pl) => ({
        n: pl.fullName || `${pl.firstName || ""} ${pl.lastName || ""}`.trim(),
        c: pl.clubName || null,
        i: pl.ehcp ?? null,
      })).filter((x) => x.n);
      if (p.length) out.push({ t: f.startTime || null, h: buraco(f.startTee), p });
    }
  }
  return out;
}

(async () => {
  const links = JSON.parse(fs.readFileSync(LINKS, "utf8")).tournaments || {};
  const ix = JSON.parse(fs.readFileSync(INDEX, "utf8")).tournaments || [];
  const byTrn = Object.fromEntries(ix.map((t) => [t.trnId, t]));
  const prev = !ALL && fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, "utf8")).tournaments || {} : {};
  const out = { ...prev };
  let n = 0, comPartidas = 0, falhas = 0, revistos = 0;
  for (const [trnId, l] of Object.entries(links)) {
    if (!l.id || !byTrn[trnId]) continue;
    if (out[trnId] && !aRever(out[trnId], byTrn[trnId].dateIso)) continue;
    if (out[trnId]) revistos++;
    const rj = await get(l.tenant, `tournaments/${l.id}/rounds`);
    await sleep(DELAY_MS);
    if (rj === undefined) { falhas++; continue; }
    const rounds = [];
    let falhou = false;
    for (const r of (rj && rj.content) || []) {
      const sl = await get(l.tenant, `tournaments/rounds/${r.id}/start-list`);
      await sleep(DELAY_MS);
      if (sl === undefined) { falhou = true; break; }
      rounds.push({ number: r.number, date: String(r.dateTime || "").slice(0, 10) || null, flights: sl ? flightsDe(sl) : [] });
    }
    // Uma volta que falhou: nada se grava deste torneio (fica para a próxima corrida).
    if (falhou) { falhas++; continue; }
    const vazio = !rounds.some((r) => r.flights.length);
    out[trnId] = { tenant: l.tenant, id: l.id, rounds: vazio ? [] : rounds, ...(vazio ? { checkedAt: new Date().toISOString().slice(0, 10) } : {}) };
    n++;
    if (!vazio) comPartidas++;
    if (n % 20 === 0) console.log(`  ${n} torneios… (${comPartidas} com partidas)`);
  }
  const sorted = Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
  writeJsonGuarded(OUT, { generatedAt: new Date().toISOString(), tournaments: sorted },
    { spaces: 0, trailingNewline: true, failOnRefuse: true, count: (o) => Object.keys(o.tournaments).length });
  console.log(`RMS9 partidas: ${n} torneios lidos (${comPartidas} com partidas; ${revistos} revistos)` + (falhas ? `; ${falhas} sem resposta — ficam para a próxima corrida` : ""));
})();
