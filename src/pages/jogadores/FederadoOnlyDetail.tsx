/**
 * src/pages/jogadores/FederadoOnlyDetail.tsx
 *
 * Ficha de jogador "só cadastro" — para federados sem análise local
 * (federados.json) e para a vista "ver como federado" dos Nossos.
 * Cadastro FPG completo + KPIs de actividade + rondas WHS live via
 * /api/datagolf, com modal de scorecard hole-by-hole.
 */
import { useEffect, useState, type ReactNode } from "react";
import type { MergedPlayer } from "../../data/federadosLoader";
import { getPlayerHistory, getScorecard, type WhsRound, type Scorecard } from "../../data/datagolfClient";
import { FILE_PLAYER_DATA } from "../../data/dataRegistry";
import { cachedFetchJson } from "../../data/fetchCache";
import { gf } from "../../utils/flagUtils";
import { canonicalCourseName } from "../../utils/courseAliases";
import EmptyState from "../../ui/EmptyState";
import DetailHeader from "../../ui/DetailHeader";
import UiKpiCard from "../../ui/KpiCard";
import RotatedNotice from "../../ui/RotatedNotice";
import AroeiraNotice from "../../ui/AroeiraNotice";
import { ScorecardTable } from "../../ui/ScorecardTable";
import FederadoRoundsTable, { type RoundExtra } from "./FederadoRoundsTable";
import {
  FEDERADO_SECTIONS, FEDERADO_TECHNICAL_FIELDS,
  FEDERADO_FIELD_LABELS, FEDERADO_FIELD_DESCRIPTIONS,
  formatFedValue, KV, normalizeAgeLabel,
} from "./federadoFields";
import IdentityPills, { PlayerExtLinks } from "./IdentityPills";

/** Máximo de scorecards a enriquecer no batch (tee/gross) = tecto de linhas
 *  renderizadas pela FederadoRoundsTable. Sem tecto, um federado veterano com
 *  400+ rondas WHS disparava 400+ POSTs ao /api/datagolf para linhas nunca
 *  renderizadas. */
const SCORECARD_BATCH_MAX = 200;

export default function FederadoOnlyDetail({ player }: { player: MergedPlayer & { fed: string } }) {
  // ⚠ Hooks SEMPRE antes de qualquer return — `f` pode em teoria faltar
  // (o early-return de EmptyState vive depois dos hooks, com guards `fedCode`
  // dentro dos efeitos), senão a ordem de hooks mudava entre renders.
  const f = player._federadoRaw ?? null;
  const fedCode = f?.federation_code ?? "";
  const showFlag = f && f.country_prefix && f.country_prefix !== "PT" && !f.country_prefix.startsWith("@");

  /* ── Rondas em tempo real via /api/datagolf ── */
  const [liveRounds, setLiveRounds] = useState<WhsRound[] | null>(null);
  const [loadingLive, setLoadingLive] = useState(false);
  const [liveError, setLiveError] = useState<string | null>(null);

  /* ── Modal de scorecard detalhado ── */
  const [scorecardModal, setScorecardModal] = useState<{ round: WhsRound; data: Scorecard | null; loading: boolean; error: string | null } | null>(null);

  const openScorecard = async (round: WhsRound) => {
    setScorecardModal({ round, data: null, loading: true, error: null });
    try {
      const arr = await getScorecard(round.id, round.scoring_type_id ?? 1, round.competition_type_id ?? 10);
      const data = Array.isArray(arr) ? arr[0] : arr;
      setScorecardModal(prev => prev && prev.round.id === round.id ? { ...prev, data: data || null, loading: false } : prev);
    } catch (e) {
      const msg = String((e as Error)?.message || e);
      setScorecardModal(prev => prev && prev.round.id === round.id ? { ...prev, loading: false, error: msg } : prev);
    }
  };

  /* ── Enriquecimento: tee/gross por ronda (batch-fetch de scorecards) ── */
  const [extraMap, setExtraMap] = useState<Map<number, RoundExtra>>(new Map());

  /* ── Comparação com dados locais (scoreIds que já temos em ficheiro) ── */
  const [localIds, setLocalIds] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (!fedCode) return;
    let cancelled = false;
    setLoadingLive(true);
    setLiveError(null);
    setLiveRounds(null);
    setExtraMap(new Map());
    getPlayerHistory(fedCode)
      .then(rounds => { if (!cancelled) setLiveRounds(rounds); })
      .catch(err => { if (!cancelled) setLiveError(String(err?.message || err)); })
      .finally(() => { if (!cancelled) setLoadingLive(false); });
    return () => { cancelled = true; };
  }, [fedCode]);

  /* Batch-fetch scorecards para extrair tee + gross (concurrency ~3) */
  useEffect(() => {
    if (!liveRounds || liveRounds.length === 0) return;
    let cancelled = false;
    const map = new Map<number, RoundExtra>();
    const queue = liveRounds.slice(0, SCORECARD_BATCH_MAX);
    let running = 0;
    const CONC = 3;

    function flush() {
      if (cancelled) return;
      setExtraMap(new Map(map));
    }
    async function next(): Promise<void> {
      while (queue.length > 0 && !cancelled) {
        const r = queue.shift()!;
        running++;
        try {
          const arr = await getScorecard(r.id, r.scoring_type_id ?? 1, r.competition_type_id ?? 10);
          const sc = Array.isArray(arr) ? arr[0] : arr;
          if (sc && !cancelled) {
            map.set(r.id, {
              tee: sc.tee_name || "",
              gross: typeof sc.gross_total === "number" ? sc.gross_total : null,
              cr: typeof sc.course_rating === "number" ? sc.course_rating : null,
              slope: typeof sc.slope === "number" ? sc.slope : null,
            });
            // Flush progressively every 5 scorecards
            if (map.size % 5 === 0) flush();
          }
        } catch { /* silently skip failed scorecards */ }
        running--;
      }
      if (running === 0) flush();
    }
    // Launch CONC parallel workers
    for (let i = 0; i < CONC; i++) next();
    return () => { cancelled = true; };
  }, [liveRounds]);

  /* Load local data scoreIds for comparison */
  useEffect(() => {
    let cancelled = false;
    setLocalIds(new Set());
    const fed = fedCode;
    if (!fed) return;
    (async () => {
      try {
        // cachedFetchJson: partilha cache com o resto da app (a "vista
        // federado" de um Nosso já descarregou este data.json) e devolve
        // null em 404 (federado sem análise local — o caso normal aqui).
        const json = await cachedFetchJson<{ HOLES?: Record<string, unknown> }>(FILE_PLAYER_DATA(fed));
        if (!json) return;
        // HOLES keys are scoreId strings; DATA[].rounds[].scoreId too
        const ids = new Set<number>();
        if (json.HOLES) {
          for (const k of Object.keys(json.HOLES)) {
            const n = Number(k);
            if (isFinite(n)) ids.add(n);
          }
        }
        if (!cancelled && ids.size > 0) setLocalIds(ids);
      } catch { /* no local data available — OK */ }
    })();
    return () => { cancelled = true; };
  }, [fedCode]);

  if (!f) return <EmptyState message="Sem dados disponíveis" />;

  return (
    <div className="p-16">
      {/* Header com foto grande ao lado */}
      <div style={{ display: "flex", gap: 16, alignItems: "flex-start", marginBottom: 12 }}>
        {f.photo && (
          <img src={`https://hcp-portugal.datagolf.pt/photos/${f.photo}`}
            alt={f.name}
            style={{ width: 200, maxHeight: 260, borderRadius: 6, objectFit: "cover", flexShrink: 0 }}
            onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <DetailHeader
            title={
              <>
                {showFlag && <span className="mr-8">{gf(f.country_prefix)}</span>}
                {f.name}
              </>
            }
            sub={<span className="muted">#{f.federation_code} · Só cadastro FPG (sem scorecards detalhados)</span>}
          >
            {/* Pill-links externos POR BAIXO do nome — mesma linha de botões
                do PlayerDetail (dh-btnline). */}
            <div className="dh-btnline" style={{ marginTop: 6 }}>
              <PlayerExtLinks fed={f.federation_code} />
            </div>
            {/* Linha de identidade partilhada com o PlayerDetail — os 2 mundos
                do detalhe abrem com os mesmos pills. */}
            <div style={{ marginTop: 6 }}>
              <IdentityPills
                fed={f.federation_code}
                sex={f.gender}
                dob={f.birthdate}
                escalao={f.age_level ? normalizeAgeLabel(f.age_level) : null}
                club={f.acronym || f.club_name || null}
                countryPrefix={f.country_prefix}
                country={f.country}
              />
            </div>
          </DetailHeader>
        </div>
      </div>
      {(() => {
        const fRec = f as Record<string, unknown>;
        const fKeys = new Set(Object.keys(fRec));
        // Campos já cobertos pelas secções + bloco técnico
        const covered = new Set<string>([
          ...FEDERADO_SECTIONS.flatMap(s => s.fields),
          ...FEDERADO_TECHNICAL_FIELDS,
        ]);
        // Campos "soltos" — apareceram no JSON mas não estão mapeados em nenhum lado
        const extraFields = Object.keys(fRec).filter(k => !covered.has(k));
        const visibleCount =
          FEDERADO_SECTIONS.reduce((n, s) => n + s.fields.filter(k => fKeys.has(k)).length, 0) +
          extraFields.length;
        const technicalCount = FEDERADO_TECHNICAL_FIELDS.filter(k => fKeys.has(k)).length;

        // Detecta divergência entre HCP Exacto e HCP Index (raro mas possível)
        const hcpExact = fRec.hcp_exact;
        const hcpIndex = fRec.hcp_index;
        const hcpDiverges =
          hcpExact != null && hcpIndex != null &&
          typeof hcpExact === "number" && typeof hcpIndex === "number" &&
          Math.abs(hcpExact - hcpIndex) > 0.05;

        const renderKV = (k: string) => {
          const label = FEDERADO_FIELD_LABELS[k] || k;
          const raw = fRec[k];
          let value = formatFedValue(k, raw);
          // Aviso inline quando hcp_exact e hcp_index divergem
          if (k === "hcp_index" && hcpDiverges) {
            value = (
              <>
                {value}
                <span
                  className="p p-sm"
                  title={`Divergência: HCP Exacto=${hcpExact}, HCP Index=${hcpIndex}. Normalmente são iguais — investigar.`}
                  style={{ background: "var(--color-warn)", color: "#fff", borderColor: "transparent" }}
                >⚠ ≠ exacto</span>
              </>
            );
          }
          return <KV key={k} label={label} value={value} description={FEDERADO_FIELD_DESCRIPTIONS[k]} />;
        };

        return (
          <div className="card" style={{ marginTop: 12 }}>
            <div className="h-md fs-14 mb-8" style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span>Cadastro FPG</span>
              <span className="muted fs-10" style={{ fontWeight: 400 }}>
                {visibleCount} campos visíveis{technicalCount > 0 ? ` · ${technicalCount} técnicos ocultos` : ""}
              </span>
            </div>

            {/* Secções principais */}
            {FEDERADO_SECTIONS.map(sec => {
              const keys = sec.fields.filter(k => fKeys.has(k));
              if (keys.length === 0) return null;
              return (
                <div key={sec.title} style={{ marginBottom: 14 }}>
                  <div
                    className="muted"
                    style={{
                      fontSize: "var(--fs-11)", fontWeight: 700, letterSpacing: "0.05em",
                      textTransform: "uppercase", marginBottom: 6,
                      borderBottom: "1px solid var(--border)", paddingBottom: 3,
                    }}
                  >{sec.title}</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "7px 30px" }}>
                    {keys.map(renderKV)}
                  </div>
                </div>
              );
            })}

            {/* Campos extra não mapeados (caso futuro em que o JSON ganhe campos novos) */}
            {extraFields.length > 0 && (
              <div style={{ marginBottom: 14 }}>
                <div
                  className="muted"
                  style={{
                    fontSize: "var(--fs-11)", fontWeight: 700, letterSpacing: "0.05em",
                    textTransform: "uppercase", marginBottom: 6,
                    borderBottom: "1px solid var(--border)", paddingBottom: 3,
                  }}
                >Outros</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "7px 30px" }}>
                  {extraFields.map(renderKV)}
                </div>
              </div>
            )}

            {/* Campos técnicos — colapsados por defeito */}
            {technicalCount > 0 && (
              <details style={{ marginTop: 8, borderTop: "1px solid var(--border)", paddingTop: 8 }}>
                <summary
                  className="muted"
                  style={{
                    cursor: "pointer", fontSize: "var(--fs-11)", fontWeight: 600,
                    letterSpacing: "0.03em", userSelect: "none",
                  }}
                  title="IDs internos, tokens e campos redundantes — úteis para debug."
                >
                  ⚙ Campos técnicos ({technicalCount}) <span style={{ opacity: 0.6, fontWeight: 400 }}>— IDs, tokens e redundâncias</span>
                </summary>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "7px 30px", marginTop: 8 }}>
                  {FEDERADO_TECHNICAL_FIELDS.filter(k => fKeys.has(k)).map(renderKV)}
                </div>
              </details>
            )}
          </div>
        );
      })()}
      {/* KPIs de actividade — calculados a partir das rondas WHS */}
      {liveRounds && liveRounds.length > 0 && (() => {
        const now = new Date();
        const currentYear = now.getFullYear();
        const prevYear = currentYear - 1;
        const year = (r: WhsRound) => {
          const d = (r.score_dateStr || "").slice(0, 4);
          const y = parseInt(d, 10);
          return isFinite(y) ? y : null;
        };
        const inYear = (y: number) => liveRounds.filter(r => year(r) === y);
        const thisYearRounds = inYear(currentYear);
        const prevYearRounds = inYear(prevYear);
        const last90Days = liveRounds.filter(r => {
          const d = new Date((r.score_dateStr || "").slice(0, 10));
          if (!isFinite(d.getTime())) return false;
          return (now.getTime() - d.getTime()) / 86400000 <= 90;
        });
        const sds = liveRounds.filter(r => r.score_differential != null).map(r => Number(r.score_differential)).filter(n => isFinite(n));
        const bestSD = sds.length ? Math.min(...sds) : null;
        const avgSD = sds.length ? sds.reduce((a, b) => a + b, 0) / sds.length : null;
        const tornRounds = liveRounds.filter(r => /torn/i.test(String(r.score_origin || "")));
        const lastDate = liveRounds[0]?.score_dateStr?.slice(0, 10) || null;
        const kpi = (label: string, value: ReactNode, sub?: string) => (
          <UiKpiCard label={label} value={value} sub={sub} />
        );
        return (
          <div className="card" style={{ marginTop: 12 }}>
            <div className="h-md fs-14 mb-8">Actividade</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 8 }}>
              {kpi(`Rondas ${currentYear}`, thisYearRounds.length, prevYearRounds.length > 0 ? `vs ${prevYearRounds.length} em ${prevYear}` : undefined)}
              {kpi(`Rondas ${prevYear}`, prevYearRounds.length)}
              {kpi("Últimos 90 dias", last90Days.length)}
              {kpi("Torneios", tornRounds.length, `${liveRounds.length} total`)}
              {kpi("Melhor SD", bestSD != null ? bestSD.toFixed(1) : "—")}
              {kpi("Média SD", avgSD != null ? avgSD.toFixed(1) : "—")}
              {lastDate && kpi("Última ronda", lastDate)}
            </div>
          </div>
        );
      })()}

      {/* Rondas em tempo real via /api/datagolf */}
      <div className="card" style={{ marginTop: 12 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <div className="h-md fs-14">Rondas WHS
            {liveRounds && <span className="muted fs-10 ml-8">({liveRounds.length} rondas · via scoring.datagolf.pt)</span>}
          </div>
          {loadingLive && <span className="muted fs-10">⏳ A carregar…</span>}
          {liveError && (
            <div className="fs-10" style={{ color: "var(--color-warn-vivid)", textAlign: "right", maxWidth: "70%" }}>
              <div style={{ fontWeight: 600 }}>⚠ Não foi possível carregar rondas em tempo real</div>
              <details style={{ marginTop: 4, opacity: 0.85 }}>
                <summary style={{ cursor: "pointer" }}>Ver detalhes do erro</summary>
                <pre style={{ whiteSpace: "pre-wrap", fontSize: "var(--fs-10)", marginTop: 4, textAlign: "left" }}>{liveError}</pre>
              </details>
            </div>
          )}
        </div>
        {liveError && !loadingLive && !liveRounds && (
          <div className="muted fs-11" style={{ padding: "8px 0" }}>
            Dados de cadastro acima. As rondas WHS podem ser consultadas diretamente no site da FPG.
          </div>
        )}
        {liveRounds && liveRounds.length > 0 && <FederadoRoundsTable rounds={liveRounds} hcpRef={player.hcp} onOpenScorecard={openScorecard} extraMap={extraMap} localIds={localIds} />}
        {liveRounds && liveRounds.length === 0 && (
          <div className="muted fs-10 ta-c">Sem rondas registadas no WHS</div>
        )}
      </div>

      {/* Modal de scorecard detalhado */}
      {scorecardModal && (
        <div
          onClick={() => setScorecardModal(null)}
          style={{ position: "fixed", inset: 0, background: "var(--overlay-black-50)", zIndex: "var(--z-overlay)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ background: "var(--bg-card)", borderRadius: "var(--radius-lg)", padding: 20, maxWidth: 900, width: "100%", maxHeight: "90vh", overflowY: "auto", boxShadow: "0 10px 40px var(--overlay-black-30)" }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
              <div>
                <div className="h-md fs-14 fw-700">{scorecardModal.round.tournament_description || "Scorecard"}</div>
                <div className="muted fs-11">{scorecardModal.round.course_description} · {(scorecardModal.round.score_dateStr || "").slice(0, 10)}</div>
              </div>
              <button
                onClick={() => setScorecardModal(null)}
                style={{ border: "none", background: "transparent", fontSize: "var(--fs-20)", cursor: "pointer", padding: 4 }}
                title="Fechar"
              >✕</button>
            </div>
            {/* Nota se a ronda foi rotacionada (Aroeira No.2 config antiga) */}
            <RotatedNotice rotated={(scorecardModal.data as { _rotated?: number } | null)?._rotated} />
            {/* Nota geral para campos Aroeira (mesmo se esta ronda específica não foi rotacionada) */}
            <AroeiraNotice
              courseName={canonicalCourseName(scorecardModal.round.course_description || "") || ""}
              rotatedCount={(scorecardModal.data as { _rotated?: number } | null)?._rotated ? 1 : 0}
              totalRounds={1}
            />

            {scorecardModal.loading && <div className="muted p-16 ta-c">⏳ A carregar scorecard…</div>}
            {scorecardModal.error && (
              <div className="p-16" style={{ color: "var(--color-warn-vivid)" }}>
                ⚠ Erro a carregar: <code>{scorecardModal.error}</code>
              </div>
            )}
            {scorecardModal.data && (() => {
              const sc = scorecardModal.data as unknown as Record<string, number | string | null | undefined>;
              const nh = Number(sc.nholes || sc.hole_count || 18);
              const gross = (h: number) => { const v = sc[`gross_${h}`]; return v != null ? Number(v) : 0; };
              const pars  = (h: number) => { const v = sc[`par_${h}`];   return v != null ? Number(v) : 0; };
              const sis   = (h: number) => { const v = sc[`stroke_index_${h}`]; return v != null ? Number(v) : 0; };
              return (
                <>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 8, marginBottom: 16, fontSize: "var(--fs-12)" }}>
                    <div><span className="muted">Par total:</span> <b>{sc.par_total ?? "—"}</b></div>
                    <div><span className="muted">Gross:</span> <b>{sc.gross_total ?? "—"}</b></div>
                    <div><span className="muted">Stableford:</span> <b>{(sc as Record<string, number | undefined>).stableford ?? (sc as Record<string, number | undefined>).calculated_stablnet_total ?? "—"}</b></div>
                    <div><span className="muted">Tees:</span> <b>{sc.tee_name || "—"}</b></div>
                    <div><span className="muted">CR/Slope:</span> <b>{sc.course_rating ?? "—"}/{sc.slope ?? "—"}</b></div>
                    <div><span className="muted">CBA:</span> <b>{(sc as Record<string, number | undefined>).cba ?? (sc as Record<string, number | undefined>).cba_value ?? "—"}</b></div>
                  </div>
                  <ScorecardTable
                    bare
                    holes={{
                      g: Array.from({ length: nh }, (_, i) => gross(i + 1)),
                      p: Array.from({ length: nh }, (_, i) => pars(i + 1)),
                      si: Array.from({ length: nh }, (_, i) => sis(i + 1)),
                      m: Array.from({ length: nh }, (_, i) => { const v = sc[`meters_${i + 1}`]; return v != null ? Number(v) : null; }),
                      hc: nh,
                    }}
                    courseName={scorecardModal.round.course_description || ""}
                    date={(scorecardModal.round.score_dateStr || "").slice(0, 10).split("-").reverse().join("-")}
                    tee={String(sc.tee_name ?? "")}
                  />
                </>
              );
            })()}
          </div>
        </div>
      )}

      <div className="muted fs-10 p-8 ta-c" style={{ marginTop: 8 }}>
        Para análise completa (scorecards hole-by-hole + estatísticas), este jogador pode ser
        adicionado ao pipeline (<code>node scripts/golf-all.js {f.federation_code}</code>).
      </div>
    </div>
  );
}
