/**
 * kids2/upcomingRegs.ts
 *
 * Inscrições FUTURAS por jogador — em que próximos torneios cada jogador
 * está inscrito. Cruza os ficheiros de inscrições com o roster canónico
 * (juniors) para atribuir cada inscrição a um Junior.
 *
 * Fontes (só estas têm inscrições futuras; Espanha/França só têm resultados):
 *   • USKids — /data/uskids-field.json (torneios → escalões → jogadores).
 *     Os inscritos só têm nome + país → matching por normName (índice
 *     juniorByNormName), desambiguado por país quando há homónimos.
 *   • FPG — /data/fpg-admissions-draws.json (tournaments → admissions.players).
 *     Os inscritos têm `fed` → matching exacto por juniorByFpgFed.
 */

import { useEffect, useMemo, useState } from "react";
import { cachedFetchJson } from "../../data/fetchCache";
import { isoDate } from "../../utils/format";
import { normName, type CanonicalData, type Junior } from "./data";

export interface UpcomingReg {
  circuit: "uskids" | "fpg";
  tournamentId: string;   // USKids: "t"; FPG: "ccode-tcode"
  name: string;
  date: string;           // ISO YYYY-MM-DD (início)
  dateFim?: string;       // ISO (fim), quando disponível
  escalao?: string;
  status?: string;        // FPG: "confirmed" | "reserva"
  campo?: string;
  link: string;
}

interface UskidsFieldFile {
  torneios?: Array<{
    t: number; name: string; date_inicio?: string; date_fim?: string; campo?: string;
    escaloes?: Array<{ nome: string; jogadores?: Array<{ nome: string; pais?: string }> | null }>;
  }>;
}
interface FpgAdmFile {
  tournaments?: Array<{
    ccode: string; tcode: string; name: string; date?: string; campo?: string;
    admissions?: { players?: Array<{ fed?: string; nome?: string; status?: string }> };
  }>;
}

// Cache module-level dos ficheiros crus (carregados uma vez por sessão).
let _raw: Promise<{ uskids: UskidsFieldFile | null; fpg: FpgAdmFile | null }> | null = null;
function loadRaw() {
  if (!_raw) {
    _raw = Promise.all([
      cachedFetchJson("/data/uskids-field.json").catch(() => null),
      cachedFetchJson("/data/fpg-admissions-draws.json").catch(() => null),
    ]).then(([uskids, fpg]) => ({ uskids: uskids as UskidsFieldFile | null, fpg: fpg as FpgAdmFile | null }));
  }
  return _raw;
}

function countryMatch(jr: Junior, pais?: string): boolean {
  if (!pais) return false;
  const p = pais.trim().toUpperCase();
  const cands = [jr.nationality, jr.country].filter(Boolean).map(s => String(s).toUpperCase());
  return cands.some(c => c === p || c.slice(0, 2) === p.slice(0, 2));
}

/** Constrói o mapa juniorId → inscrições futuras (ordenadas por data). */
function buildUpcomingByJunior(
  data: CanonicalData,
  uskids: UskidsFieldFile | null,
  fpg: FpgAdmFile | null,
): Map<string, UpcomingReg[]> {
  const today = new Date().toISOString().slice(0, 10);
  const map = new Map<string, UpcomingReg[]>();
  const add = (jid: string, reg: UpcomingReg) => {
    let arr = map.get(jid);
    if (!arr) { arr = []; map.set(jid, arr); }
    arr.push(reg);
  };

  // ── USKids (matching por nome) ──
  for (const t of uskids?.torneios ?? []) {
    const dini = isoDate(t.date_inicio || "");
    const dfim = isoDate(t.date_fim || t.date_inicio || "");
    if (!dini || (dfim || dini) < today) continue; // só futuros / em curso
    for (const e of t.escaloes ?? []) {
      for (const j of e.jogadores ?? []) {
        const cands = data.juniorByNormName.get(normName(j.nome || ""));
        if (!cands || !cands.length) continue;
        // Homónimos: desambiguar por país; se não der, não atribuir (evita falsos positivos).
        const jr = cands.length === 1 ? cands[0] : (cands.find(c => countryMatch(c, j.pais)) ?? null);
        if (!jr) continue;
        add(jr.id, {
          circuit: "uskids", tournamentId: String(t.t), name: t.name,
          date: dini, dateFim: dfim, escalao: e.nome, campo: t.campo,
          link: `/uskids?t=${t.t}&tab=campo`,
        });
      }
    }
  }

  // ── FPG (matching exacto por fed) ──
  for (const t of fpg?.tournaments ?? []) {
    const dini = isoDate(t.date || "");
    if (!dini || dini < today) continue;
    for (const p of t.admissions?.players ?? []) {
      if (!p.fed) continue;
      const jr = data.juniorByFpgFed.get(String(p.fed));
      if (!jr) continue;
      add(jr.id, {
        circuit: "fpg", tournamentId: `${t.ccode}-${t.tcode}`, name: t.name,
        date: dini, status: p.status, campo: t.campo,
        link: `/FPG/torneio/${t.ccode}-${t.tcode}`,
      });
    }
  }

  // Dedup (mesmo circuito+torneio) + ordenar por data.
  for (const [jid, list] of map) {
    const seen = new Set<string>();
    const dedup = list.filter(r => {
      const k = r.circuit + ":" + r.tournamentId;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    dedup.sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name));
    map.set(jid, dedup);
  }
  return map;
}

/** Hook: devolve o mapa juniorId → inscrições futuras (null enquanto carrega). */
export function useUpcomingByJunior(data: CanonicalData | null): Map<string, UpcomingReg[]> | null {
  const [raw, setRaw] = useState<{ uskids: UskidsFieldFile | null; fpg: FpgAdmFile | null } | null>(null);
  useEffect(() => {
    let alive = true;
    loadRaw().then(r => { if (alive) setRaw(r); });
    return () => { alive = false; };
  }, []);
  return useMemo(() => {
    if (!data || !raw) return null;
    return buildUpcomingByJunior(data, raw.uskids, raw.fpg);
  }, [data, raw]);
}
