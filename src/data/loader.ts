import type { MasterData, PlayersDb } from "./types";

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
