/**
 * Exporta um subset do licencia-dob-lookup.json para a KIDSpage usar como
 * "base de dados de espanhois" — cada entry tem { name, dobIso, sex, club, licencia }.
 * Output: public/data/spain-players.json
 */
const fs = require("fs");
const path = require("path");
const IN = path.resolve(__dirname, "../public/data/licencia-dob-lookup.json");
const HCP_IN = path.resolve(__dirname, "../public/data/licencia-hcp-lookup.json");
const IDX_IN = path.resolve(__dirname, "../public/data/rfegolf-resultats-index.json");
const OUT = path.resolve(__dirname, "../public/data/spain-players.json");
const d = JSON.parse(fs.readFileSync(IN, "utf-8"));
const lookup = d.lookup || {};

// ── Contagem de torneios por jogador (TODAS as plataformas) ──────────────
// O `sources[]` de cada entry do lookup lista os IDs de torneios em que o
// jogador apareceu — numéricos (RFEGolf / livegolfscoring) e "nc####"
// (NextCaddy: Andaluzia, Madrid, Castilla y León). É a contagem REAL, ao
// contrário dos rivais (rfegolf+fcg) que ignoram o NextCaddy. Para o total do
// ano corrente mapeamos cada source → ano via o índice de resultados.
const CUR_YEAR = new Date().getFullYear();
const idToYear = {};
try {
  const idx = JSON.parse(fs.readFileSync(IDX_IN, "utf-8"));
  for (const t of (idx.tournaments || [])) {
    if (t.year == null) continue;
    for (const key of [t.id, t.compId, t.tourId]) {
      if (key == null) continue;
      idToYear[String(key)] = t.year;
      if (t.source === "nextcaddy") idToYear["nc" + key] = t.year;
    }
  }
} catch (e) {
  console.warn("Aviso: rfegolf-resultats-index.json em falta — contagem por ano fica a 0.");
}

// HCP mais recente por licença (licencia-hcp-lookup é keyed em MAIÚSCULAS).
// Junta-se aqui para que o roster espanhol leve o handicap actual, consumido
// pelo adapter aggregator/sources/rfeg.js → sources.rfeg.hcp.
let hcpLookup = {};
try {
  hcpLookup = (JSON.parse(fs.readFileSync(HCP_IN, "utf-8")).lookup) || {};
} catch (e) {
  console.warn("Aviso: licencia-hcp-lookup.json em falta — entries ficam sem hcp.");
}

function norm(s) {
  return String(s || "").toLowerCase().normalize("NFKD")
    .replace(/[̀-ͯ]/g, "").replace(/[,.]/g, " ").replace(/\s+/g, " ").trim();
}

const byName = {};
const byLicencia = {};
for (const [lic, e] of Object.entries(lookup)) {
  const hcpEntry = hcpLookup[lic.toUpperCase()] || null;
  const sources = Array.isArray(e.sources) ? e.sources : [];
  let ano = 0;
  for (const s of sources) if (idToYear[String(s)] === CUR_YEAR) ano++;
  const entry = {
    licencia: lic,
    name: e.name,
    dob: e.dob,
    dobIso: e.dobIso,
    sex: e.sex,
    club: e.club,
    catEdad: e.catEdad,
    hcp: hcpEntry && typeof hcpEntry.hcp === "number" ? hcpEntry.hcp : null,
    hcpDate: hcpEntry?.dateIso || null,
    nat: "ESP",
    // Contagem de torneios (todas as plataformas) — total + ano corrente.
    tot: sources.length,
    ano,
    firstSeenIso: e.firstSeenIso || null,
    lastSeenIso: e.lastSeenIso || null,
  };
  byLicencia[lic] = entry;
  if (!e.name) continue;
  // RFEGolf armazena nomes como "APELIDO , NOMES" (com vírgula). Indexamos
  // ambas as variantes para conseguirmos match com KIDSpage que tem "Nomes Apelido".
  const raw = norm(e.name);
  byName[raw] = entry;
  // Variante invertida: "apelido , nomes" → "nomes apelido"
  const m = e.name.match(/^([^,]+?)\s*,\s*(.+)$/);
  if (m) {
    const apelido = norm(m[1]);
    const nomes = norm(m[2]);
    if (nomes && apelido) {
      byName[nomes + ' ' + apelido] = entry;
      byName[apelido + ' ' + nomes] = entry;
    }
  }
}

// ── Dedup de jogadores com várias licenças (mudança de clube/região) ─────────
// A licença RFEG codifica federação + clube: [letras = federação autonómica]
// [2 díg = clube][6 díg = nº do jogador]. Quando o jogador muda de clube (ou se
// re-federa noutro clube da mesma federação) os dígitos do clube mudam, mas a
// federação + o nº do jogador mantêm-se. Agrupamos por (federação + últimos 6
// dígitos) — chave estável por jogador físico — e colapsamos cada grupo numa só
// linha, preservando as licenças antigas como histórico de clubes.
// Validado contra os dados: 254 grupos, 0 colisões (nome/DOB sempre consistentes
// dentro do grupo; o nº de jogador é único POR federação, não cross-federação).
function dupKeyOf(lic) {
  const L = String(lic).toUpperCase();
  const lead = (L.match(/^[A-Z]+/) || [""])[0];
  const fed = lead || L.slice(0, 2);          // federação (letras) ou 2 díg iniciais
  const digits = L.replace(/[^0-9]/g, "");
  if (digits.length < 6) return null;
  return fed + "|" + digits.slice(-6);        // federação + nº do jogador
}
// Nome canónico (tokens ordenados) — junta "APELIDO , NOME" (RFEGolf) com
// "Nome Apelido" (NextCaddy) para a guarda de identidade não dar falso conflito.
function nameTokens(s) {
  return norm(s).split(" ").filter(Boolean).sort().join(" ");
}

const clusters = {};
for (const e of Object.values(byLicencia)) {
  const k = dupKeyOf(e.licencia);
  if (!k) continue;
  (clusters[k] = clusters[k] || []).push(e);
}

let dupPlayers = 0, dupLicenses = 0;
for (const arr of Object.values(clusters)) {
  if (arr.length < 2) continue;
  // Guarda de segurança: só fundir se a identidade for consistente (nome OU DOB
  // concordam). Hoje nunca dispara, mas protege contra reutilização futura de um
  // nº de jogador dentro da mesma federação.
  const names = new Set(arr.map((e) => nameTokens(e.name)));
  const dobs = new Set(arr.map((e) => e.dobIso).filter(Boolean));
  if (names.size > 1 && dobs.size > 1) continue;

  const srcLen = (e) => (lookup[e.licencia] && lookup[e.licencia].sources || []).length;
  // Primário = aparição mais recente em torneio (= clube actual). Desempate:
  // mais torneios → tem DOB → tem clube → licença (determinístico).
  const ranked = [...arr].sort((a, b) => {
    const la = a.lastSeenIso || "", lb = b.lastSeenIso || "";
    if (la !== lb) return lb.localeCompare(la);
    if (srcLen(a) !== srcLen(b)) return srcLen(b) - srcLen(a);
    if (!!a.dobIso !== !!b.dobIso) return a.dobIso ? -1 : 1;
    if (!!a.club !== !!b.club) return a.club ? -1 : 1;
    return a.licencia.localeCompare(b.licencia);
  });
  const primary = ranked[0];
  const others = ranked.slice(1);

  // União de torneios (todas as licenças) → contagem REAL do jogador físico.
  const allSources = new Set();
  for (const e of arr) for (const s of (lookup[e.licencia] && lookup[e.licencia].sources || [])) allSources.add(String(s));
  let anoAll = 0;
  for (const s of allSources) if (idToYear[s] === CUR_YEAR) anoAll++;

  // HCP actual = o da licença com hcpDate mais recente (o índice "vivo"); as
  // licenças antigas congelam o HCP no momento em que o jogador saiu do clube.
  let cur = null;
  for (const e of arr) {
    if (typeof e.hcp !== "number") continue;
    if (!cur || (e.hcpDate || "") > (cur.hcpDate || "")) cur = e;
  }

  primary.dupKey = dupKeyOf(primary.licencia);
  primary.totAll = allSources.size;
  primary.anoAll = anoAll;
  if (cur && cur.licencia !== primary.licencia) {
    primary.curHcp = cur.hcp;
    primary.curHcpDate = cur.hcpDate || null;
  }
  // Histórico de licenças antigas (clubes anteriores), mais recente primeiro.
  primary.aliases = others.map((e) => ({
    licencia: e.licencia,
    club: e.club,
    hcp: typeof e.hcp === "number" ? e.hcp : null,
    hcpDate: e.hcpDate || null,
    firstSeenIso: e.firstSeenIso || null,
    lastSeenIso: e.lastSeenIso || null,
    tot: srcLen(e),    // torneios desta licença (= o que a linha mostraria sem dedup)
    ano: e.ano || 0,   // torneios desta licença no ano corrente
  }));
  for (const e of others) { e.aliasOf = primary.licencia; e.dupKey = primary.dupKey; }
  dupPlayers++;
  dupLicenses += others.length;
}
console.log(`Dedup: ${dupPlayers} jogadores com várias licenças (${dupLicenses} licenças antigas marcadas aliasOf)`);

const out = {
  generatedAt: new Date().toISOString(),
  source: "licencia-dob-lookup.json (subset Spain)",
  total: Object.keys(byLicencia).length,
  dupPlayers,
  byName, byLicencia,
};
fs.writeFileSync(OUT, JSON.stringify(out, null, 0));
const size = (fs.statSync(OUT).size / 1024 / 1024).toFixed(2);
console.log(`Built: ${out.total} entries → ${OUT} (${size} MB)`);
