/**
 * src/ui/circuit/Scout.tsx — aba «Scout» dos torneios (20/10/2026).
 *
 * O field de hoje, um jogador por linha, com tudo o que interessa saber antes
 * da prova: o que cada um fez NESTA prova nas edições anteriores (era a aba
 * «Quem repete») e a carreira — nível, vitórias, HCP, idade, forma, confrontos
 * com o Manuel e próximas inscrições (era o Scout do kids2, que carregava
 * ~180 MB; agora lê o resumo juniors-scout.json, que traz também a forma).
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
import { fmtToPar, isoDate, shortDateSlash, todayIso } from "../../utils/format";
import { clubFlagPrefix, flag } from "../../utils/flagUtils";
import { isManuel as isManuelPlayer } from "../../constants/manuel";
import { getTierLabel } from "../../pages/kids2/juniorCalc";
import { buildRepeaters, type FieldPlayer, type RepeaterRow } from "./repeaters";
import type { PastEdition } from "./PastEditionsTable";
import {
  computeThreat, formaMedia, idade, N_FORMA, THREAT_LABEL,
  type JuniorForm, type JuniorScout, type ScoutComManuel, type ScoutFile, type ThreatInfo,
} from "./scoutModel";

interface UskFieldFile {
  torneios?: Array<{ t: number; name: string; date_inicio?: string; escaloes?: Array<{ nome: string; jogadores?: Array<{ nome: string }> | null }> }>;
}
interface Proxima { t: number; name: string; date: string; escalao: string }

const TIER_ORD: Record<string, number> = { elite: 0, strong: 1, solid: 2, developing: 3, beginner: 4 };

/** Inscrições futuras USKids por nome normalizado (uskids-field.json, ~2 MB). */
function useProximas(): Map<string, Proxima[]> | null {
  const [m, setM] = useState<Map<string, Proxima[]> | null>(null);
  useEffect(() => {
    let vivo = true;
    cachedFetchJson<UskFieldFile>("/data/uskids-field.json").then((d) => {
      if (!vivo) return;
      const hoje = todayIso();
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

/** Coluna própria de uma página (ex.: FPG — saída, HCP oficial, forma WHS,
 *  previsão), calculada pelo nome do jogador. */
export interface ScoutExtraCol {
  key: string;
  label: React.ReactNode;
  title?: string;
  cell: (name: string) => React.ReactNode;
  sort?: (name: string) => number | string | null;
  dir?: "asc" | "desc";
  /** Bloco da linha de grupos por cima (colunas seguidas do mesmo grupo = um bloco). */
  grupo?: string;
}

interface Linha {
  key: string; name: string; club: string | null; country: string | null; isManuel: boolean;
  sc?: JuniorScout; fm?: JuniorForm; rep?: RepeaterRow;
  idade: number | null; threat: ThreatInfo; frente: number; atras: number; vsMMedia: number | null;
  proximas: Proxima[];
  fed: string | null;
}

/** É o Manuel? Pelo federado quando o field o traz (o pai, 54907, também se
 *  chama «Manuel Medeiros»), senão pelo nome — é o que o isManuel faz. */
const eManuel = (p: FieldPlayer) => isManuelPlayer({ fed: p.fed ?? undefined, name: p.name });

/** Provas em comum com o Manuel, juntas por dia: as da página (ex.: FPG — todos
 *  os torneios, de clube incluídos) e as do Kids 2. */
function juntarComManuel(a: ScoutComManuel[] = [], b: ScoutComManuel[] = []): ScoutComManuel[] {
  const dias = new Set(a.map((x) => x[0]));
  return [...a, ...b.filter((x) => !dias.has(x[0]))].sort((x, y) => (x[0] < y[0] ? 1 : x[0] > y[0] ? -1 : 0));
}

export default function Scout({
  field, editions = [], currentId, tCode,
  colsAntes = [], colsDepois = [], detalheExtra, resumoExtra, rodape, semHcp, ordemInicial, provasComManuel,
}: {
  /** Jogadores de hoje (resultados → inscritos → draw). */
  field: FieldPlayer[];
  /** Edições desta prova (pode incluir a de hoje — sai por `currentId`). */
  editions?: PastEdition[];
  currentId?: string | null;
  /** tcode USKids da prova de hoje — sai dos «Próximos». */
  tCode?: number | null;
  /** Colunas próprias da página: antes do Jogador (ex.: saída, tee) e depois do «Último». */
  colsAntes?: ScoutExtraCol[];
  colsDepois?: ScoutExtraCol[];
  /** Bloco extra no detalhe de cada jogador (ex.: FPG — voltas aqui, forma WHS, previsão). */
  detalheExtra?: (name: string) => React.ReactNode | null;
  /** Mais texto na linha de resumo, e uma nota no fim da tabela. */
  resumoExtra?: React.ReactNode;
  rodape?: React.ReactNode;
  /** Esconde o HCP do resumo kids2 (a página traz o seu, ex.: o índice FPG). */
  semHcp?: boolean;
  /** Ordenação inicial (default: ameaça quando o Manuel está no field). */
  ordemInicial?: { key: string; dir: "asc" | "desc" };
  /** Provas em comum com o Manuel que a página conhece e o Kids 2 não (FPG:
   *  torneios de clube, Drive…) — juntam-se às do juniors-scout.json. */
  provasComManuel?: (p: FieldPlayer) => ScoutComManuel[] | null | undefined;
}) {
  const kidsMap = useContext(KidsLinkCtx);
  const [scout, setScout] = useState<ScoutFile | null>(null);
  const proximas = useProximas();
  const [aberto, setAberto] = useState<string | null>(null);
  useEffect(() => {
    let vivo = true;
    cachedFetchJson<ScoutFile>("/data/juniors-scout.json").then((d) => { if (vivo) setScout(d ?? { players: {} }); }).catch(() => { if (vivo) setScout({ players: {} }); });
    return () => { vivo = false; };
  }, []);

  const rep = useMemo(() => buildRepeaters(field, editions, currentId), [field, editions, currentId]);
  const manuelNoField = field.some(eManuel);

  const linhas = useMemo<Linha[]>(() => {
    if (!scout) return [];
    const repByName = new Map(rep.rows.map((r) => [normName(r.name), r]));
    const vistos = new Set<string>();
    const out: Linha[] = [];
    for (const p of field) {
      const k = normName(p.name);
      if (!k || vistos.has(p.fed || k)) continue;
      vistos.add(p.fed || k);
      // A ficha do Kids 2 só vale se o federado bater (o pai do Manuel tem o
      // nome de uma das variantes do filho).
      const kid = kidsMap.get(k);
      const outraPessoa = !!(p.fed && kid?.fed && kid.fed !== p.fed);
      const id = kid && !outraPessoa ? kid.id : undefined;
      const scBase = id ? scout.players[id] : undefined;
      const fm = scBase?.f;
      const rr = repByName.get(k);
      const isManuel = eManuel(p);
      const extraM = !isManuel ? provasComManuel?.(p) : null;
      const sc = extraM?.length ? { ...scBase, m: juntarComManuel(extraM, scBase?.m) } : scBase;
      const m = sc?.m ?? [];
      // Rival à frente / atrás: pelo lugar quando há os dois, senão pelas pancadas.
      const naFrente = (x: ScoutComManuel) => (x[2] != null && x[3] != null ? x[2] < x[3] : x[4] < 0);
      const atrasDele = (x: ScoutComManuel) => (x[2] != null && x[3] != null ? x[2] > x[3] : x[4] > 0);
      const frente = m.filter(atrasDele).length;
      const atras = m.filter(naFrente).length;
      const vsMMedia = m.length ? m.reduce((s, x) => s + x[4], 0) / m.length : null;
      const threat = isManuel
        ? { score: -99, level: "none" as const, reasons: [] }
        : computeThreat({
            hasManuel: true, vsMTotal: vsMMedia, vsMCount: m.length, vsMSameFlight: sc?.mf ?? 0,
            tier: sc?.t ?? null, recentPos: fm?.r[0]?.[3] ?? null, wins: sc?.w ?? 0,
          });
      out.push({
        key: k, name: p.name, club: p.club ?? sc?.c ?? null, country: p.country ?? null, isManuel, sc, fm, rep: rr,
        idade: idade(sc?.d), threat, frente, atras, vsMMedia,
        // As inscrições USKids são por nome: um homónimo (outro federado) não as herda.
        proximas: outraPessoa ? [] : (proximas?.get(k) ?? []).filter((x) => x.t !== tCode),
        fed: p.fed ?? null,
      });
    }
    return out;
  }, [field, scout, rep, kidsMap, proximas, tCode, provasComManuel]);

  const extras = useMemo(() => [...colsAntes, ...colsDepois], [colsAntes, colsDepois]);
  const { sortKey, sortDir, toggleSort } = useSort<string>(
    ordemInicial?.key ?? (manuelNoField ? "nivel" : "tier"),
    ordemInicial?.dir ?? (manuelNoField ? "desc" : "asc"), {
    name: "asc", idade: "asc", hcp: "asc", tier: "asc", nivel: "desc", torn: "desc", vit: "desc", forma: "asc", ult: "desc",
    rfeg: "asc", n: "desc", best: "asc", vsm: "desc", vsmp: "asc", prox: "desc",
    ...Object.fromEntries(extras.map((c) => [c.key, c.dir ?? "asc"])),
  });
  const ordenadas = useMemo(() => {
    const val = (l: Linha): number | string | null => {
      switch (sortKey) {
        case "name": return l.name;
        case "idade": return l.idade;
        case "hcp": return l.sc?.h ?? null;
        case "tier": return l.sc?.t ? TIER_ORD[l.sc.t] : null;
        case "nivel": return l.isManuel ? null : l.threat.score;
        case "torn": return l.sc?.n ?? null;
        case "vit": return l.sc?.w ?? null;
        case "forma": return formaMedia(l.fm);
        case "ult": return l.fm?.r[0]?.[0] ?? null;
        case "rfeg": return l.sc?.rk?.[0] ?? null;
        case "n": return l.rep?.n ?? null;
        case "best": return l.rep?.bestPos ?? null;
        case "vsm": return l.sc?.m?.length ? l.atras / l.sc.m.length : null;
        case "vsmp": return l.vsMMedia;
        case "prox": return l.proximas.length || null;
        default: {
          const ex = extras.find((c) => c.key === sortKey);
          return ex ? (ex.sort ? ex.sort(l.name) : null) : l.rep?.byEd[sortKey]?.pos ?? null;
        }
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
  }, [linhas, sortKey, sortDir, extras]);

  if (!scout || !proximas) return <LoadingState />;
  if (!field.length) return <EmptyState size="md" message="Ainda não há jogadores conhecidos nesta prova." />;

  // Só as edições onde algum dos jogadores de hoje jogou (as outras seriam
  // colunas inteiras de «–»); a contagem do resumo é a de todas.
  const edsTodas = rep.editions;
  const eds = edsTodas.filter((e) => rep.rows.some((r) => r.byEd[e.id]));
  const rivais = linhas.filter((l) => !l.isManuel);
  const paises = new Set(rivais.map((l) => l.country || l.sc?.p || clubFlagPrefix(l.club)).filter(Boolean)).size;
  const altos = rivais.filter((l) => l.sc?.t === "elite" || l.sc?.t === "strong").length;
  const comManuel = rivais.filter((l) => l.sc?.m?.length).length;
  const repetem = rivais.filter((l) => l.rep).length;
  // Desenho (20/10/2026, pedido da Mariana: «não tem visualmente nada a ver com
  // nada»): o modelo do Resumo — mesma letra, sem bolas nem cores soltas (o verde
  // só na linha do Manuel), bandeira antes do nome, e as colunas agrupadas em
  // blocos com uma linha de grupos por cima: Carreira · Nesta prova · Com o
  // Manuel · Próximos (+ os blocos próprios da página, ex.: FPG). Colunas sem
  // dados não aparecem. A ameaça já não se pinta: é a ordem por omissão, e o
  // motivo fica no tooltip do Nível.
  const tem = {
    idade: linhas.some((l) => l.idade != null),
    hcp: !semHcp && linhas.some((l) => l.sc?.h != null),
    torn: linhas.some((l) => l.sc?.n),
    vit: linhas.some((l) => l.sc?.w),
    forma: linhas.some((l) => formaMedia(l.fm) != null),
    rfeg: linhas.some((l) => l.sc?.rk),
    vsm: linhas.some((l) => l.sc?.m?.length),
    prox: linhas.some((l) => l.proximas.length),
  };
  const sameYear = (e: PastEdition) => eds.some((o) => o !== e && o.year === e.year);
  const hp = { sortKey, sortDir, onSort: toggleSort };
  const nCarreira = 1 + (tem.idade ? 1 : 0) + (tem.hcp ? 1 : 0) + (tem.torn ? 1 : 0) + (tem.vit ? 1 : 0) + (tem.forma ? 1 : 0) + (tem.rfeg ? 1 : 0);
  const nProva = eds.length ? 2 + eds.length : 0;
  const nManuel = tem.vsm ? 2 : 0;
  const nCols = colsAntes.length + 1 + nCarreira + nProva + nManuel + (tem.prox ? 1 : 0) + colsDepois.length;
  // Blocos das colunas da página (cada coluna diz o seu grupo; seguidas = um bloco).
  const blocosDepois: { grupo: string; n: number }[] = [];
  for (const c of colsDepois) {
    const g = c.grupo ?? "";
    const ult = blocosDepois[blocosDepois.length - 1];
    if (ult && ult.grupo === g) ult.n++; else blocosDepois.push({ grupo: g, n: 1 });
  }
  const SEP = { borderLeft: "1px solid var(--border)" } as const;
  const GRUPO = { background: "var(--bg-success-subtle)", color: "var(--color-good-dark)", fontWeight: 600, fontSize: "var(--fs-11)", textAlign: "center" as const, padding: "3px 8px" };
  const hdr = (k: string, label: React.ReactNode, title?: string, sep?: boolean) =>
    <SortableHdr k={k} {...hp} title={title} style={sep ? SEP : undefined}>{label}</SortableHdr>;
  const extraHdr = (c: ScoutExtraCol, i: number, arr: ScoutExtraCol[]) => {
    const sep = i === 0 || (arr[i - 1].grupo ?? "") !== (c.grupo ?? "");
    return c.sort
      ? <SortableHdr key={c.key} k={c.key} {...hp} title={c.title} style={sep ? SEP : undefined}>{c.label}</SortableHdr>
      : <th key={c.key} title={c.title} style={sep ? SEP : undefined}>{c.label}</th>;
  };
  const extraTd = (l: Linha) => (c: ScoutExtraCol, i: number, arr: ScoutExtraCol[]) => {
    const sep = i === 0 || (arr[i - 1].grupo ?? "") !== (c.grupo ?? "");
    return <td key={c.key} style={sep ? SEP : undefined}>{c.cell(l.name)}</td>;
  };

  return (
    <div>
      <div className="fs-13" style={{ display: "flex", alignItems: "baseline", gap: 6, flexWrap: "wrap", margin: "2px 0 10px", color: "var(--text-2)" }}>
        <span><b style={{ color: "var(--text)" }}>{rivais.length}</b> {manuelNoField ? "adversários" : "jogadores"}</span>
        {paises > 1 && <><span className="muted">·</span><span><b style={{ color: "var(--text)" }}>{paises}</b> países</span></>}
        <span className="muted">·</span><span title="Elite ou Forte"><b style={{ color: "var(--text)" }}>{altos}</b> de nível alto</span>
        <span className="muted">·</span><span><b style={{ color: "var(--text)" }}>{comManuel}</b> já jogaram com o Manuel</span>
        {edsTodas.length > 0 && <><span className="muted">·</span><span><b style={{ color: "var(--text)" }}>{repetem}</b> já jogaram esta prova ({edsTodas.length} edi{edsTodas.length === 1 ? "ção anterior" : "ções anteriores"})</span></>}
        {resumoExtra}
      </div>
      <div style={{ overflowX: "auto", paddingBottom: 6 }}>
        <table className="sc-lb sc-lb-airy" style={{ fontVariantNumeric: "tabular-nums", width: "max-content" }}>
          <thead>
            <tr>
              {colsAntes.length > 0 && <th colSpan={colsAntes.length} />}
              <th />
              <th colSpan={nCarreira} style={{ ...GRUPO, ...SEP }}>Carreira</th>
              {nProva > 0 && <th colSpan={nProva} style={{ ...GRUPO, ...SEP }}>Nesta prova</th>}
              {nManuel > 0 && <th colSpan={nManuel} style={{ ...GRUPO, ...SEP }}>Com o Manuel</th>}
              {tem.prox && <th style={{ ...GRUPO, ...SEP }}>Próximos</th>}
              {blocosDepois.map((b, i) => <th key={i} colSpan={b.n} style={{ ...GRUPO, ...SEP }}>{b.grupo}</th>)}
            </tr>
            <tr>
              {colsAntes.map(extraHdr)}
              <SortableHdr k="name" {...hp} style={{ textAlign: "left" }}>Jogador</SortableHdr>
              {tem.idade && hdr("idade", "Idade", undefined, true)}
              {tem.hcp && hdr("hcp", "HCP", "Handicap (Portugal / Espanha / França)", !tem.idade)}
              {hdr("nivel", "Nível", "Nível na carreira (Elite, Forte, Sólido, Em Dev., Iniciante). Ordenar por aqui põe primeiro os mais perigosos para o Manuel — o porquê está no tooltip de cada um.", !tem.idade && !tem.hcp)}
              {tem.torn && hdr("torn", "Torneios", "Torneios na carreira (todas as fontes)")}
              {tem.vit && hdr("vit", "Vitórias", "Vitórias na carreira")}
              {tem.forma && hdr("forma", "Forma", `±par médio por 18 buracos nos últimos ${N_FORMA} torneios (últimos 18 meses) — o último está no tooltip`)}
              {tem.rfeg && hdr("rfeg", "Rk RFEG", "Lugar no ranking juvenil da Federação Espanhola (Infantil, Cadete ou de zona) — qual ranking e a data no tooltip")}
              {nProva > 0 && hdr("n", "Vezes", "Quantas edições anteriores desta prova jogou", true)}
              {nProva > 0 && hdr("best", "Melhor", "Melhor lugar numa edição anterior desta prova")}
              {eds.map((e) => (
                <SortableHdr key={e.id} k={e.id} {...hp} title={[e.label, e.division, e.course].filter(Boolean).join(" · ")}>
                  {e.year}
                  {sameYear(e) && e.label ? <div className="fs-10 muted" style={{ fontWeight: 500 }}>{e.label}</div> : null}
                </SortableHdr>
              ))}
              {tem.vsm && hdr("vsm", "Ele à frente", "Em quantas das provas em comum ficou à frente do Manuel", true)}
              {tem.vsm && hdr("vsmp", "Pancadas", "Pancadas a mais (+) ou a menos (−) que o Manuel, em média, nas provas em comum")}
              {tem.prox && hdr("prox", "Torneios", "Próximos torneios USKids em que está inscrito (a lista no tooltip)", true)}
              {colsDepois.map(extraHdr)}
            </tr>
          </thead>
          <tbody>
            {ordenadas.map((l) => {
              const isOpen = aberto === l.key;
              // Bandeira: a do clube, senão o país que a prova publica, senão o do kids2.
              const paisFlag = l.country ? flag(l.country) : "";
              const bandeira = clubFlagPrefix(l.club) || (paisFlag && paisFlag !== "🏳️" ? paisFlag + " " : "") || (l.sc?.p ? flag(l.sc.p) + " " : "");
              // Clube sem a bandeira do início (quando o «clube» é só a bandeira, fica vazio).
              const clube = (l.club || "").replace(/^[\u{1F1E6}-\u{1F1FF}\u{1F3F4}][\u{1F1E6}-\u{1F1FF}\u{E0000}-\u{E007F}]*\s*/u, "").trim();
              const mostraClube = clube && !/^[A-Z]{2,3}(-[A-Z]{2,4})?$/.test(clube);
              const fmd = formaMedia(l.fm);
              const ult = l.fm?.r[0];
              const detExtra = detalheExtra?.(l.name) ?? null;
              const temDetalhe = !!(l.sc?.m?.length || l.proximas.length || detExtra);
              const nM = l.sc?.m?.length ?? 0;
              return (
                <React.Fragment key={l.key}>
                  <tr className={l.isManuel ? "row-manuel" : undefined}
                      onClick={temDetalhe ? () => setAberto(isOpen ? null : l.key) : undefined}
                      style={{ cursor: temDetalhe ? "pointer" : undefined, background: isOpen ? "var(--bg-hover)" : undefined }}
                      title={temDetalhe ? "Ver o detalhe: provas em comum com o Manuel e próximas inscrições" : undefined}>
                    {colsAntes.map(extraTd(l))}
                    <td style={{ textAlign: "left", whiteSpace: "nowrap" }} className={l.isManuel ? "fw-700" : undefined}>
                      {bandeira}{l.name} <KidsLink nome={l.name} fed={l.fed} />
                      {mostraClube && <span className="muted fs-11"> · {clube}</span>}
                    </td>
                    {tem.idade && <td style={SEP}>{l.idade ?? "–"}</td>}
                    {tem.hcp && (
                      <td style={!tem.idade ? SEP : undefined}
                          title={l.sc?.hr ? `Handicap oficial da Federação Espanhola${l.sc.hr[1] ? ` — actualizado a ${shortDateSlash(l.sc.hr[1], true)}` : ""}` : undefined}>
                        {l.sc?.h != null ? l.sc.h.toFixed(1) : "–"}
                      </td>
                    )}
                    <td style={!tem.idade && !tem.hcp ? SEP : undefined}
                        title={!l.isManuel && l.threat.level !== "none" ? `Ameaça ${THREAT_LABEL[l.threat.level]} para o Manuel — ${l.threat.reasons.join(" · ")}` : undefined}>
                      {l.sc?.t ? getTierLabel(l.sc.t) : "–"}
                    </td>
                    {tem.torn && <td>{l.sc?.n || "–"}</td>}
                    {tem.vit && <td>{l.sc?.w || "–"}</td>}
                    {tem.forma && (
                      <td title={[
                        ult ? `Último: ${ult[3] ? `${ult[3]}º de ${ult[4]}` : fmtToPar(ult[1])} (${shortDateSlash(ult[0])})` : null,
                        ...(l.fm?.r.slice(0, N_FORMA).map((x) => `${shortDateSlash(x[0])} · ${fmtToPar(x[1])} (${x[2]} b.)${x[3] ? ` · ${x[3]}º/${x[4]}` : ""}`) ?? []),
                      ].filter(Boolean).join("\n") || undefined}>
                        {fmd != null ? fmtToPar(fmd) : "–"}
                      </td>
                    )}
                    {tem.rfeg && (
                      <td title={l.sc?.rk ? `${l.sc.rk[2]}${l.sc.rk[3] ? ` · ranking de ${shortDateSlash(l.sc.rk[3], true)}` : ""}` : undefined}>
                        {l.sc?.rk ? `${l.sc.rk[0]}º/${l.sc.rk[1]}` : "–"}
                      </td>
                    )}
                    {nProva > 0 && (
                      <td style={SEP} title={l.rep?.avgToPar != null ? `Média ${fmtToPar(l.rep.avgToPar)} nas edições que acabou` : undefined}>
                        {l.rep ? l.rep.n : "–"}
                      </td>
                    )}
                    {nProva > 0 && <td>{l.rep?.bestPos != null ? `${l.rep.bestPos}º` : "–"}</td>}
                    {eds.map((e) => {
                      const c = l.rep?.byEd[e.id];
                      if (!c) return <td key={e.id}>–</td>;
                      return (
                        <td key={e.id}
                            title={[c.pos != null ? `${c.pos}º de ${c.field}` : null, c.total != null ? `${c.total}` : null, c.toPar != null ? fmtToPar(c.toPar) : null, c.complete ? null : "não acabou"].filter(Boolean).join(" · ")}
                            style={c.complete ? undefined : { fontStyle: "italic", color: "var(--text-3)" }}>
                          {c.pos != null ? `${c.pos}º` : "–"}
                        </td>
                      );
                    })}
                    {tem.vsm && <td style={SEP}>{nM ? `${l.atras} de ${nM}` : "–"}</td>}
                    {tem.vsm && <td>{l.vsMMedia != null ? `${l.vsMMedia > 0 ? "+" : l.vsMMedia < 0 ? "−" : ""}${Math.abs(Math.round(l.vsMMedia))}` : "–"}</td>}
                    {tem.prox && (
                      <td style={SEP} title={l.proximas.map((x) => `${x.name} · ${x.escalao} (${shortDateSlash(x.date)})`).join("\n") || undefined}>
                        {l.proximas.length || "–"}
                      </td>
                    )}
                    {colsDepois.map(extraTd(l))}
                  </tr>
                  {isOpen && (
                    <tr>
                      <td colSpan={nCols} style={{ textAlign: "left", background: "var(--bg-hover)", padding: "6px 10px 12px 28px" }}>
                        {detExtra && <div style={{ marginBottom: 8 }}>{detExtra}</div>}
                        {nM ? (
                          <table className="sc-lb" style={{ width: "max-content", marginBottom: 6 }}>
                            <thead><tr><th style={{ textAlign: "left" }}>Prova em comum com o Manuel</th><th>Data</th><th>{l.name.split(" ")[0]}</th><th>Manuel</th><th title="Pancadas dele − Manuel">Pancadas</th></tr></thead>
                            <tbody>
                              {l.sc!.m!.map((x, i) => (
                                <tr key={i}>
                                  <td style={{ textAlign: "left" }}>{x[1]}</td>
                                  <td>{x[0] ? shortDateSlash(x[0]) : "–"}</td>
                                  <td>{x[2] != null ? `${x[2]}º` : "–"}</td>
                                  <td>{x[3] != null ? `${x[3]}º` : "–"}</td>
                                  <td>{x[4] > 0 ? "+" : x[4] < 0 ? "−" : ""}{Math.abs(x[4])}</td>
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
      {rodape}
    </div>
  );
}
