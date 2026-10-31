import { useContext, useMemo } from "react";
import { isoDate, fmtDate, displayName, medal as medalOf } from "../utils/format";
import { flag } from "../utils/flagUtils";
import { normName as normNameAuto } from "../data/KIDSdataLoader";
import { kidsUrl, KidsLinkCtx } from "./KidsLink";
import { escalaoManuelParaData, isManuelByName as isManuel } from "../constants/manuel";
import type { Torneio } from "./uskidsTypes";
import { RoundPill } from "./PillBadge";
import { sortEscaloes, ESCALOES_DESTAQUE_USKIDS } from "./uskidsTypes";
import {
  LINKS_EXTRA, REGIONAL_CHAMPIONSHIPS, ArMapCtx,
  badgeVagas, diasAte, isTerminado, seriesBase, playerSeriesResult
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

/** "11/09/2026, 13:19" — com ano: um aviso de dados antigos tem de dizer de quando são. */
function fmtDataHora(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? ""
    : d.toLocaleString("pt-PT", { day:"2-digit", month:"2-digit", year:"numeric", hour:"2-digit", minute:"2-digit" });
}

/** A mensagem crua da fonte ("rate limit (Too many requests)") em português. */
function erroLegivel(erro: string): string {
  return /rate.?limit|too many/i.test(erro)
    ? "a USKids recusou os pedidos (demasiados pedidos seguidos)"
    : erro;
}

/** Devolve o elemento ↗ com link para a página Kids do jogador.
 *  1.º o roster canónico (juniors.json, via KidsLinkCtx): conhece aliases e
 *  nomes sem um nome do meio — a inscrição diz "Daniel Alejandro Rodríguez
 *  Stepanischev" e a ficha "Daniel Rodriguez Stepanischev". Depois os rivais
 *  (memberId; resolve antes de o roster chegar). */
export function KidsLink({ nome }: { nome: string }) {
  const arMap = useContext(ArMapCtx);
  const kidsMap = useContext(KidsLinkCtx);
  const k = normNameAuto(nome);
  const kid = kidsMap.get(k);
  const arEntry = arMap.get(k);
  if (!kid && !arEntry) return null;
  const to = kid
    ? kidsUrl({ id: kid.id, memberId: kid.memberId, name: kid.n })
    : kidsUrl({ memberId: (arEntry as any).memberId as string | undefined, name: arEntry!.n });
  return (
    <a
      href={to}
      onClick={e => { e.preventDefault(); window.open(to, "_blank"); }}
      title="Ver em Kids"
      className="u-fw-800 u-c-color-good-dark u-fs-fs-13 u-cur-pointer u-td-none u-fsh-0 u-ml-4px">
      ↗
    </a>
  );
}

/** Links oficiais de um torneio USKids (inscritos, resultados, página USKids e
 *  os extra de LINKS_EXTRA) — os mesmos no TournExternalLinks e no cabeçalho do
 *  CircuitShell (/uskids, 20/10/2026). */
export function uskidsLinks(t: number, urlUskids?: string | null): { label: string; url: string }[] {
  const extras = LINKS_EXTRA[t] ?? [];
  const uskidsUrl = urlUskids
    ?? extras.find(l => l.label === "USKids ↗")?.url
    ?? REGIONAL_CHAMPIONSHIPS[t]?.urlUSKids;
  return [
    { url:`https://www.signupanytime.com/plugins/links/front/linksviews.aspx?v=field&fmt=nohead&ax=2739&t=${t}`, label:"📋 Inscritos" },
    { url:`https://www.signupanytime.com/plugins/links/front/linksviews.aspx?v=results&fmt=nohead&ax=1129&t=${t}`, label:"🏆 Resultados ↗" },
    ...(uskidsUrl ? [{ url: uskidsUrl, label: "USKids ↗" }] : []),
    ...extras.filter(l => l.label !== "USKids ↗"),
  ];
}

/** Links oficiais do torneio (signupanytime + USKids + extra) — usados no
 *  detalhe da tab Torneios e o fallback para torneios já sem field data. */
export function TournExternalLinks({ t, urlUskids }: { t: number; urlUskids?: string | null }) {
  // Mesmo botão dos links oficiais das outras secções (.tourn-ext-link), à
  // direita do título (14/10/2026).
  return (
    <div className="u-d-flex u-gap-4px u-fwr-wrap u-ai-center">
      {uskidsLinks(t, urlUskids).map(l => (
        <a key={l.url + l.label} href={l.url} target="_blank" rel="noopener noreferrer"
          className="tourn-ext-link">
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
  const kidsMap = useContext(KidsLinkCtx);
  // Rival pelo nome da inscrição; se não houver, pelo nome canónico da ficha
  // kids2 (a inscrição diz "Daniel Alejandro Rodríguez Stepanischev", a ficha
  // "Daniel Rodriguez Stepanischev" — o mesmo caminho que a seta ↗ usa).
  const rivalDe = (nome: string) => {
    const k = normNameAuto(nome);
    return arMap.get(k) ?? (kidsMap.get(k) ? arMap.get(normNameAuto(kidsMap.get(k)!.n)) : undefined);
  };
  // Torneios USKids do Manuel (crachá "NT" na linha dele). Tem 2 contas e várias
  // grafias do nome → juntar todas as entradas dele, sem contar duas vezes.
  const nTornManuel = useMemo(() => {
    const tids = new Set<string>();
    for (const p of arMap.values()) {
      if (!isManuel(p.n)) continue;
      for (const [tid, r] of Object.entries(p.r)) if (r.tp != null || (r.rd?.length ?? 0) > 0) tids.add(tid);
    }
    return tids.size;
  }, [arMap]);
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
  // Um erro só esconde o campo quando não há dados nenhuns. Se a fonte recusou
  // hoje mas o registo anterior foi preservado (`stale`), mostra-se esse, com
  // a data — nunca uma página vazia com a mensagem crua da fonte.
  const semDados  = t.escaloes.length === 0;
  const bloqueado = !!t.sem_flights || (!!t.erro && semDados);
  const dataDados = fmtDataHora(t.stale_desde || t.ultima_atualizacao);

  return (
    <div>
      {/* ── Header — padrão detail-header idêntico a FPGPage/DrivePage ── */}
      <div className="detail-header">
        <div className="detail-header-top">
          <h2 className="detail-title">
            {t.emoji && <span className="u-mr-6px">{t.emoji}</span>}
            {t.name}
          </h2>
          <div className="u-d-flex u-gap-6px u-ai-center u-fwr-wrap">
            {REGIONAL_CHAMPIONSHIPS[t.t] && (
              <span className="p p-sm u-bg-bg-pink u-c-color-purple u-border-color-border-purple u-fw-800 u-ls-0_04em">⭐ REGIONAL INVITATION</span>
            )}
            {/* Sempre visível nos torneios por disputar (22/10/2026, pedido dela;
                antes só a 14 dias ou menos). 999 = data inválida. */}
            {dias >= 0 && dias < 999 && (
              <span className="p p-sm u-bg-chart-5 u-c-fff u-border-color-chart-5">
                {dias === 0 ? "começa hoje" : `daqui a ${dias}d`}
              </span>
            )}
            {dias < 0 && !isTerminado(t.date_fim, t.date_inicio) && (
              <span className="p p-sm u-bg-color-good u-c-fff u-border-color-color-good">
                ▶ em curso
              </span>
            )}
            <TournExternalLinks t={t.t} urlUskids={t.url_uskids} />
          </div>
        </div>

        {/* Sub-linha: data · campo · rondas · fee · tcode */}
        <div className="detail-sub">
          <span className="muted">
            📅 {fmtDate(t.date_inicio)}{t.date_fim && t.date_fim !== t.date_inicio ? ` → ${fmtDate(t.date_fim)}` : ""}
          </span>
          {t.campo && <span className="muted">📍 {t.campo}</span>}
          {(t.rondas ?? 0) > 1 && <RoundPill nR={t.rondas!} />}
          {t.fee_18 && <span className="chip">💵 {t.fee_18}</span>}
          <span className="muted fs-11 u-user-select-all u-cur-text u-op-0_6">t={t.t}</span>
        </div>

        {/* KPIs de inscrição */}
        {!bloqueado && (
          <div className="u-d-flex u-gap-8px u-fwr-wrap u-mt-8px">
            <span className="chip fw-700 fs-13 u-bg-color-good-dark u-c-fff u-p-3px-12px">
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
                  <span className="u-ml-4px u-op-0_8">({bd.label})</span>
                </span>
              ) : null;
            })()}
          </div>
        )}

        {/* Flight IDs por escalão — acesso rápido ao número de cada flight (para scraping/pesquisa) */}
        {!bloqueado && t.escaloes.some(e => e.flight_id) && (
          <div className="u-d-flex u-gap-4px u-fwr-wrap u-mt-8px u-ai-center">
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
          <div className="notice u-mt-10px">⏳ Flights ainda não publicados</div>
        )}
        {t.erro && semDados && (
          <div className="notice-error u-mt-10px">⚠️ Sem lista de inscritos: {erroLegivel(t.erro)}.</div>
        )}
        {t.erro && !semDados && (
          <div className="notice u-mt-10px">
            ⚠️ Não foi possível actualizar hoje — {erroLegivel(t.erro)}.
            {" "}Estes são os inscritos de <strong>{dataDados}</strong>, a última actualização conseguida.
          </div>
        )}

      </div>

      {bloqueado ? null : (
        <>
          {/* ── Grid de escalões ── */}
          <div className="u-d-grid u-grid-template-columns-73fso u-gap-10px u-mb-20px">
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
                  <div className="u-d-flex u-jc-space-between u-ai-flex-start u-mb-8px">
                    <div>
                      <div className="fs-13 fw-700" style={{ color: man ? "var(--accent)" : dst ? "var(--text)" : "var(--text-2)" }}>
                        {man && <span className="u-mr-4px">★</span>}{e.nome}
                      </div>
                      <div className="fs-11 c-text-3 u-mt-1px">{e.holes} buracos</div>
                    </div>
                    <div className="u-ta-right">
                      <div className="fw-800" style={{ fontSize: "var(--fs-15)", color: man ? "var(--accent)" : "var(--text)" }}>
                        {e.inscritos}<span className="fs-11 fw-400 c-text-3">/{e.maximo}</span>
                      </div>
                      {bd && (
                        <span className="fs-11 fw-700" style={{ background:bd.bg, color:bd.cor, padding:"1px 6px", borderRadius:5 }}>
                          {bd.label}
                        </span>
                      )}
                      {novos7d > 0 && (
                        <span className="fs-10 fw-700 u-bg-score-eagle u-c-fff u-p-1px-4px u-br-radius u-ml-3px"
                          title={`${novos7d} inscrito${novos7d > 1 ? "s" : ""} nos últimos 7 dias`}>
                          +{novos7d}
                        </span>
                      )}
                    </div>
                  </div>
                  {/* Barra de preenchimento */}
                  {e.maximo > 0 && (
                    <div style={{ height:4, borderRadius:"var(--radius-xs)", background:"var(--border)", overflow:"hidden", marginBottom: e.jogadores?.length ? 8 : 0 }}>
                      <div style={{ height:"100%", borderRadius:"var(--radius-xs)", background: man ? "var(--accent)" : "var(--color-good)", width:`${Math.min(100, Math.round((e.inscritos/e.maximo)*100))}%`, transition:"width .3s" }} />
                    </div>
                  )}
                  {/* Lista de jogadores */}
                  {e.jogadores && e.jogadores.length > 0 && (
                    <div className="u-bt-1px-solid-border-light u-pt-6px u-d-flex u-fd-column u-gap-2px">
                      {e.jogadores.map((j, i) => {
                        const isM = isManuel(j.nome);
                        const arEntry = !isM ? rivalDe(j.nome) : undefined;
                        const nTorn = isM ? nTornManuel
                          : arEntry ? Object.values(arEntry.r).filter(r => r.tp != null || (r.rd?.length ?? 0) > 0).length : 0;
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
                            <span className="u-d-flex u-ai-center u-gap-2px">
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
                                  padding: "0 4px", borderRadius: "var(--radius)", marginLeft: 3, lineHeight: "14px",
                                }} title={j.regDia && j.regObs === false
                                  ? `Inscrição estimada: ~${j.regDia} (há ${d} dia${d !== 1 ? "s" : ""}) — data reconstruída pela ordem de inscrição, a USKids não a publica`
                                  : `Inscrito há ${d} dia${d !== 1 ? "s" : ""} (${(j.regDia || j.firstSeen || "").slice(0,10)})`}>{label}</span>;
                              })()}
                              {!isM && <KidsLink nome={j.nome} />}
                            </span>
                            <span className="u-d-flex u-ai-center u-gap-4px">
                              {/* Resultados anos anteriores */}
                              {prevResults.map(({ y, res }) => {
                                const p = res!.p;
                                const medal = medalOf(p);
                                const col = p <= 3 ? "var(--color-warn-dark)" : p <= 10 ? "var(--color-good-dark)" : "var(--text-3)";
                                return (
                                  <span key={y} title={`${y}: #${p}${res!.tp != null ? ` (${res!.tp > 0 ? "+" : ""}${res!.tp})` : ""}`}
                                    className="fs-10 fw-700" style={{ color: col, opacity:.85 }}>
                                    {medal ?? `#${p}`}
                                    <span className="fs-10 fw-400 u-op-0_7">'{String(y).slice(2)}</span>
                                  </span>
                                );
                              })}
                              {nTorn > 0 && (
                                <span className="fs-10 fw-700 c-text-2 u-bg-bg-muted u-bd-1px-solid-border u-br-radius-sm u-p-0-4px u-lh-16px u-d-inline-block">
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
                    <div className="u-bt-1px-dashed-border-light u-pt-4px u-mt-4px">
                      <div className="fs-10 fw-600 c-text-3 u-mb-2px">
                        Desinscritos ({e.removed.length}):
                      </div>
                      {[...e.removed]
                        .sort((a, b) => (b.removedAt || "").localeCompare(a.removedAt || ""))
                        .map((r, i) => {
                          const d = r.removedAt ? Math.floor((Date.now() - new Date(r.removedAt).getTime()) / 86400_000) : null;
                          const label = d == null ? null : d <= 0 ? "hoje" : `há ${d}d`;
                          return (
                            <div key={i} className="fs-11 u-d-flex u-ai-center u-gap-2px u-c-text-3 u-op-0_75 u-p-0-0-1px">
                              <span className="u-c-color-bad u-fs-fs-9 u-mr-1px">✕</span>
                              <span className="u-td-line-through">{displayName(r.nome)}</span>
                              {r.pais && <span className="u-ml-2px">{flag(r.pais)}</span>}
                              <KidsLink nome={r.nome} />
                              {label && (
                                <span className="fs-10 fw-600 c-text-3 u-ml-auto u-op-0_8"
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
                    <div className="fs-12 c-text-3 u-mt-4px u-lh-1_6">
                      {e.paises.slice(0, 8).map(p => `${flag(p.pais)} ${p.n}`).join("  ")}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* ── Portugueses inscritos ── */}
          {ptTotal.length > 0 && (
            <div className="card u-bg-accent-light u-bd-1_5px-solid-accent u-mb-12px">
              <div className="h-sm u-c-accent u-mb-10px">🇵🇹 Portugueses inscritos</div>
              {t.escaloes.filter(e => e.jogadores?.some(j => j.pais === "PT")).map(e => (
                <div key={e.age_group} className="u-mb-8px">
                  <div className="h-xs u-c-accent-text u-mb-4px">{e.nome}</div>
                  {e.jogadores!.filter(j => j.pais === "PT").map((j, i) => (
                    <div key={i} className="fs-13 u-d-flex u-jc-space-between u-p-3px-8px u-br-radius-sm u-bg-rgba-255-255-255-_5 u-mb-2px">
                      <span className="fw-600 u-d-flex u-ai-center u-gap-2px">
                        {displayName(j.nome)}<KidsLink nome={j.nome} />
                      </span>
                      <span className="c-text-3 fs-12">{j.cidade}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}

          <div className="muted fs-11 u-ta-right">Última actualização: {dataDados}</div>
        </>
      )}
    </div>
  );
}
