/**
 * src/ui/circuit/Scout.tsx — aba «Scout» dos torneios (20/10/2026).
 *
 * O field de hoje, um jogador por linha, com tudo o que interessa saber antes
 * da prova: o que cada um fez NESTA prova nas edições anteriores (era a aba
 * «Quem repete») e a carreira — nível, vitórias, HCP, idade, forma, confrontos
 * com o Manuel e próximas inscrições (era o Scout do kids2, que carregava
 * ~180 MB; agora lê os resumos juniors-scout.json e juniors-form.json).
 * Clicar numa linha abre as provas em comum com o Manuel e as próximas.
 *
 * Usado no CircuitShell (todas as provas dos circuitos), na /uskids e no kids2
 * (Próximos torneios). Modelo de tabela do scorecard (.sc-lb), ordenável.
 */
import React, { useContext, useEffect, useMemo, useState } from "react";
import { KidsLinkCtx, KidsLink } from "../KidsLink";
import { cachedFetchJson } from "../../data/fetchCache";
import { normName } from "../../utils/normName";
import { useSort } from "../../hooks/useSort";
import SortableHdr from "../SortableHdr";
import EmptyState from "../EmptyState";
import LoadingState from "../LoadingState";
import { fmtToPar, isoDate, shortDateSlash } from "../../utils/format";
import { clubFlagPrefix, flag } from "../../utils/flagUtils";
import { tpColorDark } from "../../utils/scoreDisplay";
import { isManuelByName } from "../../constants/manuel";
import { getTierLabel } from "../../pages/kids2/juniorCalc";
import { buildRepeaters, type FieldPlayer, type RepeaterRow } from "./repeaters";
import type { PastEdition } from "./PastEditionsTable";
import {
  computeThreat, formaMedia, idade, N_FORMA, THREAT_LABEL,
  type FormFile, type JuniorForm, type JuniorScout, type ScoutFile, type ThreatInfo,
} from "./scoutModel";

interface UskFieldFile {
  torneios?: Array<{ t: number; name: string; date_inicio?: string; escaloes?: Array<{ nome: string; jogadores?: Array<{ nome: string }> | null }> }>;
}
interface Proxima { t: number; name: string; date: string; escalao: string }

const TIER_ORD: Record<string, number> = { elite: 0, strong: 1, solid: 2, developing: 3, beginner: 4 };
const THREAT_DOT: Record<string, string> = { high: "var(--color-danger)", med: "var(--color-amber)", low: "var(--border)", none: "transparent" };

/** Inscrições futuras USKids por nome normalizado (uskids-field.json, ~2 MB). */
function useProximas(): Map<string, Proxima[]> | null {
  const [m, setM] = useState<Map<string, Proxima[]> | null>(null);
  useEffect(() => {
    let vivo = true;
    cachedFetchJson<UskFieldFile>("/data/uskids-field.json").then((d) => {
      if (!vivo) return;
      const hoje = new Date().toISOString().slice(0, 10);
      const out = new Map<string, Proxima[]>();
      for (const t of d?.torneios ?? []) {
        const date = isoDate(t.date_inicio || "");
        if (!date || date < hoje) continue;
        for (const e of t.escaloes ?? []) for (const j of e.jogadores ?? []) {
          const k = normName(j.nome);
          const arr = out.get(k) ?? [];
          if (!arr.some((x) => x.t === t.t)) arr.push({ t: t.t, name: t.name, date, escalao: e.nome });
          out.set(k, arr);
        }
      }
      for (const arr of out.values()) arr.sort((a, b) => a.date.localeCompare(b.date));
      setM(out);
    }).catch(() => { if (vivo) setM(new Map()); });
    return () => { vivo = false; };
  }, []);
  return m;
}

interface Linha {
  key: string; name: string; club: string | null; isManuel: boolean;
  sc?: JuniorScout; fm?: JuniorForm; rep?: RepeaterRow;
  idade: number | null; threat: ThreatInfo; frente: number; atras: number; vsMMedia: number | null;
  proximas: Proxima[];
}

export default function Scout({ field, editions = [], currentId, tCode }: {
  /** Jogadores de hoje (resultados → inscritos → draw). */
  field: FieldPlayer[];
  /** Edições desta prova (pode incluir a de hoje — sai por `currentId`). */
  editions?: PastEdition[];
  currentId?: string | null;
  /** tcode USKids da prova de hoje — sai dos «Próximos». */
  tCode?: number | null;
}) {
  const kidsMap = useContext(KidsLinkCtx);
  const [form, setForm] = useState<FormFile | null>(null);
  const [scout, setScout] = useState<ScoutFile | null>(null);
  const proximas = useProximas();
  const [aberto, setAberto] = useState<string | null>(null);
  useEffect(() => {
    let vivo = true;
    cachedFetchJson<FormFile>("/data/juniors-form.json").then((d) => { if (vivo) setForm(d ?? { players: {} }); }).catch(() => { if (vivo) setForm({ players: {} }); });
    cachedFetchJson<ScoutFile>("/data/juniors-scout.json").then((d) => { if (vivo) setScout(d ?? { players: {} }); }).catch(() => { if (vivo) setScout({ players: {} }); });
    return () => { vivo = false; };
  }, []);

  const rep = useMemo(() => buildRepeaters(field, editions, currentId), [field, editions, currentId]);
  const manuelNoField = field.some((p) => isManuelByName(p.name));

  const linhas = useMemo<Linha[]>(() => {
    if (!form || !scout) return [];
    const repByName = new Map(rep.rows.map((r) => [normName(r.name), r]));
    const vistos = new Set<string>();
    const out: Linha[] = [];
    for (const p of field) {
      const k = normName(p.name);
      if (!k || vistos.has(k)) continue;
      vistos.add(k);
      const id = kidsMap.get(k)?.id;
      const sc = id ? scout.players[id] : undefined;
      const fm = id ? form.players[id] : undefined;
      const rr = repByName.get(k);
      const isManuel = isManuelByName(p.name);
      const m = sc?.m ?? [];
      const frente = m.filter((x) => x[2] != null && x[3] != null && x[3] < x[2]).length;
      const atras = m.filter((x) => x[2] != null && x[3] != null && x[3] > x[2]).length;
      const vsMMedia = m.length ? m.reduce((s, x) => s + x[4], 0) / m.length : null;
      const threat = isManuel
        ? { score: -99, level: "none" as const, reasons: [] }
        : computeThreat({
            hasManuel: true, vsMTotal: vsMMedia, vsMCount: m.length, vsMSameFlight: sc?.mf ?? 0,
            tier: sc?.t ?? null, recentPos: fm?.r[0]?.[3] ?? null, wins: sc?.w ?? 0,
          });
      out.push({
        key: k, name: p.name, club: p.club ?? sc?.c ?? null, isManuel, sc, fm, rep: rr,
        idade: idade(sc?.d), threat, frente, atras, vsMMedia,
        proximas: (proximas?.get(k) ?? []).filter((x) => x.t !== tCode),
      });
    }
    return out;
  }, [field, form, scout, rep, kidsMap, proximas, tCode]);

  const { sortKey, sortDir, toggleSort } = useSort<string>(manuelNoField ? "nivel" : "tier", manuelNoField ? "desc" : "asc", {
    name: "asc", idade: "asc", hcp: "asc", tier: "asc", nivel: "desc", vit: "desc", forma: "asc", ult: "desc",
    n: "desc", best: "asc", vsm: "desc", prox: "desc",
  });
  const ordenadas = useMemo(() => {
    const val = (l: Linha): number | string | null => {
      switch (sortKey) {
        case "name": return l.name;
        case "idade": return l.idade;
        case "hcp": return l.sc?.h ?? null;
        case "tier": return l.sc?.t ? TIER_ORD[l.sc.t] : null;
        case "nivel": return l.isManuel ? null : l.threat.score;
        case "vit": return l.sc?.w ?? null;
        case "forma": return formaMedia(l.fm);
        case "ult": return l.fm?.r[0]?.[0] ?? null;
        case "n": return l.rep?.n ?? null;
        case "best": return l.rep?.bestPos ?? null;
        case "vsm": return l.sc?.m?.length ? l.frente - l.atras : null;
        case "prox": return l.proximas.length || null;
        default: return l.rep?.byEd[sortKey]?.pos ?? null;
      }
    };
    const dir = sortDir === "asc" ? 1 : -1;
    return [...linhas].sort((a, b) => {
      if (a.isManuel !== b.isManuel) return a.isManuel ? -1 : 1; // o Manuel fica em cima, como referência
      const va = val(a), vb = val(b);
      if (va == null && vb == null) return a.name.localeCompare(b.name);
      if (va == null) return 1;
      if (vb == null) return -1;
      const c = typeof va === "string" ? va.localeCompare(String(vb)) : (va as number) - (vb as number);
      return c * dir || a.name.localeCompare(b.name);
    });
  }, [linhas, sortKey, sortDir]);

  if (!form || !scout || !proximas) return <LoadingState />;
  if (!field.length) return <EmptyState size="md" message="Ainda não há jogadores conhecidos nesta prova." />;

  // Só as edições onde algum dos jogadores de hoje jogou (as outras seriam
  // colunas inteiras de «–»); a contagem do resumo é a de todas.
  const edsTodas = rep.editions;
  const eds = edsTodas.filter((e) => rep.rows.some((r) => r.byEd[e.id]));
  const rivais = linhas.filter((l) => !l.isManuel);
  const paises = new Set(rivais.map((l) => l.sc?.p || clubFlagPrefix(l.club)).filter(Boolean)).size;
  const altos = rivais.filter((l) => l.sc?.t === "elite" || l.sc?.t === "strong").length;
  const comManuel = rivais.filter((l) => l.sc?.m?.length).length;
  const repetem = rivais.filter((l) => l.rep).length;
  const tem = {
    idade: linhas.some((l) => l.idade != null),
    hcp: linhas.some((l) => l.sc?.h != null),
    vit: linhas.some((l) => l.sc?.w),
    forma: linhas.some((l) => l.fm?.r.length),
    vsm: linhas.some((l) => l.sc?.m?.length),
    prox: linhas.some((l) => l.proximas.length),
  };
  const sameYear = (e: PastEdition) => eds.some((o) => o !== e && o.year === e.year);
  const hp = { sortKey, sortDir, onSort: toggleSort };
  const nCols = 6 + Object.values(tem).filter(Boolean).length + (eds.length ? 2 + eds.length : 0);

  return (
    <div>
      <div className="fs-13" style={{ display: "flex", alignItems: "baseline", gap: 6, flexWrap: "wrap", margin: "2px 0 10px", color: "var(--text-2)" }}>
        <span><b style={{ color: "var(--text)" }}>{rivais.length}</b> {manuelNoField ? "adversários" : "jogadores"}</span>
        {paises > 1 && <><span className="muted">·</span><span><b style={{ color: "var(--text)" }}>{paises}</b> países</span></>}
        <span className="muted">·</span><span title="Elite ou Forte"><b style={{ color: "var(--text)" }}>{altos}</b> de nível alto</span>
        <span className="muted">·</span><span><b style={{ color: "var(--text)" }}>{comManuel}</b> já jogaram com o Manuel</span>
        {edsTodas.length > 0 && <><span className="muted">·</span><span><b style={{ color: "var(--text)" }}>{repetem}</b> já jogaram esta prova ({edsTodas.length} edi{edsTodas.length === 1 ? "ção anterior" : "ções anteriores"})</span></>}
        {manuelNoField && <span style={{ color: "var(--color-good-dark)", fontWeight: 700, marginLeft: 8 }}>★ Manuel no field</span>}
      </div>
      <div style={{ overflowX: "auto", paddingBottom: 6 }}>
        <table className="sc-lb sc-lb-airy" style={{ fontVariantNumeric: "tabular-nums", width: "max-content" }}>
          <thead>
            <tr>
              <SortableHdr k="name" {...hp} style={{ textAlign: "left" }}>Jogador</SortableHdr>
              {tem.idade && <SortableHdr k="idade" {...hp}>Idade</SortableHdr>}
              {tem.hcp && <SortableHdr k="hcp" {...hp} title="Handicap (Portugal / Espanha / França)">HCP</SortableHdr>}
              <SortableHdr k="nivel" {...hp} style={{ textAlign: "left" }}
                title="Nível na carreira (Elite, Forte, Sólido…); o ponto é a ameaça para o Manuel — vermelho alta, âmbar média. Clicar ordena pela ameaça.">Nível</SortableHdr>
              {tem.vit && <SortableHdr k="vit" {...hp} title="Vitórias na carreira">Vit.</SortableHdr>}
              {tem.forma && <SortableHdr k="forma" {...hp} title={`±par médio por 18 buracos nos últimos ${N_FORMA} torneios (últimos 18 meses)`}>Forma</SortableHdr>}
              {tem.forma && <SortableHdr k="ult" {...hp} title="Último torneio: lugar / jogadores do escalão">Último</SortableHdr>}
              {eds.length > 0 && <SortableHdr k="n" {...hp} title="Quantas edições anteriores desta prova jogou">Aqui</SortableHdr>}
              {eds.length > 0 && <SortableHdr k="best" {...hp} title="Melhor lugar numa edição anterior desta prova">Melhor</SortableHdr>}
              {tem.vsm && <SortableHdr k="vsm" {...hp} title="Todas as provas em comum com o Manuel: Manuel à frente – atrás, e pancadas dele a mais (+) ou a menos (−) que o Manuel, em média">vs Manuel</SortableHdr>}
              {tem.prox && <SortableHdr k="prox" {...hp} title="Próximos torneios USKids em que está inscrito">Próximos</SortableHdr>}
              {eds.map((e) => (
                <SortableHdr key={e.id} k={e.id} {...hp} title={[e.label, e.division, e.course].filter(Boolean).join(" · ")}>
                  {e.year}
                  {sameYear(e) && e.label ? <div className="fs-10 muted" style={{ fontWeight: 500 }}>{e.label}</div> : null}
                </SortableHdr>
              ))}
            </tr>
          </thead>
          <tbody>
            {ordenadas.map((l) => {
              const isOpen = aberto === l.key;
              const bandeira = clubFlagPrefix(l.club) || (l.sc?.p ? flag(l.sc.p) + " " : "");
              // Clube sem a bandeira do início (quando o «clube» é só a bandeira, fica vazio).
              const clube = (l.club || "").replace(/^[\u{1F1E6}-\u{1F1FF}\u{1F3F4}][\u{1F1E6}-\u{1F1FF}\u{E0000}-\u{E007F}]*\s*/u, "").trim();
              const fmd = formaMedia(l.fm);
              const ult = l.fm?.r[0];
              const temDetalhe = !!(l.sc?.m?.length || l.proximas.length);
              return (
                <React.Fragment key={l.key}>
                  <tr className={l.isManuel ? "row-manuel" : undefined}
                      onClick={temDetalhe ? () => setAberto(isOpen ? null : l.key) : undefined}
                      style={{ cursor: temDetalhe ? "pointer" : undefined, background: isOpen ? "var(--bg-hover)" : undefined }}
                      title={temDetalhe ? "Ver provas em comum com o Manuel e próximas inscrições" : undefined}>
                    <td style={{ textAlign: "left", whiteSpace: "nowrap" }} className={l.isManuel ? "fw-700" : undefined}>
                      {bandeira}{l.name} <KidsLink nome={l.name} />
                      {clube && <span className="muted fs-11"> · {clube}</span>}
                    </td>
                    {tem.idade && <td className="mono">{l.idade ?? "–"}</td>}
                    {tem.hcp && <td className="mono">{l.sc?.h != null ? l.sc.h.toFixed(1) : "–"}</td>}
                    <td style={{ textAlign: "left", whiteSpace: "nowrap" }}
                        title={!l.isManuel && l.threat.level !== "none" ? `Ameaça ${THREAT_LABEL[l.threat.level]} — ${l.threat.reasons.join(" · ")}` : undefined}>
                      <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", marginRight: 6,
                                     background: l.isManuel ? "transparent" : THREAT_DOT[l.threat.level] }} />
                      {l.sc?.t ? getTierLabel(l.sc.t) : <span className="muted">–</span>}
                    </td>
                    {tem.vit && <td className="mono" style={{ fontWeight: l.sc?.w ? 700 : 400 }}>{l.sc?.w || "–"}</td>}
                    {tem.forma && (
                      <td className="mono" style={{ color: fmd != null ? tpColorDark(fmd) : undefined }}
                          title={l.fm?.r.slice(0, N_FORMA).map((x) => `${shortDateSlash(x[0])} · ${fmtToPar(x[1])} (${x[2]} b.)${x[3] ? ` · ${x[3]}º/${x[4]}` : ""}`).join("\n")}>
                        {fmd != null ? fmtToPar(fmd) : "–"}
                      </td>
                    )}
                    {tem.forma && (
                      <td className="mono" style={{ whiteSpace: "nowrap" }}>
                        {ult ? <>{ult[3] ? `${ult[3]}º/${ult[4]}` : fmtToPar(ult[1])} <span className="muted fs-10">{shortDateSlash(ult[0])}</span></> : "–"}
                      </td>
                    )}
                    {eds.length > 0 && (
                      <td className="mono" title={l.rep?.avgToPar != null ? `Média ${fmtToPar(l.rep.avgToPar)} nas edições que acabou` : undefined}>
                        {l.rep ? `${l.rep.n}×` : "–"}
                      </td>
                    )}
                    {eds.length > 0 && <td className="mono">{l.rep?.bestPos != null ? `${l.rep.bestPos}º` : "–"}</td>}
                    {tem.vsm && (
                      <td className="mono" style={{ whiteSpace: "nowrap" }}>
                        {l.sc?.m?.length ? (
                          <>
                            <span style={{ fontWeight: 700, color: l.frente > l.atras ? "var(--accent-dark)" : l.atras > l.frente ? "var(--score-birdie)" : undefined }}
                                  title="Manuel à frente – atrás">{l.frente}–{l.atras}</span>
                            {l.vsMMedia != null && <span className="muted fs-10" style={{ marginLeft: 5 }}>{l.vsMMedia > 0 ? "+" : ""}{l.vsMMedia.toFixed(1).replace(".", ",")}</span>}
                          </>
                        ) : "–"}
                      </td>
                    )}
                    {tem.prox && (
                      <td style={{ textAlign: "left", whiteSpace: "nowrap" }}
                          title={l.proximas.map((x) => `${x.name} · ${x.escalao} (${shortDateSlash(x.date)})`).join("\n") || undefined}>
                        {l.proximas.length ? <>{l.proximas.length} <span className="muted fs-10">· {shortDateSlash(l.proximas[0].date)}</span></> : <span className="muted">–</span>}
                      </td>
                    )}
                    {eds.map((e) => {
                      const c = l.rep?.byEd[e.id];
                      if (!c) return <td key={e.id} className="muted">–</td>;
                      return (
                        <td key={e.id} className="mono"
                            title={[c.total != null ? `${c.total}` : null, c.toPar != null ? fmtToPar(c.toPar) : null, c.complete ? null : "não acabou"].filter(Boolean).join(" · ")}
                            style={c.complete ? undefined : { fontStyle: "italic", color: "var(--text-3)" }}>
                          {c.pos != null ? `${c.pos}º` : "–"}
                        </td>
                      );
                    })}
                  </tr>
                  {isOpen && (
                    <tr>
                      <td colSpan={nCols} style={{ textAlign: "left", background: "var(--bg-hover)", padding: "6px 10px 12px 28px" }}>
                        {l.sc?.m?.length ? (
                          <table className="sc-lb" style={{ width: "max-content", marginBottom: 6 }}>
                            <thead><tr><th style={{ textAlign: "left" }}>Prova em comum com o Manuel</th><th>Data</th><th>{l.name.split(" ")[0]}</th><th>Manuel</th><th title="Pancadas dele − Manuel">±</th></tr></thead>
                            <tbody>
                              {l.sc.m.map((x, i) => (
                                <tr key={i}>
                                  <td style={{ textAlign: "left" }}>{x[1]}</td>
                                  <td className="mono muted">{x[0] ? shortDateSlash(x[0]) : "–"}</td>
                                  <td className="mono">{x[2] != null ? `${x[2]}º` : "–"}</td>
                                  <td className="mono fw-700" style={{ color: x[2] != null && x[3] != null ? (x[3] < x[2] ? "var(--accent-dark)" : x[3] > x[2] ? "var(--score-birdie)" : undefined) : undefined }}>
                                    {x[3] != null ? `${x[3]}º` : "–"}
                                  </td>
                                  <td className="mono muted">{x[4] > 0 ? "+" : ""}{x[4]}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        ) : <div className="muted fs-12" style={{ marginBottom: 6 }}>Ainda não jogou nenhuma prova com o Manuel.</div>}
                        {l.proximas.length > 0 && (
                          <div className="fs-12">
                            <span className="muted">Próximos: </span>
                            {l.proximas.map((x, i) => (
                              <span key={x.t}>{i > 0 && <span className="muted"> · </span>}{x.name} <span className="muted">{x.escalao} · {shortDateSlash(x.date)}</span></span>
                            ))}
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
