/**
 * src/ui/circuit/Scout.tsx — aba «Scout» dos torneios (20/10/2026).
 *
 * O field de hoje, um jogador por linha, com tudo o que interessa saber antes
 * da prova: o que cada um fez NESTA prova nas edições anteriores (era a aba
 * «Quem repete») e a carreira — nível, vitórias, HCP, idade, forma, confrontos
 * com o Manuel e próximas inscrições (era o Scout do kids2, que carregava
 * ~180 MB; agora lê o resumo juniors-scout.json, que traz também a forma).
 * Clicar numa linha abre os últimos torneios, as provas em comum com o Manuel
 * e as próximas.
 *
 * Os últimos torneios (02/11/2026) juntam o Kids 2 e as provas de clube dos
 * cartões FPG (Aberto do Estoril, Jamor Summer Series…), com o nome, as
 * pancadas, o ±par e o SD oficial — util/ultimos.js do agregador.
 *
 * Desenho de 02/11/2026 (pedido da Mariana: «precisa nitidamente de uma grande
 * melhoria»), no estilo da «Época» da /drive: escalão com o selo do ano de
 * nascimento, nível como etiqueta, o ÚLTIMO ANO (torneios, vitórias, pódios e
 * os últimos lugares em caixinhas) em vez da carreira toda, o saldo com o
 * Manuel por extenso e as pancadas POR VOLTA (só voltas que os dois jogaram),
 * filtros e linhas verticais entre os blocos.
 *
 * Usado no CircuitShell (todas as provas dos circuitos), na /uskids e no kids2
 * (Próximos torneios). Modelo de tabela do scorecard (.sc-lb), ordenável.
 */
import React, { useContext, useMemo, useState } from "react";
import { KidsLinkCtx, KidsLink } from "../KidsLink";
import { useJson } from "../../hooks/useJson";
import { normName } from "../../utils/normName";
import { useSort } from "../../hooks/useSort";
import SortableHdr from "../SortableHdr";
import EmptyState from "../EmptyState";
import LoadingState from "../LoadingState";
import { fmtToPar, isoDate, shortDateSlash, todayIso, fmtHcp, escalaoAtDate, fmtOrd, shortTournamentName } from "../../utils/format";
import { clubFlagPrefix, flag } from "../../utils/flagUtils";
import { isManuel as isManuelPlayer } from "../../constants/manuel";
import { useFedBirthdates } from "../InscricoesComponents";
import TierBadge from "../TierBadge";
import { medalClass } from "../PosBadge";
import { AnoEscalaoPill } from "../AnoEscalaoPill";
import { SDPill } from "../tournamentPrimitives";
import { RowsFilterBar, filterRows, type FilterableRow } from "../PlayerFilterBar";
import { EMPTY_FILTER } from "../multiRoundTypes";
import type { PlayerFilter } from "../../data/fpgTypes";
import { compareEscalao } from "../../data/model/escalao";
import { buildRepeaters, type FieldPlayer, type RepeaterRow } from "./repeaters";
import type { PastEdition } from "./PastEditionsTable";
import {
  computeThreat, formaMedia, idade, N_FORMA, THREAT_LABEL, porVolta, ultimoLugar, ultimosTorneios,
  previsaoRival, fraseConfrontos, escalaoDaProva, FONTE_PREVISAO_LABEL, escalaPorComparacoes,
  worldChampionship, resultadoNotavel,
  type JuniorScout, type ScoutComManuel, type ScoutFile, type ScoutTorneio, type ThreatInfo, type Previsao,
  nivelPoucoSeguro,
} from "./scoutModel";
import KpiCard from "../KpiCard";
import { decodeRanking, type RankingRow } from "../../pages/kids2/juniorCalc";

interface UskFieldFile {
  torneios?: Array<{ t: number; name: string; date_inicio?: string; escaloes?: Array<{ nome: string; jogadores?: Array<{ nome: string }> | null }> }>;
}
interface Proxima { t: number; name: string; date: string; escalao: string }

const TIER_ORD: Record<string, number> = { elite: 0, strong: 1, solid: 2, developing: 3, beginner: 4 };

/** Inscrições futuras USKids por nome normalizado. */
function proximasPorNome(d: UskFieldFile): Map<string, Proxima[]> {
  const hoje = todayIso();
  const out = new Map<string, Proxima[]>();
  for (const t of d.torneios ?? []) {
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
  return out;
}
const SEM_PROXIMAS = new Map<string, Proxima[]>();
const SEM_SCOUT: ScoutFile = { players: {} };

/** Inscrições futuras USKids por nome (uskids-field.json, ~2 MB); sem ficheiro → vazio. */
function useProximas(): Map<string, Proxima[]> | null {
  const { data, loading } = useJson<UskFieldFile, Map<string, Proxima[]>>("/data/uskids-field.json", proximasPorNome);
  return loading ? null : (data ?? SEM_PROXIMAS);
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
  sc?: JuniorScout; ult: ScoutTorneio[]; rep?: RepeaterRow;
  idade: number | null; threat: ThreatInfo; frente: number; atras: number; vsMMedia: number | null;
  /** Nascimento (ISO, ou só o ano) e o escalão deste ano (`escProva`: tirado
   *  do escalão USKids da prova, sem nascimento conhecido). */
  nasc: string | null; escalao: string | null; escProva?: boolean;
  /** Previsão em relação ao Manuel (escala por comparações → índice → média). */
  prev: Previsao | null;
  /** Ficha do Kids 2, percentil na geração e nº de provas em comum que entraram. */
  kidId?: string; pct?: number | null; provasComuns?: number;
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
  colsAntes = [], colsDepois = [], detalheExtra, resumoExtra, rodape, semHcp, ordemInicial, provasComManuel, escalaoProva,
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
  /** Escalão da prova («Boys 12»…): o escalão de quem não tem nascimento conhecido. */
  escalaoProva?: string | null;
}) {
  const kidsMap = useContext(KidsLinkCtx);
  const scoutJson = useJson<ScoutFile>("/data/juniors-scout.json");
  const scout = scoutJson.loading ? null : (scoutJson.data ?? SEM_SCOUT);
  // O Nível (percentil na geração, pelas pancadas do último ano).
  const ranking = useMemo(() => {
    const rows: [string, RankingRow][] = [];
    for (const [id, p] of Object.entries(scout?.players ?? {})) if (p.r) rows.push([id, p.r]);
    return decodeRanking(rows);
  }, [scout]);
  const proximas = useProximas();
  // Idade: a do Kids 2 e, sem ela, a da base de federados (que tem todos os da FPG).
  const fedBirthdates = useFedBirthdates();
  const [aberto, setAberto] = useState<string | null>(null);
  const [filter, setFilter] = useState<PlayerFilter>(EMPTY_FILTER);

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
      // Pancadas por volta de 18 buracos, só nas voltas que os dois jogaram.
      const vsMMedia = porVolta(m);
      const threat = isManuel
        ? { score: -99, level: "none" as const, reasons: [] }
        : computeThreat({
            hasManuel: true, vsMTotal: vsMMedia, vsMCount: m.length, vsMSameFlight: sc?.mf ?? 0,
            tier: sc?.t ?? null, recentPos: ultimoLugar(sc?.u), wins: sc?.w ?? 0,
          });
      // Nascimento: o do Kids 2, o que a prova traz, ou o da base de federados —
      // pelo federado da prova ou, sem ele (o scrape do Drive às vezes não o
      // traz), pelo da ficha do Kids 2.
      const fedNasc = p.fed || (!outraPessoa ? kid?.fed : null);
      const nasc = sc?.d ?? p.dob ?? (fedNasc ? fedBirthdates.get(fedNasc) : undefined) ?? null;
      out.push({
        key: k, name: p.name, club: p.club ?? sc?.c ?? null, country: p.country ?? null, isManuel, sc, ult: ultimosTorneios(sc?.u, scout.tn), rep: rr,
        idade: nasc ? idade(nasc) ?? (/^\d{4}$/.test(nasc) ? new Date().getFullYear() - +nasc : null) : null,
        nasc, escalao: nasc ? escalaoAtDate(nasc, todayIso()) : escalaoDaProva(escalaoProva),
        escProva: !nasc && !!escalaoDaProva(escalaoProva),
        prev: null,
        threat, frente, atras, vsMMedia,
        // As inscrições USKids são por nome: um homónimo (outro federado) não as herda.
        proximas: outraPessoa ? [] : (proximas?.get(k) ?? []).filter((x) => x.t !== tCode),
        fed: p.fed ?? null,
        kidId: id,
      });
    }
    // Previsão de cada um em relação ao Manuel (04/11/2026):
    //  1. a escala pelas provas em comum (com o Manuel e entre eles), cada uma
    //     pesada pela força da prova — a regra do índice do jogador;
    //  2. sem provas em comum: o Nível em pancadas (nivelPancadas.ts, último ano) —
    //     a diferença para o do Manuel já está em pancadas (05/11/2026);
    //  3. sem índice: a média ao par do ano, e por fim o handicap.
    // O ±par de referência é o do Manuel no último ano.
    const man = out.find((l) => l.isManuel);
    const ref = { toParAno: man?.sc?.v?.[3] ?? null, hcp: man?.sc?.h ?? null };
    const desde = (() => { const d = new Date(todayIso()); d.setMonth(d.getMonth() - 18); return d.toISOString().slice(0, 10); })();
    const esc = escalaPorComparacoes(out.map((l) => ({ key: l.key, isManuel: l.isManuel, u: l.sc?.u, m: l.sc?.m })), desde);
    const pct = (l: Linha) => (l.kidId ? ranking.get(l.kidId)?.percentile ?? null : null);
    const nivel = (l: Linha) => (l.kidId ? ranking.get(l.kidId)?.nivel ?? null : null);
    const nivelManuel = man ? nivel(man) : null;
    const r1 = (x: number) => Math.round(x * 10) / 10;
    for (const l of out) {
      if (l.isManuel) {
        l.prev = ref.toParAno != null ? { toPar: r1(ref.toParAno), vsManuel: 0, fonte: "media" } : null;
        continue;
      }
      const e2 = esc.get(l.key);
      const p = pct(l);
      if (e2 && e2.provas > 0) {
        l.prev = { toPar: r1((ref.toParAno ?? 0) + e2.vsManuel), vsManuel: e2.vsManuel, fonte: "comparacoes" };
        l.provasComuns = e2.provas;
      } else if (nivel(l) != null && nivelManuel != null) {
        const v = r1(nivel(l)! - nivelManuel);
        l.prev = { toPar: r1((ref.toParAno ?? 0) + v), vsManuel: v, fonte: "nivel" };
      } else {
        l.prev = previsaoRival({ vsMMedia: null, nConfrontos: 0, toParAno: l.sc?.v?.[3] ?? null, hcp: l.sc?.h ?? null }, ref);
      }
      l.pct = p;
    }
    return out;
  }, [field, scout, rep, kidsMap, proximas, tCode, provasComManuel, fedBirthdates, escalaoProva, ranking]);

  const extras = useMemo(() => [...colsAntes, ...colsDepois], [colsAntes, colsDepois]);
  const { sortKey, sortDir, toggleSort } = useSort<string>(
    ordemInicial?.key ?? (manuelNoField ? "prev" : "tier"),
    ordemInicial?.dir ?? "asc", {
    prev: "asc", vsman: "asc",
    name: "asc", idade: "asc", esc: "asc", hcp: "asc", tier: "asc", nivel: "desc", torn: "desc", vit: "desc", pod: "desc", media: "asc", melhor: "asc", forma: "asc", ult: "desc",
    rfeg: "asc", n: "desc", best: "asc", vsm: "desc", vsmp: "asc", prox: "desc",
    ...Object.fromEntries(extras.map((c) => [c.key, c.dir ?? "asc"])),
  });
  const ordenadas = useMemo(() => {
    const val = (l: Linha): number | string | null => {
      switch (sortKey) {
        case "name": return l.name;
        case "prev": return l.prev?.toPar ?? null;
        case "vsman": return l.prev?.vsManuel ?? null;
        case "idade": return l.idade;
        case "esc": return l.escalao || null;
        case "hcp": return l.sc?.h ?? null;
        case "tier": return l.sc?.t ? TIER_ORD[l.sc.t] : null;
        case "nivel": return l.isManuel ? null : l.threat.score;
        case "torn": return l.sc?.a?.[0] ?? null;
        case "vit": return l.sc?.a?.[1] ?? null;
        case "pod": return l.sc?.a?.[2] ?? null;
        case "media": return l.sc?.v ? l.sc.v[3] ?? l.sc.v[1] : null; // sem par oficial: pelas pancadas, depois dos outros (semPar)
        case "melhor": return l.sc?.v ? l.sc.v[4] ?? l.sc.v[2] : null; // pelo ±par; sem par oficial: idem
        case "forma": return formaMedia(l.sc?.u);
        case "ult": return l.ult[0]?.data ?? null;
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
    // «Média»/«Melhor» sem par oficial ficam depois dos que o têm, nas duas direcções.
    const semPar = (l: typeof linhas[number]) =>
      sortKey === "media" ? l.sc?.v?.[3] == null : sortKey === "melhor" ? l.sc?.v?.[4] == null : false;
    const dir = sortDir === "asc" ? 1 : -1;
    return [...linhas].sort((a, b) => {
      // O Manuel fica em cima, como referência — menos na ordem da previsão,
      // onde aparece no lugar previsto dele.
      if (a.isManuel !== b.isManuel && sortKey !== "prev" && sortKey !== "vsman") return a.isManuel ? -1 : 1;
      const va = val(a), vb = val(b);
      if (va == null && vb == null) return a.name.localeCompare(b.name);
      if (va == null) return 1;
      if (vb == null) return -1;
      if (semPar(a) !== semPar(b)) return semPar(a) ? 1 : -1;
      const c = sortKey === "esc" ? compareEscalao(String(va), String(vb))
        : typeof va === "string" ? va.localeCompare(String(vb)) : (va as number) - (vb as number);
      return c * dir || a.name.localeCompare(b.name);
    });
  }, [linhas, sortKey, sortDir, extras]);

  // A barra de filtros de jogadores do site: nome/clube, escalão, clube e ano de nascimento.
  const filtraveis = useMemo(() => ordenadas.map((l): FilterableRow & { key: string } => ({
    key: l.key, name: l.name, club: l.club ?? "", esc: l.escalao ?? undefined, fed: l.fed ?? undefined,
    dob: l.nasc && /^\d{4}-\d{2}-\d{2}/.test(l.nasc) ? l.nasc : null,
  })), [ordenadas]);
  const visiveis = useMemo(() => {
    const ok = new Set(filterRows(filtraveis, filter).map((x) => x.key));
    return ordenadas.filter((l) => l.isManuel || ok.has(l.key));
  }, [ordenadas, filtraveis, filter]);

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
  // Blocos: Perfil · Último ano · Nesta prova · Com o Manuel · Próximos (+ os da
  // página, ex.: FPG). Colunas sem dados não aparecem; cada bloco abre com uma
  // linha vertical (.scout-sep). A ameaça é a ordem por omissão e o pontinho no Nível.
  const tem = {
    esc: linhas.some((l) => l.escalao),
    hcp: !semHcp && linhas.some((l) => l.sc?.h != null),
    torn: linhas.some((l) => l.sc?.a?.[0]),
    vit: linhas.some((l) => l.sc?.a?.[1]),
    pod: linhas.some((l) => l.sc?.a?.[2]),
    voltas: linhas.some((l) => l.sc?.v),
    forma: linhas.some((l) => l.ult.length > 0),
    vsm: linhas.some((l) => l.sc?.m?.length),
    prox: linhas.some((l) => l.proximas.length),
    prev: manuelNoField && linhas.some((l) => !l.isManuel && l.prev),
  };
  const sameYear = (e: PastEdition) => eds.some((o) => o !== e && o.year === e.year);
  const hp = { sortKey, sortDir, onSort: toggleSort };
  const nPerfil = (tem.esc ? 1 : 0) + (tem.hcp ? 1 : 0) + 1;
  const nAno = (tem.torn ? 1 : 0) + (tem.vit ? 1 : 0) + (tem.pod ? 1 : 0) + (tem.voltas ? 2 : 0) + (tem.forma ? 1 : 0);
  const nProva = eds.length ? 2 + eds.length : 0;
  const nManuel = tem.vsm ? 1 : 0;
  const nPrev = tem.prev ? 2 : 0;
  const nCols = colsAntes.length + 1 + nPrev + nPerfil + nAno + nProva + nManuel + (tem.prox ? 1 : 0) + colsDepois.length;
  // Os 5 a vigiar: os que se prevê ficarem mais à frente do Manuel (e, a seguir,
  // os de maior ameaça) — com o porquê.
  const vigiar = manuelNoField
    ? [...rivais].sort((a, b) => {
        const va = a.prev?.vsManuel ?? null, vb = b.prev?.vsManuel ?? null;
        if (va != null && vb != null && va !== vb) return va - vb;
        if (va != null && vb == null) return -1;
        if (va == null && vb != null) return 1;
        return b.threat.score - a.threat.score;
      }).slice(0, 5)
    : [];
  const aFrente = rivais.filter((l) => l.prev?.vsManuel != null && l.prev.vsManuel < 0).length;
  const comPrev = rivais.filter((l) => l.prev?.vsManuel != null).length;
  const ganhouAoManuel = rivais.filter((l) => (l.sc?.m?.length ?? 0) > 0 && l.atras > l.frente).length;
  const fmtVs = (v: number) => `${Math.abs(v).toFixed(1)} por volta ${v < 0 ? "à frente" : "atrás"} do Manuel`;
  // Blocos das colunas da página (cada coluna diz o seu grupo; seguidas = um bloco).
  const blocosDepois: { grupo: string; n: number }[] = [];
  for (const c of colsDepois) {
    const g = c.grupo ?? "";
    const ult = blocosDepois[blocosDepois.length - 1];
    if (ult && ult.grupo === g) ult.n++; else blocosDepois.push({ grupo: g, n: 1 });
  }
  const hdr = (k: string, label: React.ReactNode, title?: string, sep?: boolean) =>
    <SortableHdr k={k} {...hp} title={title} className={sep ? "scout-sep" : undefined}>{label}</SortableHdr>;
  const extraHdr = (c: ScoutExtraCol, i: number, arr: ScoutExtraCol[]) => {
    const sep = i === 0 || (arr[i - 1].grupo ?? "") !== (c.grupo ?? "");
    return c.sort
      ? <SortableHdr key={c.key} k={c.key} {...hp} title={c.title} className={sep ? "scout-sep" : undefined}>{c.label}</SortableHdr>
      : <th key={c.key} title={c.title} className={sep ? "scout-sep" : undefined}>{c.label}</th>;
  };
  const extraTd = (l: Linha) => (c: ScoutExtraCol, i: number, arr: ScoutExtraCol[]) => {
    const sep = i === 0 || (arr[i - 1].grupo ?? "") !== (c.grupo ?? "");
    return <td key={c.key} className={sep ? "scout-sep" : undefined}>{c.cell(l.name)}</td>;
  };
  // Separador do 1.º de cada bloco (a 1.ª coluna que aparece).
  const sepPerfil = { esc: tem.esc, hcp: !tem.esc && tem.hcp, nivel: !tem.esc && !tem.hcp };
  const sepAno = { torn: tem.torn, vit: !tem.torn && tem.vit, pod: !tem.torn && !tem.vit && tem.pod,
    voltas: !tem.torn && !tem.vit && !tem.pod && tem.voltas, forma: !tem.torn && !tem.vit && !tem.pod && !tem.voltas };
  const lugar = (pos: number | null | undefined, title?: string, field?: number | null) => pos != null
    ? <span className={"pos-medal pos-medal-sm " + medalClass(pos)} title={title}>{fmtOrd(pos)}{field ? <span className="scout-field">/{field}</span> : null}</span>
    : <span className="scout-sem" title={title}>–</span>;
  // Um dos últimos torneios numa caixinha: o lugar quando há classificação, «WD»
  // quando não acabou, e nas provas de clube (sem classificação) o ±par.
  const caixaTorneio = (x: ScoutTorneio) => {
    const title = [shortDateSlash(x.data), x.nome,
      x.lugar != null ? `${fmtOrd(x.lugar)}${x.field ? ` de ${x.field}` : ""}` : x.estado ?? "prova de clube (sem classificação)",
      x.pancadas != null ? `${x.pancadas} pancadas${x.voltas > 1 ? ` em ${x.voltas} voltas` : ""}${x.toPar != null ? ` (${fmtToPar(x.toPar)})` : ""}` : null,
      x.sd != null ? `SD ${x.sd.toFixed(1)}` : null].filter(Boolean).join(" · ");
    if (x.lugar != null) return lugar(x.lugar, title, x.field);
    if (x.estado) return <span className="scout-wd" title={title}>{x.estado}</span>;
    return <span className="scout-clubpar" title={title}>{x.toPar != null ? fmtToPar(x.toPar) : x.pancadas ?? "–"}</span>;
  };

  return (
    <div className="scout">
      {/* KPIs no topo (o mesmo aspecto da Previsão — 04/11/2026) */}
      <div className="kpi-row kpi-row-4">
        <KpiCard label={manuelNoField ? "Adversários" : "Jogadores"} value={rivais.length}
          sub={[paises > 1 ? `${paises} países` : null, `${altos} de nível alto`].filter(Boolean).join(" · ")} />
        {manuelNoField && <KpiCard label="À frente do Manuel (previsto)" value={comPrev ? `${aFrente} de ${comPrev}` : "–"} color="var(--color-danger)"
          sub="pelas provas em comum, pesadas pela força da prova, ou pelo Nível em pancadas" />}
        <KpiCard label="Já jogaram com o Manuel" value={comManuel}
          sub={manuelNoField && comManuel ? `${ganhouAoManuel} ganharam-lhe mais vezes do que perderam` : undefined} />
        <KpiCard label="Já jogaram esta prova" value={edsTodas.length ? repetem : "–"}
          sub={edsTodas.length ? `${edsTodas.length} edi${edsTodas.length === 1 ? "ção anterior" : "ções anteriores"}` : "sem edições anteriores"} />
      </div>
      {resumoExtra && <div className="lb-info-line scout-resumo">{resumoExtra}</div>}

      {/* Os 5 a vigiar — cartões pequenos, com o que interessa sobre o jogador
          (04/11/2026: «estes cards estão enormes e não dizem nada de relevante»):
          o previsto, o World, as vitórias do ano e o resultado mais notável. */}
      {vigiar.length > 0 && (
        <div className="scout-vigiar">
          {vigiar.map((l, i) => {
            const w = worldChampionship(l.ult);
            const nota = resultadoNotavel(l.ult);
            const paisV = l.country ? flag(l.country) : l.sc?.p ? flag(l.sc.p) : "";
            return (
              <div key={l.key} className="scout-vig"
                title={l.prev ? `±par previsto num dia normal, ${FONTE_PREVISAO_LABEL[l.prev.fonte]}${l.prev.vsManuel != null ? ` — ${fmtVs(l.prev.vsManuel)}` : ""}` : undefined}>
                <div className="scout-vig-top">
                  <span className="scout-vig-n">{i + 1}</span>
                  <span className="scout-vig-nome">{paisV && paisV !== "🏳️" ? paisV + " " : ""}{l.name}</span>
                  {l.sc?.t && <TierBadge tier={l.sc.t} incerto={nivelPoucoSeguro(l.sc)} />}
                </div>
                <div className="scout-vig-prev">
                  <b className={l.prev?.vsManuel != null && l.prev.vsManuel < 0 ? "tone-bad" : undefined}>{l.prev ? fmtToPar(l.prev.toPar) : "–"}</b>
                  <span className="muted fs-11"> previsto</span>
                </div>
                <div className="scout-vig-factos">
                  {w && <span className="p p-sm p-world" title={`World Championship ${w.ano}${w.lugar != null ? ` — ${fmtOrd(w.lugar)}${w.field ? ` de ${w.field}` : ""}` : w.estado ? ` — ${w.estado}` : ""}`}>🌍 World {w.ano.slice(2)}{w.lugar != null ? ` · ${fmtOrd(w.lugar)}` : ""}</span>}
                  {(l.sc?.a?.[1] ?? 0) > 0 && <span className="p p-sm p-muted" title="Vitórias nos últimos 12 meses">{l.sc!.a![1]} vit.</span>}
                  {nota && <span className="p p-sm p-muted" title={`${nota.nome} (${shortDateSlash(nota.data)})`}>{shortTournamentName(nota.nome, { max: 22 })} {fmtOrd(nota.lugar!)}/{nota.field}</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}
      <RowsFilterBar rows={filtraveis} filter={filter} onChange={setFilter} total={filtraveis.length} />
      <div className="u-ox-auto u-pb-6px">
        <table className="sc-lb scout-table u-fvn-tabular-nums u-w-max-content">
          <thead>
            <tr>
              {colsAntes.length > 0 && <th colSpan={colsAntes.length} />}
              <th />
              {nPrev > 0 && <th colSpan={nPrev} className="scout-grp scout-sep" title="Num dia normal, em relação ao Manuel">Previsão</th>}
              <th colSpan={nPerfil} className="scout-grp scout-sep">Perfil</th>
              {nAno > 0 && <th colSpan={nAno} className="scout-grp scout-sep" title="Os últimos 12 meses">Último ano</th>}
              {nProva > 0 && <th colSpan={nProva} className="scout-grp scout-sep">Nesta prova</th>}
              {nManuel > 0 && <th colSpan={nManuel} className="scout-grp scout-sep">Com o Manuel</th>}
              {tem.prox && <th className="scout-grp scout-sep">Próximos</th>}
              {blocosDepois.map((b, i) => <th key={i} colSpan={b.n} className="scout-grp scout-sep">{b.grupo}</th>)}
            </tr>
            <tr>
              {colsAntes.map(extraHdr)}
              <SortableHdr k="name" {...hp} className="u-ta-left">Jogador</SortableHdr>
              {tem.prev && hdr("prev", <>±par<br />previsto</>, "±par por volta de 18 buracos num dia normal, em relação ao Manuel (o ±par médio dele no último ano). Pelas provas em comum — com o Manuel e entre os jogadores do field — cada uma pesada pela força da prova (a regra do índice do jogador: voltas, field e países). Quem não tem provas em comum fica pelo Nível em pancadas (último ano), em relação ao do Manuel. A fonte está em cada linha.", true)}
              {tem.prev && hdr("vsman", <>vs<br />Manuel</>, "Pancadas por volta a menos (à frente) ou a mais (atrás) do que o Manuel")}
              {tem.esc && hdr("esc", "Escalão", "Escalão deste ano e o ano de nascimento (1.º ou 2.º ano do escalão); a idade no tooltip", sepPerfil.esc)}
              {tem.hcp && hdr("hcp", "HCP", "Handicap (Portugal / Espanha / França)", sepPerfil.hcp)}
              {hdr("nivel", "Nível", "Nível na geração pelas pancadas do último ano (Elite, Forte, Sólido, Em Dev., Iniciante; «?» = poucas voltas); o pontinho é a ameaça para o Manuel. Ordenar por aqui põe primeiro os mais perigosos — o porquê está no tooltip de cada um.", sepPerfil.nivel)}
              {tem.torn && hdr("torn", "Torn.", "Torneios nos últimos 12 meses (todas as fontes)", sepAno.torn)}
              {tem.vit && hdr("vit", "Vit.", "Vitórias nos últimos 12 meses", sepAno.vit)}
              {tem.pod && hdr("pod", "Pódios", "Pódios (1.º a 3.º) nos últimos 12 meses", sepAno.pod)}
              {tem.voltas && hdr("media", "Média", "Média por volta de 18 buracos no último ano: ±par (quando há o par oficial) e as pancadas; quantas voltas no tooltip", sepAno.voltas)}
              {tem.voltas && hdr("melhor", "Melhor", "Melhor volta de 18 buracos no último ano — a de melhor ±par (Kids 2 e provas de clube FPG)")}
              {tem.forma && hdr("forma", "Últimos torneios", `Os últimos ${N_FORMA} torneios (Kids 2 e provas de clube FPG), o mais recente à esquerda: lugar / jogadores, ou o ±par nas provas de clube, que não têm classificação. O torneio, as pancadas e o SD no tooltip; tudo no detalhe (clicar na linha). Ordena pelo ±par médio.`, sepAno.forma)}
              {nProva > 0 && hdr("n", "Vezes", "Quantas edições anteriores desta prova jogou", true)}
              {nProva > 0 && hdr("best", "Melhor", "Melhor lugar numa edição anterior desta prova")}
              {eds.map((e) => (
                <SortableHdr key={e.id} k={e.id} {...hp} title={[e.label, e.division, e.course].filter(Boolean).join(" · ")}>
                  {e.year}
                  {sameYear(e) && e.label ? <div className="fs-10 muted u-fw-500">{e.label}</div> : null}
                </SortableHdr>
              ))}
              {tem.vsm && hdr("vsmp", "Confrontos", "Nas provas em comum: quem ficou à frente mais vezes e por quantas pancadas por volta de 18 buracos (só as voltas que os dois jogaram); a última prova em comum por baixo", true)}
              {tem.prox && hdr("prox", "Torneios", "Próximos torneios USKids em que está inscrito (a lista no tooltip)", true)}
              {colsDepois.map(extraHdr)}
            </tr>
          </thead>
          <tbody>
            {visiveis.map((l) => {
              const isOpen = aberto === l.key;
              // Bandeira: a do clube, senão o país que a prova publica, senão o do kids2.
              const paisFlag = l.country ? flag(l.country) : "";
              const bandeira = clubFlagPrefix(l.club) || (paisFlag && paisFlag !== "🏳️" ? paisFlag + " " : "") || (l.sc?.p ? flag(l.sc.p) + " " : "");
              // Clube sem a bandeira do início (quando o «clube» é só a bandeira, fica vazio).
              const clube = (l.club || "").replace(/^[\u{1F1E6}-\u{1F1FF}\u{1F3F4}][\u{1F1E6}-\u{1F1FF}\u{E0000}-\u{E007F}]*\s*/u, "").trim();
              const mostraClube = clube && !/^[A-Z]{2,3}(-[A-Z]{2,4})?$/.test(clube);
              const fmd = formaMedia(l.sc?.u);
              const ultimos = l.ult.slice(0, N_FORMA);
              const detExtra = detalheExtra?.(l.name) ?? null;
              const temDetalhe = !!(l.ult.length || l.sc?.m?.length || l.proximas.length || detExtra);
              const nM = l.sc?.m?.length ?? 0;
              const empates = nM - l.frente - l.atras;
              const ameaca = !l.isManuel && l.threat.level !== "none" ? l.threat.level : null;
              return (
                <React.Fragment key={l.key}>
                  <tr className={[l.isManuel ? "row-manuel" : "", temDetalhe ? "scout-clicavel" : "", isOpen ? "is-aberto" : ""].filter(Boolean).join(" ") || undefined}
                      onClick={temDetalhe ? () => setAberto(isOpen ? null : l.key) : undefined}
                      title={temDetalhe ? "Ver o detalhe: últimos torneios, provas em comum com o Manuel e próximas inscrições" : undefined}>
                    {colsAntes.map(extraTd(l))}
                    <td className="u-ta-left scout-jog">
                      <span className={l.isManuel ? "fw-700" : "fw-600"}>{bandeira}{l.name}</span> <KidsLink nome={l.name} fed={l.fed} />
                      {(() => {
                        const w = worldChampionship(l.ult);
                        return w ? <span className="p p-sm p-world u-ml-4px" title={`Foi ao World Championship ${w.ano}${w.lugar != null ? ` — ${fmtOrd(w.lugar)}${w.field ? ` de ${w.field}` : ""}` : w.estado ? ` — ${w.estado}` : ""}`}>🌍 World {w.ano.slice(2)}{w.lugar != null ? ` · ${fmtOrd(w.lugar)}` : ""}</span> : null;
                      })()}
                      {mostraClube && <div className="scout-clube">{clube}</div>}
                    </td>
                    {tem.prev && (
                      <td className="scout-sep" title={l.prev ? `num dia normal, ${FONTE_PREVISAO_LABEL[l.prev.fonte]}` : undefined}>
                        {l.prev
                          ? <span className="scout-media"><b className={l.prev.toPar <= 0 ? "c-good" : undefined}>{fmtToPar(l.prev.toPar)}</b>
                              <span className="scout-sub">{l.isManuel ? "referência" : l.prev.fonte === "comparacoes" ? `${l.provasComuns} comparaç${l.provasComuns === 1 ? "ão" : "ões"}` : l.prev.fonte === "nivel" ? `nível (top ${100 - (l.pct ?? 0)}%)` : l.prev.fonte === "media" ? "média do ano" : l.prev.fonte === "confrontos" ? "confrontos" : "handicap"}</span></span>
                          : <span className="scout-sem">–</span>}
                      </td>
                    )}
                    {tem.prev && (
                      <td>
                        {l.isManuel ? <span className="scout-sem">—</span>
                          : l.prev?.vsManuel != null
                            ? <span className={"scout-topar" + (l.prev.vsManuel > 0.05 ? " is-good" : l.prev.vsManuel < -0.05 ? " is-bad" : "")}>{l.prev.vsManuel > 0 ? "+" : l.prev.vsManuel < 0 ? "−" : ""}{Math.abs(l.prev.vsManuel).toFixed(1)}</span>
                            : <span className="scout-sem">–</span>}
                      </td>
                    )}
                    {tem.esc && (
                      <td className={sepPerfil.esc ? "scout-sep" : undefined} title={l.idade != null ? `${l.idade} anos` : l.escProva ? `Pelo escalão da prova (${escalaoProva}) — sem data de nascimento conhecida` : undefined}>
                        {l.escalao ? <span className="u-ws-nowrap">{l.escalao} {l.nasc && <AnoEscalaoPill dob={l.nasc} escalao={l.escalao} />}</span> : <span className="scout-sem">–</span>}
                      </td>
                    )}
                    {tem.hcp && (
                      <td className={sepPerfil.hcp ? "scout-sep" : undefined}
                          title={l.sc?.hr ? `Handicap oficial da Federação Espanhola${l.sc.hr[1] ? ` — actualizado a ${shortDateSlash(l.sc.hr[1], true)}` : ""}` : undefined}>
                        {l.sc?.h != null ? <span className="fw-600">{fmtHcp(l.sc.h)}</span> : <span className="scout-sem">–</span>}
                      </td>
                    )}
                    <td className={sepPerfil.nivel ? "scout-sep" : undefined}>
                      {l.sc?.t
                        ? <span className="scout-nivel">
                            <TierBadge tier={l.sc.t} incerto={nivelPoucoSeguro(l.sc)} title={ameaca ? `Ameaça ${THREAT_LABEL[ameaca]} para o Manuel — ${l.threat.reasons.join(" · ")}` : undefined} />
                            {ameaca && <span className={"scout-ameaca is-" + ameaca} title={`Ameaça ${THREAT_LABEL[ameaca]} para o Manuel`} />}
                          </span>
                        : <span className="scout-sem">–</span>}
                    </td>
                    {tem.torn && <td className={sepAno.torn ? "scout-sep" : undefined}>{l.sc?.a?.[0] || <span className="scout-sem">–</span>}</td>}
                    {tem.vit && <td className={sepAno.vit ? "scout-sep" : undefined}>{l.sc?.a?.[1] ? <b>{l.sc.a[1]}</b> : <span className="scout-sem">–</span>}</td>}
                    {tem.pod && <td className={sepAno.pod ? "scout-sep" : undefined}>{l.sc?.a?.[2] || <span className="scout-sem">–</span>}</td>}
                    {tem.voltas && (
                      <td className={sepAno.voltas ? "scout-sep" : undefined}
                          title={l.sc?.v ? `${l.sc.v[0]} volta${l.sc.v[0] > 1 ? "s" : ""} de 18 buracos · média ${l.sc.v[1].toFixed(1)} pancadas${l.sc.v[3] != null ? ` (${fmtToPar(l.sc.v[3])})` : ""}` : undefined}>
                        {l.sc?.v
                          ? <span className="scout-media">
                              {l.sc.v[3] != null && <b className={l.sc.v[3] <= 0 ? "c-good" : undefined}>{fmtToPar(l.sc.v[3])}</b>}
                              <span className={l.sc.v[3] != null ? "scout-sub" : "fw-600"}>{l.sc.v[1].toFixed(1)}</span>
                            </span>
                          : <span className="scout-sem">–</span>}
                      </td>
                    )}
                    {tem.voltas && (
                      <td>{l.sc?.v
                        ? <span className="scout-media"><b>{l.sc.v[2]}</b>{l.sc.v[4] != null && <span className="scout-sub">{fmtToPar(l.sc.v[4])}</span>}</span>
                        : <span className="scout-sem">–</span>}</td>
                    )}
                    {tem.forma && (
                      <td className={sepAno.forma ? "scout-sep" : undefined}>
                        {ultimos.length
                          ? <span className="scout-forma" title={fmd != null ? `±par médio por 18 buracos nestes torneios: ${fmtToPar(fmd)}` : undefined}>
                              {ultimos.map((x, i) => <React.Fragment key={i}>{caixaTorneio(x)}</React.Fragment>)}
                            </span>
                          : <span className="scout-sem">–</span>}
                      </td>
                    )}
                    {nProva > 0 && (
                      <td className="scout-sep" title={l.rep?.avgToPar != null ? `Média ${fmtToPar(l.rep.avgToPar)} nas edições que acabou` : undefined}>
                        {l.rep ? l.rep.n : <span className="scout-sem">–</span>}
                      </td>
                    )}
                    {nProva > 0 && <td>{l.rep?.bestPos != null ? lugar(l.rep.bestPos) : <span className="scout-sem">–</span>}</td>}
                    {eds.map((e) => {
                      const c = l.rep?.byEd[e.id];
                      if (!c) return <td key={e.id}><span className="scout-sem">–</span></td>;
                      const title = [c.pos != null ? `${fmtOrd(c.pos)} de ${c.field}` : null, c.total != null ? `${c.total}` : null, c.toPar != null ? fmtToPar(c.toPar) : null, c.complete ? null : "não acabou"].filter(Boolean).join(" · ");
                      return <td key={e.id}>{c.complete ? lugar(c.pos, title) : <span className="scout-wd" title={title}>{c.pos != null ? fmtOrd(c.pos) : "WD"}</span>}</td>;
                    })}
                    {tem.vsm && (
                      <td className="scout-sep u-ta-left" title={nM ? `${nM} prova${nM > 1 ? "s" : ""} em comum${empates > 0 ? ` · ${empates} empate${empates > 1 ? "s" : ""}` : ""}` : undefined}>
                        {nM
                          ? <span className="scout-media u-ws-nowrap">
                              <span className={"fw-600 " + (l.frente > l.atras ? "c-good" : l.frente < l.atras ? "tone-bad" : "")}>{fraseConfrontos(l.frente, l.atras, nM, l.vsMMedia)}</span>
                              <span className="scout-sub">última: {l.sc!.m![0][1]}{l.sc!.m![0][0] ? ` (${shortDateSlash(l.sc!.m![0][0])})` : ""}</span>
                            </span>
                          : <span className="scout-sem">–</span>}
                      </td>
                    )}
                    {tem.prox && (
                      <td className="scout-sep" title={l.proximas.map((x) => `${x.name} · ${x.escalao} (${shortDateSlash(x.date)})`).join("\n") || undefined}>
                        {l.proximas.length || <span className="scout-sem">–</span>}
                      </td>
                    )}
                    {colsDepois.map(extraTd(l))}
                  </tr>
                  {isOpen && (
                    <tr className="scout-detalhe">
                      <td colSpan={nCols} className="u-ta-left">
                        {detExtra && <div className="u-mb-8px">{detExtra}</div>}
                        {l.ult.length > 0 && (
                          <table className="sc-lb scout-table u-w-max-content u-mb-6px">
                            <thead><tr><th className="u-ta-left">Últimos torneios</th><th>Data</th><th>Lugar</th><th>Voltas</th><th>Pancadas</th><th>±par</th><th title="SD oficial da FPG (média das voltas)">SD</th></tr></thead>
                            <tbody>
                              {l.ult.map((x, i) => (
                                <tr key={i}>
                                  <td className="u-ta-left">{x.nome}</td>
                                  <td>{shortDateSlash(x.data)}</td>
                                  <td>{x.lugar != null ? lugar(x.lugar, undefined, x.field) : x.estado ? <span className="scout-wd">{x.estado}</span> : <span className="scout-sem" title="Prova de clube — sem classificação">–</span>}</td>
                                  <td>{x.voltas || "–"}</td>
                                  <td>{x.pancadas ?? "–"}</td>
                                  <td>{x.toPar != null ? <span className={x.toPar <= 0 ? "c-good fw-600" : undefined}>{fmtToPar(x.toPar)}</span> : "–"}</td>
                                  <td>{x.sd != null ? <SDPill sd={x.sd} /> : <span className="scout-sem">–</span>}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                        {nM ? (
                          <table className="sc-lb scout-table u-w-max-content u-mb-6px">
                            <thead><tr><th className="u-ta-left">Prova em comum com o Manuel</th><th>Data</th><th>{l.name.split(" ")[0]}</th><th>Manuel</th><th title="Pancadas dele − Manuel, por volta de 18 buracos (só as voltas que os dois jogaram)">Por volta</th><th>Voltas</th></tr></thead>
                            <tbody>
                              {l.sc!.m!.map((x, i) => {
                                const pv = porVolta([x]);
                                return (
                                  <tr key={i}>
                                    <td className="u-ta-left">{x[1]}</td>
                                    <td>{x[0] ? shortDateSlash(x[0]) : "–"}</td>
                                    <td>{lugar(x[2])}</td>
                                    <td>{lugar(x[3])}</td>
                                    <td>{pv != null ? <span className={"scout-topar" + (pv > 0.05 ? " is-good" : pv < -0.05 ? " is-bad" : "")}>{pv > 0 ? "+" : pv < 0 ? "−" : ""}{Math.abs(pv).toFixed(1)}</span> : "–"}</td>
                                    <td>{x[5] ?? "–"}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        ) : <div className="muted fs-12 u-mb-6px">Ainda não jogou nenhuma prova com o Manuel.</div>}
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
