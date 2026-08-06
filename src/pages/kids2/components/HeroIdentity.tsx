/**
 * kids2/components/HeroIdentity.tsx
 *
 * Hero da ficha — bandeira grande + nome em destaque + variantes + tier badge
 * + clube principal + cards cross-federação + escalões equivalentes + HCP.
 *
 * Sem qualquer indicador de sexo (sem SexBadge, sem Unicode ♂/♀).
 */

import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { CanonicalData, Junior, Tournament, RankingEntry } from "../data";
import { computeTier, computeRanking, getTierLabel, getTierColors, hasRealConfrontWithManuel } from "../data";
import { computeDobInfo, escalaoIntl, type DobInfo } from "../dobInfo";
import { getTournWeight } from "../tournWeight";
import { flag as flagOf } from "../../../utils/flagUtils";
import { MANUEL_DOB } from "../../../constants/manuel";
import { cachedFetchJson } from "../../../data/fetchCache";
import HcpSparkline from "./HcpSparkline";

/** Bandeira por federação — mostrada junto ao número de licença. */
const SOURCE_FLAGS: Record<string, string> = {
  USKIDS: flagOf("United States"),
  FPG: flagOf("Portugal"),
  RFEG: flagOf("Spain"),
  FFG: flagOf("France"),
  México: flagOf("Mexico"),
  EGR: "🇪🇺",
};

/* ── EGR (European Golf Rankings) — card com Avg-to-CR + posição ──────────
 * Lookup lazy de egr-rank-slim.json (gerado por build-egr-rank-slim.js a
 * partir do ranking EGR): [id, sexo, rankSex, pontos, avgToCR, avgScore,
 * eventos, birthYear]. Match por nome normalizado (tokens ordenados — a MESMA
 * normalização do builder) + ISO do país; fallback nome-só quando único. */
type EgrSlimEntry = [string, string | null, number | null, number | null, number | null, number | null, number | null, number | null];
interface EgrSlimFile { players: Record<string, EgrSlimEntry>; byName: Record<string, EgrSlimEntry> }

export function egrNameKey(s: string): string {
  return String(s || "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[.,'\-]/g, " ")
    .split(/\s+/).filter(Boolean).sort().join(" ");
}

function useEgrRank(junior: Junior): EgrSlimEntry | null {
  const [db, setDb] = useState<EgrSlimFile | null>(null);
  useEffect(() => {
    cachedFetchJson<EgrSlimFile>("/data/egr-rank-slim.json").then((d) => { if (d?.players) setDb(d); }).catch(() => {});
  }, []);
  return useMemo(() => {
    if (!db) return null;
    const names = [junior.canonicalName, ...(junior.aliases || [])].filter(Boolean);
    const isos = [junior.nationality, junior.country].filter((c): c is string => !!c && c.length === 2);
    for (const n of names) {
      const nk = egrNameKey(n);
      for (const iso of isos) {
        const hit = db.players[`${nk}|${iso.toUpperCase()}`];
        if (hit) return hit;
      }
    }
    for (const n of names) {
      const hit = db.byName[egrNameKey(n)];
      if (hit) return hit;
    }
    return null;
  }, [db, junior]);
}

/** Conta TODAS as rondas válidas (com gross numérico) do junior em todas as
 *  fontes — incluindo 9H. Usado no pill global "N rondas" do hero.
 *  Diferente de computeRoundStats.total que filtra para 18H. */
function countTotalRounds(junior: Junior, tournamentById: Map<string, Tournament>): number {
  let n = 0;
  for (const tid of junior.tournamentIds) {
    const t = tournamentById.get(tid);
    if (!t) continue;
    for (const f of t.flights) {
      const r = f.results.find((x) => x.juniorId === junior.id);
      if (!r?.rounds) continue;
      for (const rd of r.rounds) {
        if (typeof rd.gross === "number") n++;
      }
    }
  }
  return n;
}

interface Props {
  data: CanonicalData;
  junior: Junior;
}

export default function HeroIdentity({ data, junior }: Props) {
  const isManuel = data.manuel?.id === junior.id;
  const country = junior.country || junior.nationality || "";
  const flagEmoji = flagOf(country);
  const egr = useEgrRank(junior);

  const variants = (junior.aliases || []).filter((a) => a && a !== junior.canonicalName);

  const escUskids = junior.sources.uskids?.ageGroupCurrent;
  const escRfeg = junior.sources.rfeg?.catEdad;
  const escFpgTag = junior.sources.fpg?.tags?.find((t) => /^(PJA|Sub-?\d+)/i.test(t));
  const escIntl = escalaoIntl(junior, data.tournamentById);

  const dobInfo = computeDobInfo(junior, data.tournamentById);
  // ageDiff só faz sentido para juniors com DOB conhecida (known/range/inferred)
  const ageDiff = !isManuel && dobInfo.dobIso ? compareAgeToManuel(dobInfo.dobIso, dobInfo.state) : null;

  // Ranking percentil — memoizado (O(n) sobre todos os juniors, só recalcula se data mudar)
  const ranking = useMemo<Map<string, RankingEntry>>(
    () => computeRanking(data.juniors, data.tournamentById),
    [data.juniors, data.tournamentById],
  );

  // Tier badge ("Elite", "Forte Competidor", etc.) só faz sentido para juniors
  // que realmente confrontaram o Manuel em mesmo escalão. Para juniors que
  // partilham só torneios em escalões diferentes (ex: Manuel B11 vs Rafael B12
  // no mesmo Venice Open), o tier seria enganador — escondemos.
  const tier = (!isManuel && hasRealConfrontWithManuel(junior, data.manuel, data.tournamentById))
    ? computeTier(junior, data.tournamentById, ranking)
    : null;

  const mainClub = junior.sources.fpg?.club || junior.sources.rfeg?.club || junior.sources.ffgolf?.club || junior.club || null;
  const mainClubSource = junior.sources.fpg?.club ? "FPG" : junior.sources.rfeg?.club ? "RFEG" : junior.sources.ffgolf?.club ? "FFG" : null;

  const hcps: { source: string; value: number | undefined; date?: string }[] = [];
  if (junior.sources.fpg?.hcpExact != null) hcps.push({ source: "FPG", value: junior.sources.fpg.hcpExact, date: junior.sources.fpg.hcpDate });
  if (junior.sources.rfeg?.hcp != null) hcps.push({ source: "RFEG", value: junior.sources.rfeg.hcp, date: junior.sources.rfeg.hcpDate });
  if (junior.sources.ffgolf?.hcp != null) hcps.push({ source: "FFG", value: junior.sources.ffgolf.hcp });

  const ajga = (junior.meta as any)?.ajgaRank ?? (junior.computed as any)?.ajgaRank;
  const wagr = (junior.meta as any)?.wagrRank ?? (junior.computed as any)?.wagrRank;
  const eowagr = (junior.meta as any)?.eowagrRank ?? (junior.computed as any)?.eowagrRank;

  // Palmarès — todas as vitórias do junior ordenadas por peso de torneio (desc),
  // depois pela data (mais recente primeiro). Mostra Top 5 inline + "+N restantes".
  const wins = useMemo(() => collectWins(junior, data.tournamentById), [junior, data.tournamentById]);
  const topWins = wins.slice(0, 5);
  const hiddenWinsCount = Math.max(0, wins.length - topWins.length);

  // Total de rondas jogadas (todas as fontes, incluindo 9H) — pill global no rodapé.
  const totalRounds = useMemo(() => countTotalRounds(junior, data.tournamentById), [junior, data.tournamentById]);

  return (
    <div style={{
      background: "var(--bg)",
      border: "1px solid var(--border)",
      borderRadius: 10,
      padding: "18px 20px",
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 18 }}>
        <div style={{
          width: 72, height: 72, borderRadius: "50%",
          background: "var(--bg-muted)", border: "1px solid var(--border)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 38, flexShrink: 0,
        }}>{flagEmoji}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <h2 style={{
              margin: 0,
              fontSize: 30,
              fontWeight: 700,
              color: "var(--text)",
              lineHeight: 1.15,
              letterSpacing: -0.5,
            }}>{junior.canonicalName}</h2>
            {isManuel && (
              <span style={{
                background: "var(--bg-success-subtle)",
                color: "var(--color-good-dark)",
                fontSize: "var(--fs-11)",
                padding: "3px 9px",
                borderRadius: "var(--radius-pill)",
                fontWeight: 700,
                letterSpacing: 0.4,
                textTransform: "uppercase",
              }}>
                ★ Tu (referência)
              </span>
            )}
            {tier && (() => {
              const c = getTierColors(tier);
              return (
                <span style={{
                  background: c.bg,
                  color: c.fg,
                  fontSize: "var(--fs-12)",
                  padding: "3px 10px",
                  borderRadius: "var(--radius-pill)",
                  fontWeight: 700,
                  border: `1px solid ${c.fg}`,
                  letterSpacing: 0.2,
                }}>
                  {tier === "elite" ? "★ " : tier === "strong" ? "⚔️ " : ""}{getTierLabel(tier)}
                </span>
              );
            })()}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, fontSize: "var(--fs-13)", color: "var(--text-2)", flexWrap: "wrap" }}>
            <span>📍 {country || "—"}</span>
            {junior.nationality && junior.country && junior.nationality !== junior.country && (
              <>
                <span style={{ opacity: 0.4 }}>·</span>
                <span title="Nacionalidade distinta do país onde reside/joga" style={{
                  fontSize: "var(--fs-11)", padding: "2px 8px", borderRadius: "var(--radius-pill)",
                  background: "var(--bg-muted)", color: "var(--text-2)", fontWeight: 600,
                  border: "1px solid var(--border-light)",
                }}>
                  {flagOf(junior.nationality)} {junior.nationality}
                </span>
              </>
            )}
            {junior.region && <><span style={{ opacity: 0.4 }}>·</span><span>{junior.region}</span></>}
            {dobInfo.state !== "unknown" && (
              <>
                <span style={{ opacity: 0.4 }}>·</span>
                <DobPill info={dobInfo} isManuel={isManuel} />
              </>
            )}
            {ageDiff && (
              <>
                <span style={{ opacity: 0.4 }}>·</span>
                <span style={{
                  fontSize: "var(--fs-11)",
                  padding: "2px 8px",
                  borderRadius: "var(--radius-pill)",
                  background: "var(--bg-muted)",
                  color: "var(--text-2)",
                  fontWeight: 600,
                }}>
                  {ageDiff}
                </span>
              </>
            )}
          </div>

          {mainClub && (
            <div style={{ marginTop: 10, display: "inline-flex", alignItems: "center", gap: 6 }}>
              <span style={{
                fontSize: "var(--fs-13)",
                padding: "5px 11px",
                borderRadius: 6,
                background: "var(--bg-muted)",
                color: "var(--text)",
                fontWeight: 600,
                border: "1px solid var(--border-light)",
              }}>
                🏌️ {mainClub}
                {mainClubSource && (
                  <span style={{ marginLeft: 6, fontSize: "var(--fs-10)", color: "var(--text-3)", fontWeight: 500 }}>
                    · {mainClubSource}
                  </span>
                )}
              </span>
            </div>
          )}

          {variants.length > 0 && (
            <div style={{
              marginTop: 10,
              padding: "6px 10px",
              background: "var(--bg-muted)",
              borderRadius: 6,
              fontSize: "var(--fs-12)",
              color: "var(--text-2)",
            }}>
              <span style={{ fontSize: "var(--fs-10)", fontWeight: 700, color: "var(--text-3)", letterSpacing: 0.4, textTransform: "uppercase", marginRight: 6 }}>
                Também conhecido como
              </span>
              {variants.map((v, i) => (
                <React.Fragment key={i}>
                  {i > 0 && <span style={{ opacity: 0.4, margin: "0 6px" }}>·</span>}
                  <span style={{ fontStyle: "italic", color: "var(--text)" }}>{v}</span>
                </React.Fragment>
              ))}
            </div>
          )}

          {(ajga || wagr || eowagr) && (
            <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
              {ajga && <RankPill label="AJGA" value={ajga} />}
              {wagr && <RankPill label="WAGR" value={wagr} />}
              {eowagr && <RankPill label="EOWAGR" value={eowagr} />}
            </div>
          )}

          {wins.length > 0 && (
            <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 5, alignItems: "center" }}>
              <span style={{ fontSize: "var(--fs-10)", fontWeight: 700, color: "var(--text-3)", letterSpacing: 0.4, textTransform: "uppercase", marginRight: 4 }}>
                🏆 Palmarès
              </span>
              {topWins.map((w, i) => (
                <span key={i} title={`${w.fmtDate} · ${w.flightLabel}${w.parts ? " · " + w.parts : ""}`} style={{
                  // Discreto: sem fundo, só border subtil + estrela dourada pequena.
                  fontSize: "var(--fs-11)", padding: "2px 8px", borderRadius: "var(--radius-pill)",
                  background: "var(--bg)",
                  border: "1px solid var(--border-light)",
                  color: "var(--text-2)", fontWeight: 500,
                  display: "inline-flex", alignItems: "center", gap: 4,
                  whiteSpace: "nowrap",
                }}>
                  <span style={{ color: "var(--medal-gold-strong)", letterSpacing: 0.2, fontSize: "var(--fs-10)" }}>
                    {"★".repeat(w.stars)}
                  </span>
                  <span>{w.shortName}</span>
                  <span style={{ opacity: 0.55, fontSize: "var(--fs-10)" }}>· {w.year}</span>
                </span>
              ))}
              {hiddenWinsCount > 0 && (
                <span style={{ fontSize: "var(--fs-10)", color: "var(--text-3)", fontWeight: 500 }}>
                  +{hiddenWinsCount} {hiddenWinsCount === 1 ? "vitória" : "vitórias"}
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      <div style={{
        display: "grid",
        // 5 colunas quando há card EGR — os 5 cartões cabem numa linha só.
        gridTemplateColumns: `repeat(${egr ? 5 : 4}, 1fr)`,
        gap: 10,
        marginTop: 16,
      }}>
        <FedCard
          label="USKIDS"
          value={junior.sources.uskids?.memberId ? `#${junior.sources.uskids.memberId}` : null}
          subtitle={junior.sources.uskids?.ageGroupCurrent}
          historical={junior.sources.uskids?.historicalMemberIds}
          historicalLabel={(h: any) => `legacy #${typeof h === "string" ? h : h.memberId}`}
        />
        <FedCard
          label="FPG"
          value={junior.sources.fpg?.fed ? `#${junior.sources.fpg.fed}` : null}
          subtitle={junior.sources.fpg?.club}
          historical={junior.sources.fpg?.historicalFeds}
          historicalLabel={(h: any) => `antigo #${typeof h === "string" ? h : h.fed}`}
          linkTo={junior.sources.fpg?.fed ? `/jogadores/${junior.sources.fpg.fed}` : null}
        />
        <FedCard
          label="RFEG"
          value={junior.sources.rfeg?.lic}
          subtitle={[junior.sources.rfeg?.club, junior.sources.rfeg?.catEdad].filter(Boolean).join(" · ")}
          historical={junior.sources.rfeg?.historicalLicenses}
          historicalLabel={(h: any) => `antiga ${typeof h === "string" ? h : h.lic}${typeof h === "object" && h.club ? " (" + h.club + ")" : ""}`}
        />
        {/* Jogadores mexicanos: a FMG não expõe fed code/licença (só a ficha GG
            com DOB/clube), e FFG raramente tem dados p/ um mexicano → mostrar um
            card "México" (clube + escalão) em vez do FFG vazio. */}
        {(junior.nationality === "MX" || junior.country === "MX") ? (
          <FedCard
            label="México"
            value={junior.club || "registado"}
            subtitle={(() => {
              const nT = (junior.tournamentIds || []).filter((t) => /^mexnacional-/.test(t)).length;
              return ["FMG", nT ? `${nT} torneio${nT > 1 ? "s" : ""}` : null].filter(Boolean).join(" · ");
            })()}
          />
        ) : (
          <FedCard
            label="FFG"
            value={junior.sources.ffgolf?.lic}
            subtitle={[
              junior.sources.ffgolf?.club,
              junior.sources.ffgolf?.region,
              junior.sources.ffgolf?.glfLic && junior.sources.ffgolf.glfLic !== junior.sources.ffgolf.lic
                ? `Lic GLF ${junior.sources.ffgolf.glfLic}`
                : null,
            ].filter(Boolean).join(" · ")}
            historical={junior.sources.ffgolf?.historicalLicenses}
            historicalLabel={(h: any) => `antiga ${typeof h === "string" ? h : h.lic}`}
          />
        )}
        {/* EGR (European Golf Rankings): Avg-to-CR (nível normalizado pelo
            Course Rating) + posição europeia por sexo + pontos, com link para
            a ficha EGR do jogador. Só aparece quando há match no ranking. */}
        {egr && (
          <FedCard
            label="EGR"
            value={egr[4] != null ? `${egr[4].toFixed(1)} vs CR` : `${egr[3] ?? "?"} pts`}
            subtitle={[
              egr[2] != null ? `#${egr[2]} Europa${egr[1] ? ` (${egr[1]})` : ""}` : null,
              egr[3] != null ? `${Math.round(egr[3])} pts` : null,
              egr[6] != null ? `${egr[6]} prova${egr[6] === 1 ? "" : "s"}` : null,
            ].filter(Boolean).join(" · ")}
            linkTo={`/egr/jogador/${egr[0]}`}
          />
        )}
      </div>

      {(escIntl || escUskids || escRfeg || escFpgTag || hcps.length > 0 || (junior.hcpHistory && junior.hcpHistory.length >= 2) || totalRounds > 0) && (
        <div style={{ display: "flex", gap: 6, marginTop: 14, flexWrap: "wrap" }}>
          {escIntl && <EscPill label={escIntl} accent strong />}
          {escUskids && <EscPill label={`${escUskids} · USKids`} />}
          {escRfeg && <EscPill label={`${escRfeg} · RFEG`} />}
          {escFpgTag && <EscPill label={`${escFpgTag} · FPG`} />}
          {hcps.map((h, i) => (
            <span key={i} title={`Handicap exacto (${h.source})${h.date ? " · " + h.date : ""}`} style={{
              background: "var(--bg-muted)",
              fontSize: "var(--fs-11)", padding: "3px 9px", borderRadius: "var(--radius-pill)",
              fontWeight: 600, color: "var(--text-2)",
              border: "1px solid var(--border-light)",
              display: "inline-flex", alignItems: "center", gap: 4,
            }}>
              {SOURCE_FLAGS[h.source] && <span style={{ fontSize: "var(--fs-12)", lineHeight: 1 }}>{SOURCE_FLAGS[h.source]}</span>}
              🎯 HCP {h.value?.toFixed(1)} <span style={{ color: "var(--text-3)", marginLeft: 3 }}>· {h.source}</span>
              {i === hcps.length - 1 && junior.hcpHistory && junior.hcpHistory.length >= 2 && (
                <HcpSparkline points={junior.hcpHistory} playerName={junior.canonicalName} />
              )}
            </span>
          ))}
          {hcps.length === 0 && junior.hcpHistory && junior.hcpHistory.length >= 2 && (
            <span style={{
              background: "var(--bg-muted)",
              fontSize: "var(--fs-11)", padding: "3px 9px", borderRadius: "var(--radius-pill)",
              fontWeight: 600, color: "var(--text-2)",
              border: "1px solid var(--border-light)",
              display: "inline-flex", alignItems: "center", gap: 4,
            }}>
              🎯 HCP {junior.hcpHistory[0].hcpExact.toFixed(1)} <span style={{ color: "var(--text-3)", marginLeft: 3 }}>· {junior.hcpHistory[0].source}</span>
              <HcpSparkline points={junior.hcpHistory} playerName={junior.canonicalName} />
            </span>
          )}
          {totalRounds > 0 && (
            <span title="Total de rondas jogadas em todas as fontes (inclui 9H)" style={{
              background: "var(--bg-muted)",
              fontSize: "var(--fs-11)", padding: "3px 9px", borderRadius: "var(--radius-pill)",
              fontWeight: 600, color: "var(--text-2)",
              border: "1px solid var(--border-light)",
            }}>
              ⛳ {totalRounds} {totalRounds === 1 ? "ronda" : "rondas"}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function FedCard({ label, value, subtitle, historical, historicalLabel, linkTo }: {
  label: string;
  value: string | null | undefined;
  subtitle?: string | null;
  historical?: Array<any>;
  historicalLabel?: (h: any) => string;
  /** Quando definido, o card inteiro fica clicável e linka para a rota dada
   *  (usado p.ex. para FPG → /jogadores/{fed}). */
  linkTo?: string | null;
}) {
  const empty = !value;
  const flag = SOURCE_FLAGS[label] || "";
  const isClickable = !!linkTo && !empty;

  const cardStyle: React.CSSProperties = {
    background: empty ? "var(--bg-muted)" : "var(--bg)",
    border: empty ? "1px dashed var(--border-light)" : "1px solid var(--border)",
    borderRadius: 8,
    padding: "10px 12px",
    opacity: empty ? 0.65 : 1,
    transition: isClickable ? "border-color 120ms, box-shadow 120ms" : undefined,
    cursor: isClickable ? "pointer" : undefined,
    textDecoration: "none",
    color: "inherit",
    display: "block",
  };

  const inner = (
    <>
      <div style={{
        fontSize: "var(--fs-11)",
        color: empty ? "var(--text-3)" : "var(--accent, var(--color-info-dark))",
        fontWeight: 800,
        letterSpacing: 0.6,
        textTransform: "uppercase",
        display: "flex",
        alignItems: "center",
        gap: 5,
      }}>
        <span>{label}</span>
        {flag && <span style={{ fontSize: "var(--fs-12)", lineHeight: 1, opacity: empty ? 0.5 : 1 }} title={`Federação: ${label}`}>{flag}</span>}
      </div>
      <div style={{
        fontSize: "var(--fs-15)",
        fontWeight: 700,
        marginTop: 3,
        color: empty ? "var(--text-3)" : "var(--text)",
        fontVariantNumeric: "tabular-nums",
        display: "flex",
        alignItems: "baseline",
        gap: 6,
      }}>
        <span>{value || "sem registo"}</span>
        {isClickable && (
          <span style={{ fontSize: "var(--fs-10)", color: "var(--color-info-dark, var(--color-navy))", fontWeight: 600 }} title="Abrir ficha do jogador">↗</span>
        )}
      </div>
      {subtitle && (
        <div style={{ fontSize: "var(--fs-11)", color: "var(--text-2)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {subtitle}
        </div>
      )}
      {historical && historical.length > 0 && historicalLabel && (
        <div style={{ fontSize: "var(--fs-10)", color: "var(--text-3)", marginTop: 4, fontStyle: "italic" }}>
          {historical.map((h, i) => (
            <div key={i}>{historicalLabel(h)}</div>
          ))}
        </div>
      )}
    </>
  );

  if (isClickable && linkTo) {
    // Regra global do projecto: TODOS os links abrem em janela nova.
    // react-router-dom <Link> respeita target/rel quando passados.
    return (
      <Link
        to={linkTo}
        target="_blank"
        rel="noreferrer"
        style={cardStyle}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLElement).style.borderColor = "var(--color-info-dark, var(--color-navy))";
          (e.currentTarget as HTMLElement).style.boxShadow = "0 0 0 1px var(--color-info-dark, var(--color-navy))";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLElement).style.borderColor = "var(--border)";
          (e.currentTarget as HTMLElement).style.boxShadow = "none";
        }}
      >
        {inner}
      </Link>
    );
  }

  return <div style={cardStyle}>{inner}</div>;
}

function EscPill({ label, accent, strong }: { label: string; accent?: boolean; strong?: boolean }) {
  // accent + strong = pill "primary" (escalão unificado Sub-N) — fundo escuro destacado
  if (accent && strong) {
    return (
      <span style={{
        background: "var(--color-info-dark, var(--color-navy))",
        color: "var(--bg)",
        fontSize: "var(--fs-12)", padding: "3px 11px", borderRadius: "var(--radius-pill)",
        fontWeight: 700,
        letterSpacing: 0.3,
      }}>{label}</span>
    );
  }
  return (
    <span style={{
      background: "var(--bg-info-subtle, var(--bg-info))",
      color: "var(--color-info-dark, var(--color-navy))",
      fontSize: "var(--fs-11)", padding: "3px 9px", borderRadius: "var(--radius-pill)",
      fontWeight: 600,
      border: "1px solid var(--color-info-dark, var(--color-navy))",
    }}>{label}</span>
  );
}

/** Pill da DOB — 4 estados visuais (known/range/inferred/unknown).
 *  O verde (--color-good-dark) é cor RESERVADA AO MANUEL (badge "★ Tu referência").
 *  Para outros juniores usamos cores neutras. */
function DobPill({ info, isManuel }: { info: DobInfo; isManuel: boolean }) {
  // Para o Manuel: verde (consistente com identidade dele).
  // Para outros: neutro bege/cinzento.
  const known = isManuel ? {
    background: "var(--bg-success-subtle, #ecfdf5)",
    color: "var(--color-good-dark)",
    border: "1px solid var(--color-good-dark)",
  } : {
    background: "var(--bg-muted)",
    color: "var(--text-2)",
    border: "1px solid var(--border)",
  };
  const range = isManuel ? {
    background: "var(--bg-success-subtle, #ecfdf5)",
    color: "var(--color-good-dark)",
    border: "1px dashed var(--color-good-dark)",
  } : {
    background: "var(--bg-muted)",
    color: "var(--text-2)",
    border: "1px dashed var(--border)",
  };
  const styles: Record<DobInfo["state"], React.CSSProperties> = {
    known,
    range,
    inferred: {
      background: "var(--bg-muted)",
      color: "var(--text-2)",
      border: "1px dashed var(--border)",
    },
    unknown: { display: "none" },
  };
  const title =
    info.state === "known" ? "Data de nascimento confirmada"
    : info.state === "range" ? "Janela de DOB pré-calculada"
    : info.state === "inferred" ? "DOB inferida a partir dos torneios + escalões"
    : "DOB desconhecida";
  return (
    <span title={title} style={{
      ...styles[info.state],
      fontSize: "var(--fs-11)", padding: "2px 9px", borderRadius: "var(--radius-pill)",
      fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 5,
    }}>
      🎂 {info.dobLabel}
      <span style={{ opacity: 0.7 }}>·</span>
      <span style={{ fontWeight: 700 }}>{info.ageLabel}</span>
      {info.nextBdayDays != null && info.nextBdayDays <= 30 && info.nextAge != null && (
        <span style={{ marginLeft: 4, fontSize: "var(--fs-10)", opacity: 0.85 }}>
          🎉 {info.nextAge} em {info.nextBdayDays}d
        </span>
      )}
    </span>
  );
}

function RankPill({ label, value }: { label: string; value: number | string }) {
  return (
    <span style={{
      background: "var(--bg-warn-subtle, var(--bg-warn))",
      color: "var(--color-warn-dark, var(--color-warn-dark))",
      fontSize: "var(--fs-11)", padding: "3px 9px", borderRadius: 6,
      fontWeight: 700,
      border: "1px solid var(--color-warn-dark, var(--color-warn-dark))",
    }}>
      🏆 {label} #{value}
    </span>
  );
}

interface WinEntry {
  tid: string;
  fmtDate: string;
  year: string;
  flightLabel: string;
  shortName: string;
  stars: number;
  parts: string | null;
}

/** Junta todas as vitórias (pos===1) do junior, ordenadas por peso de torneio (desc)
 *  com desempate por data (mais recente primeiro). */
function collectWins(junior: Junior, tournamentById: Map<string, Tournament>): WinEntry[] {
  const out: WinEntry[] = [];
  for (const tid of junior.tournamentIds) {
    const t = tournamentById.get(tid);
    if (!t) continue;
    for (const f of t.flights || []) {
      const r = f.results.find((x) => x.juniorId === junior.id);
      if (r?.pos !== 1) continue;
      const flightFs = typeof f.fieldSize === "number" && f.fieldSize > 0 ? f.fieldSize : f.results.length;
      const w = getTournWeight(t, flightFs);
      const date = t.date || t.startDate || "";
      out.push({
        tid,
        fmtDate: date,
        year: date.slice(0, 4) || "?",
        flightLabel: f.label || "Geral",
        shortName: shortenTournName(t.name || t.shortName || tid),
        stars: w.stars,
        parts: `rondas ${w.parts.rounds.toFixed(2)} · field ${w.parts.field.toFixed(2)}${w.parts.nations != null ? ` · nações ${w.parts.nations.toFixed(2)}` : ""}`,
      });
      break; // 1 win por torneio (não inflar com pos===1 em escalões duplicados)
    }
  }
  // Ordena: prioriza recência (últimos 24 meses) e empurra apenas vitórias
  // realmente marcantes (★★★+) do passado para cima. Vitórias antigas com
  // poucas estrelas ficam no fim — não interessam destacar.
  const now = Date.now();
  const MS_IN_MONTH = 1000 * 60 * 60 * 24 * 30;
  out.sort((a, b) => {
    const sa = scoreWin(a, now);
    const sb = scoreWin(b, now);
    return sb - sa;
  });
  return out;

  function scoreWin(w: WinEntry, ref: number): number {
    const t = w.fmtDate ? new Date(w.fmtDate).getTime() : 0;
    const monthsAgo = t > 0 ? (ref - t) / MS_IN_MONTH : 999;
    // Bónus de recência: 24 (1 mês atrás) → 0 (24+ meses)
    const recency = Math.max(0, 24 - monthsAgo);
    // Stars × 6 só sobe vitórias 3★+ acima dos recentes 2★ → recentes têm prioridade
    // para 2★, mas Marco Simone ★★★★ de 3 anos ainda salta para cima.
    return w.stars * 6 + recency;
  }
}

function shortenTournName(s: string): string {
  return s
    .replace(/^\d{4}\s+/, "")            // remove ano à frente "2025 ..."
    .replace(/\s+\d{4}$/, "")            // remove ano no fim "... 2025"
    .replace(/Campeonato\s+Nacional\s+de\s+Sub[\s-]*(\d+)\s*[HS]?/i, "Nac Sub-$1")
    .replace(/Greatgolf\s+Junior\s+Open/i, "Greatgolf")
    .replace(/Quinta\s+do\s+Lago\s+Junior\s+Open/i, "QdL")
    .replace(/USKids?\s+European\s+Championship/i, "USKids Euro")
    .replace(/USKids?\s+World\s+Championship/i, "USKids World")
    .replace(/Marco\s+Simone\s+Invitational/i, "Marco Simone")
    .replace(/Venice\s+Open/i, "Venice")
    .replace(/Rome\s+Classic/i, "Rome")
    .replace(/Real\s+Club\s+de\s+Golf\s+El\s+Prat/i, "El Prat")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 30);
}

function compareAgeToManuel(dobIso: string, state: DobInfo["state"]): string | null {
  const [y, m, d] = dobIso.split("-").map(Number);
  if (!y || !m || !d) return null;
  const dob = new Date(y, m - 1, d);
  const manuelDob = new Date(MANUEL_DOB.year, MANUEL_DOB.month, MANUEL_DOB.day);
  const diffMs = manuelDob.getTime() - dob.getTime();
  if (diffMs === 0) return "Mesma idade que Manuel";
  const diffDays = Math.abs(diffMs / 86400000);
  const olderThanManuel = diffMs > 0;
  // Para estados inferidos/range, não dizemos "12d mais velho" porque é falsa
  // precisão. Só damos resolução fina quando DOB é conhecida.
  if (state !== "known") {
    if (diffDays < 90) return olderThanManuel ? "~mesma idade (lig. mais velho)" : "~mesma idade (lig. mais novo)";
    if (diffDays < 365) {
      const months = Math.round(diffDays / 30);
      return `~${months} ${months === 1 ? "mês" : "meses"} ${olderThanManuel ? "mais velho" : "mais novo"} que Manuel`;
    }
    const years = Math.round(diffDays / 365.25);
    return `~${years} ${years === 1 ? "ano" : "anos"} ${olderThanManuel ? "mais velho" : "mais novo"} que Manuel`;
  }
  if (diffDays < 31) {
    const days = Math.round(diffDays);
    return `${days}d ${olderThanManuel ? "mais velho" : "mais novo"} que Manuel`;
  }
  if (diffDays < 365) {
    const months = Math.round(diffDays / 30);
    return `${months} ${months === 1 ? "mês" : "meses"} ${olderThanManuel ? "mais velho" : "mais novo"} que Manuel`;
  }
  const years = diffDays / 365.25;
  const yearsRound = Math.round(years * 10) / 10;
  const yearsWhole = Math.round(yearsRound);
  const isWholeYear = Math.abs(yearsRound - yearsWhole) < 0.05;
  const label = isWholeYear ? yearsWhole + " " + (yearsWhole === 1 ? "ano" : "anos") : yearsRound.toFixed(1) + " anos";
  return label + " " + (olderThanManuel ? "mais velho" : "mais novo") + " que Manuel";
}
