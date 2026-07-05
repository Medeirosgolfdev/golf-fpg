// @refresh reset
/**
 * PillBadge.tsx — FONTE ÚNICA de todos os pills da aplicação
 *
 * Exporta:
 *   Estilos:    PILL_ROUND, PILL_TCODE, PILL_9H, PILL_SSERRA,
 *               PILL_JUNIOR, PILL_MANUEL, SIDEBAR_ACCENT, ESC_STYLE
 *   Dados:      CCODE_SHORT
 *   Funções:    clubeFromCcode, shortClubFromField
 *   Componentes: Pill (base), EscPill, PillBadge, RoundPill,
 *               TcodePill, SserraPill, JuniorPill, ManuelPill, NacionalPill
 *
 * Todos os pills usam sempre className="p p-sm [p-tourn]" (App.css global)
 * para garantir tamanho e padding uniformes.
 * Apenas background/color/borderColor são sobrescritos via style.
 *
 * PillBadge.tsx e tournamentPrimitives.tsx devem re-exportar daqui.
 */

import React, { type CSSProperties } from "react";
import { C } from "../utils/colors";

/* ════════════════════════════════════════════════════════════
   ESTILOS — usados como style={PILL_XXX} em className="p p-sm [p-tourn]"
   ════════════════════════════════════════════════════════════ */

/** Rondas — só mostrar se nR > 1. Cores chamativas para chamar atenção. */
export const PILL_ROUND: Record<number, CSSProperties> = {
  2: { background: C.chartCyan,   color: "#fff", borderColor: "transparent" }, // cyan
  3: { background: C.chartRed,    color: "#fff", borderColor: "transparent" }, // vermelho
  4: { background: C.chartPurple, color: "#fff", borderColor: "transparent" }, // violeta
};

/** IDs de torneio (tcode) */
export const PILL_TCODE: CSSProperties = {
  background: C.grey700,  color: C.grey200,  letterSpacing: "0.06em", borderColor: "transparent",
};

/** 9 buracos — só mostrar se nholes ≤ 9 */
export const PILL_9H: CSSProperties = {
  background: C.warn, color: "#fff", borderColor: "transparent",
};

/** Santo da Serra */
export const PILL_SSERRA: CSSProperties = {
  background: C.goodDark, color: "#fff", borderColor: "transparent",
};

/** Torneios Junior (auto-detectado pelo nome) */
export const PILL_JUNIOR: CSSProperties = {
  background: C.pillJuniorBg, color: C.pillJuniorFg, borderColor: "transparent",
};

/** Jogador especial Manuel */
export const PILL_MANUEL: CSSProperties = {
  background: C.pillManuelBg, color: C.pillManuelFg, borderColor: C.pillManuelBd,
};

/** Accent lateral da sidebar por série/tipo */
export const SIDEBAR_ACCENT: Record<string, string> = {
  sserra:    C.sidebarSserra,
  pja:       C.danger,
  clubes:    C.sidebarTour,
  tour:      C.sidebarTour,
  challenge: C.sidebarChallenge,
  aquapor:   C.sidebarAquapor,
  default:   C.sidebarDefault,
};

/** Escalão pill styles — espelha C.esc.* e as classes .p-sub* do App.css */
export const ESC_STYLE: Record<string, { bg: string; color: string }> = {
  sub10: { bg: C.esc.sub10.bg, color: C.esc.sub10.fg },
  sub12: { bg: C.esc.sub12.bg, color: C.esc.sub12.fg },
  sub14: { bg: C.esc.sub14.bg, color: C.esc.sub14.fg },
  sub16: { bg: C.esc.sub16.bg, color: C.esc.sub16.fg },
  sub18: { bg: C.esc.sub18.bg, color: C.esc.sub18.fg },
  sub21: { bg: C.esc.sub21.bg, color: C.esc.sub21.fg },
  sub24: { bg: C.esc.sub24.bg, color: C.esc.sub24.fg },
  default: { bg: C.esc.default.bg, color: C.esc.default.fg },
};

/* ════════════════════════════════════════════════════════════
   DADOS — lookup ccode → nome curto do clube
   No FPG, t.clube = raw.club_code (string numérica, ex: "007")
   ════════════════════════════════════════════════════════════ */
export const CCODE_SHORT: Record<string, string> = {
  "003": "Miramar",      "004": "Estoril",     "005": "Oporto",
  "006": "Vidago",       "007": "CGSS",         "008": "Montebelo",
  "009": "Aroeira",      "010": "Troia",        "011": "Quinta do Peru",
  "012": "Belas",        "013": "Qta Marinha",  "014": "LSC",
  "015": "Penha Longa",  "016": "Oitavos",      "017": "Ribagolfe",
  "018": "Montado",      "019": "Morgado",      "020": "Palmares",
  "021": "Castro Marim", "022": "Vale do Lobo", "023": "Vilamoura",
  "024": "Quinta do Lago","025": "Boavista",    "026": "Silves",
  "029": "Paredes",      "030": "Maia",         "035": "Ofir",
  "040": "Alamos",       "041": "Pinheiros Altos","042": "Penina",
  "044": "Laguna",       "046": "Vila Sol",     "047": "Salgados",
  "050": "Arrabida",     "055": "Jamor",        "060": "Beloura",
  "064": "Figueira",     "068": "Belas Club",   "079": "Estela",
  "082": "Vale Pisão",   "085": "Curia",        "092": "Coimbra",
  "095": "Vila Sol 2",   "096": "Morgado 2",
};

export function clubeFromCcode(ccode?: string | null): string | null {
  if (!ccode) return null;
  const key = String(ccode).padStart(3, "0");
  return CCODE_SHORT[key] ?? null;
}

export function shortClubFromField(clube?: string | null, ccode?: string | null): string | null {
  // ccode "000" (FPG/nacional) e ccodes de região — não mostrar
  const normalized = String(ccode || "").padStart(3, "0");
  if (["000","982","983","985","987","988"].includes(normalized)) return null;
  // clube numérico → é o ccode
  if (clube && /^\d+$/.test(clube.trim())) return clubeFromCcode(clube) ?? clubeFromCcode(ccode);
  // clube texto longo → encurtar
  if (clube) {
    const short = clube
      .replace(/^(Clube de (?:Golfe?|Golf)(?: Clube)?(?: de| do| da| dos| das)? )/i, "")
      .replace(/^(Club de Golf(?: de| do| da)? )/i, "")
      .replace(/^(Golf Clube(?: de| do| da)? )/i, "")
      .replace(/^(Associa[çc][aã]o de Golfe(?: de| do| da)? )/i, "")
      .trim();
    if (short && !/^\d+$/.test(short)) return short;
  }
  return clubeFromCcode(ccode);
}

/* ════════════════════════════════════════════════════════════
   COMPONENTES
   ════════════════════════════════════════════════════════════ */

/** Base — wrapper que garante sempre "p p-sm" */
export function Pill({
  children, className = "", style, tourn = false,
}: {
  children: React.ReactNode;
  className?: string;
  style?: CSSProperties;
  tourn?: boolean;
}) {
  return (
    <span className={`p p-sm${tourn ? " p-tourn" : ""}${className ? " " + className : ""}`} style={style}>
      {children}
    </span>
  );
}

/** Chave CSS normalizada para um escalão.
 *   "Sub 12"        → "sub12"
 *   "Sub-14"        → "sub14"
 *   "Sénior"        → "senior"   (acentos removidos)
 *   "Super Sénior"  → "supersenior"
 *   "MidAmateur"    → "midamateur"
 */
export function escKey(esc: string | null | undefined): string {
  return (esc || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[\s-]/g, "");
}

/** Mapeamento dos termos da federação espanhola (RFEG) → Sub-N CSS class.
 *  Permite que `<EscPill esc="Alevín" />` use a mesma cor que `<EscPill esc="Sub-12" />`. */
const ES_TERM_TO_SUB: Record<string, string> = {
  benjamin: "sub10",
  benjamín: "sub10",
  alevin: "sub12",
  alevín: "sub12",
  infantil: "sub14",
  cadete: "sub16",
  junior: "sub18",
  juvenil: "sub21",
};
/** Mapeamento inverso (Sub-N → termo RFEG) — usado pelo RFEGPage para uniformizar. */
export const SUB_TO_ES_TERM: Record<string, string> = {
  "Sub-10": "Benjamín",
  "Sub-12": "Alevín",
  "Sub-14": "Infantil",
  "Sub-16": "Cadete",
  "Sub-18": "Junior",
  "Sub-21": "Juvenil",
  "Sub-25": "Sub-25",
};

/** Escalão — usa classes CSS globais (.p-sub14, etc.).
 *  Aceita também termos da RFEG (Alevín, Benjamín, etc.) → mapeados ao Sub-N
 *  equivalente para herdar a cor canónica do projecto. */
export function EscPill({ esc }: { esc: string }) {
  if (!esc) return null;
  const key = esc.toLowerCase().replace(/[\s-]/g, "");
  // 1) Termos espanhois (Alevín, etc.) → mapear para Sub-N CSS
  const esSubKey = ES_TERM_TO_SUB[key];
  if (esSubKey) {
    return <span className={`p p-sm p-${esSubKey}`}>{esc}</span>;
  }
  // 2) Sub-N directo ou escalão adulto (absoluto/midamateur/senior/supersenior)
  const hasCssClass = ["sub10","sub12","sub14","sub16","sub18","sub21","sub24","absoluto","midamateur","senior","supersenior"].includes(key);
  if (hasCssClass) return <span className={`p p-sm p-${key}`}>{esc}</span>;
  // 3) Fallback inline style
  const s = ESC_STYLE[key] ?? ESC_STYLE.default;
  return <span className="p p-sm" style={{ background: s.bg, color: s.color, borderColor: "transparent" }}>{esc}</span>;
}

/** REGIONAL / NACIONAL / INTL / PJA — substitui PillBadge.tsx */
const PILL_BADGE_CLASSES: Record<string, string> = {
  REGIONAL: "p p-sm p-tourn p-regional",
  NACIONAL: "p p-sm p-tourn p-nacional",
  INTL:     "p p-sm p-tourn p-intl",
  PJA:      "p p-sm p-tourn p-pja",
};
function normalizePill(raw: string): string {
  const p = raw.trim().toUpperCase();
  if (["AWAY","AWAY INTL","INTERNACIONAL","INTERN"].includes(p)) return "INTL";
  return p;
}
export function PillBadge({ pill }: { pill?: string }) {
  if (!pill) return null;
  const normalized = normalizePill(pill);
  const cls = PILL_BADGE_CLASSES[normalized];
  if (!cls) return null;
  const label = normalized === "INTL" ? "🌍 INTL"
    : normalized === "NACIONAL" ? "🇵🇹 NACIONAL"
    : normalized;
  return <span className={cls}>{label}</span>;
}

/** Ronda — só renderiza se nR > 1 */
export function RoundPill({ nR }: { nR: number }) {
  const style = PILL_ROUND[nR];
  if (nR <= 1 || !style) return null;
  return <span className="p p-sm p-tourn" style={style}>{nR}R</span>;
}

/** Tcode — um pill por tcode (dividir "10370+10371" externamente) */
export function TcodePill({ tc }: { tc: string }) {
  if (!tc) return null;
  return <span className="p p-sm p-tourn" style={PILL_TCODE}>{tc}</span>;
}

/** 9 buracos */
export function NineHPill() {
  return <span className="p p-sm p-tourn" style={PILL_9H}>9H</span>;
}

/** Santo da Serra */
export function SserraPill() {
  return <span className="p p-sm p-tourn" style={PILL_SSERRA}>SSerra</span>;
}

/** NACIONAL auto-detectado */
export function NacionalPill() {
  return <span className="p p-sm p-tourn p-nacional">NACIONAL</span>;
}

/** JUNIOR auto-detectado */
export function JuniorPill() {
  return <span className="p p-sm p-tourn" style={PILL_JUNIOR}>JUNIOR</span>;
}

/** ★ Manuel */
export function ManuelPill() {
  return <span className="p p-sm" style={PILL_MANUEL}>★ Manuel</span>;
}

/** Clube organizador */
export function ClubePill({ clube, ccode }: { clube?: string | null; ccode?: string | null }) {
  const short = shortClubFromField(clube, ccode);
  if (!short) return null;
  return <span className="p p-sm p-club">{short}</span>;
}

/* ── YearPill ──────────────────────────────────────────────────────
 * Ano de nascimento. Paleta de 6 cores cíclicas (`year % 6`). A variante
 * anterior (2 cores par/ímpar) não dava para distinguir em tabelas
 * multi-escalão — ex: Regional Sub 14-24 junta nascimentos de 2003 a
 * 2013 (11 anos diferentes), onde 2 cores deixam tudo à frente dos
 * olhos a parecer igual.
 *
 * Cores escolhidas para NÃO colidirem com o resto da UI do projecto:
 *   - verde está reservado ao Manuel
 *   - todo o espectro roxo/violeta está reservado aos escalões (Sub-10..Sub-24)
 *
 * Todas pastel com foreground escuro (contraste AA para fs-10/11).
 * ────────────────────────────────────────────────────────────────── */
const YEAR_PALETTE: { bg: string; fg: string }[] = [
  { bg: "#dbeafe", fg: "#1e40af" },   // azul
  { bg: "#fef3c7", fg: "#78350f" },   // âmbar
  { bg: "#fce7f3", fg: "#9d174d" },   // rosa
  { bg: "#fed7aa", fg: "#7c2d12" },   // pêssego
  { bg: "#cffafe", fg: "#155e75" },   // ciano
  { bg: "#fecdd3", fg: "#881337" },   // vermelho-rosa
];

export function YearPill({ year }: { year: number | string | null | undefined }) {
  if (year == null || year === "") return <span className="muted">–</span>;
  const y = typeof year === "number" ? year : parseInt(String(year), 10);
  if (!Number.isFinite(y)) return <span className="muted">–</span>;
  // Módulo positivo — evita índices negativos se y for negativo (improvável, mas seguro).
  const idx = ((y % YEAR_PALETTE.length) + YEAR_PALETTE.length) % YEAR_PALETTE.length;
  const c = YEAR_PALETTE[idx];
  return (
    <span className="p p-sm" style={{
      background: c.bg,
      color: c.fg,
      border: "none",
    }}>{y}</span>
  );
}

export default PillBadge;
