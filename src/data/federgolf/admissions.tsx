/**
 * admissions.tsx — a «Lista iscritti» da Federgolf → separador Inscrições (o
 * AdmissionsTab partilhado): escalão pela categoria, país dos estrangeiros,
 * HCP, data e estado, mais as colunas que só a lista italiana tem (Qual., OdM,
 * WAGR) como `extraCols`.
 */
import type { FpgAdmissions, FpgAdmissionPlayer } from "../nacional2026Loader";
import type { AdmissionsExtraCol } from "../../ui/AdmissionsTab";
import { MUTED } from "../../ui/tableCells";
import type { TotalsNotice } from "../model/types";
import type { FgInscrito, FgProva } from "./types";
import { clubeOuPais, fgEscalao, fgNome, fgPais, fgTitulo } from "./toTournament";

/** Legenda da própria lista da Federgolf. */
const QUAL: Record<string, string> = {
  B: "Brevetto", BG: "Brevetto Giovanile", BN: "Brevetto Nazionale",
  GIF: "Interesse Federale", GIN: "Interesse Nazionale",
};

type FgAdmissionPlayer = FpgAdmissionPlayer & { qual?: string | null; odm?: number | null; wagr?: number | null };

const ESTADO: Record<NonNullable<FgInscrito["estado"]>, FpgAdmissionPlayer["status"]> = {
  ammesso: "confirmed", wildcard: "confirmed", attesa: "reserva", cancellato: "desistente",
};

/** `nascimentos`: id do jogador → ano de nascimento (ranking juvenil — `fgAnosNascimento`).
 *  A lista de inscritos não traz o id: casa-se pelo nome «APELIDO, NOME» com
 *  os jogadores da classificação da mesma prova; quem não jogou, com o nome no
 *  ranking quando dá um só id (`idsDoRanking` — `fgIdPorNomeUnico`). */
export function fgAdmissions(d: FgProva, nascimentos?: Map<string, number>, idsDoRanking?: Map<string, string>): FpgAdmissions | undefined {
  if (!d.inscritos?.length) return undefined;
  const idPorNome = new Map(d.jogadores.map((j) => [j.nome.toUpperCase(), j.id]));
  const anoDe = (nome: string) => {
    const k = nome.toUpperCase();
    const id = idPorNome.get(k) ?? idsDoRanking?.get(k);
    return id ? nascimentos?.get(id) ?? null : null;
  };
  const players = d.inscritos.map((i): FgAdmissionPlayer => ({
    pos: i.n, fed: null, nome: fgNome(i.nome), clube: clubeOuPais(i.clube),
    hcp: i.indice, vac: null,
    dataInscricao: i.data ? i.data.replace(/-/g, "/") : null,
    status: i.estado ? ESTADO[i.estado] : "confirmed",
    country: fgPais(i.clube), escalao: fgEscalao(i.cat), birthYear: anoDe(i.nome),
    ...(i.estado === "wildcard" ? { tags: ["Wildcard"] } : {}),
    qual: i.qual, odm: i.odm, wagr: i.wagr,
  }));
  return {
    name: fgTitulo(d.nome), date: d.data ?? undefined, players,
    totalInscritos: players.filter((p) => p.status === "confirmed").length,
    reservas: players.filter((p) => p.status === "reserva").length,
  };
}

const fgCampo = <K extends "qual" | "odm" | "wagr">(p: FpgAdmissionPlayer, k: K) => (p as FgAdmissionPlayer)[k] ?? null;

/** Colunas da lista italiana que o AdmissionsTab não tem: Qual., OdM e WAGR. */
export function fgAdmissionsCols(adm: FpgAdmissions | undefined): AdmissionsExtraCol[] {
  const ps = (adm?.players ?? []) as FgAdmissionPlayer[];
  const cols: AdmissionsExtraCol[] = [];
  if (ps.some((p) => p.qual)) cols.push({
    key: "qual", label: "Qual.", title: "Qualificação: B Brevetto · BG Brevetto Giovanile · BN Brevetto Nazionale · GIF Interesse Federale · GIN Interesse Nazionale",
    cell: (p) => { const q = fgCampo(p, "qual"); return q ? <span title={QUAL[q] ?? q}>{q}</span> : MUTED; },
    sort: (p) => fgCampo(p, "qual"),
  });
  if (ps.some((p) => p.odm != null)) cols.push({
    key: "odm", label: "OdM", title: "Lugar na Ordine di Merito da Federgolf", dir: "asc",
    cell: (p) => fgCampo(p, "odm") ?? MUTED, sort: (p) => fgCampo(p, "odm"),
  });
  if (ps.some((p) => p.wagr != null)) cols.push({
    key: "wagr", label: "WAGR", title: "Lugar no World Amateur Golf Ranking", dir: "asc",
    cell: (p) => fgCampo(p, "wagr") ?? MUTED, sort: (p) => fgCampo(p, "wagr"),
  });
  return cols;
}


const NAO_JOGOU: Record<NonNullable<FgInscrito["estado"]>, string> = {
  ammesso: "admitido, não jogou", wildcard: "wildcard, não jogou", attesa: "ficou em lista de espera", cancellato: "desinscreveu-se",
};

/** Portugueses inscritos que não aparecem na classificação (lista de espera,
 *  desistência) — a nota por cima do Resumo: a prova entra no filtro 🇵🇹 e
 *  explica porque não estão lá. */
export function fgNotaPtNaoJogaram(d: FgProva): TotalsNotice | null {
  if (!d.jogadores.length) return null;
  const jogaram = new Set(d.jogadores.map((j) => j.nome.trim().toUpperCase()));
  const fora = (d.inscritos ?? []).filter((i) => fgPais(i.clube) === "PT" && !jogaram.has(i.nome.trim().toUpperCase()));
  if (!fora.length) return null;
  const quem = fora.map((i) => `${fgNome(i.nome)} (${i.estado ? NAO_JOGOU[i.estado] : "não jogou"})`).join(" · ");
  return { kind: "aviso", text: `🇵🇹 Inscritos que não chegaram a jogar: ${quem}` };
}
