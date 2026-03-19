import type { MasterData, PlayersDb, AwayCoursesData, Course } from "./types";
import { cachedFetchJson } from "./fetchCache";

/**
 * Carrega master-courses.json.
 * A cache é gerida pelo fetchCache — um único fetch por sessão,
 * mesmo que seja chamado de App.tsx e de outra página em simultâneo.
 * force:true invalida a Promise em cache e refaz o fetch.
 */
export async function loadMasterData(opts?: { force?: boolean }): Promise<MasterData> {
  const url = "/data/master-courses.json";
  if (opts?.force) {
    const { invalidateCache } = await import("./fetchCache");
    invalidateCache(url);
  }
  const data = await cachedFetchJson<MasterData>(url);
  if (!data) throw new Error("Falha a carregar master-courses.json (404)");
  return data;
}

/**
 * Carrega players.json.
 * Usado em App.tsx, FPGPage e DrivePage — fetchCache garante 1 único fetch.
 */
export async function loadPlayers(opts?: { force?: boolean }): Promise<PlayersDb> {
  const url = "/data/players.json";
  if (opts?.force) {
    const { invalidateCache } = await import("./fetchCache");
    invalidateCache(url);
  }
  const data = await cachedFetchJson<PlayersDb>(url);
  if (!data) throw new Error("Falha a carregar players.json (404)");
  return data;
}

/**
 * Carrega away-courses.json.
 * Gerado pelo extract-courses.js no pipeline.
 * Retorna [] se o ficheiro não existir (graceful fallback).
 */
export async function loadAwayCourses(opts?: { force?: boolean }): Promise<Course[]> {
  const url = "/data/away-courses.json";
  if (opts?.force) {
    const { invalidateCache } = await import("./fetchCache");
    invalidateCache(url);
  }
  try {
    const data = await cachedFetchJson<AwayCoursesData>(url);
    return data?.courses ?? [];
  } catch {
    // Ficheiro ainda não gerado pelo pipeline — não bloquear a app
    return [];
  }
}
