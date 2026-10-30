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
import { withDivisionModel } from "../data/model/division";
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import DetailHeader from "../ui/DetailHeader";
import EmptyState from "../ui/EmptyState";
import LoadingState from "../ui/LoadingState";
import ExtLink from "../ui/ExternalLink";
import { C } from "../utils/colors";
import DrawTab from "../ui/DrawTab";
import type { Player as FPGPlayer } from "./FPGPage";
import { RFEGFederationsView } from "./rfeg/FederationsView";
import { RFEGPlayersView } from "./rfeg/PlayersView";
import CircuitShell from "../ui/circuit/CircuitShell";
import type { CircuitConfig, CircuitDivision } from "../ui/circuit/types";
import { tournamentFamilyKey } from "../ui/circuit/pastEditions";
import type { RFEGIndexEntry, DobLookup, HcpLookup } from "../data/rfeg/types";
import { lgsScorecardOptions } from "../data/rfeg/toTournament";
import { rfegSex } from "../data/rfeg/entries";
import { rfegRoundDraw, type RfegDrawDetail } from "../data/rfeg/roundDraw";
import { loadRfegDivisionData } from "../data/rfeg/divisionData";
import TotalsResumo, { type TotalsPlayer } from "../ui/circuit/TotalsResumo";
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
        <div className="d-flex gap-4 flex-wrap mb-12">
          {horarios.map(r => (
            <button
              key={r.round}
              type="button"
              className={`chip chip-round ${activeRound === r.round ? "active" : ""}`}
              onClick={() => setActiveRound(r.round)}
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
              className="tourn-ext-link ml-8"
            >
              🔗 rfegolf.es
            </ExtLink>
          </>
        }
      />

      <div className="rfeg-es-notice">
        <strong>⚠ Espanha não tem federação única.</strong> A RFEG (federação
        nacional) coexiste com 17 federações autonómicas (Andalucía, Madrid,
        Catalunya, Valencia, ...). Os resultados aparecem dispersos por três
        plataformas: <code>rfegolf.es</code> (campeonatos nacionais),{" "}
        <code>livegolfscoring.es</code> (scorecards hbh) e{" "}
        <code>nextcaddy.com</code> (circuitos regionais Andaluzia/Madrid).
      </div>

      <div className="scroll-x mt-16">
        <table className="dtable">
          <thead>
            <tr>
              <th>Categoría RFEG</th>
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
                  <td className="ta-c mono">
                    <strong>{c.subN}</strong>
                  </td>
                  <td className="ta-c">{c.age}</td>
                  <td className="ta-c mono">
                    {c.millesime}
                  </td>
                  <td className="ta-c mono">
                    {c.intl}
                  </td>
                  <td className="ta-c">{c.fpg}</td>
                  <td className="ta-c c-text-2">
                    {c.ffg}
                  </td>
                  <td className="r mono">
                    {total > 0 ? (
                      <span title={`${trad} como "${traditionalKey}" + ${sub} como "${subRfeg}"`}>
                        {total}
                        {trad > 0 && sub > 0 && (
                          <span className="muted fs-10">
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

      <div className="mt-24">
        <h3 className="mb-8">📐 Critério de cálculo do escalão</h3>
        <p className="fs-12">
          Tal como na FPG, o escalão é determinado pelo <strong>ano civil</strong>
          {" "}(year-based), não pela idade exacta na data do torneio. A fórmula é:
        </p>
        <pre className="info-pre info-pre-muted">
          {`escalão = ano_torneio − ano_nascimento

p.ex. jogador nascido em 2014, em 2026:
  escalão = 2026 − 2014 = 12 → ALEVÍN (Sub-12)`}
        </pre>
      </div>

      <div className="mt-24">
        <h3 className="mb-8">🗂️ Nomenclatura dupla</h3>
        <p className="fs-12">
          Nos torneios scrapados aparecem <em>simultaneamente</em> as duas
          nomenclaturas:
        </p>
        <ul className="fs-12 mt-8">
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
        <p className="muted fs-11 mt-8">
          A coluna <strong>Torneios no índice</strong> soma ocorrências das duas
          nomenclaturas. Em algumas categorias (p.ex. Sub-21/Juvenil) os
          critérios de idade variam ligeiramente entre torneios — verificar
          regulamento específico.
        </p>
      </div>

      <div className="muted fs-11 mt-24">
        <strong>Notas:</strong>
        <ul className="mt-4">
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

/** Destaques de live scoring (NextCaddy só-PDF) no TotalsResumo partilhado. */
const NC_HIGHLIGHT_COLS = ([["ace", "🏌 HiO", "Hole-in-one"], ["eagle", "🦅 Eagle", "Eagles"], ["birdie", "🐦 Birdie", "Birdies"]] as const).map(([k, header, title]) => ({
  header, title,
  value: (p: TotalsPlayer) => (p[k] as number) || "—",
  sortValue: (p: TotalsPlayer) => -((p[k] as number) || 0),
}));

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
  const tDate = data.meta.dateStart ?? undefined;
  const customResults: React.ReactNode = d.ncTotals
    ? <TotalsResumo parPerRound={null} players={d.ncTotals} tournamentDate={tDate} />
    : d.ncHighlights ? (
      <TotalsResumo parPerRound={null} players={d.ncHighlights.players} tournamentDate={tDate} extra={NC_HIGHLIGHT_COLS}
        notice={<p className="muted fs-13 mb-8">{d.ncHighlights.hasPdf
          ? "⚠ Resultados finais só publicados em PDF (ver link no cabeçalho). Destaques de live-scoring registados durante o jogo:"
          : "⚠ Sem leaderboard publicado na plataforma — apenas destaques de live-scoring registados durante o jogo:"}</p>} />
    ) : undefined;

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
    // Campeonatos por equipas (FFAA): os cruzamentos depois do stroke play → aba «Match Play».
    matchplay: d.matchplay ?? undefined,
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
    return [mkSex("M", d.bySex.M), mkSex("F", d.bySex.F)].map(withDivisionModel);
  }

  // Modelo comum (src/data/model): formato, estado, buracos, cut, par.
  return [withDivisionModel(division)];
}

const RFEG_CONFIG: CircuitConfig = {
  routeBase: "/rfeg",
  title: "🇪🇸 España",
  color: "var(--color-rfeg-red)",
  grouping: "year",
  escalaoSource: "es",
  sourceColors: { rfegolf: "var(--color-rfeg-red)", livegolfscoring: C.rfegSrc.livegolfscoring, golfdirecto: C.rfegSrc.golfdirecto, nextcaddy: "var(--color-rfeg-yellow)", fgcv: C.rfegSrc.fgcv, fvg: C.rfegSrc.fvg },
  sourceLabels: { rfegolf: "RFEGolf", livegolfscoring: "LGS", golfdirecto: "GolfDirecto", nextcaddy: "NextCaddy", fgcv: "FGCV", fvg: "FVG" },
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
