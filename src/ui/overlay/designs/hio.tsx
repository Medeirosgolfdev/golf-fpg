/*
 * Designs HIO — Hole-in-One celebration.
 * V48 · ACE CELEBRATION
 */
import { II, OS, BN, HIO_GREEN, vpC } from "../shared";
import { fmtToPar } from "../../../utils/format";
import type { P } from "../types";

/* V48 · HOLE-IN-ONE CELEBRATION — design especial para HIO (score=1) */
export function V48({ d, v, s, bg, tc="white", tc2="#aaa", tc3="#888" }: P) {
  /* Detectar buracos com HIO */
  const hioHoles: { hole: number; par: number; meters: number | null }[] = [];
  d.scores.forEach((sc, i) => { if (sc === 1) hioHoles.push({ hole: i + 1, par: d.par[i], meters: d.meters?.[i] ?? null }); });
  /* Se não há HIO, mostrar fallback discreto */
  if (hioHoles.length === 0) {
    return (
      <div style={{ fontFamily: II, background: bg || "#111", color: tc, padding: 20, borderRadius: 10, textAlign: "center", minWidth: 280 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: tc3 }}>Sem Hole-in-One neste scorecard</div>
      </div>
    );
  }
  const hio = hioHoles[0]; // primeiro HIO (raramente haverá mais)
  return (
    <div style={{ fontFamily: II, background: bg || "#111", color: tc, padding: 0, borderRadius: 10, overflow: "hidden", minWidth: 320, maxWidth: 380, textAlign: "center" }}>
      {/* Top banner verde */}
      <div style={{ background: HIO_GREEN, padding: "14px 20px 10px", position: "relative" }}>
        <div style={{ fontFamily: OS, fontSize: 14, fontWeight: 700, letterSpacing: 3, textTransform: "uppercase", color: "rgba(255,255,255,.85)" }}>Hole-in-One</div>
        <div style={{ fontFamily: BN, fontSize: 72, lineHeight: .85, color: "#fff", marginTop: 2 }}>ACE!</div>
      </div>
      {/* Hole info */}
      <div style={{ padding: "18px 20px 14px", display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
        {/* Hole + Par + Distance */}
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: tc3, letterSpacing: 1.5, textTransform: "uppercase" }}>Buraco</div>
            <div style={{ fontFamily: BN, fontSize: 64, lineHeight: .85, color: HIO_GREEN }}>{hio.hole}</div>
          </div>
          <div style={{ width: 1, height: 50, background: "rgba(255,255,255,.15)" }} />
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: tc3, letterSpacing: 1.5, textTransform: "uppercase" }}>Par</div>
            <div style={{ fontFamily: BN, fontSize: 64, lineHeight: .85, color: tc2 }}>{hio.par}</div>
          </div>
          {hio.meters != null && hio.meters > 0 && <>
            <div style={{ width: 1, height: 50, background: "rgba(255,255,255,.15)" }} />
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: tc3, letterSpacing: 1.5, textTransform: "uppercase" }}>Metros</div>
              <div style={{ fontFamily: BN, fontSize: 64, lineHeight: .85, color: tc2 }}>{hio.meters}</div>
            </div>
          </>}
        </div>
        {/* Player */}
        {v.player && d.player && (
          <div style={{ fontFamily: OS, fontSize: 22, fontWeight: 700, color: tc, letterSpacing: 1, marginTop: 4 }}>{d.player.toUpperCase()}</div>
        )}
        {/* Course + Event */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, marginTop: 2 }}>
          {v.course && d.course && <div style={{ fontSize: 13, fontWeight: 600, color: tc2 }}>{d.course}</div>}
          {v.event && d.event && <div style={{ fontSize: 12, fontWeight: 500, color: tc3 }}>{d.event}</div>}
          {v.date && d.date && <div style={{ fontSize: 11, fontWeight: 500, color: tc3 }}>{d.date}</div>}
        </div>
        {/* Score total discreto */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6, padding: "4px 12px", background: "rgba(255,255,255,.06)", borderRadius: 6 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: tc3 }}>Score Total</span>
          <span style={{ fontFamily: OS, fontSize: 18, fontWeight: 700, color: tc }}>{s.sT}</span>
          <span style={{ fontFamily: OS, fontSize: 14, fontWeight: 700, color: vpC(s.vpT) }}>{fmtToPar(s.vpT)}</span>
        </div>
      </div>
    </div>
  );
}
