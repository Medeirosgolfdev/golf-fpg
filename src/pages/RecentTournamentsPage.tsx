/**
 * RecentTournamentsPage.tsx — Torneios recentes reconstruídos a partir dos nossos
 *
 * Rota: /torneios-recentes  (e /torneios-recentes/:key para abrir um torneio)
 * FORA da NavBar (acesso por link directo).
 *
 * Ideia: muitos torneios recentes NÃO têm leaderboard scrapeada, mas os
 * "nossos" jogadores jogaram-nos — e cada volta WHS deles traz o scorecard.
 * Agregando por torneio (ccode|tcode) sabemos "quem dos nossos jogou + a
 * pontuação". Torneios com MUITOS dos nossos são bons candidatos a scrapear
 * a sério para ter o quadro completo.
 *
 * Desde 23/10/2026 (fase 7 do plano) vive no CircuitShell, como as outras
 * páginas de torneios: lista por ano (abre no ano corrente — são ~3 000),
 * «por scrapear / scrapeado» como fonte (chip e filtro), mínimo de nossos na
 * barra, e o detalhe no TournamentDetail da FPG. Dados em src/data/recentTournaments.ts.
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { PlayersDB } from "../ui/tournamentPrimitives";
import type { EscLookup } from "../utils/playerUtils";
import { cachedFetchJson } from "../data/fetchCache";
import { fpgOmRankingTabs } from "./fpg/fpgOmRanking";
import { loadPlayers } from "../data/loader";
import { buildEscLookup } from "../utils/playerUtils";
import { ToolbarTitle } from "../ui/Toolbar";
import LoadingState from "../ui/LoadingState";
import EmptyState from "../ui/EmptyState";
import CircuitShell from "../ui/circuit/CircuitShell";
import { CircuitToolbarSlotCtx } from "../ui/circuit/toolbarSlot";
import type { CircuitConfig, CircuitEntry, CircuitRenderFullExtras } from "../ui/circuit/types";
import { TournamentDetail } from "./fpg/TournamentDetail";
import {
  RECENT_URL, RECENT_SOURCES, normalizeRecent, recentEntry,
  type RecentDoc, type RecentTournament,
} from "../data/recentTournaments";

const CONFIG: CircuitConfig = {
  routeBase: "/torneios-recentes",
  title: "🏌️ Torneios recentes",
  grouping: "month-year",
  olderYearsByYear: true,
  sourceLabels: RECENT_SOURCES.labels,
  sourceColors: RECENT_SOURCES.colors,
  // ~3 000 torneios: abre no ano corrente (custo de desenhar a lista toda).
  filters: { search: true, year: true, source: true, toggles: ["manuel"], defaultYear: "current" },
  loadingMessage: "A carregar torneios recentes…",
};

/* ── Detalhe de um torneio ─────────────────────────────────────── */
function RecentDetail({ t, escLookup, playersDB, extras }: {
  t: RecentTournament; escLookup: EscLookup; playersDB: PlayersDB; extras?: CircuitRenderFullExtras;
}) {
  // Os links da Federação (Inscrições/Draw/Scoring ↗) vêm do próprio
  // TournamentDetail. Aqui só o link para a leaderboard completa no NOSSO
  // site, quando já scrapeada.
  const extraTabs = [...(fpgOmRankingTabs(t) ?? []), ...(extras?.repeatersTab ? [extras.repeatersTab] : [])];
  return (
    <div>
      <div className="u-d-flex u-ai-center u-gap-10px u-fwr-wrap u-p-2px-0-4px">
        <span className="u-fs-fs-12 u-c-text-muted">
          {t.nOurs} dos nossos · {t.scraped ? "leaderboard completa scrapeada" : "só os nossos (por scrapear)"}
        </span>
        {t.scraped && t.ccode && (
          <a href={`/FPG/torneio/${t.ccode}-${t.tcode}`} target="_blank" rel="noopener noreferrer"
             className="btn-pill u-fs-fs-12">
            ↗ Leaderboard completa no site
          </a>
        )}
      </div>
      <div className="u-p-0-0-4px u-fs-fs-11 u-c-text-muted">
        ⓘ Classificação e scorecards reconstruídos das voltas WHS dos jogadores que seguimos —
        a posição é <b>entre os nossos</b>, não a oficial do torneio.
      </div>
      <TournamentDetail tournament={t} escLookup={escLookup} playersDB={playersDB}
        extraTabs={extraTabs.length ? extraTabs : undefined} />
    </div>
  );
}

export default function RecentTournamentsPage() {
  const { key } = useParams<{ key?: string }>();
  const navigate = useNavigate();

  const [doc, setDoc] = useState<RecentDoc | null>(null);
  const [pdb, setPdb] = useState<PlayersDB>({});
  const [err, setErr] = useState<string | null>(null);
  /** Mínimo de nossos no torneio (vazio = todos). */
  const [minOurs, setMinOurs] = useState("");

  useEffect(() => {
    cachedFetchJson<RecentDoc>(RECENT_URL)
      .then(d => { if (!d) throw new Error("recent-tournaments.json vazio"); setDoc(d); })
      .catch(e => setErr(String(e?.message || e)));
    loadPlayers().then(p => setPdb(p as PlayersDB)).catch(() => setPdb({}));
  }, []);

  const tournaments = useMemo<RecentTournament[]>(() => (doc ? normalizeRecent(doc) : []), [doc]);
  const escLookup = useMemo(() => buildEscLookup(pdb as any, tournaments as any), [pdb, tournaments]);

  // Entradas (uma divisão cada, com o TournamentDetail). Refeitas só quando
  // os dados mudam — o shell guarda a selecção pelo id.
  const all = useMemo<CircuitEntry[]>(() => tournaments.map((t) => ({
    ...recentEntry(t),
    divisions: [{
      key: "t", escalao: t.escalao || "", results: t,
      renderFull: (extras?: CircuitRenderFullExtras) => <RecentDetail t={t} escLookup={escLookup} playersDB={pdb} extras={extras} />,
    }],
  })), [tournaments, escLookup, pdb]);
  const entries = useMemo(() => {
    const mo = minOurs === "" ? 0 : Number(minOurs);
    return mo > 0 ? all.filter((e) => (e.playerCount ?? 0) >= mo) : all;
  }, [all, minOurs]);
  const selectedId = key && all.some((e) => e.id === key) ? key : undefined;

  if (err) return <div className="u-p-24px"><EmptyState size="md" message={`Erro ao carregar: ${err}`} /></div>;
  if (!doc) return <LoadingState size="md" message="A carregar torneios recentes…" />;

  const lead = (<>
    <ToolbarTitle>🏌️ Torneios recentes</ToolbarTitle>
    <input type="number" min="1" className="input u-w-110px u-fs-fs-12 u-p-3px-8px" value={minOurs} onChange={(e) => setMinOurs(e.target.value)}
      placeholder="mín. nossos" title="Só torneios com pelo menos N dos nossos"
 />
  </>);
  const trail = (
    <span className="fs-11 u-c-text-muted u-ws-nowrap"
      title={`${doc.counts.unscraped.toLocaleString("pt-PT")} por scrapear`}>
      Reconstruído de {doc.counts.playersScanned} jogadores · desde {doc.since}
    </span>
  );

  return (
    <div className="tourn-layout u-h-calc-100vh-52px">
      <CircuitToolbarSlotCtx.Provider value={{ lead, trail, hideTitle: true }}>
        <CircuitShell
          entries={entries}
          config={CONFIG}
          selectedId={selectedId}
          onSelectEntry={(e) => navigate(`/torneios-recentes/${e.id}`, { replace: !key })}
        />
      </CircuitToolbarSlotCtx.Provider>
    </div>
  );
}
