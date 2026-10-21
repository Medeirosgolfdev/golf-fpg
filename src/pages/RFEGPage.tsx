/**
 * RFEGPage.tsx — Tracker de torneios juvenis espanhois
 *
 * Agrega as fontes de Espanha: rfegolf.es (Campeonatos Nacionais + mitarjeta),
 * nextcaddy.com (RFGA Andaluzia + FGM Madrid), livegolfscoring e golfdirecto.
 *
 * Assente no CircuitShell partilhado. Os dados (índice, adaptadores de cada
 * fonte, conversão para o formato FPG, escalões, bandeiras, inscrições, draws)
 * vivem em src/data/rfeg/ desde 21/10/2026; aqui fica o que se desenha.
 */
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useSort } from "../hooks/useSort";
import { KidsLink } from "../ui/KidsLink";
import DetailHeader from "../ui/DetailHeader";
import EmptyState from "../ui/EmptyState";
import LoadingState from "../ui/LoadingState";
import { ManuelPill } from "../ui/PillBadge";
import SortableHdr from "../ui/SortableHdr";
import SexBadge from "../ui/SexBadge";
import ExtLink from "../ui/ExternalLink";
import { ScorecardLeaderboard, type ScorecardRow } from "../ui/ScorecardLeaderboard";
import { isManuelByName as isM } from "../constants/manuel";
import { displayName } from "../utils/format";
import { formatPlayerName } from "../utils/playerUtils";
import DrawTab from "../ui/DrawTab";
import type { Player as FPGPlayer } from "./FPGPage";
import { RFEGFederationsView } from "./rfeg/FederationsView";
import { RFEGPlayersView } from "./rfeg/PlayersView";
import CircuitShell from "../ui/circuit/CircuitShell";
import type { CircuitConfig, CircuitDivision } from "../ui/circuit/types";
import { tournamentFamilyKey } from "../ui/circuit/pastEditions";
import type { RFEGIndexEntry, RFEGPlayer, DobLookup, HcpLookup } from "../data/rfeg/types";
import { lgsScorecardOptions } from "../data/rfeg/toTournament";
import { rfegSex } from "../data/rfeg/entries";
import { rfegRoundDraw, type RfegDrawDetail } from "../data/rfeg/roundDraw";
import { loadRfegDivisionData, type NCHighlightRow } from "../data/rfeg/divisionData";
import { useRfegData } from "../data/rfeg/useRfegData";

/* ── DrawSaidaView ──────────────────────────────────────────
 * Aba "Draw R{n}" da RFEGPage — o DrawTab partilhado (= FPG). Os dados (horários
 * de cada fonte → FpgDraw, enriquecido com o leaderboard) vêm do rfegRoundDraw
 * (src/data/rfeg/roundDraw.ts); aqui só se desenha. */
function DrawSaidaView({ detail, entry, onlyRound }: {
  detail: RfegDrawDetail;
  entry: RFEGIndexEntry;
  /** Se definido, renderiza SÓ esta ronda (sem os chips R1/R2/R3) — usado quando o
   *  draw de cada ronda é uma aba própria intercalada na barra principal. */
  onlyRound?: number;
}) {
  const [activeRoundState, setActiveRound] = useState<number>(1);
  // Em modo `onlyRound` (aba por ronda na barra principal), a ronda é fixa.
  const activeRound = onlyRound ?? activeRoundState;
  const { horarios, draw, playersDB, results, tournamentDate } = useMemo(
    () => rfegRoundDraw(detail, entry, activeRound),
    [detail, entry, activeRound],
  );

  if (!horarios || horarios.length === 0) {
    return <EmptyState message={
      entry.source === "nextcaddy" || entry.source === "livegolfscoring"
        ? "Sem tee times publicados para este torneio."
        : "Tee times ainda não disponíveis. Consulta o Microsite oficial."
    } />;
  }
  if (!draw) return <EmptyState message="Sem dados de draw para esta ronda." />;

  return (
    <div>
      {onlyRound == null && horarios.length > 1 && (
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 12 }}>
          {horarios.map(r => (
            <button
              key={r.round}
              type="button"
              className={`chip ${activeRound === r.round ? "active" : ""}`}
              onClick={() => setActiveRound(r.round)}
              style={{ cursor: "pointer", fontSize: "var(--fs-12)", padding: "3px 10px" }}
            >
              R{r.round} · {r.players.length} jog
            </button>
          ))}
        </div>
      )}
      <DrawTab
        draw={draw}
        roundNum={activeRound}
        tournamentDate={tournamentDate}
        playersDB={playersDB}
        results={results}
      />
    </div>
  );
}

/* ── RFEGCategoriesView (Categorías de edad RFEG — info no body) ─────── */

interface RFEGCategory {
  /** Nome oficial RFEG (ALEVÍN, INFANTIL, CADETE, BENJAMÍN, ...). */
  name: string;
  /** Equivalente moderno Sub-N (Sub-10, Sub-12, ...). */
  subN: string;
  /** Idades (anos cumpridos no ano civil). */
  age: string;
  /** Faixa de millésime (ano de nascimento) para o ano de referência (2026). */
  millesime: string;
  /** Equivalente internacional (U-age). */
  intl: string;
  /** Equivalente FPG (escalão português). */
  fpg: string;
  /** Equivalente FFG (categoria francesa). */
  ffg: string;
  /** Cor do pill (matches catPillClass). */
  pillClass?: string;
}

/**
 * Categorias oficiais da RFEG (Real Federación Española de Golf).
 *
 * Fonte: art. comum do regulamento RFEG (imagem original do utilizador
 * "CADETE: 15 y 16 años | INFANTIL: 13 y 14 años | ALEVÍN: 11 y 12 años |
 * BENJAMIN: ..., 7, 8, 9 y 10 años") + dados que aparecem nos torneios
 * scrapados (rfegolf-resultats-index.json contém Benjamín, Alevín, Infantil,
 * Cadete, Junior, Juvenil, Sub-14/16/18/21/25).
 *
 * O ano civil é o critério (igual à FPG): para o ano Y, "Sub-N" significa
 * (Y - ano de nascimento) ≤ N. As tradicionais Benjamín/Alevín/Infantil/Cadete
 * são intervalos exactos.
 *
 * Nota: a tabela usa 2026 como ano de referência; os millésimes deslocam +1
 * por cada ano que passa.
 */
const RFEG_CATEGORIES: RFEGCategory[] = [
  {
    name: "BENJAMÍN",
    subN: "Sub-10",
    age: "≤ 10 anos (7, 8, 9, 10)",
    millesime: "2016-2019",
    intl: "U10",
    fpg: "Sub-10",
    ffg: "Poucet / Poussin",
    pillClass: "p p-sub10 p-sm",
  },
  {
    name: "ALEVÍN",
    subN: "Sub-12",
    age: "11-12 anos",
    millesime: "2014-2015",
    intl: "U12",
    fpg: "Sub-12",
    ffg: "Poussin",
    pillClass: "p p-sub10 p-sm",
  },
  {
    name: "INFANTIL",
    subN: "Sub-14",
    age: "13-14 anos",
    millesime: "2012-2013",
    intl: "U14",
    fpg: "Sub-14",
    ffg: "Benjamin",
    pillClass: "p p-sub12 p-sm",
  },
  {
    name: "CADETE",
    subN: "Sub-16",
    age: "15-16 anos",
    millesime: "2010-2011",
    intl: "U16",
    fpg: "Sub-16",
    ffg: "Minime",
    pillClass: "p p-sub14 p-sm",
  },
  {
    name: "JUNIOR / BOY",
    subN: "Sub-18",
    age: "17-18 anos",
    millesime: "2008-2009",
    intl: "U18",
    fpg: "Sub-18",
    ffg: "Cadet",
    pillClass: "p p-sm",
  },
  {
    name: "JUVENIL",
    subN: "Sub-21",
    age: "≤ 21 anos (regra ampla)",
    millesime: "≥ 2005",
    intl: "U21",
    fpg: "Sub-21",
    ffg: "Espoir",
    pillClass: "p p-sm p-muted",
  },
  {
    name: "SUB-25",
    subN: "Sub-25",
    age: "≤ 25 anos",
    millesime: "≥ 2001",
    intl: "U25",
    fpg: "Sub-25",
    ffg: "—",
    pillClass: "p p-sm p-muted",
  },
];

function RFEGCategoriesView({ catCounts }: { catCounts: Record<string, number> }) {
  const refYear = 2026;
  return (
    <div className="p-12-16">
      <DetailHeader
        title="📚 Categorías de edad RFEG"
        sub={
          <>
            <span className="muted">
              Real Federación Española de Golf — categorias oficiais por idade (ano de
              referência {refYear})
            </span>
            <ExtLink
              href="https://rfegolf.es/"
              className="tourn-ext-link"
              style={{ marginLeft: 8 }}
            >
              🔗 rfegolf.es
            </ExtLink>
          </>
        }
      />

      <div style={{ marginTop: 12, padding: "10px 12px", background: "var(--bg-muted, #fff7e6)", border: "1px solid var(--border, var(--color-rfeg-yellow))", borderRadius: 6, fontSize: "var(--fs-12)" }}>
        <strong>⚠ Espanha não tem federação única.</strong> A RFEG (federação
        nacional) coexiste com 17 federações autonómicas (Andalucía, Madrid,
        Catalunya, Valencia, ...). Os resultados aparecem dispersos por três
        plataformas: <code>rfegolf.es</code> (campeonatos nacionais),{" "}
        <code>livegolfscoring.es</code> (scorecards hbh) e{" "}
        <code>nextcaddy.com</code> (circuitos regionais Andaluzia/Madrid).
      </div>

      <div style={{ overflowX: "auto", marginTop: 16 }}>
        <table className="dtable">
          <thead>
            <tr>
              <th style={{ textAlign: "left" }}>Categoría RFEG</th>
              <th>Sub-N moderno</th>
              <th>Idade</th>
              <th>Millésime ({refYear})</th>
              <th>Internacional</th>
              <th>FPG 🇵🇹</th>
              <th>FFG 🇫🇷</th>
              <th>Torneios no índice</th>
            </tr>
          </thead>
          <tbody>
            {RFEG_CATEGORIES.map((c) => {
              const subShort = c.subN.replace("Sub-", "");
              const subRfeg = `Sub-${subShort}`;
              // Conta torneios para este escalão (somando o nome tradicional + Sub-N)
              const traditionalKey = c.name === "JUNIOR / BOY" ? "Junior" : (c.name === "BENJAMÍN" ? "Benjamín" : c.name === "ALEVÍN" ? "Alevín" : c.name === "INFANTIL" ? "Infantil" : c.name === "CADETE" ? "Cadete" : c.name === "JUVENIL" ? "Juvenil" : c.name);
              const trad = catCounts[traditionalKey] || 0;
              const sub = catCounts[subRfeg] || 0;
              const total = trad + sub;
              return (
                <tr key={c.name}>
                  <td>
                    <span className={c.pillClass || "p p-sm"}>{c.name}</span>
                  </td>
                  <td style={{ textAlign: "center", fontFamily: "var(--font-mono)" }}>
                    <strong>{c.subN}</strong>
                  </td>
                  <td style={{ textAlign: "center" }}>{c.age}</td>
                  <td style={{ textAlign: "center", fontFamily: "var(--font-mono)" }}>
                    {c.millesime}
                  </td>
                  <td style={{ textAlign: "center", fontFamily: "var(--font-mono)" }}>
                    {c.intl}
                  </td>
                  <td style={{ textAlign: "center" }}>{c.fpg}</td>
                  <td style={{ textAlign: "center", color: "var(--text-2)" }}>
                    {c.ffg}
                  </td>
                  <td style={{ textAlign: "right", fontFamily: "var(--font-mono)" }}>
                    {total > 0 ? (
                      <span title={`${trad} como "${traditionalKey}" + ${sub} como "${subRfeg}"`}>
                        {total}
                        {trad > 0 && sub > 0 && (
                          <span className="muted" style={{ fontSize: "var(--fs-10)" }}>
                            {" "}({trad}+{sub})
                          </span>
                        )}
                      </span>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 24 }}>
        <h3 style={{ marginBottom: 8 }}>📐 Critério de cálculo do escalão</h3>
        <p className="fs-12">
          Tal como na FPG, o escalão é determinado pelo <strong>ano civil</strong>
          {" "}(year-based), não pela idade exacta na data do torneio. A fórmula é:
        </p>
        <pre style={{
          padding: 12,
          background: "var(--bg-muted, #f5f5f5)",
          border: "1px solid var(--border)",
          borderRadius: 4,
          fontSize: "var(--fs-12)",
          overflow: "auto",
        }}>
          {`escalão = ano_torneio − ano_nascimento

p.ex. jogador nascido em 2014, em 2026:
  escalão = 2026 − 2014 = 12 → ALEVÍN (Sub-12)`}
        </pre>
      </div>

      <div style={{ marginTop: 24 }}>
        <h3 style={{ marginBottom: 8 }}>🗂️ Nomenclatura dupla</h3>
        <p className="fs-12">
          Nos torneios scrapados aparecem <em>simultaneamente</em> as duas
          nomenclaturas:
        </p>
        <ul style={{ fontSize: "var(--fs-12)", marginTop: 8 }}>
          <li>
            <strong>Tradicional</strong> — nomes históricos (Benjamín, Alevín,
            Infantil, Cadete, Junior, Juvenil). Usados sobretudo nos campeonatos
            regionais e em torneios mais antigos. Vêm directamente do nome do
            torneio na <code>rfegolf.es</code>.
          </li>
          <li>
            <strong>Moderno Sub-N</strong> — Sub-14, Sub-16, Sub-18, Sub-21, Sub-25.
            Usados em campeonatos nacionais juvenis recentes e nos
            inter-territoriais. Aparecem em "Campeonato Nacional Sub 16
            Masculino", etc.
          </li>
        </ul>
        <p className="muted fs-11" style={{ marginTop: 8 }}>
          A coluna <strong>Torneios no índice</strong> soma ocorrências das duas
          nomenclaturas. Em algumas categorias (p.ex. Sub-21/Juvenil) os
          critérios de idade variam ligeiramente entre torneios — verificar
          regulamento específico.
        </p>
      </div>

      <div className="muted fs-11" style={{ marginTop: 24 }}>
        <strong>Notas:</strong>
        <ul style={{ marginTop: 4 }}>
          <li>
            <em>Benjamín</em> abrange tipicamente 7-10 anos (raramente &lt;7,
            depende do clube/comité). O critério é só o limite superior.
          </li>
          <li>
            <em>Juvenil</em> é o termo histórico amplo para idades 17-21+ — em
            alguns torneios é equivalente a Sub-18, noutros estende até Sub-21.
          </li>
          <li>
            <em>Junior</em> e <em>Boy/Girl</em> são intercambiáveis em RFEG;
            <em> Boy</em> aparece em torneios internacionais.
          </li>
          <li>
            Distância de saída e número de buracos são definidos pelo Comité da
            prova (regulamento RFEG Art. comum).
          </li>
        </ul>
      </div>
    </div>
  );
}

function NCHighlights({ rows, hasPdf }: { rows: NCHighlightRow[]; hasPdf?: boolean }) {
  const { sortKey, sortDir, toggleSort } = useSort<"name" | "ace" | "eagle" | "birdie">("name");
  const sorted = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    const val = (r: NCHighlightRow): string | number => (sortKey === "name" ? r.name.toLowerCase() : r[sortKey]);
    return [...rows].sort((a, b) => { const va = val(a), vb = val(b); return va < vb ? -dir : va > vb ? dir : 0; });
  }, [rows, sortKey, sortDir]);
  const hdr = (k: "name" | "ace" | "eagle" | "birdie", label: string) => (
    <SortableHdr k={k} sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>{label}</SortableHdr>
  );
  return (
    <div>
      <p className="muted" style={{ fontSize: "var(--fs-13)", margin: "0 0 8px" }}>
        {hasPdf
          ? "⚠ Resultados finais só publicados em PDF (ver link no cabeçalho). Destaques de live-scoring registados durante o jogo:"
          : "⚠ Sem leaderboard publicado na plataforma — apenas destaques de live-scoring registados durante o jogo:"}
      </p>
      <div className="bjgt-chart-scroll">
        <table className="sc-lb">
          <thead><tr>{hdr("name", "Jogador")}{hdr("ace", "🏌 HiO")}{hdr("eagle", "🦅 Eagle")}{hdr("birdie", "🐦 Birdie")}</tr></thead>
          <tbody>
            {sorted.map((r, i) => (
              <tr key={i} className={isM(r.name) ? "row-manuel" : undefined}>
                <td className="lb-name fw-700" style={{ textAlign: "left" }}>{r.name}{isM(r.name) && <> <ManuelPill /></>}</td>
                <td>{r.ace || "—"}</td>
                <td>{r.eagle || "—"}</td>
                <td>{r.birdie || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ── NCResultsLeaderboard ────────────────────────────────────────────────
 * Leaderboard de TOTAIS (sem scorecard buraco-a-buraco). Usado quando a fonte
 * dá pos/total/±par por jogador mas não os scores hole-by-hole (ex: NextCaddy
 * Liguillas, cujo leaderboard é real mas sem cartões). Mesmo aspecto .sc-lb que
 * o resto da app, via ScorecardLeaderboard sem scorecard. Colunas vazias ocultas. */
function NCResultsLeaderboard({ players }: { players: RFEGPlayer[] }) {
  type K = "pos" | "nome" | "toPar" | "total" | "hcp" | "club" | "fed";
  const { sortKey, sortDir, toggleSort } = useSort<K>("pos");
  const showFed = players.some((p) => !!p.licencia);
  const showClub = players.some((p) => !!p.club);
  const showHcp = players.some((p) => p.hcp != null);

  const enriched = useMemo(() => players.map((p) => ({
    ...p,
    _name: formatPlayerName(p.name || ""),
    _club: p.club ? displayName(p.club) : "",
  })), [players]);

  const sorted = useMemo(() => {
    const INF = 9999;
    const mult = sortDir === "asc" ? 1 : -1;
    return [...enriched].sort((a, b) => {
      let v = 0;
      switch (sortKey) {
        case "pos":   v = (a.pos ?? INF) - (b.pos ?? INF); break;
        case "nome":  v = (a._name || "").localeCompare(b._name || "", "pt"); break;
        case "toPar": v = (a.toPar ?? INF) - (b.toPar ?? INF); break;
        case "total": v = (a.total ?? INF) - (b.total ?? INF); break;
        case "hcp":   v = (a.hcp ?? INF) - (b.hcp ?? INF); break;
        case "club":  v = (a._club || "").localeCompare(b._club || "", "es"); break;
        case "fed":   v = (a.licencia || "").localeCompare(b.licencia || ""); break;
      }
      return mult * v;
    });
  }, [enriched, sortKey, sortDir]);

  const rows: ScorecardRow[] = sorted.map((p, i) => {
    const manuel = p._name ? isM(p._name) : false;
    return {
      key: `${p.licencia ?? "-"}-${i}`,
      pos: p.pos ?? i + 1,
      gross: p.total ?? 0,
      toPar: p.toPar ?? null,
      isManuel: manuel,
      sortPos: p.pos ?? null,
      sortName: p._name || "",
      fedCode: p.licencia ?? undefined,
      nameContent: (
        <span className="tourn-pname" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
          {p._name || "—"}
          {(p.sexo === "M" || p.sexo === "F") && <SexBadge sex={p.sexo} />}
          {manuel && <ManuelPill />}
          {p._name && <KidsLink nome={p._name} />}
        </span>
      ),
      prefixCells: (
        <>
          {showFed && <td className="lb-fed">{p.licencia ?? "—"}</td>}
          {showClub && <td className="lb-club" title={p._club}>{p._club || "—"}</td>}
          {showHcp && <td className="lb-hcp">{p.hcp != null ? p.hcp.toFixed(1) : "—"}</td>}
        </>
      ),
    };
  });

  return (
    <ScorecardLeaderboard
      par={[]}
      rows={rows}
      showScorecard={false}
      prefixHeaderCells={
        <>
          {showFed && <SortableHdr k="fed" sortKey={sortKey} sortDir={sortDir} onSort={(k) => toggleSort(k as K)} className="lb-fed">LICENCIA</SortableHdr>}
          {showClub && <SortableHdr k="club" sortKey={sortKey} sortDir={sortDir} onSort={(k) => toggleSort(k as K)} className="lb-club">CLUBE</SortableHdr>}
          {showHcp && <SortableHdr k="hcp" sortKey={sortKey} sortDir={sortDir} onSort={(k) => toggleSort(k as K)} className="lb-hcp">HCP</SortableHdr>}
        </>
      }
      onSortPos={() => toggleSort("pos")}
      onSortName={() => toggleSort("nome")}
      onSortToPar={() => toggleSort("toPar")}
      onSortGross={() => toggleSort("total")}
      activeSortKey={sortKey === "nome" ? "name" : sortKey === "total" ? "gross" : sortKey}
      activeSortDir={sortDir}
    />
  );
}

/** Carrega o detalhe de um torneio (src/data/rfeg/divisionData.ts) e desenha a
 *  sua divisão — ou duas (M/F) no NextCaddy com rapazes e raparigas. */
async function rfegLoadDivisions(
  t: RFEGIndexEntry, dobLookup?: DobLookup, hcpLookup?: HcpLookup,
): Promise<CircuitDivision[]> {
  const d = await loadRfegDivisionData(t, dobLookup, hcpLookup);
  if (!d) return [];
  const { data, results } = d;

  // NextCaddy sem cartões: leaderboard de totais (Liguillas) ou, sem nem isso,
  // os destaques de live scoring.
  const customResults: React.ReactNode = d.ncTotals
    ? <NCResultsLeaderboard players={d.ncTotals} />
    : d.ncHighlights ? <NCHighlights rows={d.ncHighlights.rows} hasPdf={d.ncHighlights.hasPdf} /> : undefined;

  // Draw por ronda → abas "Draw R{n}" intercaladas com os resultados (o MESMO
  // DrawSaidaView → DrawTab partilhado, uma ronda de cada vez).
  const roundDraws = d.drawRounds.map((round) => ({ round, render: () => <DrawSaidaView detail={data} entry={t} onlyRound={round} /> }));

  const division: CircuitDivision = {
    key: "main",
    escalao: t.category ?? "—",
    sex: rfegSex(t.sex),
    results: results ?? undefined,
    customResults,
    // Inscrições no formato FPG → AdmissionsTab partilhado.
    admissions: d.admissions,
    // Draw por ronda intercalado (ver roundDraws acima) — sem aba "Draw" agregada.
    roundDraws: roundDraws.length ? roundDraws : undefined,
    links: d.links.length ? d.links : undefined,
    // Sem SD: a RFEG não publica o SD dos jogadores e o site só mostra SD oficiais.
    scOptions: { ...lgsScorecardOptions(), hideSD: true },
  };

  // NextCaddy junta rapazes e raparigas no MESMO tour → 2 tabs M/F (só gross).
  if (d.bySex && results) {
    const escLbl = t.category ?? division.escalao;
    const mkSex = (sx: "M" | "F", plist: FPGPlayer[]): CircuitDivision => ({
      ...division,
      key: sx,
      sex: sx,
      tabLabel: `${escLbl} ${sx}`,
      results: { ...results, players: plist, playerCount: plist.length },
    });
    return [mkSex("M", d.bySex.M), mkSex("F", d.bySex.F)];
  }

  return [division];
}

const RFEG_CONFIG: CircuitConfig = {
  routeBase: "/rfeg",
  title: "🇪🇸 España",
  color: "var(--color-rfeg-red)",
  grouping: "year",
  sourceColors: { rfegolf: "var(--color-rfeg-red)", livegolfscoring: "#00aa55", golfdirecto: "#0066cc", nextcaddy: "var(--color-rfeg-yellow)" },
  sourceLabels: { rfegolf: "RFEGolf", livegolfscoring: "LGS", golfdirecto: "FCG", nextcaddy: "NextCaddy" },
  filters: { search: true, year: true, escalao: true, sex: true, source: true, toggles: ["manuel", "pt", "top10", "veteranos", "results"], defaultToggles: ["results"] },
  veteranoThreshold: 3,
  // "Edições anteriores": família pelo nome do torneio (sem ano) — os
  // Campeonatos recorrem e agrupam-se; os tours de nome único ficam singletons
  // (a tab esconde-se). Só é útil quando há ≥2 anos com o mesmo nome.
  editionKey: (e) => tournamentFamilyKey(e.name),
  loadingMessage: "A carregar dados...",
};


export default function RFEGPage() {
  const { index, entries, twins, vetIndex, error } = useRfegData(rfegLoadDivisions);
  const navigate = useNavigate();
  const params = useParams<{ source?: string; id?: string; compId?: string }>();

  // Aterrar num URL RFEGolf com gémeo LGS → redirige para o LGS rico (hbh+metros).
  useEffect(() => {
    if (params.source === "rfegolf" && params.id && twins[params.id] != null) {
      navigate(`/rfeg/livegolfscoring/${twins[params.id]}`, { replace: true });
    }
  }, [params.source, params.id, twins, navigate]);

  // Vista informativa via URL: /rfeg/info/{key} (deep-linkável, persiste no reload).
  // "info" não colide com as fontes reais (rfegolf/nextcaddy/livegolfscoring/golfdirecto).
  const onInfo = params.source === "info";
  const selectedInfo = onInfo ? (params.id ?? null) : null;

  const selectedId = useMemo<string | undefined>(() => {
    if (onInfo) return undefined;
    const idStr = params.id ?? params.compId;
    if (!idStr) return undefined;
    if (params.source) {
      const direct = `${params.source}:${idStr}`;
      if (entries.some((e) => e.id === direct)) return direct;
      // Prova fundida numa entrada combinada (`grp-…`) → seleccionar o grupo.
      return entries.find((e) => e.memberIds?.includes(direct))?.id ?? direct;
    }
    return entries.find((e) => e.id.endsWith(`:${idStr}`) || e.memberIds?.some((m) => m.endsWith(`:${idStr}`)))?.id;
  }, [params.id, params.compId, params.source, entries, onInfo]);

  // Config + páginas informativas (menu INFO na toolbar do shell).
  const config = useMemo<CircuitConfig>(() => ({
    ...RFEG_CONFIG,
    veteranIndex: vetIndex.size ? vetIndex : undefined,
    specialItems: index ? [
      { key: "jugadores", label: "👥 Jugadores de España", render: () => <RFEGPlayersView /> },
      { key: "categorias", label: "📚 Categorías de edad", render: () => <RFEGCategoriesView catCounts={index.byCategory} /> },
      { key: "federaciones", label: "🏛️ Federaciones de España", render: () => <RFEGFederationsView /> },
    ] : [],
  }), [index, vetIndex]);

  if (error) return <EmptyState message={`Erro: ${error}`} />;
  if (!index) return <LoadingState message="A carregar índice RFEGolf..." />;

  return (
    <CircuitShell
      entries={entries}
      config={config}
      selectedId={selectedId}
      onSelectEntry={(e) => {
        const [src, id] = e.id.split(":");
        navigate(`/rfeg/${src}/${id}`);
      }}
      selectedInfo={selectedInfo}
      onSelectInfo={(key) => navigate(key ? `/rfeg/info/${key}` : "/rfeg")}
    />
  );
}
