/*
 * Componentes visuais reutilizáveis pelos templates V*:
 * - SC, SCL, SCQ, SCO, SCA: variantes de score circle/square por hole
 * - TpBadge: pill colorida de to-par (+4 / -1 / E)
 * - Grid2: layout 2×9 dos hole scores
 * - StatsRow: pills de breakdown (HIO, Eagles, Bir, Par, Bog, Dbl, Tri, Quad+)
 */
import React from "react";
import { II } from "./shared";
import { HIO_GREEN, scBg } from "./shared";
import type { DD, StT } from "./types";

/* ═══════ Rings: contornos concêntricos (cartão de golfe) ═══════
 * Bogey = 1 quadrado, duplo = 2, triplo ou pior = 3; birdie = 1 círculo,
 * eagle = 2. Desenhados POR CIMA da célula (absolute), sem mudar o tamanho —
 * os números dos buracos continuam alinhados. `from` = 1º anel a desenhar
 * (nas células cheias o próprio quadrado já conta como o 1º). */
export function ringsFor(d: number): number {
  if (d >= 1) return Math.min(d, 3);
  if (d <= -2) return 2;
  if (d === -1) return 1;
  return 0;
}
/** Anéis encostados ao bordo (1 px entre eles) e o espaço livre do meio
 *  SEMPRE maior que o algarismo — por baixo do número cortavam o 9 (16/10/2026).
 *  Se não couberem, a letra encolhe até ~80% e só depois sai um anel.
 *  Devolve os anéis e o tamanho de letra a usar. */
function ringed(o: { sz: number; fs: number; d: number; from?: number; w: number; round: boolean; color: string }) {
  const { sz, w, round, color } = o;
  const from = o.from ?? 0;
  const step = w + 1;
  let n = ringsFor(o.d);
  let fs = o.fs;
  const free = (k: number) => sz - 2 * ((k - 1) * step + w);
  while (n > from && free(n) < fs * 0.8 + 3) {
    if (fs > o.fs * 0.8) fs = Math.round(fs * 0.9);
    else n--;
  }
  const node = (
    <>
      {Array.from({ length: Math.max(0, n - from) }, (_, k) => (
        <div key={k} style={{ position: "absolute", inset: (k + from) * step, border: `${w}px solid ${color}`,
          borderRadius: round ? "50%" : 0, pointerEvents: "none" }} />
      ))}
    </>
  );
  return { node, fs };
}

/* ═══════ SC: score circle/square padrão ═══════ */
export function SC({ sc, par, sz = 32 }: { sc: number; par: number; sz?: number }) {
  const d = sc - par;
  const fs = Math.round(sz * 0.52);
  const base: React.CSSProperties = {
    width: sz, height: sz, display: "flex", alignItems: "center", justifyContent: "center",
    fontWeight: 900, fontSize: fs, lineHeight: 1, flexShrink: 0,
  };
  const bg = scBg(d, sc);
  if (!bg) return <div style={{ ...base, color: "inherit" }}>{sc}</div>;
  const r = sc !== 1 ? ringed({ sz, fs, d, from: 1, w: 1, round: d <= -1, color: "rgba(255,255,255,.75)" }) : null;
  return (
    <div style={{ ...base, position: "relative", background: bg, color: "#fff", borderRadius: d <= -1 ? "50%" : 0, fontSize: r?.fs ?? fs }}>
      {r?.node}{sc}
    </div>
  );
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
  const r = sc !== 1 ? ringed({ sz, fs, d, from: 1, w: 1, round: d <= -1, color: "rgba(255,255,255,.75)" }) : null;
  return (
    <div style={{ ...base, position: "relative", background: bg, color: "#fff", borderRadius: d <= -1 ? "50%" : 0, fontSize: r?.fs ?? fs }}>
      {r?.node}{sc}
    </div>
  );
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
  const r = ringed({ sz, fs, d, w: 1.5, round: false, color: "rgba(255,255,255,0.55)" });
  return <div style={{ ...base, position: "relative", color: "inherit", fontSize: r.fs }}>{r.node}{sc}</div>;
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
  if (d === 0)  return <div style={base}>{sc}</div>;
  const r = ringed({ sz, fs, d, w: 2, round: d < 0, color: d < 0 ? "#fff" : "rgba(255,255,255,.7)" });
  return <div style={{ ...base, position: "relative", fontSize: r.fs }}>{r.node}{sc}</div>;
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
  if (d === 0)  return <div style={{ ...base, color: "inherit" }}>{sc}</div>;
  const r = ringed({ sz, fs, d, w: d < 0 ? 2 : 1.5, round: d < 0, color: d < 0 ? accent : "rgba(255,255,255,.45)" });
  return <div style={{ ...base, position: "relative", color: "inherit", background: d > 0 ? "rgba(255,255,255,.12)" : undefined, fontSize: r.fs }}>{r.node}{sc}</div>;
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

/* ═══════ StatsRow: pills de breakdown (HIO/Eagle/Bir/Par/Bog/Dbl/Tri/Quad+) ═══════ */
export function StatsRow({ st, tc3, gap = 8, fs = 11 }: { st: StT; tc3?: string; gap?: number; fs?: number }) {
  const items = [
    { n: st.hio,     l: "HIO", c: HIO_GREEN  },
    { n: st.eagles,  l: "🦅",  c: "#d4a017" },
    { n: st.birdies, l: "Bir", c: "#dc2626"  },
    { n: st.pars,    l: "Par", c: tc3        },
    { n: st.bogeys,  l: "Bog", c: "#5BADE6"  },
    // Azuis-escuros (as cores do cartão): o texto vai na cor secundária do
    // desenho e a bolinha leva contorno — em fundo escuro não se liam.
    { n: st.doubles, l: "Dbl", c: "#2B6EA0", dark: true },
    { n: st.triples, l: "Tri", c: "#1B4570", dark: true },
    { n: st.quads,   l: "Quad+", c: "#1B4570", dark: true },
  ].filter(x => x.n > 0);
  if (!items.length) return null;
  return (
    <div style={{ display: "flex", alignItems: "center", gap, flexWrap: "wrap" }}>
      {items.map(x => (
        <div key={x.l} style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: fs, fontWeight: 700 }}>
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: x.c, display: "inline-block", flexShrink: 0,
            boxShadow: "dark" in x ? `0 0 0 1px ${tc3 ?? "currentColor"}` : undefined }} />
          <span style={{ color: "dark" in x ? (tc3 ?? "inherit") : x.c }}>{x.n} {x.l}</span>
        </div>
      ))}
    </div>
  );
}
