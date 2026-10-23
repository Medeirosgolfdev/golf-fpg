/**
 * src/data/fpgPlayersDB.ts — o playersDB das páginas de torneios da FPG (/FPG e,
 * desde 22/10/2026, /drive — decisão F): `players.json` + nacionalidades dos
 * federados estrangeiros (bandeira antes do nome, nascimento e sexo) + os
 * juniores do kids2 (seta ↗, bandeira e sexo de quem não é federado — do
 * juniors-links.json, o mesmo índice das setas dos circuitos; até 23/10/2026
 * vinham do kids-links.json e do kids-tracked-names.json). Partilhado pela
 * cache dos pedidos.
 */
import type { PlayersDB } from "../ui/tournamentPrimitives";
import { cachedFetchJson } from "./fetchCache";
import { loadPlayers } from "./loader";
import { normName } from "../utils/normName";
import type { LinkRow } from "../hooks/useKidsLinkMap";

interface PlayersNationalityFile {
  byFed?: Record<string, string>;
  /** fonte de DOB para os ~58K federados (activos+inactivos) */
  info?: Record<string, { country?: string; dob?: string; sex?: string; name?: string }>;
}

/** players.json + nacionalidades + jogadores /kids. ⚠ Muda o objecto do
 *  `loadPlayers()` (o mesmo da cache) — como sempre fez; as fusões só
 *  acrescentam, por isso repetir não altera nada. */
export async function loadFpgPlayersDB(): Promise<PlayersDB> {
  const [players, nat, links, lite] = await Promise.all([
    loadPlayers().catch(() => ({})),
    cachedFetchJson<PlayersNationalityFile>("/data/players-nationality.json").catch(() => null),
    cachedFetchJson<{ j?: LinkRow[] }>("/data/juniors-links.json").catch(() => null),
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
  // Juniores do kids2 (juniors-links.json, o índice das setas dos circuitos):
  // entrada virtual por nome (e por cada alias) com a seta ↗ (`kidsHash` =
  // memberId USKids, ou o nome), o país e o sexo — para quem não é federado
  // (draws internacionais, campos de fora). A entrada do federado ganha sempre
  // (o TournPName procura primeiro pelo fed).
  if (links?.j) {
    try {
      for (const [id, nome, aliases, memberId, fed, , pais, sexo] of links.j) {
        for (const n of [nome, ...(aliases || [])]) {
          const k = normName(n);
          if (!k) continue;
          const key = "kids:" + k.replace(/\s+/g, "_");
          if (pdb[key]) continue; // o primeiro com este nome fica (como no mapa das setas)
          pdb[key] = {
            name: n,
            kidsHash: memberId || encodeURIComponent(nome),
            kidsId: id,
            ...(fed ? { kidsFed: fed } : {}),
            ...(sexo ? { sex: sexo } : {}),
            ...(pais ? { country: pais } : {}),
          };
        }
      }
    } catch { /* ignore */ }
  }
  return pdb;
}

