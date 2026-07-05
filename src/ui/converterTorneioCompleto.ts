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

export function converterTorneioCompleto(raw: any): TorneioResult | null {
  // Detectar formato pela presença de signupanytime_t (novo) vs t+meta (antigo)
  const isNovoFormato = !!raw?.signupanytime_t;

  if (isNovoFormato) {
    // ── NOVO FORMATO (v2) ────────────────────────────────────────────────
    if (!raw.signupanytime_t || !raw.name) return null;

    const tCode      = Number(raw.signupanytime_t);
    const ageGroups: Record<string, { name: string; holes_per_round: number }> = raw.age_groups ?? {};

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
      // IMPORTANTE: alinhar metros com par — em flights 9H o GetMeta devolve `holes[]`
      // com 18 entries (yards completos do percurso), mas só as 9 jogadas têm `par > 0`.
      // Filtrar AMBOS pelos índices onde par > 0 para garantir alinhamento.
      const courseInfo: Record<string, any> = flight.course_info ?? {};
      for (const [rKey, rInfo] of Object.entries(courseInfo)) {
        const rn = parseInt(rKey.replace(/^R/, ''));
        if (isNaN(rn)) continue;
        const holes_arr: any[] = rInfo.holes ?? [];
        // Índices onde realmente houve buraco jogado (par > 0)
        const playedIdx = holes_arr
          .map((h: any, i: number) => ((h.par ?? 0) > 0 ? i : -1))
          .filter((i: number) => i >= 0);

        if (!esc.parPorRonda.has(rn) && playedIdx.length > 0) {
          const par = playedIdx.map((i: number) => holes_arr[i].par as number);
          esc.parPorRonda.set(rn, par);
        }
        if (!esc.metrosPorRonda.has(rn) && playedIdx.length > 0) {
          const metros = playedIdx
            .map((i: number) => Math.round((holes_arr[i].yards ?? 0) * 0.9144));
          // só guardar se algum metro real (> 0)
          if (metros.some((m: number) => m > 0)) esc.metrosPorRonda.set(rn, metros);
        }
        // Campo preferencial: vem do flight (course_name específico daquele escalão)
        if (!esc.campo) {
          esc.campo = rInfo.course_name ?? rInfo.courseName ?? null;
        }
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

    // Campo do torneio: usar o curso MAIS COMUM entre os flights (não o primeiro
    // listado em raw.courses — esse pode ser de outro torneio do mesmo organizador).
    // Fallback: primeiro courses[] se nenhum flight tiver course_name.
    const campoTally: Map<string, number> = new Map();
    for (const esc of escalaoMap.values()) {
      if (esc.campo) campoTally.set(esc.campo, (campoTally.get(esc.campo) ?? 0) + 1);
    }
    let campo: string | null = null;
    if (campoTally.size > 0) {
      campo = [...campoTally.entries()].sort((a, b) => b[1] - a[1])[0][0];
    } else {
      const firstCourse = Object.values(raw.courses ?? {})[0] as any;
      campo = firstCourse?.name ?? null;
    }

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
    const campoTally: Map<string, number> = new Map();

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
          if (rd.course_name) campoTally.set(rd.course_name, (campoTally.get(rd.course_name) ?? 0) + 1);
          if (!esc.roundsMap.has(rn)) esc.roundsMap.set(rn, []);
          const strokes: number[] = rd.strokes ?? [];
          const score   = rd.num_strokes ?? strokes.filter((s: number) => s > 0).reduce((a: number, b: number) => a + b, 0);
          const buracos = rd.num_holes   ?? strokes.filter((s: number) => s > 0).length;
          const parArr  = esc.parPorRonda.get(rn);
          const total_par = parArr && parArr.length === buracos ? parArr.reduce((a, b) => a + b, 0) : null;
          esc.roundsMap.get(rn)!.push({
            nome, pais, cidade, tee,
            pontos:     0,
            score,
            to_par:     total_par != null ? score - total_par : null,
            buracos,
            start_time: rd.start_time  ?? '',
            grupo:      rd.group_number ?? 0,
            strokes,
          });
        }
      }
    }

    // Campo do torneio: curso mais comum entre as rondas (fallback: courses[] do meta).
    let campo: string | null = null;
    if (campoTally.size > 0) {
      campo = [...campoTally.entries()].sort((a, b) => b[1] - a[1])[0][0];
    } else {
      const firstCourse = Object.values(meta.courses ?? {})[0] as any;
      campo = firstCourse?.name ?? tourn.course ?? null;
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
      t:            Number(raw.t),
      name:         tourn.name,
      date_inicio:  raw.start_date ?? tourn.start_date ?? '',
      date_fim:     raw.end_date,
      campo,
      rondas_total: raw.rounds ?? 1,
      escaloes,
      ultima_atualizacao: '',
    };
  }
}
