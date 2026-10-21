/**
 * playerLookups.ts — Fichas de jogadores por NOME para provas de fora:
 *   - loadFedByName / fedByNameKeys: federados FPG (`federados.json`) — os
 *     portugueses em torneios estrangeiros
 *   - loadGolfboxPlayers / golfboxLookup: fichas GolfBox (`golfbox-players.json`)
 *     — data de nascimento, nacionalidade e clube dos estrangeiros
 *
 * Tirado do src/ui/InscricoesComponents.tsx a 21/10/2026 (quem os usa é a
 * camada de dados de Espanha, src/data/rfeg/).
 */
import { cachedFetchJson } from "./fetchCache";

/* ── nome → ficha do federado FPG (lazy-load, mesma cache dos hooks de federados) ──
 *
 * Fonte: `/data/federados.json`. Serve para preencher os PORTUGUESES em
 * torneios estrangeiros, onde a fonte local (RFEG, FFG…) não os conhece: sem
 * isto os nossos aparecem no meio do field sem federado, sem clube, sem HCP e
 * sem escalão — precisamente os que mais interessam.
 *
 * Duas chaves por federado, ambas indiferentes à ordem do nome:
 *   1. todos os tokens ordenados  ("SETÚBAL, João" ↔ "João Setúbal")
 *   2. primeiro + último token    (apanha "Martim Johansen" ↔ "Martim Pinto
 *      Johansen", que é como a RFEG o inscreveu)
 *
 * ⚠ Chaves AMBÍGUAS (mais de um federado) são descartadas — e o consumidor só
 * deve consultar este mapa para quem JÁ SABE ser português (pela bandeira da
 * fonte). Um "Javier Silva" espanhol não pode herdar a ficha de um português
 * com nome parecido.
 */
export interface FedByNameEntry { fed: string; name: string; dob: string | null; hcp: number | null; club: string | null; sex: string | null }
const _fedNameKeys = (name: string): string[] => {
  const toks = String(name || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z\s]/g, " ").split(/\s+/).filter(Boolean);
  if (toks.length < 2) return [];
  const ordenado = [...toks].sort().join(" ");
  // ⚠ Os extremos também vão ORDENADOS: a fonte escreve "JOHANSEN, Martim" e o
  // cadastro "Martim Pinto Johansen" — com a ordem original as chaves saíam
  // invertidas ("johansen|martim" vs "martim|johansen") e não casavam.
  const extremos = [toks[0], toks[toks.length - 1]].sort().join("|");
  return [ordenado, extremos].filter((k, i, arr) => arr.indexOf(k) === i);
};
let _fedByNamePromise: Promise<Map<string, FedByNameEntry>> | null = null;
export function loadFedByName(): Promise<Map<string, FedByNameEntry>> {
  if (_fedByNamePromise) return _fedByNamePromise;
  _fedByNamePromise = cachedFetchJson<any>("/data/federados.json")   // eslint-disable-line @typescript-eslint/no-explicit-any
    .catch(() => null)
    .then((feds) => {
      const byKey = new Map<string, FedByNameEntry[]>();
      if (!feds) return new Map<string, FedByNameEntry>();
      const items = feds.players || feds.federados || feds.records || (Array.isArray(feds) ? feds : []);
      for (const p of items) {
        const fed = String(p.federation_code || p.fed || "");
        const name = String(p.name || "");
        if (!fed || !name) continue;
        const hcpRaw = typeof p.hcp_index === "number" ? p.hcp_index : p.hcp_exact;
        const entry: FedByNameEntry = {
          fed, name,
          dob: typeof p.birthdate === "string" && /^\d{4}-\d{2}-\d{2}/.test(p.birthdate) ? p.birthdate.slice(0, 10) : null,
          // 99 é a sentinela FPG de "sem handicap"; acima de 54 está fora do cap WHS.
          hcp: typeof hcpRaw === "number" && hcpRaw < 54 ? hcpRaw : null,
          club: p.club_name || null,
          sex: p.gender || null,
        };
        for (const k of _fedNameKeys(name)) {
          const arr = byKey.get(k);
          if (arr) arr.push(entry); else byKey.set(k, [entry]);
        }
      }
      const out = new Map<string, FedByNameEntry>();
      for (const [k, arr] of byKey) if (arr.length === 1) out.set(k, arr[0]);
      return out;
    });
  return _fedByNamePromise;
}

/** Chaves de um nome no mapa do `loadFedByName` (e do índice GolfBox): usar a
 *  PRIMEIRA que resolver. */
export const fedByNameKeys = _fedNameKeys;

/* ── nome → ficha GolfBox (EGA + federações do norte da Europa) ──
 *
 * Fonte: `/data/golfbox-players.json` (gerado por scripts/build-golfbox-players.js).
 * Traz data de nascimento COMPLETA, nacionalidade, clube e nº de federado de
 * ~13,6 mil jogadores — o que as fontes locais não dão dos estrangeiros. Sem
 * isto, num torneio internacional metade do field fica sem idade nem escalão.
 *
 * ⚠ O consumidor DEVE passar a nacionalidade esperada: os nomes são de 20 e
 * tal países e um "Lucas Martin" sueco não pode herdar a ficha de um francês.
 * Entradas com `dobAlt` (duas datas para o mesmo nome = homónimos) são
 * descartadas, e chaves ambíguas dentro do mesmo país também.
 */
export interface GolfboxEntry { name: string; dob: string; nat: string | null; club: string | null; memberId: string | null }
let _golfboxPromise: Promise<Map<string, GolfboxEntry[]>> | null = null;
function loadGolfboxIndex(): Promise<Map<string, GolfboxEntry[]>> {
  if (_golfboxPromise) return _golfboxPromise;
  _golfboxPromise = cachedFetchJson<{ players?: (GolfboxEntry & { dobAlt?: string[] })[] }>("/data/golfbox-players.json")
    .catch(() => null)
    .then((d) => {
      const idx = new Map<string, GolfboxEntry[]>();
      for (const p of d?.players || []) {
        if (!p.name || !p.dob || p.dobAlt) continue;      // homónimo com datas diferentes
        for (const k of _fedNameKeys(p.name)) {
          const arr = idx.get(k);
          if (arr) arr.push(p); else idx.set(k, [p]);
        }
      }
      return idx;
    });
  return _golfboxPromise;
}
export function loadGolfboxPlayers(): Promise<Map<string, GolfboxEntry[]>> { return loadGolfboxIndex(); }

/** Ficha GolfBox de um nome, exigindo a nacionalidade (ISO-2 ou "GB-ENG"). */
export function golfboxLookup(
  idx: Map<string, GolfboxEntry[]> | undefined,
  nome: string,
  nat: string | null | undefined,
): GolfboxEntry | undefined {
  if (!idx || !nome) return undefined;
  // O GolfBox usa códigos próprios para as nações britânicas ("EN", "SQ", "WL",
  // "IG") — traduzir antes de comparar, senão nenhum inglês ou escocês casa.
  const alias: Record<string, string> = { "GB-ENG": "EN", "GB-SCT": "SQ", "GB-WLS": "WL", "GB-NIR": "IG", IE: "IG" };
  const want = nat ? (alias[nat] || nat).slice(0, 2).toUpperCase() : null;
  for (const k of _fedNameKeys(nome)) {
    const cand = (idx.get(k) || []).filter((p) => !want || (p.nat || "").toUpperCase().startsWith(want));
    if (cand.length === 1) return cand[0];
    // Vários com a mesma nacionalidade e o mesmo nome → ambíguo, não se escolhe.
    if (cand.length > 1) return undefined;
  }
  return undefined;
}
