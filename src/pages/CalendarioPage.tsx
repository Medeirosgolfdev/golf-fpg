/**
 * CalendarioPage.tsx — Calendário Multi-Fonte 2026
 *
 * Código de cores:
 *  • Azuis — CGSS Santo da Serra (Majors, O.M., Pares, Regional, etc.)
 *  • Violeta — Drive Challenge (todas as zonas)
 *  • Verde — Drive Tour (Sul/Norte/Tejo)
 *  • Esmeralda — Drive Tour Madeira
 *  • Índigo — Circuito AQUAPOR
 *  • Roxo — Torneios FPG
 *  • Vermelho/Laranja — Internacionais & Nacionais em destaque
 *
 * Drive Challenge/Tour Madeira: entradas do CGSS ocultadas
 * quando duplicam a mesma prova no calendário FPG.
 */
import { useState, useRef, useEffect, useMemo } from "react";
import { C } from "../utils/colors";
import type { PlayersDb } from "../data/types";
import { useAppContext } from "../context/AppContext";
import { usePasswordGate } from "../hooks/usePasswordGate";
import PasswordGate from "../ui/PasswordGate";
import { useIsMobile } from "../hooks/useIsMobile";
import { clickableA11y } from "../utils/a11y";
import { norm } from "../utils/format";
import { schoolDay, isFreeDay, freeDayReason } from "../data/schoolCalendar";
import { CAL_DEFS, EVENTS, DOB_OVERRIDES, ANO_BASE, ANO_FIM } from "../data/calendarEvents";
import type { CalEvent, CalGroup, CalDef } from "../data/calendarEvents";
import { MONTHS_PT as MONTHS_SHORT, MONTHS_PT_LONG } from "../utils/format";

interface CalendarSource {
  id: string;
  name: string;
  color: string;
  group: CalGroup;
}

/* ═══ Paleta ═══
   Uma COR-MÃE por família e, dentro dela, tons do escuro ao claro por ordem de
   importância. Antes cada calendário tinha a sua cor à sorte — as onze viagens
   eram onze cores diferentes, e o "FPG Jr" usava a dos US Kids — o que fazia o
   calendário parecer um saco de missangas em vez de dizer, à distância, de que
   tipo de compromisso se trata. */
const FAMILIA: Record<CalGroup, string> = {
  CGSS:     "#1d4ed8",   // azul — o clube
  JUNIOR:   "#047857",   // verde-esmeralda — academia júnior
  DRIVE:    "#7c3aed",   // violeta — circuito Drive
  FPG:      "#be185d",   // magenta — federação
  DESTAQUE: "#b91c1c",   // vermelho — as provas que contam
  ANIVER:   "#9ca3af",   // cinzento neutro — aniversários (contexto, não agenda)
  VIAGENS:  "#0e7490",   // ciano — deslocações (céu e mar, e não compete com as provas)
};

/** Tom `i` de `n` dentro da família: mesma cor, cada vez mais clara. */
function tom(base: string, i: number, n: number): string {
  const [r, g, b] = [1, 3, 5].map(k => parseInt(base.slice(k, k + 2), 16) / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  const h = d === 0 ? 0
    : max === r ? ((g - b) / d + (g < b ? 6 : 0)) / 6
    : max === g ? ((b - r) / d + 2) / 6
    : ((r - g) / d + 4) / 6;
  const passo = n <= 1 ? 0 : (i / (n - 1));
  const L = Math.min(0.78, l + passo * 0.30);          // clareia
  const S = Math.max(0.25, s - passo * 0.22);          // e dessatura um pouco
  const c = (1 - Math.abs(2 * L - 1)) * S, x = c * (1 - Math.abs(((h * 6) % 2) - 1)), m = L - c / 2;
  const seg = Math.floor(h * 6) % 6;
  const rgb = [[c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x]][seg];
  return "#" + rgb.map(v => Math.round((v + m) * 255).toString(16).padStart(2, "0")).join("");
}

/* ═══ Calendar Sources ═══
   A ordem DENTRO de cada família é a ordem dos tons: primeiro o que mais pesa. */
const CALENDARS: CalendarSource[] = (() => {
  const porGrupo = new Map<string, CalDef[]>();
  for (const d of CAL_DEFS) {
    if (d.color) continue;                       // cor própria não entra na rampa
    const a = porGrupo.get(d.group) ?? []; a.push(d); porGrupo.set(d.group, a);
  }
  return CAL_DEFS.map(d => {
    if (d.color) return { id: d.id, name: d.name, color: d.color, group: d.group };
    const fam = porGrupo.get(d.group)!;
    return { id: d.id, name: d.name, group: d.group, color: tom(FAMILIA[d.group], fam.indexOf(d), fam.length) };
  });
})();

const CAL_MAP = new Map(CALENDARS.map(c => [c.id, c]));

/* ═══ Helpers ═══ */
function monthLabel(m: number) { return `${MONTHS_PT_LONG[m]} (${String(m + 1).padStart(2, "0")})`; }
const DAYS_SHORT = ["S","T","Q","Q","S","S","D"];
const DAYS_PT = ["Seg","Ter","Qua","Qui","Sex","Sáb","Dom"];
const DAY_NAMES = ["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"]; // indexed by JS getDay()
const GROUP_LABELS: Record<string, string> = {
  CGSS: "CGSS — Santo da Serra",
  JUNIOR: "Junior CGSS — Academia",
  DRIVE: "Drive",
  FPG: "FPG — Federação",
  DESTAQUE: "Destaque",
  ANIVER: "🎂 Aniversários",
  VIAGENS: "✈ Viagens",
};

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
/* ═══ Meses ═══
   O calendário deixou de viver só em 2026: já tem o ano lectivo 2026/27 e as
   provas de 2027 vão entrando. A navegação passa a andar num índice ABSOLUTO
   de mês desde Janeiro de 2026 — assim ‹ › atravessam a viragem do ano sem
   caso especial. */
const MI_MAX = (ANO_FIM - ANO_BASE + 1) * 12 - 1;
const miAno = (mi: number) => ANO_BASE + Math.floor(mi / 12);
const miMes = (mi: number) => ((mi % 12) + 12) % 12;
const miDe = (d: Date) => Math.min(MI_MAX, Math.max(0, (d.getFullYear() - ANO_BASE) * 12 + d.getMonth()));

function getMonthDays(year: number, month: number) {
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const days: { date: Date; inMonth: boolean }[] = [];
  // Monday-first offset: (0=Mon ... 6=Sun)
  const offset = (first.getDay() + 6) % 7;
  for (let i = offset; i > 0; i--)
    days.push({ date: new Date(year, month, 1 - i), inMonth: false });
  for (let d = 1; d <= last.getDate(); d++)
    days.push({ date: new Date(year, month, d), inMonth: true });
  // fill to complete the last week (minimal trailing)
  const rem = (7 - (days.length % 7)) % 7;
  for (let i = 1; i <= rem; i++)
    days.push({ date: new Date(year, month + 1, i), inMonth: false });
  return days;
}
function eventOnDay(e: CalEvent, d: Date) {
  if (isSameDay(e.date, d)) return true;
  return !!(e.endDate && d >= e.date && d <= e.endDate);
}
function fmtRange(e: CalEvent): string {
  const o: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" };
  if (!e.endDate || isSameDay(e.date, e.endDate))
    return `${DAY_NAMES[e.date.getDay()]}, ${e.date.toLocaleDateString("pt-PT", o)} ${e.date.getFullYear()}`;
  return `${e.date.toLocaleDateString("pt-PT", o)} – ${e.endDate.toLocaleDateString("pt-PT", o)} ${e.date.getFullYear()}`;
}
function calColor(e: CalEvent): string { return CAL_MAP.get(e.calId)?.color ?? "var(--text-3)"; }

/* Highlighted "full-cell" events */
const HIGHLIGHT: Record<string, { bg: string; border: string; text: string; icon: string; cls: string }> = {
  pessoal:       { bg: C.cal.hl_pessoal_bg, border: C.cal.hl_pessoal_border, text: C.cal.hl_pessoal_text, icon: "🎂", cls: "hl-green" },
};
/* As barras não animam. O pulsar chamava a atenção para o sítio errado e, num
   evento de vários dias, repetia-se célula a célula. O destaque faz-se com a
   cor cheia e o peso do texto. */
const HL_BAR: Record<string, string> = {};
function isHighlight(e: CalEvent) { return e.calId in HIGHLIGHT; }

/** Já passou? Compara-se por DIA: um evento de hoje ainda é de hoje, mesmo
 *  que a hora já tenha passado. (Com `new Date()` cru, tudo o que era de hoje
 *  nascia esbatido a partir da meia-noite.) */
function jaPassou(e: CalEvent, hoje: Date): boolean {
  const fim = e.endDate || e.date;
  const f = new Date(fim.getFullYear(), fim.getMonth(), fim.getDate()).getTime();
  const h = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate()).getTime();
  return f < h;
}

/* ═══ O que é DELE ═══
   O calendário mistura duas coisas: a agenda do Manuel e o calendário geral do
   clube/federação, que é o pano de fundo onde ela se insere. As provas em que
   ele NÃO entra ficam esbatidas — continuam lá, para se perceber o contexto e
   as sobreposições, mas deixam de disputar a atenção com o que ele vai jogar.

   ⚠ A regra é por CALENDÁRIO, não por prova: quem decide é a natureza do
   evento. As excepções (uma prova de adultos que ele foi jogar, ou uma prova
   juvenil que ele falha) marcam-se à mão em MANUEL_EXCEPCOES, pelo título. */
const NAO_DELE = new Set<string>([
  "cgss_pares",       // Campeonato do Clube de Pares — prova de duplas de sócios
  "cgss_ouro",        // Ranking Ouro — provas dos adultos do clube
  "cgss_patrocin",    // torneios de patrocinador (Diário de Notícias, BPI, …)
  "cgss_regional",    // Campeonatos Regionais Absolutos
  "cgss_fpg",         // Campeonatos Nacionais Absolutos / de Clubes
  "fpg_aquapor",      // Circuito AQUAPOR — sete provas, todas no continente
  "fpg_torneios",     // provas nacionais de absolutos (Taça FPG, Lisbon Cup, …)
  "jr_fpg",           // Campeonato Nacional Individual Absoluto
  "bday_sub10", "bday_sub12", "bday_sub14", "bday_sub16", "bday_sub18",
  "bday_pja", "bday_outros",   // aniversários dos outros miúdos
]);
/* Excepções por TÍTULO (`includes`, sem maiúsculas nem acentos a contar) —
   para quando o calendário do evento não chega para decidir. */
/** É dele — ou é para ver em família — apesar de o calendário dizer que não.
 *  O Nacional de Badminton da irmã é o exemplo: vão todos, e ela vai a
 *  campeã nacional. */
const MANUEL_EXCEPCOES: string[] = ["Campeonato Nacional Badminton", "Nacional de 2ª, 3ª e 4ª Categorias"];
/** Os que levam contorno, para saltarem à vista sem precisarem de animação
 *  (que num evento de vários dias fica a gritar). */
const EM_DESTAQUE: string[] = ["Campeonato Nacional Badminton"];
function emDestaque(e: CalEvent): boolean {
  return EM_DESTAQUE.some(x => norm(e.title).includes(norm(x)));
}
/** NÃO é dele, apesar de o calendário dizer que sim.
 *  ⚠ O calendário «Internacionais» mistura as provas juvenis que ele joga
 *  (Faldo Series, Castro Marim U14, Greatgolf, World Kids) com o circuito
 *  profissional; e o «Regional Jr» mistura os Campeonatos de Jovens com os
 *  Absolutos, que são de gente crescida. */
const NAO_DELE_TITULOS: string[] = ["Open de Portugal", "Absoluto"];
/** Provas que ele não vai jogar por CHOQUE de agenda — o título sozinho não
 *  chega, porque a prova existe e noutro ano pode ser a que ele joga.
 *  ⚠ 5 de Setembro: está na Comporta para o PJA do Torre, logo não pode estar
 *  no Santo da Serra. */
const NAO_VAI: { titulo: string; data: string }[] = [
  { titulo: "Torneio Quinta de São João", data: "2026-09-05" },
  // 10 de Outubro: Final Nacional do Drive Challenge no Jamor (está apurado).
  { titulo: "Troféu João Sousa", data: "2026-10-10" },
  // 7 de Novembro: Final do Drive Tour em Oeiras.
  { titulo: "Torneio de São Martinho", data: "2026-11-07" },
];
const diaISO = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
/** Prova que ele NÃO PODE jogar por estar noutro sítio nesse dia. */
function naoPode(e: CalEvent): boolean {
  const dia = diaISO(e.date);
  return NAO_VAI.some(x => x.data === dia && norm(e.title).includes(norm(x.titulo)));
}
function isDele(e: CalEvent): boolean {
  if (naoPode(e)) return false;
  if (NAO_DELE_TITULOS.some(x => norm(e.title).includes(norm(x)))) return false;
  if (MANUEL_EXCEPCOES.some(x => norm(e.title).includes(norm(x)))) return true;
  return !NAO_DELE.has(e.calId);
}
/** Quanto se vê um evento. A agenda do Manuel a 100%; o calendário do clube
 *  em surdina; os aniversários dos outros miúdos ainda mais abaixo — são
 *  muitos e diários, e a cheio tapavam o resto. */
function opacidadeDe(e: CalEvent): number {
  if (isDele(e)) return 1;
  // Impossível de jogar (está noutro sítio): esbatida, mas ainda legível —
  // são provas dele que se perdem, não pano de fundo.
  if (naoPode(e)) return 0.45;
  return e.calId.startsWith("bday_") ? 0.22 : 0.3;
}

/** Nível da Ordem de Mérito do CGSS a que a prova conta (A/B/C), ou null.
 *  É o que decide quantos pontos ela vale — ver a tab 🏅 da FPGPage — por isso
 *  merece estar à vista no calendário, e não só no nome do calendário. */
const OM_NIVEL: Record<string, "A" | "B" | "C"> = {
  cgss_major: "A", cgss_om_b: "B", cgss_om_c: "C",
};
function omNivel(e: CalEvent): "A" | "B" | "C" | null { return OM_NIVEL[e.calId] ?? null; }


type EvPos = "single" | "start" | "mid" | "end";
function getEvPos(e: CalEvent, day: Date, weekStart: Date, weekEnd: Date): EvPos {
  if (!e.endDate || isSameDay(e.date, e.endDate)) return "single";
  const effStart = e.date < weekStart ? weekStart : e.date;
  const effEnd = e.endDate > weekEnd ? weekEnd : e.endDate;
  const isS = isSameDay(day, effStart);
  const isE = isSameDay(day, effEnd);
  if (isS && isE) return "single";
  if (isS) return "start";
  if (isE) return "end";
  return "mid";
}

/** Sort events for consistent lane ordering: multi-day first (by start, then length desc), then single */
function sortEventsForGrid(evts: CalEvent[]): CalEvent[] {
  return [...evts].sort((a, b) => {
    const aMulti = a.endDate && !isSameDay(a.date, a.endDate) ? 1 : 0;
    const bMulti = b.endDate && !isSameDay(b.date, b.endDate) ? 1 : 0;
    if (aMulti !== bMulti) return bMulti - aMulti; // multi-day first
    if (aMulti && bMulti) {
      const diff = a.date.getTime() - b.date.getTime();
      if (diff !== 0) return diff;
      return (b.endDate!.getTime() - b.date.getTime()) - (a.endDate!.getTime() - a.date.getTime());
    }
    return a.date.getTime() - b.date.getTime();
  });
}

/* ═══ Sub-components ═══ */

function MiniCal({ year, month, onSelect, selected, visibleEvents }: {
  year: number; month: number; selected: Date | null;
  onSelect: (d: Date) => void; visibleEvents: CalEvent[];
}) {
  const days = getMonthDays(year, month);
  const today = new Date();
  return (
    <div className="cal-no-select">
      <div className="ta-c cal-week-grid">
        {DAYS_SHORT.map((d, i) => (
          <div key={i} className="fs-10 c-text-3 fw-600 cal-day-label">{d}</div>
        ))}
        {days.map((d, i) => {
          const isToday = isSameDay(d.date, today);
          const isSel = selected && isSameDay(d.date, selected);
          const has = visibleEvents.some(e => eventOnDay(e, d.date));
          // Pano de fundo do ano lectivo: os dias COM aulas ficam esbatidos, para
          // se ver de relance se uma viagem cai em período de escola. Os dias
          // úteis sem aulas (interrupções, mid-term, conference days) ficam
          // limpos e dizem o motivo ao passar o rato.
          const sd = schoolDay(d.date);
          const livreMini = isFreeDay(d.date);
          return (
            <div key={i} onClick={() => onSelect(d.date)} {...clickableA11y(() => onSelect(d.date))} className="cal-day-cell" style={{
              color: !d.inMonth ? "var(--border)" : isToday ? "#fff" : isSel ? "var(--accent)" : "var(--text)",
              backgroundColor: isToday ? "var(--accent)" : isSel ? "var(--accent-light)"
                : livreMini ? "var(--cal-livre-bg)" : sd.tipo === "aulas" ? "var(--cal-escola-bg)" : "transparent",
              fontWeight: isToday || isSel ? 600 : 400,
            }} title={livreMini ? `Livre — ${freeDayReason(d.date)}` : sd.tipo === "aulas" ? `Escola — ${sd.periodo}` : undefined}>
              {d.date.getDate()}
              {has && d.inMonth && !isToday && (
                <span className="cal-dot-indicator" style={{ width: 3, height: 3, background: "var(--accent)" }} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function EventPopup({ event, onClose }: { event: CalEvent; onClose: () => void }) {
  const color = calColor(event);
  const calName = CAL_MAP.get(event.calId)?.name ?? "";
  const ref = useRef<HTMLDivElement>(null);
  const hl = HIGHLIGHT[event.calId];
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    setTimeout(() => document.addEventListener("mousedown", h), 10);
    return () => document.removeEventListener("mousedown", h);
  }, [onClose]);
  return (
    <div className="cal-overlay" style={{ backdropFilter: "blur(3px)" }}>
      <div ref={ref} style={{ background: "var(--bg-card)", borderRadius: "var(--radius-xl)",
        boxShadow: "var(--shadow-lg)", width: 380, overflow: "hidden", animation: "calPopIn 0.2s ease" }}>
        <div style={{ background: hl ? hl.bg : color,
          padding: "14px 18px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
 <span className="uppercase fw-600 fs-12" style={{ color: hl ? hl.text : "#fff", letterSpacing: "0.04em" }}>
            {calName}
          </span>
          <button onClick={onClose} title="Fechar" aria-label="Fechar" style={{ background: hl ? "rgba(0,0,0,0.15)" : "rgba(255,255,255,0.2)", border: "none",
            color: hl ? hl.text : "#fff",
            width: 26, height: 26, borderRadius: "50%", cursor: "pointer", fontSize: "var(--fs-14)",
            display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
        </div>
        <div className="cal-sidebar">
          <div className="h-lg">{event.title}</div>
          <div className="d-flex flex-col gap-8">
            <InfoRow icon="📅" label={fmtRange(event)} />
            {event.modalidade && <InfoRow icon="🏌️" label={event.modalidade} />}
            {event.campo && <InfoRow icon="⛳" label={event.campo} />}
          </div>
          {event.note && (
            <div className="fs-12 fw-600" style={{ marginTop: 12, padding: "8px 10px",
              borderRadius: "var(--radius)", background: "var(--bg-warn)",
              border: "1px solid var(--color-warn)", color: "var(--color-warn-dark)" }}>
              {event.note}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
function InfoRow({ icon, label }: { icon: string; label: string }) {
  return (<div className="d-flex items-center gap-8">
    <span className="cal-day-num">{icon}</span>
    <span className="fs-13 c-text-2">{label}</span>
  </div>);
}

function ListView({ events, onSelect, scrollSignal = 0 }: { events: CalEvent[]; onSelect: (e: CalEvent) => void; scrollSignal?: number }) {
  const today = new Date();
  const todayMonthRef = useRef<HTMLDivElement>(null);
  const firstUpcomingRef = useRef<HTMLDivElement>(null);
  const grouped = useMemo(() => {
    const m = new Map<number, CalEvent[]>();
    for (const e of events) { const k = miDe(e.date); if (!m.has(k)) m.set(k, []); m.get(k)!.push(e); }
    const all = [...m.entries()].sort((a, b) => a[0] - b[0]);
    const cur = miDe(today);
    return [...all.filter(([k]) => k >= cur), ...all.filter(([k]) => k < cur)];
  }, [events]);

  // Primeiro evento hoje-ou-futuro — para ancorar o scroll no DIA (não só no mês).
  const todayKey = useMemo(() => {
    const t0 = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
    const up = events.find(e => {
      const ed = new Date(e.date.getFullYear(), e.date.getMonth(), e.date.getDate()).getTime();
      return ed >= t0;
    });
    return up?.id ?? null;
  }, [events]);

  useEffect(() => {
    const target = firstUpcomingRef.current || todayMonthRef.current;
    target?.scrollIntoView({ behavior: "instant", block: "start" });
  }, [todayKey, scrollSignal]);
  return (
    <div className="cal-page-inner">
      {grouped.map(([month, evts]) => {
        const isCur = month === miDe(today);
        return (
        <div key={month} ref={isCur ? todayMonthRef : undefined}>
          <div className="uppercase fs-13 fw-700" style={{ color: "var(--accent)",
            letterSpacing: "0.04em", marginBottom: 8, paddingBottom: 4, borderBottom: "2px solid var(--accent-light)" }}>
            {monthLabel(miMes(month))} {miAno(month)}
          </div>
          <div className="d-flex flex-col gap-4">
            {evts.map(e => {
              const c = calColor(e);
              const hl = HIGHLIGHT[e.calId];
              const isPast = jaPassou(e, today);
              const isFirstUpcoming = e.id === todayKey;
              return (
                <div key={e.id}
                  ref={isFirstUpcoming ? firstUpcomingRef : undefined}
                  onClick={() => onSelect(e)} {...clickableA11y(() => onSelect(e))}
                  style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px",
                    borderRadius: hl ? 8 : "var(--radius)", cursor: "pointer", transition: "background 0.15s",
                    background: hl ? `${hl.bg}18` : "transparent",
                    border: hl ? `2px solid ${hl.bg}66` : "2px solid transparent",
                    opacity: isPast ? 0.45 : opacidadeDe(e),
                  }}
                  onMouseEnter={ev => (ev.currentTarget.style.background = hl ? `${hl.bg}30` : "var(--bg-hover)")}
                  onMouseLeave={ev => (ev.currentTarget.style.background = hl ? `${hl.bg}18` : "transparent")}>
                  <div className="col-w42 ta-c shrink-0">
 <div className="uppercase fw-500 fs-10" style={{ color: hl ? hl.border : "var(--text-3)" }}>{DAY_NAMES[e.date.getDay()]}</div>
 <div className="fw-600 fs-18" style={{ color: hl ? hl.border : "var(--text)", lineHeight: 1.2 }}>{e.date.getDate()}</div>
                  </div>
                  <div style={{ width: 4, alignSelf: "stretch", borderRadius: "var(--radius-xs)",
                    background: hl ? hl.bg : c, flexShrink: 0 }} />
                  <div className="flex-1" style={{ minWidth: 0 }}>
                    <div className="text-ellipsis fs-13 fw-600" style={{ color: "var(--text)" }}>
                      {hl ? `${hl.icon} ` : ""}{omNivel(e) ? <span className="p p-sm" style={{ marginRight: 4, fontWeight: 800, fontSize: 9 }} title={`Ordem de Mérito CGSS — Nível ${omNivel(e)}`}>{omNivel(e)}</span> : null}{e.title}
                    </div>
                    <div className="fs-11 c-text-3 mt-4" >
                      {e.modalidade}{e.modalidade && " · "}{e.campo}
                    </div>
                  </div>
                  <span className="fs-10 fw-600" style={{ padding: "2px 8px", borderRadius: "var(--radius-lg)",
                    background: hl ? hl.bg : c,
                    color: hl ? hl.text : "#fff", whiteSpace: "nowrap", flexShrink: 0 }}>
                    {CAL_MAP.get(e.calId)?.name ?? ""}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
        );
      })}
      {grouped.length === 0 && (
        <div className="ta-c c-text-3 p-40">Sem provas visíveis.</div>
      )}
    </div>
  );
}

/* ═══ Main Component ═══ */
type ViewMode = "month" | "list";
type GroupKey = "CGSS" | "JUNIOR" | "DRIVE" | "FPG" | "DESTAQUE" | "ANIVER" | "VIAGENS";

export default function CalendarioPage() {
  const { players } = useAppContext();
  const { unlocked, unlock } = usePasswordGate();

  if (!unlocked) return <PasswordGate onUnlock={unlock} />;

  return <CalendarioContent players={players} />;
}

function CalendarioContent({ players }: { players?: PlayersDb }) {
  const [currentMonth, setCurrentMonth] = useState(() => {
    const now = new Date();
    return now.getFullYear() >= ANO_BASE ? miDe(now) : 0;
  });
  const [selectedEvent, setSelectedEvent] = useState<CalEvent | null>(null);
  // Em mobile, abrir por defeito em "list" — o grid mensal de 7 colunas
  // fica muito apertado em telemóveis. Lazy init para só ser avaliado 1×.
  const [viewMode, setViewMode] = useState<ViewMode>(() =>
    typeof window !== "undefined" && window.innerWidth <= 768 ? "list" : "month"
  );
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [dayPopup, setDayPopup] = useState<Date | null>(null);
  const BDAY_IDS_OFF = ["bday_sub10","bday_sub12","bday_sub14","bday_sub16","bday_sub18","bday_outros"];
  const [enabledCals, setEnabledCals] = useState<Set<string>>(
    () => new Set(CALENDARS.map(c => c.id).filter(id => !BDAY_IDS_OFF.includes(id)))
  );
  const [expandedCal, setExpandedCal] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const isMobile = useIsMobile();
  const [searchQ, setSearchQ] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  /* Generate birthday events from players */
  const allEvents = useMemo(() => {
    if (!players) return EVENTS;
    const bdayEvs: CalEvent[] = [];
    let bdayId = 90000;

    const escalaoToCalId: Record<string, string> = {
      "Sub-10": "bday_sub10", "Sub-12": "bday_sub12", "Sub-14": "bday_sub14",
      "Sub-16": "bday_sub16", "Sub-18": "bday_sub18",
    };

    for (const [fed, p] of Object.entries(players)) {
      const ovr = DOB_OVERRIDES[fed];        // correcção manual ganha ao players.json
      const dobStr = ovr?.dob ?? p.dob;
      if (!dobStr || p.tags?.includes("no-priority")) continue;
      const parts = dobStr.split("-");
      if (parts.length < 3) continue;
      const m = parseInt(parts[1], 10) - 1; // 0-indexed month
      const d = parseInt(parts[2], 10);
      if (isNaN(m) || isNaN(d) || d < 1 || d > 31) continue;
      const birthYear = parseInt(parts[0], 10);
      const firstName = p.name.split(" ")[0];
      const isPJA = p.tags?.includes("PJA");
      const calId = isPJA ? "bday_pja" : (escalaoToCalId[p.escalao] || "bday_outros");
      // Um evento por ANO coberto — o calendário já atravessa 2026 e 2027.
      for (let ano = ANO_BASE; ano <= ANO_FIM; ano++) {
        bdayEvs.push({
          id: ++bdayId,
          calId,
          title: `🎂 ${firstName} — ${ano - birthYear} anos`,
          date: new Date(ano, m, d),
          campo: "",
          modalidade: `${p.name} · #${fed}`,
          note: ovr?.note,
        });
      }
    }
    return [...EVENTS, ...bdayEvs];
  }, [players]);

  const [listScrollSignal, setListScrollSignal] = useState(0);
  const goToday = () => {
    const now = new Date();
    const m = now.getFullYear() >= ANO_BASE ? miDe(now) : 0;
    setCurrentMonth(m);
    setSelectedDate(now.getFullYear() >= ANO_BASE ? now : null);
    setListScrollSignal(v => v + 1);
  };

  /* Search */
  const searchResults = useMemo(() => {
    const q = norm(searchQ);
    if (!q || q.length < 2) return [];
    const words = q.split(/\s+/).filter(Boolean);
    return allEvents
      .filter(e => enabledCals.has(e.calId))
      .filter(e => {
        const hay = norm([e.title, e.campo, e.modalidade, CAL_MAP.get(e.calId)?.name || ""].join(" "));
        return words.every(w => hay.includes(w));
      })
      .sort((a, b) => a.date.getTime() - b.date.getTime())
      .slice(0, 20);
  }, [searchQ, allEvents, enabledCals]);

  useEffect(() => {
    const h = (e: MouseEvent) => { if (searchRef.current && !searchRef.current.contains(e.target as Node)) setSearchOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const goToEvent = (ev: CalEvent) => {
    setCurrentMonth(miDe(ev.date));
    setSelectedDate(ev.date);
    setSelectedEvent(ev);
    setSearchOpen(false);
    setSearchQ("");
  };

  const toggleCal = (id: string) => setEnabledCals(prev => {
    const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next;
  });
  const toggleGroup = (group: GroupKey) => {
    const ids = CALENDARS.filter(c => c.group === group).map(c => c.id);
    const allOn = ids.every(id => enabledCals.has(id));
    setEnabledCals(prev => {
      const next = new Set(prev);
      for (const id of ids) allOn ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const visibleEvents = useMemo(() =>
    allEvents.filter(e => enabledCals.has(e.calId)).sort((a, b) => a.date.getTime() - b.date.getTime()),
    [enabledCals, allEvents]
  );
  const monthDays = useMemo(() => getMonthDays(miAno(currentMonth), miMes(currentMonth)), [currentMonth]);
  const gridRows = monthDays.length / 7;
  // Máximo de eventos mostrados por célula antes de colapsar em "+N mais".
  // Meses de 6 semanas têm células mais baixas → limite menor para não cortar.
  const cellCap = gridRows >= 6 ? 5 : 8;
  const today = new Date();
  const groups: GroupKey[] = ["CGSS", "JUNIOR", "DRIVE", "FPG", "DESTAQUE", "ANIVER", "VIAGENS"];

  return (
    <div className="cal-page">

      {/* ── Sidebar ── */}
      <div className={`sidebar cal-sidebar-main ${sidebarOpen ? "" : "sidebar-closed"}`}>

        {/* Mini cal */}
        <div>
          <div className="flex-between-mb6">
            <span className="fs-13 fw-700 c-text">{monthLabel(miMes(currentMonth))} {miAno(currentMonth)}</span>
            <div className="d-flex gap-2">
              <SmBtn l="‹" onClick={() => setCurrentMonth(m => Math.max(0, m - 1))} dis={currentMonth <= 0} />
              <SmBtn l="›" onClick={() => setCurrentMonth(m => Math.min(MI_MAX, m + 1))} dis={currentMonth >= MI_MAX} />
            </div>
          </div>
          <MiniCal year={miAno(currentMonth)} month={miMes(currentMonth)} selected={selectedDate} visibleEvents={visibleEvents}
            onSelect={d => { setSelectedDate(d); setCurrentMonth(miDe(d)); }} />
        </div>

        {/* Calendar toggles */}
        <div className="d-flex flex-col gap-6">
          {groups.map(g => {
            const cals = CALENDARS.filter(c => c.group === g);
            const groupCount = allEvents.filter(e => cals.some(c => c.id === e.calId)).length;
            const allOn = cals.every(c => enabledCals.has(c.id));
            return (
              <div key={g}>
                <button onClick={() => toggleGroup(g)} className="cal-toggle-btn">
                  <span className={`cal-toggle-check${allOn ? " on" : ""}`}>
                    {allOn ? "✓" : ""}
                  </span>
                  <span className="cal-toggle-label">{GROUP_LABELS[g]}</span>
                  <span className="fs-10 c-text-3 mono">{groupCount}</span>
                </button>
                <div className="d-flex flex-col gap-1" style={{ paddingLeft: 8, marginTop: 2 }}>
                  {cals.map(cal => {
                    const calEvts = allEvents.filter(e => e.calId === cal.id).sort((a, b) => a.date.getTime() - b.date.getTime());
                    const isExpanded = expandedCal === cal.id;
                    return (
                      <div key={cal.id}>
                        <div className="flex-center" style={{ gap: 0 }}>
                          {/* Checkbox */}
                          <button onClick={() => toggleCal(cal.id)} className="shrink-0" style={{ width: 28, height: 26, border: "none", cursor: "pointer", background: "transparent", display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }}>
                            <span style={{
                              width: 12, height: 12, borderRadius: "var(--radius-xs)", transition: "all 0.15s",
                              background: enabledCals.has(cal.id) ? cal.color : "transparent",
                              border: `2px solid ${enabledCals.has(cal.id) ? cal.color : "var(--border)"}`,
                            }} />
                          </button>
                          {/* Name — click to expand */}
                          <button onClick={() => setExpandedCal(isExpanded ? null : cal.id)} style={{
                            flex: 1, display: "flex", alignItems: "center", gap: 4, minWidth: 0,
                            padding: "3px 4px", border: "none", cursor: "pointer", fontFamily: "inherit",
                            background: isExpanded ? "var(--accent-light)" : "transparent",
                            borderRadius: "var(--radius)", transition: "background 0.15s",
                          }}
                            onMouseEnter={e => { if (!isExpanded) e.currentTarget.style.background = "var(--bg-hover)"; }}
                            onMouseLeave={e => { e.currentTarget.style.background = isExpanded ? "var(--accent-light)" : "transparent"; }}>
                            <span className="text-ellipsis fs-11 ta-left" style={{
                              color: enabledCals.has(cal.id) ? "var(--text)" : "var(--text-3)",
                              flex: 1, fontWeight: isExpanded ? 600 : enabledCals.has(cal.id) ? 500 : 400,
                            }}>{cal.name}</span>
                            <span className="fs-10" style={{ fontFamily: "var(--font-mono)",
                              color: "var(--text-3)", flexShrink: 0 }}>{calEvts.length}</span>
                            <span className="fs-10" style={{ color: "var(--text-3)", flexShrink: 0, transition: "transform 0.15s",
                              transform: isExpanded ? "rotate(180deg)" : "none" }}>▼</span>
                          </button>
                        </div>
                        {/* Expanded event list */}
                        {isExpanded && (
                          <div className="cal-indent">
                            {calEvts.map(ev => {
                              const isPast = (ev.endDate || ev.date) < today;
                              const d = ev.date;
                              const dd = `${d.getDate()}/${d.getMonth() + 1}`;
                              return (
                                <button key={ev.id} onClick={() => {
                                  setCurrentMonth(miDe(d));
                                  setSelectedDate(d);
                                  setSelectedEvent(ev);
                                }} style={{
                                  display: "flex", alignItems: "center", gap: 6, width: "100%",
                                  padding: "3px 6px", border: "none", cursor: "pointer", fontFamily: "inherit",
                                  background: "transparent", borderRadius: "var(--radius)", transition: "background 0.12s",
                                  opacity: isPast ? 0.45 : 1,
                                }}
                                  onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-hover)")}
                                  onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                                  <span className="fs-10 fw-600 shrink-0" style={{ fontFamily: "var(--font-mono)", color: cal.color, minWidth: 30 }}>{dd}</span>
                                  <span className="text-ellipsis fs-10 ta-left" style={{ color: "var(--text-2)", flex: 1 }}>{ev.title}</span>
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Main ── */}
 <div className="flex-1 d-flex flex-col overflow-hidden">
        <div style={{ borderBottom: "1px solid var(--border-light)", flexShrink: 0 }}>
          <div className="gap-8 flex-wrap" style={{ display: "flex", alignItems: "center", padding: "8px 12px" }}>
            <button className="sidebar-toggle" onClick={() => setSidebarOpen(v => !v)} title={sidebarOpen ? "Fechar painel" : "Abrir painel"}>
              {sidebarOpen ? "◀" : "▶"}
            </button>
            <h2 className="cal-month-title fs-14"  style={{ margin: 0, whiteSpace: "nowrap" }}>Calendário {miAno(currentMonth)}</h2>
            <button onClick={goToday} className="p p-filter shrink-0" title="Ir para hoje" style={{ opacity: 1 }}>Hoje</button>
            <div ref={searchRef} style={{ position: "relative", flex: "1 1 120px", minWidth: 100, maxWidth: 220 }}>
              <input value={searchQ} onChange={e => { setSearchQ(e.target.value); setSearchOpen(true); }}
                onFocus={() => searchQ.length >= 2 && setSearchOpen(true)}
                placeholder="Pesquisar…"
                style={{ width: "100%", padding: "5px 8px 5px 26px", border: "1px solid var(--border)",
                  borderRadius: "var(--radius)", fontSize: "var(--fs-11)", fontFamily: "inherit",
                  background: "var(--bg-card)", color: "var(--text)", outline: "none" }}
                onKeyDown={e => { if (e.key === "Escape") { setSearchOpen(false); setSearchQ(""); } }} />
              <span style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)",
                fontSize: "var(--fs-12)", color: "var(--text-muted)", pointerEvents: "none" }}>🔍</span>
              {searchOpen && searchResults.length > 0 && (
                <div style={{ position: "absolute", top: "100%", left: 0, right: 0, marginTop: 4,
                  background: "var(--bg-card)", border: "1px solid var(--border-light)",
                  borderRadius: "var(--radius-lg)", boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
                  maxHeight: 320, overflowY: "auto", zIndex: "var(--z-sidebar)" }}>
                  {searchResults.map(ev => {
                    const cal = CAL_MAP.get(ev.calId);
                    const d = ev.date;
                    return (
                      <button key={ev.id} onClick={() => goToEvent(ev)} className="cal-search-result">
                        <span className="cal-search-dot" style={{ background: cal?.color || "var(--text-3)" }} />
                        <span className="cal-search-date">{d.getDate()}/{d.getMonth()+1}</span>
                        <span className="cal-search-title">{ev.title}</span>
                        {ev.campo && <span className="c-muted fs-10 shrink-0">{ev.campo}</span>}
                      </button>
                    );
                  })}
                </div>
              )}
              {searchOpen && searchQ.length >= 2 && searchResults.length === 0 && (
                <div style={{ position: "absolute", top: "100%", left: 0, right: 0, marginTop: 4,
                  background: "var(--bg-card)", border: "1px solid var(--border-light)",
                  borderRadius: "var(--radius-lg)", padding: "12px 16px",
                  color: "var(--text-3)" }} className="fs-11 ta-c">
                  Nenhum evento encontrado
                </div>
              )}
            </div>
            <div className="escalao-pills ml-auto shrink-0" >
              {(["month", "list"] as ViewMode[]).map(v => (
                <button key={v} onClick={() => setViewMode(v)}
                  className={`p p-filter${viewMode === v ? " active" : ""}`}>
                  {v === "month" ? "Mês" : "Lista"}
                </button>
              ))}
            </div>
          </div>
          <div className="gap-8" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "4px 12px 8px" }}>
            <button onClick={() => setCurrentMonth(m => Math.max(0, m-1))} title="Mês anterior" disabled={currentMonth <= 0}
              style={{ width: 32, height: 32, borderRadius: "50%", border: "1px solid var(--border)",
                background: "var(--bg-card)", cursor: currentMonth <= 0 ? "default" : "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: "var(--fs-18)", color: currentMonth <= 0 ? "var(--border)" : "var(--text-2)",
                flexShrink: 0 }}>‹</button>
            <span className="fw-700 ta-c" style={{ fontSize: "var(--fs-15)", color: "var(--text)", flex: 1 }}>
              {monthLabel(miMes(currentMonth))} {miAno(currentMonth)}
            </span>
            <span className="fs-11 c-text-3 mono shrink-0" >{visibleEvents.length} provas</span>
            <button onClick={() => setCurrentMonth(m => Math.min(MI_MAX, m+1))} title="Mês seguinte" disabled={currentMonth >= MI_MAX}
              style={{ width: 32, height: 32, borderRadius: "50%", border: "1px solid var(--border)",
                background: "var(--bg-card)", cursor: currentMonth >= MI_MAX ? "default" : "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: "var(--fs-18)", color: currentMonth >= MI_MAX ? "var(--border)" : "var(--text-2)",
                flexShrink: 0 }}>›</button>
          </div>
        </div>

        <div className="flex-1 scroll-y scroll-y">
          {!sidebarOpen && isMobile && (
            <button className="sidebar-back-btn" onClick={() => setSidebarOpen(true)}>▶ Filtros</button>
          )}
          {viewMode === "month" ? (
            <div className="cal-content">
              <div className="cal-week-header" style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)",
                borderBottom: "1px solid var(--border-light)", marginBottom: 4 }}>
                {DAYS_PT.map((d, i) => (
                  <div key={i} className="uppercase ta-c fs-11 fw-600 cal-dow" style={{ padding: "8px 0",
                    color: "var(--text-3)", letterSpacing: "0.04em" }}>{d}</div>
                ))}
              </div>
              <div className="cal-month-grid" style={{ flex: 1, display: "grid", gridTemplateColumns: "repeat(7,1fr)", gridTemplateRows: `repeat(${gridRows},1fr)` }}>
                {monthDays.map((d, i) => {
                  const dayEvts = sortEventsForGrid(visibleEvents.filter(e => eventOnDay(e, d.date)));
                  const isToday = isSameDay(d.date, today);
                  const isSel = selectedDate && isSameDay(d.date, selectedDate);
                  const hlEvt = dayEvts.find(e => isHighlight(e));
                  const weekIdx = Math.floor(i / 7);
                  const weekStart = monthDays[weekIdx * 7].date;
                  const weekEnd = monthDays[weekIdx * 7 + 6].date;
                  // Pano de fundo (ver src/data/schoolCalendar.ts): sombreiam-se os
                  // dias LIVRES de escola — fins-de-semana, interrupções, feriados e
                  // os dias soltos sem aulas. É onde há espaço para jogar e viajar,
                  // e são a minoria: sombrear os dias de aulas pintava quase tudo.
                  const livre = isFreeDay(d.date);
                  const sd = schoolDay(d.date);
                  const tipDia = livre ? `Livre — ${freeDayReason(d.date)}`
                    : sd.tipo === "aulas" ? `Escola — ${sd.periodo}` : undefined;
                  const CP = 4;

                  // Highlight cell: full colored square with icon + label
                  if (hlEvt && d.inMonth) {
                    const hl = HIGHLIGHT[hlEvt.calId];
                    // For multi-day: show title only on first day
                    const isFirst = isSameDay(d.date, hlEvt.date);
                    const titleLines = hlEvt.title.split(/\s*[—–-]\s*/).filter(Boolean);
                    return (
                      <div key={i} onClick={() => setSelectedEvent(hlEvt)} {...clickableA11y(() => setSelectedEvent(hlEvt))}
                        className={`hl-cell ${hl.cls}`}
                        style={{
                          background: hl.bg, border: `2px solid ${hl.border}`,
                          cursor: "pointer",
                          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                          padding: 4, overflow: "hidden", transition: "filter 0.15s",
                        }}
                        onMouseEnter={ev => (ev.currentTarget.style.filter = "brightness(1.1)")}
                        onMouseLeave={ev => (ev.currentTarget.style.filter = "none")}>
 <div className="fs-10 fw-800" style={{ color: hl.text, opacity: 0.5 }}>
                          <span className="fs-10">{MONTHS_SHORT[d.date.getMonth()]}</span> {d.date.getDate()}
                        </div>
                        <div className="fs-14" style={{ lineHeight: 1 }}>{hl.icon}</div>
                        {isFirst ? (
                          <div className="fs-10 fw-900 ta-c mt-1" style={{ color: hl.text, lineHeight: 1.1, letterSpacing: "0.02em" }}>
                            {titleLines.map((l, j) => <div key={j}>{l}</div>)}
                          </div>
                        ) : (
                          <div className="fs-10 fw-700 ta-c mt-1" style={{ color: hl.text, opacity: 0.6, lineHeight: 1.1 }}>
                            {hlEvt.title}
                          </div>
                        )}
                      </div>
                    );
                  }

                  return (
                    <div key={i} onClick={() => setSelectedDate(d.date)} {...clickableA11y(() => setSelectedDate(d.date))}
                      style={{
                      borderRight: "1px solid var(--border-light)",
                      borderBottom: "1px solid var(--border-light)",
                      padding: CP, overflow: "hidden", cursor: "pointer",
                      background: isSel ? "var(--accent-light)" : livre ? "var(--cal-livre-bg)"
                        : sd.tipo === "aulas" ? "var(--cal-escola-bg)" : "transparent",
                      transition: "background 0.12s",
                    }}
                      onMouseEnter={ev => { if (!isSel) ev.currentTarget.style.background = "var(--bg-hover)"; }}
                      onMouseLeave={ev => { if (!isSel) ev.currentTarget.style.background = livre ? "var(--cal-livre-bg)" : sd.tipo === "aulas" ? "var(--cal-escola-bg)" : "transparent"; }} title={tipDia}>
                      <div className="fs-11" style={{
                        fontWeight: isToday ? 700 : 500,
                        minHeight: 22, borderRadius: "var(--radius-lg)", padding: "1px 4px",
                        display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 2px",
                        color: !d.inMonth ? "var(--text-3)" : isToday ? "#fff" : "var(--text)",
                        background: isToday ? "var(--accent)" : !d.inMonth ? "var(--bg-hover)" : "transparent",
                        gap: 2, whiteSpace: "nowrap" }}>
 <span className="fw-600 fs-10" style={{ opacity: !d.inMonth ? 0.7 : 0.45 }}>{MONTHS_SHORT[d.date.getMonth()]}</span>
                        {d.date.getDate()}
                      </div>
                      {dayEvts.slice(0, cellCap).map(e => {
                        const isPast = jaPassou(e, today);
                        const pos = getEvPos(e, d.date, weekStart, weekEnd);
                        const showTitle = pos === "single" || pos === "start";
                        // A animação só faz sentido num evento de UM dia: repetida em
                        // três células seguidas (o Dunas, 4-6 Set) fica a gritar.
                        const barCls = pos === "single" ? HL_BAR[e.calId] : undefined;
                        const bRadius =
                          pos === "start" ? "3px 0 0 3px" :
                          pos === "end"   ? "0 3px 3px 0" :
                          pos === "mid"   ? "0" : "3px";
                        return (
                        <div key={e.id} role="button" tabIndex={0} onClick={ev => { ev.stopPropagation(); setSelectedEvent(e); }} onKeyDown={ev => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); ev.stopPropagation(); setSelectedEvent(e); } }}
                          title={e.title}
                          className={barCls ? `hl-bar ${barCls}` : undefined}
                          style={{
                            fontSize: "var(--fs-10)",
                            padding: showTitle ? "1px 5px" : "1px 0",
                            marginBottom: 1,
                            marginLeft:  (pos === "mid" || pos === "end") ? -CP : 0,
                            marginRight: (pos === "mid" || pos === "start") ? -CP : 0,
                            borderRadius: bRadius,
                            background: calColor(e),
                            color: "#fff", overflow: "hidden", whiteSpace: "nowrap",
                            textOverflow: "ellipsis", cursor: "pointer",
                            fontWeight: emDestaque(e) ? 800 : 600, lineHeight: 1.6,
                            opacity: isPast ? 0.4 : opacidadeDe(e),
                            minHeight: pos !== "single" && !showTitle ? 16 : undefined,
                            transition: "opacity 0.15s",
                          }}
                          onMouseEnter={ev => (ev.currentTarget.style.opacity = String(isPast ? 0.55 : Math.min(0.85, opacidadeDe(e) + 0.25)))}
                          onMouseLeave={ev => (ev.currentTarget.style.opacity = String(isPast ? 0.4 : opacidadeDe(e)))}>
                          {showTitle ? (
                            <>
                              {omNivel(e) ? (
                                <span title={`Ordem de Mérito CGSS — Nível ${omNivel(e)}`} style={{
                                  display: "inline-block", minWidth: 10, marginRight: 3,
                                  padding: "0 3px", borderRadius: 2, fontSize: 8, fontWeight: 800,
                                  background: "rgba(255,255,255,0.85)", color: "var(--text)",
                                  lineHeight: 1.6, verticalAlign: "middle",
                                }}>{omNivel(e)}</span>
                              ) : null}
                              {e.title}
                            </>
                          ) : " "}
                        </div>
                        );
                      })}
                      {dayEvts.length > cellCap && (
                        <div role="button" tabIndex={0}
                          onClick={ev => { ev.stopPropagation(); setDayPopup(d.date); }}
                          onKeyDown={ev => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); ev.stopPropagation(); setDayPopup(d.date); } }}
                          title="Ver todos os eventos deste dia"
                          className="fs-10 c-text-3 ta-c fw-600"
                          style={{ cursor: "pointer", borderRadius: "var(--radius-xs)", padding: "0 2px" }}
                          onMouseEnter={ev => (ev.currentTarget.style.background = "var(--bg-hover)")}
                          onMouseLeave={ev => (ev.currentTarget.style.background = "transparent")}>
                          +{dayEvts.length - cellCap} mais
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <ListView events={visibleEvents} onSelect={setSelectedEvent} scrollSignal={listScrollSignal} />
          )}
        </div>
      </div>

      {selectedEvent && <EventPopup event={selectedEvent} onClose={() => setSelectedEvent(null)} />}
      {dayPopup && (
        <DayEventsPopup
          date={dayPopup}
          events={sortEventsForGrid(visibleEvents.filter(e => eventOnDay(e, dayPopup)))}
          onSelect={e => { setDayPopup(null); setSelectedEvent(e); }}
          onClose={() => setDayPopup(null)}
        />
      )}
    </div>
  );
}

function DayEventsPopup({ date, events, onSelect, onClose }: {
  date: Date; events: CalEvent[]; onSelect: (e: CalEvent) => void; onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    setTimeout(() => document.addEventListener("mousedown", h), 10);
    return () => document.removeEventListener("mousedown", h);
  }, [onClose]);
  const title = `${DAY_NAMES[date.getDay()]}, ${date.toLocaleDateString("pt-PT", { day: "numeric", month: "long" })} ${date.getFullYear()}`;
  return (
    <div className="cal-overlay" style={{ backdropFilter: "blur(3px)" }}>
      <div ref={ref} style={{ background: "var(--bg-card)", borderRadius: "var(--radius-xl)",
        boxShadow: "var(--shadow-lg)", width: 380, maxHeight: "80vh", overflow: "hidden",
        display: "flex", flexDirection: "column", animation: "calPopIn 0.2s ease" }}>
        <div style={{ background: "var(--accent)", padding: "14px 18px", display: "flex",
          justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
          <span className="fw-600 fs-13" style={{ color: "#fff" }}>{title}</span>
          <button onClick={onClose} title="Fechar" aria-label="Fechar" style={{ background: "rgba(255,255,255,0.2)",
            border: "none", color: "#fff", width: 26, height: 26, borderRadius: "50%", cursor: "pointer",
            fontSize: "var(--fs-14)", display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
        </div>
        <div className="cal-sidebar d-flex flex-col gap-4" style={{ overflowY: "auto" }}>
          {events.map(e => (
            <button key={e.id} onClick={() => onSelect(e)} style={{
              display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", width: "100%",
              border: "none", cursor: "pointer", fontFamily: "inherit", textAlign: "left",
              background: "transparent", borderRadius: "var(--radius)", transition: "background 0.15s" }}
              onMouseEnter={ev => (ev.currentTarget.style.background = "var(--bg-hover)")}
              onMouseLeave={ev => (ev.currentTarget.style.background = "transparent")}>
              <span style={{ width: 4, alignSelf: "stretch", borderRadius: "var(--radius-xs)",
                background: calColor(e), flexShrink: 0 }} />
              <span className="flex-1" style={{ minWidth: 0 }}>
                <span className="text-ellipsis fs-13 fw-600" style={{ color: "var(--text)", display: "block" }}>{e.title}</span>
                {(e.modalidade || e.campo) && (
                  <span className="fs-11 c-text-3" style={{ display: "block" }}>
                    {e.modalidade}{e.modalidade && e.campo && " · "}{e.campo}
                  </span>
                )}
              </span>
              <span className="fs-10 fw-600 shrink-0" style={{ padding: "2px 8px", borderRadius: "var(--radius-lg)",
                background: calColor(e), color: "#fff", whiteSpace: "nowrap" }}>
                {CAL_MAP.get(e.calId)?.name ?? ""}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function SmBtn({ l, onClick, dis }: { l: string; onClick: () => void; dis?: boolean }) {
  return (
    <button onClick={onClick} disabled={dis} style={{
      background: "none", border: "none", cursor: dis ? "default" : "pointer",
      fontSize: "var(--fs-16)", color: dis ? "var(--border)" : "var(--text-3)",
      width: 24, height: 24, borderRadius: "50%", display: "flex", alignItems: "center",
      justifyContent: "center", padding: 0,
    }}>{l}</button>
  );
}
