/**
 * src/pages/fpg/fpgCircuitData.ts
 *
 * Adaptador FPG → CircuitShell para as vistas "Todos" / "Santo da Serra" / "PJA"
 * da FPGPage (o separador "Torneios", excl. Clubes/Jovens, que têm UI própria).
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
import type { EventGroup } from "../../ui/InscricoesComponents";
import type { CircuitEntry, CircuitConfig, CircuitDivision, CircuitSex } from "../../ui/circuit/types";
import { tournamentHasManuel } from "../../data/fpgUtils";

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

/** Uma divisão (escalão) por `Tournament` do grupo. NÃO preenche
 *  `inscritos`/`draw` — o `TournamentDetail` (via `renderFull`, anexado na
 *  FPGPage) lê `_admissions`/`_draws` do próprio torneio e desenha tudo. */
export function buildFpgDivisions(group: EventGroup): CircuitDivision[] {
  return group.entries.map((t): CircuitDivision => {
    const label = fpgDivLabel(t, group.name);
    const sex = divSex(t);
    return {
      key: fpgMemberKey(t),
      escalao: t.escalao || label,
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
