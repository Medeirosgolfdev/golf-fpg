import React, { useContext } from "react";
import { isoDate, fmtDate, displayName, medal as medalOf } from "../utils/format";
import { flag } from "../utils/flagUtils";
import { normName as normNameAuto } from "../data/KIDSdataLoader";
import { kidsUrl } from "./KidsLink";
import { escalaoManuelParaData, isManuelByName as isManuel } from "../constants/manuel";
import type { Torneio } from "./uskidsTypes";
import { sortEscaloes, ESCALOES_DESTAQUE_USKIDS } from "./uskidsTypes";
import {
  LINKS_EXTRA, REGIONAL_CHAMPIONSHIPS, ArMapCtx,
  badgeVagas, fmtTs, diasAte, isTerminado, seriesBase, playerSeriesResult
} from "./USKIDSPageHelpers";

/** Dias desde a inscrição de um jogador.
 *  Prefere `regDia` — o dia de inscrição vindo do `pid` do signupanytime (ver
 *  scripts/lib/uskids-reg-dates.js) — e só cai no `firstSeen` (dia em que o
 *  NOSSO scraper o viu) quando não há data reconstruída. Num torneio acabado de
 *  descobrir o firstSeen é hoje para o campo inteiro, o que fazia parecer que
 *  se tinham inscrito todos no mesmo dia. */
function diasDesdeInscricao(j: { regDia?: string; firstSeen?: string }): number | null {
  const d = j.regDia || j.firstSeen;
  if (!d) return null;
  const ms = Date.parse(j.regDia ? `${j.regDia}T00:00:00Z` : d);
  if (Number.isNaN(ms)) return null;
  return Math.max(0, Math.floor((Date.now() - ms) / 86400_000));
}

/** Devolve o elemento ↗ com link para a página Kids do jogador.
 *  Usa memberId quando disponível (resolve antes dos 45 ficheiros carregarem). */
export function KidsLink({ nome }: { nome: string }) {
  const arMap = useContext(ArMapCtx);
  const arEntry = arMap.get(normNameAuto(nome));
  if (!arEntry) return null;
  const memberId = (arEntry as any).memberId as string | undefined;
  const to = kidsUrl({ memberId, name: arEntry.n });
  return (
    <a
      href={to}
      onClick={e => { e.preventDefault(); window.open(to, "_blank"); }}
      title="Ver em Kids"
      style={{ fontWeight: 800, color: "var(--color-good-dark)", fontSize: "var(--fs-13)",
        cursor: "pointer", textDecoration: "none", flexShrink: 0, marginLeft: 4 }}>
      ↗
    </a>
  );
}

/** Fila de links externos de um torneio USKids (Inscritos + Resultados no
 *  signupanytime, USKids ↗ e extras de LINKS_EXTRA). Partilhada entre o
 *  detalhe da tab Torneios e o fallback para torneios já sem field data. */
export function TournExternalLinks({ t, urlUskids }: { t: number; urlUskids?: string | null }) {
  const extras = LINKS_EXTRA[t] ?? [];
  const uskidsUrl = urlUskids
    ?? extras.find(l => l.label === "USKids ↗")?.url
    ?? REGIONAL_CHAMPIONSHIPS[t]?.urlUSKids;
  const linkStyle: React.CSSProperties = { padding:"3px 10px", borderRadius:6,
    background:"var(--bg-muted)", color:"var(--accent-text)", border:"1px solid var(--border)", textDecoration:"none" };
  return (
    <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginTop:10 }}>
      {[
        { href:`https://www.signupanytime.com/plugins/links/front/linksviews.aspx?v=field&fmt=nohead&ax=2739&t=${t}`, label:"📋 Inscritos" },
        { href:`https://www.signupanytime.com/plugins/links/front/linksviews.aspx?v=results&fmt=nohead&ax=1129&t=${t}`, label:"🏆 Resultados ↗" },
      ].map(l => (
        <a key={l.href} href={l.href} target="_blank" rel="noopener noreferrer"
          className="fs-12 fw-600" style={linkStyle}>
          {l.label}
        </a>
      ))}
      {uskidsUrl && (
        <a href={uskidsUrl} target="_blank" rel="noopener noreferrer"
          className="fs-12 fw-600" style={linkStyle}>
          USKids ↗
        </a>
      )}
      {extras.filter(l => l.label !== "USKids ↗").map((l, i) => (
        <a key={i} href={l.url} target="_blank" rel="noopener noreferrer"
          className="fs-12 fw-600" style={linkStyle}>
          {l.label}
        </a>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────
// TAB CAMPO
// ─────────────────────────────────────────────
export default function TabCampoDetalhe({ torneio: t }: { torneio: Torneio }) {
  const arMap = useContext(ArMapCtx);
  const escalaoM = escalaoManuelParaData(t.date_inicio);
  const sBase = seriesBase(t.name);
  const currentYear = parseInt((isoDate(t.date_inicio) || `${new Date().getFullYear()}-01-01`).slice(0, 4));
  // escalaoManuelParaData retorna NUMBER; comparar com age_group, não com nome string.
  // Exigir escalão Boys — Manuel é rapaz. Sem o filtro de género, torneios com um
  // escalão "Girls" do mesmo número (ex: Veteran Qualifier t=21666) destacavam o
  // escalão errado. Se não existir Boys do escalão dele, não há destaque.
  const b12     = t.escaloes.find(e => e.age_group === escalaoM && /boys/i.test(e.nome));
  const ptTotal = t.escaloes.flatMap(e => e.jogadores ?? []).filter(j => j.pais === "PT");
  const dias    = diasAte(t.date_inicio);
  const urgente = b12 && b12.vagas <= 3 && b12.vagas > 0;

  return (
    <div>
      {/* ── Header — padrão detail-header idêntico a FPGPage/DrivePage ── */}
      <div className="detail-header">
        <div className="detail-header-top">
          <h2 className="detail-title">
            {t.emoji && <span style={{ marginRight: 6 }}>{t.emoji}</span>}
            {t.name}
          </h2>
          <div style={{ display:"flex", gap:6, alignItems:"center", flexWrap:"wrap" }}>
            {REGIONAL_CHAMPIONSHIPS[t.t] && (
              <span className="p p-sm" style={{
                background:"var(--bg-pink)", color:"var(--color-purple)", borderColor:"var(--border-purple)",
                fontWeight:800, letterSpacing:"0.04em",
              }}>⭐ REGIONAL INVITATION</span>
            )}
            {dias >= 0 && dias <= 14 && (
              <span className="p p-sm" style={{ background:"var(--chart-5)", color:"#fff", borderColor:"var(--chart-5)" }}>
                daqui a {dias}d
              </span>
            )}
            {dias < 0 && !isTerminado(t.date_fim, t.date_inicio) && (
              <span className="p p-sm" style={{ background:"var(--color-good)", color:"#fff", borderColor:"var(--color-good)" }}>
                ▶ em curso
              </span>
            )}
          </div>
        </div>

        {/* Sub-linha: data · campo · rondas · fee · tcode */}
        <div className="detail-sub">
          <span className="muted">
            📅 {fmtDate(t.date_inicio)}{t.date_fim && t.date_fim !== t.date_inicio ? ` → ${fmtDate(t.date_fim)}` : ""}
          </span>
          {t.campo && <span className="muted">📍 {t.campo}</span>}
          {t.rondas && <span className="chip">{t.rondas} rondas</span>}
          {t.fee_18 && <span className="chip">💵 {t.fee_18}</span>}
          <span className="muted fs-11" style={{ userSelect:"all", cursor:"text", opacity:.6 }}>t={t.t}</span>
        </div>

        {/* KPIs de inscrição */}
        {!t.erro && !t.sem_flights && (
          <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginTop:8 }}>
            <span className="chip fw-700 fs-13" style={{ background:"var(--color-good-dark)", color:"#fff", padding:"3px 12px" }}>
              {t.total_inscritos}/{t.total_maximo} inscritos
            </span>
            {b12 && (() => {
              const bd = badgeVagas(b12.vagas, b12.maximo);
              return bd ? (
                <span className="chip fw-700 fs-13" style={{
                  background: urgente ? bd.bg : "var(--bg-hover)",
                  color: urgente ? bd.cor : "var(--text-2)",
                  border:`1px solid ${bd.bg}`, padding:"3px 12px",
                }}>
                  ★ {b12.nome}: {b12.inscritos}/{b12.maximo}
                  <span style={{ marginLeft:5, opacity:.8 }}>({bd.label})</span>
                </span>
              ) : null;
            })()}
          </div>
        )}

        {/* Flight IDs por escalão — acesso rápido ao número de cada flight (para scraping/pesquisa) */}
        {!t.erro && !t.sem_flights && t.escaloes.some(e => e.flight_id) && (
          <div style={{ display:"flex", gap:5, flexWrap:"wrap", marginTop:8, alignItems:"center" }}>
            <span className="muted fs-11">Flights:</span>
            {t.escaloes.filter(e => e.flight_id).map(e => (
              <span key={e.flight_id} className="p p-sm p-muted" title={`${e.nome} — flight ${e.flight_id}`}>
                {e.nome}: {e.flight_id}
              </span>
            ))}
          </div>
        )}

        {/* Alertas */}
        {t.sem_flights && (
          <div className="notice" style={{ marginTop:10 }}>⏳ Flights ainda não publicados</div>
        )}
        {t.erro && (
          <div className="notice-error" style={{ marginTop:10 }}>⚠️ {t.erro}</div>
        )}

        {/* Links */}
        <TournExternalLinks t={t.t} urlUskids={t.url_uskids} />
      </div>

      {t.erro || t.sem_flights ? null : (
        <>
          {/* ── Grid de escalões ── */}
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(230px,1fr))", gap:10, marginBottom:20 }}>
            {sortEscaloes(t.escaloes).map(e => {
              const bd  = badgeVagas(e.vagas, e.maximo);
              const dst = ESCALOES_DESTAQUE_USKIDS.has(e.nome);
              const man = e.age_group === escalaoM && /boys/i.test(e.nome);
              const novos7d = (e.jogadores || []).filter(j => diasDesdeInscricao(j) !== null && diasDesdeInscricao(j)! < 7).length;
              return (
                <div key={e.age_group} className="card" style={{
                  background: man ? "var(--accent-light)" : dst ? "var(--bg-card)" : "var(--bg-card)",
                  border: `1.5px solid ${man ? "var(--accent)" : dst ? "var(--border)" : "var(--border-light)"}`,
                  padding:"12px 16px",
                  boxShadow: man ? "0 0 0 2px var(--accent-alpha-10)" : undefined,
                }}>
                  {/* Cabeçalho do card */}
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:8 }}>
                    <div>
                      <div className="fs-13 fw-700" style={{ color: man ? "var(--accent)" : dst ? "var(--text)" : "var(--text-2)" }}>
                        {man && <span style={{ marginRight:4 }}>★</span>}{e.nome}
                      </div>
                      <div className="fs-11 c-text-3" style={{ marginTop:1 }}>{e.holes} buracos</div>
                    </div>
                    <div style={{ textAlign:"right" }}>
                      <div className="fw-800" style={{ fontSize: "var(--fs-15)", color: man ? "var(--accent)" : "var(--text)" }}>
                        {e.inscritos}<span className="fs-11 fw-400 c-text-3">/{e.maximo}</span>
                      </div>
                      {bd && (
                        <span className="fs-11 fw-700" style={{ background:bd.bg, color:bd.cor, padding:"1px 6px", borderRadius:5 }}>
                          {bd.label}
                        </span>
                      )}
                      {novos7d > 0 && (
                        <span className="fs-10 fw-700" style={{ background:"var(--score-eagle)", color:"#fff", padding:"1px 5px", borderRadius:5, marginLeft:3 }}
                          title={`${novos7d} inscrito${novos7d > 1 ? "s" : ""} nos últimos 7 dias`}>
                          +{novos7d}
                        </span>
                      )}
                    </div>
                  </div>
                  {/* Barra de preenchimento */}
                  {e.maximo > 0 && (
                    <div style={{ height:4, borderRadius:2, background:"var(--border)", overflow:"hidden", marginBottom: e.jogadores?.length ? 8 : 0 }}>
                      <div style={{ height:"100%", borderRadius:2, background: man ? "var(--accent)" : "var(--color-good)", width:`${Math.min(100, Math.round((e.inscritos/e.maximo)*100))}%`, transition:"width .3s" }} />
                    </div>
                  )}
                  {/* Lista de jogadores */}
                  {e.jogadores && e.jogadores.length > 0 && (
                    <div style={{ borderTop:"1px solid var(--border-light)", paddingTop:6, display:"flex", flexDirection:"column", gap:2 }}>
                      {e.jogadores.map((j, i) => {
                        const isM = isManuel(j.nome);
                        const arEntry = !isM ? arMap.get(normNameAuto(j.nome)) : undefined;
                        const nTorn = arEntry ? Object.values(arEntry.r).filter(r => r.tp != null || (r.rd?.length ?? 0) > 0).length : 0;
                        const daysSinceReg = diasDesdeInscricao(j);
                        const showDaysPill = daysSinceReg != null && daysSinceReg <= 25;
                        // Resultados nos 2 anos anteriores neste mesmo torneio
                        const prevResults = arEntry
                          ? [currentYear - 1, currentYear - 2]
                              .filter(y => y >= 2020)
                              .map(y => ({ y, res: playerSeriesResult(arEntry, sBase, y) }))
                              .filter(x => x.res !== null)
                          : [];
                        return (
                          <div key={i} style={{
                            display:"flex", justifyContent:"space-between", alignItems:"center",
                            fontSize: isM ? 13 : 12, fontWeight: isM ? 800 : 400,
                            padding: isM ? "4px 8px" : "1px 0",
                            margin: isM ? "2px -14px" : "0",
                            borderRadius: isM ? 5 : 0,
                            background: isM ? "var(--accent)" : "transparent",
                            color: isM ? "#fff" : j.pais === "PT" ? "var(--accent)" : "var(--text)",
                          }}>
                            <span style={{ display:"flex", alignItems:"center", gap:2 }}>
                              {isM ? "★ " : ""}{displayName(j.nome)}
                              {showDaysPill && !isM && (() => {
                                const d = daysSinceReg!;
                                // "~" marca a data reconstruída pelo pid (estimativa), não observada
                                const est = j.regDia != null && j.regObs === false;
                                const label = `${est ? "~" : ""}${d === 0 ? "hoje" : `${d}d`}`;
                                // Degradê: 0d=100%, 10d=60%, 25d=20%
                                const pct = d <= 10 ? Math.round(100 - d * 4) : Math.round(60 - (d - 10) * 2.7);
                                const bg = `color-mix(in srgb, var(--score-eagle) ${pct}%, transparent)`;
                                const fg = pct >= 60 ? "#fff" : "var(--text-2)";
                                return <span className="fs-10 fw-700" style={{
                                  background: bg, color: fg,
                                  border: pct < 60 ? "1px solid color-mix(in srgb, var(--score-eagle) 40%, transparent)" : "none",
                                  padding: "0 4px", borderRadius: 6, marginLeft: 3, lineHeight: "14px",
                                }} title={j.regDia && j.regObs === false
                                  ? `Inscrição estimada: ~${j.regDia} (há ${d} dia${d !== 1 ? "s" : ""}) — data reconstruída pela ordem de inscrição, a USKids não a publica`
                                  : `Inscrito há ${d} dia${d !== 1 ? "s" : ""} (${(j.regDia || j.firstSeen || "").slice(0,10)})`}>{label}</span>;
                              })()}
                              {!isM && <KidsLink nome={j.nome} />}
                            </span>
                            <span style={{ display:"flex", alignItems:"center", gap:5 }}>
                              {/* Resultados anos anteriores */}
                              {prevResults.map(({ y, res }) => {
                                const p = res!.p;
                                const medal = medalOf(p);
                                const col = p <= 3 ? "var(--color-warn-dark)" : p <= 10 ? "var(--color-good-dark)" : "var(--text-3)";
                                return (
                                  <span key={y} title={`${y}: #${p}${res!.tp != null ? ` (${res!.tp > 0 ? "+" : ""}${res!.tp})` : ""}`}
                                    className="fs-10 fw-700" style={{ color: col, opacity:.85 }}>
                                    {medal ?? `#${p}`}
                                    <span className="fs-10 fw-400" style={{ opacity:.7 }}>'{String(y).slice(2)}</span>
                                  </span>
                                );
                              })}
                              {nTorn > 0 && (
                                <span className="fs-10 fw-700 c-text-2" style={{
                                  background:"var(--bg-muted)", border:"1px solid var(--border)",
                                  borderRadius:4, padding:"0 4px", lineHeight:"16px",
                                  display:"inline-block",
                                }}>
                                  {nTorn}T
                                </span>
                              )}
                              <span title={j.cidade}>{flag(j.pais)}</span>
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {/* Jogadores removidos (desinscritos) — janela de 60 dias, mais recentes primeiro */}
                  {e.removed && e.removed.length > 0 && (
                    <div style={{ borderTop:"1px dashed var(--border-light)", paddingTop:4, marginTop:4 }}>
                      <div className="fs-10 fw-600 c-text-3" style={{ marginBottom:2 }}>
                        Desinscritos ({e.removed.length}):
                      </div>
                      {[...e.removed]
                        .sort((a, b) => (b.removedAt || "").localeCompare(a.removedAt || ""))
                        .map((r, i) => {
                          const d = r.removedAt ? Math.floor((Date.now() - new Date(r.removedAt).getTime()) / 86400_000) : null;
                          const label = d == null ? null : d <= 0 ? "hoje" : `há ${d}d`;
                          return (
                            <div key={i} className="fs-11" style={{
                              display:"flex", alignItems:"center", gap:2,
                              color:"var(--text-3)", opacity:.75, padding:"0 0 1px",
                            }}>
                              <span style={{ color:"var(--color-bad)", fontSize: "var(--fs-9)", marginRight:1 }}>✕</span>
                              <span style={{ textDecoration:"line-through" }}>{displayName(r.nome)}</span>
                              {r.pais && <span style={{ marginLeft:2 }}>{flag(r.pais)}</span>}
                              <KidsLink nome={r.nome} />
                              {label && (
                                <span className="fs-10 fw-600 c-text-3" style={{ marginLeft:"auto", opacity:.8 }}
                                  title={r.removedAt ? `Desinscrito em ${r.removedAt.slice(0,10)}` : undefined}>
                                  {label}
                                </span>
                              )}
                            </div>
                          );
                        })}
                    </div>
                  )}
                  {!e.jogadores && e.paises && e.paises.length > 0 && (
                    <div className="fs-12 c-text-3" style={{ marginTop:4, lineHeight:1.6 }}>
                      {e.paises.slice(0, 8).map(p => `${flag(p.pais)} ${p.n}`).join("  ")}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* ── Portugueses inscritos ── */}
          {ptTotal.length > 0 && (
            <div className="card" style={{ background:"var(--accent-light)", border:"1.5px solid var(--accent)", marginBottom:12 }}>
              <div className="h-sm" style={{ color:"var(--accent)", marginBottom:10 }}>🇵🇹 Portugueses inscritos</div>
              {t.escaloes.filter(e => e.jogadores?.some(j => j.pais === "PT")).map(e => (
                <div key={e.age_group} style={{ marginBottom:8 }}>
                  <div className="h-xs" style={{ color:"var(--accent-text)", marginBottom:4 }}>{e.nome}</div>
                  {e.jogadores!.filter(j => j.pais === "PT").map((j, i) => (
                    <div key={i} className="fs-13" style={{ display:"flex", justifyContent:"space-between", padding:"3px 8px", borderRadius:4, background:"rgba(255,255,255,.5)", marginBottom:2 }}>
                      <span className="fw-600" style={{ display:"flex", alignItems:"center", gap:2 }}>
                        {displayName(j.nome)}<KidsLink nome={j.nome} />
                      </span>
                      <span className="c-text-3 fs-12">{j.cidade}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}

          <div className="muted fs-11" style={{ textAlign:"right" }}>{fmtTs(t.ultima_atualizacao)}</div>
        </>
      )}
    </div>
  );
}
