/*
 * Constantes e helpers partilhados pelos overlays do simulador.
 * Inclui font-stacks, paletas, fmt helpers, embed de Google Fonts para html-to-image.
 *
 * Cores hardcoded intencionalmente (ver NOTA em OverlayExport.tsx) — o renderer
 * html-to-image converte DOM→SVG→Canvas→PNG e perde CSS custom properties.
 */
import { fmtSD } from "../../utils/format";
import type { DD, Vis, Stats, StT } from "./types";

/* ═══════ FONT STACKS ═══════ */
export const FONT_LINK = "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=Oswald:wght@400;500;600;700&family=Bebas+Neue&family=Space+Grotesk:wght@400;500;600;700&family=Lora:ital,wght@0,400;0,700;1,400;1,700&display=swap";
export const II = "'Inter',sans-serif";
export const OS = "'Oswald',sans-serif";
export const LO = "'Lora',serif";
export const BN = "'Bebas Neue',sans-serif";
export const SG = "'Space Grotesk',sans-serif";

/* ═══════ TEXT SHADOWS ═══════ */
/** Subtle shadow para texto sobre fotos. */
export const TS = "0 1px 2px rgba(0,0,0,.35)";
/** Shadow mais forte para números grandes (score). */
export const TS_SCORE = "0 1px 3px rgba(0,0,0,.45)";

/* ═══════ CORES DE SCORE ═══════ */
export const HIO_GREEN = "#10b981"; // hole-in-one — verde esmeralda

/** Background do badge de score conforme delta vs par. null = sem fundo (par). */
export function scBg(d: number, sc?: number): string | null {
  if (sc === 1) return HIO_GREEN;  // hole-in-one — SEMPRE verde
  if (d <= -2) return "#d4a017"; // eagle+ — ouro
  if (d === -1) return "#dc2626"; // birdie — vermelho
  if (d === 1)  return "#3b82f6"; // bogey — azul médio
  if (d === 2)  return "#1e6ab0"; // double — azul mais visível
  if (d >= 3)   return "#1e4480"; // triple+ — navy mais visível
  return null;
}

/** Cor de texto vs par (light bg). */
export const vpC = (v: number) => {
  if (v <= -2) return "#d4a017";
  if (v === -1) return "#ef4444";
  if (v === 0) return "#d0d0d0";
  if (v === 1) return "#7eb8e8";
  return "#5b9bd5";
};

/** Cor de texto vs par (dark bg, para tabelas brancas). */
export const vpCd = (v: number) => {
  if (v < 0) return "#16a34a";
  if (v === 0) return "#666";
  return "#dc2626";
};

/* ═══════ FONT EMBED (html-to-image) ═══════ */
/*
 * Pre-fetch Google Fonts CSS e converte as fonts woff2 para base64 data URIs.
 * Contorna o bug CORS do html-to-image (embed-webfonts.ts → normalizeFontFamily).
 * Resultado cacheado — só faz fetch na 1ª chamada.
 */
let _fontCSSCache: Promise<string> | null = null;
export function getFontEmbedCSS(): Promise<string> {
  if (_fontCSSCache) return _fontCSSCache;
  _fontCSSCache = (async () => {
    try {
      const res = await fetch(FONT_LINK);
      let css = await res.text();
      const urls = [...css.matchAll(/url\(([^)]+)\)/g)].map(m => m[1]);
      for (const url of urls) {
        try {
          const fontRes = await fetch(url);
          const buf = await fontRes.arrayBuffer();
          /* Conversão chunked — spread de arrays grandes rebenta a call stack */
          const bytes = new Uint8Array(buf);
          let bin = "";
          for (let i = 0; i < bytes.length; i += 8192) {
            bin += String.fromCharCode(...bytes.subarray(i, Math.min(i + 8192, bytes.length)));
          }
          const b64 = btoa(bin);
          const mime = url.includes(".woff2") ? "font/woff2" : "font/woff";
          css = css.replace(url, `data:${mime};base64,${b64}`);
        } catch { /* se uma font falhar, manter URL original */ }
      }
      return css;
    } catch {
      return ""; /* fallback: sem embed (usa fonts do browser) */
    }
  })();
  return _fontCSSCache;
}

/* ═══════ HELPERS ═══════ */
export function hexToRgba(hex: string, a: number) {
  const safe = /^#[0-9a-fA-F]{6}$/.test(hex) ? hex : "#000000";
  const r = parseInt(safe.slice(1,3),16), g = parseInt(safe.slice(3,5),16), b = parseInt(safe.slice(5,7),16);
  return `rgba(${r},${g},${b},${a})`;
}

/** Constrói linha de metadata (course/tee/teeDist/date/round) consoante toggles ligados. */
export function metaStr(d: DD, flags: Partial<Record<string, boolean>>): string {
  return [
    flags.round   && d.round  && `R${d.round}`,
    flags.course  && d.course,
    flags.tee     && d.tee,
    flags.teeDist && d.teeDist && `${d.teeDist}m`,
    flags.date    && d.date,
  ].filter(Boolean).join(" · ");
}

/** Constrói linha de HCP info (HI/CH/SD) consoante toggles ligados. */
export function hiChStr(d: DD, v: Vis, _s: Stats): string {
  const p: string[] = [];
  if (v.hiCh && d.hi !== null) {
    p.push(`HI ${d.hi.toFixed(1)}`);
    if (d.courseHcp !== null) p.push(`CH ${d.courseHcp}`);
  }
  if (v.sd && d.sd !== null) p.push(`SD ${fmtSD(d.sd)}`);
  return p.join(" · ");
}

/** Calcula stats agregados (front/back/total, vs par, breakdown de scores). */
export function calcStats(d: DD): Stats {
  const n = d.scores.length;
  const is18 = n >= 18;
  const pF = d.par.slice(0, Math.min(9,n)).reduce((a,b)=>a+b,0);
  const pB = is18 ? d.par.slice(9).reduce((a,b)=>a+b,0) : 0;
  const pT = is18 ? pF+pB : d.par.reduce((a,b)=>a+b,0);
  const sF = d.scores.slice(0, Math.min(9,n)).reduce((a,b)=>a+b,0);
  const sB = is18 ? d.scores.slice(9).reduce((a,b)=>a+b,0) : 0;
  const sT = is18 ? sF+sB : d.scores.reduce((a,b)=>a+b,0);
  const st: StT = { hio:0, eagles:0, birdies:0, pars:0, bogeys:0, doubles:0, triples:0 };
  d.scores.forEach((sc,i) => {
    const x = sc - d.par[i];
    if (sc === 1) st.hio++;
    else if (x <= -2) st.eagles++;
    else if (x === -1) st.birdies++;
    else if (x === 0) st.pars++;
    else if (x === 1) st.bogeys++;
    else if (x === 2) st.doubles++;
    else st.triples++;
  });
  const sd = d.slope > 0 ? (113/d.slope)*(sT-d.cr) : 0;
  return { pF, pB, pT, sF, sB, sT, vpT: sT-pT, vpF: sF-pF, vpB: is18 ? sB-pB : 0, sd, st };
}
