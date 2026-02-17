/**
 * CalendarioPage.tsx — Calendário CGSS Época 2026
 *
 * Vista mensal tipo Google Calendar com todas as provas do
 * Calendário Geral do Clube de Golf Santo da Serra.
 * Código de cores conforme legenda oficial.
 */
import { useState, useRef, useEffect, useMemo } from "react";

/* ═══ Types ═══ */
interface CalEvent {
  id: number;
  title: string;
  date: Date;
  endDate?: Date;          // multi-day events
  modalidade: string;
  campo: string;
  circuito: CircuitType;
}

type CircuitType =
  | "OM_A"          // Torneios do clube majors - nível A
  | "OM_B"          // Torneios O.M nível B
  | "OM_C"          // Torneios O.M nível C
  | "PATROCINADOR"  // Torneios de patrocinador (X)
  | "REGIONAL"      // Campeonatos de Golfe Regionais
  | "REGIONAL_JR"   // Torneios juniores / circuitos regionais
  | "NAC_JR"        // Torneios juniores / campeonatos Nacionais
  | "OURO"          // Torneios ranking Ouro
  | "PARES"         // Campeonato de Pares
  | "FPG"           // FPG Nacional
  | "INT_JR";       // Internacional Junior (Faldo)

const CIRCUIT_META: Record<CircuitType, { label: string; color: string; bg: string }> = {
  OM_A:          { label: "Majors — Nível A",         color: "#fff",  bg: "#c27c0e" },
  OM_B:          { label: "O.M. Nível B",             color: "#fff",  bg: "#2d6a30" },
  OM_C:          { label: "O.M. Nível C",             color: "#fff",  bg: "#5a8f5c" },
  PATROCINADOR:  { label: "Patrocinador",             color: "#fff",  bg: "#6b7280" },
  REGIONAL:      { label: "Regional",                 color: "#fff",  bg: "#0369a1" },
  REGIONAL_JR:   { label: "Regional Juniores",        color: "#fff",  bg: "#7c3aed" },
  NAC_JR:        { label: "Nacional Juniores",         color: "#fff",  bg: "#dc2626" },
  OURO:          { label: "Ranking Ouro",             color: "#1a1a1a", bg: "#fbbf24" },
  PARES:         { label: "Camp. Pares",              color: "#fff",  bg: "#0d9488" },
  FPG:           { label: "FPG Nacional",             color: "#fff",  bg: "#be123c" },
  INT_JR:        { label: "Internacional Junior",     color: "#fff",  bg: "#0891b2" },
};

/* ═══ Events Data — CGSS 2026 ═══ */
const EVENTS: CalEvent[] = [
  // FEVEREIRO
  { id: 1, title: "2º Torneio DRIVE Tour Madeira", date: new Date(2026, 1, 7), modalidade: "Strokeplay e Medal", campo: "Santo da Serra", circuito: "REGIONAL_JR" },
  { id: 2, title: "2º Torneio DRIVE Challenge Madeira", date: new Date(2026, 1, 8), modalidade: "Strokeplay e Medal", campo: "Santo da Serra", circuito: "REGIONAL_JR" },
  { id: 3, title: "Torneio de Carnaval CGSS", date: new Date(2026, 1, 14), modalidade: "Stableford", campo: "Santo da Serra", circuito: "OM_C" },
  { id: 4, title: "II Prova Camp. Clube de Pares 2026", date: new Date(2026, 1, 28), modalidade: "Foursomes", campo: "Santo da Serra", circuito: "PARES" },
  { id: 5, title: "Campeonato Regional de Jovens D1", date: new Date(2026, 1, 28), modalidade: "Strokeplay", campo: "Santo da Serra", circuito: "REGIONAL_JR" },
  // MARÇO
  { id: 6, title: "Campeonato Regional de Jovens D2", date: new Date(2026, 2, 1), modalidade: "Strokeplay", campo: "Santo da Serra", circuito: "REGIONAL_JR" },
  { id: 7, title: "3º Torneio DRIVE Tour Madeira", date: new Date(2026, 2, 7), modalidade: "Strokeplay e Medal", campo: "Palheiro Golf", circuito: "REGIONAL_JR" },
  { id: 8, title: "3º Torneio DRIVE Challenge Madeira", date: new Date(2026, 2, 8), modalidade: "Strokeplay e Medal", campo: "Palheiro Golf", circuito: "REGIONAL_JR" },
  { id: 9, title: "Torneio da Primavera CGSS", date: new Date(2026, 2, 14), modalidade: "Stableford", campo: "Santo da Serra", circuito: "OM_C" },
  { id: 10, title: "Torneio Golf & Clássicos 3rd edition", date: new Date(2026, 2, 21), modalidade: "Stableford", campo: "Santo da Serra", circuito: "PATROCINADOR" },
  { id: 11, title: "Camp. Nacional Clubes Sub14 & 18", date: new Date(2026, 2, 31), endDate: new Date(2026, 3, 2), modalidade: "Strokeplay", campo: "Oporto", circuito: "NAC_JR" },
  // ABRIL
  { id: 12, title: "III Prova Camp. Clube de Pares", date: new Date(2026, 3, 11), modalidade: "Stableford Agg", campo: "Santo da Serra", circuito: "PARES" },
  { id: 13, title: "4º Torneio DRIVE Tour Madeira", date: new Date(2026, 3, 11), modalidade: "Strokeplay e Medal", campo: "Porto Santo", circuito: "REGIONAL_JR" },
  { id: 14, title: "4º Torneio DRIVE Challenge Madeira", date: new Date(2026, 3, 12), modalidade: "Strokeplay e Medal", campo: "Porto Santo", circuito: "REGIONAL_JR" },
  { id: 15, title: "Torneio CGSS", date: new Date(2026, 3, 25), modalidade: "Stableford", campo: "Santo da Serra", circuito: "OM_C" },
  // MAIO
  { id: 16, title: "Camp. Nacional de Jovens", date: new Date(2026, 4, 1), endDate: new Date(2026, 4, 3), modalidade: "Strokeplay", campo: "Aroeira", circuito: "NAC_JR" },
  { id: 17, title: "I Aberto CGSS 2026", date: new Date(2026, 4, 3), modalidade: "Strokeplay", campo: "Santo da Serra", circuito: "OURO" },
  { id: 18, title: "Torneio Cidade de Machico", date: new Date(2026, 4, 9), modalidade: "Stableford 13pm", campo: "Santo da Serra", circuito: "PATROCINADOR" },
  { id: 19, title: "Torneio NOS Empresas", date: new Date(2026, 4, 23), modalidade: "Stableford", campo: "Santo da Serra", circuito: "OM_B" },
  { id: 20, title: "5º Torneio DRIVE Challenge Madeira", date: new Date(2026, 4, 24), modalidade: "Strokeplay e Medal", campo: "Santo da Serra", circuito: "REGIONAL_JR" },
  { id: 21, title: "Torneio Clube de Golf Santo da Serra", date: new Date(2026, 4, 30), modalidade: "Stableford", campo: "Santo da Serra", circuito: "OM_B" },
  // JUNHO
  { id: 22, title: "Madeira Golf Trophy", date: new Date(2026, 5, 6), modalidade: "Strokeplay", campo: "Santo da Serra", circuito: "PATROCINADOR" },
  { id: 23, title: "Camp. Nacional Ind. Absoluto", date: new Date(2026, 5, 4), endDate: new Date(2026, 5, 7), modalidade: "Strokeplay", campo: "Oporto", circuito: "FPG" },
  { id: 24, title: "Torneio Diário de Notícias da Madeira", date: new Date(2026, 5, 13), modalidade: "Stableford", campo: "Santo da Serra", circuito: "PATROCINADOR" },
  { id: 25, title: "Camp. Regional de Clubes D1", date: new Date(2026, 5, 20), modalidade: "Strokeplay", campo: "Palheiro", circuito: "REGIONAL" },
  { id: 26, title: "Camp. Regional de Clubes D2", date: new Date(2026, 5, 21), modalidade: "Strokeplay", campo: "Palheiro", circuito: "REGIONAL" },
  { id: 27, title: "6º Torneio DRIVE Challenge Madeira", date: new Date(2026, 5, 28), modalidade: "Strokeplay e Medal", campo: "Porto Santo", circuito: "REGIONAL_JR" },
  // JULHO
  { id: 28, title: "IV Prova Camp. Clube de Pares", date: new Date(2026, 6, 4), modalidade: "Texas Scramble", campo: "Santo da Serra", circuito: "PARES" },
  { id: 29, title: "7º Torneio DRIVE Challenge Madeira", date: new Date(2026, 6, 11), modalidade: "Strokeplay e Medal", campo: "Santo da Serra", circuito: "REGIONAL_JR" },
  { id: 30, title: "Final Regional DRIVE Challenge", date: new Date(2026, 6, 12), modalidade: "Strokeplay e Medal", campo: "Palheiro Golf", circuito: "REGIONAL_JR" },
  { id: 31, title: "Taça do Clube", date: new Date(2026, 6, 25), modalidade: "Medal", campo: "Santo da Serra", circuito: "OM_A" },
  // AGOSTO
  { id: 32, title: "Torneio CGSS Rali", date: new Date(2026, 7, 1), modalidade: "Stableford", campo: "Santo da Serra", circuito: "OM_C" },
  { id: 33, title: "Torneio Calheta Viva", date: new Date(2026, 7, 8), modalidade: "Stableford 13pm", campo: "Santo da Serra", circuito: "PATROCINADOR" },
  { id: 34, title: "Torneio CGSS Summer", date: new Date(2026, 7, 22), modalidade: "Stableford", campo: "Santo da Serra", circuito: "OM_C" },
  { id: 35, title: "Camp. Nacional de Clubes", date: new Date(2026, 7, 25), endDate: new Date(2026, 7, 28), modalidade: "Strokeplay", campo: "Pinhal", circuito: "FPG" },
  { id: 36, title: "Torneio CGSS", date: new Date(2026, 7, 29), modalidade: "Stableford", campo: "Santo da Serra", circuito: "OM_C" },
  // SETEMBRO
  { id: 37, title: "Torneio Quinta de São João", date: new Date(2026, 8, 5), modalidade: "Stableford 13pm", campo: "Santo da Serra", circuito: "PATROCINADOR" },
  { id: 38, title: "XIII Torneio Barbeito Madeira", date: new Date(2026, 8, 12), modalidade: "Stableford", campo: "Santo da Serra", circuito: "OM_B" },
  { id: 39, title: "Porto Santo Colombos", date: new Date(2026, 8, 19), modalidade: "", campo: "Porto Santo", circuito: "PATROCINADOR" },
  // OUTUBRO
  { id: 40, title: "Faldo Series Madeira", date: new Date(2026, 9, 1), endDate: new Date(2026, 9, 3), modalidade: "Strokeplay", campo: "Santo da Serra", circuito: "INT_JR" },
  { id: 41, title: "Torneio CGEx ZMM", date: new Date(2026, 9, 4), modalidade: "Stableford", campo: "Santo da Serra", circuito: "PATROCINADOR" },
  { id: 42, title: "Torneio Serras / São Martinho CGSS", date: new Date(2026, 9, 10), modalidade: "Stableford", campo: "Santo da Serra", circuito: "OM_C" },
  { id: 43, title: "Taça FPG", date: new Date(2026, 9, 10), endDate: new Date(2026, 9, 13), modalidade: "Strokeplay e Match", campo: "Ribagolfe", circuito: "NAC_JR" },
  { id: 44, title: "Troféu João Sousa", date: new Date(2026, 9, 17), modalidade: "Stableford", campo: "Santo da Serra", circuito: "OM_A" },
  { id: 45, title: "V Prova Camp. Clube de Pares", date: new Date(2026, 9, 24), modalidade: "Stableford Agg", campo: "Santo da Serra", circuito: "PARES" },
  { id: 46, title: "Taça Presidente", date: new Date(2026, 9, 31), modalidade: "Stableford", campo: "Santo da Serra", circuito: "OM_A" },
  // NOVEMBRO
  { id: 47, title: "Torneio de São Martinho CGSS", date: new Date(2026, 10, 7), modalidade: "Stableford", campo: "Santo da Serra", circuito: "OM_C" },
  { id: 48, title: "Taça 1937 — Gala Encerramento", date: new Date(2026, 10, 21), modalidade: "Stableford", campo: "Santo da Serra", circuito: "PATROCINADOR" },
  { id: 49, title: "Camp. Regional Individual Absoluto D1", date: new Date(2026, 10, 28), modalidade: "Strokeplay", campo: "Santo da Serra", circuito: "REGIONAL" },
  { id: 50, title: "Camp. Regional Individual Absoluto D2", date: new Date(2026, 10, 29), modalidade: "Strokeplay", campo: "Santo da Serra", circuito: "REGIONAL" },
  // DEZEMBRO
  { id: 51, title: "Torneio Solidário", date: new Date(2026, 11, 5), modalidade: "Stableford", campo: "Santo da Serra", circuito: "PATROCINADOR" },
  { id: 52, title: "Torneio de Natal CGSS 2026", date: new Date(2026, 11, 12), modalidade: "Stableford", campo: "Santo da Serra", circuito: "OM_C" },
  { id: 53, title: "Torneio Famílias & Amigos — P&P", date: new Date(2026, 11, 19), modalidade: "Texas Scramble", campo: "Santo da Serra", circuito: "PATROCINADOR" },
];

/* ═══ Helpers ═══ */
const MONTHS_PT = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
];
const DAYS_PT_SHORT = ["D", "S", "T", "Q", "Q", "S", "S"];
const DAYS_PT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function getMonthDays(year: number, month: number) {
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const days: { date: Date; inMonth: boolean }[] = [];
  const startDow = first.getDay();
  // pad before
  for (let i = startDow - 1; i >= 0; i--) {
    days.push({ date: new Date(year, month, -i), inMonth: false });
  }
  // month days
  for (let d = 1; d <= last.getDate(); d++) {
    days.push({ date: new Date(year, month, d), inMonth: true });
  }
  // pad after to 42
  const rem = 42 - days.length;
  for (let i = 1; i <= rem; i++) {
    days.push({ date: new Date(year, month + 1, i), inMonth: false });
  }
  return days;
}

function eventsForDay(evts: CalEvent[], date: Date): CalEvent[] {
  return evts.filter(e => {
    if (isSameDay(e.date, date)) return true;
    if (e.endDate) {
      return date >= e.date && date <= e.endDate;
    }
    return false;
  });
}

function formatDateRange(e: CalEvent): string {
  const d1 = e.date;
  const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" };
  if (!e.endDate || isSameDay(d1, e.endDate)) {
    return `${DAYS_PT[d1.getDay()]}, ${d1.toLocaleDateString("pt-PT", opts)} ${d1.getFullYear()}`;
  }
  return `${d1.toLocaleDateString("pt-PT", opts)} – ${e.endDate.toLocaleDateString("pt-PT", opts)} ${d1.getFullYear()}`;
}

/* ═══ Components ═══ */

/* — Mini Calendar Sidebar — */
function MiniCal({ year, month, onSelect, selected }: {
  year: number; month: number;
  onSelect: (d: Date) => void; selected: Date | null;
}) {
  const days = getMonthDays(year, month);
  const today = new Date();
  return (
    <div style={{ userSelect: "none" }}>
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(7, 1fr)",
        gap: 0, textAlign: "center",
      }}>
        {DAYS_PT_SHORT.map((d, i) => (
          <div key={i} style={{ fontSize: 10, color: "var(--text-3)", padding: "2px 0", fontWeight: 600 }}>{d}</div>
        ))}
        {days.map((d, i) => {
          const isToday = isSameDay(d.date, today);
          const isSel = selected && isSameDay(d.date, selected);
          const hasEvt = EVENTS.some(e => isSameDay(e.date, d.date) || (e.endDate && d.date >= e.date && d.date <= e.endDate));
          return (
            <div key={i} onClick={() => onSelect(d.date)}
              style={{
                fontSize: 11, cursor: "pointer", borderRadius: "50%",
                width: 26, height: 26, display: "flex", alignItems: "center", justifyContent: "center",
                margin: "1px auto", position: "relative",
                color: !d.inMonth ? "var(--border)" : isToday ? "#fff" : isSel ? "var(--accent)" : "var(--text)",
                backgroundColor: isToday ? "var(--accent)" : isSel ? "var(--accent-light)" : "transparent",
                fontWeight: isToday || isSel ? 600 : 400,
                transition: "background 0.15s",
              }}>
              {d.date.getDate()}
              {hasEvt && d.inMonth && !isToday && (
                <span style={{
                  position: "absolute", bottom: 1, left: "50%", transform: "translateX(-50%)",
                  width: 3, height: 3, borderRadius: "50%", background: "var(--accent)",
                }} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* — Event Detail Popup — */
function EventPopup({ event, onClose }: { event: CalEvent; onClose: () => void }) {
  const meta = CIRCUIT_META[event.circuito];
  const popupRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) onClose();
    };
    setTimeout(() => document.addEventListener("mousedown", handler), 10);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 1000,
      display: "flex", alignItems: "center", justifyContent: "center",
      background: "rgba(0,0,0,0.3)", backdropFilter: "blur(3px)",
    }}>
      <div ref={popupRef} style={{
        background: "var(--bg-card)", borderRadius: 12,
        boxShadow: "var(--shadow-lg)", width: 380, overflow: "hidden",
        animation: "calPopIn 0.2s ease",
      }}>
        <div style={{
          background: meta.bg, padding: "14px 18px",
          display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <span style={{ color: meta.color, fontWeight: 600, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.04em" }}>
            {meta.label}
          </span>
          <button onClick={onClose} style={{
            background: "rgba(255,255,255,0.2)", border: "none", color: meta.color,
            width: 26, height: 26, borderRadius: "50%", cursor: "pointer", fontSize: 14,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>✕</button>
        </div>
        <div style={{ padding: "16px 18px" }}>
          <div style={{ fontSize: 17, fontWeight: 600, color: "var(--text)", marginBottom: 12, lineHeight: 1.3 }}>
            {event.title}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <Row icon="📅" label={formatDateRange(event)} />
            {event.modalidade && <Row icon="🏌️" label={event.modalidade} />}
            <Row icon="⛳" label={event.campo} />
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ icon, label }: { icon: string; label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span style={{ fontSize: 15, width: 22, textAlign: "center" }}>{icon}</span>
      <span style={{ fontSize: 13, color: "var(--text-2)" }}>{label}</span>
    </div>
  );
}

/* — List View — */
function ListView({ events, filter, onSelect }: {
  events: CalEvent[]; filter: CircuitType | "ALL";
  onSelect: (e: CalEvent) => void;
}) {
  const filtered = filter === "ALL" ? events : events.filter(e => e.circuito === filter);
  // group by month
  const grouped = useMemo(() => {
    const map = new Map<number, CalEvent[]>();
    for (const e of filtered) {
      const m = e.date.getMonth();
      if (!map.has(m)) map.set(m, []);
      map.get(m)!.push(e);
    }
    return [...map.entries()].sort((a, b) => a[0] - b[0]);
  }, [filtered]);

  return (
    <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 20 }}>
      {grouped.map(([month, evts]) => (
        <div key={month}>
          <div style={{
            fontSize: 13, fontWeight: 700, color: "var(--accent)",
            textTransform: "uppercase", letterSpacing: "0.04em",
            marginBottom: 8, paddingBottom: 4, borderBottom: "2px solid var(--accent-light)",
          }}>
            {MONTHS_PT[month]} 2026
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {evts.map(e => {
              const meta = CIRCUIT_META[e.circuito];
              return (
                <div key={e.id} onClick={() => onSelect(e)}
                  style={{
                    display: "flex", alignItems: "center", gap: 10, padding: "8px 10px",
                    borderRadius: "var(--radius)", cursor: "pointer",
                    transition: "background 0.15s",
                  }}
                  onMouseEnter={ev => (ev.currentTarget.style.background = "var(--bg-hover)")}
                  onMouseLeave={ev => (ev.currentTarget.style.background = "transparent")}
                >
                  <div style={{
                    width: 42, textAlign: "center", flexShrink: 0,
                  }}>
                    <div style={{ fontSize: 10, color: "var(--text-3)", fontWeight: 500, textTransform: "uppercase" }}>
                      {DAYS_PT[e.date.getDay()]}
                    </div>
                    <div style={{ fontSize: 18, fontWeight: 600, color: "var(--text)", lineHeight: 1.2 }}>
                      {e.date.getDate()}
                    </div>
                  </div>
                  <div style={{
                    width: 4, alignSelf: "stretch", borderRadius: 2,
                    background: meta.bg, flexShrink: 0,
                  }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: 13, fontWeight: 600, color: "var(--text)",
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>
                      {e.title}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 1 }}>
                      {e.modalidade}{e.modalidade && " · "}{e.campo}
                    </div>
                  </div>
                  <span style={{
                    fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 10,
                    background: meta.bg, color: meta.color, whiteSpace: "nowrap", flexShrink: 0,
                  }}>
                    {meta.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      ))}
      {grouped.length === 0 && (
        <div style={{ textAlign: "center", color: "var(--text-3)", padding: 40 }}>
          Sem provas neste circuito.
        </div>
      )}
    </div>
  );
}

/* ═══ Main Component ═══ */
type ViewMode = "month" | "list";

export default function CalendarioPage() {
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth());
  const [currentYear] = useState(2026);
  const [selectedEvent, setSelectedEvent] = useState<CalEvent | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("month");
  const [circuitFilter, setCircuitFilter] = useState<CircuitType | "ALL">("ALL");
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  const monthDays = useMemo(() => getMonthDays(currentYear, currentMonth), [currentYear, currentMonth]);

  const today = new Date();

  // Count events per circuit for legend
  const circuitCounts = useMemo(() => {
    const map: Partial<Record<CircuitType, number>> = {};
    for (const e of EVENTS) {
      map[e.circuito] = (map[e.circuito] || 0) + 1;
    }
    return map;
  }, []);

  return (
    <div style={{ height: "100%", display: "flex", overflow: "hidden" }}>
      <style>{`
        @keyframes calPopIn { from { transform: translateY(6px) scale(0.98); opacity: 0; } to { transform: none; opacity: 1; } }
      `}</style>

      {/* ── Sidebar ── */}
      <div style={{
        width: 250, borderRight: "1px solid var(--border-light)",
        padding: 16, display: "flex", flexDirection: "column", gap: 16,
        overflowY: "auto", flexShrink: 0, background: "var(--bg-card)",
      }}>
        {/* Month navigator */}
        <div>
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            marginBottom: 8,
          }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>
              {MONTHS_PT[currentMonth]} 2026
            </span>
            <div style={{ display: "flex", gap: 2 }}>
              <NavBtn label="‹" onClick={() => setCurrentMonth(m => Math.max(0, m - 1))} disabled={currentMonth <= 0} />
              <NavBtn label="›" onClick={() => setCurrentMonth(m => Math.min(11, m + 1))} disabled={currentMonth >= 11} />
            </div>
          </div>
          <MiniCal year={currentYear} month={currentMonth}
            selected={selectedDate}
            onSelect={(d) => {
              setSelectedDate(d);
              setCurrentMonth(d.getMonth());
            }}
          />
        </div>

        {/* Legend / Filter */}
        <div>
          <div style={{
            fontSize: 11, fontWeight: 700, color: "var(--text-3)",
            textTransform: "uppercase", letterSpacing: "0.06em",
            marginBottom: 8,
          }}>
            Circuitos
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <LegendBtn
              color="var(--accent)" label="Todos" count={EVENTS.length}
              active={circuitFilter === "ALL"}
              onClick={() => setCircuitFilter("ALL")}
            />
            {(Object.keys(CIRCUIT_META) as CircuitType[]).map(ct => (
              <LegendBtn
                key={ct}
                color={CIRCUIT_META[ct].bg}
                label={CIRCUIT_META[ct].label}
                count={circuitCounts[ct] || 0}
                active={circuitFilter === ct}
                onClick={() => setCircuitFilter(f => f === ct ? "ALL" : ct)}
              />
            ))}
          </div>
        </div>
      </div>

      {/* ── Main Area ── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {/* Toolbar */}
        <div style={{
          display: "flex", alignItems: "center", padding: "10px 20px",
          borderBottom: "1px solid var(--border-light)", gap: 12, flexShrink: 0,
        }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, color: "var(--text)", margin: 0 }}>
            Calendário CGSS — Época 2026
          </h2>

          <div style={{ marginLeft: "auto", display: "flex", gap: 2, background: "var(--bg)", borderRadius: "var(--radius)", padding: 2 }}>
            {(["month", "list"] as ViewMode[]).map(v => (
              <button key={v} onClick={() => setViewMode(v)}
                style={{
                  border: "none", padding: "5px 14px", cursor: "pointer",
                  fontSize: 12, fontWeight: 600, fontFamily: "inherit",
                  borderRadius: "var(--radius)",
                  background: viewMode === v ? "var(--bg-card)" : "transparent",
                  color: viewMode === v ? "var(--accent)" : "var(--text-3)",
                  boxShadow: viewMode === v ? "var(--shadow-sm)" : "none",
                  transition: "all 0.15s",
                }}>
                {v === "month" ? "Mês" : "Lista"}
              </button>
            ))}
          </div>

          <span style={{
            fontSize: 11, color: "var(--text-3)", fontFamily: "'JetBrains Mono', monospace",
          }}>
            {EVENTS.length} provas
          </span>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflow: "auto" }}>
          {viewMode === "month" ? (
            /* ── Month Grid ── */
            <div style={{
              display: "flex", flexDirection: "column", height: "100%",
              padding: "0 12px 12px",
            }}>
              {/* Day headers */}
              <div style={{
                display: "grid", gridTemplateColumns: "repeat(7, 1fr)",
                borderBottom: "1px solid var(--border-light)", marginBottom: 4,
              }}>
                {DAYS_PT.map((d, i) => (
                  <div key={i} style={{
                    textAlign: "center", padding: "8px 0", fontSize: 11,
                    fontWeight: 600, color: "var(--text-3)",
                    textTransform: "uppercase", letterSpacing: "0.04em",
                  }}>{d}</div>
                ))}
              </div>
              {/* Grid */}
              <div style={{
                flex: 1, display: "grid",
                gridTemplateColumns: "repeat(7, 1fr)",
                gridTemplateRows: "repeat(6, 1fr)",
              }}>
                {monthDays.map((d, i) => {
                  const dayEvts = eventsForDay(EVENTS, d.date)
                    .filter(e => circuitFilter === "ALL" || e.circuito === circuitFilter);
                  const isToday = isSameDay(d.date, today);
                  const isSel = selectedDate && isSameDay(d.date, selectedDate);
                  return (
                    <div key={i}
                      onClick={() => setSelectedDate(d.date)}
                      style={{
                        borderRight: "1px solid var(--border-light)",
                        borderBottom: "1px solid var(--border-light)",
                        padding: 4, overflow: "hidden", cursor: "pointer",
                        background: isSel ? "var(--accent-light)" : "transparent",
                        transition: "background 0.12s",
                        minHeight: 0,
                      }}
                      onMouseEnter={ev => { if (!isSel) ev.currentTarget.style.background = "var(--bg-hover)"; }}
                      onMouseLeave={ev => { if (!isSel) ev.currentTarget.style.background = "transparent"; }}
                    >
                      <div style={{
                        fontSize: 11, fontWeight: isToday ? 700 : 500,
                        width: 24, height: 24, borderRadius: "50%",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        margin: "0 auto 2px",
                        color: !d.inMonth ? "var(--border)" : isToday ? "#fff" : "var(--text)",
                        background: isToday ? "var(--accent)" : "transparent",
                      }}>
                        {d.date.getDate()}
                      </div>
                      {dayEvts.slice(0, 3).map(e => {
                        const meta = CIRCUIT_META[e.circuito];
                        return (
                          <div key={e.id}
                            onClick={(ev) => { ev.stopPropagation(); setSelectedEvent(e); }}
                            title={e.title}
                            style={{
                              fontSize: 10, padding: "1px 5px", marginBottom: 1,
                              borderRadius: 3, background: meta.bg, color: meta.color,
                              overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis",
                              cursor: "pointer", fontWeight: 600, lineHeight: 1.6,
                              transition: "opacity 0.15s",
                            }}
                            onMouseEnter={ev => (ev.currentTarget.style.opacity = "0.85")}
                            onMouseLeave={ev => (ev.currentTarget.style.opacity = "1")}
                          >
                            {e.title}
                          </div>
                        );
                      })}
                      {dayEvts.length > 3 && (
                        <div style={{ fontSize: 9, color: "var(--text-3)", textAlign: "center", fontWeight: 600 }}>
                          +{dayEvts.length - 3} mais
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            /* ── List View ── */
            <ListView events={EVENTS} filter={circuitFilter} onSelect={setSelectedEvent} />
          )}
        </div>
      </div>

      {/* Event Popup */}
      {selectedEvent && <EventPopup event={selectedEvent} onClose={() => setSelectedEvent(null)} />}
    </div>
  );
}

/* ═══ Small UI pieces ═══ */
function NavBtn({ label, onClick, disabled }: { label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled}
      style={{
        background: "none", border: "none", cursor: disabled ? "default" : "pointer",
        fontSize: 16, color: disabled ? "var(--border)" : "var(--text-3)",
        width: 24, height: 24, borderRadius: "50%",
        display: "flex", alignItems: "center", justifyContent: "center", padding: 0,
        transition: "background 0.15s",
      }}>
      {label}
    </button>
  );
}

function LegendBtn({ color, label, count, active, onClick }: {
  color: string; label: string; count: number; active: boolean; onClick: () => void;
}) {
  return (
    <button onClick={onClick}
      style={{
        display: "flex", alignItems: "center", gap: 8, width: "100%",
        padding: "4px 8px", borderRadius: "var(--radius)",
        border: "none", cursor: "pointer", fontFamily: "inherit",
        background: active ? "var(--accent-light)" : "transparent",
        transition: "background 0.15s",
      }}
      onMouseEnter={e => { if (!active) e.currentTarget.style.background = "var(--bg-hover)"; }}
      onMouseLeave={e => { if (!active) e.currentTarget.style.background = active ? "var(--accent-light)" : "transparent"; }}
    >
      <span style={{
        width: 10, height: 10, borderRadius: "50%", background: color, flexShrink: 0,
      }} />
      <span style={{ fontSize: 11, color: "var(--text-2)", flex: 1, textAlign: "left", fontWeight: active ? 600 : 400 }}>
        {label}
      </span>
      <span style={{
        fontSize: 10, fontFamily: "'JetBrains Mono', monospace",
        color: "var(--text-3)", fontWeight: 500,
      }}>
        {count}
      </span>
    </button>
  );
}
