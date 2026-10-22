/**
 * src/data/drive/driveCircuitData.ts
 *
 * Adaptador Drive → CircuitShell (a /drive) e a lista de torneios que lhe dá origem.
 *
 * Objectivo: converter os torneios do Drive/Challenge/AQUAPOR (já em formato
 * FPGTournament) para o contrato `CircuitEntry[]` + `CircuitConfig` que a
 * página-mãe `CircuitShell` consome — mesmo padrão usado em RFEGPage.
 *
 * Estratégia de leaderboard: NATIVA do CircuitShell. Cada divisão entrega o
 * seu `results: FPGTournament` e o `IntlTournView` desenha o leaderboard
 * (incl. tabs de ronda a partir de `players[].roundScores`).
 *
 * O detalhe de cada divisão é o TournamentDetail (a DrivePage põe-no em
 * `renderFull`), que busca inscrições e draws sozinho.
 *
 * Este módulo é puro (sem React) e testável isoladamente.
 */
import type { Tournament as FPGTournament } from "../fpgTypes";
import { ESCALOES_DRIVE as DRIVE_ESCALOES } from "../../constants/escaloes";
import type { CircuitEntry, CircuitConfig, CircuitDivision } from "../../ui/circuit/types";
import { isManuelByName } from "../../constants/manuel";
import { withDivisionModel } from "../model/division";

/** Ordem canónica de escalões do Drive (para ordenar tabs/divisões). */

/** Labels legíveis por série (usadas no agrupamento da sidebar). */
const DRIVE_SERIES_LABEL: Record<string, string> = {
  tour: "Drive Tour",
  challenge: "Drive Challenge",
  aquapor: "AQUAPOR",
};

/** Labels de região (filtro `liga` do CircuitShell). */
const DRIVE_REGION_LABEL: Record<string, string> = {
  norte: "Norte",
  tejo: "Tejo",
  sul: "Sul",
  madeira: "Madeira",
  acores: "Açores",
  nacional: "Nacional",
};

const escIdx = (esc: string | null | undefined): number => {
  const i = DRIVE_ESCALOES.indexOf(esc || "");
  return i >= 0 ? i : 99;
};

/** Remove o sufixo de escalão ("-Sub 10", "– Sub 12", "Sub18") do fim do nome do
 *  torneio. Como agrupamos TODOS os escalões de um evento numa única entrada de
 *  sidebar (o escalão vive nos tabs/badge), manter o "Sub NN" no nome fica
 *  redundante e confuso — a etapa "Final Drive Challenge Madeira-Palheiro-Sub 10"
 *  aparecia como se fosse só o Sub 10. */
export function stripEscalaoFromName(name: string | undefined | null): string {
  return (name || "").replace(/[\s\-–—]*\bsub\s*\d{1,2}\b\s*$/i, "").trim();
}

/** Encurta o nome do campo para a sidebar/label (espelha shortCampo da DrivePage). */
export function shortCampo(c: string | undefined | null): string {
  return (c || "")
    .replace(/Vilamoura - /g, "")
    .replace(/ \(.*\)/, "")
    .replace(/ - .*/, "")
    .replace(/ Golf/g, "")
    .replace(/Santo da Serra.*/, "Stº Serra");
}

/** Grupo de torneio Drive: single, multi-ronda (R1/R2/Resumo) ou evento (vários escalões). */
export interface DriveGroup {
  key: string;
  label: string;
  campo?: string;
  tcode?: string;
  date: string;
  escalao: string | null | undefined;
  isMulti: boolean;
  isEvent: boolean;
  totalRounds: number;
  entries: FPGTournament[];
  /** Sub-grupos que viram divisões (tabs) do mesmo evento — usado no AQUAPOR,
   *  onde Masculino e Senhoras são tcodes distintos da MESMA prova. Cada
   *  sub-grupo mantém o seu próprio isMulti/totalRounds. */
  subGroups?: DriveGroup[];
  /** Label da divisão quando o grupo é sub-grupo de um evento (ex: "Senhoras"). */
  divLabel?: string;
  /** Sexo da divisão (badge no tab). */
  divSex?: "M" | "F";
}

/** O AQUAPOR publica cada prova em DOIS tcodes na mesma data/clube: o masculino
 *  ("4º Torneio do Circuito Aquapor") e o feminino, sufixado " S" de Senhoras
 *  ("4º Torneio do Circuito Aquapor S"). São a MESMA prova — na sidebar têm de
 *  aparecer como uma entrada só, com tabs Masculino/Senhoras. */
const AQUAPOR_SENHORAS_RE = /\bS\s*$/;
function isAquaporSenhoras(t: FPGTournament | undefined): boolean {
  return !!t && AQUAPOR_SENHORAS_RE.test((t.name || "").trim());
}

/**
 * Constrói os grupos a partir da lista plana de torneios.
 * Replica a lógica de `buildGroups` da DrivePage (multi-ronda via `_multiGroup`;
 * evento Challenge multi-escalão via data+ccode/campo; resto = single).
 */
export function buildDriveGroups(tournaments: FPGTournament[]): DriveGroup[] {
  const sorted = [...tournaments].sort((a, b) => {
    const dateCmp = (a.date || "").localeCompare(b.date || "");
    if (dateCmp !== 0) return dateCmp;
    return escIdx(a.escalao) - escIdx(b.escalao);
  });

  const multiMap = new Map<string, FPGTournament[]>();
  const eventMap = new Map<string, FPGTournament[]>();
  const eventKeyOf = new Map<FPGTournament, string>();
  const evKey = (t: FPGTournament) => eventKeyOf.get(t) ?? "ev-" + t.date + "-" + (t.ccode || t.campo);

  for (const t of sorted) {
    if (t._multiGroup) {
      if (!multiMap.has(t._multiGroup)) multiMap.set(t._multiGroup, []);
      multiMap.get(t._multiGroup)!.push(t);
    } else if (t.series === "challenge" && t.escalao && !t._roundLabel) {
      const eventKey = "ev-" + t.date + "-" + (t.ccode || t.campo);
      if (!eventMap.has(eventKey)) eventMap.set(eventKey, []);
      eventMap.get(eventKey)!.push(t);
    }
  }

  // Dois torneios no mesmo dia e clube (Açores 03/09/2021: o 3º e o 4º Challenge,
  // cada um com os seus escalões) ficavam num só evento com escalões repetidos —
  // chaves de divisão iguais e o link de um escalão a abrir o outro. Com
  // escalões repetidos, separa-se pelo nome (sem o escalão); o primeiro fica
  // com a chave de sempre.
  for (const [key, bucket] of [...eventMap]) {
    const escs = bucket.map(t => t.escalao);
    if (new Set(escs).size === escs.length) continue;
    const byName = new Map<string, FPGTournament[]>();
    for (const t of bucket) {
      const n = stripEscalaoFromName(t.name);
      if (!byName.has(n)) byName.set(n, []);
      byName.get(n)!.push(t);
    }
    [...byName.values()].forEach((ts, i) => {
      const k = i === 0 ? key : `${key}-${i + 1}`;
      eventMap.set(k, ts);
      for (const t of ts) eventKeyOf.set(t, k);
    });
  }

  const groups: DriveGroup[] = [];
  const seen = new Set<string>();

  for (const t of sorted) {
    if (t._multiGroup) {
      if (seen.has(t._multiGroup)) continue;
      seen.add(t._multiGroup);
      const entries = [...multiMap.get(t._multiGroup)!].sort((a, b) => {
        if (a._roundLabel === "Resumo") return 1;
        if (b._roundLabel === "Resumo") return -1;
        return (a._roundLabel || "").localeCompare(b._roundLabel || "");
      });
      const resumo = entries.find(e => e._roundLabel === "Resumo") ?? entries[0];
      groups.push({
        key: t._multiGroup,
        label: stripEscalaoFromName(resumo?.name) || shortCampo(t.campo),
        campo: t.campo,
        tcode: resumo?.tcode,
        date: t.date,
        escalao: t.escalao ?? null,
        isMulti: true,
        isEvent: false,
        totalRounds: t._totalRounds || 2,
        entries,
      });
    } else if (t.series === "challenge" && t.escalao && !t._roundLabel) {
      const eventKey = evKey(t);
      if (seen.has(eventKey)) continue;
      seen.add(eventKey);
      const entries = [...(eventMap.get(eventKey) || [])].sort((a, b) => escIdx(a.escalao) - escIdx(b.escalao));
      groups.push({
        key: eventKey,
        label: stripEscalaoFromName(entries[0]?.name) || shortCampo(t.campo),
        campo: t.campo,
        tcode: entries.length === 1 ? entries[0].tcode : undefined,
        date: t.date,
        escalao: entries.length === 1 ? entries[0].escalao : null,
        isMulti: false,
        isEvent: entries.length > 1,
        // ⚠ Na lista CRUA (não-expandida) um torneio multi-ronda é UMA entrada
        // com `rounds: N` — sem isto a sidebar não mostrava o RoundPill "2R"
        // (bug 2026-07-10, ex: 3º Drive Tour Tejo Santo Estêvão).
        totalRounds: Math.max(1, ...entries.map(e => e.rounds || 1)),
        entries,
      });
    } else {
      groups.push({
        key: t.tcode + "_" + t.date,
        label: stripEscalaoFromName(t.name) || shortCampo(t.campo),
        campo: t.campo,
        tcode: t.tcode,
        date: t.date,
        escalao: t.escalao ?? null,
        isMulti: false,
        isEvent: false,
        totalRounds: t.rounds || 1,  // idem — rounds do próprio torneio cru
        entries: [t],
      });
    }
  }
  return mergeAquaporSexGroups(groups);
}

/** Funde os grupos AQUAPOR Masculino + Senhoras da mesma data/clube num só
 *  evento com dois sub-grupos (→ duas divisões/tabs). Grupos sem par ficam
 *  intactos (as épocas até 2025 só tinham a prova masculina). */
function mergeAquaporSexGroups(groups: DriveGroup[]): DriveGroup[] {
  const byEvent = new Map<string, DriveGroup[]>();
  for (const g of groups) {
    const t = g.entries[0];
    if (t?.series !== "aquapor") continue;
    const key = `aq-${g.date}-${t.ccode ?? g.campo ?? ""}`;
    if (!byEvent.has(key)) byEvent.set(key, []);
    byEvent.get(key)!.push(g);
  }
  const merged = new Map<string, DriveGroup>();
  for (const [key, gs] of byEvent) {
    if (gs.length < 2) continue;
    // Masculino primeiro (é o que dá nome/id ao evento — mantém as URLs já
    // partilhadas), Senhoras depois.
    const subGroups = [...gs].sort((a, b) =>
      Number(isAquaporSenhoras(a.entries[0])) - Number(isAquaporSenhoras(b.entries[0])));
    for (const sg of subGroups) {
      const fem = isAquaporSenhoras(sg.entries[0]);
      sg.divLabel = fem ? "Senhoras" : "Masculino";
      sg.divSex = fem ? "F" : "M";
    }
    const main = subGroups[0];
    merged.set(key, {
      ...main,
      escalao: null,
      isMulti: false,
      isEvent: true,
      totalRounds: Math.max(...subGroups.map(s => s.totalRounds)),
      entries: subGroups.flatMap(s => s.entries),
      subGroups,
    });
  }
  if (merged.size === 0) return groups;
  // Preservar a ordem original, substituindo o grupo masculino pelo fundido e
  // deixando cair o feminino (agora é uma divisão dentro dele).
  const emitted = new Set<string>();
  const out: DriveGroup[] = [];
  for (const g of groups) {
    const t = g.entries[0];
    const key = t?.series === "aquapor" ? `aq-${g.date}-${t.ccode ?? g.campo ?? ""}` : null;
    const m = key ? merged.get(key) : undefined;
    if (!m) { out.push(g); continue; }
    if (emitted.has(key!)) continue;
    emitted.add(key!);
    out.push(m);
  }
  return out;
}

/** Ano civil a partir da data "YYYY-MM-DD". */
function yearOf(date: string | undefined): number | null {
  const y = parseInt((date || "").slice(0, 4), 10);
  return Number.isFinite(y) ? y : null;
}

function tournamentHasManuel(t: FPGTournament): boolean {
  return (t.players || []).some(p => isManuelByName(p.name));
}

/** Constrói as divisões (tabs de escalão/ronda) de um grupo. */
export function buildDriveDivisions(group: DriveGroup): CircuitDivision[] {
  // Modelo comum (src/data/model): formato, estado, buracos, cut, par.
  return driveDivisions(group).map(withDivisionModel);
}

function driveDivisions(group: DriveGroup): CircuitDivision[] {
  if (group.subGroups) {
    // Evento com sub-grupos (AQUAPOR M/S): cada sub-grupo constrói a sua
    // divisão pela via normal (preservando multi-ronda) e só troca de rótulo.
    return group.subGroups.map((sg, i): CircuitDivision => {
      const [div] = driveDivisions({ ...sg, subGroups: undefined });
      return {
        ...div,
        key: sg.divLabel || `d${i}`,
        escalao: sg.divLabel || div.escalao,
        tabLabel: sg.divLabel,
        ...(sg.divSex ? { sex: sg.divSex } : {}),
      };
    });
  }
  if (group.isEvent) {
    // Challenge multi-escalão: uma divisão por escalão.
    return group.entries.map((t, i): CircuitDivision => ({
      key: t.escalao || `e${i}`,
      escalao: t.escalao || "—",
      hasManuel: tournamentHasManuel(t),
      results: t,
    }));
  }
  if (group.isMulti) {
    // Multi-ronda: usar a entrada "Resumo" (jogadores com roundScores de todas as
    // rondas) para o IntlTournView desenhar as tabs de ronda; fallback à 1ª entrada.
    const resumo = group.entries.find(t => t._roundLabel === "Resumo") ?? group.entries[0];
    const roundLabels = Array.from({ length: group.totalRounds }, (_, i) => `R${i + 1}`);
    return [{
      key: "main",
      escalao: group.escalao || "—",
      hasManuel: tournamentHasManuel(resumo),
      results: resumo,
      roundLabels,
    }];
  }
  // Single round.
  const t = group.entries[0];
  return [{
    key: "main",
    escalao: group.escalao || "—",
    hasManuel: tournamentHasManuel(t),
    results: t,
  }];
}

/** Converte os torneios do Drive em entries do CircuitShell. */
export function buildDriveEntries(tournaments: FPGTournament[]): CircuitEntry[] {
  const groups = buildDriveGroups(tournaments);
  return groups.map((g): CircuitEntry => {
    const divisions = buildDriveDivisions(g);
    const seriesKey = g.entries[0]?.series || "tour";
    return {
      id: g.key,
      year: yearOf(g.date),
      name: g.label || g.campo || "Torneio",
      tcode: g.tcode,
      series: DRIVE_SERIES_LABEL[seriesKey] || seriesKey,
      liga: g.entries[0]?.region || undefined,
      course: g.campo || undefined,
      dateStart: g.date,
      escalao: g.escalao || undefined,
      playerCount: divisions.reduce((acc, d) => acc + (d.results?.players.length ?? 0), 0),
      roundsCount: g.totalRounds,
      divisionCount: divisions.length,
      hasManuel: divisions.some(d => d.hasManuel),
      divisions,
    };
  });
}

export const DRIVE_CONFIG: CircuitConfig = {
  routeBase: "/drive",
  title: "💧 DRIVE",
  grouping: "series-year",
  seriesOrder: ["Drive Tour", "Drive Challenge", "AQUAPOR"],
  ligaLabels: DRIVE_REGION_LABEL,
  filters: {
    search: true,
    year: true,
    escalao: true,
    liga: true,
    toggles: ["manuel", "pt", "top10"],
  },
  // "Edições anteriores" = a MESMA prova NO MESMO CAMPO ao longo do tempo. Uma
  // etapa Drive é identificada pelo CAMPO (o Aquapor de Vidago Palace é a mesma
  // prova que se repete lá; as etapas noutros campos são provas diferentes) →
  // chave = SÉRIE + campo canónico (`shortCampo`: "Palheiro Golf"→"Palheiro",
  // "Santo da Serra - Desertas"→"Stº Serra"). Assim o 1º e o 3º Drive Tour
  // Madeira (ambos em Palheiro) ficam juntos, mas o 2º (Santo da Serra) não.
  // Série na chave para não misturar Tour/Challenge/Aquapor no mesmo campo
  // (leaderboards de escalões diferentes). Escalão FORA da chave — o
  // `matchDivision` casa-o por label (escalões Drive distam 2, sem contaminação ±1).
  editionKey: (e) => {
    if (!e.series) return null;
    const campo = shortCampo(e.course).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
    if (!campo) return null;
    return `${e.series}|${campo}`;
  },
  // "Época" = toda a série/região do ANO em curso (as etapas da temporada,
  // cada uma noutro campo). Complemento das "Edições anteriores" (mesma prova/
  // campo entre anos). O shell filtra por este key + o ano do torneio aberto.
  seasonKey: (e) => {
    if (!e.series) return null;
    return `${e.series}|${e.liga ?? ""}`;
  },
  seasonTabLabel: "Época",
  loadingMessage: "A carregar torneios do Drive…",
};

/** Nome-base de um torneio Drive para casar duplicados: sem acentos, minúsculas,
 *  cortado no primeiro " – "/" - " (o sufixo é o campo: "Final Drive Tour – Oeiras…"). */
function driveBaseName(name: string | undefined | null): string {
  return String(name || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .split(/\s+[–-]\s+/)[0].replace(/\s+/g, " ").trim();
}

/**
 * Cruza a lista de APURADOS (provisório) com os INSCRITOS da FPG (real) —
 * 22/10/2026: a Mariana quer ver, entre os apurados, quem já confirmou a
 * presença. Os apurados são CONVOCADOS — não «saem» por não estarem inscritos.
 * Por federado: convocado inscrito → `confirmed` (ordem, HCP e registo da FPG;
 * escalão/região/pontos da lista de apurados); convocado ainda sem inscrição →
 * `reserva` (a tabela mostra «por inscrever»); inscrito que não está na lista →
 * `confirmed` com a marca «fora dos apurados». O cabeçalho (nome, data, estado
 * das inscrições) é o da FPG. Guarda os convocados em `_apuradosBase` para o
 * TournamentDetail refazer o cruzamento com a lista live.
 */
export function crossApuradosInscritos<A extends Record<string, any>>(apur: A, insc: A): A {
  const inscPlayers: any[] = insc.players || [];
  const byFed = new Map(inscPlayers.filter(p => p.fed).map(p => [String(p.fed), p]));
  const apFeds = new Set((apur.players || []).map((p: any) => String(p.fed)));
  let nPend = 0;
  const players = (apur.players || []).map((a: any) => {
    const i = a.fed ? byFed.get(String(a.fed)) : undefined;
    if (!i) return { ...a, status: "reserva", pos: ++nPend, dataInscricao: null };
    return { ...a, status: "confirmed", pos: i.pos ?? a.pos, hcp: i.hcp ?? a.hcp, vac: i.vac ?? a.vac,
      dataInscricao: i.dataInscricao ?? null, clube: i.clube || a.clube };
  });
  for (const i of inscPlayers) {
    if (!i.fed || !apFeds.has(String(i.fed))) players.push({ ...i, status: "confirmed", tags: [...(i.tags || []), "fora dos apurados"] });
  }
  const nConf = players.filter((p: any) => p.status === "confirmed").length;
  return { ...apur, ...insc, players, totalInscritos: nConf, reservas: nPend,
    _apurados: true, _apuradosBase: apur._apuradosBase ?? apur.players ?? [] } as A;
}

/**
 * Junta o torneio PROVISÓRIO (entrada manual com tcode inventado, ex. 988/90800,
 * criada a partir da lista de apurados antes de a FPG abrir o torneio) com o
 * torneio REAL da FPG do mesmo dia (ex. 985/10246) — 13/10/2026: apareciam duas
 * entradas «Final Drive Tour» e a Mariana quer UMA com a informação das duas,
 * não esconder uma.
 *
 * Regra (nunca só pelo tcode — a FPG reutiliza-os): um dos lados tem de ser
 * provisório (`_admissions._placeholder` ou `_manual`), mesma data e série,
 * nome-base igual e campo compatível; com mais de um candidato não se junta.
 * Fica a identidade/draws/resultados do real; a lista de apurados (e o campo) do
 * provisório entram quando o real ainda não tem inscritos; quando já tem, as duas
 * cruzam-se (`crossApuradosInscritos`); rondas e nº de jogadores = o máximo dos dois.
 */
export function mergeDrivePlaceholders<T extends Record<string, any>>(src: T[]): T[] {
  const isPlaceholder = (t: T) => !!(t._admissions?._placeholder || t._admissions?._manual || t._manual);
  const out = [...src];
  const removed = new Set<T>();
  for (const ph of src.filter(isPlaceholder)) {
    const base = driveBaseName(ph.name);
    const campo = driveBaseName(ph.campo || ph._admissions?.campo || "");
    const cands = src.filter(t => t !== ph && !isPlaceholder(t) && !removed.has(t)
      && t.date === ph.date && (t.series || "tour") === (ph.series || "tour")
      && driveBaseName(t.name) === base
      && (() => {
        const suffix = driveBaseName(String(t.name || "").split(/\s+[–-]\s+/).slice(1).join(" "));
        return !suffix || !campo || campo.includes(suffix) || suffix.includes(campo);
      })());
    if (cands.length !== 1) continue;
    const real = cands[0];
    const realPlayers = (real._admissions?.players?.length ?? 0) + (real.players?.length ?? 0);
    const merged = {
      ...real,
      name: String(real.name || "").length >= String(ph.name || "").length ? real.name : ph.name,
      campo: real.campo || ph.campo || ph._admissions?.campo || null,
      _admissions: realPlayers === 0 && ph._admissions ? ph._admissions
        : ph._admissions?.players?.length && real._admissions?.players?.length
          ? crossApuradosInscritos(ph._admissions, real._admissions)
          : real._admissions,
      _draws: real._draws && Object.keys(real._draws).length ? real._draws : ph._draws,
      rounds: Math.max(Number(real.rounds) || 0, Number(ph.rounds) || 0) || real.rounds,
      playerCount: Math.max(Number(real.playerCount) || 0, Number(ph.playerCount) || 0),
      extraLinks: [...(real.extraLinks || []), ...(ph.extraLinks || [])],
      _mergedFrom: `${ph.ccode}-${ph.tcode}`,
    } as T;
    out[out.indexOf(real)] = merged;
    out.splice(out.indexOf(ph), 1);
    removed.add(ph);
  }
  return out;
}
