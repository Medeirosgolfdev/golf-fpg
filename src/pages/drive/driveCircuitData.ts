/**
 * src/pages/drive/driveCircuitData.ts
 *
 * Adaptador Drive → CircuitShell (NOVO, ainda NÃO ligado à rota).
 *
 * Objectivo: converter os torneios do Drive/Challenge/AQUAPOR (já em formato
 * FPGTournament) para o contrato `CircuitEntry[]` + `CircuitConfig` que a
 * página-mãe `CircuitShell` consome — mesmo padrão usado em RFEGPage.
 *
 * Estratégia de leaderboard: NATIVA do CircuitShell. Cada divisão entrega o
 * seu `results: FPGTournament` e o `IntlTournView` desenha o leaderboard
 * (incl. tabs de ronda a partir de `players[].roundScores`). Assim NÃO é preciso
 * extrair os componentes internos da DrivePage (ScorecardLB / DriveAccumulatedLB /
 * DriveAllRoundsScorecardLB) — isso fica para uma fase posterior caso se queira
 * replicar exactamente o render acumulado/scorecards-combinados via
 * `renderAccSection`/`renderRoundSection`.
 *
 * ⚠ Ainda por ligar (fase seguinte, precisa de extração de componentes da
 *   DrivePage e/ou do fetch runtime de inscrições):
 *     - Vistas de temporada (Resumo, Tabela de Pontos, Ranking Sub-12) → `specialItems`
 *     - Inscrições/Draws (vêm de `_admissions`/`_draws` anexados em runtime) → secções inscritos/draw
 *
 * Este módulo é puro (sem React) e testável isoladamente.
 */
import type { Tournament as FPGTournament } from "../../data/fpgTypes";
import type { CircuitEntry, CircuitConfig, CircuitDivision, CircuitInscritos, CircuitDraw } from "../../ui/circuit/types";
import type { FpgAdmissions, FpgDraw } from "../../data/nacional2026Loader";
import { isManuelByName } from "../../constants/manuel";

/** Campos anexados em runtime (inscrições/draws) ao FPGTournament da DrivePage. */
type DriveRuntime = { _admissions?: FpgAdmissions; _draws?: Record<string, FpgDraw> };

/** Ordem canónica de escalões do Drive (para ordenar tabs/divisões). */
const DRIVE_ESCALOES = ["Sub 10", "Sub 12", "Sub 14", "Sub 16", "Sub 18"];

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
        label: resumo?.name || shortCampo(t.campo),
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
      const eventKey = "ev-" + t.date + "-" + (t.ccode || t.campo);
      if (seen.has(eventKey)) continue;
      seen.add(eventKey);
      const entries = [...(eventMap.get(eventKey) || [])].sort((a, b) => escIdx(a.escalao) - escIdx(b.escalao));
      groups.push({
        key: eventKey,
        label: entries[0]?.name || shortCampo(t.campo),
        campo: t.campo,
        tcode: entries.length === 1 ? entries[0].tcode : undefined,
        date: t.date,
        escalao: entries.length === 1 ? entries[0].escalao : null,
        isMulti: false,
        isEvent: entries.length > 1,
        totalRounds: 1,
        entries,
      });
    } else {
      groups.push({
        key: t.tcode + "_" + t.date,
        label: t.name || shortCampo(t.campo),
        campo: t.campo,
        tcode: t.tcode,
        date: t.date,
        escalao: t.escalao ?? null,
        isMulti: false,
        isEvent: false,
        totalRounds: 1,
        entries: [t],
      });
    }
  }
  return groups;
}

/** Ano civil a partir da data "YYYY-MM-DD". */
function yearOf(date: string | undefined): number | null {
  const y = parseInt((date || "").slice(0, 4), 10);
  return Number.isFinite(y) ? y : null;
}

function tournamentHasManuel(t: FPGTournament): boolean {
  return (t.players || []).some(p => isManuelByName(p.name));
}

/** Converte inscrições FPG (admitidos + reservas) → secção `inscritos` do CircuitShell. */
export function admissionsToInscritos(adm: FpgAdmissions | undefined): CircuitInscritos | undefined {
  if (!adm || adm.error || !adm.players || adm.players.length === 0) return undefined;
  const toRow = (p: NonNullable<FpgAdmissions["players"]>[number]): CircuitInscritos["lists"][number]["players"][number] => ({
    pos: p.pos ?? undefined,
    name: p.nome,
    club: p.clube ?? undefined,
    fed: p.fed ?? undefined,
    hcp: p.hcp,
    status: p.status,
  });
  const admitidos = adm.players.filter(p => p.status !== "reserva");
  const reservas  = adm.players.filter(p => p.status === "reserva");
  const lists: CircuitInscritos["lists"] = [];
  if (admitidos.length) lists.push({ key: "admitidos", label: `Admitidos (${admitidos.length})`, players: admitidos.map(toRow) });
  if (reservas.length)  lists.push({ key: "reservas",  label: `Reservas (${reservas.length})`,    players: reservas.map(toRow) });
  return lists.length ? { lists } : undefined;
}

/** Converte draws FPG (por ronda) → secção `draw` do CircuitShell. */
export function drawsToCircuitDraw(draws: Record<string, FpgDraw> | undefined): CircuitDraw | undefined {
  if (!draws) return undefined;
  const rounds: CircuitDraw["rounds"] = {};
  for (const [rn, d] of Object.entries(draws)) {
    if (!d || d.error || !d.groups || d.groups.length === 0) continue;
    rounds[rn] = d.groups.map(g => ({
      teeTime: g.teeTime,
      startHole: g.startHole ?? undefined,
      tee: g.tee ?? undefined,
      players: (g.players || []).map(pl => ({ name: pl.nome, club: pl.clube ?? undefined, fed: pl.fed ?? undefined })),
    }));
  }
  return Object.keys(rounds).length ? { rounds } : undefined;
}

/** Secções inscritos/draw de um torneio, a partir dos campos anexados em runtime. */
function runtimeSections(t: FPGTournament): { inscritos?: CircuitInscritos; draw?: CircuitDraw } {
  const rt = t as FPGTournament & DriveRuntime;
  const inscritos = admissionsToInscritos(rt._admissions);
  const draw = drawsToCircuitDraw(rt._draws);
  return { ...(inscritos ? { inscritos } : {}), ...(draw ? { draw } : {}) };
}

/** Constrói as divisões (tabs de escalão/ronda) de um grupo. */
export function buildDriveDivisions(group: DriveGroup): CircuitDivision[] {
  if (group.isEvent) {
    // Challenge multi-escalão: uma divisão por escalão.
    return group.entries.map((t, i): CircuitDivision => ({
      key: t.escalao || `e${i}`,
      escalao: t.escalao || "—",
      hasManuel: tournamentHasManuel(t),
      results: t,
      ...runtimeSections(t),
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
      ...runtimeSections(resumo),
    }];
  }
  // Single round.
  const t = group.entries[0];
  return [{
    key: "main",
    escalao: group.escalao || "—",
    hasManuel: tournamentHasManuel(t),
    results: t,
    ...runtimeSections(t),
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
  loadingMessage: "A carregar torneios do Drive…",
};
