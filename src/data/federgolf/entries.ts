/**
 * entries.ts — índice da Federgolf → entradas do CircuitShell (a prova
 * masculina e a feminina do mesmo dia e clube numa só entrada, um separador
 * por sexo) e o detalhe de cada prova, carregado ao abrir.
 */
import { withDivisionModel } from "../model/division";
import { cachedFetchJson } from "../fetchCache";
import type { CircuitEntry, CircuitDivision, CircuitSex } from "../../ui/circuit/types";
import type { FgIndice, FgIndiceProva, FgProva } from "./types";
import { noticeNode } from "../../ui/circuit/divisionPieces";
import { fgAdmissions, fgAdmissionsCols, fgNotaPtNaoJogaram } from "./admissions";
import { fgAnosNascimento, fgIdPorNomeUnico, loadFgRanking } from "./ranking";
import { fgEscalaoProva, fgScorecardOptions, fgToTournament } from "./toTournament";
import { fgChaveProva, fgClube, fgNomeBase, fgTitulo } from "./nomes";
import { somaDe } from "../../utils/mathUtils";

export { fgNomeBase };

export const FG_INDEX_URL = "/data/federgolf-index.json";
const provaUrl = (id: string) => `/data/federgolf/${id}.json`;

const SEXO_LABEL: Record<"M" | "F", string> = { M: "Masculino", F: "Feminino" };

/** Do ranking juvenil (~0,5 MB, partilhado por todas as provas): ano de
 *  nascimento por id e id por nome (só nomes sem homónimos). */
type Nascimentos = { porId: Map<string, number>; idPorNome: Map<string, string> };
let _nascimentos: Promise<Nascimentos> | null = null;
const loadNascimentos = () => (_nascimentos ??= loadFgRanking()
  .then((r) => ({ porId: fgAnosNascimento(r), idPorNome: fgIdPorNomeUnico(r) }))
  .catch(() => ({ porId: new Map<string, number>(), idPorNome: new Map<string, string>() })));

function loadDivision(p: FgIndiceProva): Promise<CircuitDivision | null> {
  return Promise.all([cachedFetchJson<FgProva>(provaUrl(p.id)), loadNascimentos()]).then(([d, n]) => {
    // Prova por jogar: só a lista de inscritos (separador Inscrições).
    if (!d?.jogadores?.length && !d?.inscritos?.length) return null;
    const nasc = n.porId;
    const admissions = fgAdmissions(d, nasc, n.idPorNome);
    // Portugueses inscritos que não jogaram (lista de espera…): nota no Resumo.
    const nota = fgNotaPtNaoJogaram(d);
    return withDivisionModel({
      key: p.sexo ?? p.id,
      escalao: fgEscalaoProva(p.categoria),
      tabLabel: p.sexo ? SEXO_LABEL[p.sexo] : undefined,
      sex: p.sexo ?? undefined,
      // Com ou sem cartões (sem eles, prova `format: "totals"`: o mesmo Resumo, sem Scorecards).
      ...(d.jogadores.length ? { results: fgToTournament(d, nasc) } : {}),
      ...(nota ? { accHeader: noticeNode(nota) } : {}),
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
    const k = fgChaveProva(p);
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
      playerCount: somaDe(ps, p => p.jogadores),
      // Provas por jogar (só inscritos) não têm resultados — o filtro «Com resultados» esconde-as.
      hasResults: ps.some((p) => !p.futura && p.jogadores > 0),
      hasPt: ps.some((p) => p.hasPt),
      hasManuel: ps.some((p) => p.hasManuel),
      loadDivisions: () => Promise.all(ps.map(loadDivision)).then((ds) => ds.filter((d): d is CircuitDivision => !!d)),
    };
  });
}
