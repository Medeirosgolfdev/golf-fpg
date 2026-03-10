/**
 * Golf Portugal — Constantes de cor para uso em JavaScript/TypeScript.
 *
 * Este ficheiro espelha os tokens CSS de tokens.css.
 * Para alterar uma cor, editar APENAS tokens.css — depois actualizar
 * o valor correspondente aqui se necessário.
 *
 * Uso:
 *   import { C } from "../tokens/colors";
 *   const fill = C.chartGreen;           // em recharts, d3, etc.
 *   const style = { background: C.esc.sub14.bg };  // em data arrays
 */

// ── Semantic ──────────────────────────────────────────────────────────────────
export const C = {

  // Accent
  accent:       "#2d6a30",
  accentHover:  "#1e4d20",
  link:         "#2e7d32",
  linkHover:    "#1b5e20",

  // Semantic
  good:         "#16a34a",
  goodDark:     "#166534",
  warn:         "#d97706",
  warnDark:     "#92400e",
  danger:       "#dc2626",
  dangerDark:   "#991b1b",
  amber:        "#f59e0b",
  info:         "#1e40af",
  navy:         "#1e3a5f",
  teal:         "#00838f",
  purple:       "#9c27b0",  // USKids — categoria especial
  orangeDeep:   "#e65100",  // USKids — não-euro

  // Greyscale
  grey900: "#111",
  grey700: "#374151",
  grey500: "#666",
  grey400: "#888",
  grey300: "#999",
  grey200: "#ddd",

  // Medals
  medalGold:   "#f59e0b",
  medalSilver: "#94a3b8",
  medalBronze: "#b45309",

  // Backgrounds (para uso em estilos inline que precisam de JS)
  bgCard:           "#ffffff",
  bgSuccess:        "#f0fdf4",
  bgSuccessStrong:  "#dcfce7",
  bgSuccessSubtle:  "#d1fae5",
  bgDanger:         "#fef2f2",
  bgWarn:           "#fffbeb",
  bgPurple:         "#f0edf5",
  bgFemale:         "#f0f4ff",
  bgWarnOrange:     "#fff3e0",  // USKids — aviso laranja
  bgPink:           "#fdf2f8",  // USKids — categoria especial

  // Text over coloured bg
  white:   "#ffffff",
  onDark:  "#1a3a10",  // texto escuro sobre fundos claros (sub-16/18)

  // ── Charts / data-viz ───────────────────────────────────────────────────────
  // Palette de 10 séries para Recharts / D3
  charts: [
    "#16a34a",   // 0 verde    = chart-1
    "#2563eb",   // 1 azul     = chart-2
    "#dc2626",   // 2 vermelho = chart-3
    "#d97706",   // 3 âmbar    = chart-4
    "#7c3aed",   // 4 roxo     = chart-5
    "#0891b2",   // 5 ciano    = chart-6
    "#be185d",   // 6 rosa     = chart-7
    "#65a30d",   // 7 lima     = chart-8
    "#c2410c",   // 8 ferrugem = chart-9
    "#6366f1",   // 9 índigo   = chart-10
    "#0d9488",   // 10 teal extra
    "#ea580c",   // 11 laranja extra
  ],

  // Aliases individuais para recharts <Line/> etc.
  chartGreen:   "#16a34a",
  chartBlue:    "#2563eb",
  chartRed:     "#dc2626",
  chartAmber:   "#d97706",
  chartPurple:  "#7c3aed",
  chartCyan:    "#0891b2",
  chartRose:    "#be185d",
  chartLime:    "#65a30d",
  chartRust:    "#c2410c",
  chartIndigo:  "#6366f1",

  // ── Performance tiers ───────────────────────────────────────────────────────
  tiers: {
    exceptional: "#0d9488",
    good:        "#22c55e",
    fair:        "#3b82f6",
    weak:        "#f97316",
    bad:         "#ef4444",
  },

  // ── Escalão pills (sub-10 … sub-18) ─────────────────────────────────────────
  esc: {
    sub10: { bg: "#2a5a18", fg: "#ffffff" },
    sub12: { bg: "#3a7a28", fg: "#ffffff" },
    sub14: { bg: "#5a9a40", fg: "#ffffff" },
    sub16: { bg: "#7aba60", fg: "#1a3a10" },
    sub18: { bg: "#a0d480", fg: "#1a3a10" },
    default: { bg: "var(--bg-hover)", fg: "var(--text-muted)" },
  },

  // ── Score ramp ───────────────────────────────────────────────────────────────
  score: {
    hio:         "#10b981",
    eagle:       "#f59e0b",
    birdie:      "#dc2626",
    par:         "#22c55e",
    bogey:       "#bfdbfe",
    bogeyFg:     "#1e3a8a",
    double:      "#60a5fa",
    triple:      "#2563eb",
    quad:        "#1d4ed8",
    quint:       "#172554",
    worse:       "#0a0f1f",
  },

  // ── USKids vacancy badge ──────────────────────────────────────────────────────
  vagas: {
    full:   { bg: "#7f0000",               fg: "#ffcdd2" },
    almostFull: { bg: "#b71c1c",           fg: "#ffcdd2" },
    limited: { bg: "var(--color-warn)",    fg: "#ffe0b2" },
    available: { bg: "#f57f17",            fg: "#fff9c4" },
    open:   { bg: "#1b5e20",               fg: "#c8e6c9" },
  },

} as const;

// ── Tipo auxiliar ─────────────────────────────────────────────────────────────
export type EscKey = keyof typeof C.esc;
