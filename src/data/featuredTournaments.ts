/**
 * src/data/featuredTournaments.ts
 * ═══════════════════════════════════════════════════════════════════════
 * TEMPLATE de "torneios em destaque" — torneios FUTUROS (ou em curso) que
 * queremos na sidebar da FPGPage ANTES de existirem resultados em
 * pull-torneios*.json / jovens_YYYY.json.
 *
 * A FPGPage injecta cada entrada como torneio sintético (players: []) desde
 * que exista dados scraped em public/data/fpg-admissions-draws.json — as
 * tabs "Inscrições" e "Draw R{n}" aparecem automaticamente via
 * TournamentDetail (é o mesmo mecanismo criado para o Campeonato Nacional
 * de Jovens 2026, agora generalizado).
 *
 * ── Como adicionar um torneio futuro (checklist) ──────────────────────
 *  1. Acrescentar entrada(s) aqui: `{ ccode, tcode }` chega — nome, data e
 *     campo vêm do scrape. Overrides opcionais quando o nome FPG é feio ou
 *     se quer escalão/links fixos (ver o Nacional 2026 abaixo).
 *     ⚠ Torneios do circuito Drive/Aquapor: normalmente NÃO precisam de
 *     entrada aqui — são AUTO-DESCOBERTOS (o scraper apanha-os na
 *     TournamentsLST via INCLUDE_RX drive/aquapor e a DrivePage injecta-os
 *     por nome). Só adicionar com `series: "tour"|"challenge"|"aquapor"`
 *     (+ `region`) quando é preciso override de nome/região/links.
 *  2. Acrescentar o(s) tcode(s) a scripts/fpg-admissions-scope.json com
 *     `"date": null` (⚠ null salta a validação _suspect de tcode
 *     reutilizado — obrigatório quando a data ainda não é conhecida) e
 *     `_src: "manual-jovens"`.
 *  3. Scrape inicial no PC:
 *       node scripts/scrape-fpg-admissions-draws-node.js --tcodes {ccode}:{tcode},...
 *     (o cron de fim-de-semana mantém-nos actualizados a partir daí; quando
 *     a data real for conhecida, preencher `date` no scope para o filtro
 *     --since do cron os apanhar com precisão.)
 *  4. Nada mais — a UI é 100% data-driven. Ao abrir o detalhe, a tab
 *     Inscrições faz ainda uma verificação LIVE na FPG (via /api/inscricoes)
 *     e assinala "+N novos / −N saíram" face ao último scrape (ver `live`).
 * ═══════════════════════════════════════════════════════════════════════
 */
import { NACIONAL_2026_META, type FpgTournamentData } from "./nacional2026Loader";

export interface FeaturedTournament {
  ccode: string;
  tcode: string;
  /** Onde o torneio vive: "jovens" (default — secção Jovens da FPGPage) ou
   *  uma série Drive ("tour" | "challenge" | "aquapor" — sidebar da DrivePage).
   *  Determina QUAL página injecta o sintético. */
  series?: "jovens" | "tour" | "challenge" | "aquapor";
  /** Override do nome (default: nome scraped da página de admissions FPG). */
  name?: string;
  /** Override do escalão (default: inferido do nome — "Sub N"/"Escalão X"). */
  escalao?: string | null;
  /** Override da data YYYY-MM-DD (default: data scraped). */
  date?: string;
  /** Override do campo (default: campo scraped, se existir). */
  campo?: string | null;
  /** Override do nº de rondas (default: nº de draws capturados, senão 1). */
  rounds?: number;
  /** "nacional" para Campeonatos Nacionais; null para o resto. */
  region?: string | null;
  /** Links extra mostrados no cabeçalho do detalhe (página oficial, termos PDF…). */
  extraLinks?: { label: string; url: string; icon?: string }[];
  /** Verificação LIVE das inscrições ao abrir o detalhe (default true).
   *  Enquanto o torneio não tiver rondas jogadas, o TournamentDetail chama
   *  /api/inscricoes?ccode=X&tcode=Y e mostra "+N novos / −N saíram" face ao
   *  último scrape. Pôr `live: false` para desligar (ex.: evento terminado). */
  live?: boolean;
}

/** Links arquivados do antigo painel "📋 Inscrições 2026" (desactivado
 *  2026-04-27 por encerramento das inscrições). Mantidos no detalhe do
 *  torneio para consulta. */
const NACIONAL_2026_LINKS: FeaturedTournament["extraLinks"] = [
  {
    label: "página oficial FPG",
    url: "https://competicoes.fpg.pt/evento/campeonato-nacional-de-jovens-sub10-12-14-16-18-pga-aroeira/",
    icon: "🏆",
  },
  {
    label: "Termos PDF",
    url: "https://competicoes.fpg.pt/wp-content/uploads/2025/09/Campeonato_Nacional_de_Jovens_Sub18-a-Sub-10.pdf",
    icon: "📋",
  },
];

// ── Helpers partilhados pelas injecções sintéticas (FPGPage + DrivePage) ──

/** Infere o escalão do nome FPG: "(Escalão A)" → "Escalão A"; "Sub 12"/"U12" → "Sub 12". */
export const inferEscalao = (name: string): string | null => {
  const esc = name.match(/\bescal[aã]o\s+([A-Za-z0-9]+)\b/i);
  if (esc) return `Escalão ${esc[1].toUpperCase()}`;
  const sub = name.match(/\bsub[\s\-_]?(\d{1,2})\b/i) || name.match(/\bu(\d{1,2})\b/i);
  return sub ? `Sub ${sub[1]}` : null;
};

/** Remove o sufixo "(Escalão X)" do nome base — o escalão vai para `escalao`.
 *  Necessário para que torneios do mesmo evento com sufixos diferentes sejam
 *  agrupados numa única entrada de sidebar com múltiplos tabs. */
export const stripEscalaoSuffix = (name: string): string =>
  name.replace(/\s*\(\s*escal[aã]o\s+\w+\s*\)/gi, "").replace(/\s+/g, " ").trim();

/** Constrói o torneio SINTÉTICO (players: []) a partir da entrada da config +
 *  dados scraped (fpg-admissions-draws.json). Campos comuns às duas páginas;
 *  cada página acrescenta os seus (`_jovensYear` na FPGPage, etc.) e faz o
 *  cast para o seu tipo Tournament. */
export function buildFeaturedSynthetic(ft: FeaturedTournament, ad: FpgTournamentData): Record<string, unknown> {
  const playerCount = ad.admissions?.totalInscritos ?? (ad.admissions?.players?.length ?? 0);
  // Data: override da config → data do torneio scraped → data do 1º draw
  // (torneios remarcados/manuais podem ter date null no nível do torneio).
  const drawDates = Object.values(ad.draws || {}).map(d => d?.date).filter(Boolean).sort() as string[];
  const date = ft.date || ad.date || drawDates[0] || "";
  const drawRounds = Object.keys(ad.draws || {}).length;
  return {
    name: ft.name || stripEscalaoSuffix(ad.name || "") || `Torneio ${ft.tcode}`,
    ccode: ft.ccode,
    tcode: ft.tcode,
    date,
    campo: ft.campo ?? ad.campo ?? null,
    clube: ft.ccode,
    circuit: "tour",
    series: ft.series ?? "jovens",
    region: ft.region ?? null,
    // Honrar `escalao: null` EXPLÍCITO (torneio multi-escalão, sem tab única) —
    // só inferir quando a config OMITE o campo. Com `??`, o null colapsava para o
    // inferido: o Miramar U25 ("...U25") saía "Sub 25" e a tab "Edições anteriores"
    // deixava de casar com a edição anterior (10564), que não tem escalão ("—").
    escalao: ft.escalao !== undefined ? ft.escalao : inferEscalao(ad.name || ""),
    num: 1,
    rounds: ft.rounds ?? (drawRounds || (ad.admissions as any)?.rounds || 1),
    playerCount,
    players: [],
    _sourceFile: "fpg-admissions-draws.json",
    _admissions: ad.admissions,
    _draws: ad.draws,
    extraLinks: ft.extraLinks,
  };
}

export const FEATURED_TOURNAMENTS: FeaturedTournament[] = [
  // ── Campeonato Nacional de Jovens 2026 — PGA Aroeira II (Maio 2026) ──
  // Meta partilhada com o loader (NACIONAL_2026_META) para não duplicar.
  ...Object.entries(NACIONAL_2026_META).map(([tcode, m]): FeaturedTournament => ({
    ccode: "000",
    tcode,
    name: m.name,
    escalao: m.escalao,
    date: "2026-05-01",
    campo: "PGA Aroeira II",
    rounds: 3,
    region: "nacional",
    extraLinks: NACIONAL_2026_LINKS,
    live: false,  // evento já disputado (Maio 2026) — inscrições encerradas
  })),

  // ── Amendoeira Clube de Golfe — World Kids Golfe, 5 escalões (2026) ──
  // Nome/data/campo vêm do scrape (fpg-admissions-draws.json).
  // tournAdmissions: ccode=179, tcodes 10603-10607.
  { ccode: "179", tcode: "10603" },
  { ccode: "179", tcode: "10604" },
  { ccode: "179", tcode: "10605" },
  { ccode: "179", tcode: "10606" },
  { ccode: "179", tcode: "10607" },

  // ── VIII Miramar Internacional Open U25 — 19-21 Ago 2026 (CGM, ccode 003) ──
  // Inscritos scraped MANUALMENTE das páginas do clube (cgm.pt), NÃO da FPG.
  // São DUAS competições distintas com páginas de inscrição separadas:
  //   • U25 (Sub12→Sub25) — 54 buracos (18/dia) — tcode REAL 10652
  //   • Sub-10           — 27 buracos ( 9/dia) — tcode REAL 10653
  // O Sub-10 é separado de propósito (jogam só 9 buracos/dia), por isso NÃO
  // entra na lista do U25.
  //
  // 2026-08-19: os tcodes reais apareceram nas Classifications da FPG —
  //   scoring.datagolf.pt/pt/Classifications.aspx?ccode=003&tcode=10652 (U25)
  //   scoring.datagolf.pt/pt/Classifications.aspx?ccode=003&tcode=10653 (Sub-10)
  // Substituídos aqui, no teeRegulation.ts e no fpg-admissions-draws.json.
  // Resultados scraped à parte (torneio-003-10652/10653.json, EXTRA_TOURN_FILES
  // na FPGPage). Edições anteriores foram 10564 (U25) + 10565 (Sub10).
  {
    ccode: "003",
    tcode: "10652",
    name: "VIII Miramar Internacional Open U25",
    escalao: null,          // multi-escalão (Sub12→Sub25) — sem tab única
    date: "2026-08-19",     // 19-21 Ago 2026, 54 buracos (18/dia)
    campo: "Miramar",
    rounds: 3,
    extraLinks: [
      { label: "página do torneio (CGM)", url: "https://www.cgm.pt/pt/miramar-internacional-junior-open-u25/", icon: "🏌️" },
      { label: "Termos de Competição PDF", url: "https://www.cgm.pt/client/files/0000000001/regulamento-mjo-2026_1461.pdf", icon: "📋" },
    ],
    live: false,            // sem tcode FPG real — /api/inscricoes daria lixo
  },
  {
    ccode: "003",
    tcode: "10653",
    name: "VIII Miramar Internacional Open U25 — Sub 10",
    escalao: "Sub 10",
    date: "2026-08-19",     // 19-21 Ago 2026, 27 buracos (9/dia)
    campo: "Miramar",
    rounds: 3,
    extraLinks: [
      { label: "página do torneio (CGM)", url: "https://www.cgm.pt/pt/miramar-internacional-open-u25-sub-10/", icon: "🏌️" },
      { label: "Termos de Competição PDF", url: "https://www.cgm.pt/client/files/0000000001/regulamento-mjo-2026_1461.pdf", icon: "📋" },
    ],
    live: false,            // /api/inscricoes: a prova já decorre, resultados vêm do scrape
  },
];
