/*
 * Componentes visuais reutilizáveis pelos templates V*:
 * - SC, SCL, SCQ, SCO, SCA: variantes de score circle/square por hole
 * - TpBadge: pill colorida de to-par (+4 / -1 / E)
 * - Grid2: layout 2×9 dos hole scores
 * - StatsRow: pills de breakdown (HIO, Eagles, Bir, Par, Bog, Dbl, Tri, Quad+)
 */
import React, { createContext, useContext } from "react";
import { II } from "./shared";
import { HIO_GREEN, scBg } from "./shared";
import type { DD, StT } from "./types";

/* ═══════ Par / S.I. por buraco (opções «Par» e «S.I.» do painel) ═══════
 * Dado pelo OverlayExport a cada desenho: as células com `h` (índice do
 * buraco) mostram por baixo «P4» e/ou «SI 15». Nas tabelas que já têm a sua
 * linha de Par, `par` vem a false (não repete). */
export type CellInfo = { d: DD; par: boolean; si: boolean };
export const CellInfoCtx = createContext<CellInfo | null>(null);

/** Envolve a célula com a legenda do buraco, quando há opção ligada. */
function useCaption(cell: React.ReactElement, h: number | undefined, sz: number): React.ReactElement {
  const ci = useContext(CellInfoCtx);
  if (!ci || h == null) return cell;
  const lines: string[] = [];
  if (ci.par && ci.d.par[h] != null) lines.push(`P${ci.d.par[h]}`);
  if (ci.si && ci.d.si.length > h && ci.d.si[h]) lines.push(`SI ${ci.d.si[h]}`);
  if (!lines.length) return cell;
  // Discreta: não pode competir com o score (16/10/2026).
  const fs = Math.max(7, Math.round(sz * 0.26));
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: sz, flexShrink: 0 }}>
      {cell}
      <div style={{ marginTop: 1 }}>
        {lines.map((l) => <div key={l} style={{ fontSize: fs, fontWeight: 600, lineHeight: 1.1, opacity: .6, whiteSpace: "nowrap", textAlign: "center" }}>{l}</div>)}
      </div>
    </div>
  );
}

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
export function SC({ sc, par, sz = 32, h }: { sc: number; par: number; sz?: number; h?: number }) {
  return useCaption(<SCCell sc={sc} par={par} sz={sz} />, h, sz);
}
function SCCell({ sc, par, sz }: { sc: number; par: number; sz: number }) {
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
export function SCL({ sc, par, sz = 28, h }: { sc: number; par: number; sz?: number; h?: number }) {
  return useCaption(<SCLCell sc={sc} par={par} sz={sz} />, h, sz);
}
function SCLCell({ sc, par, sz }: { sc: number; par: number; sz: number }) {
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
export function SCQ({ sc, par, sz = 24, h }: { sc: number; par: number; sz?: number; h?: number }) {
  return useCaption(<SCQCell sc={sc} par={par} sz={sz} />, h, sz);
}
function SCQCell({ sc, par, sz }: { sc: number; par: number; sz: number }) {
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
export function SCO({ sc, par, sz = 36, h }: { sc: number; par: number; sz?: number; h?: number }) {
  return useCaption(<SCOCell sc={sc} par={par} sz={sz} />, h, sz);
}
function SCOCell({ sc, par, sz }: { sc: number; par: number; sz: number }) {
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
export function SCA({ sc, par, sz = 36, accent = "#e87722", h }: { sc: number; par: number; sz?: number; accent?: string; h?: number }) {
  return useCaption(<SCACell sc={sc} par={par} sz={sz} accent={accent} />, h, sz);
}
function SCACell({ sc, par, sz, accent = "#e87722" }: { sc: number; par: number; sz: number; accent?: string }) {
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
  /* Pílula de vidro (16/10/2026): o bloco azul forte competia com o azul dos
     bogeys e tapava a foto. Acima do par = cor do texto do desenho; abaixo =
     vermelho suave (a cor dos birdies); fundo e contorno semi-transparentes. */
  const under = vp < 0;
  const txt = vp < 0 ? String(vp) : vp > 0 ? `+${vp}` : "E";
  return (
    <div style={{
      background: under ? "rgba(220,38,38,.22)" : "rgba(128,128,128,.22)",
      border: `1.5px solid ${under ? "rgba(248,113,113,.7)" : "rgba(128,128,128,.55)"}`,
      color: under ? "#f87171" : "inherit", fontFamily: II, fontSize: sz, fontWeight: 900,
      padding: `${Math.round(sz * 0.18)}px ${Math.round(sz * 0.45)}px`, borderRadius: Math.round(sz * 0.3),
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
              <SC sc={sc} par={d.par[off + i]} sz={sz} h={off + i} />
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
