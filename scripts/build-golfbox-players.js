/**
 * scripts/build-golfbox-players.js
 *
 * Roster de jogadores a partir do GolfBox (scores.golfbox.dk) — o sistema que a
 * EGA e várias federações do norte da Europa usam para as suas competições.
 *
 * Porquê: nos torneios internacionais (ex: Spanish International U-18) a fonte
 * local só publica o nome dos estrangeiros. Sem data de nascimento não há
 * escalão, não há idade, e o agregador de juniores não os consegue fundir com
 * segurança — ficam nomes soltos. O GolfBox, ao contrário, expõe na lista de
 * inscritos de cada prova: DOB COMPLETA, nacionalidade, clube, HCP e o número
 * de federado. É o equivalente ao `france-players.json` / `spain-players.json`
 * para os países do GolfBox.
 *
 * Como funciona (dois endpoints públicos, sem credenciais):
 *   ScheduleHandler/GetSchedule/CustomerId/{id}    → calendário da federação
 *   PlayersHandler/GetPlayers/CompetitionId/{id}   → inscritos, com DOB
 *
 * ⚠ Os `CustomerId` são o mapa das federações: 925 = European Golf Association,
 * 18 = Norges Golfforbund, 22 = Royal Belgian, 15 = Dansk Golf Union, 4/7 =
 * Suécia, 121 = Estónia, 6 = R&A. Áustria (993), Irlanda (1190), England Golf
 * (991) e Scottish Golf (10/1002) EXISTEM como clientes mas não publicam
 * calendário aqui — usam outros sistemas (a Inglaterra é GolfGenius, que já
 * scrapamos à parte). Não vale a pena voltar a tentá-los por esta via.
 *
 * USO:
 *   node scripts/build-golfbox-players.js                 # federações do DEFAULT
 *   node scripts/build-golfbox-players.js --customers 925,18
 *   node scripts/build-golfbox-players.js --anos 2025,2026 --all-comps
 *   node scripts/build-golfbox-players.js --concurrency 6
 *
 * Output: public/data/golfbox-players.json
 *   { generatedAt, total, players: [{ name, dob, sex?, nat, club, memberId, hcp, fontes:[] }] }
 */

const fs = require("fs");
const path = require("path");
const https = require("https");

const HOST = "https://scores.golfbox.dk";
const OUT = path.resolve(__dirname, "../public/data/golfbox-players.json");

/** Federações que PUBLICAM calendário aqui (ver ⚠ no cabeçalho). */
const CUSTOMERS_DEFAULT = [
  { id: 925, nome: "European Golf Association" },
  { id: 18, nome: "Norges Golfforbund" },
  { id: 22, nome: "Royal Belgian Golf Federation" },
  { id: 15, nome: "Dansk Golf Union" },
  { id: 4, nome: "SGF Juniortävlingar (SE)" },
  { id: 7, nome: "Svenska Golfförbundet" },
  { id: 121, nome: "Estonian Golf Association" },
  { id: 6, nome: "The R&A Amateur Championships" },
  { id: 238, nome: "Lithuanian Golf Federation" },
  { id: 911, nome: "Latvia Golf Federation" },
  { id: 1139, nome: "Golf Union of Iceland" },
];

/** Provas juvenis — o filtro existe para não puxar o calendário sénior inteiro. */
const JUVENIL = /junior|jnr|boys|girls|u\s?-?1[0-9]\b|u\s?-?2[01]\b|ungdom|jugend|youth|elite|masters|team championship|amateur championship/i;

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const CONCURRENCY = parseInt(arg("--concurrency", "5"), 10) || 5;
const ALL_COMPS = argv.includes("--all-comps");
const ANOS = new Set(arg("--anos", "2024,2025,2026").split(",").map((s) => s.trim()));
const CUSTOMERS = arg("--customers", null)
  ? arg("--customers", "").split(",").map((s) => ({ id: parseInt(s.trim(), 10), nome: `customer ${s.trim()}` }))
  : CUSTOMERS_DEFAULT;

function get(url) {
  return new Promise((resolve) => {
    https.get(url, { headers: { "User-Agent": "Mozilla/5.0" }, timeout: 25000 }, (r) => {
      let b = ""; r.on("data", (c) => b += c); r.on("end", () => resolve(b));
    }).on("error", () => resolve("")).on("timeout", function () { this.destroy(); resolve(""); });
  });
}
/** As respostas são JSONP com literais JS (`!0` em vez de `true`) — daí o eval. */
function jsonp(txt) {
  const i = txt.indexOf("("), j = txt.lastIndexOf(")");
  if (i < 0 || j <= i) return null;
  try { return eval("(" + txt.slice(i + 1, j) + ")"); } catch { return null; }
}
/** ⚠ ß, ø, æ, ð e þ NÃO se decompõem em NFD — são letras próprias, não letra+acento.
 * Sem esta tradução, "Weißensteiner" virava "wei ensteiner" e "Sørensen"
 * "s rensen": nomes alemães e nórdicos nunca casavam. */
function normNome(s) {
  return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/ß/g, "ss").replace(/ø/g, "o").replace(/æ/g, "ae")
    .replace(/ð/g, "d").replace(/þ/g, "th").replace(/[^a-z ]/g, " ")
    .split(" ").filter(Boolean);
}
const normKey = (s) => normNome(s).sort().join(" ");

function isoDob(v) {
  const s = String(v || "");
  if (!/^\d{8}/.test(s) || s.startsWith("0001")) return null;
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
}

(async () => {
  const players = new Map();     // chave de nome → registo
  let comps = 0, entries = 0;

  for (const c of CUSTOMERS) {
    // ⚠ O calendário devolve SÓ a época corrente — cada ano tem de ser pedido à
    // parte com `/Season/{ano}/`. Sem isso perdem-se as provas dos anos
    // anteriores, que é onde estão os miúdos que este ano não jogaram o
    // circuito (e que continuam a aparecer nos torneios internacionais).
    const porEpoca = {};
    for (const ano of ANOS) {
      const sc = jsonp(await get(`${HOST}/Handlers/ScheduleHandler/GetSchedule/CustomerId/${c.id}/Season/${ano}/?callback=x`));
      for (const [sk, se] of Object.entries(sc?.CompetitionData || {})) porEpoca[sk] = se;
    }
    const lista = [];
    for (const [sk, season] of Object.entries(porEpoca)) {
      const ano = sk.replace("S", "");
      if (!ANOS.has(ano)) continue;
      for (const m of Object.values(season.Months || {})) {
        for (const e of Object.values(m.Entries || {})) {
          if (!ALL_COMPS && !JUVENIL.test(e.Name || "")) continue;
          lista.push({ id: e.ID, name: e.Name, ano });
        }
      }
    }
    let cursor = 0, novos = 0;
    async function worker() {
      while (cursor < lista.length) {
        const comp = lista[cursor++];
        const j = jsonp(await get(`${HOST}/Handlers/PlayersHandler/GetPlayers/CompetitionId/${comp.id}/?callback=x`));
        if (!j) continue;
        comps++;
        for (const cls of Object.values(j.Classes || {})) {
          for (const e of Object.values(cls.Entries || {})) {
            entries++;
            const name = `${e.FirstName || ""} ${e.LastName || ""}`.replace(/\s+/g, " ").trim();
            const dob = isoDob(e.BirthDate);
            if (!name || !dob) continue;                  // sem DOB não acrescenta nada
            const k = normKey(name);
            const fonte = `${c.nome} · ${comp.ano} ${comp.name}`;
            const prev = players.get(k);
            if (prev) {
              if (!prev.fontes.includes(fonte)) prev.fontes.push(fonte);
              // ⚠ Datas divergentes = homónimos. Guardar as duas e marcar, em vez
              // de escolher uma à sorte — quem consome decide se confia.
              if (prev.dob !== dob) { prev.dobAlt = prev.dobAlt || []; if (!prev.dobAlt.includes(dob)) prev.dobAlt.push(dob); }
              if (!prev.memberId && e.MemberID) prev.memberId = e.MemberID;
              continue;
            }
            players.set(k, {
              name, dob, nat: e.Nationality || null, club: e.ClubName || null,
              memberId: e.MemberID || null,
              // ⚠ HCP guardado EM CRU. A escala do GolfBox não é óbvia ("-19000",
              // "5000", "13000") e não a confirmei contra um índice conhecido —
              // publicar um número mal escalado é pior do que não ter coluna.
              hcpRaw: typeof e.HCP === "string" && e.HCP !== "" ? e.HCP : null,
              fontes: [fonte], novos: undefined,
            });
            novos++;
          }
        }
      }
    }
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    console.log(`${c.nome.padEnd(34)} ${String(lista.length).padStart(4)} provas · +${novos} jogadores`);
  }

  const out = {
    generatedAt: new Date().toISOString(),
    source: "scripts/build-golfbox-players.js",
    competitions: comps,
    total: players.size,
    // ⚠ SLIM: guarda-se o nº de provas onde o jogador aparece, não a lista.
    // As 81 mil linhas de proveniência levavam o ficheiro de 1,4 para 8,5 MB —
    // e ele é descarregado pela /rfeg para preencher os estrangeiros.
    players: [...players.values()].map((p) => ({
      name: p.name, dob: p.dob, nat: p.nat, club: p.club, memberId: p.memberId,
      n: p.fontes.length, ...(p.dobAlt ? { dobAlt: p.dobAlt } : {}),
    })).sort((a, b) => a.name.localeCompare(b.name, "pt")),
  };
  const ambiguos = out.players.filter((p) => p.dobAlt).length;
  fs.writeFileSync(OUT, JSON.stringify(out));
  console.log(`\n${out.total} jogadores com DOB · ${comps} provas · ${entries} inscrições lidas`);
  if (ambiguos) console.log(`⚠ ${ambiguos} nomes com mais do que uma data (homónimos) — marcados com dobAlt`);
  console.log(`-> ${OUT}`);
  process.exit(out.total ? 0 : 2);
})();
