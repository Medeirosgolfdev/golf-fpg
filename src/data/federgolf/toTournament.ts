/**
 * toTournament.ts — uma prova da Federgolf (um sexo) → Tournament da FPG, e
 * os nomes («APELIDO, NOME» → «Nome Apelido»).
 *
 * Cada volta leva o tee, o CR/Slope e o SD oficial do relatório de handicap
 * da prova; o escalão de cada jogador sai da categoria da Federgolf (B Baby,
 * P Pulcini, C Cadetti, R Ragazzi) pela tabela única de `model/escalao.ts`.
 */
import type { Tournament as FPGTournament, ScorecardOptions } from "../fpgTypes";
import { intlScorecardOptions } from "../intlScorecard";
import { buildFPGTournament, parOrNone, type IntlPlayerIn } from "../intlTournament";
import { escalaoCanon } from "../model/escalao";
import { flagOrEmpty } from "../../utils/flagUtils";
import type { FgProva } from "./types";

import { fgClube, fgNome, fgPais, fgTitulo } from "./nomes";

// Nomes, clube/país e a chave da prova vivem em nomes.ts (o agregador do Kids 2 lê-os de lá).
export { fgChaveProva, fgClube, fgNome, fgNomeBase, fgPais, fgTitulo } from "./nomes";

/** Coluna Clube: o clube, ou a bandeira e o código nos estrangeiros. */
export function clubeOuPais(clube: string | null | undefined): string {
  const pais = fgPais(clube);
  return pais ? `${flagOrEmpty(pais)} ${String(clube).trim().toUpperCase()}` : fgClube(clube);
}

/** Letra da categoria da Federgolf → nome (para a tabela de escalões). */
const CATEGORIA: Record<string, string> = { B: "Baby", P: "Pulcini", C: "Cadetti", R: "Ragazzi" };

/** Escalão de um jogador pela categoria (B/P/C/R); null = desconhecida. */
export function fgEscalao(cat: string | null | undefined): string | null {
  const nome = CATEGORIA[String(cat ?? "").trim().toUpperCase().slice(0, 1)];
  return nome ? escalaoCanon(nome, "it") : null;
}

/** Escalão de uma prova (Baby → Sub 12, U16 → Sub 16); o resto fica com o nome. */
export const fgEscalaoProva = (categoria: string): string => escalaoCanon(categoria, "it") ?? categoria;

/** `nascimentos`: id do jogador → ano de nascimento (do ranking juvenil — `fgAnosNascimento`).
 *  Prova ainda sem cartões (passagem rápida): o gross de cada volta, o SD e o
 *  tee sem buraco a buraco, com `format: "totals"` — o TournamentDetail desenha o
 *  MESMO Resumo das provas com cartões, sem o separador Scorecards (como as
 *  provas só em PDF da /rfeg). */
export function fgToTournament(d: FgProva, nascimentos?: Map<string, number>): FPGTournament {
  const semCartoes = !fgTemCartoes(d);
  const par = parOrNone(d.campo?.par, 18);
  const metros = d.campo?.metros?.every((m) => typeof m === "number" && m > 0) ? (d.campo.metros as number[]) : null;
  // Sem cartões não há par por buraco; o par da volta vem do relatório de handicap.
  const parVolta = semCartoes ? d.parTotal ?? null : null;
  return buildFPGTournament(
    { name: fgTitulo(d.nome), tcode: d.id, date: d.data ?? "", campo: fgClube(d.clube), rounds: d.voltas },
    { par, meters: metros, holes: 18, parTotal: par.length ? undefined : parVolta },
    d.jogadores.map((j): IntlPlayerIn => {
      const escalao = fgEscalao(j.cat);
      const tee = j.rating.find((r) => r?.tee)?.tee;
      const jogadas = j.voltas.filter((g) => g != null).length;
      // ±par: o da fonte; sem ele (voltas em falta), pelas voltas jogadas — com
      // cartões o buildFPGTournament conta pelo par, sem cartões pelo par da volta.
      const toPar = j.toPar ?? (semCartoes && parVolta && j.total != null ? j.total - parVolta * jogadas : undefined);
      return {
        id: j.id,
        name: fgNome(j.nome),
        pos: j.pos,
        club: clubeOuPais(j.clube),
        country: fgPais(j.clube),
        total: j.total,
        hcp: j.indice ?? j.hcp,
        ...(tee ? { course: { teeName: tee } } : {}),
        ...(toPar != null ? { toPar } : {}),
        rounds: j.voltas.flatMap((g, i) => {
          if (g == null) return [];
          const r = j.rating[i];
          return [{
            gross: g,
            scores: j.cartoes[i] ?? null,
            round: i + 1,
            card: r ? { teeName: r.tee ?? undefined, courseRating: r.cr ?? undefined, slope: r.slope ?? undefined } : undefined,
            extra: r?.sd != null ? { sd: r.sd } : undefined,
          }];
        }),
        extra: {
          ...(escalao ? { escalao } : {}), ...(d.sexo ? { sex: d.sexo } : {}),
          ...(nascimentos?.has(j.id) ? { birthYear: nascimentos.get(j.id) } : {}),
        },
      };
    }),
    semCartoes ? { format: "totals" } : {},
  );
}

/** A prova tem cartões buraco a buraco? (a passagem rápida só grava totais) */
export const fgTemCartoes = (d: FgProva): boolean => d.jogadores.some((j) => j.cartoes.some(Boolean));

export function fgScorecardOptions(): ScorecardOptions {
  return intlScorecardOptions({ hideHCP: false, hideTee: false, hideEsc: false, clubLabel: "Clube" });
}
