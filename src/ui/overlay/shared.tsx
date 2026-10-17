/*
 * Constantes e helpers partilhados pelos overlays do simulador.
 * Inclui font-stacks, paletas, fmt helpers, embed de Google Fonts para html-to-image.
 *
 * Cores hardcoded intencionalmente (ver NOTA em OverlayExport.tsx) — o renderer
 * html-to-image converte DOM→SVG→Canvas→PNG e perde CSS custom properties.
 */
import { fmtSD } from "../../utils/format";
import { scoreDifferential } from "../../utils/whsCalc";
import type { DD, Vis, Stats, StT } from "./types";

/* ═══════ FONT STACKS ═══════ */
export const FONT_LINK = "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=Oswald:wght@400;500;600;700&family=Bebas+Neue&family=Space+Grotesk:wght@400;500;600;700&family=Lora:ital,wght@0,400;0,700;1,400;1,700&display=swap";
export const II = "'Inter',sans-serif";
export const OS = "'Oswald',sans-serif";
export const LO = "'Lora',serif";
export const BN = "'Bebas Neue',sans-serif";
export const SG = "'Space Grotesk',sans-serif";

/* ═══════ TEXT SHADOWS ═══════ */
/* User pediu zero sombras — constantes esvaziadas. Mantidas como exports
   para não partir imports existentes. Leitura sobre fotos é garantida pelos
   fundos opacos/pills/blocos sólidos de cada template, não por shadows. */
export const TS = "none";
export const TS_SCORE = "none";

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

/** O texto do cartão é branco (fundos escuros)? */
export const isLightText = (tc?: string) => {
  if (!tc || tc === "white") return true;
  const m = /^#([0-9a-f]{6})$/i.exec(tc);
  if (!m) return true;
  const n = parseInt(m[1], 16);
  return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) > 140;
};
/** Cor de texto legível POR CIMA de uma cor (ex.: pílula no destaque). */
export const onColor = (hex: string) => isLightText(hex) ? "#1c1f26" : "#ffffff";
/** Tinta da cor do texto com transparência — linhas, divisórias, realces. */
export const ink = (tc: string | undefined, a: number) => isLightText(tc) ? `rgba(255,255,255,${a})` : `rgba(0,0,0,${a})`;
/** Painel interior por cima do fundo: escurece sob texto branco, clareia sob texto preto. */
export const panel = (tc: string | undefined, a: number) => isLightText(tc) ? `rgba(0,0,0,${a})` : `rgba(255,255,255,${a})`;

/** Cor do resultado vs par. Com `tc` preto (fundo claro) usa as cores escuras (vpCd). */
export const vpC = (v: number, tc?: string, ta?: string) => {
  /* Acima do par no destaque do cartão (quando o desenho o passa) — o resultado
     fica ligado às cores do cartão em vez de um cinzento que destoava. */
  if (ta && v > 0) return ta;
  if (tc && !isLightText(tc)) return vpCd(v);
  if (v <= -2) return "#d4a017";
  if (v === -1) return "#ef4444";
  if (v === 0) return "#d0d0d0";
  /* Acima do par: cinza-claro neutro — o azul competia com o azul dos bogeys */
  return "#cbd5e1";
};

/** Cor de texto vs par (dark bg, para tabelas brancas). */
export const vpCd = (v: number) => {
  /* Abaixo do par vermelho (como os birdies); acima, cinza-escuro neutro */
  if (v < 0) return "#dc2626";
  if (v === 0) return "#666";
  return "#334155";
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

/** Preenchimento com a opacidade escolhida no painel (`fa`) — cabeçalhos,
 *  barras e cartões dos desenhos, para a fotografia se ver por trás. */
export const fillA = (hex: string, fa = 0.88) => hexToRgba(hex, fa);

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

/** Partes da informação da volta, na ordem pedida, só as ligadas e com
 *  valor — o mesmo texto em todos os desenhos. Chaves: event, round,
 *  position, course, tee, teeDist, date, hiCh, sd (e player). */
export type InfoKey = "player" | "event" | "division" | "round" | "position" | "course" | "tee" | "teeDist" | "date" | "hiCh" | "sd";
export const INFO_ALL: InfoKey[] = ["event", "round", "position", "course", "tee", "teeDist", "date", "hiCh", "sd"];
export function infoParts(d: DD, v: Vis, keys: InfoKey[] = INFO_ALL, o: { roundWord?: string; posWord?: string } = {}): string[] {
  const out: string[] = [];
  for (const k of keys) {
    if (!v[k]) continue;
    if (k === "player" && d.player) out.push(d.player);
    else if (k === "event" && d.event) out.push(d.event);
    else if (k === "round" && d.round && !d.rounds) out.push(`${o.roundWord ?? "R"}${d.round}`);
    else if (k === "position" && d.position) out.push(`${o.posWord ?? "POS "}${d.position}`);
    else if (k === "course" && d.course) out.push(d.course);
    else if (k === "tee" && d.tee) out.push(d.tee);
    else if (k === "teeDist" && d.teeDist) out.push(`${d.teeDist}m`);
    else if (k === "date" && d.date) out.push(d.date);
    else if (k === "hiCh" && d.hi !== null) out.push([`HI ${d.hi.toFixed(1)}`, d.courseHcp !== null ? `CH ${d.courseHcp}` : ""].filter(Boolean).join(" · "));
    else if (k === "sd" && d.sd !== null) out.push(`SD ${fmtSD(d.sd)}`);
  }
  return out;
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

/** Contagem por tipo de resultado (HIO, eagle, birdie, par, bogey, duplo,
 *  triplo e quádruplo ou pior) dos buracos `from`..`to` (excl.). */
export function countHoles(scores: number[], par: number[], from = 0, to = scores.length): StT {
  const st: StT = { hio:0, eagles:0, birdies:0, pars:0, bogeys:0, doubles:0, triples:0, quads:0 };
  for (let i = from; i < to; i++) {
    const sc = scores[i]; const x = sc - par[i];
    if (sc === 1) st.hio++;
    else if (x <= -2) st.eagles++;
    else if (x === -1) st.birdies++;
    else if (x === 0) st.pars++;
    else if (x === 1) st.bogeys++;
    else if (x === 2) st.doubles++;
    else if (x === 3) st.triples++;
    else st.quads++;
  }
  return st;
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
  const st = countHoles(d.scores, d.par);
  // SD pela biblioteca (utils/whsCalc) — em 9 buracos soma o Expected SD do HI
  const sd = scoreDifferential({ score: sT, cr: d.cr, slope: d.slope, is9: !is18, hi: d.hi })?.sd ?? 0;
  return { pF, pB, pT, sF, sB, sT, vpT: sT-pT, vpF: sF-pF, vpB: is18 ? sB-pB : 0, sd, st };
}
