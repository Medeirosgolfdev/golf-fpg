// colour constants
import { C } from "../utils/colors";
/**
 * src/utils/teeColors.ts
 *
 * Toda a lógica de cores de tees para o React.
 * Lê dados de shared/tee-colors.json (cores reais FPG/DataGolf).
 *
 * Para o pipeline Node, ver lib/tee-colors.js (mesmo JSON, módulo CJS).
 */

import teeData from "../../shared/tee-colors.json";
import type { Course } from "../data/types";

const EXACT: Record<string, string> = teeData.exact;
const SUBS: [string, string][] = teeData.substrings as [string, string][];
const FALLBACK: string = teeData.fallback;
const LABELS: Record<string, string> = teeData.canonicalLabels;
const PRIMARY: string[] = teeData.canonicalHexes;

/*  Helpers internos  */

function hexToRgb(hex: string): [number, number, number] | null {
  const h = (hex || "").replace("#", "");
  if (h.length !== 6) return null;
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return [h, s, l];
}

/** Distância perceptual HSL (hue pesado 4×) */
function colorDist(a: [number, number, number], b: [number, number, number]): number {
  const ha = rgbToHsl(a[0], a[1], a[2]);
  const hb = rgbToHsl(b[0], b[1], b[2]);
  if (ha[1] < 0.08 && hb[1] < 0.08) return (ha[2] - hb[2]) ** 2;
  if ((ha[1] < 0.08) !== (hb[1] < 0.08)) return 10;
  let dh = Math.abs(ha[0] - hb[0]); if (dh > 0.5) dh = 1 - dh;
  return (dh * 4) ** 2 + ((ha[1] - hb[1]) * 1.5) ** 2 + (ha[2] - hb[2]) ** 2;
}

const _nearestCache = new Map<string, string>();

function nearestPrimary(hex: string): string {
  const key = (hex || "").toLowerCase();
  if (_nearestCache.has(key)) return _nearestCache.get(key)!;
  const rgb = hexToRgb(key);
  if (!rgb) { _nearestCache.set(key, FALLBACK); return FALLBACK; }
  let best = FALLBACK, bestD = Infinity;
  for (const c of PRIMARY) {
    const cr = hexToRgb(c);
    if (!cr) continue;
    const d = colorDist(rgb, cr);
    if (d < bestD) { bestD = d; best = c; }
  }
  _nearestCache.set(key, best);
  return best;
}

/*  Cache de cores reais dos cursos (DataGolf/scorecardMeta) 
 *
 * Quando só temos o nome do tee (e.g. "Amarelas") sem o objecto Tee,
 * precisamos resolver a cor real. Este cache mapeia nomes normalizados
 * para as cores hex vindas de scorecardMeta nos cursos carregados.
 *
 * Chamado uma vez pelo App.tsx quando os cursos ficam prontos.
 * Todas as páginas beneficiam automaticamente.
 */
let _courseColorCache: Map<string, string> = new Map();

/**
 * Inicializa o cache de cores reais a partir dos cursos carregados.
 * Seguro para chamar múltiplas vezes — só reconstrói se `force` for true.
 */
export function initCourseColorCache(courses: Course[], force = false): void {
  if (_courseColorCache.size > 0 && !force) return;
  const m = new Map<string, string>();
  for (const c of courses) {
    for (const t of c.master.tees) {
      const hex = t.scorecardMeta?.teeColor;
      if (hex) {
        const k = normKey(t.teeName);
        if (!m.has(k)) m.set(k, hex.startsWith("#") ? hex : `#${hex}`);
      }
    }
  }
  _courseColorCache = m;
}

/* ── API pública ── */

/** Normaliza string de tee: lowercase, sem acentos, sem espaços */
export function normKey(s: unknown): string {
  return String(s == null ? "" : s)
    .trim().normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['']/g, "")
    .replace(/\s+/g, "");
}

/** Resolve cor hex pelo nome do tee (courseCache → exact → substring → fallback).
 *  O courseCache (scorecardMeta real) tem prioridade sobre mapeamentos genéricos. */
function teeColor(name: string): string {
  const k = normKey(name);
  // 1. Cor real do campo (scorecardMeta) — mais específica
  const cached = _courseColorCache.get(k);
  if (cached) return cached;
  // 2. Mapeamento exacto por nome (tee-colors.json)
  if (EXACT[k]) return EXACT[k];
  // 3. Substring (fallback genérico)
  for (const [sub, hex] of SUBS) { if (k.includes(sub)) return hex; }
  return FALLBACK;
}

/** Resolve cor hex. Prioriza scorecardMeta.teeColor se disponível. */
export function getTeeHex(teeName: string, scorecardColor?: string | null): string {
  if (scorecardColor && /^#?[0-9a-f]{6}$/i.test(scorecardColor.trim())) {
    const h = scorecardColor.trim();
    return h.startsWith("#") ? h : `#${h}`;
  }
  return teeColor(teeName);
}

/** Cor do texto (escuro/claro) sobre uma cor de fundo */
export function textOnColor(hex: string): string {
  const h = (hex || "").replace("#", "");
  if (h.length !== 6) return "#fff";
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) > 0.45 ? C.grey900 : "#fff";
}

/** Etiqueta canónica PT: "Rossi"→"Vermelhas", "Black"→"Pretas", etc. */
export function teeCanonicalLabel(teeName: string, scorecardColor?: string | null): string {
  const hex = getTeeHex(teeName, scorecardColor).toLowerCase();
  if (LABELS[hex]) return LABELS[hex];
  return LABELS[nearestPrimary(hex)] || teeName;
}

/** Hex canónico FPG para agrupar: qualquer variante de vermelho → "#ff0000" */
export function teeGroupHex(teeName: string, scorecardColor?: string | null): string {
  return nearestPrimary(getTeeHex(teeName, scorecardColor));
}

/** Bordo visível para tees claros (brancas, etc.) que desaparecem em fundo branco */
export function teeBorder(hex: string): string | undefined {
  const h = hex.replace("#", "");
  if (h.length !== 6) return undefined;
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum > 0.82 ? "1px solid var(--border)" : undefined;
}
