/**
 * src/pages/jogadores/PlayerDetail.tsx
 *
 * Detalhe rico de um jogador "Nossos" (data.json local): header com pills
 * de identidade (IdentityPills, partilhados com o FederadoOnlyDetail) + KPI
 * strip + dropdown de vistas consolidado em 3 (🗓 Rondas com agrupamento
 * Data|Torneio · ⛳ Campos · 📊 Análises) e as vistas especiais
 * ?view=federado e ?view=pp. Deep-links legados (?view=by_tournament /
 * by_course_analysis) continuam válidos — mapeiam para o bucket respectivo.
 */
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import type { Player } from "../../data/types";
import { useAppContext } from "../../context/AppContext";
import type { PlayerPageData } from "../../data/playerDataLoader";
import { usePlayerData } from "../../data/usePlayerData";
import { loadFederados, type FederadoRaw, type MergedPlayer } from "../../data/federadosLoader";
import { loadFederadosPP, ppForFed, hasRealPPHcp, type FederadoPP } from "../../data/federadosPPLoader";
import { resolvePlayedTee, resolvePlayedSI, isFakeSI } from "../../utils/playedDistance";
import { acesFromHoleScores } from "../../utils/aces";
import { clubLong } from "../../utils/playerUtils";
import LoadingState from "../../ui/LoadingState";
import { ByTournamentView } from "../../ui/ByTournamentView";
import PPHistoryView from "./PPHistoryView";
import IdentityPills, { PlayerExtLinks } from "./IdentityPills";
import FederadoOnlyDetail from "./FederadoOnlyDetail";
import { syntheticFederadoFromPlayer } from "./syntheticFederado";
import PlayerKpiStrip from "./PlayerKpiStrip";
import ByDateView from "./views/ByDateView";
import ByCourseView from "./views/ByCourseView";
import AnalysisView from "./views/AnalysisView";
import type { ViewKey, CourseSort } from "./shared";

export default function PlayerDetail({ fedId, selected, onMetaLoaded }: { fedId: string; selected: { fed: string } & Player; onMetaLoaded?: (meta: PlayerPageData["META"]) => void }) {
  const { data: rawData, loading, error } = usePlayerData(fedId);
  const { simCourses } = useAppContext();
  // Ligar dados JOGADOS ao tee do campo quando a ronda não os traz (típico de
  // torneios internacionais — a FPG tem o score mas não as jardas, e o SI vem
  // sequencial/falso). Liga ao tee real do campo em simCourses e preenche:
  //   • meters (distância)   • si (stroke index) no scorecard (data.HOLES)
  // Clona só o que é afectado. ⚠ `meters` vem às vezes "" ou 0 (não null).
  const data = useMemo(() => {
    if (!rawData?.DATA) return rawData;
    let any = false;
    let HOLES = rawData.HOLES;
    let holesCloned = false;
    const DATA = rawData.DATA.map((c) => {
      const rounds = c.rounds.map((r) => {
        const tee = resolvePlayedTee(c.course, r.tee ?? null, simCourses, fedId);
        let nr = r;
        // distância
        if (!r.meters && tee?.distances) {
          const d = tee.distances;
          const m = (r.holeCount === 9 && d.holesCount === 18 && d.front9) ? d.front9 : d.total;
          if (m != null) { nr = { ...nr, meters: m }; any = true; }
        }
        // SI no scorecard (data.HOLES[scoreId].si) — só 18 buracos. Usa o SI de
        // REFERÊNCIA do campo (igual ao da CamposPage), não o do tee específico.
        const sid = String(r.scoreId);
        const hd = HOLES?.[sid];
        if (hd && isFakeSI(hd.si)) {
          const courseSI = r.holeCount === 18 ? resolvePlayedSI(c.course, simCourses) : null;
          const real = courseSI && courseSI.length === (hd.si?.length ?? 18) ? courseSI : null;
          const hasFakeNumbers = (hd.si ?? []).some((v) => v != null && v > 0);
          // SI sequencial nunca é real → substituir pelo SI do campo, ou OCULTAR
          // (tudo null) se não houver fonte. Não tocar se já está vazio.
          if (real || hasFakeNumbers) {
            if (!holesCloned) { HOLES = { ...rawData.HOLES }; holesCloned = true; }
            HOLES[sid] = { ...hd, si: real ?? (hd.si ?? []).map(() => null) };
            any = true;
          }
        }
        return nr;
      });
      return { ...c, rounds };
    });
    return any ? { ...rawData, DATA, HOLES } : rawData;
  }, [rawData, simCourses, fedId]);
  const [searchParams, setSearchParams] = useSearchParams();
  // Toggle: ver este jogador como se fosse só um federado (sem análise rica).
  // Persiste no URL via ?view=federado para sobreviver a refresh / share.
  const federadoView = searchParams.get("view") === "federado";
  const setFederadoView = (on: boolean) => {
    setSearchParams(prev => {
      const n = new URLSearchParams(prev);
      if (on) n.set("view", "federado");
      else n.set("view", "by_date");
      return n;
    }, { replace: true });
  };
  // Federado real do FPG (carregado lazy quando se entra na vista federado) —
  // permite mostrar foto, country_prefix, dados de cadastro reais, etc.
  const [realFederado, setRealFederado] = useState<FederadoRaw | null>(null);
  // Reset quando muda de jogador
  useEffect(() => { setRealFederado(null); }, [fedId]);
  // Quando se activa a vista federado, procurar o federado real em federados.json
  useEffect(() => {
    if (!federadoView) return;
    let cancelled = false;
    loadFederados()
      .then(file => {
        if (cancelled) return;
        const found = file.players.find(p => String(p.federation_code) === String(fedId));
        if (found) setRealFederado(found);
      })
      .catch(() => { /* ignorar — synthetic ainda funciona */ });
    return () => { cancelled = true; };
  }, [federadoView, fedId]);

  // ── Pitch & Putt (mundo paralelo: scoring.fpg.pt/listspp) ──
  // Cruza por fed com federados-pp.json (se existir). `pp` alimenta o pill de
  // HCP P&P + actividade; `ppView` abre a vista de histórico P&P (descarregado).
  const [pp, setPp] = useState<FederadoPP | null>(null);
  // ppView no URL (?view=pp) — persiste em refresh/share e muda o URL, como o
  // federadoView. As duas são "vistas especiais" fora do ViewKey normal.
  const ppView = searchParams.get("view") === "pp";
  const setPpView = (on: boolean) => {
    setSearchParams(prev => {
      const n = new URLSearchParams(prev);
      if (on) n.set("view", "pp"); else n.set("view", "by_date");
      return n;
    }, { replace: true });
  };
  useEffect(() => {
    setPp(null);
    let cancelled = false;
    loadFederadosPP().then(() => { if (!cancelled) setPp(ppForFed(fedId)); }).catch(() => { /* sem P&P → sem pill */ });
    return () => { cancelled = true; };
  }, [fedId]);

  const VALID_VIEWS: ViewKey[] = ["by_course", "by_course_analysis", "by_date", "by_tournament", "analysis"];
  const paramView = searchParams.get("view") as ViewKey | null;

  const [view, setViewState] = useState<ViewKey>(
    paramView && VALID_VIEWS.includes(paramView) ? paramView : "by_date"
  );
  const setView = (v: ViewKey) => {
    setViewState(v);
    setSearchParams(prev => { const n = new URLSearchParams(prev); n.set("view", v); return n; }, { replace: true });
  };

  const [courseSearch, setCourseSearch] = useState("");
  const [courseSort, setCourseSort] = useState<CourseSort>("last_desc");

  // Reset search + view quando muda de jogador; notify parent when player data loads
  useEffect(() => {
    setCourseSearch("");
    const pv = searchParams.get("view") as string | null;
    // "federado" e "pp" são vistas válidas (não-ViewKey) — ignorar aqui, são
    // tratadas por early-returns próprios (federadoView / ppView).
    if (pv === "federado" || pv === "pp") {
      if (data?.META) onMetaLoaded?.(data.META);
      return;
    }
    const resolved: ViewKey = pv && VALID_VIEWS.includes(pv as ViewKey) ? (pv as ViewKey) : "by_date";
    setViewState(resolved);
    // Garantir que o URL reflecte a vista activa (mesmo sem parâmetro explícito)
    if (!pv) setSearchParams(prev => { const n = new URLSearchParams(prev); n.set("view", "by_date"); return n; }, { replace: true });
    if (data?.META) onMetaLoaded?.(data.META);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  // Stats (safe even when data is null) — "campos"/"voltas" agora vêm dos KPI.
  const curYear = String(new Date().getFullYear());
  const roundsThisYear = useMemo(() => {
    if (!data) return 0;
    let n = 0;
    data.DATA.forEach(c => c.rounds.forEach(r => {
      if (r.date && r.date.slice(-4) === curYear) n++;
    }));
    return n;
  }, [data, curYear]);

  // Holes-in-one: gross 1 em buraco par 3/4 (par conhecido), sobre todas as rondas.
  const aces = useMemo(() => {
    if (!data) return [];
    // Lookup scoreId → {course, date} a partir de DATA para o tooltip.
    const info = new Map<string, { course: string; date: string }>();
    for (const c of data.DATA) for (const r of c.rounds) info.set(String(r.scoreId), { course: c.course, date: r.date });
    return acesFromHoleScores(data.HOLES).map(a => ({ ...a, ...info.get(a.scoreId) }));
  }, [data]);

  // Current HCP = post-round value from HCP_INFO (not pre-round r.hi)
  const latestHcp = data?.HCP_INFO?.current != null ? Number(data.HCP_INFO.current) : null;
  const meta = data?.META;

  /* Bucket do dropdown consolidado (3 opções): as vistas legadas mapeiam para
     o seu bucket — by_tournament → Rondas, by_course_analysis → Campos. */
  const viewBucket: "by_date" | "by_course" | "analysis" =
    view === "by_tournament" ? "by_date"
    : view === "by_course_analysis" ? "by_course"
    : view;

  // Vista "como federado": renderiza FederadoOnlyDetail com um _federadoRaw
  // sintético (Nossos não têm um real). Útil para ver a ficha base FPG +
  // rondas WHS live em tempo real, sem o overlay rico de análise.
  if (federadoView) {
    // Preferência: federado real do FPG (com foto, country, etc.) > _federadoRaw já anexado > synthetic
    const fedSrc = realFederado || (selected as unknown as MergedPlayer)._federadoRaw || syntheticFederadoFromPlayer(selected);
    const fakePlayer = { ...selected, _source: "both" as const, _federadoRaw: fedSrc } as MergedPlayer & { fed: string };
    return (
      <div className="pa-page">
        <div style={{ padding: "8px 12px", display: "flex", gap: 8, alignItems: "center", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
          <button className="p p-outline" style={{ cursor: "pointer" }}
            onClick={() => setFederadoView(false)}
            title="Voltar à vista completa com análise">
            ← Vista completa
          </button>
          <span className="muted fs-12">Vista de federado (cadastro FPG + rondas WHS live, sem análise nossa)</span>
        </div>
        {/* pa-content dá scroll vertical (.pa-page tem overflow:hidden) */}
        <div className="pa-content" style={{ padding: 0 }}>
          <FederadoOnlyDetail player={fakePlayer} />
        </div>
      </div>
    );
  }

  // Vista de histórico Pitch & Putt (mundo paralelo). Mesmo padrão da vista
  // federado: barra de voltar + conteúdo scrollável.
  if (ppView) {
    return (
      <div className="pa-page">
        <div style={{ padding: "8px 12px", display: "flex", gap: 8, alignItems: "center", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
          <button className="p p-outline" style={{ cursor: "pointer" }} onClick={() => setPpView(false)} title="Voltar à vista completa">
            ← Vista completa
          </button>
          <span className="muted fs-12">Histórico Pitch &amp; Putt (cartões P&amp;P, par-3 × 18)</span>
        </div>
        <div className="pa-content" style={{ padding: 0 }}>
          <PPHistoryView fed={selected.fed} name={selected.name} />
        </div>
      </div>
    );
  }

  return (
    <div className="pa-page">
      {/* Header: name + controls on same row, pills below */}
      <div className="detail-header">
        <div className="dh-top">
          {(selected as unknown as MergedPlayer)._federadoRaw?.photo && (
            <img className="dh-photo"
              src={`https://hcp-portugal.datagolf.pt/photos/${(selected as unknown as MergedPlayer)._federadoRaw!.photo}`}
              alt=""
              onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
          )}
          <div className="dh-idblock">
            <div className="dh-nameline">
              <h2 className="detail-title">{selected.name}</h2>
              <button className="dh-mode-btn" onClick={() => setFederadoView(true)}
                title="Ver como federado: cadastro FPG + rondas WHS live (sem análise nossa)">👤 Vista federado</button>
              {pp && (
                <button className="dh-mode-btn" onClick={() => setPpView(true)}
                  title="Ver histórico Pitch & Putt (cartões P&P descarregados)">🏑 P&amp;P</button>
              )}
              {/* Links externos como pill-links (padrão DrivePage) — a antiga
                  coluna de ícones 🔗 flutuava solta à esquerda do nome. */}
              <PlayerExtLinks fed={selected.fed} />
            </div>
            <div className="dh-statline">
            {/* Identidade partilhada com o FederadoOnlyDetail (IdentityPills);
                pills específicos deste mundo (P&P, tags, aces) via children.
                HCP, campos, voltas e rondas do ano saíram dos pills — são KPI. */}
            <IdentityPills
              fed={selected.fed}
              sex={selected.sex}
              dob={selected.dob}
              escalao={selected.escalao ? (meta?.escalao || selected.escalao) : null}
              club={meta?.club || clubLong(selected) || null}
              countryPrefix={(selected as unknown as MergedPlayer)._federadoRaw?.country_prefix}
              country={(selected as unknown as MergedPlayer)._federadoRaw?.country}
            >
              {pp && hasRealPPHcp(pp) && (
                <span
                  className="p"
                  onClick={() => setPpView(true)}
                  title={`Handicap Pitch & Putt: ${pp.hcp} (${pp.hcpStatus}). Clica para ver histórico P&P.`}
                  style={{ cursor: "pointer", background: "var(--badge-pp)", color: "#fff", border: "1px solid var(--badge-pp)" }}
                >🏑 P&amp;P {pp.hcp}</span>
              )}
              {selected.tags?.filter(t => t !== "no-priority").map(t => (
                <span key={t} className="p p-outline">{t}</span>
              ))}
              {pp && (pp.roundsYear || 0) > 0 && (
                <span className="p p-outline" title={`Cartões P&P em ${curYear} (actividade no mundo Pitch & Putt)`}>
                  P&amp;P: {pp.roundsYear} em {curYear}
                </span>
              )}
              {aces.length > 0 && (
                <span
                  className="p"
                  style={{ background: "var(--score-eagle)", color: "#fff", border: "1px solid var(--score-eagle)" }}
                  title={aces
                    .map(a => `Buraco ${a.hole} (par ${a.par})${a.course ? ` · ${a.course}` : ""}${a.date ? ` · ${a.date}` : ""}`)
                    .join("\n")}
                >
                  🕳️ {aces.length} hole-in-one
                </span>
              )}
            </IdentityPills>
            {data && <PlayerKpiStrip data={data} currentHcp={latestHcp} roundsThisYear={roundsThisYear} />}
            </div>
          </div>
          <div className="dh-right">
            {data && (
              <div className="pa-controls-left">
                <input className="input" placeholder="Pesquisar campo…" value={courseSearch}
                  onChange={e => setCourseSearch(e.target.value)} />
                {/* Consolidação 5→3 (2026-08-15): Rondas funde "Por data" +
                    "Por torneio" (agrupamento no segmented ao lado); Campos
                    absorve a "Análise por campo" (o detalhe expandido mostra
                    sempre a análise rica). Deep-links legados (?view=
                    by_tournament / by_course_analysis) continuam válidos. */}
                <select className="select" value={viewBucket}
                  onChange={e => setView(e.target.value as ViewKey)}>
                  <option value="by_date">🗓 Rondas</option>
                  <option value="by_course">⛳ Campos</option>
                  <option value="analysis">📊 Análises</option>
                </select>
                {viewBucket === "by_date" && (
                  <div className="segmented-toggle" role="tablist" aria-label="Agrupamento das rondas">
                    <button role="tab" aria-selected={view !== "by_tournament"}
                      className={`seg-btn ${view !== "by_tournament" ? "active" : ""}`}
                      onClick={() => setView("by_date")}
                      title="Todas as rondas por ordem cronológica">
                      <span className="seg-label">Data</span>
                    </button>
                    <button role="tab" aria-selected={view === "by_tournament"}
                      className={`seg-btn ${view === "by_tournament" ? "active" : ""}`}
                      onClick={() => setView("by_tournament")}
                      title="Rondas agrupadas por torneio (multi-ronda junto)">
                      <span className="seg-label">Torneio</span>
                    </button>
                  </div>
                )}
                {viewBucket === "by_course" && (
                  <select className="select" value={courseSort}
                    onChange={e => setCourseSort(e.target.value as CourseSort)}>
                    <option value="last_desc">Mais recente</option>
                    <option value="count_desc">Mais jogados</option>
                    <option value="name_asc">Nome A–Z</option>
                  </select>
                )}
              </div>
            )}
            {meta?.lastUpdate && <span className="dh-lastupd" title="Última actualização dos dados">act. {meta.lastUpdate}</span>}
          </div>
        </div>
      </div>

      {loading ? (
        <LoadingState size="sm" message="A carregar análise…" />
      ) : error || !data ? (
        <div className="player-embed-error">Não foi possível carregar: {error}</div>
      ) : (
        <>
          {/* View content — Campos é sempre a versão rica (a antiga "Análise
              por campo"); o deep-link legado by_course_analysis cai aqui. */}
          <div className="pa-content">
            {viewBucket === "by_course" && (
              <ByCourseView data={data} search={courseSearch} sort={courseSort} />
            )}
            {view === "by_date" && (
              <ByDateView data={data} search={courseSearch} />
            )}
            {view === "by_tournament" && (
              <ByTournamentView data={data} search={courseSearch} />
            )}
            {view === "analysis" && (
              <AnalysisView data={data} />
            )}
          </div>
        </>
      )}
    </div>
  );
}
