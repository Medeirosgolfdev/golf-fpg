// @refresh reset
/**
 * PillBadge.tsx — FONTE ÚNICA de todos os pills da aplicação
 *
 * Exporta:
 *   Estilos:    SIDEBAR_ACCENT, ESC_STYLE (as cores das pílulas de torneio vivem em
 *               classes do App.css: .p-tcode/.p-9h/.p-sserra/.p-junior/.p-manuel/.p-om)
 *   Dados:      CCODE_SHORT
 *   Funções:    clubeFromCcode, shortClubFromField
 *   Componentes: Pill (base), EscPill, PillBadge, RoundPill,
 *               TcodePill, SserraPill, JuniorPill, ManuelPill, NacionalPill
 *
 * Todos os pills usam sempre className="p p-sm [p-tourn]" (App.css global)
 * para garantir tamanho e padding uniformes.
 * As cores vêm de classes (tokens.css); `style` só para cores que vêm dos dados.
 *
 * PillBadge.tsx e tournamentPrimitives.tsx devem re-exportar daqui.
 */

import React from "react";
import { C } from "../utils/colors";
import { MUTED } from "./tableCells";
import { Tint } from "./DataStyle";

/* ════════════════════════════════════════════════════════════
   ESTILOS — cores por série/escalão (as das pílulas estão em classes no App.css)
   ════════════════════════════════════════════════════════════ */

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
const CCODE_SHORT: Record<string, string> = {
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

function clubeFromCcode(ccode?: string | null): string | null {
  if (!ccode) return null;
  const key = String(ccode).padStart(3, "0");
  return CCODE_SHORT[key] ?? null;
}

function shortClubFromField(clube?: string | null, ccode?: string | null): string | null {
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
  children, className = "", tourn = false, title,
}: {
  children: React.ReactNode;
  className?: string;
  tourn?: boolean;
  title?: string;
}) {
  return (
    <span className={`p p-sm${tourn ? " p-tourn" : ""}${className ? " " + className : ""}`} title={title}>
      {children}
    </span>
  );
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

/** A classe de cor de um escalão (`p-sub12`, `p-absoluto`…) — a MESMA do
 *  EscPill, também para as pílulas de nascimento/idade (BirthPill). Aceita os
 *  termos da RFEG (Alevín → sub12) e «Sénior»; null = sem cor própria. */
export function escClassOf(esc: string | null | undefined): string | null {
  if (!esc) return null;
  const key = esc.toLowerCase().replace(/[\s-]/g, "").replace("é", "e");
  const sub = ES_TERM_TO_SUB[key] ?? key;
  return ["sub10","sub12","sub14","sub16","sub18","sub21","sub24","absoluto","midamateur","senior","supersenior"].includes(sub)
    ? `p-${sub}` : null;
}

/** Escalão — usa classes CSS globais (.p-sub14, etc.).
 *  Aceita também termos da RFEG (Alevín, Benjamín, etc.) → mapeados ao Sub-N
 *  equivalente para herdar a cor canónica do projecto. */
export function EscPill({ esc, label }: { esc: string; /** Texto a mostrar, se não for o próprio escalão (ex.: «Sub-12 · USKids»). */ label?: string }) {
  if (!esc) return null;
  const key = esc.toLowerCase().replace(/[\s-]/g, "");
  // 1) Termos espanhois (Alevín, etc.), Sub-N directo ou escalão adulto
  const cls = escClassOf(esc);
  if (cls) return <span className={`p p-sm ${cls}`}>{label ?? esc}</span>;
  // 3) Fallback: cores do ESC_STYLE (pelo Tint)
  const s = ESC_STYLE[key] ?? ESC_STYLE.default;
  return <Tint className="p p-sm u-border-color-transparent" bg={s.bg} fg={s.color}>{label ?? esc}</Tint>;
}

/** Circuito de origem de um torneio/jogador (FPG · USKids · Internacional) — Draws. */
export type Circuito = "FPG" | "USKids" | "Intl";
const CIRCUIT_PILL: Record<Circuito, { emoji: string; label: string; title: string; cls: string }> = {
  FPG:    { emoji: "🇵🇹", label: "FPG",    title: "FPG",                            cls: "p-circ-fpg" },
  USKids: { emoji: "🇺🇸", label: "USKids", title: "USKids",                         cls: "p-circ-uskids" },
  Intl:   { emoji: "🌍", label: "Intl",   title: "Internacional (Bluegolf/Doral)", cls: "p-circ-intl" },
};
export function CircuitPill({ circ }: { circ: Circuito }) {
  const p = CIRCUIT_PILL[circ];
  return <span className={`p p-sm p-circ ${p.cls}`} title={p.title}>{p.emoji} {p.label}</span>;
}

/** REGIONAL / NACIONAL / INTL / PJA / CN (inscrito no Campeonato Nacional) */
const PILL_BADGE_CLASSES: Record<string, string> = {
  REGIONAL: "p p-sm p-tourn p-regional",
  NACIONAL: "p p-sm p-tourn p-nacional",
  INTL:     "p p-sm p-tourn p-intl",
  PJA:      "p p-sm p-tourn p-pja",
  CN:       "p p-sm p-cn",
};
function normalizePill(raw: string): string {
  const p = raw.trim().toUpperCase();
  if (["AWAY","AWAY INTL","INTERNACIONAL","INTERN"].includes(p)) return "INTL";
  return p;
}
export function PillBadge({ pill, title }: { pill?: string; title?: string }) {
  if (!pill) return null;
  const normalized = normalizePill(pill);
  const cls = PILL_BADGE_CLASSES[normalized];
  if (!cls) return null;
  const label = normalized === "INTL" ? "🌍 INTL"
    : normalized === "NACIONAL" ? "🇵🇹 NACIONAL"
    : normalized === "CN" ? "🏆 CN"
    : normalized;
  return <span className={cls} title={title}>{label}</span>;
}

/** Posição num ranking — «🏆 WAGR #N». */
export function RankPill({ label, value }: { label: string; value: number | string }) {
  return <span className="p p-rank">🏆 {label} #{value}</span>;
}

/** Contagem de vitórias — «🏆 3» (a mesma em todas as listas). */
export function TrophyCount({ n, title }: { n: number; title?: string }) {
  return <span className="trophy-count" title={title}>🏆 {n}</span>;
}

/** Classes da pílula de ronda: 2R/3R/4R com cor própria, as outras neutras. */
export function roundPillClass(n: number): string {
  return `p p-sm p-tourn p-round${n >= 2 && n <= 4 ? ` p-round-${n}` : ""}`;
}

/** Ronda — só renderiza se nR > 1 (2R, 3R, 4R) */
export function RoundPill({ nR }: { nR: number }) {
  if (nR <= 1 || nR > 4) return null;
  return <span className={roundPillClass(nR)}>{nR}R</span>;
}

/** Tcode — um pill por tcode (dividir "10370+10371" externamente) */
export function TcodePill({ tc }: { tc: string }) {
  if (!tc) return null;
  return <span className="p p-sm p-tourn p-tcode">{tc}</span>;
}

/** 9 buracos */
export function NineHPill() {
  return <span className="p p-sm p-tourn p-9h">9H</span>;
}

/** Santo da Serra */
export function SserraPill() {
  return <span className="p p-sm p-tourn p-sserra">SSerra</span>;
}

/** NACIONAL auto-detectado */
export function NacionalPill() {
  return <span className="p p-sm p-tourn p-nacional">NACIONAL</span>;
}

/** JUNIOR auto-detectado */
export function JuniorPill() {
  return <span className="p p-sm p-tourn p-junior">JUNIOR</span>;
}

/** ★ Manuel */
export function ManuelPill() {
  return <span className="p p-sm p-manuel">★ Manuel</span>;
}

/** Ordem de Mérito CGSS — marca torneios que contam para a OM do clube.
 *  `level` (A/B/C) vai só no tooltip; o pill mostra "OM". */
export function OmPill({ level }: { level?: string | null }) {
  const t = level ? `Conta para a Ordem de Mérito CGSS · Nível ${level}` : "Conta para a Ordem de Mérito CGSS";
  return <span className="p p-sm p-tourn p-om" title={t}>OM{level ? `·${level}` : ""}</span>;
}

/** Pill da modalidade de jogo, com a palavra tal como vem escrita (FPG ou
 *  Termos): uma cor por modalidade — Stroke Play/Medal (pancadas, sem handicap)
 *  verde · Medal Net azul · Stableford Net azul-petróleo · Stableford Gross
 *  castanho. Quebra em 2 linhas quando a coluna é estreita. */
export function ModalidadePill({ nome, title }: { nome: string; title?: string }) {
  const net = /\bnet\b/i.test(nome);
  const cls = /stableford/i.test(nome) ? (net ? "p-mod-stbnet" : "p-mod-stbgross") : (net ? "p-mod-medalnet" : "p-mod-stroke");
  return <span className={`p p-sm p-mod ${cls}`} title={title}>{nome}</span>;
}

/** PCC oficial ≠ 0 de uma volta. `round` só em torneios de várias voltas. */
export function PccPill({ pcc, round }: { pcc: number; round?: number }) {
  if (!pcc) return null;
  const txt = `PCC ${pcc > 0 ? "+" : "−"}${Math.abs(pcc)}`;
  const t = pcc < 0
    ? "PCC oficial da FPG: dia mais fácil do que o normal — o SD desta volta sobe cerca de 1"
    : `PCC oficial da FPG: dia mais difícil do que o normal — o SD desta volta desce cerca de ${pcc}`;
  return (
    <span className={"p p-sm p-tourn p-pcc " + (pcc < 0 ? "p-pcc-neg" : pcc === 1 ? "p-pcc-pos1" : pcc === 2 ? "p-pcc-pos2" : "p-pcc-pos3")} title={t}>
      {round ? `R${round} ` : ""}{txt}
    </span>
  );
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
const YEAR_PALETTE: readonly { bg: string; fg: string }[] = C.yearPills;

/** Etiqueta SCRATCH / HCP de uma prova (`scoringType` publicado pela federação). */
export function ScoringTag({ scoringType }: { scoringType?: string | null }) {
  if (!scoringType) return null;
  const scratch = /SCRATCH/i.test(scoringType);
  return (
    <span title={scratch ? "Competição scratch (gross)" : "Competição com handicap (net)"} className={"scoring-tag " + (scratch ? "scratch" : "hcp")}>
      {scratch ? "SCRATCH" : "HCP"}
    </span>
  );
}

export function YearPill({ year }: { year: number | string | null | undefined }) {
  if (year == null || year === "") return MUTED;
  const y = typeof year === "number" ? year : parseInt(String(year), 10);
  if (!Number.isFinite(y)) return MUTED;
  // Módulo positivo — evita índices negativos se y for negativo (improvável, mas seguro).
  const idx = ((y % YEAR_PALETTE.length) + YEAR_PALETTE.length) % YEAR_PALETTE.length;
  const c = YEAR_PALETTE[idx];
  return (
    <Tint className="p p-sm u-bd-none" bg={c.bg} fg={c.fg}>{y}</Tint>
  );
}


