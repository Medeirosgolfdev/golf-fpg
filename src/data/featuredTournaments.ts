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
import { NACIONAL_2026_META } from "./nacional2026Loader";

export interface FeaturedTournament {
  ccode: string;
  tcode: string;
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

  // ── Amendoeira Clube de Golfe — torneio futuro, 3 escalões (2026) ────
  // Nome/data/campo vêm do scrape (fpg-admissions-draws.json); para já só
  // há draw publicado. tournAdmissions: ccode=179, tcodes 10604-10606.
  { ccode: "179", tcode: "10604" },
  { ccode: "179", tcode: "10605" },
  { ccode: "179", tcode: "10606" },
];
