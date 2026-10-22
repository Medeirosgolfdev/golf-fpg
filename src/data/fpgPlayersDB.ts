/**
 * src/data/fpgPlayersDB.ts — o playersDB das páginas de torneios da FPG (/FPG e,
 * desde 22/10/2026, /drive — decisão F): `players.json` + nacionalidades dos
 * federados estrangeiros (bandeira antes do nome, nascimento e sexo) + os
 * jogadores seguidos no /kids (seta ↗). Partilhado pela cache dos pedidos.
 */
import type { PlayersDB } from "../ui/tournamentPrimitives";
import { cachedFetchJson } from "./fetchCache";
import { loadPlayers } from "./loader";

interface PlayersNationalityFile {
  byFed?: Record<string, string>;
  /** fonte de DOB para os ~58K federados (activos+inactivos) */
  info?: Record<string, { country?: string; dob?: string; sex?: string; name?: string }>;
}
interface KidsLinksFile {
  players?: Array<{ name?: string; kidsHash?: string; country?: string; escalao?: string; sex?: string }>;
}
interface KidsTrackedFile {
  names?: Record<string, string | null>;
  /** Meta extra: { sex?, country? } por normName (de FFG resultats etc.) */
  meta?: Record<string, { sex?: "M" | "F"; country?: string }>;
}

/** players.json + nacionalidades + jogadores /kids. ⚠ Muda o objecto do
 *  `loadPlayers()` (o mesmo da cache) — como sempre fez; as fusões só
 *  acrescentam, por isso repetir não altera nada. */
export async function loadFpgPlayersDB(): Promise<PlayersDB> {
  const [players, nat, kl, kt, lite] = await Promise.all([
    loadPlayers().catch(() => ({})),
    cachedFetchJson<PlayersNationalityFile>("/data/players-nationality.json").catch(() => null),
    cachedFetchJson<KidsLinksFile>("/data/kids-links.json").catch(() => null),
    cachedFetchJson<KidsTrackedFile>("/data/kids-tracked-names.json").catch(() => null),
    cachedFetchJson<{ b?: Record<string, string> }>("/data/federados-lite.json").catch(() => null),
  ]);
  // ⚠ As datas de nascimento do players-nationality.json estão UM DIA antes em
  // ~9 mil federados (a meia-noite de Lisboa lida como UTC, no verão); a do
  // federados.json (via federados-lite.json) é a certa e ganha (22/10/2026).
  const dobOf = (fed: string, inf: { dob?: string }) => lite?.b?.[fed] ?? inf.dob;
  const pdb = players as PlayersDB;
  // Merge players-nationality.json — para cada federado FPG estrangeiro (Joe
  // Short→GB, Peter Yao→CN, etc.) injecta `country` no entry existente, para o
  // TournPName renderizar 🇬🇧 antes do nome.
  if (nat) {
    try {
      const byFed = nat.byFed || {};
      const info = nat.info || {};
      for (const fed in byFed) {
        const cc = byFed[fed];
        if (!cc) continue;
        // «@1»…«@4» (~4 mil federados) não são países: sem bandeira (era 🏴).
        const iso = /^[A-Z]{2}$/.test(cc) ? cc : undefined;
        const inf = info[fed] || {};
        const entry = pdb[fed];
        if (entry) {
          if (!entry.country && iso) entry.country = iso;
          if (!entry.dob && dobOf(fed, inf)) entry.dob = dobOf(fed, inf);
          if (!entry.sex && inf.sex) entry.sex = inf.sex;
        } else {
          pdb[fed] = {
            ...(iso ? { country: iso } : {}),
            ...(dobOf(fed, inf) ? { dob: dobOf(fed, inf) } : {}),
            ...(inf.sex ? { sex: inf.sex } : {}),
            ...(inf.name ? { name: inf.name } : {}),
          };
        }
      }
    } catch { /* ignore */ }
  }
  // Merge kids-links.json — entries CURADOS para jogadores internacionais sem
  // fedCode português (Emile Cuanalo, George Campbell, etc.). Mantém
  // precedência sobre auto-derived.
  if (kl) {
    try {
      for (const entry of (kl.players || [])) {
        if (!entry.name || !entry.kidsHash) continue;
        const key = "intl:" + entry.name.toLowerCase().replace(/\s+/g, "_");
        pdb[key] = {
          name: entry.name,
          kidsHash: entry.kidsHash,
          ...(entry.country ? { country: entry.country } : {}),
          ...(entry.escalao ? { escalao: entry.escalao } : {}),
          ...(entry.sex ? { sex: entry.sex } : {}),
        };
      }
    } catch { /* ignore */ }
  }
  // Merge kids-tracked-names.json — índice fino (~150KB) com todos os nomes que
  // aparecem nalguma fonte /kids (USKids, WJGC, Doral, etc.). Para cada nome,
  // entry virtual com kidsHash = memberId (preferido — link directo via ID) ou
  // nome encodificado (fallback). Assim o ↗ só aparece quando há match REAL.
  if (kt) {
    try {
      const namesMap = kt.names || {};
      const metaMap = kt.meta || {};
      for (const normName in namesMap) {
        if (!normName) continue;
        const memberId = namesMap[normName];
        const m = metaMap[normName] || {};
        const key = "kids:" + normName.replace(/\s+/g, "_");
        if (pdb[key]) continue; // já populado por kids-links.json
        const displayName = normName.replace(/\b\w/g, c => c.toUpperCase());
        pdb[key] = {
          name: displayName,
          kidsHash: memberId || encodeURIComponent(displayName),
          ...(m.sex ? { sex: m.sex } : {}),
          ...(m.country ? { country: m.country } : {}),
        };
      }
    } catch { /* ignore */ }
  }
  return pdb;
}

