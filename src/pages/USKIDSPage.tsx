// @refresh reset
import { useEffect, useState, useMemo, useTransition, useCallback } from "react";
import { ToolbarTitle, ToolbarSep } from "../ui/Toolbar";
import { DataSourcesChip, DataSourcesProvider, type DataSource } from "../ui/DataSources";
import LoadingState from "../ui/LoadingState";
import { useSearchParams, Link } from "react-router-dom";
import { isoDate, fmtToPar } from "../utils/format";
import { TournSidebarItem, type SidebarItemTournament } from "../ui/TournSidebarItem";
import { SIDEBAR_ACCENT, ManuelPill } from "../ui/PillBadge";
import TabRow from "../ui/TabRow";
import { KidsLink } from "../ui/TabCampoDetalhe";
import { KidsLinkCtx } from "../ui/KidsLink";
import { useKidsLinkMap } from "../hooks/useKidsLinkMap";
import { loadUskidsResults } from "../data/uskidsResultsLoader";
import {
  REGIONAL_CHAMPIONSHIPS,
  isTerminado,
  ArMapCtx, type TorneioComManuel,
  torneioRegiao, isUSKidsTorneio,
} from "../ui/USKIDSPageHelpers";
import { buildAutoRivals, normName as normNameAuto, type AutoRivalPlayer } from "../data/KIDSdataLoader";
import { cachedFetchJson } from "../data/fetchCache";
import { escalaoManuelParaData, isManuelByName as isManuel } from "../constants/manuel";
import TabelaGlobal from "../ui/TabelaGlobal";
import type { UskidsDrawsData, Torneio as UskTorneio, TorneioResult as UskTorneioResult } from "../ui/uskidsTypes"; // pairings (Draw R{n})
import CircuitShell from "../ui/circuit/CircuitShell";
import { CircuitToolbarSlotCtx } from "../ui/circuit/toolbarSlot";
import type { CircuitDivision, CircuitEntry } from "../ui/circuit/types";
import {
  uskidsDivisions, resultadosDivKey, uskidsCircuitLinks, edicaoEntry,
  USKIDS_CONFIG_CAMPO, USKIDS_CONFIG_RESULTADOS, type EdicoesIndex,
} from "./uskids/uskidsCircuit";



// ─────────────────────────────────────────────
// TIPOS — CAMPO (inscritos)
// ─────────────────────────────────────────────
interface Jogador      { nome: string; pais: string; cidade: string; firstSeen?: string; pid?: number | null; regDia?: string; regObs?: boolean; }
interface PaisContagem { pais: string; n: number; }
interface Escalao {
  age_group: number; nome: string; genero: string | null;
  holes: number; flight_id: number;
  inscritos: number; maximo: number; vagas: number; pct_cheio: number;
  jogadores: Jogador[] | null; paises: PaisContagem[] | null;
  removed?: string[];
}
interface Torneio {
  t: number; name: string; emoji?: string;
  date_inicio: string; date_fim?: string; rondas?: number;
  campo: string | null; fee_18?: string | null;
  total_inscritos: number; total_maximo: number;
  escaloes: Escalao[];
  ultima_atualizacao: string;
  sem_flights?: boolean; erro?: string;
  url_uskids?: string | null;
  tour?: string | null; type?: number | null;
  seguido?: boolean; // em scripts/uskids-seguir-diario.json — nunca se esconde por categoria
}



interface FieldData { gerado_em: string; torneios: Torneio[]; }

// ─────────────────────────────────────────────
// TIPOS — RESULTADOS
// ─────────────────────────────────────────────
interface RondaJogador {
  _nota?: string;
  nome: string; pais: string; cidade: string;
  pontos: number; score: number; tee: string;
  to_par: number | null;
  buracos: number;
  start_time: string; grupo: number;
  strokes: number[];  // directamente no jogador (nova estrutura)
  // legacy (estrutura antiga — manter compatibilidade)
  rondas?: Record<string, {
    strokes: number[]; total: number; buracos: number;
    start_time: string; grupo: number;
  }>;
}
interface RondaResult {
  ronda: number;
  par: number[];
  si: number[];
  metros?: number[];   // distâncias por buraco em metros (convertidas de jardas)
  buracos: number;
  total_par: number | null;
  leaderboard: RondaJogador[];  // nova estrutura
  jogadores?: RondaJogador[];   // legacy
}
interface EscalaoResult  { age_group: number; nome: string; holes: number; is_manuel: boolean; rondas: RondaResult[]; campo?: string; }
interface TorneioResult  {
  t: number; name: string;
  date_inicio: string; date_fim?: string; campo: string | null;
  rondas_total: number;
  escalao_manuel?: number;
  url_resultados?: string;
  escaloes: EscalaoResult[];
  ultima_atualizacao: string;
}
interface ResultsData { gerado_em: string; resultados: TorneioResult[]; }

// ─────────────────────────────────────────────
// COMPONENTE PRINCIPAL
// ─────────────────────────────────────────────
type Tab = "campo" | "resultados";

// Categorias da lista de torneios, pelo `type` do GetMeta (a mesma taxonomia de
// scripts/lib/uskids-classify.js). Vigiam-se todas; a lista esconde as que
// incomodam. Por defeito vêem-se só os Internacionais e os Mundiais (decisão
// dela, 14/09/2026): os Tour Championship são a maioria (56 de 85) e afogavam
// os torneios que interessam.
// ⚠ Os tipos 3 e 4 só aparecem nos números mais antigos (World Championship
// 2026 = 4, World Teen = 3, ambos "Domestic Championships Tour") — não estavam
// na amostra de 30/08. Um tipo que falte aqui aparece na mesma, como "Tipo N".
const CATEGORIAS: { tipo: number; label: string }[] = [
  { tipo: 4,  label: "Mundiais" },
  { tipo: 3,  label: "Mundial Teen" },
  { tipo: 8,  label: "Internacionais" },
  { tipo: 13, label: "Teen Intl" },
  { tipo: 1,  label: "Regionais" },
  { tipo: 7,  label: "State Inv." },
  { tipo: 12, label: "Girls Inv." },
  { tipo: 2,  label: "Teen Series" },
  { tipo: 5,  label: "Local Tour" },
  { tipo: 6,  label: "Tour Champ." },
  { tipo: 9,  label: "Pais/Filhos" },
];
// Guarda-se o que está VISÍVEL (e não o escondido): um tipo novo que a USKids
// venha a usar entra riscado, em vez de encher a lista sem ser pedido.
const CAT_VISIVEIS_DEFAULT = [8, 4, 3];   // Internacionais + Mundiais
const CAT_LS_KEY = "uskids_categorias_visiveis_v1";
function lerCatVisiveis(): Set<number> {
  try {
    const v = JSON.parse(localStorage.getItem(CAT_LS_KEY) ?? "null");
    if (Array.isArray(v)) return new Set(v.filter((x: unknown): x is number => typeof x === "number"));
  } catch { /* sem storage: fica o default */ }
  return new Set(CAT_VISIVEIS_DEFAULT);
}
/** Categoria pelo NOME, só nos padrões sem ambiguidade (validados a 13/10/2026
 *  contra os 45 torneios com tipo conhecido — zero desacordos). Os resultados
 *  já jogados não trazem o `type` da inscrição; sem padrão fica null e o
 *  torneio nunca é escondido pelas categorias. */
function tipoPeloNome(name: string): number | null {
  const n = name.toLowerCase();
  if (/\(tour champ/.test(n)) return 6;
  if (/state invitational/.test(n)) return 7;
  if (/parent\s*\/\s*child/.test(n)) return 9;
  if (/international teen series/.test(n)) return 13;
  if (/teen series/.test(n)) return 2;
  if (/^world teen championship/.test(n)) return 3;
  if (/^world championship/.test(n)) return 4;
  return null;
}
const labelCategoria = (tipo: number) => CATEGORIAS.find(c => c.tipo === tipo)?.label ?? `Tipo ${tipo}`;

// Tipo explícito para entradas do mapa allTorneios — elimina os (as any) casts
type TorneioEntry = {
  t: number; name: string; date: string; dateFim?: string;
  temResultados: boolean; temCampo: boolean;
  inscritos?: number; maximo?: number; vagas?: number;
  escalaoManuel?: string; rondas?: number; fee?: number;
  campo?: string; totalInscritos?: number; totalMaximo?: number;
  urlResultados?: string; manuelJogou?: boolean; terminado?: boolean;
  manuelPos?: number | null; manuelScore?: number | null; nPaises?: number;
  tipo?: number | null; seguido?: boolean;
};

export default function USKidsFieldPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  const VALID_TABS: Tab[] = ["campo", "resultados"];
  const paramTab = searchParams.get("tab") as Tab | null;

  const [fieldData,   setFieldData]   = useState<FieldData | null>(null);
  const [resultsData, setResultsData] = useState<ResultsData | null>(null);
  const [drawsData,   setDrawsData]   = useState<UskidsDrawsData | null>(null);
  const [autoRivals,  setAutoRivals]  = useState<AutoRivalPlayer[]>([]);
  // Edições anteriores fora dos resultados (public/data/uskids-edicoes/): só o
  // índice; cada edição carrega quando a prova dela pede as edições.
  const [indiceEdicoes, setIndiceEdicoes] = useState<EdicoesIndex["torneios"] | null>(null);
  const [erro,        setErro]        = useState<string | null>(null);
  const [tab, setTabState] = useState<Tab>(() => {
    if (paramTab && VALID_TABS.includes(paramTab)) return paramTab;
    return "campo";
  });
  // A vista «Rivais» saiu (20/10/2026 — tudo no CircuitShell): ?tab=rivais abre
  // Torneios com o ★ Manuel; com ?t= abre o Scout desse torneio (o efeito da
  // selecção passa-o a Resultados se já foi jogado).
  useEffect(() => {
    if (searchParams.get("tab") !== "rivais") return;
    setSearchParams(prev => {
      const n = new URLSearchParams(prev);
      n.set("tab", "campo");
      if (n.get("t")) n.set("rt", "scout");
      return n;
    }, { replace: true });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // Vista informativa do shell (menu ⓘ Info), no URL: ?info=tabela.
  const selectedInfo = searchParams.get("info");
  const setSelectedInfo = (k: string | null) => setSearchParams(prev => {
    const n = new URLSearchParams(prev);
    if (k) n.set("info", k); else n.delete("info");
    return n;
  }, { replace: true });
  const setTab = (t: Tab) => {
    setTabState(t);
    setSearchParams(prev => { const n = new URLSearchParams(prev); n.set("tab", t); return n; }, { replace: true });
  };
  const [filterManuel, setFilterManuel] = useState(true);
  // Ocultar torneios com campo pequeno (< 60 jogadores) na tab Resultados
  const [filterSmallField, setFilterSmallField] = useState(false);
  const MIN_FIELD = 60;
  // Torneio pedido por link (?t= na primeira carga — ex.: os "próximos torneios"
  // do kids2). Fica sempre visível, seja qual for a categoria.
  const [tLigado] = useState<number | null>(() => {
    const p = searchParams.get("t");  // (o paramT só é declarado mais abaixo)
    return p ? parseInt(p) || null : null;
  });
  // Categorias escondidas na lista — preferência deste browser.
  const [catVisiveis, setCatVisiveis] = useState<Set<number>>(lerCatVisiveis);
  useEffect(() => {
    try { localStorage.setItem(CAT_LS_KEY, JSON.stringify([...catVisiveis])); } catch { /* sem storage */ }
  }, [catVisiveis]);
  const alternarCategoria = (tipo: number) => setCatVisiveis(prev => {
    const n = new Set(prev);
    if (n.has(tipo)) n.delete(tipo); else n.add(tipo);
    return n;
  });

  // selectedT sincronizado com URL params (?t=)
  const paramT = searchParams.get("t");
  const [selectedT, setSelectedTState] = useState<number | null>(paramT ? (parseInt(paramT) || null) : null);

  const setSelectedT = (t: number | null) => {
    setSelectedTState(t);
    setSearchParams(prev => { const n = new URLSearchParams(prev); if (t != null) n.set("t", String(t)); else n.delete("t"); return n; }, { replace: true });
  };

  // Declarado ANTES do useEffect que o usa — regra de React: hooks antes de qualquer uso.
  // Marca setAutoRivals como actualização não-urgente para não bloquear o render inicial.
  const [, startRivalsTransition] = useTransition();

  const [fileMeta, setFileMeta] = useState<DataSource[]>([]);

  // Upsert em vez de append — evita duplicados quando o effect corre duas vezes
  // (React StrictMode em dev) ou quando o mesmo ficheiro é reportado mais que
  // uma vez (ex: loading → loaded, ou duas fontes diferentes).
  const upsertFileMeta = useCallback((entry: DataSource) => {
    setFileMeta(prev => {
      const others = prev.filter(s => s.path !== entry.path);
      return [...others, entry];
    });
  }, []);

  useEffect(() => {
    // Cache diário: só re-faz fetch uma vez por dia (usa HTTP cache nos restantes pedidos da sessão)
    const daily = new Date().toISOString().slice(0, 10); // "2026-04-03"

    fetch(`/data/uskids-field.json?v=${daily}`)
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((d: FieldData) => {
        setFieldData(d);
        // Link para um torneio que não é do Manuel: o ★ Manuel arranca desligado,
        // senão o torneio pedido nem estava na lista (no mesmo render, batched).
        const ligado = tLigado != null ? d.torneios.find(t => t.t === tLigado) : null;
        if (ligado && !ligado.escaloes?.some(e => (e.jogadores ?? []).some(j => isManuel(j.nome))))
          setFilterManuel(false);
        upsertFileMeta({ path: "/data/uskids-field.json", status: "loaded", count: d.torneios?.length, group: "field" });
        // Por omissão abre o próximo torneio em que o Manuel está inscrito — o filtro
        // ★ Manuel vem ligado, e abrir d.torneios[0] mostrava um torneio fora da lista.
        if (d.torneios.length) setSelectedTState(prev => {
          if (prev !== null) return prev;
          const doManuel = d.torneios
            .filter(t => t.escaloes?.some(e => (e.jogadores ?? []).some(j => isManuel(j.nome))))
            .sort((a, b) => isoDate(a.date_inicio).localeCompare(isoDate(b.date_inicio)));
          return (doManuel[0] ?? d.torneios[0]).t;
        });
      })
      .catch(e => {
        setErro(e.message);
        upsertFileMeta({ path: "/data/uskids-field.json", status: "error", error: String(e), group: "field" });
      });

    // Draws (pairings) — escalão do Manuel + adjacentes ±1. Ficheiro pode não
    // existir ainda nos primeiros dias antes do primeiro draw publicado;
    // tratamos 404 silenciosamente (não é erro). O draw aparece automaticamente
    // como tab "Draw R{n}" antes de cada ronda no escalão do Manuel.
    fetch(`/data/uskids-draws.json?v=${daily}`)
      .then(r => {
        if (r.status === 404) {
          // Ficheiro ainda não publicado — não é erro, é estado normal antes
          // do workflow correr pela primeira vez na semana de um torneio.
          upsertFileMeta({ path: "/data/uskids-draws.json", status: "error", error: "ainda não publicado", group: "draws" });
          return null;
        }
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d: UskidsDrawsData | null) => {
        if (!d) return;
        setDrawsData(d);
        upsertFileMeta({ path: "/data/uskids-draws.json", status: "loaded", count: d.torneios?.length, group: "draws" });
      })
      .catch(e => {
        upsertFileMeta({ path: "/data/uskids-draws.json", status: "error", error: String(e), group: "draws" });
      });

    // Resultados: os uskids_torneios_completos(N) + o uskids-results.json, com as
    // correcções (src/data/uskidsResultsLoader.ts — o Kids 2 usa o mesmo).
    loadUskidsResults(upsertFileMeta).then(setResultsData);

    cachedFetchJson<EdicoesIndex>("/data/uskids-edicoes/index.json")
      .then(d => {
        setIndiceEdicoes(d?.torneios ?? []);
        upsertFileMeta({ path: "/data/uskids-edicoes/index.json", status: "loaded", count: d?.torneios?.length, group: "edicoes" });
      })
      .catch(e => {
        setIndiceEdicoes([]);
        upsertFileMeta({ path: "/data/uskids-edicoes/index.json", status: "error", error: String(e), group: "edicoes" });
      });

    // Carregar auto-rivals com carregamento progressivo em duas fases:
    // Fase 1 (rápida): dados essenciais → página já funciona
    // Fase 2 (background): member history ficheiro a ficheiro → enriquece progressivamente
    buildAutoRivals(undefined, {
      onUpdate: (rivals) => startRivalsTransition(() => setAutoRivals(rivals)),
    }).catch(() => {});
  }, []);

  const nResultados = resultsData?.resultados?.length ?? 0;

  // ─────────────────────────────────────────────────────────────────
  // TODOS OS HOOKS useMemo/useCallback — antes de ANY lógica
  // ─────────────────────────────────────────────────────────────────

  const torneiosCampo = useMemo(() => fieldData?.torneios ?? [], [fieldData]);
  const torneiosResultados = useMemo(() => resultsData?.resultados ?? [], [resultsData]);

  const allTorneios = useMemo(() => {
    const map = new Map<number, TorneioEntry>();
    for (const t of torneiosCampo) {
      if (!t.t || !t.name) continue;
      if (!isUSKidsTorneio(t.name)) continue; // Filtrar torneios não-USKids
      const em = escalaoManuelParaData(t.date_inicio);
      // escalaoManuelParaData retorna NUMBER (idade); comparar com age_group, não com nome ("Boys 11").
      // Exigir escalão Boys — Manuel é rapaz; sem isto, torneios com Girls do mesmo número
      // (ex: Veteran Qualifier t=21666 com "Girls 10") destacavam o escalão errado.
      const esc = t.escaloes?.find((e: any) => e.age_group === em && /boys/i.test(e.nome));
      const ended = isTerminado(t.date_fim, t.date_inicio);
      // Verificar se Manuel está inscrito em QUALQUER escalão (escalões agrupados como "Boys 9-10" podem
      // não bater certo com a idade exacta — ser permissivo aqui evita falsos negativos no filtro Manuel)
      const manuelInscrito = t.escaloes?.some((e: any) =>
        (e.jogadores ?? []).some((j: any) => isManuel(j.nome))
      ) ?? false;
      map.set(t.t, { t: t.t, name: t.name, date: t.date_inicio, dateFim: t.date_fim ?? undefined, temResultados: false, temCampo: true,
        inscritos: esc?.inscritos, maximo: esc?.maximo, vagas: esc?.vagas, escalaoManuel: esc?.nome ?? `Boys ${em}`,
        rondas: t.rondas ?? undefined,
        fee: t.fee_18 ? parseFloat(t.fee_18) : undefined,
        campo: t.campo ?? undefined,
        totalInscritos: t.total_inscritos ?? undefined,
        totalMaximo: t.total_maximo ?? undefined,
        terminado: ended,
        manuelJogou: manuelInscrito,
        tipo: t.type ?? null,
        seguido: t.seguido,
      });
    }
    for (const t of torneiosResultados) {
      if (!t.t || !t.name) continue;
      if (!isUSKidsTorneio(t.name)) continue;
      const manuelJogou = t.escaloes?.some((e: EscalaoResult) =>
        e.rondas?.some((r: RondaResult) =>
          (r.leaderboard ?? r.jogadores ?? []).some((j: RondaJogador) => isManuel(j.nome))
        )
      ) ?? false;
      // Posição e score do Manuel (última ronda do seu escalão)
      let manuelPos: number | null = null;
      let manuelScore: number | null = null;
      if (manuelJogou) {
        const escalaoM = t.escaloes?.find((e: EscalaoResult) =>
          e.rondas?.some((r: RondaResult) =>
            (r.leaderboard ?? r.jogadores ?? []).some((j: RondaJogador) => isManuel(j.nome))
          )
        );
        const lastRonda = escalaoM?.rondas?.[escalaoM.rondas.length - 1];
        const lb = lastRonda?.leaderboard ?? lastRonda?.jogadores ?? [];
        const sorted = [...lb].sort((a, b) => b.pontos - a.pontos || a.score - b.score);
        const mIdx = sorted.findIndex(j => isManuel(j.nome));
        if (mIdx >= 0) { manuelPos = mIdx + 1; manuelScore = sorted[mIdx].score; }
      }
      const ended = isTerminado(t.date_fim, t.date_inicio);
      const rondasTotal = t.rondas_total ?? (t.escaloes?.[0]?.rondas?.length ?? 1);
      // Total de jogadores: soma dos participantes na última ronda de cada escalão
      const totalJogadores = t.escaloes?.reduce((sum: number, e: EscalaoResult) => {
        const lastR = e.rondas?.[e.rondas.length - 1];
        return sum + ((lastR?.leaderboard ?? lastR?.jogadores ?? []).length);
      }, 0) ?? 0;
      // Países únicos
      const paises = new Set<string>();
      t.escaloes?.forEach((e: EscalaoResult) => {
        const lastR = e.rondas?.[e.rondas.length - 1];
        (lastR?.leaderboard ?? lastR?.jogadores ?? []).forEach((j: RondaJogador) => { if (j.pais) paises.add(j.pais); });
      });
      if (map.has(t.t)) {
        const entry = map.get(t.t)!;
        entry.temResultados = true;
        if (t.url_resultados) entry.urlResultados = t.url_resultados;
        if (manuelJogou) { entry.manuelJogou = true; entry.manuelPos = manuelPos; entry.manuelScore = manuelScore; }
        if (!entry.dateFim && t.date_fim) entry.dateFim = t.date_fim;
        if (ended) entry.terminado = true;
        if (!entry.rondas) entry.rondas = rondasTotal;
        if (!entry.campo && t.campo) entry.campo = t.campo;
        if (entry.tipo == null) entry.tipo = tipoPeloNome(t.name);
        if (totalJogadores > 0) entry.totalInscritos = totalJogadores;
        entry.nPaises = paises.size;
      } else {
        map.set(t.t, {
          t: t.t, name: t.name, date: t.date_inicio, dateFim: t.date_fim ?? undefined,
          temResultados: true, temCampo: false, urlResultados: t.url_resultados, manuelJogou,
          terminado: ended, rondas: rondasTotal,
          campo: t.campo ?? undefined,
          totalInscritos: totalJogadores || undefined,
          manuelPos: manuelJogou ? manuelPos : undefined,
          manuelScore: manuelJogou ? manuelScore : undefined,
          nPaises: paises.size,
          tipo: tipoPeloNome(t.name),
        });
      }
    }
    return [...map.values()]
      .filter(t => t.name && t.date)
      .sort((a, b) => isoDate(a.date).localeCompare(isoDate(b.date)));
  }, [torneiosCampo, torneiosResultados]);

  // Torneios onde o Manuel participou ou está inscrito (colunas futuras da Tabela global)
  const torneiosComManuel = useMemo((): TorneioComManuel[] => {
    const map = new Map<number, TorneioComManuel>();

    // Helper: confirmação estrita de que é o nosso Manuel (nome + PT + cidade de Madeira quando disponível)
    const isManuelStrict = (j: { nome: string; pais: string; cidade?: string }) => {
      if (!isManuel(j.nome)) return false;
      if (j.pais && j.pais !== "PT") return false;
      // Se cidade está preenchida, tem de ser Madeira/Funchal/Santo da Serra/CGSS
      if (j.cidade) {
        const c = j.cidade.toLowerCase();
        if (!c.includes("madeira") && !c.includes("funchal") && !c.includes("santo") && !c.includes("cgss")) return false;
      }
      return true;
    };

    if (fieldData) {
      for (const t of fieldData.torneios) {
        const esc = t.escaloes.find(e => (e.jogadores ?? []).some(j => isManuelStrict(j)));
        if (esc) map.set(t.t, { t: t.t, name: t.name, date_inicio: t.date_inicio, escalaoManuel: esc.nome, source: "field" });
      }
    }
    if (resultsData) {
      for (const t of resultsData.resultados) {
        if (map.has(t.t)) continue;
        // Só incluir se o Manuel realmente aparece no leaderboard (não apenas is_manuel flag)
        const manEsc = t.escaloes?.find(e =>
          e.rondas?.some(r => (r.leaderboard ?? r.jogadores ?? []).some(j => isManuelStrict({ nome: j.nome, pais: j.pais, cidade: j.cidade })))
        );
        if (manEsc) map.set(t.t, { t: t.t, name: t.name, date_inicio: t.date_inicio, escalaoManuel: manEsc.nome, source: "results" });
      }
    }
    return [...map.values()].sort((a, b) => isoDate(b.date_inicio).localeCompare(isoDate(a.date_inicio)));
  }, [fieldData, resultsData]);


  // useMemo ANTES dos early returns — obrigatório pelas Rules of Hooks
  // Roster canónico para a seta ↗ (aliases e nomes do meio) — ver KidsLink.
  const { kidsMap } = useKidsLinkMap();
  const arMapCtxValue = useMemo(() => {
    const m = new Map<string, AutoRivalPlayer>();
    // Homónimos (ex.: Noah Birk Andersen USKids × UA Worlds antes de fundidos):
    // fica a ficha com mais torneios, não a última lida.
    for (const r of autoRivals) {
      const k = normNameAuto(r.n);
      const antes = m.get(k);
      if (!antes || Object.keys(r.r).length > Object.keys(antes.r).length) m.set(k, r);
    }
    return m;
  }, [autoRivals]);

  // Tabela global (todos os jogadores × todos os torneios do Manuel): vista do
  // menu ⓘ Info do shell, nas duas vistas (era a 1.ª entrada dos Rivais).
  const [configCampo, configResultados] = useMemo(() => {
    const hoje = new Date().toISOString().slice(0, 10);
    const futureCols = torneiosComManuel
      .filter(t => isoDate(t.date_inicio) > hoje)
      .map(t => ({ tid: `usk${t.t}`, short: t.name.replace(/\s*\d{4}$/, "").slice(0, 12), escalao: t.escalaoManuel ?? "", url: undefined }));
    const specialItems = [{
      key: "tabela",
      label: "📊 Tabela global",
      render: () => (
        <TabelaGlobal
          autoRivals={autoRivals}
          futureCols={futureCols}
          fieldData={fieldData as any /* FieldData local ≠ FieldData do uskidsTypes */}
          KidsLink={KidsLink}
        />
      ),
    }];
    return [{ ...USKIDS_CONFIG_CAMPO, specialItems }, { ...USKIDS_CONFIG_RESULTADOS, specialItems }];
  }, [torneiosComManuel, autoRivals, fieldData]);

  // Torneio de resultados mais RECENTE (allTorneios está ordenado por data asc,
  // logo o último com resultados é o mais recente). Usado como default ao abrir
  // a tab Resultados.
  const ultimoResultadoT = useMemo(() => {
    for (let i = allTorneios.length - 1; i >= 0; i--) {
      if (allTorneios[i].temResultados) return allTorneios[i].t;
    }
    return torneiosResultados.length ? torneiosResultados[0].t : null;
  }, [allTorneios, torneiosResultados]);

  // ── Lista da barra lateral ─────────────────────────────────────────────
  // Primeiro sem o filtro de categoria — as contagens dos chips saem daqui,
  // para mostrarem também quantos estão escondidos. A pesquisa é a do shell.
  const listaSemCategoria = useMemo(() => {
    const manuelFilter = (t: TorneioEntry) => !filterManuel || t.manuelJogou;
    // Filtro de campo pequeno: só na tab Resultados. Usa totalInscritos
    // (= soma de participantes na última ronda de cada escalão).
    const fieldFilter = (t: TorneioEntry) =>
      !(filterSmallField && tab === "resultados") || (t.totalInscritos ?? 0) >= MIN_FIELD;
    // Resultados: só o que já se jogou (ou está a decorrer) — os torneios por
    // disputar obrigavam a um scroll enorme até ao dia de hoje (13/10/2026).
    const hojeIso = new Date().toISOString().slice(0, 10);
    const jaJogado = (t: TorneioEntry) => t.temResultados || (!!t.date && isoDate(t.date) <= hojeIso);
    return tab === "campo"
      ? allTorneios.filter(t => !t.terminado && manuelFilter(t))
      : allTorneios.filter(t => jaJogado(t) && manuelFilter(t) && fieldFilter(t));
  }, [allTorneios, tab, filterManuel, filterSmallField]);
  // Torneios e Resultados (os mesmos filtros nas duas — 13/10/2026; sem tipo
  // conhecido nunca se esconde) e só com o ★ Manuel DESLIGADO: ligado, a lista é
  // "os torneios do Manuel" e nenhuma categoria os pode esconder (uma escolha
  // antiga de chips escondia o Spanish Open). Sem tipo conhecido, pedido por
  // link ou seguido (uskids-seguir-diario.json) nunca se esconde.
  const listaVisivel = useMemo(() => listaSemCategoria.filter(t =>
    filterManuel || t.tipo == null || t.t === tLigado || !!t.seguido || catVisiveis.has(t.tipo)),
  [listaSemCategoria, filterManuel, tLigado, catVisiveis]);
  // Os chips saem dos DADOS, não da lista fixa: um tipo que a USKids venha a
  // usar e que não está em CATEGORIAS aparece sozinho, como "Tipo N".
  const ordemCat = (tipo: number) => { const i = CATEGORIAS.findIndex(c => c.tipo === tipo); return i < 0 ? 99 : i; };
  const contagemCat = [...new Set(listaSemCategoria.map(t => t.tipo).filter((x): x is number => x != null))]
    .sort((a, b) => ordemCat(a) - ordemCat(b) || a - b)
    .map(tipo => ({ tipo, label: labelCategoria(tipo), n: listaSemCategoria.filter(t => t.tipo === tipo).length }));
  const mostrarChips = !filterManuel
    && (contagemCat.length > 1 || contagemCat.some(c => !catVisiveis.has(c.tipo)));

  // ── CircuitShell: entradas e divisões ──────────────────────────────────
  // Um carregador por torneio, refeito só quando os dados mudam (o shell guarda
  // as divisões enquanto o carregador for o mesmo — os resultados e os draws
  // chegam depois dos inscritos).
  const loaders = useMemo(() => {
    const campoPorT = new Map(torneiosCampo.map(t => [t.t, t]));
    const resPorT = new Map(torneiosResultados.map(t => [t.t, t]));
    const m = new Map<number, () => Promise<CircuitDivision[]>>();
    for (const t of new Set([...campoPorT.keys(), ...resPorT.keys()])) {
      let feito: CircuitDivision[] | null = null;
      m.set(t, () => Promise.resolve(feito ??= uskidsDivisions(
        (campoPorT.get(t) ?? null) as unknown as UskTorneio | null,
        (resPorT.get(t) ?? null) as unknown as UskTorneioResult | null,
        drawsData)));
    }
    return m;
  }, [torneiosCampo, torneiosResultados, drawsData]);
  // Link para o Scout (rt=scout): nos Torneios abre no escalão do Manuel, não
  // na grelha «Todos» (que não tem Scout).
  const pedeScout = searchParams.get("rt") === "scout";
  const entradas = useMemo(() => {
    const campoPorT = new Map(torneiosCampo.map(t => [t.t, t]));
    const resPorT = new Map(torneiosResultados.map(t => [t.t, t]));
    const m = new Map<number, CircuitEntry>();
    for (const t of allTorneios) {
      const iso = isoDate(t.date);
      const res = (resPorT.get(t.t) ?? null) as unknown as UskTorneioResult | null;
      const campoT = campoPorT.get(t.t);
      const escM = campoT?.escaloes.find(e => e.nome === t.escalaoManuel);
      m.set(t.t, {
        id: String(t.t), tcode: String(t.t), name: t.name,
        year: parseInt(iso.slice(0, 4), 10) || null,
        dateStart: iso || undefined, dateEnd: t.dateFim ? isoDate(t.dateFim) : undefined,
        course: t.campo,
        links: uskidsCircuitLinks(t.t, campoT?.url_uskids),
        hasManuel: !!t.manuelJogou, hasResults: t.temResultados,
        playerCount: t.totalInscritos ?? t.inscritos, roundsCount: t.rondas,
        defaultDivKey: tab !== "campo" ? resultadosDivKey(res)
          : !pedeScout ? "todos"
          : resultadosDivKey(res) ?? (escM ? `g${escM.age_group}` : undefined),
        loadDivisions: loaders.get(t.t),
      });
    }
    return m;
  }, [allTorneios, torneiosCampo, torneiosResultados, loaders, tab, pedeScout]);
  const shellEntries = useMemo(
    () => listaVisivel.map(t => entradas.get(t.t)).filter((e): e is CircuitEntry => !!e),
    [listaVisivel, entradas]);
  // «Edições anteriores»/«Scout»: todos os resultados (de qualquer filtro) e as
  // edições de public/data/uskids-edicoes/ que não estão nos resultados.
  const edicoesPool = useMemo(() => {
    const pool: CircuitEntry[] = [];
    const temos = new Set<number>();
    for (const r of torneiosResultados) {
      temos.add(r.t);
      const iso = isoDate(r.date_inicio);
      pool.push(entradas.get(r.t) ?? {
        id: String(r.t), tcode: String(r.t), name: r.name, year: parseInt(iso.slice(0, 4), 10) || null,
        dateStart: iso || undefined, loadDivisions: loaders.get(r.t),
      });
    }
    for (const x of indiceEdicoes ?? []) if (!temos.has(x.t)) pool.push(edicaoEntry(x));
    return pool;
  }, [torneiosResultados, indiceEdicoes, entradas, loaders]);

  // O detalhe é sempre um torneio que está na lista. Se o seleccionado deixou de
  // estar — mudou um filtro, ou o ?t= guardado é de um torneio que já acabou —
  // abre-se o primeiro visível: os do Manuel primeiro, depois o mais próximo.
  const chaveVisiveis = listaVisivel.map(t => t.t).join(",");
  useEffect(() => {
    // Só depois de os resultados chegarem — antes disso um torneio já jogado
    // ainda não «tem resultados» e a selecção saltava para outro.
    if (!chaveVisiveis || !resultsData) return;
    const ids = new Set(chaveVisiveis.split(",").map(Number));
    if (selectedT != null && ids.has(selectedT)) return;
    // Link ?t= para um torneio que já acabou e tem resultados: abre em
    // Resultados em vez de saltar para outro torneio (14/10/2026 — o link do
    // Marco Simone 2026, t=21080, abria o Spanish Open).
    if (tab === "campo" && selectedT != null && selectedT === tLigado) {
      const lig = allTorneios.find(t => t.t === selectedT);
      if (lig?.temResultados) { setTab("resultados"); return; }
    }
    // Link para um torneio em que o Manuel não jogou: desliga o ★ Manuel em vez
    // de abrir outro torneio (o filtro escondia-o da lista).
    if (selectedT != null && selectedT === tLigado && filterManuel && allTorneios.some(t => t.t === selectedT)) {
      setFilterManuel(false); return;
    }
    const hoje = new Date().toISOString().slice(0, 10);
    const vis = allTorneios.filter(t => ids.has(t.t))
      .sort((a, b) => isoDate(a.date).localeCompare(isoDate(b.date)));
    // Resultados: o mais recente jogado; Torneios: os do Manuel, depois o mais próximo.
    const alvo = tab === "resultados"
      ? vis[vis.length - 1]
      : vis.find(t => t.manuelJogou) ?? vis.find(t => isoDate(t.date) >= hoje) ?? vis[0];
    if (alvo) setSelectedT(alvo.t);
  }, [chaveVisiveis, selectedT, tab, resultsData, filterManuel]);

  if (erro) return (
    <div style={{ padding: 32 }}>
      <div className="notice-error">
        <div className="fw-700 c-danger mb-4">Erro ao carregar dados USKids</div>
        <div className="muted fs-11 mono">{erro}</div>
        <button className="btn mt-8" onClick={() => window.location.reload()}>Recarregar</button>
      </div>
    </div>
  );
  if (!fieldData) return <LoadingState message="A carregar dados USKids…" size="lg" icon="🏌️" />;

  // Quando muda de tab, verificar se o torneio seleccionado existe nessa tab
  const handleTabChange = (newTab: Tab) => {
    setTab(newTab);
    if (newTab === "resultados") {
      // Ir para o torneio mais recente, a menos que o seleccionado já tenha resultados.
      const exists = selectedT != null && torneiosResultados.some(t => t.t === selectedT);
      if (!exists && ultimoResultadoT != null) setSelectedT(ultimoResultadoT);
    }
  };

  const TABS: { id: Tab; label: string; badge: number | null }[] = [
    { id:"campo",      label:"⛳ Torneios",   badge: fieldData.torneios.length },
    { id:"resultados", label:"🏆 Resultados", badge: nResultados },
  ];

  // ── Item da barra lateral (TournSidebarItem — o mesmo de sempre; o shell só
  // dá o `active` e o `onSelect`) ──────────────────────────────────────────
  const renderItem = (t: TorneioEntry, active: boolean, onSelect: () => void) => {
    const temConteudo = tab === "resultados" ? t.temResultados : t.temCampo;
    const reg = torneioRegiao(t.name);
    const isEuro = reg === "EURO";
    const isInvit = !!REGIONAL_CHAMPIONSHIPS[t.t];
    const pct = t.maximo ? Math.min(100, Math.round(((t.inscritos ?? 0) / t.maximo) * 100)) : 0;
    const manuelPos: number | null = t.manuelPos ?? null;
    const manuelScore: number | null = t.manuelScore ?? null;
    const nPaises: number = t.nPaises ?? 0;
    const extraPills = (
      <>
        <span className="p p-sm p-muted" title="Código do torneio (t=) USKids / signupanytime">t={t.t}</span>
        {reg && (
          <span className="p p-sm p-tourn" style={{
            background: isEuro ? "var(--bg-info)" : "var(--bg-warn-orange)",
            color: isEuro ? "var(--color-info)" : "var(--color-orange-deep)",
            borderColor: isEuro ? "var(--border-info)" : "var(--color-amber)",
          }}>{reg}</span>
        )}
        {isInvit && (
          <span className="p p-sm p-tourn" style={{
            background:"var(--bg-pink)", color:"var(--color-purple)", borderColor:"var(--border-purple)",
          }}>INVIT</span>
        )}
        {t.tipo != null && t.tipo !== 8 && (
          <span className="p p-sm p-muted" title="Categoria USKids">{labelCategoria(t.tipo)}</span>
        )}
        {t.escalaoManuel && <span className="p p-sm p-muted">{t.escalaoManuel}</span>}
        {nPaises > 1 && <span className="p p-sm p-muted">{nPaises} países</span>}
        {t.manuelJogou && <ManuelPill />}
        {t.manuelJogou && manuelPos != null && (
          <span className="p p-sm p-tourn" style={{
            background: manuelPos === 1 ? "var(--bg-warn-strong)" : manuelPos <= 3 ? "var(--bg-info-strong)" : "var(--bg-muted)",
            color: manuelPos === 1 ? "var(--color-warn-dark)" : manuelPos <= 3 ? "var(--color-navy)" : "var(--text-2)",
            borderColor: "transparent",
          }}>
            {manuelPos === 1 ? "🥇" : manuelPos === 2 ? "🥈" : manuelPos === 3 ? "🥉" : `#${manuelPos}`}
            {manuelScore != null && ` (${fmtToPar(manuelScore)})`}
          </span>
        )}
        {t.urlResultados && (
          <a href={t.urlResultados} target="_blank" rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            className="p p-sm p-muted td-none">
            Resultados ↗
          </a>
        )}
        {/* Scout (20/10/2026): a aba «Scout» do próprio torneio — com os
            resultados, ou com os inscritos nos torneios por disputar. */}
        <Link
          to={`/uskids?t=${t.t}&tab=${tab}&rt=scout`}
          onClick={e => { e.stopPropagation(); onSelect(); }}
          title="Scout — os jogadores, o nível de cada um, as edições anteriores e os confrontos com o Manuel"
          className="p p-sm td-none"
          style={{ background:"var(--bg-info-subtle)", color:"var(--color-info-dark, #1e3a8a)", borderColor:"var(--border-info, #93c5fd)" }}>
          🔭 Scout
        </Link>
      </>
    );
    const tData: SidebarItemTournament = {
      name: t.name.replace(/\s*\d{4}$/, ""),
      campo: t.campo ? t.campo.split(",")[0] : undefined,
      date: isoDate(t.date) || t.date,
      playerCount: t.totalInscritos ?? t.inscritos,
      rounds: t.rondas,
      players: [],
      series: "tour",
    };
    const uskidsFooter = t.temCampo ? (
      <>
        {t.maximo != null && t.maximo > 0 && (
          <div className="mb-4">
            <div className="fs-11 c-text-2" style={{ display:"flex", justifyContent:"space-between", marginBottom:3 }}>
              <span className="fw-600">{t.escalaoManuel}</span>
              <span>
                {t.inscritos}/{t.maximo}
                {(t.vagas ?? 0) > 0
                  ? <span style={{ color:"var(--color-success)", marginLeft:4 }}>{t.vagas} vagas</span>
                  : <span style={{ color:"var(--color-danger)", marginLeft:4 }}>cheio</span>}
              </span>
            </div>
            <div style={{ height:4, borderRadius:2, background:"var(--border)", overflow:"hidden" }}>
              <div style={{ height:"100%", borderRadius:2, width:`${pct}%`, background:"var(--accent)" }} />
            </div>
          </div>
        )}
        {(t.totalMaximo ?? 0) > 0 && (
          <div className="fs-11 c-text-3" style={{ display:"flex", justifyContent:"space-between", marginBottom:3 }}>
            <span>Total: {t.totalInscritos}/{t.totalMaximo}</span>
            {t.fee && <span>${t.fee.toFixed(0)}</span>}
          </div>
        )}
      </>
    ) : null;
    return (
      <div style={{ opacity: temConteudo ? 1 : 0.45 }}>
        <TournSidebarItem
          t={tData}
          isActive={active}
          onClick={onSelect}
          accentColor={t.manuelJogou ? SIDEBAR_ACCENT.pja : SIDEBAR_ACCENT.tour}
          extraPills={extraPills}
          footer={uskidsFooter}
        />
      </div>
    );
  };
  const porId = new Map(allTorneios.map(t => [String(t.t), t]));

  // ── Barra: a mesma nas três vistas (nas do shell entra pelo slot) ─────
  const lead = (<>
    <ToolbarTitle>🏌️ USKids</ToolbarTitle>
    <DataSourcesChip sources={fileMeta} />
    <ToolbarSep />
    {/* Vistas: o mesmo interruptor segmentado do resto do site. */}
    <TabRow active={tab} onChange={handleTabChange} style={{ flexShrink:0 }}
      tabs={TABS.map(tb => ({ key: tb.id, label: tb.label, count: tb.badge ?? undefined }))} />
    <ToolbarSep />
    <button
        className={"tourn-tab tourn-tab-sm" + (filterManuel ? " active" : "")}
        onClick={() => setFilterManuel(v => !v)}
        style={filterManuel
          ? { flexShrink:0, background:"var(--bg-success-subtle)", borderColor:"var(--color-good)", color:"var(--color-good-dark)" }
          : { flexShrink:0, background:"var(--bg-muted)", color:"var(--text-2)", borderColor:"var(--border)" }}>
        ★ Manuel
      </button>
      {/* Categorias: vigiam-se todas, a lista mostra só as ligadas. Azul, para
          não se confundirem com o ★ Manuel. */}
      {mostrarChips && (<>
        <ToolbarSep />
        {contagemCat.map(c => {
          const on = catVisiveis.has(c.tipo);
          return (
            <button key={c.tipo}
              className={"tourn-tab tourn-tab-sm" + (on ? " active" : "")}
              onClick={() => alternarCategoria(c.tipo)}
              aria-pressed={on}
              title={on ? "Clicar para esconder" : `${c.n} escondidos — clicar para mostrar`}
              style={on
                ? { flexShrink:0, background:"var(--bg-info)", borderColor:"var(--border-info)", color:"var(--color-info)" }
                : { flexShrink:0, background:"var(--bg-muted)", color:"var(--text-3)", borderColor:"var(--border)", textDecoration:"line-through" }}>
              {c.label} <span className="fs-10" style={{ opacity:.7 }}>{c.n}</span>
            </button>
          );
        })}
      </>)}
    {tab === "resultados" && (
      <button
        className={"tourn-tab tourn-tab-sm" + (filterSmallField ? " active" : "")}
        onClick={() => setFilterSmallField(v => !v)}
        title={`Ocultar torneios com menos de ${MIN_FIELD} jogadores`}
        style={filterSmallField
          ? { flexShrink:0, background:"var(--bg-success-subtle)", borderColor:"var(--color-good)", color:"var(--color-good-dark)" }
          : { flexShrink:0, background:"var(--bg-muted)", color:"var(--text-2)", borderColor:"var(--border)" }}>
        Campo ≥{MIN_FIELD}
      </button>
    )}
  </>);
  const trail = (
    <a href="https://uskids-golf.vercel.app/" target="_blank" rel="noopener noreferrer"
      className="fs-11 fw-600" style={{ flexShrink:0, color:"var(--accent)", border:"1px solid var(--accent)", borderRadius:5, padding:"3px 8px", textDecoration:"none", whiteSpace:"nowrap", display:"inline-flex", alignItems:"center", gap:3 }}>
      Histórico ↗
    </a>
  );

  return (
    <ArMapCtx.Provider value={arMapCtxValue}>
    <KidsLinkCtx.Provider value={kidsMap}>
    <DataSourcesProvider tournaments={[]}>
    <div className="tourn-layout" style={{ height:"calc(100vh - 52px)" }}>

      {/* Torneios e Resultados: o CircuitShell, como as outras páginas de
          circuito (20/10/2026). Os controlos da página entram na barra dele. */}
      <CircuitToolbarSlotCtx.Provider value={{ lead, trail, hideTitle: true }}>
        <CircuitShell
          entries={shellEntries}
          config={tab === "campo" ? configCampo : configResultados}
          loading={tab === "resultados" && !resultsData}
          pastEditionsPool={edicoesPool}
          selectedId={selectedT != null ? String(selectedT) : undefined}
          onSelectEntry={(e) => {
            // Escolher um torneio sai da vista ⓘ Info — num só setSearchParams
            // (o do shell, setInfo(null), seria apagado por este).
            const t = parseInt(e.id, 10) || null;
            setSelectedTState(t);
            setSearchParams(prev => {
              const n = new URLSearchParams(prev);
              if (t != null) n.set("t", String(t)); else n.delete("t");
              n.delete("info");
              return n;
            }, { replace: true });
          }}
          selectedInfo={selectedInfo}
          onSelectInfo={setSelectedInfo}
          renderSidebarItem={(e, { active, onSelect }) => {
            const t = porId.get(e.id);
            return t ? renderItem(t, active, onSelect) : null;
          }}
        />
      </CircuitToolbarSlotCtx.Provider>

    {/* ← fecha tourn-layout */}
    </div>
    </DataSourcesProvider>
    </KidsLinkCtx.Provider>
    </ArMapCtx.Provider>
  );
}
