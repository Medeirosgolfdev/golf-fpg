/**
 * entries.ts — Entradas da sidebar da /rfeg a partir do índice
 * (rfegolf-resultats-index.json): gémeos RFEGolf↔LGS, campeonatos divididos por
 * categoria/sexo juntos numa entrada `grp-…`, colisões de nome resolvidas por
 * jogadores. O detalhe (divisões) é carregado por quem chama.
 *
 * Tirado da RFEGPage a 21/10/2026 — comportamento igual ao que estava lá.
 */
import type { CircuitEntry, CircuitDivision, CircuitSex } from "../../ui/circuit/types";
import type { RFEGIndex, RFEGIndexEntry } from "./types";

export function rfegSex(s: string | null | undefined): CircuitSex | undefined {
  return s === "M" ? "M" : s === "F" ? "F" : (s === "Mixto" || s === "Mixed") ? "Mixed" : undefined;
}

export function rfegSourceUrl(t: RFEGIndexEntry): string {
  return t.source === "rfegolf"
    ? `https://rfegolf.es/CompetenciaPaginas/CompetitionMicrosite.aspx?CompId=${t.compId}`
    : t.source === "nextcaddy"
      ? `https://www.nextcaddy.com/tour/${t.tourId}`
      : t.source === "golfdirecto"
        ? `https://www.golfdirecto.com/micro/game/${t.id}/summary?lang=es`
        : `https://rfegolf.livegolfscoring.es/torneos/clasificacion/${t.id}`;
}

/** Nome "base" do torneio = nome SEM o escalão e o sexo. Junta as várias
 *  categorias/sexos do MESMO campeonato (ex: "Campeonato de España Alevín
 *  Masculino 2026" → "Campeonato de España 2026"). */
function rfegBaseName(t: RFEGIndexEntry): string {
  let n = t.name || "";
  const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  if (t.category) {
    n = n.replace(new RegExp(`\\b${t.category.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi"), " ");
    // Strip adicional SEM acentos: o nome pode trazer o escalão sem acento
    // ("Campeonato Andalucia Alevin") enquanto a categoria é acentuada ("Alevín")
    // → o \b…\b acima não casava e a Andaluzia Alevín ficava fora do grupo.
    const catF = fold(t.category);
    n = n.replace(/[\p{L}]+/gu, (w) => (fold(w) === catF ? " " : w));
  }
  n = n.replace(/\b(Masculino|Femenino|Masculina|Femenina|Mascul\.?|Femen\.?|Masc\.?|Fem\.?)\b/gi, " ");
  return n
    .replace(/\([\s.,íÍ]*\)/g, " ")                 // parênteses que ficaram vazios/lixo
    .replace(/\s*,\s*/g, " ")
    .replace(/\s+y\s+(?=\d{4}|$)/gi, " ")           // " y 2026" / " y " órfão
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** Ordem dos escalões nas tabs (mais novos primeiro); Sub-N pela idade. */
function ceeEscOrder(cat?: string | null): number {
  const k = (cat || "").toLowerCase();
  if (k.startsWith("benjam")) return 10;
  if (k.startsWith("alev")) return 12;
  if (k.startsWith("infant")) return 14;
  if (k.startsWith("cadet")) return 16;
  if (k.startsWith("juven")) return 18;
  const m = /sub[\s-]?(\d+)/.exec(k);
  if (m) return parseInt(m[1], 10);
  return 99;
}

/** ms de dateStart (ISO) — para medir a janela temporal de um grupo. */
function rfegStartMs(t: RFEGIndexEntry): number | null {
  const m = /(\d{4})-(\d{2})-(\d{2})/.exec(String(t.dateStartIso ?? t.dateStart ?? ""));
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) : null;
}

/** Sub-agrupa torneios de um balde por PROXIMIDADE de datas: um intervalo > `win`
 *  dias entre torneios consecutivos inicia um novo cluster. Isola um straggler
 *  distante (mesmo nome-base noutra altura do ano — ex: "Sub-18 Femenino" em
 *  Março no mesmo balde que o campeonato juvenil de Junho) sem destruir o
 *  agrupamento do evento compacto. Torneios sem data ficam cada um no seu cluster. */
function clusterByDate(group: RFEGIndexEntry[], win: number): RFEGIndexEntry[][] {
  const dated = group
    .map((t) => ({ t, ms: rfegStartMs(t) }))
    .filter((x): x is { t: RFEGIndexEntry; ms: number } => x.ms != null)
    .sort((a, b) => a.ms - b.ms);
  const clusters: RFEGIndexEntry[][] = [];
  let cur: RFEGIndexEntry[] = [];
  let prevMs = 0;
  for (const x of dated) {
    if (cur.length && (x.ms - prevMs) / 86400000 > win) { clusters.push(cur); cur = []; }
    cur.push(x.t);
    prevMs = x.ms;
  }
  if (cur.length) clusters.push(cur);
  for (const t of group) if (rfegStartMs(t) == null) clusters.push([t]);
  return clusters;
}

const slugify = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

/** Janela máxima (dias) para um grupo ser "o mesmo evento" e não uma SÉRIE
 *  (Puntuável/Circuito espalhado por meses). */
const RFEG_GROUP_WINDOW_DAYS = 16;

/** Sobreposição de rosters = |A∩B| / min(|A|,|B|) (coef. de sobreposição, não
 *  Jaccard: robusto a tamanhos muito diferentes). 0 se algum estiver vazio. */
function rosterOverlap(a?: string[], b?: string[]): number {
  if (!a?.length || !b?.length) return 0;
  const small = a.length <= b.length ? a : b;
  const big = new Set(a.length <= b.length ? b : a);
  let hit = 0;
  for (const k of small) if (big.has(k)) hit++;
  return hit / small.length;
}

/** Sobreposição a partir da qual dois eventos com o mesmo nome+ano se consideram
 *  o MESMO evento (duplicado a deduplicar), e não dois eventos distintos. */
const RFEG_ROSTER_SAME_MIN = 0.85;

const MESES_ES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
/** Mês (label ES) de uma data ISO ("2026-05-…") ou string espanhola ("07 mayo",
 *  "31 mayo - 03 junio"). "" se não der para extrair. */
function esMonthLabel(dateStr?: string): string {
  if (!dateStr) return "";
  const iso = /^\d{4}-(\d{2})/.exec(dateStr);
  if (iso) { const i = +iso[1] - 1; return (i >= 0 && i < 12) ? MESES_ES[i] : ""; }
  const norm = dateStr.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const m = /\b(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)\b/.exec(norm);
  if (!m) return "";
  const w = m[1] === "setiembre" ? "septiembre" : m[1];
  return MESES_ES[["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"].indexOf(w)] || "";
}

/** Resolve colisões de nome+ano dentro de um balde, confirmadas por JOGADORES:
 *  - se dois têm o mesmo nome E os MESMOS jogadores (roster ≥ 0.85) → é o mesmo
 *    evento duplicado: fica só o mais rico (mais jogadores/rondas), os outros caem;
 *  - se têm o mesmo nome mas jogadores DIFERENTES (eventos distintos) → anexa o mês
 *    para a sidebar não mostrar texto idêntico 2×.
 *  Devolve a lista já filtrada (pode ter menos entradas que a de entrada). */
/** "Dia Mês" (ES) da data de início — desambigua stops de SÉRIE no mesmo mês
 *  (ex: "3 Junio" vs "10 Junio"). Cai no mês só se não conseguir extrair o dia. */
function esDayMonthLabel(dateStr?: string): string {
  const mes = esMonthLabel(dateStr);
  if (!mes || !dateStr) return mes;
  const iso = /^\d{4}-\d{2}-(\d{2})/.exec(dateStr);
  const day = iso ? String(+iso[1]) : (/\b(\d{1,2})\b/.exec(dateStr)?.[1] ?? "");
  return day ? `${day} ${mes}` : mes;
}

function resolveEntryNameCollisions(
  list: CircuitEntry[],
  rosterOf: (e: CircuitEntry) => string[] | undefined,
): CircuitEntry[] {
  const richness = (e: CircuitEntry) => (e.playerCount ?? 0) * 1000 + (e.roundsCount ?? 0);
  const byName = new Map<string, CircuitEntry[]>();
  for (const e of list) {
    const arr = byName.get(e.name) ?? [];
    arr.push(e);
    byName.set(e.name, arr);
  }
  const dropped = new Set<CircuitEntry>();
  for (const arr of byName.values()) {
    if (arr.length < 2) continue;
    // 1) Dedup só da MESMA INSTÂNCIA: mesmos jogadores (roster ≥ 0.85) E mesma data
    //    de início. O guard da data é crítico — uma SÉRIE recorrente (ex: "VOBS
    //    Competition" semanal) tem os mesmos habituais a jogar → rosters muito
    //    sobrepostos entre stops DIFERENTES; sem o guard, apagaríamos stops reais.
    const survivors: CircuitEntry[] = [];
    for (const e of arr) {
      const twin = survivors.find((s) =>
        !!e.dateStart && s.dateStart === e.dateStart
        && rosterOverlap(rosterOf(s), rosterOf(e)) >= RFEG_ROSTER_SAME_MIN);
      if (!twin) { survivors.push(e); continue; }
      // Mesma instância duplicada: fica a mais rica, a outra é descartada.
      if (richness(e) > richness(twin)) {
        dropped.add(twin);
        survivors[survivors.indexOf(twin)] = e;
      } else {
        dropped.add(e);
      }
    }
    // 2) Os que sobrevivem são eventos/stops DISTINTOS com o mesmo nome → data no
    //    label. Mês se todos forem de meses diferentes (mais limpo); senão dia+mês
    //    (para stops de série no mesmo mês ficarem distinguíveis).
    if (survivors.length > 1) {
      const months = survivors.map((e) => esMonthLabel(e.dateStart));
      const monthsUnique = months.every(Boolean) && new Set(months).size === months.length;
      for (const e of survivors) {
        const lbl = monthsUnique ? esMonthLabel(e.dateStart) : esDayMonthLabel(e.dateStart);
        if (lbl) e.name = `${e.name} · ${lbl}`;
      }
    }
  }
  return list.filter((e) => !dropped.has(e));
}

/** Entradas da sidebar. `loadDivisions` carrega o detalhe de UM torneio (lazy,
 *  só ao abrir); nas entradas `grp-…` corre para cada categoria e as divisões
 *  ganham a tab «Escalão M/F» e o link do microsite. */
export function buildRfegEntries(
  index: RFEGIndex,
  twins: Record<string, number> | undefined,
  lgsSuppressed: Record<string, number> | undefined,
  loadDivisions: (t: RFEGIndexEntry) => Promise<CircuitDivision[]>,
): CircuitEntry[] {
  // Mostrar também torneios FUTUROS/em curso que ainda só têm inscritos
  // (leaderboardPlayers === 0 mas counts.admitidos > 0) — ex: Campeonatos de
  // España já com lista de inscritos antes de serem jogados.
  // Dedup gémeos RFEGolf<->LGS ANTES de agrupar (id sem compId nas entradas `grp-`,
  // por isso tem de ser aqui e não no caller):
  //  • Por defeito o LGS (rico, hbh+metros) é canónico e o RFEGolf só-PDF é suprimido
  //    (`twins[compId]`).
  //  • EXCEPÇÃO: quando o RFEGolf tem mitarjeta com ≥ rondas jogadas que o LGS (live
  //    scoring à frente do scrape LGS — ex: R3 do CEE juvenil só no mitarjeta), é o
  //    LGS que se suprime (`lgsSuppressed[lgsId]`) e fica o RFEGolf+mitarjeta.
  // Provas de 4/5/9 buracos (escalões muito novos) não interessam (Mariana,
  // 30/10/2026) — o nº de buracos vem do índice (dados ou nome).
  const visible = index.tournaments.filter(
    (t) => t.category
      && !(t.holes != null && t.holes < 18)
      && ((t.leaderboardPlayers || 0) > 0 || (t.counts?.admitidos || 0) > 0)
      && !(t.source === "rfegolf" && twins?.[String(t.id)] != null)
      && !(t.source === "livegolfscoring" && lgsSuppressed?.[String(t.id)] != null),
  );

  const single = (t: RFEGIndexEntry): CircuitEntry => ({
    id: `${t.source}:${t.id}`,
    year: t.year,
    name: t.name,
    source: t.source,
    course: t.course ?? undefined,
    // Usar sempre os campos ISO (uniformes) — dateStart/dateEnd cru vêm por
    // extenso nalgumas fontes (LGS: "01 mayo - 03 mayo") e ISO noutras.
    dateStart: t.dateStartIso ?? t.dateStart ?? undefined,
    dateEnd: t.dateEndIso ?? t.dateEnd ?? undefined,
    sourceUrl: rfegSourceUrl(t),
    hcpLimit: (t.hcpLimitMen != null || t.hcpLimitWomen != null)
      ? { men: t.hcpLimitMen ?? undefined, women: t.hcpLimitWomen ?? undefined }
      : undefined,
    escalao: t.category ?? undefined,
    sex: rfegSex(t.sex),
    federation: t.federation ?? undefined,
    hasManuel: t.hasManuel ?? undefined,
    hasPt: t.hasPt ?? undefined,
    hasResults: (t.leaderboardPlayers || 0) > 0,
    // Sem resultados ainda → mostrar nº de inscritos na sidebar.
    playerCount: t.leaderboardPlayers || t.counts?.admitidos || undefined,
    roundsCount: t.nRounds ?? undefined,
    divisionCount: 1,
    loadDivisions: () => loadDivisions(t),
  });

  // Agrupar por (fonte | ano | nome-base). Um grupo é UM campeonato dividido por
  // categoria/sexo (combinável) quando: ≥2 torneios, varia categoria OU sexo, cada
  // (categoria,sexo) é ÚNICO (senão é circuito/multi-stop — "Circuito Zona C" repete
  // Juvenil M) e as datas estão dentro de uma janela curta (senão é uma SÉRIE —
  // "Puntuable Nacional" espalhado por meses). Caso contrário, fica avulso.
  const byKey = new Map<string, RFEGIndexEntry[]>();
  for (const t of visible) {
    // slugify no nome-base → chave insensível a acentos ("Andalucia"/"Andalucía"
    // colapsam) e a maiúsculas, para o mesmo campeonato não partir em baldes.
    const key = `${t.source}|${t.year ?? "?"}|${slugify(rfegBaseName(t))}`;
    const arr = byKey.get(key) ?? [];
    arr.push(t);
    byKey.set(key, arr);
  }

  const entries: CircuitEntry[] = [];
  const usedGrpIds = new Set<string>();

  for (const group of byKey.values()) {
   // Cada balde produz as suas entradas num array local para podermos desambiguar
   // os labels em colisão (mesmo nome+ano) só entre si, antes de juntar ao total.
   const localEntries: CircuitEntry[] = [];
   // Roster por entrada (union dos torneios que a compõem) → alimenta a
   // resolução de colisões por JOGADORES no fim do balde.
   const rosterByEntry = new Map<CircuitEntry, string[]>();
   const pushLocal = (e: CircuitEntry, roster: string[]) => {
     localEntries.push(e);
     if (roster.length) rosterByEntry.set(e, roster);
   };
   for (const cluster of clusterByDate(group, RFEG_GROUP_WINDOW_DAYS)) {
    const catSex = cluster.map((t) => `${t.category}|${/F/i.test(t.sex || "") ? "F" : "M"}`);
    const variesCatOrSex = new Set(cluster.map((t) => t.category)).size > 1
      || new Set(cluster.map((t) => (/F/i.test(t.sex || "") ? "F" : "M"))).size > 1;
    const ms = cluster.map(rfegStartMs).filter((x): x is number => x != null);
    const spanDays = ms.length ? (Math.max(...ms) - Math.min(...ms)) / 86400000 : 0;
    // O cluster ainda pode ser uma SÉRIE (stops encadeados a < janela cada, mas a
    // abranger meses) — o guard de span mantém-na como entradas avulsas.
    if (cluster.length < 2 || !variesCatOrSex
        || new Set(catSex).size !== catSex.length
        || spanDays > RFEG_GROUP_WINDOW_DAYS) {
      for (const t of cluster) pushLocal(single(t), t.roster ?? []);
      continue;
    }

    // Combinar: divisões = tabs "Benjamín M / Benjamín F / Alevín M / …".
    const sorted = [...cluster].sort(
      (a, b) => (ceeEscOrder(a.category) - ceeEscOrder(b.category))
        || ((/F/i.test(a.sex || "") ? 1 : 0) - (/F/i.test(b.sex || "") ? 1 : 0)),
    );
    const baseRaw = rfegBaseName(sorted[0]) || sorted[0].name || "España";
    const year = sorted[0].year;
    const name = (year != null && !baseRaw.includes(String(year))) ? `${baseRaw} ${year}` : baseRaw;
    const sexes = new Set(sorted.map((t) => (/F/i.test(t.sex || "") ? "F" : "M")));
    const showSex = sexes.size > 1; // só anexa M/F à tab quando há ambos
    const starts = sorted.map((t) => t.dateStartIso ?? t.dateStart).filter(Boolean).sort();
    const ends = sorted.map((t) => t.dateEndIso ?? t.dateEnd).filter(Boolean).sort();
    // Id único: vários clusters/baldes podem reduzir ao mesmo nome-base+ano
    // (ex: campeonato juvenil de Junho vs Sub-16 P&P de Maio → ambos "Campeonato
    // de España 2026"). Desambigua por ano-mês de início, depois por contador.
    let grpId = `${sorted[0].source}:grp-${slugify(name)}`;
    if (usedGrpIds.has(grpId)) {
      const ym = (starts[0] ?? "").slice(0, 7).replace(/-/g, "");
      let cand = ym ? `${grpId}-${ym}` : `${grpId}-2`;
      for (let k = 2; usedGrpIds.has(cand); k++) cand = `${grpId}-${ym || "x"}-${k}`;
      grpId = cand;
    }
    usedGrpIds.add(grpId);
    const grpEntry: CircuitEntry = {
      id: grpId,
      year,
      name,
      source: sorted[0].source,
      // Deep-link vindo de fora (ex: painel de torneios de um jogador) usa o id
      // da prova; sem esta lista não bateria com nenhuma entrada da sidebar.
      memberIds: sorted.map((t) => `${t.source}:${t.id}`),
      dateStart: starts[0] ?? undefined,
      dateEnd: ends[ends.length - 1] ?? undefined,
      federation: sorted.find((t) => t.federation)?.federation ?? undefined,
      // NextCaddy: cada tour junta M+F (dividido em tabs por categoria) → Mixed,
      // para o filtro de sexo ao nível do grupo não o esconder ao filtrar F.
      sex: (showSex || sorted[0].source === "nextcaddy") ? "Mixed" : (sexes.has("F") ? "F" : "M"),
      // Escalões contidos → o filtro de escalão continua a apanhar a entrada
      // combinada (lazy) e o dropdown mantém as opções.
      escaloes: [...new Set(sorted.map((t) => t.category).filter((c): c is string => !!c))],
      hasManuel: sorted.some((t) => t.hasManuel),
      hasPt: sorted.some((t) => t.hasPt),
      hasResults: sorted.some((t) => (t.leaderboardPlayers || 0) > 0),
      playerCount: sorted.reduce((s, t) => s + (t.leaderboardPlayers || t.counts?.admitidos || 0), 0) || undefined,
      roundsCount: Math.max(0, ...sorted.map((t) => t.nRounds ?? 0)) || undefined,
      divisionCount: sorted.length,
      loadDivisions: async () => {
        const per = await Promise.all(sorted.map(async (ct) => {
          const divs = await loadDivisions(ct);
          // O torneio combinado não tem `sourceUrl` (é multi-escalão), por isso o
          // link oficial de cada categoria — que numa entry avulsa vinha do
          // `sourceUrl` — é reposto AQUI como link da divisão (microsite RFEG),
          // a juntar ao link de clasificación (mitarjeta) já em `d.links`.
          const official = { label: "Microsite oficial", url: rfegSourceUrl(ct), icon: "🏛️", title: "Microsite RFEG do torneio" };
          return divs.map((d, i) => {
            // Sexo: preferir o da PRÓPRIA divisão (NextCaddy dividido por categoria
            // M/F) sobre o do índice (que para o NextCaddy é null). Anexa M/F à tab
            // quando o grupo varia de sexo (showSex, ex: RFEGolf España) OU a divisão
            // já é sexuada (NextCaddy) — evita "Alevín M" redundante em grupos só-M.
            const dSex = (d.sex === "M" || d.sex === "F") ? d.sex : rfegSex(ct.sex);
            const escLbl = ct.category ?? d.escalao ?? "—";
            const withSex = showSex || d.sex === "M" || d.sex === "F";
            return {
              ...d,
              key: `${ct.source}:${ct.id}:${i}`,
              escalao: ct.category ?? d.escalao,
              sex: dSex,
              tabLabel: withSex ? `${escLbl} ${dSex === "F" ? "F" : "M"}` : escLbl,
              links: [...(d.links ?? []), official],
            };
          });
        }));
        return per.flat();
      },
    };
    pushLocal(grpEntry, [...new Set(sorted.flatMap((t) => t.roster ?? []))]);
   }
   // Colisões de nome+ano dentro deste balde: dedup se forem o MESMO evento
   // (mesmos jogadores) ou mês no label se forem eventos DIFERENTES.
   const resolved = resolveEntryNameCollisions(localEntries, (e) => rosterByEntry.get(e));
   for (const e of resolved) entries.push(e);
  }

  return entries;
}
