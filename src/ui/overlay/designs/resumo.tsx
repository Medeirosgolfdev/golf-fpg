/*
 * Designs RESUMO DO TORNEIO — todas as voltas de um jogador (d.rounds):
 * V50 Resumo do Torneio · V51 Voltas lado a lado (buraco a buraco, com a
 * diferença entre as duas últimas) · V52 Evolução (de volta para volta) ·
 * V53 Cartão do Torneio · V54 Posição · V55 Barras · V57 Stats por Volta ·
 * V58 Faixa.
 * Só aparecem quando o painel escolhe «Torneio» (d.rounds com 2+ voltas).
 */
import type React from "react";
import { II, OS, BN, countHoles, vpC, ink, panel, fillA } from "../shared";
import { SC, TpBadge, StatsRow, Info } from "../badges";
import { fmtToPar } from "../../../utils/format";
import type { P, RoundSum } from "../types";

const tot = (rs: RoundSum[]) => rs.reduce((a, r) => a + r.gross, 0);
const totPar = (rs: RoundSum[]) => rs.reduce((a, r) => a + r.toPar, 0);
/** Breakdown de todas as voltas juntas. */
const allStats = (rs: RoundSum[]) => countHoles(rs.flatMap((r) => r.scores), rs.flatMap((r) => r.par));
/** Cor da diferença de pancadas: menos = verde, mais = vermelho. */
const dCol = (d: number) => (d < 0 ? "#22c55e" : d > 0 ? "#f87171" : "inherit");
const fmtD = (d: number) => (d > 0 ? `+${d}` : d < 0 ? `${d}` : "=");

/* V50 · RESUMO DO TORNEIO — total, posição e cada volta numa linha. */
export function V50({ d, v, bg, tc = "white", ta = tc, tc3, fa }: P) {
  const rs = d.rounds ?? [];
  if (rs.length < 2) return null;
  /* «Evolução» desligada: sem realce da melhor volta — só os scores. */
  const best = v.evolution ? Math.min(...rs.map((r) => r.gross)) : -1;
  return (
    <div style={{ fontFamily: II, display: "inline-block", color: tc, background: bg ?? undefined, borderRadius: 10, padding: "8px 12px", minWidth: 220 }}>
      {v.player && d.player && <div style={{ fontFamily: OS, fontSize: 22, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", lineHeight: 1.1 }}>{d.player}</div>}
      <Info d={d} v={v} keys={["event", "course", "tee", "teeDist"]} tc={tc} tc3={tc3} fs={10} upper fit mt={2} />
      <div style={{ display: "flex", alignItems: "flex-end", gap: 10, margin: "6px 0 4px" }}>
        <div style={{ fontFamily: BN, fontSize: 70, lineHeight: .9, letterSpacing: -2 }}>{tot(rs)}</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4, paddingBottom: 4 }}>
          <TpBadge vp={totPar(rs)} sz={18} />
          {v.position && d.position && <div style={{ fontFamily: OS, fontSize: 16, fontWeight: 700, letterSpacing: 1 }}>{d.position}</div>}
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
        {rs.map((r) => (
          <div key={r.round} style={{ display: "flex", alignItems: "baseline", gap: 10, padding: "3px 8px", borderRadius: 6,
            background: r.gross === best ? ink(tc, (fa ?? .88) * .14) : undefined, borderLeft: `3px solid ${r.gross === best ? ta : "transparent"}` }}>
            <span style={{ fontFamily: OS, fontSize: 13, fontWeight: 700, color: tc3, width: 22 }}>R{r.round}</span>
            <span style={{ fontFamily: BN, fontSize: 26, lineHeight: 1, width: 34 }}>{r.gross}</span>
            <span style={{ fontSize: 13, fontWeight: 800, color: vpC(r.toPar, tc), width: 34 }}>{fmtToPar(r.toPar)}</span>
            {v.date && r.date && <span style={{ fontSize: 10, color: tc3, whiteSpace: "nowrap" }}>{r.date}</span>}
            {r.gross === best && <span style={{ fontSize: 11, color: ta }}>★</span>}
          </div>
        ))}
      </div>
      {v.stats && <div style={{ marginTop: 6 }}><StatsRow st={allStats(rs)} tc3={tc3} gap={6} fs={10} /></div>}
    </div>
  );
}

/* V51 · VOLTAS LADO A LADO — buraco a buraco, uma linha por volta; com 2+
   voltas, a linha Δ mostra a diferença da última para a anterior. */
export function V51({ d, v, bg, tc = "white", ta = tc, tc3, fa }: P) {
  const rs = d.rounds ?? [];
  if (rs.length < 2) return null;
  const nh = rs[0].scores.length;
  const nines = nh >= 18 ? [[0, 9], [9, 9]] : [[0, nh]];
  const a = rs[rs.length - 2], b = rs[rs.length - 1];
  const SZ = 26, W = 28, LW = 26;
  const sub = (r: RoundSum, off: number, len: number) => r.scores.slice(off, off + len).reduce((x, y) => x + y, 0);
  return (
    <div style={{ fontFamily: II, display: "inline-block", color: tc, background: bg ?? undefined, borderRadius: 10, padding: "8px 10px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 10, marginBottom: 6 }}>
        <div>
          {v.player && d.player && <div style={{ fontFamily: OS, fontSize: 18, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", lineHeight: 1.1 }}>{d.player}</div>}
          <Info d={d} v={v} keys={["event"]} tc={tc} tc3={tc3} fs={9} upper />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
          <span style={{ fontFamily: BN, fontSize: 40, lineHeight: .9 }}>{tot(rs)}</span>
          <TpBadge vp={totPar(rs)} sz={14} />
          {v.position && d.position && <span style={{ fontFamily: OS, fontSize: 14, fontWeight: 700 }}>{d.position}</span>}
        </div>
      </div>
      {v.holeScores && nines.map(([off, len]) => (
        <div key={off} style={{ marginBottom: 6, background: panel(tc, (fa ?? .88) * .25), borderRadius: 6, padding: "3px 4px" }}>
          <div style={{ display: "flex", gap: 2, fontSize: 9, fontWeight: 700, color: tc3 }}>
            <span style={{ width: LW }} />
            {Array.from({ length: len }, (_, i) => <span key={i} style={{ width: W, textAlign: "center" }}>{off + i + 1}</span>)}
            <span style={{ width: 30, textAlign: "center" }}>{off === 0 && nh >= 18 ? "Out" : nh >= 18 ? "In" : "Tot"}</span>
          </div>
          {rs.map((r) => (
            <div key={r.round} style={{ display: "flex", gap: 2, alignItems: "center", marginTop: 2 }}>
              <span style={{ width: LW, fontFamily: OS, fontSize: 11, fontWeight: 700, color: ta }}>R{r.round}</span>
              {r.scores.slice(off, off + len).map((sc, i) => (
                <span key={i} style={{ width: W, display: "flex", justifyContent: "center" }}><SC sc={sc} par={r.par[off + i]} h={off + i} sz={SZ} /></span>
              ))}
              <span style={{ width: 30, textAlign: "center", fontFamily: BN, fontSize: 20 }}>{sub(r, off, len)}</span>
            </div>
          ))}
          {v.evolution && <div style={{ display: "flex", gap: 2, alignItems: "center", marginTop: 2, fontSize: 11, fontWeight: 800 }}>
            <span style={{ width: LW, fontFamily: OS, color: tc3 }}>Δ</span>
            {Array.from({ length: len }, (_, i) => {
              const dd = b.scores[off + i] - a.scores[off + i];
              return <span key={i} style={{ width: W, textAlign: "center", color: dd ? dCol(dd) : tc3, opacity: dd ? 1 : .5 }}>{dd ? fmtD(dd) : "·"}</span>;
            })}
            {(() => { const dd = sub(b, off, len) - sub(a, off, len); return <span style={{ width: 30, textAlign: "center", color: dCol(dd) }}>{fmtD(dd)}</span>; })()}
          </div>}
        </div>
      ))}
      <div style={{ fontSize: 10, fontWeight: 700, color: tc3 }}>
        {rs.map((r) => `R${r.round} ${r.gross}`).join(" · ")}
        {v.evolution && <>{" · "}<span style={{ color: dCol(b.gross - a.gross) }}>R{b.round} vs R{a.round}: {fmtD(b.gross - a.gross)}</span></>}
      </div>
      <Info d={d} v={v} keys={["course", "tee", "teeDist", "date"]} tc={tc} tc3={tc3} fs={10} fit mt={3} />
    </div>
  );
}

/* V52 · EVOLUÇÃO — «85 → 80», a melhoria em pancadas, total e posição. */
export function V52({ d, v, bg, tc = "white", ta = tc, tc3 }: P) {
  const rs = d.rounds ?? [];
  if (rs.length < 2) return null;
  const a = rs[0], b = rs[rs.length - 1];
  const diff = b.gross - a.gross;
  const msg = diff < 0 ? `${-diff} pancada${diff === -1 ? "" : "s"} melhor` : diff > 0 ? `${diff} pancada${diff === 1 ? "" : "s"} acima` : "igual";
  return (
    <div style={{ fontFamily: II, display: "inline-block", color: tc, background: bg ?? undefined, borderRadius: 10, padding: "8px 14px", textAlign: "center" }}>
      {v.player && d.player && <div style={{ fontFamily: OS, fontSize: 18, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase", whiteSpace: "nowrap" }}>{d.player}</div>}
      <Info d={d} v={v} keys={["event"]} tc={tc} tc3={tc3} fs={9} upper align="center" fit />
      {/* Alinhados pela base: os «R1/R2» ficam na mesma linha */}
      {/* Com «Evolução»: setas, a última volta maior e «x pancadas melhor».
         Sem ela: só os scores de cada dia, todos iguais. */}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "center", gap: v.evolution ? 8 : 14, marginTop: 6 }}>
        {rs.map((r, i) => {
          const big = v.evolution && i === rs.length - 1;
          return (
            <span key={r.round} style={{ display: "inline-flex", alignItems: "flex-end", gap: 8 }}>
              {v.evolution && i > 0 && <span style={{ fontSize: 22, color: ta, paddingBottom: 22 }}>→</span>}
              <span style={{ display: "inline-flex", flexDirection: "column", alignItems: "center" }}>
                <span style={{ fontFamily: BN, fontSize: big ? 64 : v.evolution ? 44 : 52, lineHeight: .9, opacity: !v.evolution || big ? 1 : .75 }}>{r.gross}</span>
                <span style={{ fontFamily: OS, fontSize: 11, fontWeight: 700, color: tc3 }}>R{r.round}</span>
              </span>
            </span>
          );
        })}
      </div>
      {v.evolution && <div style={{ fontFamily: OS, fontSize: 16, fontWeight: 700, letterSpacing: 1, color: dCol(diff), marginTop: 4, textTransform: "uppercase" }}>{msg}</div>}
      <div style={{ fontSize: 12, fontWeight: 800, marginTop: 4 }}>
        Total {tot(rs)} <span style={{ color: tc3 }}>({fmtToPar(totPar(rs))})</span>
      </div>
      <Info d={d} v={v} keys={["position", "course", "tee", "teeDist", "date"]} tc={tc} tc3={tc3} fs={10} align="center" fit mt={2} />
    </div>
  );
}

/** «9º de 42» → { pos: "9º", of: "42" }. */
const splitPos = (s: string) => {
  const m = /^(\d+º)(?:\s+de\s+(\d+))?/.exec(s || "");
  return m ? { pos: m[1], of: m[2] ?? "" } : null;
};
const subSum = (r: RoundSum, a: number, b: number) => r.scores.slice(a, b).reduce((x, y) => x + y, 0);

/* V53 · CARTÃO DO TORNEIO — tabela clara (como o B&W Card): uma linha por
   volta com Out / In / Total / ±, e a linha do total. Fundo sempre o dele. */
export function V53({ d, v, fa }: P) {
  const rs = d.rounds ?? [];
  if (rs.length < 2) return null;
  const nh = rs[0].scores.length, is18 = nh >= 18;
  const best = v.evolution ? Math.min(...rs.map((r) => r.gross)) : -1;
  const bdr = "1px solid #e5e7eb";
  const cell = (w: number, extra: React.CSSProperties = {}): React.CSSProperties => ({ width: w, textAlign: "center", padding: "3px 0", ...extra });
  return (
    <div style={{ fontFamily: II, display: "inline-block", background: fillA("#ffffff", fa), color: "#111", borderRadius: 8, overflow: "hidden", minWidth: 230 }}>
      <div style={{ background: fillA("#1a2744", fa), padding: "5px 9px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {v.player && d.player && <div style={{ fontFamily: OS, fontSize: 16, fontWeight: 700, color: "#fff", textTransform: "uppercase" }}>{d.player}</div>}
          <Info d={d} v={v} keys={["event"]} tc="#ffffff" tc3="#cbd5e1" fs={10} fit />
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{ fontFamily: OS, fontSize: 28, fontWeight: 700, color: "#fff", lineHeight: 1 }}>{tot(rs)}</div>
          <div style={{ fontSize: 14, fontWeight: 900, color: vpC(totPar(rs)) }}>{fmtToPar(totPar(rs))}</div>
        </div>
      </div>
      <div style={{ display: "flex", background: fillA("#f1f5f9", fa), borderBottom: bdr, fontSize: 10, fontWeight: 800, color: "#475569" }}>
        <div style={cell(40)}>Volta</div>
        {is18 && <><div style={cell(40)}>Out</div><div style={cell(40)}>In</div></>}
        <div style={cell(48)}>Total</div>
        <div style={cell(40)}>±</div>
        {v.date && <div style={{ ...cell(86), textAlign: "left", paddingLeft: 6 }}>Data</div>}
      </div>
      {rs.map((r) => (
        <div key={r.round} style={{ display: "flex", alignItems: "center", borderBottom: bdr, background: r.gross === best ? fillA("#fef3c7", fa) : undefined }}>
          <div style={cell(40, { fontFamily: OS, fontSize: 13, fontWeight: 700, color: "#475569" })}>R{r.round}</div>
          {is18 && <><div style={cell(40, { fontSize: 13, fontWeight: 600 })}>{subSum(r, 0, 9)}</div><div style={cell(40, { fontSize: 13, fontWeight: 600 })}>{subSum(r, 9, 18)}</div></>}
          <div style={cell(48, { fontFamily: OS, fontSize: 18, fontWeight: 700 })}>{r.gross}</div>
          <div style={cell(40, { fontSize: 12, fontWeight: 800, color: vpC(r.toPar, "#111111") })}>{fmtToPar(r.toPar)}</div>
          {v.date && <div style={{ ...cell(86), textAlign: "left", paddingLeft: 6, fontSize: 10, color: "#6b7280", whiteSpace: "nowrap" }}>{r.date}{r.gross === best ? " ★" : ""}</div>}
        </div>
      ))}
      <div style={{ display: "flex", alignItems: "center", background: fillA("#f8fafc", fa), fontWeight: 900 }}>
        <div style={cell(40, { fontSize: 11 })}>Tot</div>
        {is18 && <><div style={cell(40, { fontSize: 13 })}>{rs.reduce((a, r) => a + subSum(r, 0, 9), 0)}</div><div style={cell(40, { fontSize: 13 })}>{rs.reduce((a, r) => a + subSum(r, 9, 18), 0)}</div></>}
        <div style={cell(48, { fontFamily: OS, fontSize: 18 })}>{tot(rs)}</div>
        <div style={cell(40, { fontSize: 12, color: vpC(totPar(rs), "#111111") })}>{fmtToPar(totPar(rs))}</div>
      </div>
      <div style={{ padding: "4px 9px 6px", borderTop: bdr }}>
        <Info d={d} v={v} keys={["position", "course", "tee", "teeDist"]} tc="#111111" tc3="#6b7280" fs={10} fit />
        {v.stats && <div style={{ marginTop: 3 }}><StatsRow st={allStats(rs)} tc3="#64748b" gap={5} fs={10} /></div>}
      </div>
    </div>
  );
}

/* V54 · POSIÇÃO — a classificação em grande («9º de 42»), o total e as voltas. */
export function V54({ d, v, bg, tc = "white", ta = tc, tc3 }: P) {
  const rs = d.rounds ?? [];
  if (rs.length < 2) return null;
  const sp = v.position ? splitPos(d.position) : null;
  return (
    <div style={{ fontFamily: II, display: "inline-block", color: tc, background: bg ?? undefined, borderRadius: 10, padding: "8px 14px", textAlign: "center" }}>
      {v.player && d.player && <div style={{ fontFamily: OS, fontSize: 18, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase", whiteSpace: "nowrap" }}>{d.player}</div>}
      <Info d={d} v={v} keys={["event"]} tc={tc} tc3={tc3} fs={10} upper align="center" fit />
      {sp ? (
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "center", gap: 6, marginTop: 4 }}>
          <span style={{ fontFamily: BN, fontSize: 92, lineHeight: .85, color: ta }}>{sp.pos}</span>
          {sp.of && <span style={{ fontFamily: OS, fontSize: 18, fontWeight: 700, color: tc3 }}>de {sp.of}</span>}
        </div>
      ) : null}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginTop: sp ? 2 : 6 }}>
        <span style={{ fontFamily: BN, fontSize: sp ? 34 : 80, lineHeight: .9 }}>{tot(rs)}</span>
        <TpBadge vp={totPar(rs)} sz={sp ? 14 : 20} />
      </div>
      <div style={{ display: "flex", justifyContent: "center", gap: 6, marginTop: 6 }}>
        {rs.map((r, i) => (
          <span key={r.round} style={{ background: ink(tc, .1), borderRadius: 6, padding: "3px 8px", display: "inline-flex", flexDirection: "column", alignItems: "center", minWidth: 40 }}>
            <span style={{ fontFamily: OS, fontSize: 10, fontWeight: 700, color: tc3 }}>R{r.round}</span>
            <span style={{ fontFamily: BN, fontSize: 24, lineHeight: 1 }}>{r.gross}</span>
            {/* «Evolução»: diferença para a volta anterior */}
            {v.evolution && i > 0 && <span style={{ fontSize: 10, fontWeight: 800, color: dCol(r.gross - rs[i - 1].gross) }}>{fmtD(r.gross - rs[i - 1].gross)}</span>}
          </span>
        ))}
      </div>
      <Info d={d} v={v} keys={["course", "tee", "teeDist", "date"]} tc={tc} tc3={tc3} fs={10} align="center" fit mt={6} />
    </div>
  );
}

/* V55 · BARRAS — uma barra por volta, do tamanho do resultado acima do par. */
export function V55({ d, v, bg, tc = "white", ta = tc, tc3 }: P) {
  const rs = d.rounds ?? [];
  if (rs.length < 2) return null;
  const lo = Math.min(0, ...rs.map((r) => r.toPar)), hi = Math.max(1, ...rs.map((r) => r.toPar));
  const best = v.evolution ? Math.min(...rs.map((r) => r.gross)) : -1;
  const W = 120;
  return (
    <div style={{ fontFamily: II, display: "inline-block", color: tc, background: bg ?? undefined, borderRadius: 10, padding: "8px 12px", minWidth: 230 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {v.player && d.player && <div style={{ fontFamily: OS, fontSize: 17, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", lineHeight: 1.1 }}>{d.player}</div>}
          <Info d={d} v={v} keys={["event"]} tc={tc} tc3={tc3} fs={9} upper fit />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 5, flexShrink: 0 }}>
          <span style={{ fontFamily: BN, fontSize: 40, lineHeight: .9 }}>{tot(rs)}</span>
          <TpBadge vp={totPar(rs)} sz={13} />
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 8 }}>
        {rs.map((r) => {
          const w = 24 + (W - 24) * (r.toPar - lo) / (hi - lo || 1);
          return (
            <div key={r.round} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontFamily: OS, fontSize: 12, fontWeight: 700, color: tc3, width: 22 }}>R{r.round}</span>
              <span style={{ width: W, display: "flex" }}>
                <span style={{ width: w, height: 18, borderRadius: 4, background: r.toPar < 0 ? "rgba(220,38,38,.75)" : (r.gross === best ? ta : ink(tc, .25)) }} />
              </span>
              <span style={{ fontFamily: BN, fontSize: 22, lineHeight: 1, width: 30 }}>{r.gross}</span>
              <span style={{ fontSize: 12, fontWeight: 800, color: vpC(r.toPar, tc), width: 30 }}>{fmtToPar(r.toPar)}</span>
            </div>
          );
        })}
      </div>
      <Info d={d} v={v} keys={["position", "course", "tee", "teeDist", "date"]} tc={tc} tc3={tc3} fs={10} fit st={v.stats ? allStats(rs) : null} mt={6} />
    </div>
  );
}

/* V57 · STATS POR VOLTA — birdies, pares, bogeys e duplos+ de cada volta. */
export function V57({ d, v, bg, tc = "white", ta = tc, tc3 }: P) {
  const rs = d.rounds ?? [];
  if (rs.length < 2) return null;
  const cols = [
    { k: "bir", l: "Bir", c: "#ef4444", n: (x: ReturnType<typeof countHoles>) => x.hio + x.eagles + x.birdies },
    { k: "par", l: "Par", c: undefined, n: (x: ReturnType<typeof countHoles>) => x.pars },
    { k: "bog", l: "Bog", c: "#5BADE6", n: (x: ReturnType<typeof countHoles>) => x.bogeys },
    { k: "dbl", l: "Dbl+", c: "#2B6EA0", n: (x: ReturnType<typeof countHoles>) => x.doubles + x.triples + x.quads },
  ];
  const per = rs.map((r) => ({ r, st: countHoles(r.scores, r.par) }));
  const all = allStats(rs);
  const C = 38;
  return (
    <div style={{ fontFamily: II, display: "inline-block", color: tc, background: bg ?? undefined, borderRadius: 10, padding: "8px 12px" }}>
      {v.player && d.player && <div style={{ fontFamily: OS, fontSize: 17, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase" }}>{d.player}</div>}
      <Info d={d} v={v} keys={["event"]} tc={tc} tc3={tc3} fs={9} upper fit />
      <div style={{ marginTop: 6 }}>
        <div style={{ display: "flex", fontSize: 10, fontWeight: 800, color: tc3, borderBottom: `2px solid ${ta}`, paddingBottom: 2 }}>
          <span style={{ width: 30 }} />
          {cols.map((c) => (
            <span key={c.k} style={{ width: C, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 3 }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: c.c ?? tc3 }} />{c.l}
            </span>
          ))}
          <span style={{ width: C, textAlign: "center" }}>Tot</span>
          {v.evolution && <span style={{ width: 30, textAlign: "center" }}>Δ</span>}
        </div>
        {per.map(({ r, st }, i) => (
          <div key={r.round} style={{ display: "flex", alignItems: "center", padding: "2px 0", borderBottom: `1px solid ${ink(tc, .08)}` }}>
            <span style={{ width: 30, fontFamily: OS, fontSize: 12, fontWeight: 700, color: tc3 }}>R{r.round}</span>
            {cols.map((c) => <span key={c.k} style={{ width: C, textAlign: "center", fontSize: 15, fontWeight: 800 }}>{c.n(st) || "·"}</span>)}
            <span style={{ width: C, textAlign: "center", fontFamily: BN, fontSize: 20 }}>{r.gross}</span>
            {v.evolution && <span style={{ width: 30, textAlign: "center", fontSize: 11, fontWeight: 800, color: i ? dCol(r.gross - rs[i - 1].gross) : tc3 }}>{i ? fmtD(r.gross - rs[i - 1].gross) : "·"}</span>}
          </div>
        ))}
        <div style={{ display: "flex", alignItems: "center", paddingTop: 2 }}>
          <span style={{ width: 30, fontSize: 10, fontWeight: 800, color: tc3 }}>Tot</span>
          {cols.map((c) => <span key={c.k} style={{ width: C, textAlign: "center", fontSize: 15, fontWeight: 900 }}>{c.n(all)}</span>)}
          <span style={{ width: C, textAlign: "center", fontFamily: BN, fontSize: 22 }}>{tot(rs)}</span>
        </div>
      </div>
      <Info d={d} v={v} keys={["position", "course", "tee", "teeDist", "date"]} tc={tc} tc3={tc3} fs={10} fit mt={5} />
    </div>
  );
}

/* V58 · FAIXA — compacta: cada volta, o total e a posição numa tira. */
export function V58({ d, v, bg, tc = "white", ta = tc, tc3 }: P) {
  const rs = d.rounds ?? [];
  if (rs.length < 2) return null;
  const sp = v.position ? splitPos(d.position) : null;
  const sep = <span style={{ width: 2, alignSelf: "stretch", background: ta, opacity: .7, borderRadius: 1 }} />;
  return (
    <div style={{ fontFamily: II, display: "inline-block", color: tc, background: bg ?? undefined, borderRadius: 10, padding: "6px 10px" }}>
      {v.player && d.player && <div style={{ fontSize: 13, fontWeight: 800, whiteSpace: "nowrap" }}>{d.player}</div>}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 3 }}>
        {rs.map((r, i) => (
          <span key={r.round} style={{ display: "inline-flex", flexDirection: "column", alignItems: "center" }}>
            <span style={{ fontFamily: OS, fontSize: 9, fontWeight: 700, color: tc3 }}>R{r.round}</span>
            <span style={{ fontFamily: BN, fontSize: 24, lineHeight: 1 }}>{r.gross}</span>
            {v.evolution && <span style={{ fontSize: 9, fontWeight: 800, color: i ? dCol(r.gross - rs[i - 1].gross) : "transparent" }}>{i ? fmtD(r.gross - rs[i - 1].gross) : "·"}</span>}
          </span>
        ))}
        {sep}
        <span style={{ fontFamily: BN, fontSize: 36, lineHeight: .9 }}>{tot(rs)}</span>
        <TpBadge vp={totPar(rs)} sz={12} />
        {sp && <>{sep}<span style={{ display: "inline-flex", flexDirection: "column", alignItems: "center" }}>
          <span style={{ fontFamily: BN, fontSize: 26, lineHeight: 1 }}>{sp.pos}</span>
          {sp.of && <span style={{ fontSize: 9, fontWeight: 700, color: tc3, whiteSpace: "nowrap" }}>de {sp.of}</span>}
        </span></>}
      </div>
      <Info d={d} v={v} keys={["event", "course", "tee", "teeDist", "date"]} tc={tc} tc3={tc3} fs={9} fit mt={3} />
    </div>
  );
}
