/**
 * src/data/uskidsResultsLoader.ts — os resultados USKids, num só sítio.
 *
 * Junta os `uskids_torneios_completos(N).json` (permanentes, têm prioridade) e o
 * `uskids-results.json` (gerado; só acrescenta os torneios que faltam), passa as
 * jardas a metros e aplica as correcções (overrides IE/WD, voltas encurtadas).
 * Usado pela /uskids e pelos Próximos torneios do Kids 2 (20/10/2026). Carrega
 * uma vez por sessão; quem chega depois recebe a mesma promessa e o registo dos
 * ficheiros (para o chip das fontes).
 */
import { cachedFetchJson } from "./fetchCache";
import { isManuelByName } from "../constants/manuel";
import { converterTorneioCompleto } from "../ui/converterTorneioCompleto";
import type { DataSource } from "../ui/DataSources";
import type { ResultsData, RondaJogador, TorneioResult } from "../ui/uskidsTypes";

// ⚠ Manter em sincronia com o número real de ficheiros uskids_torneios_completos(N).json
// em public/data/. Ao adicionar novos ficheiros, incrementar AQUI e também em
// KIDSdataLoader.ts (array `coreTasks`, kind "completo").
export const TORNEIOS_COMPLETOS_COUNT = 41; // (41) = Local Tours Jutland + Copenhagen (DK), Fall 2025 + Spring 2026

let _promise: Promise<ResultsData> | null = null;
const _ficheiros: DataSource[] = [];
const _ouvintes = new Set<(s: DataSource) => void>();
function registar(s: DataSource) {
  _ficheiros.push(s);
  for (const f of _ouvintes) f(s);
}

/** Resultados USKids (todos os torneios jogados). `onFile` recebe o estado de
 *  cada ficheiro (também os já carregados antes desta chamada). */
export function loadUskidsResults(onFile?: (s: DataSource) => void): Promise<ResultsData> {
  if (onFile) {
    for (const s of _ficheiros) onFile(s);
    _ouvintes.add(onFile);
  }
  if (!_promise) _promise = carregar();
  return _promise;
}

function carregar(): Promise<ResultsData> {
  // Cache diária: o browser só volta a pedir o ficheiro gerado uma vez por dia.
  const daily = new Date().toISOString().slice(0, 10);
  const historicosUrls = Array.from({ length: TORNEIOS_COMPLETOS_COUNT }, (_, i) =>
    `/data/uskids_torneios_completos(${i + 1}).json`
  );

  return Promise.all([
    // ficheiro auto-gerado — cache diária para não re-buscar em cada refresh
    fetch(`/data/uskids-results.json?v=${daily}`)
      .then(r => {
        if (!r.ok) {
          registar({ path: "/data/uskids-results.json", status: "error", error: `HTTP ${r.status}`, group: "results" });
          return { gerado_em: "", resultados: [] };
        }
        return r.json().then((d: ResultsData) => {
          registar({ path: "/data/uskids-results.json", status: "loaded", count: d.resultados?.length, group: "results" });
          return d;
        });
      })
      .catch((): ResultsData => ({ gerado_em: "", resultados: [] })),
    // ficheiros históricos permanentes (usam cachedFetchJson — cached em memória na sessão)
    ...historicosUrls.map((url) => cachedFetchJson(url).then(d => {
      registar({ path: url, status: "loaded", group: "completos" });
      return d;
    }).catch(e => {
      registar({ path: url, status: "error", error: String(e), group: "completos" });
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
          : converterTorneioCompleto(entrada) as TorneioResult | null; // converter do formato raw (antigo ou novo)
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
    fixShortenedRounds(merged);

    return { gerado_em: auto.gerado_em, resultados: merged };
  });
}

// ── Overrides para jogadores IE/WD excluídos pelo scraper ──
// Voltas encurtadas (13/10/2026 — PGA Golf Club Invitational, Boys 12: a R2
// ficou nos 9 buracos). A USKids manda -1 nos buracos por jogar e o ±par vinha
// contra o par dos 18 (−38). Muta in-place: buracos por jogar passam a 0 (a
// convenção do site) e o score/±par/buracos contam só os jogados.
function fixShortenedRounds(resultados: TorneioResult[]): void {
  for (const t of resultados) for (const e of t.escaloes || []) for (const r of e.rondas || []) {
    const lb = r.leaderboard || r.jogadores || [];
    for (const j of lb) {
      const st = j.strokes;
      if (!Array.isArray(st) || !st.some((s) => s < 0)) continue;
      j.strokes = st.map((s) => (s > 0 ? s : 0));
      const played = j.strokes.map((s, i) => (s > 0 ? i : -1)).filter((i) => i >= 0);
      if (!played.length) continue;
      j.score = played.reduce((s, i) => s + j.strokes[i], 0);
      j.buracos = played.length;
      const par = played.reduce((s, i) => s + (r.par?.[i] ?? 0), 0);
      j.to_par = par > 0 ? j.score - par : null;
    }
    // Se TODO o escalão jogou os mesmos buracos (volta encurtada pela
    // organização), a volta passa a ser só desses buracos — senão todos ficavam
    // «incompletos» e sem lugar no Resumo.
    const parLen = r.par?.length ?? 0;
    const sets = lb.filter((j) => Array.isArray(j.strokes) && j.strokes.some((s) => s > 0))
      .map((j) => j.strokes.map((s, i) => (s > 0 ? i : -1)).filter((i) => i >= 0).join(","));
    if (!sets.length || new Set(sets).size !== 1) continue;
    const keep = sets[0].split(",").map(Number);
    if (!parLen || keep.length >= parLen) continue;
    const pick = <T,>(a: T[] | undefined) => (Array.isArray(a) && a.length === parLen ? keep.map((i) => a[i]) : a);
    r.par = pick(r.par) ?? r.par;
    r.si = pick(r.si) ?? r.si;
    r.metros = pick(r.metros);
    r.buracos = keep.length;
    r.total_par = r.par.reduce((s, p) => s + p, 0);
    for (const j of lb) if (Array.isArray(j.strokes) && j.strokes.length === parLen) j.strokes = keep.map((i) => j.strokes[i]);
  }
}

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
            _nota: "R1: score oficial com penalização (91). Jogou 86 — bogey real no buraco 5, mas não confirmou o cartão na altura; avisou a organização depois e a penalização ficou no buraco 5 (5 → 10). A R2 (79) não muda.",
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
      const existing = lb.find(j => isManuelByName(j.nome));
      // Já vem nos dados (a USKids passou a publicá-lo): só se junta a nota.
      if (existing && ovRd.jogador._nota) existing._nota = ovRd.jogador._nota;
      if (!existing) {
        lb.push(ovRd.jogador);
        if (rd.leaderboard) rd.leaderboard = lb;
        else if (rd.jogadores) rd.jogadores = lb;
        else rd.leaderboard = lb;
      }
    }
  }
}

