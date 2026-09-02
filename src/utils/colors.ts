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
  warnVivid:    "#c17a00",  // âmbar médio — EOWAGR sidebar
  danger:       "#dc2626",
  dangerDark:   "#991b1b",
  dangerVivid:  "#b91c1c",  // red-700 — rivalidades/confrontos (USKidsPage)
  amber:        "#f59e0b",
  info:         "#1e40af",
  navy:         "#1e3a5f",
  teal:         "#00838f",
  // Circuit brand
  eowagr:        { dark: "#8a6200", mid: "#e09820", text: "#fff8e1" },
  bjgt:          { mid: "#4a9b6f" },
  doral:         { dark: "#1a5276", mid: "#2980b9", text: "#d6eaf8" },
  // Sidebar accent — por série/circuito (PillBadge.tsx SIDEBAR_ACCENT)
  sidebarSserra:    "#534AB7",   // violeta CGSS St Leon-Rot
  sidebarTour:      "#1D9E75",   // teal Drive Tour / Clubes
  sidebarChallenge: "#639922",   // verde lima Drive Challenge
  sidebarAquapor:   "#185FA5",   // azul AQUAPOR
  sidebarDefault:   "#888780",   // cinza neutro
  purple:       "#9c27b0",  // USKids — categoria especial
  orangeDeep:   "#e65100",  // USKids — não-euro

  // Neutral/muted (scoreDisplay.ts sc3m, scDark)
  muted:        "#888",      // cor neutra — meio termo em sc3m (C.muted)
  infoDark:     "#0369a1",   // azul escuro info — scDark("info")  (= color-info-alt)

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
  bgInfoSubtle:     "#e0f2fe",  // cards info suaves
  bgPurple:         "#f0edf5",
  bgFemale:         "#f0f4ff",
  bgWarnOrange:     "#fff3e0",  // USKids — aviso laranja
  bgPink:           "#fdf2f8",  // USKids — categoria especial

  // Text over coloured bg
  white:   "#ffffff",
  onDark:  "#1a3a10",  // texto escuro sobre fundos claros (sub-16/18)
  rivaisLink:      "#1a5c2a",  // links de rivais
  pillJuniorBg:    "#b45309",   // PILL_JUNIOR background
  pillJuniorFg:    "#fef3c7",   // PILL_JUNIOR text
  pillManuelBg:    "#dcfce7",   // PILL_MANUEL background
  pillManuelFg:    "#166534",   // PILL_MANUEL text
  pillManuelBd:    "#16a34a",   // PILL_MANUEL border
  rivaisLinkHover: "#0d3a18",

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

  // ── Escalão pills (sub-10 … sub-24) ─────────────────────────────────────────
  // Gradiente ROXO: Sub-10 CLARO (mais novo) → Sub-24 ESCURO (mais velho).
  // Espelha tokens.css (--esc-subNN-bg/fg). Roxo é praticamente não usado no
  // resto do projecto (só chartPurple #7c3aed e USKids #9c27b0, sem colisão
  // com esta escala) — forte separação visual dos verdes (good/SSerra),
  // azuis (accent/links) e âmbares (warn/tourn).
  esc: {
    sub10: { bg: "#f3e8ff", fg: "#581c87" },   // purple-100
    sub12: { bg: "#d8b4fe", fg: "#581c87" },   // purple-300
    sub14: { bg: "#a855f7", fg: "#ffffff" },   // purple-500
    sub16: { bg: "#7e22ce", fg: "#ffffff" },   // purple-700
    sub18: { bg: "#6b21a8", fg: "#ffffff" },   // purple-800
    sub21: { bg: "#581c87", fg: "#ffffff" },   // purple-900
    sub24: { bg: "#3b0764", fg: "#ffffff" },   // purple-950
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


  // ── Calendário — cores de categoria (CalendarioPage.tsx) ─────────────────────
  // Editar aqui para mudar as cores do calendário; CalendarioPage importa C.cal
  cal: {
    // CGSS
    cgss_major:     "#1e3a8a",   /* azul marinho — Majors */
    cgss_om_c:      "#60a5fa",   /* azul médio — O.M. Nível C */
    cgss_pares:     "#0891b2",   /* ciano — Camp. Pares */
    cgss_ouro:      "#0ea5e9",   /* azul claro — Ranking Ouro */
    cgss_regional:  "#0284c7",   /* azul — Regional */
    cgss_fpg:       "#4338ca",   /* índigo — FPG Nacional */
    // Junior
    jr_cgss:        "#f59e0b",   /* âmbar — CGSS Jr */
    jr_regional:    "#0d9488",   /* teal — Regional Jr */
    jr_fpg:         "#e11d48",   /* rosa-vermelho — FPG Jr */
    // Drive
    drive_chall:    "#8b5cf6",   /* violeta — Drive Challenge */
    drive_tour:     "#16a34a",   /* verde — Drive Tour */
    drive_tour_mad: "#059669",   /* esmeralda — Drive Tour Madeira */
    // FPG
    fpg_aquapor:    "#6366f1",   /* índigo — Circuito AQUAPOR */
    fpg_torneios:   "#a855f7",   /* roxo — Torneios FPG */
    // Destaque
    dest_intl:      "#dc2626",   /* vermelho — Internacionais */
    dest_nac_jr:    "#dc2626",   /* vermelho — Nacional Sub14&18 */
    dest_uskids:    "#e11d48",   /* rosa-vermelho — US Kids */
    dest_bjgt:      "#be123c",   /* carmesim — BJGT */
    dest_pja:       "#d946ef",   /* fúcsia — PJA Tour */
    pessoal:        "#39ff14",   /* neon verde — pessoal (intencional) */
    ferias:         "#a3e635",   /* lima — Férias */
    treino:         "#10b981",   /* esmeralda — Campo / Treino */
    colonias:       "#374151",   /* cinzento escuro — Colónias (sem animação) */
    escola:         "#94a3b8",   /* cinzento-azulado — calendário escolar (pano de fundo) */
    irma_bad:       "#14b8a6",   /* turquesa — Badminton (irmã) */
    profissao_fe:   "#fbbf24",   /* dourado — Profissão de Fé (full-cell pulse) */
    // Viagens
    viag_alg_fev:   "#f59e0b",
    viag_malaga:    "#f97316",
    viag_roma:      "#ef4444",
    viag_alg_mar:   "#eab308",
    viag_edinb:     "#06b6d4",
    viag_alg_jul_m:  "#fb923c",   /* laranja — Algarve Jul (Manuel+2) — provisório */
    viag_alg_jul_mamf:"#facc15",  /* amarelo — Algarve Jul (Mariana + M. Francisco) — provisório */
    viag_vce_ago:    "#f43f5e",   /* rosa — Veneza+Porto Ago — provisório */
    viag_malaga_nov: "#8b5cf6",  /* violeta — Málaga Nov (US Kids Spanish Open) */
    // Aniversários (ramp rosa)
    bday_sub10:     "#f9a8d4",
    bday_sub12:     "#f472b6",
    bday_sub14:     "#ec4899",
    bday_sub16:     "#db2777",
    bday_sub18:     "#be185d",
    bday_pja:       "#d946ef",
    bday_outros:    "#a78bfa",
    // Highlight full-cell (pessoal)
    hl_pessoal_bg:     "#39ff14",
    hl_pessoal_border: "#2ecc40",
    hl_pessoal_text:   "#1a1a1a",
    // Highlight full-cell (Profissão de Fé)
    hl_fe_bg:          "#fbbf24",
    hl_fe_border:      "#d97706",
    hl_fe_text:        "#1a1a1a",
  },

} as const;
