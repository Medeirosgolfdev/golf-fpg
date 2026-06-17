import React from "react";
import type { EclecticEntry, HoleScores } from "../data/playerDataLoader";
import { sumArr } from "../utils/mathUtils";
import { getTeeHex, textOnColor, teeBorder } from "../utils/teeColors";
import { fmtSign, fmtToPar } from "../utils/format";
import { scClass, fmtStb, toParClass } from "../utils/scoreDisplay";
import { PillBadge } from "./PillBadge";
import ScoreCircle from "./ScoreCircle";
import { CourseLink } from "./jogadoresHelpers";

/** Props for ScorecardTable component */
export interface ScorecardTableProps {
  holes: HoleScores;
  courseName: string;
  date: string;
  tee: string;
  hi?: number | null;
  links?: Record<string, string> | null;
  pill?: string;
  eclecticEntry?: EclecticEntry | null;
  /** Sem cabeçalho (campo/data/tee/PAR-RESULTADO-SCORE) — para contextos que já
   *  mostram essas stats por cima, ex: modal da Vista federado. */
  bare?: boolean;
}

const linkLabels: Record<string, string> = {
  classificacao: "Classificação",
  classificacao_d1: "Classif. D1",
  classificacao_d2: "Classif. D2",
  leaderboard: "Leaderboard",
  scorecard: "Scorecard",
  resultados: "Resultados",
  fpg_scoring: "FPG Scoring",
  noticia_teetimes: "Notícia",
  link: "Ver torneio",
};

function EclecticRows({ gross, par, eclectic, holeCount, is9, frontEnd }: {
  gross: (number | null)[];
  par: (number | null)[];
  eclectic: EclecticEntry;
  holeCount: number;
  is9: boolean;
  frontEnd: number;
}) {
  const ecArr = eclectic.holes.slice(0, holeCount).map(h => h?.best ?? null);
  const parArr = eclectic.holes.slice(0, holeCount).map((h, i) => h?.par ?? par[i]);
  const ecBorder = { borderTop: "1px solid var(--border-light)" } as const;

  const sumEc = sumArr(ecArr, 0, holeCount);
  const sumGross = sumArr(gross, 0, holeCount);

  return (
    <>
      {/* Eclectic row */}
      <tr>
        <td className="row-label" style={ecBorder}>Eclético</td>
        {Array.from({ length: holeCount }, (_, h) => {
          const ev = ecArr[h];
          const cls = scClass(ev, parArr[h]);
          return (
            <React.Fragment key={h}>
              <td style={ecBorder}>
                {ev != null ? <span className={`sc-score ${cls}`}>{ev}</span> : ""}
              </td>
              {h === frontEnd - 1 && !is9 && (() => {
                const outEc = sumArr(ecArr, 0, frontEnd);
                const outP = sumArr(parArr, 0, frontEnd);
                const outTP = outEc - outP;
                const tpCls = toParClass(outTP);
                return (
                  <td className="col-out" style={{ fontWeight: 700, ...ecBorder }}>
                    {outEc}<span className={`sc-topar ${tpCls}`}>{fmtSign(outTP)}</span>
                  </td>
                );
              })()}
            </React.Fragment>
          );
        })}
        {(() => {
          const inEc = is9 ? sumEc : sumArr(ecArr, 9, holeCount);
          const inP = is9 ? sumArr(parArr, 0, holeCount) : sumArr(parArr, 9, holeCount);
          const inTP = inEc - inP;
          const inCls = toParClass(inTP);
          return (
            <td className={`col-${is9 ? "total" : "in"}`} style={{ fontWeight: 700, ...ecBorder }}>
              {inEc}<span className={`sc-topar ${inCls}`}>{fmtSign(inTP)}</span>
            </td>
          );
        })()}
        {!is9 && (() => {
          const ecTP = sumEc - sumArr(parArr, 0, holeCount);
          const totCls = toParClass(ecTP);
          return (
            <td className="col-total" style={ecBorder}>
              {sumEc}<span className={`sc-topar ${totCls}`}>{fmtSign(ecTP)}</span>
            </td>
          );
        })()}
      </tr>

      {/* Δ (delta) row */}
      <tr className="bg-detail">
        <td className="row-label">Δ</td>
        {Array.from({ length: holeCount }, (_, h) => {
          const gv = gross[h];
          const ev = ecArr[h];
          const diff = gv != null && gv > 0 && ev != null ? ev - gv : null;
          const dc = { color: "var(--text-3)" } as const;
          return (
            <React.Fragment key={h}>
              <td style={dc}>
                {diff != null ? (diff === 0 ? "=" : (diff > 0 ? "+" : "") + diff) : ""}
              </td>
              {h === frontEnd - 1 && !is9 && (() => {
                const dOut = sumArr(ecArr, 0, frontEnd) - sumArr(gross, 0, frontEnd);
                return (
                  <td className="col-out fw-600" style={{ color: "var(--text-3)" }}>
                    {dOut === 0 ? "=" : (dOut > 0 ? "+" : "") + dOut}
                  </td>
                );
              })()}
            </React.Fragment>
          );
        })}
        {(() => {
          const dIn = (is9 ? sumEc : sumArr(ecArr, 9, holeCount)) - (is9 ? sumGross : sumArr(gross, 9, holeCount));
          return (
            <td className={`col-${is9 ? "total" : "in"} fw-600`} style={{ color: "var(--text-3)" }}>
              {dIn === 0 ? "=" : (dIn > 0 ? "+" : "") + dIn}
            </td>
          );
        })()}
        {!is9 && (() => {
          const totalDiff = sumEc - sumGross;
          return (
            <td className="col-total" style={{ color: "var(--text-3)" }}>
              {fmtSign(totalDiff)}
            </td>
          );
        })()}
      </tr>
    </>
  );
}

export function ScorecardTable({ holes, courseName, date, tee, hi, links, pill, eclecticEntry, bare }: ScorecardTableProps) {
  const { g: gross, p: par, si, m: meters, hc: holeCount } = holes;
  const is9 = holeCount === 9;
  const frontEnd = is9 ? holeCount : 9;
  const totalHoles = Math.min(holeCount, gross.length);

  const teeHex_ = getTeeHex(tee || "");
  const teeFg_ = textOnColor(teeHex_);

  const parTotal = sumArr(par, 0, totalHoles);
  const grossTotal = sumArr(gross, 0, totalHoles);
  const metersTotal = meters ? sumArr(meters, 0, totalHoles) : 0;
  const toPar = grossTotal - parTotal;
  const toParStr = fmtSign(toPar);

  // Date pill label (DD/MM)
  const datePill = date ? date.substring(0, 5).replace("-", "/") : "Gross";

  // Links
  const linkEntries = links ? Object.entries(links).filter(([, v]) => typeof v === "string" && v.startsWith("http")) : [];

  return (
    <div className="sc-modern" style={{ "--tee-color": teeHex_, "--tee-fg": teeFg_ } as React.CSSProperties}>
      {/* Header (omitido em modo bare) */}
      {!bare && (
      <div className={`sc-header ${teeFg_ === "#fff" ? "c-white" : "sc-header-light"}`} style={{ background: teeHex_ }}>
        <div className="sc-header-left">
          <div className="sc-title"><CourseLink name={courseName} /></div>
          <div className="sc-subtitle">
            <span>{date}</span>
            <span>Tee {tee}</span>
            {hi != null && <span>HCP {hi}</span>}
            {metersTotal > 0 && <span>{metersTotal}m</span>}
            {pill && <PillBadge pill={pill} />}
          </div>
          {linkEntries.length > 0 && (
            <div className="sc-links">
              {linkEntries.map(([label, url]) => (
                <a key={label} href={url} target="_blank" rel="noopener noreferrer" className="sc-ext-link" title={linkLabels[label] || label}>
                  🔗 {linkLabels[label] || label}
                </a>
              ))}
            </div>
          )}
        </div>
        <div className="sc-header-right">
          <div className="sc-stat">
            <div className="sc-stat-label">PAR</div>
            <div className="sc-stat-value">{parTotal || "–"}</div>
          </div>
          <div className="v-sep" />
          <div className="sc-stat">
            <div className="sc-stat-label">RESULTADO</div>
            <div className="sc-stat-value">{grossTotal || "–"}</div>
          </div>
          <div className="v-sep" />
          <div className="sc-stat sc-stat-score">
            <div className="sc-stat-label">SCORE</div>
            <div className="sc-stat-value">{toParStr}</div>
          </div>
        </div>
      </div>
      )}

      {/* Table */}
      <table className="sc-table-modern sc-grid" data-sc-table="1">
        <thead>
          <tr>
            <th className="row-label sim-br-sep">Buraco</th>
            {Array.from({ length: totalHoles }, (_, h) => (
              <React.Fragment key={h}>
                <th className="hole-header">{h + 1}</th>
                {h === frontEnd - 1 && !is9 && <th className="hole-header col-out">Out</th>}
              </React.Fragment>
            ))}
            <th className={`hole-header col-${is9 ? "total" : "in"}`}>{is9 ? "TOTAL" : "In"}</th>
            {!is9 && <th className="hole-header col-total">TOTAL</th>}
          </tr>
        </thead>
        <tbody>
          {/* Metros row */}
          {meters && meters.some(v => v != null && v > 0) && (
            <tr className="meta-row">
              <td className="row-label">Metros</td>
              {Array.from({ length: totalHoles }, (_, h) => (
                <React.Fragment key={h}>
                  <td>{meters[h] != null && meters[h]! > 0 ? meters[h] : ""}</td>
                  {h === frontEnd - 1 && !is9 && (
                    <td className="col-out fw-600">{sumArr(meters, 0, frontEnd)}</td>
                  )}
                </React.Fragment>
              ))}
              <td className={`col-${is9 ? "total" : "in"} fw-600`}>
                {is9 ? sumArr(meters, 0, totalHoles) : sumArr(meters, 9, totalHoles)}
              </td>
              {!is9 && <td className="col-total c-muted">{metersTotal}</td>}
            </tr>
          )}

          {/* S.I. row */}
          {si && si.some(v => v != null && v > 0) && (
            <tr className="meta-row">
              <td className="row-label">SI</td>
              {Array.from({ length: totalHoles }, (_, h) => (
                <React.Fragment key={h}>
                  <td>{si[h] != null && si[h]! > 0 ? si[h] : ""}</td>
                  {h === frontEnd - 1 && !is9 && <td className="col-out" />}
                </React.Fragment>
              ))}
              <td className={`col-${is9 ? "total" : "in"}`} />
              {!is9 && <td className="col-total" />}
            </tr>
          )}

          {/* Par row */}
          <tr className="sep-row">
            <td className="row-label">Par</td>
            {Array.from({ length: totalHoles }, (_, h) => (
              <React.Fragment key={h}>
                <td>{par[h] != null && par[h]! > 0 ? par[h] : "–"}</td>
                {h === frontEnd - 1 && !is9 && (
                  <td className="col-out fw-700">{sumArr(par, 0, frontEnd)}</td>
                )}
              </React.Fragment>
            ))}
            <td className={`col-${is9 ? "total" : "in"} fw-700`}>
              {is9 ? parTotal : sumArr(par, 9, totalHoles)}
            </td>
            {!is9 && <td className="col-total">{parTotal || "–"}</td>}
          </tr>

          {/* Gross row */}
          <tr>
            <td className="row-label">
              <span className="p" style={{ background: teeHex_, color: teeFg_, border: teeBorder(teeHex_) }}>{datePill}</span>
            </td>
            {Array.from({ length: totalHoles }, (_, h) => {
              const g = gross[h];
              const p = par[h];
              const cls = scClass(g, p);
              return (
                <React.Fragment key={h}>
                  <td>
                    {g != null && g > 0
                      ? <span className={`sc-score ${cls}`}>{g}</span>
                      : "–"}
                  </td>
                  {h === frontEnd - 1 && !is9 && (() => {
                    const outG = sumArr(gross, 0, frontEnd);
                    const outP = sumArr(par, 0, frontEnd);
                    const outTP = outG - outP;
                    const tpCls = toParClass(outTP);
                    return (
                      <td className="col-out fw-700">
                        {outG}<span className={`sc-topar ${tpCls}`}>{fmtSign(outTP)}</span>
                      </td>
                    );
                  })()}
                </React.Fragment>
              );
            })}
            {(() => {
              const inG = is9 ? grossTotal : sumArr(gross, 9, totalHoles);
              const inP = is9 ? parTotal : sumArr(par, 9, totalHoles);
              const inTP = inG - inP;
              const inCls = toParClass(inTP);
              return (
                <td className={`col-${is9 ? "total" : "in"} fw-700`}>
                  {inG}<span className={`sc-topar ${inCls}`}>{fmtSign(inTP)}</span>
                </td>
              );
            })()}
            {!is9 && (() => {
              const totCls = toParClass(toPar);
              return (
                <td className="col-total">
                  {grossTotal}<span className={`sc-topar ${totCls}`}>{toParStr}</span>
                </td>
              );
            })()}
          </tr>

          {/* Eclectic + Delta rows */}
          {eclecticEntry && eclecticEntry.holes && eclecticEntry.holes.length >= totalHoles && (
            <EclecticRows
              gross={gross}
              par={par}
              eclectic={eclecticEntry}
              holeCount={totalHoles}
              is9={is9}
              frontEnd={frontEnd}
            />
          )}
        </tbody>
      </table>
    </div>
  );
}
