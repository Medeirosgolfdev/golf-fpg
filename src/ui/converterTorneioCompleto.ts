/**
 * converterTorneioCompleto.ts
 *
 * Pure function to convert raw tournament data (v1 or v2 format) to TorneioResult.
 * Extracted from USKIDSPage.tsx (lines 1868-2115).
 *
 * Suporta dois formatos:
 *   ANTIGO (v1): array [{t, meta:{tournament,age_groups,flight_courses,...}, flights:[...]}]
 *   NOVO  (v2): objecto {signupanytime_t, name, start_date, age_groups, flight_courses, flights:{fid:{category,course_info,flight_players}}}
 */

import type { TorneioResult, EscalaoResult, RondaResult, RondaJogador } from './uskidsTypes';

function converterTorneioCompleto(raw: any): TorneioResult | null {
  // Detectar formato pela presença de signupanytime_t (novo) vs t+meta (antigo)
  const isNovoFormato = !!raw?.signupanytime_t;

  if (isNovoFormato) {
    // ── NOVO FORMATO (v2) ────────────────────────────────────────────────
    if (!raw.signupanytime_t || !raw.name) return null;

    const tCode      = Number(raw.signupanytime_t);
    const ageGroups: Record<string, { name: string; holes_per_round: number }> = raw.age_groups ?? {};

    // par por buraco por flight: fid → ronda → par[]
    // Fonte: flight.course_info['R1'].holes[].par  (mais fiável — por escalão)
    const _flightRoundPar = new Map<string, number[]>(); // key: `${fid}_R${rn}`

    // Agrupa flights pelo nome do escalão (category)
    // Usar índice numérico sintético para manter compatibilidade com age_group int
    const catToId = new Map<string, number>();
    let nextId = 1;
    const escalaoMap = new Map<number, {
      age_group: number; nome: string; holes: number;
      roundsMap: Map<number, RondaJogador[]>;
      parPorRonda: Map<number, number[]>;
      metrosPorRonda: Map<number, number[]>;
      campo?: string;
    }>();

    const flightsDict: Record<string, any> = raw.flights ?? {};
    for (const [_fidStr, flight] of Object.entries(flightsDict)) {
      const category: string = flight.category ?? '';
      if (!category) continue;

      // Mapear category → id numérico (lookup nos age_groups pelo nome)
      let agId = catToId.get(category);
      if (agId == null) {
        // Tentar encontrar nos age_groups pelo nome
        const agEntry = Object.entries(ageGroups).find(([, v]) => v.name === category);
        agId = agEntry ? parseInt(agEntry[0]) : nextId++;
        catToId.set(category, agId);
      }

      // holes_per_round: tirar dos age_groups pelo nome
      const agEntry = Object.entries(ageGroups).find(([, v]) => v.name === category);
      const holes = agEntry ? (agEntry[1].holes_per_round ?? 9) : 9;

      if (!escalaoMap.has(agId)) {
        escalaoMap.set(agId, {
          age_group: agId, nome: category,
          holes,
          roundsMap: new Map(),
          parPorRonda: new Map(),
          metrosPorRonda: new Map(),
        });
      }
      const esc = escalaoMap.get(agId)!;

      // Extrair par e metros (de jardas) por ronda do course_info (R1/R2/R3...)
      const courseInfo: Record<string, any> = flight.course_info ?? {};
      for (const [rKey, rInfo] of Object.entries(courseInfo)) {
        const rn = parseInt(rKey.replace(/^R/, ''));
        if (isNaN(rn)) continue;
        const holes_arr: any[] = rInfo.holes ?? [];
        if (!esc.parPorRonda.has(rn)) {
          const par = holes_arr.map((h: any) => h.par as number).filter(p => p > 0);
          if (par.length > 0) esc.parPorRonda.set(rn, par);
        }
        if (!esc.metrosPorRonda.has(rn)) {
          const metros = holes_arr.map((h: any) => Math.round((h.yards ?? 0) * 0.9144)).filter(m => m > 0);
          if (metros.length > 0) esc.metrosPorRonda.set(rn, metros);
        }
        if (!esc.campo && rInfo.courseName) esc.campo = rInfo.courseName;
      }

      // Players estão directamente em flight.flight_players (sem rounds_data)
      const fp: Record<string, any> = flight.flight_players ?? {};
      for (const player of Object.values(fp)) {
        const nome = `${player.first ?? ''} ${player.last ?? ''}`.trim();
        if (!nome) continue;
        const pais   = (player.country ?? '').toUpperCase();
        const cidade = player.place ?? '';
        const tee    = player.teeMarkerName ?? '';

        for (const [rnStr, rdRaw] of Object.entries(player.rounds ?? {})) {
          const rn = parseInt(rnStr);
          if (isNaN(rn)) continue;
          const rd = rdRaw as any;
          if (!esc.roundsMap.has(rn)) esc.roundsMap.set(rn, []);
          esc.roundsMap.get(rn)!.push({
            nome, pais, cidade, tee,
            pontos:     0,
            score:      rd.num_strokes ?? (rd.strokes ?? []).filter((s: number) => s > 0).reduce((a: number, b: number) => a + b, 0),
            buracos:    rd.num_holes   ?? (rd.strokes ?? []).filter((s: number) => s > 0).length,
            start_time: rd.start_time  ?? '',
            grupo:      rd.group_number ?? 0,
            strokes:    rd.strokes ?? [],
            to_par:     null,
          });
        }
      }
    }

    // Campo: primeiro curso listado
    const firstCourse = Object.values(raw.courses ?? {})[0] as any;
    const campo = firstCourse?.name ?? null;

    const escaloes: EscalaoResult[] = [];
    for (const esc of escalaoMap.values()) {
      const rondas: RondaResult[] = [];
      for (const [rn, leaderboard] of esc.roundsMap) {
        const par = esc.parPorRonda.get(rn) ?? [];
        const metros = (esc as any).metrosPorRonda?.get(rn) as number[] | undefined;
        rondas.push({
          ronda: rn,
          par,
          si: [],
          ...(metros?.length ? { metros } : {}),
          buracos: esc.holes,
          total_par: par.length === esc.holes ? par.reduce((a, b) => a + b, 0) : null,
          leaderboard,
        });
      }
      rondas.sort((a, b) => a.ronda - b.ronda);
      escaloes.push({
        age_group: esc.age_group, nome: esc.nome,
        holes: esc.holes, is_manuel: false, rondas,
        ...(esc.campo ? { campo: esc.campo } : {}),
      });
    }

    return {
      t:           tCode,
      name:        raw.name,
      date_inicio: raw.start_date ?? '',
      date_fim:    raw.end_date,
      campo,
      rondas_total: raw.rounds ?? 1,
      escaloes,
      ultima_atualizacao: '',
    };

  } else {
    // ── FORMATO ANTIGO (v1) ──────────────────────────────────────────────
    if (!raw?.t || !raw?.meta?.tournament?.name) return null;
    const meta   = raw.meta;
    const tourn  = meta.tournament;
    const ageGroups: Record<string, { name: string; holes_per_round: number }> = meta.age_groups ?? {};

    // par por flight_round_id (chave do flight_course)
    const frPars: Record<number, number[]> = {};
    for (const [, fc] of Object.entries(meta.flight_courses ?? {})) {
      const fcAny = fc as any;
      const frid = fcAny.flightRoundId ?? Number(Object.keys(meta.flight_courses ?? {}).find(k => (meta.flight_courses as any)[k] === fc));
      const pars = (fcAny.pars ?? []).filter((p: number) => p > 0);
      if (pars.length > 0) frPars[frid] = pars;
    }

    const escalaoMap = new Map<number, {
      age_group: number; nome: string; holes: number;
      roundsMap: Map<number, RondaJogador[]>;
      parPorRonda: Map<number, number[]>;
    }>();

    for (const flight of (raw.flights ?? [])) {
      const fn   = flight.flight_name;
      const agId = fn?.age_group as number | undefined;
      if (!agId) continue;
      const ag = ageGroups[String(agId)];
      if (!ag) continue;

      if (!escalaoMap.has(agId)) {
        escalaoMap.set(agId, {
          age_group: agId, nome: ag.name,
          holes: ag.holes_per_round ?? 9,
          roundsMap: new Map(),
          parPorRonda: new Map(),
        });
      }
      const esc = escalaoMap.get(agId)!;

      const roundsData: Record<string, any> = flight.rounds_data ?? {};
      const firstKey = Object.keys(roundsData)[0];
      if (!firstKey) continue;
      const fp: Record<string, any> = roundsData[firstKey].flight_players ?? {};

      for (const player of Object.values(fp)) {
        const nome = `${player.first ?? ''} ${player.last ?? ''}`.trim();
        if (!nome) continue;
        const pais   = (player.country ?? '').toUpperCase();
        const cidade = player.place ?? '';
        const tee    = player.teeMarkerName ?? '';

        for (const [rnStr, rdRaw] of Object.entries(player.rounds ?? {})) {
          const rn = parseInt(rnStr);
          if (isNaN(rn)) continue;
          const rd = rdRaw as any;
          // Tentar obter par do flight_round
          if (!esc.parPorRonda.has(rn) && rd.flight_round) {
            const par = frPars[rd.flight_round];
            if (par?.length) esc.parPorRonda.set(rn, par);
          }
          if (!esc.roundsMap.has(rn)) esc.roundsMap.set(rn, []);
          esc.roundsMap.get(rn)!.push({
            nome, pais, cidade, tee,
            pontos:     0,
            score:      rd.num_strokes ?? (rd.strokes ?? []).filter((s: number) => s > 0).reduce((a: number, b: number) => a + b, 0),
            buracos:    rd.num_holes   ?? (rd.strokes ?? []).filter((s: number) => s > 0).length,
            start_time: rd.start_time  ?? '',
            grupo:      rd.group_number ?? 0,
            strokes:    rd.strokes ?? [],
            to_par:     null,
          });
        }
      }
    }

    const escaloes: EscalaoResult[] = [];
    for (const esc of escalaoMap.values()) {
      const rondas: RondaResult[] = [];
      for (const [rn, leaderboard] of esc.roundsMap) {
        const par = esc.parPorRonda.get(rn) ?? [];
        rondas.push({
          ronda: rn,
          par,
          si: [],
          buracos: esc.holes,
          total_par: par.length === esc.holes ? par.reduce((a, b) => a + b, 0) : null,
          leaderboard,
        });
      }
      rondas.sort((a, b) => a.ronda - b.ronda);
      escaloes.push({
        age_group: esc.age_group, nome: esc.nome,
        holes: esc.holes, is_manuel: false, rondas,
      });
    }

    return {
      t:           raw.t,
      name:        tourn.name,
      date_inicio: tourn.start_date  ?? '',
      date_fim:    tourn.end_date,
      campo:       tourn.courses ? String(tourn.courses).split(',')[0].trim() : null,
      rondas_total: tourn.rounds ?? 1,
      escaloes,
      ultima_atualizacao: '',
    };
  }
}

export default converterTorneioCompleto;
export { converterTorneioCompleto };
