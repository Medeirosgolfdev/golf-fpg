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
  [/^Rock Golf League — World WAGR Series U14 em La Manga/, "eu14", "2027-02-16", false, "Rock Golf League — La Manga (WAGR)", "U14", "Datas de 2027 por publicar (em 2026: 16–18 Fev). Campo U14 pequeno (11–20 rapazes, quase todos britânicos). Houve também uma edição de Outono (Out/Nov 2025) e uma etapa em Al Hamra (EAU, Mar 2026)."],
  [/^Rock Golf League — World WAGR Series U14 em Fairmont/, "eu14", "2027-08-10", false, "Rock Golf League — St Andrews (WAGR)", "U14", "Datas de 2027 por publicar (em 2026: 10–12 Ago). Pode coincidir com o Scottish U14 (9–10 Ago)."],
  [/^Snowy Golf/, "eu14", "2026-12-05", true, "Snowy Golf Spanish Series (Costa del Sol)", "Sem quadro U14", "Conta para o WAGR, mas em 2025–26 não houve quadro U14: o Manuel jogaria com os mais velhos (5,5–5,9 km). Santa Clara Dez/2026 esgotada."],
  [/^Nicos Severis/, "u16", "2027-02-15", false, "Cyprus Junior Open", "U16 (sobe de escalão)", "Não tem U14: o Manuel jogaria U16 (HCP ≤ 28). Datas de 2027 por publicar; o site da federação cipriota está suspenso."],
  [/^Golf Mad Turkish/, "u16", "2027-02-11", true, "Golf Mad Turkish Junior Open", "U16 (sobe de escalão)", "Só U16 e U21 com WAGR (sem U12/U14 publicado). Há também edição em Dez/2026 e um «Rob Rock Junior Tour» em Abr/2027."],
  [/^5 Stars Junior Cup/, "eu14", "2027-05-01", false, "5 Stars Junior Cup (Polónia/Chéquia)", "U14", "Datas de 2027 por publicar (2026: Mai–Ago, 4 etapas). Campo quase só polaco; tees U14 de 5,8–6,0 km."],
  [/^Dutch Junior Open/, "u16", "2027-07-14", true, "Dutch Junior Open", "U21 (experiência)", "Prova de elite até 21 anos em 6 143 m — para ganhar experiência, não para disputar."],
  [/^Austrian Juniors Golf Tour/, "eu14", "2027-04-03", true, "AJGT Áustria (6 etapas)", "U14", "Circuito: cada etapa tem quadro U14 próprio (21–32 rapazes) e aceita estrangeiros."],
  [/^Finnish International Junior/, "eu14", "2027-06-23", false, "Finnish International U14", "U14", "Aceita estrangeiros por ordem de inscrição (até 60), HCP ≤ 14, 120 €. Datas de 2027 por publicar (última semana de Jun)."],
  [/^North of England U14/, "eu14", "2027-07-28", true, "North of England U14", "U14 (idade a 1 Jan)", "Aberta a todas as nacionalidades, HCP ≤ 15, £45. Coincide com o US Kids World Teen e com o Irish U14."],
  [/^Reply Italian International U16/, "u16", "2027-09-01", true, "Italian Int. U16 — Trofeo Soldati", "U16 (sobe de escalão)"],
  [/^Hungarian Junior Open/, "eu14", "2027-08-10", true, "Hungarian Junior Open", "Categoria B (U12+U14, HCP ≤ 13)", "U12 e U14 jogam juntos na categoria B (azuis). Coincide com o Scottish U14 (9–10 Ago)."],
  [/^Grand Prix Jeunes Majeur U14/, "eu14", "2027-03-20", false, "FFG Grand Prix Jeunes Majeur U14 (4/ano)", "U14", "Estrangeiros com licença reconhecida + certificado de HCP + atestado médico. Datas de 2027 por publicar."],
  [/^JGT — Junior Golf Tour/, "eu14", "2027-01-02", true, "JGT — Junior Golf Tour (Tunísia e Europa)", "U14 (campo fraco)"],
  [/^Austrian Girls & Boys/, "eu14", "2027-07-23", true, "Austrian Girls & Boys U10–U21", "U14"],
  [/^Quinta do Lago Junior Open/, "pt", "2026-12-27", false, "Quinta do Lago Junior Open", "U14", "Datas por confirmar. 11 rivais estrangeiros do Manuel jogaram-no em 2025–26."],
  [/^BJGT European Open Italy/, "eu14", "2027-07-27", true, "BJGT European Open Italy", "Boys 12-13 (idade a 24/06)"],
  [/^Srixon Winter Open/, "eu14", "2027-03-15", false, "Srixon Winter Open (Múrcia)", "Sem U14 (quadro único)", "Quadro único para nascidos 2007–13 com HCP ≤ 3,0 — não tem U14; confirmar se 2014 entra em 2027."],
  [/^Latvian Junior Open/, "eu14", "2027-06-28", true, "Latvian / Lithuanian Junior Open", "U16 (sem quadro U14)", "Não há quadro U14: o Manuel jogaria U16."],
  [/^Leinster U14/, "eu14", "2027-07-07", false, "Leinster U14 Open (Irlanda)", "Rapazes U14", "Datas de 2027 por publicar. Os U14 provinciais rodam: 2025 Leinster e Munster, 2024 e 2026 Ulster e Connacht — é provável que 2027 traga este, mas não está confirmado."],
  [/^Munster U14/, "eu14", "2027-07-03", false, "Munster U14 Open (Irlanda)", "Rapazes U14", "Datas de 2027 por publicar; provável em 2027 pela rotação (2025 sim, 2024 e 2026 não). Em 2025 GolfGenius e EGR divergem no vencedor (empate) e na sede."],
  [/^Ulster U14/, "eu14", "2027-07-01", false, "Ulster U14 Open (Irlanda do Norte)", "Rapazes U14", "Datas de 2027 por publicar. Jogou-se em 2024 e 2026; pela rotação, 2027 pode não ter."],
  [/^Connacht U14/, "eu14", "2027-07-06", false, "Connacht U14 Open (Irlanda)", "Rapazes U14", "Datas de 2027 por publicar. Jogou-se em 2024 e 2026; pela rotação, 2027 pode não ter."],
  [/^Douglas Johns Trophy/, "eu14", "2027-07-29", false, "Douglas Johns Trophy (Inglaterra)", "U15 (sem prémio U14)", "Quadro U15: o Manuel jogaria com rapazes até um ano mais velhos. Não confirmado se aceita estrangeiros."],
  [/^Fairhaven Trophies/, "u16", "2027-04-30", true, "Fairhaven Trophies (Inglaterra)", "U18 (sem U14)", "Quadro único U18 de ~6400 m. Um português jogou em 2026 (Francisco Anahory Assis, não passou o corte)."],
  [/^Czech International Boys/, "u16", "2027-07-15", true, "Czech International Boys & Girls", "U18 (sem U14; HCP ≤ 6,0)", "O regulamento confirma que não há quadro U14."],
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
