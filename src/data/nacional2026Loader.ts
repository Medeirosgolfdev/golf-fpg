/**
 * src/data/nacional2026Loader.ts
 *
 * Loader para `public/data/fpg-admissions-draws.json` — contém admissions +
 * draws dos 107 torneios FPG scrapados via browser console (ver CLAUDE.md
 * "Fluxo: Descarregar inscrições + draws").
 *
 * Apesar do nome, o loader carrega TODOS os 107 torneios (não só Nacional 2026).
 * O nome mantém-se por historial.
 */

import { cachedFetchJson } from "./fetchCache";

// ── Tipos ──────────────────────────────────────────────────────────

export interface FpgAdmissionPlayer {
  pos: number | null;
  fed: string | null;
  nome: string;
  clube: string | null;
  hcp: number | null;
  vac: number | null;
  dataInscricao: string | null;  // "YYYY/MM/DD HH:MM"
  status: "confirmed" | "reserva" | "desistente";
  /** Data em que o jogador se desinscreveu (só quando status === "desistente").
   *  Guardamos o registo em vez de o apagar da lista — a inscrição fica visível
   *  marcada como "desistiu" para manter o histórico. Formato "YYYY-MM-DD". */
  desinscritoEm?: string | null;
  // Overrides opcionais por jogador — usados por fontes não-FPG (ex.: NextCaddy/
  // España) que não passam por playersDB/federados.json. Quando ausentes (FPG),
  // o AdmissionsTab cai no comportamento normal (hooks de country/dob, tee por escalão).
  dob?: string | null;
  country?: string | null;   // código flag-icon (ex.: "ES")
  escalao?: string | null;   // escalão já resolvido (ex.: "Alevín")
  teeName?: string | null;   // tee do jogador (ex.: "5498 m") — texto, não cor
}

export interface FpgDrawFlight {
  teeTime: string;
  startHole: number | null;
  tee: string | null;
  players: Array<{
    nome: string;
    clube: string | null;
    fed?: string | null;
    hcp?: number | null;
    /** Tee específico do jogador (override do `tee` do grupo, p/ flights com tees mistos M/F). */
    tee?: string | null;
    /** Conterrâneo em draws internacionais (sem fed) → `.row-portuguese` no DrawTab. */
    isPortuguese?: boolean;
    /** Nacionalidade ISO-2 do jogador (draws internacionais, sem fed nosso) →
     *  bandeira ao lado do nome. */
    country?: string | null;
  }>;
}

export interface FpgDraw {
  name?: string;
  date?: string;
  totalJogadores?: number;
  groups?: FpgDrawFlight[];
  note?: string;
  error?: string;
}

export interface FpgAdmissions {
  name?: string;
  date?: string;
  status?: string;
  totalInscritos?: number;
  reservas?: number;
  players?: FpgAdmissionPlayer[];
  error?: string;
}

export interface FpgTournamentData {
  ccode: string;
  tcode: string;
  name: string | null;
  date: string | null;
  campo?: string | null;
  admissions?: FpgAdmissions;
  draws?: Record<string, FpgDraw>;
}

export interface FpgAdmissionsDrawsFile {
  scrapedAt: string | null;
  total: number;
  source?: string;
  tournaments: FpgTournamentData[];
}

// ── Meta dos 10 torneios Nacional 2026 ───────────────────────────────

export const NACIONAL_2026_META: Record<string, {
  escalao: "Sub 10" | "Sub 12" | "Sub 14" | "Sub 16" | "Sub 18";
  sex: "M" | "F";
  name: string;
}> = {
  "10935": { escalao: "Sub 18", sex: "M", name: "Campeonato Nacional de Jovens Sub 18 M" },
  "10936": { escalao: "Sub 18", sex: "F", name: "Campeonato Nacional de Jovens Sub 18 F" },
  "10937": { escalao: "Sub 16", sex: "M", name: "Campeonato Nacional de Jovens Sub 16 M" },
  "10938": { escalao: "Sub 16", sex: "F", name: "Campeonato Nacional de Jovens Sub 16 F" },
  "10939": { escalao: "Sub 14", sex: "M", name: "Campeonato Nacional de Jovens Sub 14 M" },
  "10940": { escalao: "Sub 14", sex: "F", name: "Campeonato Nacional de Jovens Sub 14 F" },
  "10941": { escalao: "Sub 12", sex: "M", name: "Campeonato Nacional de Jovens Sub 12 M" },
  "10942": { escalao: "Sub 12", sex: "F", name: "Campeonato Nacional de Jovens Sub 12 F" },
  "10943": { escalao: "Sub 10", sex: "M", name: "Campeonato Nacional de Jovens Sub 10 M" },
  // 10944 (Sub 10 F) — REMOVIDO 2026-05-05: o torneio não teve participantes,
  // ficaria sozinho na sidebar e a tab Admissões mostraria 0 jogadores. Excluído
  // aqui para evitar injecção sintética; também filtrado no loader.
};

export const NACIONAL_2026_TCODES = Object.keys(NACIONAL_2026_META);

/** Tcodes a SUPRIMIR das admissions/draws — torneios sem participantes ou
 *  cancelados que não devem aparecer em sidebars nem tabs de Admissões. */
const ADMISSIONS_SKIP_TCODES = new Set<string>([
  "10944",  // Sub 10 F 2026 — sem inscrições
]);

// ── Loader ─────────────────────────────────────────────────────────

let _cache: FpgAdmissionsDrawsFile | null = null;

/**
 * Normaliza um player das admissions: o scraper produz dois formatos
 * dependendo da versão do script:
 *   - antigo: { vac, dataInscricao }                  (~3000 entries)
 *   - novo:   { vacf, registo }                       (~900 entries, Nacional 2026)
 * Aqui mapeamos sempre para o formato canónico {vac, dataInscricao} que o resto
 * do código usa. Sem isto, as colunas "VAC" e "Registo" na AdmissionsTab ficam
 * vazias para o Nacional 2026.
 */
function normalizePlayer(p: any): FpgAdmissionPlayer {
  return {
    pos: p.pos ?? null,
    fed: p.fed ?? null,
    nome: p.nome ?? "",
    clube: p.clube ?? null,
    hcp: p.hcp ?? null,
    vac: p.vac ?? p.vacf ?? null,
    dataInscricao: p.dataInscricao ?? p.registo ?? null,
    status: p.status === "reserva" ? "reserva" : p.status === "desistente" ? "desistente" : "confirmed",
    // Overrides opcionais por jogador — preservar quando existem (senão a coluna
    // TEE e os enriquecimentos de fontes não-FPG desapareciam aqui). `tee` é
    // aceite como alias antigo de `teeName`.
    ...(p.teeName ?? p.tee ? { teeName: p.teeName ?? p.tee } : {}),
    ...(p.dob ? { dob: p.dob } : {}),
    ...(p.country ? { country: p.country } : {}),
    ...(p.escalao ? { escalao: p.escalao } : {}),
    ...(p.desinscritoEm ? { desinscritoEm: p.desinscritoEm } : {}),
  };
}

export async function loadFpgAdmissionsDraws(opts: { force?: boolean } = {}): Promise<FpgAdmissionsDrawsFile> {
  if (_cache && !opts.force) return _cache;
  try {
    const raw = await cachedFetchJson<FpgAdmissionsDrawsFile>("/data/fpg-admissions-draws.json");
    if (raw) {
      // Filtra torneios suprimidos (ver ADMISSIONS_SKIP_TCODES). Aplicado aqui
      // ao carregar para garantir que NENHUM consumidor (sidebar, Admissões,
      // Draw, índices) os vê. O ficheiro JSON em disco mantém-se intacto.
      if (Array.isArray(raw.tournaments)) {
        raw.tournaments = raw.tournaments.filter(t => !ADMISSIONS_SKIP_TCODES.has(String(t.tcode)));
      }
      for (const t of (raw.tournaments || [])) {
        if (t.admissions && Array.isArray(t.admissions.players)) {
          t.admissions.players = t.admissions.players.map(normalizePlayer);
        }
      }
      // Merge dos draws curados do CGSS (Santo da Serra) — extraídos de PDFs
      // oficiais por scripts/extract-cgss-draws.js. Os torneios sociais do CGSS
      // não têm draw publicado na FPG (o scraper deixa `draws` vazio); estes
      // PDFs preenchem essa lacuna. Aplicado aqui (no carregamento) para que
      // TODOS os consumidores (FPGPage, DrawsPage, índices) os vejam, sem tocar
      // no fpg-admissions-draws.json (que o scraper regenera).
      await mergeCgssManualDraws(raw);
    }
    _cache = raw || { scrapedAt: null, total: 0, tournaments: [] };
  } catch {
    _cache = { scrapedAt: null, total: 0, tournaments: [] };
  }
  return _cache;
}

/** Funde os draws curados do CGSS (cgss-draws-manual.json) no ficheiro de
 *  admissions/draws: preenche o `draws` vazio das entradas existentes por
 *  `${ccode}-${tcode}` e injecta torneios draw-only que ainda não existam. */
async function mergeCgssManualDraws(raw: FpgAdmissionsDrawsFile): Promise<void> {
  if (!Array.isArray(raw.tournaments)) return;
  const hasDraws = (t: FpgTournamentData | undefined): boolean =>
    !!t && !!t.draws && Object.keys(t.draws).length > 0;
  const byKey = new Map<string, FpgTournamentData>();
  for (const t of raw.tournaments) byKey.set(`${t.ccode}-${t.tcode}`, t);
  // Ficheiros curados de draws manuais. `fixMeta !== false` => nome/data do PDF
  // sao autoritativos (sociais CGSS, que o scraper deixava com placeholder);
  // `fixMeta: false` => preserva nome/data do scrape (PJA Tour, metadados reais)
  // e apenas preenche os draws.
  for (const url of ["/data/cgss-draws-manual.json", "/data/pja-draws-manual.json"]) {
    let file: { tournaments?: FpgTournamentData[] } | null = null;
    try {
      file = await cachedFetchJson<{ tournaments?: FpgTournamentData[] }>(url);
    } catch {
      continue;
    }
    if (!file || !Array.isArray(file.tournaments)) continue;
    for (const c of file.tournaments) {
      const fixMeta = (c as { fixMeta?: boolean }).fixMeta !== false;
      const ex = byKey.get(`${c.ccode}-${c.tcode}`);
      if (ex) {
        if (!hasDraws(ex)) ex.draws = c.draws;
        if (fixMeta) {
          if (c.name) ex.name = c.name;
          if (c.date) ex.date = c.date;
          if (c.campo) ex.campo = c.campo;
        }
      } else {
        const pushed = {
          ccode: c.ccode, tcode: c.tcode, name: c.name, date: c.date, draws: c.draws,
          ...(c.campo ? { campo: c.campo } : {}),
        } as FpgTournamentData;
        raw.tournaments.push(pushed);
        byKey.set(`${c.ccode}-${c.tcode}`, pushed);
      }
    }
  }
}

/** Indexa os torneios por `${ccode}-${tcode}`. */
export function indexFpgAdmissionsDraws(file: FpgAdmissionsDrawsFile): Map<string, FpgTournamentData> {
  const m = new Map<string, FpgTournamentData>();
  for (const t of (file.tournaments || [])) {
    m.set(`${t.ccode}-${t.tcode}`, t);
  }
  return m;
}
