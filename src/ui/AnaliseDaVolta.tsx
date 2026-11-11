/**
 * AnaliseDaVolta — os dois blocos de análise que o detalhe de torneio põe por
 * baixo da classificação, em TODAS as páginas, sempre que há cartões buraco a
 * buraco (11/11/2026 — eram blocos próprios do BJGT, sobre o formato do BlueGolf):
 *
 *   • `DificuldadePorBuraco` — «📊 Dificuldade por buraco»: a linha-resumo do
 *     campo e a média por buraco contra o par (com o cartão do Manuel na volta).
 *     Uma tabela por tee: nunca mistura campos — ver `data/dificuldadeBuraco.ts`.
 *   • `AnaliseManuel` — «🇵🇹 Análise Manuel — R{n}»: birdies/bogeys buraco a
 *     buraco, por tipo de buraco e contra a volta anterior.
 *
 * Quem os chama é o TournamentDetail; as páginas não fazem nada.
 */
import React, { useMemo } from "react";
import type { Tournament } from "../data/fpgTypes";
import { numGross } from "../data/fpgUtils";
import {
  cartaoCompleto, chaveDoCampo, dificuldadePorBuraco, resumoDaVolta, resumoDoTotal,
  type DificuldadeBuraco,
} from "../data/dificuldadeBuraco";
import { parTypeStats } from "../utils/analysisStats";
import { findManuelNaProva } from "../constants/manuel";
import { scClass, toParClass } from "../utils/scoreDisplay";
import { fmtToPar, fmtSign, fmtSignParen } from "../utils/format";
import { temCartao } from "../utils/classificacao";
import { RoundPill } from "./PillBadge";
import SectionTitle from "./SectionTitle";
import { MUTED } from "./tableCells";
import TeeSwatch from "./TeeSwatch";

const soma = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0);
const corMedia = (d: number | null, neutra: string) => (d == null ? neutra : d > 0.7 ? "c-danger" : d < 0.2 ? "c-good" : neutra);

/** A tabela de um tee: Par · Média · vs Par (e o cartão do Manuel, se for o tee dele). */
function TabelaDoTee({ g, manuel }: { g: DificuldadeBuraco; manuel: { scores: number[] } | null }) {
  const { par, buracos } = g;
  const nh = par.length, tem18 = nh === 18;
  const parOut = soma(par.slice(0, 9)), parIn = soma(par.slice(9)), parTotal = soma(par);
  const jogados = buracos.filter((h) => h.media != null);
  const mOut = manuel ? soma(manuel.scores.slice(0, 9)) : 0, mIn = manuel ? soma(manuel.scores.slice(9)) : 0;
  const mTot = manuel ? soma(manuel.scores) : 0;
  return (
    <div className="bjgt-chart-scroll">
      <table className="sc-table-modern" data-sc-table="1">
        <thead><tr>
          <th className="hole-header ta-left"></th>
          {par.slice(0, 9).map((_, i) => <th key={i} className="hole-header">{i + 1}</th>)}
          {tem18 && <th className="hole-header col-out fs-10">Out</th>}
          {par.slice(9).map((_, i) => <th key={i + 9} className="hole-header">{i + 10}</th>)}
          {tem18 && <th className="hole-header col-in fs-10">In</th>}
          <th className="hole-header col-total">TOT</th>
        </tr></thead>
        <tbody>
          <tr className="sep-row"><td className="row-label par-label">Par</td>
            {par.slice(0, 9).map((p, i) => <td key={i}>{p}</td>)}
            {tem18 && <td className="col-out fw-600">{parOut}</td>}
            {par.slice(9).map((p, i) => <td key={i + 9}>{p}</td>)}
            {tem18 && <td className="col-in fw-600">{parIn}</td>}
            <td className="col-total">{parTotal}</td></tr>
          <tr><td className="row-label fw-700">Média</td>
            {buracos.map((h, i) => (
              <React.Fragment key={i}>
                <td className={`fw-600 ${corMedia(h.vsPar, "c-text-2")}`}>{h.media != null ? h.media.toFixed(1) : MUTED}</td>
                {tem18 && i === 8 && <td className="col-out"></td>}
              </React.Fragment>
            ))}
            {tem18 && <td className="col-in"></td>}
            <td className="col-total fw-700">{jogados.length === nh ? soma(jogados.map((h) => h.media!)).toFixed(1) : MUTED}</td></tr>
          <tr className="meta-row sep-row"><td className="row-label c-muted fs-10">vs Par</td>
            {buracos.map((h, i) => (
              <React.Fragment key={i}>
                <td className={`fs-10 fw-600 ${corMedia(h.vsPar, "c-muted")}`}>{h.vsPar != null ? fmtSign(h.vsPar, 1) : ""}</td>
                {tem18 && i === 8 && <td className="col-out"></td>}
              </React.Fragment>
            ))}
            {tem18 && <td className="col-in"></td>}
            <td className="col-total"></td></tr>
          {manuel && (
            <tr className="bg-success-subtle"><td className="row-label fw-700">🇵🇹 Manuel</td>
              {manuel.scores.slice(0, 9).map((sc, i) => <td key={i}><span className={`sc-score ${scClass(sc, par[i])}`}>{sc}</span></td>)}
              {tem18 && <td className="col-out fw-700">{mOut}<span className={`sc-topar ${toParClass(mOut - parOut)}`}>{fmtToPar(mOut - parOut)}</span></td>}
              {manuel.scores.slice(9).map((sc, i) => <td key={i + 9}><span className={`sc-score ${scClass(sc, par[9 + i])}`}>{sc}</span></td>)}
              {tem18 && <td className="col-in fw-700">{mIn}<span className={`sc-topar ${toParClass(mIn - parIn)}`}>{fmtToPar(mIn - parIn)}</span></td>}
              <td className="col-total fw-700">{mTot}<span className={`sc-topar ${toParClass(mTot - parTotal)}`}>{fmtToPar(mTot - parTotal)}</span></td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

/** «📊 Dificuldade por buraco» de uma volta (`voltas` com uma) ou de todas (com
 *  o acumulado em `total`). `rotulo`: «R1 · 12 Jan», «Todas as rondas»… */
export function DificuldadePorBuraco({ voltas, total, rotulo, numVolta }: {
  voltas: Tournament[];
  /** O acumulado (entrada «Resumo»): com ele a linha-resumo é a do torneio todo. */
  total?: Tournament;
  rotulo?: string;
  /** Nº da volta, para «Média R2:» (provas de várias voltas). */
  numVolta?: number;
}) {
  const grupos = useMemo(() => dificuldadePorBuraco(voltas), [voltas]);
  if (!grupos.length) return null;
  const varios = grupos.length > 1;
  const pares = new Set(grupos.map((g) => soma(g.par)));
  const parTotal = pares.size === 1 ? soma(grupos[0].par) : null;
  const comCartao = soma(grupos.map((g) => g.comCartao));

  // Linha-resumo do campo (todos os tees).
  const nVoltas = voltas.length;
  const r = total ? resumoDoTotal(total) : resumoDaVolta(voltas[0]);
  const todos = total ? r.jogadores + r.outros : r.jogadores;
  const semCartao = !varios && comCartao < todos ? ` · ${comCartao} com scorecard` : "";
  const vsPar = (media: number, n: number) => (parTotal != null ? <> ({fmtToPar(Math.round(media - parTotal * n))})</> : null);
  const resumo = total ? (
    <>
      {r.jogadores} jogadores{nVoltas > 1 && <> (<RoundPill nR={nVoltas} />)</>}
      {r.outros > 0 ? ` + ${r.outros} sem todas as voltas` : ""}{parTotal != null ? ` · Par ${parTotal}` : ""}
      {r.media != null && <> · Média: {r.media.toFixed(1)}{vsPar(r.media, nVoltas)}</>}
      {r.lider && <> · Líder: {r.lider.nome} ({r.lider.total})</>}{semCartao}
    </>
  ) : (
    <>
      {r.jogadores} jogadores{parTotal != null ? ` · Par ${parTotal}` : ""}
      {r.media != null && <> · Média{numVolta ? ` R${numVolta}` : ""}: {r.media.toFixed(1)}{vsPar(r.media, 1)}</>}{semCartao}
    </>
  );

  // O cartão do Manuel — só numa volta (no conjunto das voltas não há um cartão),
  // e na tabela do tee que ele jogou.
  const manuel = !total && voltas.length === 1 ? findManuelNaProva(voltas[0].players) : undefined;
  const mc = cartaoCompleto(manuel);
  const chaveManuel = manuel && mc ? chaveDoCampo(manuel) : null;

  return (
    <div className="card">
      <SectionTitle as="div" icon="📊">Dificuldade por buraco{rotulo ? ` — ${rotulo}` : ""}</SectionTitle>
      <div className="muted fs-10 mb-8">{resumo}</div>
      {grupos.map((g) => (
        <div key={g.chave} className={varios ? "mb-8" : undefined}>
          {varios && (
            <div className="fs-11 fw-700 mb-4 inline-flex items-center gap-4">
              {/* Fontes sem nome de tee dão a distância como nome («5986 m», NextCaddy): aí o rótulo é só os metros. */}
              {g.tee && !/\d/.test(g.tee) && <TeeSwatch tee={g.tee} />}
              {g.tee && !/\d/.test(g.tee) ? g.tee : g.metros != null ? `${g.metros.toLocaleString("pt")} m` : g.tee || "Tee"}
              <span className="c-muted fw-400">· {g.comCartao} jogadores{g.tee && !/\d/.test(g.tee) && g.metros != null ? ` · ${g.metros.toLocaleString("pt")} m` : ""} · Par {soma(g.par)}</span>
            </div>
          )}
          <TabelaDoTee g={g} manuel={chaveManuel === g.chave ? mc : null} />
        </div>
      ))}
    </div>
  );
}

/** «🇵🇹 Análise Manuel — R{n}»: o cartão dele nessa volta, em números. */
export function AnaliseManuel({ volta, anterior, numVolta }: {
  volta: Tournament;
  /** A volta anterior (para o «vs R{n−1}»). */
  anterior?: Tournament;
  numVolta: number;
}) {
  const manuel = findManuelNaProva(volta.players);
  const c = cartaoCompleto(manuel);
  if (!c) return null;
  const { scores, par } = c;
  const prev = cartaoCompleto(anterior ? findManuelNaProva(anterior.players) : undefined);
  const nh = par.length;
  const parTotal = soma(par), gross = soma(scores);

  const holes = scores.map((sc, i) => ({ h: i + 1, par: par[i], gross: sc, diff: sc - par[i], prev: prev && prev.scores.length === nh ? prev.scores[i] : null }));
  const eagles = holes.filter((h) => h.diff <= -2), birdies = holes.filter((h) => h.diff === -1);
  const pars = holes.filter((h) => h.diff === 0), bogeys = holes.filter((h) => h.diff === 1);
  const doubles = holes.filter((h) => h.diff === 2), worse = holes.filter((h) => h.diff >= 3);
  const tipos = parTypeStats([{ scores, par }]);

  const vsPrev = holes[0]?.prev != null ? holes.map((h) => ({ ...h, delta: h.gross - (h.prev as number) })) : null;
  const worseVP = vsPrev?.filter((h) => h.delta > 0).sort((a, b) => b.delta - a.delta) ?? [];
  const betterVP = vsPrev?.filter((h) => h.delta < 0).sort((a, b) => a.delta - b.delta) ?? [];
  const feitos = volta.players.filter((p) => !p._wd && temCartao(numGross(p)));
  const fieldAvg = feitos.length ? soma(feitos.map((p) => numGross(p))) / feitos.length : null;
  const f9 = soma(scores.slice(0, 9)), b9 = soma(scores.slice(9));
  const parF9 = soma(par.slice(0, 9)), parB9 = soma(par.slice(9));

  return (
    <div className="card">
      <SectionTitle as="div" icon="🇵🇹">Análise Manuel — R{numVolta}</SectionTitle>
      <div className="muted fs-10 mb-8">
        Gross: {gross} ({fmtToPar(gross - parTotal)})
        {nh === 18 && <> · F9: {f9} {fmtSignParen(f9 - parF9)} · B9: {b9} {fmtSignParen(b9 - parB9)}</>}
        {fieldAvg != null && <> · Média field: {fieldAvg.toFixed(1)}</>}
      </div>
      <div className="grid-auto-fill mb-8 gap-6">
        {eagles.length > 0 && <div className="card-detail br p-4-8"><span className="fw-800 c-good">🦅 {eagles.length}</span><span className="fs-10 c-text-3"> {eagles.map((h) => "H" + h.h).join(", ")}</span></div>}
        <div className="card-detail br p-4-8"><span className="fw-800 c-good">🐦 {birdies.length}</span><span className="fs-10 c-text-3"> {birdies.map((h) => "H" + h.h).join(", ")}</span></div>
        <div className="card-detail br p-4-8"><span className="fw-800 c-text-2">⛳ {pars.length} pars</span></div>
        <div className="card-detail br p-4-8"><span className="fw-800 c-text-2">📦 {bogeys.length}</span><span className="fs-10 c-text-3"> {bogeys.map((h) => "H" + h.h).join(", ")}</span></div>
        {doubles.length > 0 && <div className="card-detail br p-4-8"><span className="fw-800 c-warn-dark">💥 {doubles.length} dbl</span><span className="fs-10 c-text-3"> {doubles.map((h) => "H" + h.h).join(", ")}</span></div>}
        {worse.length > 0 && <div className="card-detail br p-4-8"><span className="fw-800 c-warn-dark">🔥 {worse.length} triple+</span><span className="fs-10 c-text-3"> {worse.map((h) => "H" + h.h + "(+" + h.diff + ")").join(", ")}</span></div>}
      </div>
      <div className="muted fs-10 mb-4 fw-700">Performance por tipo de buraco</div>
      <div className="grid-auto-fill mb-8 gap-6">
        {tipos.map((d) => (
          <div key={d.par} className="card-detail br p-4-8">
            <div className="fw-700 fs-11">Par {d.par} ({d.holes})</div>
            <div className="fs-10">{d.scores.join(", ")} → <span className={d.vsPar < 0 ? "fw-700 c-good" : d.vsPar > 0 ? "fw-700 c-danger" : "fw-700"}>{fmtToPar(d.vsPar)}</span><span className="c-text-3"> (avg {fmtSign(d.avgVsPar, 2)})</span></div>
          </div>
        ))}
      </div>
      {vsPrev && prev && <>
        <div className="muted fs-10 mb-4 fw-700">vs R{numVolta - 1} (anterior: {soma(prev.scores)})</div>
        <div className="gap-12 flex-wrap d-flex">
          {worseVP.length > 0 && <div className="fs-10"><span className="fw-700 c-warn-dark">Pior (+{soma(worseVP.map((h) => h.delta))}):</span> {worseVP.map((h) => `H${h.h} ${h.prev}→${h.gross}`).join(", ")}</div>}
          {betterVP.length > 0 && <div className="fs-10"><span className="fw-700 c-good">Melhor ({soma(betterVP.map((h) => h.delta))}):</span> {betterVP.map((h) => `H${h.h} ${h.prev}→${h.gross}`).join(", ")}</div>}
        </div>
      </>}
    </div>
  );
}
