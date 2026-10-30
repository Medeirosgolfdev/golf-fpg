/**
 * divisionData.ts — O detalhe de um torneio de Espanha (lazy, ao abrir): lê o
 * ficheiro, adapta a fonte, converte para o Tournament da FPG e monta as
 * inscrições, os links de PDF e as voltas com draw. Quem desenha (tabs,
 * leaderboard de totais, destaques, DrawTab) é a RFEGPage.
 *
 * Tirado do rfegLoadDivisions da RFEGPage a 21/10/2026 — comportamento igual.
 */
import { cachedFetchJson } from "../fetchCache";
import { adaptFcg, fcgToFPGTournament, type FCGDetail, type MinimalRFEGShape } from "../fcgAdapter";
import { formatPlayerName } from "../../utils/playerUtils";
import { displayName } from "../../utils/format";
import type { TotalsPlayer } from "../../ui/circuit/TotalsResumo";
import type { Tournament as FPGTournament, Player as FPGPlayer } from "../fpgTypes";
import type { FpgAdmissions, FpgAdmissionPlayer } from "../nacional2026Loader";
import type { CircuitLink } from "../../ui/circuit/types";
import type { MatchplayFile } from "../../ui/circuit/matchplayTypes";
import { loadFedByName, loadGolfboxPlayers, type FedByNameEntry } from "../playerLookups";
import type { RFEGDetail, RFEGIndexEntry, RFEGPlayer, NCDetail, LgsDetail, DobLookup, HcpLookup } from "./types";
import { esDateToIso } from "./text";
import { escaloEsForPlayer } from "./escalao";
import { rfegPaisLookup, rfegPlayerFlag } from "./flags";
import { normEs } from "./text";
import { adaptLgs, adaptNextCaddy } from "./adapters";
import { lgsToFPGTournament, ncToFPGTournament, rfegolfToFPGTournament, mitarjetaToFPGTournament } from "./toTournament";
import { loadDobLookup, loadHcpLookup } from "./lookups";
import { rfegHorarios, type RfegDrawDetail } from "./roundDraw";

/* ── Destaques NextCaddy ──────────────────────────────────────────────
 * Mesmo quando o leaderboard final só sai em PDF, o NextCaddy regista em tempo
 * real birdies/eagles/hole-in-one por jogador. Surgimos isso como tabela de
 * destaques — é o único sinal de desempenho disponível nesses torneios só-PDF. */
export type NCHighlightRow = { name: string; eagle: number; birdie: number; ace: number; pts: number };

export function ncHighlightRows(scoreTypes: NCDetail["scoreTypes"]): NCHighlightRow[] {
  const m = new Map<string, NCHighlightRow>();
  const bump = (raw: string, key: "eagle" | "birdie" | "ace") => {
    const name = formatPlayerName((raw || "").trim());
    if (!name) return;
    const r = m.get(name) ?? { name, eagle: 0, birdie: 0, ace: 0, pts: 0 };
    r[key]++;
    m.set(name, r);
  };
  for (const [type, v] of Object.entries(scoreTypes || {})) {
    const key = type === "eagle" ? "eagle" : type === "hole_in_one" ? "ace" : type === "birdie" ? "birdie" : null;
    if (!key) continue;
    for (const p of v?.players ?? []) if (p?.playerName) bump(p.playerName, key);
  }
  const rows = [...m.values()];
  for (const r of rows) r.pts = r.ace * 100 + r.eagle * 10 + r.birdie;
  return rows.sort((a, b) => b.pts - a.pts);
}

/** NextCaddy só com totais (Liguillas: pos/total/±par, sem cartões) → linhas do
 *  TotalsResumo partilhado (22/10/2026 — era uma tabela própria na RFEGPage). */
export function ncTotalsPlayers(admit: RFEGPlayer[]): TotalsPlayer[] {
  return admit.map((p) => {
    const name = formatPlayerName(p.name || "");
    return {
      name,
      pos: p.pos ?? null,
      total: p.total ?? null,
      toPar: p.toPar ?? null,
      hcp: p.hcp ?? null,
      club: p.club ? displayName(p.club) : null,
      country: rfegPlayerFlag(p.name, p.pais) ?? null,
      fed: p.licencia ?? null,
      sex: p.sexo === "M" || p.sexo === "F" ? p.sexo : null,
      rounds: (p.rounds || []).map((r) => r.gross ?? null),
    };
  });
}

/** Destaques de live scoring → linhas do TotalsResumo (sem resultados; as
 *  colunas HiO/Eagle/Birdie entram como colunas extra ordenáveis). */
export function ncHighlightPlayers(rows: NCHighlightRow[]): TotalsPlayer[] {
  return rows.map((r) => ({ name: r.name, rounds: [], ace: r.ace, eagle: r.eagle, birdie: r.birdie }));
}

/** Inscrições no formato FPG (o shell desenha-as com o AdmissionsTab partilhado).
 *  Cada jogador traz dob/escalão/país/tee como overrides; o tee mostra a
 *  distância do cartão (rapazes/raparigas jogam tees ≠).
 *
 *  ⚠ As listas RFEG sobrepõem-se: `provisional` é o SUPERCONJUNTO (admitidos ∪
 *  reservas ∪ bajas ∪ noAdmitidos) com `estado` por jogador. Iterar TODAS as
 *  listas duplicava cada jogador (um admitido aparecia em `admitidos` E em
 *  `provisional`). Mostramos só o campo real: admitidos+invitados (confirmados)
 *  + reservas (pendentes), e desduplicamos por licença (fallback nome). Fallback
 *  à `provisional` quando ainda não houve corte de admissão (torneio futuro só
 *  com lista provisional). */
export function buildAdmissions(data: RFEGDetail): FpgAdmissions {
  const ins = data.inscritos;
  const confirmedSrc = (ins.admitidos.length || ins.invitados.length)
    ? [...ins.admitidos, ...ins.invitados]
    : ins.provisional;
  const groups: Array<{ list: RFEGPlayer[]; status: "confirmed" | "reserva" }> = [
    { list: confirmedSrc, status: "confirmed" },
    { list: ins.reservas, status: "reserva" },
  ];
  const players: FpgAdmissionPlayer[] = [];
  const seen = new Set<string>();
  for (const { list, status } of groups) {
    for (const p of (list || [])) {
      const key = (p.licencia || p.name || "").trim().toLowerCase();
      if (key && seen.has(key)) continue;
      if (key) seen.add(key);
      players.push({
        pos: p.pos ?? null,
        fed: p.licencia,
        nome: p.name || "",
        clube: p.club,
        hcp: p.hcp,
        vac: null,
        dataInscricao: null,
        status,
        dob: esDateToIso(p.dob),
        country: rfegPlayerFlag(p.name, p.pais),
        escalao: escaloEsForPlayer(p.catEdad, p.dob, data.meta.dateStart),
        teeName: p.teeMeters ? `${p.teeMeters} m` : null,
      });
    }
  }
  return {
    players,
    totalInscritos: players.filter((p) => p.status === "confirmed").length,
    reservas: players.filter((p) => p.status === "reserva").length,
  };
}

/** Links dos resultados originais — o RFEGolf publica ~65% dos resultados só em
 *  PDF. Cada grupo de resultados traz o seu pdfUrl; juntamos os únicos como
 *  links de acção no header (o CircuitShell desenha-os via division.links). */
function rfegolfResultLinks(data: RFEGDetail): CircuitLink[] {
  const links: CircuitLink[] = [];
  const seen = new Set<string>();
  for (const g of data.results || []) {
    if (g.pdfUrl && !seen.has(g.pdfUrl)) {
      seen.add(g.pdfUrl);
      // mitarjeta.golf é live scoring (não um PDF) → label/ícone de clasificación.
      const isMita = g.source === "mitarjeta.golf";
      links.push(isMita
        ? { label: g.label ? `Clasificación · ${g.label}` : "Clasificación", url: g.pdfUrl, icon: "🔗", title: "Resultados ao vivo (mitarjeta.golf)" }
        : { label: g.label ? `PDF · ${g.label}` : "Resultados PDF", url: g.pdfUrl, icon: "📄", title: "Resultados oficiais em PDF" });
    }
  }
  return links;
}

/** LGS com gémeo RFEGolf: o LGS não traz o país de quem não tem bandeira na
 *  linha, mas as listas de inscritos do gémeo trazem («PORTUGAL»). Preenche o
 *  `country` em falta (só estrangeiros — os espanhóis não levam bandeira) para
 *  o destaque PT e a bandeira valerem no leaderboard, nas inscrições e no draw.
 *  Devolve uma cópia; o ficheiro em cache não é tocado. */
async function lgsWithTwinCountries(raw: LgsDetail): Promise<LgsDetail> {
  const tw = await cachedFetchJson<{ twins?: Record<string, number> }>("/data/rfegolf-lgs-twins.json").catch(() => null);
  const rfegId = Object.entries(tw?.twins ?? {}).find(([, lgs]) => lgs === raw.id)?.[0];
  if (!rfegId) return raw;
  const twin = await cachedFetchJson<RFEGDetail>(`/data/rfegolf-resultats/${rfegId}.json`).catch(() => null);
  if (!twin?.inscritos) return raw;
  const paisOf = rfegPaisLookup(twin.inscritos as unknown as Record<string, unknown>, normEs);
  return {
    ...raw,
    rounds: raw.rounds.map((r) => ({
      ...r,
      players: (r.players ?? []).map((p) => {
        const pc = p as { country?: string | null; name: string };
        if (pc.country) return p;
        const c = rfegPlayerFlag(pc.name, paisOf(null, pc.name));
        return c ? { ...p, country: c } : p;
      }),
    })),
  };
}

export interface RfegDivisionData {
  /** O detalhe já adaptado (alimenta o draw de cada volta). */
  data: RfegDrawDetail;
  results: FPGTournament | null;
  admissions: FpgAdmissions;
  links: CircuitLink[];
  /** Voltas com jogadores no draw → abas "Draw R{n}" intercaladas. */
  drawRounds: number[];
  /** NextCaddy sem cartões: leaderboard só de totais (Liguillas) e, sem nem
   *  isso, os destaques de live scoring — os dois no formato do TotalsResumo. */
  ncTotals: TotalsPlayer[] | null;
  ncHighlights: { players: TotalsPlayer[]; hasPdf: boolean } | null;
  /** NextCaddy com rapazes E raparigas: o leaderboard partido por sexo
   *  (desconhecidos ficam com os rapazes para não desaparecerem). */
  bySex: { M: FPGPlayer[]; F: FPGPlayer[] } | null;
  /** LGS por equipas (FFAA…): a fase de match play depois do stroke play. */
  matchplay: MatchplayFile | null;
}

/** Carrega e converte o detalhe de um torneio. `null` se o ficheiro não existir.
 *
 *  ⚠ ESPERA pelos lookups (fichas FPG, licenças, GolfBox) em vez de usar o que
 *  o estado do React já tiver: o federados.json tem 18 MB e chega sempre depois
 *  desta função, cujo resultado o CircuitShell CACHEIA — os portugueses ficavam
 *  para sempre sem federado, clube nem HCP. As promessas são partilhadas (a
 *  mesma cache dos outros hooks), por isso não há download a mais. */
export async function loadRfegDivisionData(
  t: RFEGIndexEntry, dobLookup?: DobLookup, hcpLookup?: HcpLookup, fedByName?: Map<string, FedByNameEntry>,
): Promise<RfegDivisionData | null> {
  const raw = await cachedFetchJson<RFEGDetail | NCDetail | LgsDetail>(`/data/${t.filePath}`);
  if (!raw) return null;
  const [fbn, dob, hcp, gbx] = await Promise.all([
    fedByName && fedByName.size ? Promise.resolve(fedByName) : loadFedByName().catch(() => undefined),
    dobLookup && Object.keys(dobLookup).length ? Promise.resolve(dobLookup) : loadDobLookup(),
    hcpLookup && Object.keys(hcpLookup).length ? Promise.resolve(hcpLookup) : loadHcpLookup(),
    loadGolfboxPlayers().catch(() => undefined),
  ]);

  let data: RFEGDetail;
  if (t.source === "nextcaddy") data = adaptNextCaddy(raw as NCDetail, dob, hcp);
  else if (t.source === "livegolfscoring") data = adaptLgs(await lgsWithTwinCountries(raw as LgsDetail), dob, hcp, fbn, gbx);
  else if (t.source === "golfdirecto") data = adaptFcg(raw as unknown as FCGDetail, dob, hcp) as unknown as RFEGDetail;
  else { const d = raw as RFEGDetail; data = { ...d, coursePar: d.coursePar ?? null }; }

  let results: FPGTournament | null = null;
  if (t.source === "livegolfscoring" && (data as unknown as { _lgsRounds?: unknown[] })._lgsRounds?.length) {
    results = lgsToFPGTournament({
      id: data.compId,
      meta: { name: data.meta.name, course: data.meta.course, dateRange: data.meta.dateStart, dateIso: data.meta.dateStart },
      rounds: (data as unknown as { _lgsRounds: unknown[] })._lgsRounds,
      course: (data as unknown as { _lgsCourse?: unknown })._lgsCourse,
      _hcpLookup: hcp,
    } as any, dob, fbn, gbx); // eslint-disable-line @typescript-eslint/no-explicit-any
  } else if (t.source === "nextcaddy") results = ncToFPGTournament(data, dob);
  else if (t.source === "rfegolf") results = data.mitarjetaTorneo
    ? mitarjetaToFPGTournament(data, dob)
    : rfegolfToFPGTournament(data, dob);
  else if (t.source === "golfdirecto") results = fcgToFPGTournament(data as unknown as MinimalRFEGShape, dob);

  // NextCaddy sem scorecard hbh: muitas Liguillas TÊM leaderboard real (pos/
  // total/±par) mas sem cartões → ncToFPGTournament devolve null. Nesse caso
  // mostra-se o leaderboard de totais em vez de cair nos "destaques". Os
  // destaques ficam só para torneios mesmo só-PDF (sem qualquer leaderboard) — e
  // mesmo aí têm nomes por PAR de jogadores (o live-scoring regista o flight, não
  // o indivíduo), por isso são último recurso.
  let ncTotals: TotalsPlayer[] | null = null;
  let ncHighlights: RfegDivisionData["ncHighlights"] = null;
  if (t.source === "nextcaddy" && !results) {
    const admit = data.inscritos.admitidos;
    if (admit.some((p) => p.total != null || p.toPar != null)) ncTotals = ncTotalsPlayers(admit);
    else {
      const hl = ncHighlightRows((raw as NCDetail).scoreTypes);
      const ncPdfs = (raw as unknown as { pdfs?: unknown[] }).pdfs;
      if (hl.length) ncHighlights = { players: ncHighlightPlayers(hl), hasPdf: Array.isArray(ncPdfs) && ncPdfs.length > 0 };
    }
  }

  const drawData = data as RfegDrawDetail;
  const horarios = drawData._ncHorarios;
  const hasNcDraw = t.source === "nextcaddy" && Array.isArray(horarios) && horarios.length > 0;
  // mitarjeta (CEE): o draw vem em `detail.teeTimes`/`teeTimesAll`.
  const hasMitarjetaDraw = !!((data.teeTimes && data.teeTimes.groups && data.teeTimes.groups.length)
    || (data.teeTimesAll && data.teeTimesAll.some((r) => r.groups && r.groups.length)));
  // livegolfscoring: `_lgsHorarios`.
  const hasLgsDraw = t.source === "livegolfscoring"
    && (() => {
      const hor = drawData._lgsHorarios;
      return Array.isArray(hor) && hor.some((r) => (r.groups || []).some((g) => (g.players || []).length));
    })();
  // Draws POR RONDA → abas "Draw R{n}" intercaladas com os resultados na barra
  // principal (Inscrições · Draw R1 · R1 · Draw R2 · R2 · Draw R3 · Resumo · …).
  // Inclui rondas ainda por jogar (ex: Draw R3 só com os pairings).
  const drawHorarios = (hasNcDraw || hasMitarjetaDraw || hasLgsDraw) ? rfegHorarios(drawData) : null;
  const drawRounds = (drawHorarios ?? []).filter((r) => r.players && r.players.length).map((r) => r.round);

  // NextCaddy junta rapazes e raparigas no MESMO tour (o leaderboard vem em
  // categorias "Alevín Masculino"/"Femenino" etc.). Separar em M/F — só as
  // PANCADAS (gross); a ordenação já é a Scratch do leaderboard. Só divide
  // quando há resultados com ambos os sexos.
  let bySex: RfegDivisionData["bySex"] = null;
  if (t.source === "nextcaddy" && results && (results.players?.length ?? 0) > 0) {
    const sexOf = (p: FPGPlayer): "M" | "F" | null => {
      const s = (p as FPGPlayer & { _sex?: "M" | "F" | null })._sex;
      return s === "M" || s === "F" ? s : null;
    };
    const males = results.players.filter((p) => sexOf(p) === "M");
    const females = results.players.filter((p) => sexOf(p) === "F");
    const unknown = results.players.filter((p) => sexOf(p) == null);
    if (males.length > 0 && females.length > 0) bySex = { M: [...males, ...unknown], F: females };
  }

  return {
    data: drawData,
    results,
    admissions: buildAdmissions(data),
    links: t.source === "rfegolf" ? rfegolfResultLinks(data) : [],
    drawRounds,
    ncTotals,
    ncHighlights,
    bySex,
    matchplay: t.matchplayFile
      ? await cachedFetchJson<MatchplayFile>(`/data/${t.matchplayFile}`).catch(() => null)
      : null,
  };
}
