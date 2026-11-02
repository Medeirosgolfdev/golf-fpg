/**
 * entries.ts — índice da Federgolf → entradas do CircuitShell (a prova
 * masculina e a feminina do mesmo dia e clube numa só entrada, um separador
 * por sexo) e o detalhe de cada prova, carregado ao abrir.
 */
import { withDivisionModel } from "../model/division";
import { cachedFetchJson } from "../fetchCache";
import type { CircuitEntry, CircuitDivision, CircuitSex } from "../../ui/circuit/types";
import type { FgIndice, FgIndiceProva, FgProva } from "./types";
import { fgAdmissions, fgAdmissionsCols } from "./admissions";
import { fgClube, fgEscalaoProva, fgScorecardOptions, fgTemCartoes, fgTitulo, fgTotais, fgToTournament } from "./toTournament";

export const FG_INDEX_URL = "/data/federgolf-index.json";
const provaUrl = (id: string) => `/data/federgolf/${id}.json`;

/** Nome da prova sem o sexo («… - MASCHILE», «… - FEMMINILE»). */
export function fgNomeBase(nome: string): string {
  return nome.replace(/\s*-?\s*\b(MASCHILE|FEMMINILE)\b\s*/i, " ").replace(/\s+-\s*$/, "").replace(/\s+/g, " ").trim();
}

const SEXO_LABEL: Record<"M" | "F", string> = { M: "Masculino", F: "Feminino" };

function loadDivision(p: FgIndiceProva): Promise<CircuitDivision | null> {
  return cachedFetchJson<FgProva>(provaUrl(p.id)).then((d) => {
    if (!d?.jogadores?.length) return null;
    const admissions = fgAdmissions(d);
    return withDivisionModel({
      key: p.sexo ?? p.id,
      escalao: fgEscalaoProva(p.categoria),
      tabLabel: p.sexo ? SEXO_LABEL[p.sexo] : undefined,
      sex: p.sexo ?? undefined,
      // Sem cartões (passagem rápida, ainda por completar) → só os totais.
      ...(fgTemCartoes(d) ? { results: fgToTournament(d) } : { totals: fgTotais(d) }),
      // A «Lista iscritti» (com quem não chegou a jogar) no separador Inscrições.
      ...(admissions ? { admissions, admissionsExtraCols: fgAdmissionsCols(admissions) } : {}),
      scOptions: fgScorecardOptions(),
      links: [{ label: "Federgolf", url: d.url, icon: "🌐" }],
    } as CircuitDivision);
  });
}

/** Índice → entradas (M e F da mesma prova juntas). */
export function buildFgEntries(idx: FgIndice): CircuitEntry[] {
  const grupos = new Map<string, FgIndiceProva[]>();
  for (const p of idx.provas) {
    // «Pulcine»/«Pulcini», «Ragazze»/«Ragazzi» no mesmo dia e clube = a mesma prova.
    const k = `${p.data}|${p.clube}|${fgNomeBase(p.nome).replace(/\b(PULCIN|CADETT|RAGAZZ)[IE]\b/gi, "$1I")}`;
    if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k)!.push(p);
  }
  return [...grupos.values()].map((ps): CircuitEntry => {
    ps.sort((a, b) => (a.sexo === "M" ? 0 : 1) - (b.sexo === "M" ? 0 : 1));
    const p0 = ps[0];
    const sexos = [...new Set(ps.map((p) => p.sexo).filter((s): s is "M" | "F" => !!s))];
    const sex: CircuitSex | undefined = sexos.length > 1 ? "Mixed" : sexos[0];
    return {
      id: p0.id,
      memberIds: ps.length > 1 ? ps.map((p) => p.id) : undefined,
      year: p0.data ? Number(p0.data.slice(0, 4)) : null,
      name: fgTitulo(fgNomeBase(p0.nome)),
      series: p0.tipo,
      course: fgClube(p0.clube),
      dateStart: p0.data ?? undefined,
      federation: "Federgolf",
      escalao: fgEscalaoProva(p0.categoria),
      sex,
      roundsCount: Math.max(...ps.map((p) => p.voltas)),
      divisionCount: ps.length,
      playerCount: ps.reduce((a, p) => a + p.jogadores, 0),
      hasResults: true,
      loadDivisions: () => Promise.all(ps.map(loadDivision)).then((ds) => ds.filter((d): d is CircuitDivision => !!d)),
    };
  });
}
