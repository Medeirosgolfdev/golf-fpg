// Junta fichas.json (pesquisa de 19/10/2026) numa página HTML (dados embebidos + renderização no browser).
const fs = require("fs"), path = require("path");
const DIR = __dirname;
const all = JSON.parse(fs.readFileSync(path.join(DIR, "fichas.json"), "utf8"));

// [regex do nome, grupo, data (ISO, para ordenar), confirmado 2027?, nome curto, escalão do Manuel em 2027, aviso]
const META = [
  [/^Reid Trophy/, "eu14", "2027-08-03", true, "Reid Trophy", "Rapazes U14"],
  [/^Scottish U14/, "eu14", "2027-08-09", true, "Scottish U14 Open", "U14"],
  [/^Scottish Boys' U16/, "u16", "2027-07-06", true, "Scottish Boys' U16 Open", "U16 (sobe de escalão)"],
  [/^McGregor/, "u16", "2027-07-13", true, "McGregor Trophy", "U16 (sobe de escalão)"],
  [/^Irish U14/, "eu14", "2027-07-28", true, "Irish U14 & U16 Boys' Open", "Rapazes U14"],
  [/Champion of Champions/, "eu14", "2027-07-21", false, "Champion of Champions", "Under 15", "Só por convite (campeões nacionais). Não há U14 de rapazes: o Manuel jogaria Under 15."],
  [/^Belgian/, "eu14", "2027-07-01", true, "Belgian Int. U14 — Albert Vermeiren", "Boys U14"],
  [/^European Young Masters/, "u16", "2027-07-22", true, "European Young Masters", "U16 (por selecção)", "Só por selecção nacional (2 rapazes + 2 raparigas por país)."],
  [/^Malta/, "eu14", "2027-03-21", true, "Malta Junior Open", "U14 (nova em 2027)"],
  [/Godillot/, "eu14", "2027-04-09", false, "French Int. U14 — Alexis Godillot", "U14"],
  [/Evian/, "eu14", "2027-09-22", false, "Amundi Evian Juniors Cup", "U14 (por selecção)", "Por selecção nacional (2 rapazes + 2 raparigas por país)."],
  [/^Faldo/, "pt", "2027-10-16", false, "Faldo Junior Tour Madeira", "Boys 16 & Under"],
  [/Marco Simone/, "usk", "2027-03-13", true, "US Kids Marco Simone Invitational", "Boys 12 (idade a 15/03)"],
  [/World Championship 2027/, "usk", "2027-07-22", true, "US Kids World Championship", "— (só até 12 anos)", "O Manuel já não entra: é só para 5–12 anos. A prova dele é o World Teen."],
  [/World Teen/, "usk", "2027-07-29", true, "US Kids World Teen Championship", "Boys 13"],
  [/European Championship/, "usk", "2027-05-26", false, "US Kids European Championship", "Boys 13 (idade a 31/05)"],
  [/Venice/, "usk", "2027-08-13", false, "US Kids Venice Open", "Boys 13"],
  [/Spanish Open/, "usk", "2027-11-20", false, "US Kids Spanish Open", "Boys 13-14"],
  [/Paris/, "usk", "2027-07-04", false, "US Kids Paris Invitational", "Boys 13-14"],
  [/World Junior Golf Championship \(WJGC\)/, "usa", "2027-02-24", true, "Daily Mail WJGC (BJGT)", "Boys 12-13"],
  [/^Optimist/, "usa", "2027-07-11", true, "Optimist International", "Boys 12-13"],
  [/Orange Bowl/, "usa", "2027-01-02", false, "Junior Orange Bowl", "— (só sub-19)", "Não tem escalão sub-14: é por convite, um só escalão de rapazes até 18 anos."],
  [/Doral/, "usa", "2027-12-18", false, "First Tee Miami Doral Jr. Classic", "Boys 12-13"],
  [/^FCG/, "usa", "2027-07-19", true, "FCG Callaway World Championship", "Boys 13-14 (por qualificação)"],
  [/^Junior World Golf/, "usa", "2027-07-12", true, "Junior World Golf Championships", "Boys 13-14"],
  [/^Portuguese International U14/, "pt", "2027-12-03", true, "Portuguese International U14", "U14"],
  [/^GreatGolf/i, "pt", "2027-02-15", false, "GreatGolf Junior Open", "Sub-14"],
  [/^World Kids Golf/, "pt", "2027-07-29", false, "World Kids Golf (Amendoeira)", "Sub-14"],
  [/circuito/, "gjg", "2026-10-01", true, "Global Junior Golf — o circuito", "U14"],
  [/Algarve Season Opener/, "gjg", "2027-01-02", true, "GJG Algarve Season Opener", "U14"],
  [/Lisboa Junior Games/, "gjg", "2027-01-31", true, "GJG Lisboa Junior Games", "U14"],
  [/Blue Carpet/, "gjg", "2027-02-04", true, "GJG Blue Carpet Junior Classics", "U14"],
  [/Portuguese Juniors International/, "gjg", "2027-02-08", true, "GJG Portuguese Juniors International", "U14"],
  [/WeAreGlobalJuniorGolf/, "gjg", "2027-02-12", true, "#WeAreGlobalJuniorGolf Open", "U14"],
  [/OoM Junior Open/, "gjg", "2027-02-16", true, "GJG OoM Junior Open", "U14"],
  [/Madeira Juniors/, "gjg", "2027-02-25", true, "GJG Madeira Juniors International", "U14"],
  [/Season Kickoff/, "gjg", "2027-01-02", true, "GJG Season Kickoff", "U14", "Os U14 rapazes jogam amarelas: não contam para o WAGR nem para a OoM."],
  [/Valle Romano/, "gjg", "2027-01-11", true, "GJG Valle Romano Juniors International", "U14"],
  [/European Spring Junior/, "gjg", "2027-03-01", true, "GJG European Spring Junior", "U14"],
  [/Spanish Juniors International/, "gjg", "2027-03-05", true, "GJG Spanish Juniors International", "U14"],
];

const out = all.map((t) => {
  const m = META.find(([re]) => re.test(t.nome));
  if (!m) throw new Error("sem META: " + t.nome);
  const [, grupo, data, conf, curto, esc, aviso] = m;
  return { ...t, grupo, data, conf, curto, esc: t.escalaoJogador ? esc : esc, aviso: aviso || null, escNota: t.escalaoJogador || null };
}).sort((a, b) => a.data.localeCompare(b.data));

const tpl = fs.readFileSync(path.join(DIR, "page.tpl.html"), "utf8");
const json = JSON.stringify(out).replace(/</g, "\\u003c");
fs.writeFileSync(path.join(DIR, "torneios-2027.html"), tpl.replace("/*__DATA__*/[]", json));
console.log(out.length, "torneios");
