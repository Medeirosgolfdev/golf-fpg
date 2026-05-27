/*
 * Componentes visuais reutilizáveis pelos templates V*:
 * - SC, SCL, SCQ, SCO, SCA: variantes de score circle/square por hole
 * - TpBadge: pill colorida de to-par (+4 / -1 / E)
 * - Grid2: layout 2×9 dos hole scores
 * - StatsRow: pills de breakdown (HIO, Eagles, Bir, Par, Bog, Dbl, Tri+)
 */
import React from "react";
import { II } from "./shared";
import { HIO_GREEN, scBg } from "./shared";
import type { DD, StT } from "./types";

/* ═══════ SC: score circle/square padrão ═══════ */
export function SC({ sc, par, sz = 32 }: { sc: number; par: number; sz?: number }) {
  const d = sc - par;
  const fs = Math.round(sz * 0.52);
  const base: React.CSSProperties = {
    width: sz, height: sz, display: "flex", alignItems: "center", justifyContent: "center",
    fontWeight: 900, fontSize: fs, lineHeight: 1, flexShrink: 0,
  };
  const bg = scBg(d, sc);
  if (!bg) return <div style={{ ...base, color: "inherit", textShadow: "0 1px 2px rgba(0,0,0,.3)" }}>{sc}</div>;
  return <div style={{ ...base, background: bg, color: "#fff", borderRadius: d <= -1 ? "50%" : 0 }}>{sc}</div>;
}

/* ═══════ SCL: light bg variant ═══════ */
/** par usa `inherit` para ficar legível em qualquer tema (claro ou escuro) do container */
export function SCL({ sc, par, sz = 28 }: { sc: number; par: number; sz?: number }) {
  const d = sc - par;
  const fs = Math.round(sz * 0.52);
  const base: React.CSSProperties = {
    width: sz, height: sz, display: "flex", alignItems: "center", justifyContent: "center",
    fontWeight: 900, fontSize: fs, lineHeight: 1, flexShrink: 0,
  };
  const bg = scBg(d, sc);
  if (!bg) return <div style={{ ...base, color: "inherit" }}>{sc}</div>;
  return <div style={{ ...base, background: bg, color: "#fff", borderRadius: d <= -1 ? "50%" : 0 }}>{sc}</div>;
}

/* ═══════ SCQ: 18Birdies style — over-par = border only ═══════ */
export function SCQ({ sc, par, sz = 24 }: { sc: number; par: number; sz?: number }) {
  const d = sc - par;
  const fs = Math.round(sz * 0.5);
  const base: React.CSSProperties = {
    width: sz, height: sz, display: "flex", alignItems: "center", justifyContent: "center",
    fontWeight: 900, fontSize: fs, lineHeight: 1, flexShrink: 0,
  };
  if (sc === 1) return <div style={{ ...base, background: HIO_GREEN, color: "#fff", borderRadius: "50%" }}>{sc}</div>;
  if (d <= -2) return <div style={{ ...base, background: "#d4a017", color: "#fff", borderRadius: "50%" }}>{sc}</div>;
  if (d === -1) return <div style={{ ...base, background: "#dc2626", color: "#fff", borderRadius: "50%" }}>{sc}</div>;
  if (d === 0)  return <div style={{ ...base, color: "inherit" }}>{sc}</div>;
  return <div style={{ ...base, border: "1.5px solid rgba(255,255,255,0.45)", color: "inherit" }}>{sc}</div>;
}

/* ═══════ SCO: outline-only (todos brancos), para overlays transparentes ═══════ */
/** HIO = green circle, Birdies/eagles = white circle outline, bogeys+ = white square outline, par = plain number */
export function SCO({ sc, par, sz = 36 }: { sc: number; par: number; sz?: number }) {
  const d = sc - par;
  const fs = Math.round(sz * 0.52);
  const base: React.CSSProperties = {
    width: sz, height: sz, display: "flex", alignItems: "center", justifyContent: "center",
    fontWeight: 900, fontSize: fs, lineHeight: 1, flexShrink: 0, color: "#fff",
  };
  if (sc === 1) return <div style={{ ...base, background: HIO_GREEN, borderRadius: "50%" }}>{sc}</div>;
  if (d <= -2) return <div style={{ ...base, border: "2.5px solid #fff", borderRadius: "50%" }}>{sc}</div>;
  if (d === -1) return <div style={{ ...base, border: "2px solid #fff", borderRadius: "50%" }}>{sc}</div>;
  if (d === 0)  return <div style={base}>{sc}</div>;
  if (d === 1)  return <div style={{ ...base, border: "2px solid rgba(255,255,255,.6)" }}>{sc}</div>;
  return <div style={{ ...base, border: "2.5px solid rgba(255,255,255,.6)" }}>{sc}</div>;
}

/* ═══════ SCA: outline accent color (PGA Tour U) ═══════ */
/** Score circle com contorno accent — birdies com circle colorido, bogeys com square */
export function SCA({ sc, par, sz = 36, accent = "#e87722" }: { sc: number; par: number; sz?: number; accent?: string }) {
  const d = sc - par;
  const fs = Math.round(sz * 0.5);
  const base: React.CSSProperties = {
    width: sz, height: sz, display: "flex", alignItems: "center", justifyContent: "center",
    fontWeight: 900, fontSize: fs, lineHeight: 1, flexShrink: 0,
  };
  if (d <= -2) return <div style={{ ...base, border: `2.5px solid ${accent}`, borderRadius: "50%", color: "inherit" }}>{sc}</div>;
  if (d === -1) return <div style={{ ...base, border: `2px solid ${accent}`, borderRadius: "50%", color: "inherit" }}>{sc}</div>;
  if (d === 0)  return <div style={{ ...base, color: "inherit" }}>{sc}</div>;
  if (d === 1)  return <div style={{ ...base, background: "rgba(255,255,255,.12)", color: "inherit" }}>{sc}</div>;
  return <div style={{ ...base, background: "rgba(255,255,255,.15)", border: "1px solid rgba(255,255,255,.25)", color: "inherit" }}>{sc}</div>;
}

/* ═══════ TpBadge: pill colorida de to-par ═══════ */
/** To-par badge — pill colorida como nos posts do PGA Tour. */
export function TpBadge({ vp, sz = 22 }: { vp: number; sz?: number }) {
  const bg = vp < 0 ? "#dc2626" : vp > 0 ? "#2563eb" : "#666";
  const txt = vp < 0 ? String(vp) : vp > 0 ? `+${vp}` : "E";
  return (
    <div style={{
      background: bg, color: "#fff", fontFamily: II, fontSize: sz, fontWeight: 900,
      padding: `${Math.round(sz * 0.22)}px ${Math.round(sz * 0.55)}px`, borderRadius: 4,
      display: "inline-flex", alignItems: "center", justifyContent: "center", lineHeight: 1,
    }}>{txt}</div>
  );
}

/* ═══════ Grid2: 2-row 9+9 grid de scores ═══════ */
export function Grid2({ d, sz = 24, gap = 2, nc = "#555" }: { d: DD; sz?: number; gap?: number; nc?: string }) {
  const is18 = d.scores.length >= 18;
  const slices = is18 ? [{ off: 0, len: 9 }, { off: 9, len: 9 }] : [{ off: 0, len: d.scores.length }];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap }}>
      {slices.map(({ off, len }) => (
        <div key={off} style={{ display: "flex", gap }}>
          {d.scores.slice(off, off + len).map((sc, i) => (
            <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 1 }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: nc, width: sz, textAlign: "center" }}>{off + i + 1}</div>
              <SC sc={sc} par={d.par[off + i]} sz={sz} />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

/* ═══════ StatsRow: pills de breakdown (HIO/Eagle/Bir/Par/Bog/Dbl/Tri+) ═══════ */
export function StatsRow({ st, tc3, gap = 8, fs = 11 }: { st: StT; tc3?: string; gap?: number; fs?: number }) {
  const items = [
    { n: st.hio,     l: "HIO", c: HIO_GREEN  },
    { n: st.eagles,  l: "🦅",  c: "#d4a017" },
    { n: st.birdies, l: "Bir", c: "#dc2626"  },
    { n: st.pars,    l: "Par", c: tc3        },
    { n: st.bogeys,  l: "Bog", c: "#5BADE6"  },
    { n: st.doubles, l: "Dbl", c: "#2B6EA0"  },
    { n: st.triples, l: "Tri+",c: "#1B4570"  },
  ].filter(x => x.n > 0);
  if (!items.length) return null;
  return (
    <div style={{ display: "flex", alignItems: "center", gap, flexWrap: "wrap" }}>
      {items.map(x => (
        <div key={x.l} style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: fs, fontWeight: 700 }}>
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: x.c, display: "inline-block", flexShrink: 0 }} />
          <span style={{ color: x.c }}>{x.n} {x.l}</span>
        </div>
      ))}
    </div>
  );
}
