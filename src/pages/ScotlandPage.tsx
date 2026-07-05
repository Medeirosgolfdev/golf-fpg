/**
 * ScotlandPage.tsx — Junior Tour Scotland
 *
 * Página de circuito JTS, construída sobre `CircuitShell` à semelhança de
 * England/FFG/RFEG. Cada evento do calendário JTS é uma entry na sidebar.
 * O detalhe mostra metadata do evento (formato, field, abertura de inscrições,
 * draw) + PDFs de resultados associados (matched por slug→venue).
 *
 * Dados: `public/data/scotland-jts-{year}-{events|results|oom}.json` gerados
 * por `scripts/scrape-junior-tour-scotland.js`.
 *
 * Limitação: o site da JTS não publica leaderboards estruturados — só PDFs.
 * Por isso usamos `customResults` em cada divisão (em vez de `results`).
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { cachedFetchJson } from "../data/fetchCache";
import LoadingState from "../ui/LoadingState";
import ExtLink from "../ui/ExternalLink";
import CircuitShell from "../ui/circuit/CircuitShell";
import type { CircuitEntry, CircuitConfig, CircuitDivision, CircuitLink, CircuitSpecialItem } from "../ui/circuit/types";
import { usePasswordGate } from "../hooks/usePasswordGate";
import PasswordGate from "../ui/PasswordGate";

/* ── Bandeira escocesa (emoji com tag sequence) ──────────────── */
const SCOT_FLAG = "🏴󠁧󠁢󠁳󠁣󠁴󠁿";

/* ── Tipos do scraper ─────────────────────────────────────────── */

interface JtsEvent {
  dateRaw: string;
  dateStart: string | null;
  dateEnd: string | null;
  venue: string;
  wagrEgr: string | null;
  satSunSplit: string | null;
  fieldSize: string | null;
  entriesToDate: string | null;
  entriesClose: string | null;
  drawsAvailable: string | null;
  dogFriendly: string | null;
  extra: string[];
}
interface EventsFile { year: number; scrapedAt: string; source?: string; events: JtsEvent[] }
interface JtsLink { href: string; text: string }
interface ResultsFile { year: number; scrapedAt: string; source?: string; pdfs: JtsLink[]; otherLinks: JtsLink[] }
interface OomFile { year: number; scrapedAt: string; source?: string; pdfs: JtsLink[]; otherLinks: JtsLink[]; rulesText: string | null }

/* ── Constantes ───────────────────────────────────────────────── */

const JTS_BASE = "https://www.juniortourscotland.com";
const YEARS: number[] = [2026, 2025, 2024];
const SCOTLAND_BLUE = "#0065bf";

/* ── Helpers ──────────────────────────────────────────────────── */

function venueKey(venue: string): string {
  return venue
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .trim()
    .split(/\s+/)[0] ?? "";
}

const VENUE_ALIASES: Record<string, string[]> = {
  "royal dornoch": ["rd", "dornoch"],
  "portpatrick":   ["pp", "portpatrick"],
  "alyth":         ["alyth"],
  "hayston":       ["hayston"],
  "tain":          ["tain"],
  "royal musselburgh": ["rm", "musselburgh"],
  "peterculter":   ["peterculter", "pc"],
  "hilton park":   ["hilton", "hp"],
  "kilspindie":    ["kilspindie", "kp"],
  "fraserburgh":   ["fraserburgh", "fb"],
  "baberton":      ["baberton"],
  "elgin":         ["elgin"],
  "duff house royal": ["duff", "dhr"],
  "arbroath":      ["arbroath"],
  "luffness":      ["luffness"],
  "murcar links":  ["murcar"],
  "milngavie":     ["milngavie"],
  "porlethen":     ["porlethen", "portlethen"],
};

function venueMatchers(venue: string): string[] {
  const v = venue.toLowerCase();
  const out = new Set<string>();
  for (const [name, aliases] of Object.entries(VENUE_ALIASES)) {
    if (v.includes(name)) {
      out.add(name);
      aliases.forEach(a => out.add(a));
    }
  }
  const tok = venueKey(v);
  if (tok && tok.length >= 4) out.add(tok);
  return [...out];
}

function matchPdfsToEvents(pdfs: JtsLink[], events: JtsEvent[]): Map<JtsEvent, JtsLink[]> {
  const byEvent = new Map<JtsEvent, JtsLink[]>();
  const eventsWithMatchers = events
    .map(e => ({ e, matchers: venueMatchers(e.venue) }))
    .sort((a, b) => b.matchers.join("").length - a.matchers.join("").length);

  for (const pdf of pdfs) {
    const hay = (pdf.href + " " + pdf.text).toLowerCase();
    for (const { e, matchers } of eventsWithMatchers) {
      if (matchers.some(m => {
        const re = new RegExp(`(?:^|[\\s/_-]|%20)${m}(?:[\\s/_-]|%20|\\.|$)`, "i");
        return re.test(hay);
      })) {
        if (!byEvent.has(e)) byEvent.set(e, []);
        byEvent.get(e)!.push(pdf);
        break;
      }
    }
  }
  return byEvent;
}

function slugify(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50);
}

function shortVenue(venue: string): string {
  return venue.replace(/\s+\d+\s*(holes?|h\b).*$/i, "").replace(/,.*$/, "").trim();
}

const orDash = (v: string | null | undefined): string => (v && v.trim() ? v : "—");

/* ── Detalhe customResults ────────────────────────────────────── */

function EventDetail({ event, pdfs, year }: { event: JtsEvent; pdfs: JtsLink[]; year: number }) {
  const rows: Array<{ label: string; value: string }> = [
    { label: "Data",                value: event.dateRaw || "—" },
    { label: "Campo / Formato",     value: event.venue },
    { label: "Ranking",             value: orDash(event.wagrEgr) },
    { label: "Distribuição rondas", value: orDash(event.satSunSplit) },
    { label: "Field size",          value: orDash(event.fieldSize) },
    { label: "Inscritos",           value: orDash(event.entriesToDate) },
    { label: "Fecho inscrições",    value: orDash(event.entriesClose) },
    { label: "Draw",                value: orDash(event.drawsAvailable) },
  ];

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0,2fr) minmax(0,1fr)", gap: 12 }}>
      <div className="card">
        <div className="h-md fs-14">🗓️ Informação do evento</div>
        <table className="sc-table-modern" data-sc-table="1" style={{ width: "100%" }}>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td className="row-label" style={{ textAlign: "left", paddingLeft: 8, width: 170, fontWeight: 700 }}>
                  {r.label}
                </td>
                <td style={{ textAlign: "left", paddingLeft: 8, whiteSpace: "normal" }}>{r.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {event.extra.length > 0 && (
          <div className="muted fs-11" style={{ marginTop: 8 }}>
            <strong>Notas:</strong> {event.extra.join(" · ")}
          </div>
        )}
      </div>

      <div className="card">
        <div className="h-md fs-14">📄 Resultados (PDF)</div>
        {pdfs.length === 0 ? (
          <div className="muted fs-11" style={{ padding: "6px 0" }}>
            Ainda não foram publicados PDFs deste evento.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {pdfs.map((p, i) => (
              <ExtLink key={i} href={p.href} className="chip" title={p.text} style={{ textAlign: "left" }}>
                📄 {p.text || "PDF"}
              </ExtLink>
            ))}
          </div>
        )}
        <div className="muted fs-10" style={{ marginTop: 10 }}>
          A JTS não publica leaderboards estruturados — só PDFs por evento.
        </div>
        <div className="muted fs-10" style={{ marginTop: 4 }}>
          <ExtLink href={`${JTS_BASE}/${year}-results`} className="muted">
            ↗ Página oficial de resultados {year}
          </ExtLink>
        </div>
      </div>
    </div>
  );
}

/* ── Special item: OOM ────────────────────────────────────────── */

function OomView({ ooms }: { ooms: Map<number, OomFile | null> }) {
  return (
    <div>
      <div className="h-md fs-14" style={{ marginBottom: 6 }}>🏆 Order of Merit — JTS</div>
      <div className="muted fs-11" style={{ marginBottom: 12 }}>
        O OOM da Junior Tour Scotland é publicado em PDF por escalão. As 18 melhores
        classificações da época qualificam para a OOM Final (Outubro).
      </div>
      {YEARS.map(y => {
        const oom = ooms.get(y);
        const pdfs = oom?.pdfs ?? [];
        return (
          <div key={y} className="card" style={{ marginBottom: 10 }}>
            <div className="h-md fs-14" style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span>{y}</span>
              <ExtLink href={`${JTS_BASE}/${y}-oom-s`} className="fs-11 muted">↗ página oficial</ExtLink>
            </div>
            {pdfs.length === 0 ? (
              <div className="muted fs-11">Sem OOM publicado.</div>
            ) : (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {pdfs.map((p, i) => (
                  <ExtLink key={i} href={p.href} className="chip" title={p.text}>
                    📄 {p.text || "PDF"}
                  </ExtLink>
                ))}
              </div>
            )}
            {oom?.rulesText && (
              <details style={{ marginTop: 8 }}>
                <summary className="fs-11 muted" style={{ cursor: "pointer" }}>Regras de qualificação</summary>
                <div className="fs-11 c-text-2" style={{ marginTop: 6, whiteSpace: "pre-wrap" }}>{oom.rulesText}</div>
              </details>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ── Adaptador: events + results → CircuitEntry[] ─────────────── */

function buildJtsEntries(
  bundles: { year: number; events: EventsFile | null; results: ResultsFile | null }[],
): CircuitEntry[] {
  const out: CircuitEntry[] = [];
  for (const b of bundles) {
    const events = b.events?.events ?? [];
    const pdfs = b.results?.pdfs ?? [];
    const byEvent = matchPdfsToEvents(pdfs, events);

    for (const e of events) {
      const ePdfs = byEvent.get(e) ?? [];
      const eLinks: CircuitLink[] = ePdfs.map(p => ({
        label: p.text || "PDF",
        url: p.href,
        icon: "📄",
        title: p.text,
      }));

      const division: CircuitDivision = {
        key: "info",
        escalao: e.wagrEgr && /wagr/i.test(e.wagrEgr) ? "WAGR/EGR" : "JTS",
        tabLabel: "Evento",
        customResults: <EventDetail event={e} pdfs={ePdfs} year={b.year} />,
        links: eLinks,
      };

      const id = `jts-${b.year}-${slugify(shortVenue(e.venue))}-${e.dateStart?.slice(5) ?? slugify(e.dateRaw)}`;
      out.push({
        id,
        year: b.year,
        name: shortVenue(e.venue),
        source: "jts",
        course: e.venue,
        dateStart: e.dateStart ?? undefined,
        dateEnd: e.dateEnd ?? undefined,
        sourceUrl: `${JTS_BASE}/${b.year}-events`,
        playerCount: 0,
        roundsCount: 0,
        divisionCount: 1,
        hasManuel: false,
        divisions: [division],
        links: eLinks.length > 0 ? eLinks : undefined,
      });
    }
  }
  out.sort((a, b) => {
    if (a.year !== b.year) return (b.year ?? 0) - (a.year ?? 0);
    return (a.dateStart ?? "").localeCompare(b.dateStart ?? "");
  });
  return out;
}

/* ── Conteúdo principal ───────────────────────────────────────── */

function ScotlandContent() {
  const navigate = useNavigate();
  const params = useParams<{ id?: string }>();
  const [entries, setEntries] = useState<CircuitEntry[]>([]);
  const [ooms, setOoms] = useState<Map<number, OomFile | null>>(new Map());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    Promise.all(YEARS.map(async (y) => {
      const [events, results, oom] = await Promise.all([
        cachedFetchJson<EventsFile>(`/data/scotland-jts-${y}-events.json`).catch(() => null),
        cachedFetchJson<ResultsFile>(`/data/scotland-jts-${y}-results.json`).catch(() => null),
        cachedFetchJson<OomFile>(`/data/scotland-jts-${y}-oom.json`).catch(() => null),
      ]);
      return { year: y, events, results, oom };
    })).then(bundles => {
      if (!alive) return;
      setEntries(buildJtsEntries(bundles));
      const oomMap = new Map<number, OomFile | null>();
      bundles.forEach(bn => oomMap.set(bn.year, bn.oom));
      setOoms(oomMap);
      setLoading(false);
    });
    return () => { alive = false; };
  }, []);

  const specialItems: CircuitSpecialItem[] = useMemo(() => [
    {
      key: "oom",
      label: "🏆 Order of Merit",
      render: () => <OomView ooms={ooms} />,
    },
  ], [ooms]);

  const config: CircuitConfig = useMemo(() => ({
    routeBase: "/scotland",
    title: `${SCOT_FLAG} Junior Tour Scotland`,
    color: SCOTLAND_BLUE,
    textColor: "#fff",
    grouping: "year",
    sourceColors: { jts: SCOTLAND_BLUE },
    sourceLabels: { jts: "JTS" },
    specialItems,
    filters: { search: true, year: true },
    loadingMessage: "A carregar Junior Tour Scotland...",
  }), [specialItems]);

  if (loading) return <LoadingState message="A carregar Junior Tour Scotland..." />;

  return (
    <CircuitShell
      entries={entries}
      config={config}
      selectedId={params.id}
      onSelectEntry={(e) => navigate(`/scotland/${e.id}`)}
    />
  );
}

/* ── Export com gate ──────────────────────────────────────────── */

export default function ScotlandPage() {
  const { unlocked, unlock } = usePasswordGate();
  if (!unlocked) return <PasswordGate onUnlock={unlock} />;
  return <ScotlandContent />;
}
