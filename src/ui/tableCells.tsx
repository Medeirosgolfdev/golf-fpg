/**
 * src/ui/tableCells.tsx
 *
 * Células de tabela partilhadas pelas vistas de rondas (Por data, Por campo,
 * Por torneio, Vista federado) e respectivas tabelas de detalhe. Centralizadas
 * aqui para que TODAS as tabelas falem a mesma língua visual — antes estavam
 * duplicadas (e divergentes) entre JogadoresPage e ByTournamentView.
 */
import React from "react";
import type { RoundData } from "../data/playerDataLoader";
import { fmtGrossDelta, fmtSdVal, fmtStb } from "../utils/scoreDisplay";
import { getTeeHex, textOnColor, teeBorder } from "../utils/teeColors";
import TeePill from "./TeePill";
import { fmtSign } from "../utils/format";

/** Traço esbatido para «sem valor» (o mesmo em todas as tabelas: «—» cinzento,
 *  no tamanho de letra da célula). Antes havia 17 variantes à mão. */
export const MUTED = <span className="cell-empty">—</span>;

/** Variação de HCP: ▼ verde quando desce (melhorou), ▲ vermelho quando sobe. */
export function HcpDelta({ d, zero = "—" }: { d: number | null; zero?: string }) {
  if (d == null || d === 0) return <span className="muted">{d === 0 ? zero : "—"}</span>;
  const melhorou = d < 0;
  return (
    <span className={"u-fw-700 " + (melhorou ? "u-c-color-good" : "u-c-color-danger")}>
      {melhorou ? "▼" : "▲"} {fmtSign(d, 1)}
    </span>
  );
}

/** Variação de posição num ranking: ▲N verde (subiu), ▼N vermelho (desceu). `up` = lugares ganhos. */
export function RankChange({ up, empty = null, title, className }: { up: number | null; empty?: React.ReactNode; title?: string; className?: string }) {
  if (up == null || up === 0) return <>{empty}</>;
  return (
    <span className={(up > 0 ? "u-c-color-good" : "u-c-color-danger") + (className ? " " + className : "")} title={title}>
      {up > 0 ? "▲" : "▼"}{Math.abs(up)}
    </span>
  );
}

/** Badge do número de buracos (9 / 18). */
export function HoleBadge({ hc }: { hc: number }) {
  return hc === 9
    ? <span className="hb hb9">9</span>
    : <span className="hb hb18">18</span>;
}

/** Gross + delta vs par colorido: <b>82</b><span +10>. */
export function GrossCell({ gross, par }: { gross: number | null; par: number | null }) {
  const { text, delta, cls } = fmtGrossDelta(gross, par);
  if (!text) return null;
  return <><b>{text}</b>{delta && <span className={`score-delta ${cls}`}>{delta}</span>}</>;
}

/** Pill de Score Differential colorido conforme o HCP (excellent/good/poor). */
export function SdCell({ round }: { round: RoundData }) {
  const { text, cls } = fmtSdVal(round);
  if (!text) return null;
  return <span className={cls ? `p p-${cls}` : "p"}>{text}</span>;
}

/** Pill de contagem (nº de voltas/rondas) com a cor do tee representativo.
 *  Usado como 1ª coluna nas vistas Por campo e Por torneio. */
export function CountPill({ count, tee }: { count: React.ReactNode; tee: string }) {
  const hex = getTeeHex(tee);
  return (
    <span className="count" style={{ background: hex, color: textOnColor(hex), border: teeBorder(hex) }}>
      {count}
    </span>
  );
}

/** As 7 células numéricas partilhadas das tabelas de detalhe de ronda
 *  (Bur/HCP/Tee/Dist/Gross/Stb/SD) — idênticas entre RoundRow (Por campo) e
 *  TournRoundRow (Por torneio). A célula de Data fica a cargo de cada vista,
 *  pois varia (pills, links, âncora de abertura do scorecard). */
export function RoundNumericCells({ r }: { r: RoundData }) {
  return (
    <>
      <td className="r"><HoleBadge hc={r.holeCount} /></td>
      <td className="r">{r.hi ?? ""}</td>
      <td><TeePill name={r.tee || ""} /></td>
      <td className="r muted">{r.meters ? `${r.meters}m` : ""}</td>
      <td className="r"><GrossCell gross={r.gross} par={r.par} /></td>
      <td className="r">{fmtStb(r.stb, r.holeCount)}</td>
      <td className="r"><SdCell round={r} /></td>
    </>
  );
}
