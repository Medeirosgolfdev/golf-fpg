/**
 * src/pages/fpg/fpgCircuitData.ts
 *
 * Adaptador FPG → CircuitShell para as vistas "Todos" / "Jovens" / "Clubes" /
 * "Santo da Serra" / "PJA" da FPGPage (o separador "Torneios").
 *
 * Converte os `EventGroup` da FPG (um evento = N escalões, cada escalão é um
 * `Tournament` com o seu ccode/tcode) no contrato `CircuitEntry[]` que o
 * `CircuitShell` consome — mesmo padrão do `driveCircuitData.ts`/RFEGPage.
 *
 * Modelo (decisão de deep-link): cada EVENTO vira UMA entrada, com uma
 * `CircuitDivision` por escalão. `memberIds` = `${ccode}-${tcode}` de cada
 * escalão, para o deep-link `/FPG/torneio/{ccode}-{tcode}` resolver o grupo E o
 * escalão exacto (via `selectedDivKey` do shell) — preservando os links externos
 * a tcodes específicos (ex.: /torneios-recentes). O render do detalhe é
 * delegado ao `TournamentDetail` da FPG via `division.renderFull` (anexado na
 * FPGPage, que tem `escLookup`/`playersDB` em runtime) — este módulo é PURO
 * (sem React) e testável isoladamente.
 */
import type { Tournament as FPGTournament } from "../../data/fpgTypes";
import type { EventGroup, JovensGroup } from "../../ui/InscricoesComponents";
import type { CircuitEntry, CircuitConfig, CircuitDivision, CircuitSex } from "../../ui/circuit/types";
import { tournamentHasManuel } from "../../data/fpgUtils";
import { clubesHasManuel, clubesIndividualTournament } from "../../data/clubesFormats";
import { parseTournKey } from "../../utils/format";

/** Chave de membro = chave de URL do escalão (`parseTournKey` parte no 1º "-"). */
export function fpgMemberKey(t: FPGTournament): string {
  return `${t.ccode ?? "?"}-${t.tcode ?? "?"}`;
}

/** Ano (número) de uma data "YYYY-MM-DD"; null se indeterminado. */
function yearOf(date?: string): number | null {
  const m = /^(\d{4})/.exec(date ?? "");
  return m ? parseInt(m[1], 10) : null;
}

/** Sexo do escalão a partir do sufixo do label/escalão/nome (H→M, S→F). Só
 *  quando inequívoco — senão undefined (a FPG mistura escalões M+F por evento). */
function divSex(t: FPGTournament): CircuitSex | undefined {
  const s = `${t._tabLabel ?? ""} ${t.escalao ?? ""} ${t.name ?? ""}`;
  if (/\b(S|Fem(inin[oa]s?)?|Raparigas?)\b/.test(s)) return "F";
  if (/\b(H|M|Mascul(in[oa]s?)?|Rapazes?)\b/.test(s)) return "M";
  return undefined;
}

/** Label da tab de escalão — espelha a lógica da barra de escalões da FPGPage:
 *  `_tabLabel` → `escalao` → sufixo distintivo do nome do grupo → dd/mm → nome
 *  curto → "Esc". */
export function fpgDivLabel(t: FPGTournament, groupName: string): string {
  if (t._tabLabel) return t._tabLabel;
  if (t.escalao) return t.escalao;
  const gNm = (groupName || "").toLowerCase();
  const nm = t.name || "";
  const suffix = gNm && nm.toLowerCase().startsWith(gNm)
    ? nm.slice(gNm.length).replace(/^[\s\-–:·]+/, "").trim()
    : "";
  if (suffix) return suffix;
  const d = t.date && t.date.length >= 10 ? `${t.date.slice(8, 10)}/${t.date.slice(5, 7)}` : "";
  if (d) return d;
  return nm && nm.length <= 20 ? nm : "Esc";
}

/** O label da tab só serve de ESCALÃO (filtro «Escalão» do shell) quando o é
 *  mesmo — senão as datas «01/02» e os «9 buracos» das tabs apareciam no
 *  filtro como se fossem escalões (22/10/2026). */
export function labelIsEscalao(label: string): boolean {
  return /^(sub[\s-]?\d+|[su]\d{2}\b|absolut|s[eé]nior|j[uú]nior|juvenil|infantil|benjamim|alevim|cadete|mid[\s-]?amateur|veteran|pais e filhos)/i.test(label.trim());
}

/** Uma divisão (escalão) por `Tournament` do grupo. NÃO preenche
 *  `inscritos`/`draw` — o `TournamentDetail` (via `renderFull`, anexado na
 *  FPGPage) lê `_admissions`/`_draws` do próprio torneio e desenha tudo. */
export function buildFpgDivisions(group: EventGroup): CircuitDivision[] {
  return group.entries.map((t): CircuitDivision => {
    const label = fpgDivLabel(t, group.name);
    const sex = divSex(t);
    return {
      key: fpgMemberKey(t),
      escalao: t.escalao || (labelIsEscalao(label) ? label : ""),
      tabLabel: label,
      ...(sex ? { sex } : {}),
      hasManuel: tournamentHasManuel(t),
      results: t,
    };
  });
}

/** Converte os EventGroups da FPG em entries do CircuitShell. */
export function buildFpgEntries(groups: EventGroup[]): CircuitEntry[] {
  return groups.map((g): CircuitEntry => {
    const divisions = buildFpgDivisions(g);
    const escaloes = [...new Set(divisions.map(d => d.escalao).filter(Boolean) as string[])];
    const sexes = [...new Set(divisions.map(d => d.sex).filter(Boolean) as CircuitSex[])];
    return {
      id: g.key,
      year: yearOf(g.date),
      name: g.name || g.campo || "Torneio",
      tcode: g.entries[0]?.tcode,
      course: g.campo || undefined,
      dateStart: g.date,
      memberIds: divisions.map(d => d.key),
      escalao: escaloes.length === 1 ? escaloes[0] : undefined,
      escaloes: escaloes.length > 1 ? escaloes : undefined,
      sex: sexes.length === 1 ? sexes[0] : (sexes.length > 1 ? "Mixed" : undefined),
      playerCount: divisions.reduce((acc, d) => acc + (d.results?.players.length ?? 0), 0),
      divisionCount: divisions.length,
      hasManuel: divisions.some(d => d.hasManuel),
      divisions,
    };
  });
}

/** Entradas da vista Jovens (/FPG/jovens). Iguais às de `buildFpgEntries`
 *  (um evento = uma entrada, um escalão = uma divisão e um tcode no URL), com
 *  duas diferenças:
 *   - o ano é o da edição (`JovensGroup.year`, vindo de `_jovensYear`), que é o
 *     que agrupa a sidebar — não o da data;
 *   - a contagem de jogadores usa `playerCount` quando os `players` ainda estão
 *     vazios (torneios por disputar, só com inscrições). */
export function buildJovensEntries(groups: JovensGroup[]): CircuitEntry[] {
  return buildFpgEntries(groups).map((e, i) => {
    const g = groups[i];
    const y = parseInt(g.year, 10);
    return {
      ...e,
      year: Number.isFinite(y) ? y : e.year,
      playerCount: g.entries.reduce((s, t) => s + (t.players.length || t.playerCount || 0), 0),
    };
  });
}

/** Entradas da vista Clubes (/FPG/clubes): um torneio de clubes = uma entrada
 *  com uma divisão (o seu tcode no URL). O ano é o da edição (`_clubesYear`, o
 *  ficheiro de onde veio), que agrupa a sidebar. A divisão traz o torneio como
 *  o mostram as abas Resultados/Resumo (`clubesIndividualTournament`: num match
 *  play, os jogadores saem dos confrontos e o Dia 1 entra como «Draw R1»); as
 *  abas «Grupos» e «Match Play» desenham-se a partir do torneio original, que a
 *  página encontra pela mesma posição em `clubes`. ★Manuel também pelos
 *  confrontos do match play. */
export function buildClubesEntries(clubes: FPGTournament[]): CircuitEntry[] {
  return clubes.map((t): CircuitEntry => {
    const results = clubesIndividualTournament(t);
    const key = fpgMemberKey(t);
    const hasManuel = clubesHasManuel(t);
    const escalao = t.escalao || undefined;
    const y = parseInt(t._clubesYear ?? "", 10);
    const year = Number.isFinite(y) ? y : yearOf(t.date);
    return {
      id: `clubes-${year ?? "?"}-${key}`,
      year,
      name: t.name || t.campo || "Torneio",
      tcode: t.tcode,
      course: t.campo || undefined,
      dateStart: t.date,
      memberIds: [key],
      escalao,
      playerCount: results.playerCount || results.players.length,
      divisionCount: 1,
      hasManuel,
      divisions: [{
        key,
        escalao: escalao ?? "",
        tabLabel: escalao ?? t.name,
        hasManuel,
        results,
      }],
    };
  });
}

/** Deep-link `/FPG/torneio/{ccode}-{tcode}` → (entrada, escalão) do shell. Um
 *  membro pode ter tcode sintético "A+B" (multi-dia); o URL canónico usa só o
 *  1º tcode, por isso o match parte o "+". Sem `tkey` ou sem match → ambos
 *  `undefined` (o shell aplica o seu default). */
export function resolveFpgTkey(entries: CircuitEntry[], tkey: string | null | undefined): { id?: string; divKey?: string } {
  if (!tkey) return {};
  const parsed = parseTournKey(tkey);
  if (!parsed) return {};
  const matches = (memberKey: string) => {
    const mp = parseTournKey(memberKey);
    if (!mp || String(mp.ccode) !== String(parsed.ccode)) return false;
    const mt = String(mp.tcode ?? "");
    return mt === String(parsed.tcode) || mt.split("+").includes(String(parsed.tcode));
  };
  for (const e of entries) {
    const d = e.divisions?.find(dv => matches(dv.key));
    if (d) return { id: e.id, divKey: d.key };
  }
  return {};
}

/** Divisão representativa de um grupo (para o URL default): a do Manuel, senão
 *  a primeira. A FPGPage usa `.key` desta divisão como tcode canónico do URL. */
export function fpgRepDivision(divisions: CircuitDivision[]): CircuitDivision | undefined {
  return divisions.find(d => d.hasManuel) ?? divisions[0];
}

/** Config base do CircuitShell para a FPG. A FPGPage sobrepõe `grouping`
 *  ("month-year" no separador "Todos"; "year" em Santo da Serra / PJA) e o
 *  `title` conforme o sub-separador activo. */
export const FPG_CONFIG: CircuitConfig = {
  routeBase: "/FPG",
  title: "🇵🇹 FPG",
  grouping: "month-year",
  filters: {
    search: true,
    year: true,
    escalao: true,
    sex: true,
    toggles: ["manuel", "pt", "top10"],
  },
};

/** Config do CircuitShell na vista Clubes: agrupada por ano da edição e com o
 *  ★Manuel ligado à partida (como a lista antiga de /FPG/clubes). */
export const CLUBES_CONFIG: CircuitConfig = {
  ...FPG_CONFIG,
  title: "🏅 Clubes",
  grouping: "year",
  filters: {
    search: true,
    year: true,
    escalao: true,
    toggles: ["manuel"],
    defaultToggles: ["manuel"],
  },
};
