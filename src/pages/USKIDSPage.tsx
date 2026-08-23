// @refresh reset
import { useEffect, useState, useMemo, useTransition, useCallback } from "react";
import SidebarToggle from "../ui/SidebarToggle";
import { Toolbar, ToolbarTitle, ToolbarSep } from "../ui/Toolbar";
import { DataSourcesChip, DataSourcesProvider, type DataSource } from "../ui/DataSources";
import { useMasterDetail } from "../hooks/useMasterDetail";
import SectionErrorBoundary from "../ui/SectionErrorBoundary";
import LoadingState from "../ui/LoadingState";
import { useSearchParams, Link } from "react-router-dom";
import { isoDate, fmtDate, monthLabel, fmtToPar } from "../utils/format";
import EmptyState from "../ui/EmptyState";
import { TournSidebarItem, type SidebarItemTournament } from "../ui/TournSidebarItem";
import { SIDEBAR_ACCENT, ManuelPill } from "../ui/PillBadge";
import TabResultados from "../ui/TabResultados";
import TabCampoDetalhe, { KidsLink } from "../ui/TabCampoDetalhe";
import TorneioRivaisDetalhe from "../ui/TorneioRivaisDetalhe";
import { converterTorneioCompleto } from "../ui/converterTorneioCompleto";
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
import type { UskidsDrawsData } from "../ui/uskidsTypes"; // pairings (Draw R{n})



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
}



interface FieldData { gerado_em: string; torneios: Torneio[]; }

// ─────────────────────────────────────────────
// TIPOS — RESULTADOS
// ─────────────────────────────────────────────
interface RondaJogador {
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
// CONSTANTES
// ─────────────────────────────────────────────

// ── Overrides para jogadores IE/WD excluídos pelo scraper ──
// Muta o array de resultados in-place, injectando jogadores em falta.
function applyResultOverrides(resultados: TorneioResult[]): void {
  const OVERRIDES: Array<{
    tCode: number;
    escalaoNome: string;       // escalão correcto
    fixIsManuel?: boolean;     // corrigir is_manuel flag
    rounds: Array<{
      ronda: number;
      jogador: RondaJogador;
    }>;
  }> = [
    {
      // Marco Simone 2026 Boys 11 — Manuel marcado IE (Ineligible) pela USKids.
      //
      // O que aconteceu: o Manuel fez bogey real no buraco 5 da R1 (5 pancadas),
      // mas não confirmou o scorecard nessa altura. Alertou a organização
      // posteriormente e foi-lhe aplicada uma penalidade.
      //
      //   - Score real jogado:           R1=86 (bogey hole 5).
      //   - Score oficial com penalidade: R1=91 (a penalidade acumula no
      //     buraco 5, que sobe de 5 para 10). R2=79 sem alteração.
      //
      // Política do site (2026-05-17): mostrar SEMPRE o score oficial (com
      // penalidade) porque é assim que aparece nos listings/rankings USKids
      // e é o que o `uskids-member-history-slim.json` já regista (alimentando
      // o canónico do KIDS2). Este override re-injecta o Manuel no leaderboard
      // de `uskids-results.json` com o mesmo valor oficial.
      //
      // Score jogado (para referência futura): R1=86,
      //   strokes=[5,5,4,3,5,4,4,9,5, 6,4,5,3,4,4,5,6,5], to_par=14.
      tCode: 21080,
      escalaoNome: "Boys 11",
      fixIsManuel: true,
      rounds: [
        {
          ronda: 1,
          jogador: {
            nome: "Manuel Medeiros", pais: "PT", cidade: "Funchal, Madeira",
            tee: "Tee 4", pontos: 0, score: 91, buracos: 18,
            start_time: "", grupo: 0,
            to_par: 19,
            strokes: [5,5,4,3,10,4,4,9,5, 6,4,5,3,4,4,5,6,5],
          } as RondaJogador,
        },
        {
          ronda: 2,
          jogador: {
            nome: "Manuel Medeiros", pais: "PT", cidade: "Funchal, Madeira",
            tee: "Tee 4", pontos: 0, score: 79, buracos: 18,
            start_time: "", grupo: 0,
            to_par: 7,
            strokes: [4,5,4,3,3,5,4,4,5, 4,4,5,4,4,5,5,5,6],
          } as RondaJogador,
        },
      ],
    },
  ];

  for (const ov of OVERRIDES) {
    const tourn = resultados.find(r => r.t === ov.tCode);
    if (!tourn) continue;

    // Corrigir is_manuel: desligar de todos os escalões, ligar no correcto
    if (ov.fixIsManuel) {
      for (const esc of tourn.escaloes) esc.is_manuel = false;
      const target = tourn.escaloes.find(e => e.nome === ov.escalaoNome);
      if (target) {
        target.is_manuel = true;
        tourn.escalao_manuel = target.age_group;
      }
    }

    // Injectar jogador no leaderboard de cada ronda
    const esc = tourn.escaloes.find(e => e.nome === ov.escalaoNome);
    if (!esc) continue;
    for (const ovRd of ov.rounds) {
      const rd = esc.rondas.find(r => r.ronda === ovRd.ronda);
      if (!rd) continue;
      const lb = rd.leaderboard ?? rd.jogadores ?? [];
      // Não duplicar se já existir
      const exists = lb.some(j =>
        j.nome.toLowerCase().includes("medeiros") && j.nome.toLowerCase().includes("manuel")
      );
      if (!exists) {
        lb.push(ovRd.jogador);
        if (rd.leaderboard) rd.leaderboard = lb;
        else if (rd.jogadores) rd.jogadores = lb;
        else rd.leaderboard = lb;
      }
    }
  }
}





// ─────────────────────────────────────────────
// TAB RIVAIS
// ─────────────────────────────────────────────



/* ════════════════════════════════════════════════════════════════
   RivCell — célula de resultado passado (score + posição)
   ════════════════════════════════════════════════════════════════ */
/* ════════════════════════════════════════════════════════════════
   TabRivais — componente principal
   ════════════════════════════════════════════════════════════════ */
function TabRivais({ resultados, fieldData, torneiosComManuel, selectedT, setSelectedT, autoRivals, showTabela, setShowTabela, futureTorneios }: {
  resultados: TorneioResult[];
  fieldData: FieldData | null;
  torneiosComManuel: TorneioComManuel[];
  selectedT: number | null;
  setSelectedT: (t: number | null) => void;
  autoRivals: AutoRivalPlayer[];
  showTabela: boolean;
  setShowTabela: (v: boolean) => void;
  futureTorneios?: TorneioComManuel[];
}) {
  const kidsMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of autoRivals) m.set(normNameAuto(r.n), r.n);
    return m;
  }, [autoRivals]);

  const arMap = useMemo(() => {
    const m = new Map<string, AutoRivalPlayer>();
    for (const r of autoRivals) m.set(normNameAuto(r.n), r);
    return m;
  }, [autoRivals]);

  const selectedTorneio = !showTabela && selectedT != null
    ? torneiosComManuel.find(t => t.t === selectedT) ?? null
    : null;

  const handleSelectTorneio = (t: number) => {
    setShowTabela(false);
    setSelectedT(t);
  };

  if (showTabela) {
    const futureCols = (futureTorneios ?? []).map(t => ({
      tid: `usk${t.t}`,
      short: t.name.replace(/\s*\d{4}$/, "").slice(0, 12),
      escalao: t.escalaoManuel ?? "",
      url: undefined as string | undefined,
    }));
    return (
      <TabelaGlobal
        autoRivals={autoRivals}
        futureCols={futureCols}
        fieldData={fieldData as any /* FieldData local ≠ FieldData do KIDSdataLoader */}
        KidsLink={KidsLink}
      />
    );
  }

  if (selectedTorneio) {
    return (
      <TorneioRivaisDetalhe
        torneio={selectedTorneio}
        resultados={resultados}
        fieldData={fieldData as any /* FieldData local ≠ FieldData do uskidsTypes */}
        torneiosComManuel={torneiosComManuel}
        arMap={arMap}
        kidsMap={kidsMap}
      />
    );
  }

  const today = new Date().toISOString().slice(0, 10);
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
      <div className="h-sm" style={{ marginBottom:4 }}>Torneios do Manuel ({torneiosComManuel.length})</div>
      {torneiosComManuel.map(t => {
        const isFuture = isoDate(t.date_inicio) > today;
        const resT = resultados.find(r => r.t === t.t);
        // Scout view (/kids2/next-t?v=scout&t=usk{tcode}) — field intel: lista de inscritos com
        // tier, idade e confronto vs Manuel; abre em nova aba (KIDS2).
        return (
          <div key={t.t}
            className="course-item"
            style={{ display:"flex", alignItems:"stretch", width:"100%", padding:0 }}>
            <button
              style={{ flex:1, textAlign:"left", padding:"12px 16px", background:"transparent", border:0, cursor:"pointer", color:"inherit", font:"inherit", minWidth:0 }}
              onClick={() => handleSelectTorneio(t.t)}>
              <div className="h-md" style={{ marginBottom:4 }}>{t.name}</div>
              <div className="detail-sub">
                {t.date_inicio && <span className="muted">📅 {fmtDate(t.date_inicio)}</span>}
                {t.escalaoManuel && <span className="chip">{t.escalaoManuel}</span>}
                {isFuture
                  ? <span className="p p-sm toggle-pill-info">inscrito</span>
                  : resT && <span className="p p-sm toggle-pill-success">resultados</span>
                }
              </div>
            </button>
            <Link
              to={`/kids2/next-t?v=scout&t=usk${t.t}`}
              target="_blank"
              rel="noreferrer"
              title="Scout — campo de inscritos com tier, idade e confronto vs Manuel (abre KIDS2 em nova aba)"
              onClick={(e) => e.stopPropagation()}
              style={{
                display:"flex", alignItems:"center", justifyContent:"center",
                padding:"0 14px", borderLeft:"1px solid var(--border)",
                color:"var(--color-info)", textDecoration:"none", fontSize: "var(--fs-18)",
              }}>
              🔭
            </Link>
          </div>
        );
      })}
    </div>
  );
}

// COMPONENTE PRINCIPAL
// ─────────────────────────────────────────────
type Tab = "campo" | "resultados" | "rivais";

// Tipo explícito para entradas do mapa allTorneios — elimina os (as any) casts
type TorneioEntry = {
  t: number; name: string; date: string; dateFim?: string;
  temResultados: boolean; temCampo: boolean;
  inscritos?: number; maximo?: number; vagas?: number;
  escalaoManuel?: string; rondas?: number; fee?: number;
  campo?: string; totalInscritos?: number; totalMaximo?: number;
  urlResultados?: string; manuelJogou?: boolean; terminado?: boolean;
  manuelPos?: number | null; manuelScore?: number | null; nPaises?: number;
};

export default function USKidsFieldPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  const VALID_TABS: Tab[] = ["campo", "resultados", "rivais"];
  const paramTab = searchParams.get("tab") as Tab | null;

  const [fieldData,   setFieldData]   = useState<FieldData | null>(null);
  const [resultsData, setResultsData] = useState<ResultsData | null>(null);
  const [drawsData,   setDrawsData]   = useState<UskidsDrawsData | null>(null);
  const [autoRivals,  setAutoRivals]  = useState<AutoRivalPlayer[]>([]);
  const [erro,        setErro]        = useState<string | null>(null);
  const [tab, setTabState] = useState<Tab>(() => {
    if (paramTab && VALID_TABS.includes(paramTab)) return paramTab;
    return "campo";
  });
  const setTab = (t: Tab) => {
    setTabState(t);
    setSearchParams(prev => { const n = new URLSearchParams(prev); n.set("tab", t); return n; }, { replace: true });
  };
  const md = useMasterDetail();
  const [filterManuel, setFilterManuel] = useState(true);
  // Ocultar torneios com campo pequeno (< 60 jogadores) na tab Resultados
  const [filterSmallField, setFilterSmallField] = useState(false);
  const MIN_FIELD = 60;
  // Pesquisa por nome/campo na sidebar (tabs Torneios + Resultados)
  const [search, setSearch] = useState("");

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
  const [showRivaisTabela, setShowRivaisTabela] = useState(false);

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
        upsertFileMeta({ path: "/data/uskids-field.json", status: "loaded", count: d.torneios?.length, group: "field" });
        if (d.torneios.length) setSelectedTState(prev => prev !== null ? prev : d.torneios[0].t);
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

    // ── Carregar resultados: N ficheiros históricos permanentes + ficheiro auto-gerado ──
    // Os históricos têm prioridade; o auto-gerado apenas acrescenta torneios ainda não cobertos.
    // ⚠ Manter em sincronia com o número real de ficheiros uskids_torneios_completos(N).json
    // em public/data/. Ao adicionar novos ficheiros, incrementar AQUI e também em
    // KIDSdataLoader.ts (array `coreTasks`, kind "completo").
    const TORNEIOS_COMPLETOS_COUNT = 40;
    const historicosUrls = Array.from({ length: TORNEIOS_COMPLETOS_COUNT }, (_, i) =>
      `/data/uskids_torneios_completos(${i + 1}).json`
    );

    Promise.all([
      // ficheiro auto-gerado — cache diária para não re-buscar em cada refresh
      fetch(`/data/uskids-results.json?v=${daily}`)
        .then(r => {
          if (!r.ok) {
            upsertFileMeta({ path: "/data/uskids-results.json", status: "error", error: `HTTP ${r.status}`, group: "results" });
            return { gerado_em: "", resultados: [] };
          }
          return r.json().then((d: ResultsData) => {
            upsertFileMeta({ path: "/data/uskids-results.json", status: "loaded", count: d.resultados?.length, group: "results" });
            return d;
          });
        })
        .catch((): ResultsData => ({ gerado_em: "", resultados: [] })),
      // ficheiros históricos permanentes (usam cachedFetchJson — cached em memória na sessão)
      ...historicosUrls.map((url) => cachedFetchJson(url).then(d => {
        upsertFileMeta({ path: url, status: "loaded", group: "completos" });
        return d;
      }).catch(e => {
        upsertFileMeta({ path: url, status: "error", error: String(e), group: "completos" });
        return null;
      })),
    ]).then(([autoGerado, ...historicos]) => {
      const auto = autoGerado as ResultsData;

      // 1. Construir lista a partir dos históricos permanentes (têm prioridade)
      // Os ficheiros históricos têm formato raw {t, meta, flights} → converter primeiro
      const historicosResultados: TorneioResult[] = [];
      const tExistentes = new Set<number>();

      for (const raw of historicos) {
        if (!raw) continue;
        // Pode ser array de entradas raw ou objecto único raw
        const lista: any[] = Array.isArray(raw) ? raw : [raw];
        for (const entrada of lista) {
          // Suporte novo formato (signupanytime_t) e antigo (t)
          const tCode: number | undefined = entrada?.signupanytime_t ?? entrada?.t;
          if (!tCode || tExistentes.has(tCode)) continue;
          // Detectar formato: já convertido tem {escaloes}; raw tem {meta,flights} ou {signupanytime_t}
          const tr: TorneioResult | null = entrada.escaloes
            ? entrada as TorneioResult          // já no formato TorneioResult
            : converterTorneioCompleto(entrada); // converter do formato raw (antigo ou novo)
          if (tr) {
            historicosResultados.push(tr);
            tExistentes.add(tr.t);
          }
        }
      }

      // 2. O auto-gerado apenas entra se o t-code ainda não está coberto pelos históricos
      const autoExtras = auto.resultados.filter(r => !tExistentes.has(r.t));

      // 2b. Converter yards → metros nas rondas do auto-gerado (o JSON tem yards, não metros)
      for (const t of autoExtras) {
        for (const esc of t.escaloes ?? []) {
          for (const rd of esc.rondas ?? []) {
            if (!rd.metros?.length && (rd as any).yards?.length) {
              rd.metros = ((rd as any).yards as number[]).map(y => Math.round(y * 0.9144));
            }
          }
        }
      }

      // 3. Injectar overrides para jogadores excluídos pelo scraper (IE/WD)
      const merged = [...historicosResultados, ...autoExtras];
      applyResultOverrides(merged);

      setResultsData({
        gerado_em: auto.gerado_em,
        resultados: merged,
      });
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
        });
      }
    }
    return [...map.values()]
      .filter(t => t.name && t.date)
      .sort((a, b) => isoDate(a.date).localeCompare(isoDate(b.date)));
  }, [torneiosCampo, torneiosResultados]);

  // Torneios onde o Manuel participou ou está inscrito (para tab Rivais)
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

  const nRivais = torneiosComManuel.length || null;

  // useMemo ANTES dos early returns — obrigatório pelas Rules of Hooks
  const arMapCtxValue = useMemo(() => {
    const m = new Map<string, AutoRivalPlayer>();
    for (const r of autoRivals) m.set(normNameAuto(r.n), r);
    return m;
  }, [autoRivals]);

  // Torneio de resultados mais RECENTE (allTorneios está ordenado por data asc,
  // logo o último com resultados é o mais recente). Usado como default ao abrir
  // a tab Resultados.
  const ultimoResultadoT = useMemo(() => {
    for (let i = allTorneios.length - 1; i >= 0; i--) {
      if (allTorneios[i].temResultados) return allTorneios[i].t;
    }
    return torneiosResultados.length ? torneiosResultados[0].t : null;
  }, [allTorneios, torneiosResultados]);

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
    if (newTab !== "rivais") setShowRivaisTabela(false);
    if (newTab === "resultados") {
      // Ir para o torneio mais recente, a menos que o seleccionado já tenha resultados.
      const exists = selectedT != null && torneiosResultados.some(t => t.t === selectedT);
      if (!exists && ultimoResultadoT != null) setSelectedT(ultimoResultadoT);
    }
  };

  const TABS: { id: Tab; label: string; badge: number | null }[] = [
    { id:"campo",      label:"⛳ Torneios",   badge: fieldData.torneios.length },
    { id:"resultados", label:"🏆 Resultados", badge: nResultados },
    { id:"rivais",     label:"🤝 Rivais",     badge: nRivais },
  ];

  const selectedFieldTorneio = fieldData.torneios.find(t => t.t === selectedT) ?? null;

  // ── Render functions para o sidebar — extraídas dos IIFEs para melhor legibilidade ──

  const renderSidebarRivais = () => {
    const today = new Date().toISOString().slice(0, 10);
    return (
      <>
        {/* ── Tabela global (entrada fixa no topo) ── */}
        <button
          className={`course-item${showRivaisTabela ? " active" : ""}`}
          style={{ padding:"10px 14px", display:"block", width:"100%", textAlign:"left", borderBottom:"2px solid var(--border-light)" }}
          onClick={() => { setShowRivaisTabela(true); setSelectedT(null); md.onSelect(); }}>
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            <span style={{ fontSize: "var(--fs-15)" }}>📊</span>
            <span className="fs-13 fw-700" style={{ color: showRivaisTabela ? "var(--accent)" : "var(--text)" }}>
              Tabela global
            </span>
            <span className="p p-sm p-muted fs-10" style={{ marginLeft:"auto" }}>
              {torneiosComManuel.length} torneios
            </span>
          </div>
          <div className="fs-11 c-text-3" style={{ marginTop:2 }}>
            Todos os jogadores × todos os torneios
          </div>
        </button>

        <div className="sidebar-section-title">{torneiosComManuel.length} torneios</div>
        {torneiosComManuel.length === 0 && (
          <div className="muted fs-12" style={{ padding:"16px 12px" }}>Sem torneios com o Manuel</div>
        )}
        {torneiosComManuel.map(t => {
          const active = !showRivaisTabela && t.t === selectedT;
          const isFuture = isoDate(t.date_inicio) > today;
          const resT = resultsData?.resultados.find(r => r.t === t.t);
          const temResultados = !isFuture && !!resT;
          return (
            <div key={t.t}
              className={`course-item${active ? " active" : ""}`}
              style={{ display:"flex", alignItems:"stretch", width:"100%", padding:0 }}>
              <button
                style={{ flex:1, padding:"9px 10px 9px 12px", textAlign:"left", background:"transparent", border:0, cursor:"pointer", color:"inherit", font:"inherit", minWidth:0 }}
                onClick={() => { setShowRivaisTabela(false); setSelectedT(t.t); md.onSelect(); }}>
                <div className="fs-13" style={{ fontWeight: active ? 700 : 600, color:"var(--text)",
                  overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", marginBottom:3 }}>
                  {t.name.replace(/\s*\d{4}$/, "")} <span className="fs-12 fw-400 c-text-3">'{isoDate(t.date_inicio).slice(2,4)}</span>
                </div>
                <div style={{ display:"flex", gap:4, flexWrap:"wrap", alignItems:"center" }}>
                  <span className="fs-11 c-text-3">{fmtDate(t.date_inicio)}</span>
                  {t.escalaoManuel && (
                    <span className="p p-sm p-muted fs-10">{t.escalaoManuel}</span>
                  )}
                  {temResultados && (
                    <span className="p p-sm fs-10 toggle-pill-success">
                      resultados
                    </span>
                  )}
                  {isFuture && (
                    <span className="p p-sm fs-10 toggle-pill-info">
                      inscrito
                    </span>
                  )}
                </div>
              </button>
              <Link
                to={`/kids2/next-t?v=scout&t=usk${t.t}`}
                target="_blank"
                rel="noreferrer"
                title="Scout — campo de inscritos com tier vs Manuel (KIDS2, nova aba)"
                onClick={(e) => e.stopPropagation()}
                style={{
                  display:"flex", alignItems:"center", justifyContent:"center",
                  padding:"0 10px", color:"var(--color-info)", textDecoration:"none", fontSize: "var(--fs-14)",
                }}>
                🔭
              </Link>
            </div>
          );
        })}
      </>
    );
  };

  const renderSidebarTorneios = () => {
    const manuelFilter = (t: TorneioEntry) => !filterManuel || t.manuelJogou;
    // Filtro de campo pequeno: só na tab Resultados. Usa totalInscritos
    // (= soma de participantes na última ronda de cada escalão).
    const fieldFilter = (t: TorneioEntry) =>
      !(filterSmallField && tab === "resultados") || (t.totalInscritos ?? 0) >= MIN_FIELD;
    // Pesquisa por nome do torneio ou campo (case/acentos-insensível).
    const q = normNameAuto(search);
    const searchFilter = (t: TorneioEntry) =>
      !q || normNameAuto(t.name).includes(q) || normNameAuto(t.campo ?? "").includes(q);
    const activeList = (tab === "campo"
      ? allTorneios.filter(t => !t.terminado && manuelFilter(t))
      : allTorneios.filter(t => manuelFilter(t) && fieldFilter(t))
    ).filter(searchFilter);

    const buildMonthMap = (list: TorneioEntry[]) => {
      const monthMap: Record<string, TorneioEntry[]> = {};
      const currentYear = new Date().getFullYear().toString();
      for (const t of list) {
        const iso = isoDate(t.date);
        const yr = iso ? iso.substring(0, 4) : "?";
        const mo = iso ? iso.substring(0, 7) : "?";
        const key = (yr === currentYear || yr === "?") ? mo : yr;
        if (!monthMap[key]) monthMap[key] = [];
        monthMap[key].push(t);
      }
      return monthMap;
    };
    const monthMap = buildMonthMap(activeList);

    const today = new Date().toISOString().substring(0, 7);
    const currentYear = new Date().getFullYear().toString();

    const sortKeys = (map: Record<string, TorneioEntry[]>, reverse?: boolean) => {
      const allKeys = Object.keys(map);
      const futureKeys = allKeys.filter(k => k >= today || (k.length === 4 && k > currentYear)).sort();
      const pastKeys   = allKeys.filter(k => k <  today && !(k.length === 4 && k > currentYear)).sort();
      if (reverse) return [...pastKeys, ...futureKeys];
      return [...futureKeys, ...pastKeys];
    };

    // Torneios: futuros primeiro (asc). Resultados: mais RECENTES primeiro (desc)
    // — para o "último torneio" ficar no topo, alinhado com o default de selecção.
    const mainKeys = tab === "resultados"
      ? Object.keys(monthMap).sort().reverse()
      : sortKeys(monthMap);

    const renderItem = (t: TorneioEntry, dimmed?: boolean) => {
      const active = t.t === selectedT;
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
          <Link
            to={`/kids2/next-t?v=scout&t=usk${t.t}`}
            target="_blank"
            rel="noreferrer"
            onClick={e => e.stopPropagation()}
            title="Scout — campo de inscritos com tier vs Manuel (KIDS2, nova aba)"
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
      const uskidsFooter = (!dimmed && t.temCampo) ? (
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
        <div key={t.t} style={{ opacity: dimmed ? 0.55 : (temConteudo ? 1 : 0.45) }}>
          <TournSidebarItem
            t={tData}
            isActive={active}
            onClick={() => { setSelectedT(t.t); md.onSelect(); }}
            accentColor={t.manuelJogou ? SIDEBAR_ACCENT.pja : SIDEBAR_ACCENT.tour}
            extraPills={extraPills}
            footer={uskidsFooter}
          />
        </div>
      );
    };

    const renderGroup = (gmap: Record<string, TorneioEntry[]>, keys: string[], dimmed?: boolean) =>
      keys.map(key => {
        // Resultados: dentro do mês, mais recente primeiro (gmap está asc por data).
        const items = tab === "resultados" ? [...gmap[key]].reverse() : gmap[key];
        return (
          <div key={key}>
            <div className="sidebar-section-title-dark">{monthLabel(key)}</div>
            {items.map(t => renderItem(t, dimmed))}
          </div>
        );
      });

    if (!mainKeys.length) {
      return (
        <div className="muted fs-12" style={{ padding:"20px 14px", textAlign:"center" }}>
          {search ? `Sem torneios para "${search}"` : "Sem torneios"}
        </div>
      );
    }
    return <>{renderGroup(monthMap, mainKeys)}</>;
  };

  return (
    <ArMapCtx.Provider value={arMapCtxValue}>
    <DataSourcesProvider tournaments={[]}>
    <div className="tourn-layout" style={{ height:"calc(100vh - 52px)" }}>

      {/* ── TOOLBAR ── */}
      <Toolbar>
        <SidebarToggle open={md.open} onToggle={md.toggle} backLabel="Lista" />
        <ToolbarTitle>🏌️ USKids</ToolbarTitle>
        <DataSourcesChip sources={fileMeta} />
        <ToolbarSep />
        {TABS.map(tb => (
          <button key={tb.id}
            onClick={() => handleTabChange(tb.id)}
            className={`tourn-tab tourn-tab-sm${tab === tb.id ? " active" : ""}`}
            style={tab === tb.id ? { flexShrink:0 } : { flexShrink:0, background:"var(--bg-muted)", color:"var(--text-2)", borderColor:"var(--border)" }}>
            {tb.label}
            {(tb.badge ?? 0) > 0 && (
              <span className="fs-10 fw-700" style={{ marginLeft:4, padding:"0 5px", borderRadius:8,
                background: tab === tb.id ? "rgba(255,255,255,0.25)" : "var(--bg-hover)",
                color: tab === tb.id ? "#fff" : "var(--text-3)",
              }}>{tb.badge}</span>
            )}
          </button>
        ))}
        {tab !== "rivais" && (<>
          <ToolbarSep />
          <button
            className={"tourn-tab tourn-tab-sm" + (filterManuel ? " active" : "")}
            onClick={() => setFilterManuel(v => !v)}
            style={filterManuel
              ? { flexShrink:0, background:"var(--bg-success-subtle)", borderColor:"var(--color-good)", color:"var(--color-good-dark)" }
              : { flexShrink:0, background:"var(--bg-muted)", color:"var(--text-2)", borderColor:"var(--border)" }}>
            ★ Manuel
          </button>
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
        <div style={{ flex:1, minWidth:8 }} />
        <a href="https://uskids-golf.vercel.app/" target="_blank" rel="noopener noreferrer"
          className="fs-11 fw-600" style={{ flexShrink:0, color:"var(--accent)", border:"1px solid var(--accent)", borderRadius:5, padding:"3px 8px", textDecoration:"none", whiteSpace:"nowrap", display:"inline-flex", alignItems:"center", gap:3 }}>
          Histórico ↗
        </a>
        <span className="chip" style={{ flexShrink:0 }}>{allTorneios.length} torn.</span>
      </Toolbar>

      {/* ── MASTER-DETAIL ── */}
      <div className="master-detail">

        {/* ── SIDEBAR ── */}
        <div className={`sidebar${md.open ? "" : " sidebar-closed"}`}>

        {/* Pesquisa por nome de torneio (Torneios + Resultados) */}
        {tab !== "rivais" && (
          <div style={{ padding:"8px 10px", borderBottom:"1px solid var(--border-light)", position:"relative" }}>
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="🔍 Procurar torneio…"
              className="fs-13"
              style={{ width:"100%", padding:"6px 26px 6px 10px", borderRadius:6,
                border:"1px solid var(--border)", background:"var(--bg-input, var(--bg-card))",
                color:"var(--text)", outline:"none", boxSizing:"border-box" }}
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                title="Limpar"
                style={{ position:"absolute", right:16, top:"50%", transform:"translateY(-50%)",
                  background:"transparent", border:0, cursor:"pointer", color:"var(--text-3)", fontSize:"var(--fs-14)", lineHeight:1 }}>
                ✕
              </button>
            )}
          </div>
        )}

        {/* Lista de torneios agrupada por mês — OU lista de rivais */}
        <div style={{ overflowY:"auto", flex:1 }}>
          {tab === "rivais" ? renderSidebarRivais() : renderSidebarTorneios()}
        </div>

        <div className="muted fs-10" style={{ padding:"8px 12px", borderTop:"1px solid var(--border-light)" }}>
          signupanytime.com · actualização diária
        </div>
      </div>

      {/* ── CONTEÚDO ── */}
      <div style={{ flex:1, overflow:"auto", padding:"16px 20px" }}>

        {tab === "campo" && (
          selectedFieldTorneio
            ? <TabCampoDetalhe torneio={selectedFieldTorneio as any /* Torneio local ≠ Torneio do uskidsTypes */} />
            : <EmptyState message="Selecciona um torneio na barra lateral" icon="⛳" />
        )}

        {tab === "resultados" && resultsData && (
          <TabResultados greatgolfData={null}
            data={resultsData}
            drawsData={drawsData}
            selectedT={selectedT}
          />
        )}
        {tab === "resultados" && !resultsData && (
          <LoadingState message="A carregar resultados…" size="md" icon="🏆" />
        )}

        {tab === "rivais" && !resultsData && (
          <LoadingState message="A carregar rivais…" size="md" icon="🤝" />
        )}
        {tab === "rivais" && resultsData && (
          <SectionErrorBoundary label="TabRivais">
            <TabRivais
              resultados={resultsData.resultados}
              fieldData={fieldData}
              torneiosComManuel={torneiosComManuel}
              selectedT={selectedT}
              setSelectedT={setSelectedT}
              autoRivals={autoRivals}
              showTabela={showRivaisTabela}
              setShowTabela={setShowRivaisTabela}
              futureTorneios={torneiosComManuel.filter(t => isoDate(t.date_inicio) > new Date().toISOString().slice(0, 10))}
            />
          </SectionErrorBoundary>
        )}

      </div>
      {/* ← fecha master-detail */}
      </div>
    {/* ← fecha tourn-layout */}
    </div>
    </DataSourcesProvider>
    </ArMapCtx.Provider>
  );
}
