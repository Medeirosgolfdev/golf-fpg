import type { MasterData, PlayersDb, AwayCoursesData, Course } from "./types";

let _cache: Promise<MasterData> | null = null;

export async function loadMasterData(opts?: { force?: boolean }): Promise<MasterData> {
  if (!opts?.force && _cache) return _cache;

  _cache = (async () => {
    const res = await fetch("/data/master-courses.json", { cache: "no-store" });
    if (!res.ok) throw new Error(`Falha a carregar master-courses.json (${res.status})`);
    return (await res.json()) as MasterData;
  })();

  return _cache;
}

let _playersCache: Promise<PlayersDb> | null = null;

export async function loadPlayers(opts?: { force?: boolean }): Promise<PlayersDb> {
  if (!opts?.force && _playersCache) return _playersCache;

  _playersCache = (async () => {
    const res = await fetch("/data/players.json", { cache: "no-store" });
    if (!res.ok) throw new Error(`Falha a carregar players.json (${res.status})`);
    return (await res.json()) as PlayersDb;
  })();

  return _playersCache;
}

let _awayCache: Promise<Course[]> | null = null;

/**
 * Carrega campos internacionais extraidos dos scorecards de todos os jogadores.
 * Gerado pelo extract-courses.js no pipeline.
 * Retorna [] se o ficheiro nao existir (graceful fallback).
 */
export async function loadAwayCourses(opts?: { force?: boolean }): Promise<Course[]> {
  if (!opts?.force && _awayCache) return _awayCache;

  _awayCache = (async () => {
    try {
      const res = await fetch("/data/away-courses.json", { cache: "no-store" });
      if (!res.ok) return [];
      const data = (await res.json()) as AwayCoursesData;
      return data.courses || [];
    } catch {
      // Ficheiro ainda nao gerado pelo pipeline — nao bloquear a app
      return [];
    }
  })();

  return _awayCache;
}
