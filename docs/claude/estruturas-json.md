# Estruturas JSON e tabela de todos os ficheiros de dados

> Detalhe tirado do CLAUDE.md a 2026-09-15 (o CLAUDE.md fica só com o essencial e
> aponta para aqui). Datas entre parênteses = quando a regra ou a medição foi feita.

## Estruturas JSON

### pull-torneiosNNN.json / drive-data.json / aquapor-data.json (formato "fpg-pull")

```
{ tournaments: TournamentEntry[] }

TournamentEntry = { name, ccode, tcode, date: "YYYY-MM-DD", campo, players: PlayerEntry[] }

PlayerEntry = {
  scoreId, pos, name, club, grossTotal, toPar, fedCode?, hcpExact?, hcpPlay?,
  course?, courseRating?, slope?, teeName?, nholes?, parTotal?,
  // Formato ANTIGO (single-round, flat):
  scores?: number[18], par?: number[18], si?: number[18], meters?: number[18],
  // Formato NOVO (multi-round):
  roundScores?: [{ round, gross, scores[18], pars[18], si[18], meters?[18], courseRating?, slope?, teeName?, teeColorId?, pcc?, sd? }]
}
```
⚠ `grossTotal` pode ser string ("WD", "DNS") — testar antes de usar como número.

### uskids-results.json

```
{ resultados: [{ t, name, escaloes: [{ nome, age_group,
  rondas: [{ ronda, buracos?, par?[], yards?[],
    leaderboard: [{ nome, pais, score, buracos, to_par?, strokes?[18] }]
  }]
}] }] }
```
⚠ `strokes[]` pode estar ausente. `par[]` nem sempre existe (não há tabela de fallback no código).

### uskids_torneios_completos(N).json — Dois formatos

⚠ Em `public/data/` os 41 ficheiros são todos **v2** (com `signupanytime_t`):
os 1–22 trazem também `meta` (`{tournament, flights, flight_rounds, age_groups}`)
e o 41 é um **array** de 24 torneios v2. O v1 abaixo já não aparece em nenhum
ficheiro — o suporte fica só no `converterTorneioCompleto.ts`.

**v1 (antigo, histórico):** array
```
[{ t, meta: { tournament: {name, start_date: "M/D/YYYY"}, age_groups, flights,
  flight_courses: { pars: number[18], lengths: number[18] },  // JARDAS!
  flight_rounds },
flights: [{ flight_id, rounds_data: { "r1_t0": {
  flight_players: { [pid]: { first, last, country (minúsculas!), score,
    scores: string[] ("37|9"), rounds: { [rnum]: { strokes: number[18], ... } }
  } }
} } }] }]
```

**v2 (novo):** objecto com `signupanytime_t`
```
{ signupanytime_t: number, name, start_date: "M/D/YYYY", age_groups,
  flight_courses: { [frId]: { flightId, pars[], lengths[] } },
  flights: { [fid]: { category, course_info: { R1: { holes: [{par, ...}] } },
    flight_players: { [pid]: FlightPlayer }
  } }
}
```
Detectado automaticamente por presença de `signupanytime_t`. Par extraído de `course_info.R{n}.holes[].par` (preferido) ou `flight_courses` (fallback).

⚠ Armadilhas críticas (ambos formatos):
1. `lengths[]` são **JARDAS** — converter ×0.9144
2. `strokes[]` tem sempre 18 posições — zeros preenchem buracos não jogados
3. `scores[]` (v1) são strings resumo "37|9" — NÃO são scores por buraco
4. `start_date` é formato americano "M/D/YYYY"
5. `country` é minúsculo ("pt") — diferente dos outros JSONs ("PT")

### uskids-member-history-slim.json (formato slim — lido pelo agregador, `kids/FieldRivaisDashboard`, `HistoricScorecardsTab`, `USKIDSPage`, `PastEditionsTable`)

Gerado por `build-member-history-slim.js` a partir dos ficheiros numerados em `data-archive/`. Escrito em `public/data/`.

```
{ gerado_em,
  torneios: Record<tcode, { name, startDate, holesPerRound, par: number[]|null, yards: number[]|null }>,
  jogadores: Record<memberId, {
    name, country, ageGroup,
    torneios: Record<tcode, {
      ageGroup, place: number|null,
      rounds: Record<ronda, { gross, strokes[] }>
    }>
  }>
}
```
Diferença do formato original: dados do torneio (name, par, yards) são partilhados em `d.torneios` em vez de duplicados por jogador×torneio.

### uskids-rich-players/{memberID}.json (formato rico, 1 por jogador)

Gerado por `fetch-uskids-rich-players-node.js`. Em `data-archive/uskids-rich-players/`.

Pivot por jogador (vs por torneio): cada miúdo num só ficheiro com a carreira USKids completa enriquecida com TODOS os campos da API. Permite UI tipo "ficha do jogador" sem ler ficheiros gigantes.

```ts
{
  memberID: string,                 // = nome do ficheiro
  name: string|null,                // resolvido via fingerprint (3 estratégias)
  country: string|null,             // ISO maiúsculo ("PT", "US", "GB")
  place: string|null,               // cidade do GetPlayerTeeTimes (ex: "Lisbon, Lisboa")
  ageGroup: string|null,            // o mais recente em que jogou
  lastUpdated: string,              // ISO 8601 (usado pelo skip-existing)
  totalTorneios: number,
  torneios: Record<tcode, {
    tcode: string, name: string, type: string,
    startDate: string, endDate: string,   // "M/D/YYYY"
    totalRounds: number, holesPerRound: number,
    par: number[], yards: number[],
    ageGroup: string,                     // ageGroup específico deste torneio
    flightId: string|null,                // resolvido via GetMeta + age_group match
    pid: string|null,                     // pid local do flight (resolvido via fingerprint)
    place: string,                        // "T5", "1", etc. (do GetMemberTournamentResults)
    totalStrokes: number, points: number,
    // ── Enriquecimento via GetPlayerTeeTimes ──
    status: number|null,                  // 1 = activo, outro = WD/DNS/IE
    teeMarkerName: string|null,           // "Tee Y"
    teeMarkerColor: string|null,          // "Yellow"
    handicap: number|null, driverLength: number|null,
    pointsAll: string|null, tiebreaker: number|null,
    isCaptain: number|null, isNewPlayer: string|null,
    rounds: Record<ronda, {
      strokes: number[18],                // sempre 18 (9H: zeros nos não jogados)
      numStrokes: number, numHoles: number,
      course: string|null,
      // ── Enriquecimento (do GetPlayerTeeTimes) ──
      startHole: number|null,             // 1 ou 10 (back nine)
      startTime: string|null,             // "09:09"
      groupNumber: number|null,
      playerNumber: number|null,
      liveScoringId: string|null,
      flightRound: string|null,
    }>,
  }>,
}
```

Schema deliberadamente fala SI/par/yards a partir do `GetMemberTournamentResults` (que devolve `t_pars` / `t_yards` no nível torneio), e os campos ricos (tee marker + ronda detalhada) a partir do `GetPlayerTeeTimes` quando o `pid` consegue ser matched via fingerprint. Quando o fingerprint falha (rondas degeneradas tipo `[0,0,...]`), `pid: null` e os campos ricos ficam `null` — o resto da entrada continua válido.

### uskids-member-history.json (formato original — fonte do build-slim)

```
{ gerado_em, torneios: Record<tcode, {name, ...}>,
  jogadores: Record<memberId, {
    name, country, ageGroup, totalTorneios,
    torneios: Record<tcode, {
      par: number[],    // ⚠ array com 1 elemento (total)! NÃO por buraco
      yards: number[],  // ⚠ idem — ex: par: [72]
      ageGroup, status (0=inscrito 1=completou 2=WD), place, totalStrokes,
      rounds: Record<ronda, { strokes[], course, startHole, gross, holes }>
    }>
  }>
}
```

### uskids-field-sizes.json

```
{ [tcode]: { name, start_date, end_date, rounds, escaloes: { "Boys 10": { fid, inscritos } } }, _gerado_em: "..." }
```
Gerado por `scripts/fetch-uskids-field-sizes.js` (manual, sem workflow); lido pelo agregador (`sources/uskids.js`).

### t_de_tournaments_do_uskids.json

```
[{ t: number, name: string, date: "M/D/YYYY" }, ...]  // 6448 entradas
```
Lido pelo agregador (`scripts/aggregator/sources/uskids.js`) como lookup de nomes por t=.

### wjgc_*.json / eowagr*.json / brjgt*_*.json (formato BJGT)

```
{ tournament, category, course, year, par: number[18], si?: number[18],
  players: [{ name, country (nome extenso! "Portugal"), pos, result, total,
    rounds: [{ day, scores: number[18], f9, b9, gross }]
  }]
}
```
⚠ `country` é nome por extenso. Nomes podem estar em ALL CAPS → usar `displayName()`.

### ftm_doral_*.json (formato "ftm-doral")

```
{ tournament, year, source,  // o tid legado "doral{YY}" vem do FILE_TO_LEGACY_TID do KIDSdataLoader
  divisions: [{ division, name, par[], parTotal, startingHole (10 para B8-9 back-9),
    players: [{ id, name, country?, birthYear?, pos, toPar, total, r1Gross, r2Gross, rounds?[] }]
  }]
}
```

### {nfed}/analysis/data.json (por jogador)

```
{ DATA: CourseData[], HOLES: Record<scoreId, { g[18], p[18], si[18], m?[18], hc }>,
  EC, ECDET, HOLE_STATS, TEE, CURRENT_FED, HCP_INFO, META }
```
⚠ **Sem `CROSS_DATA` desde 2026-09-06** — a tabela global vive em
`/data/cross-data.json` e é fundida em runtime pelo `playerDataLoader`
(ver "Deployment Storage do Vercel").

---

## Todos os ficheiros JSON em public/data/

| Ficheiro | Circuito | Gerado por | Scorecard? | Usado em |
|----------|----------|------------|------------|----------|
| pull-torneiosNNN.json (000-NNN) | FPG | scrape-classif-node.js (novos) ou pull-torneios.js browser (legacy) | ✓ | FPGPage, agregador (`sources/fpg.js`; pull-torneios000 autoritativo) |
| fpg-admissions-draws.json | FPG | scrape-fpg-admissions-draws-node.js (novo) | ✗ | AdmissionsTab, DrawTab (inscrições + pairings pré-jogo) |
| players.json | FPG | pipeline.js | ✗ | JogadoresPage, FPGPage, agregador (enriquecimento) |
| master-courses.json | FPG | pipeline.js (+ add-paco-do-lumiar.js p/ campos manuais) | ✓ | CamposPage |
| course-players.json | FPG | build-course-players.js | ✓ | CamposPage (`_players` dos campos PT — quem jogou + scores por volta) |
| course-player-names.json | FPG | build-course-player-names.js | ✗ | CamposPage (mapa fed→nome + `dob`/`sex` p/ os jogadores dos campos) |
| recent-tournaments.json | FPG | build-recent-tournaments.js | ✓ | RecentTournamentsPage (`/torneios-recentes`) — torneios reconstruídos das voltas dos nossos |
| simulador-players.json | FPG | build-simulador-players.js (update-drive + update-federados) | ✗ | SimuladorPage — selector: Drive da Madeira dos últimos 12 meses (Drive Tour + Drive Challenge só Sub-12/Sub-14) + escolhidos à mão, com HI/sexo do cadastro (a página não carrega o federados.json de 18 MB) |
| drive-data-YYYY-MM.json | FPG | scrape-drive-node.js (mensal) | ✓ | DrivePage |
| aquapor-data-YYYY-MM.json | FPG | scrape-drive-node.js (mensal) | ✓ | DrivePage |
| melhorias.json (⚠ na RAIZ, não em public/data) | FPG | enrich-intl-round.js | ✓ | JogadoresPage, CamposPage (importado em `App.tsx`) |
| away-courses.json | FPG | pipeline.js | ✓ | CamposPage |
| player-stats.json (⚠ em `public/`, não em public/data) | FPG | enrich-players.js | ✗ | JogadoresPage |
| {fed}/analysis/data.json | FPG | make-scorecards-ui.js | ✓ | JogadoresPage (PlayerDetail), BJGTAnalysisPage, CamposPage, CompararPage, SimuladorPage, TeeAdvisorView, kids/PrevisaoTab |
| uskids-results.json | USKids | fetch-uskids-results.js | ✓ | USKIDSPage, agregador (`sources/uskids.js`) |
| uskids_torneios_completos(1-41).json | USKids | browser script | ✓ | USKIDSPage, agregador (`sources/uskids.js`) |
| uskids-member-history.json | USKids | fetch-uskids-member-history.js | ✓ (sem par/SI) | **Em `data-archive/`** — fonte para build-slim |
| uskids-member-history-XXX.json | USKids | fetch (legacy) | ✓ (sem par/SI) | **Em `data-archive/`** — fonte para build-slim |
| uskids-member-history-slim.json | USKids | build-member-history-slim.js | ✓ (sem par/SI) | agregador + kids/FieldRivaisDashboard, HistoricScorecardsTab, USKIDSPage, PastEditionsTable (tabs Scores/Scorecards/Campo/Previsão) |
| uskids-rich-players/{mid}.json | USKids | fetch-uskids-rich-players-node.js | ✓ (com teeMarker, startTime, groupNumber) | **Em `data-archive/`** — 1 ficheiro por jogador, carreira completa rica |
| uskids-rich-flight-cache.json.gz | USKids | fetch-uskids-rich-players-node.js | ✗ | **Em `data-archive/`** — cache (tcode → flights/players) para a pipeline rica; **gzipada** (em claro passava o limite de 100 MB do GitHub) |
| uskids-rich-run-summary.json | USKids | fetch-uskids-rich-players-node.js | ✗ | **Em `data-archive/`** — sumário do último run (debug) |
| uskids-field.json | USKids | fetch-uskids-field.js | ✗ | USKIDSPage |
| uskids-field-sizes.json | USKids | fetch-uskids-field-sizes.js (manual, sem workflow) | ✗ | agregador (`sources/uskids.js`) |
| uskids-discovery-cache.json | USKids | fetch-uskids-field.js (Fase 1) | ✗ | fetch-uskids-results.js |
| t_de_tournaments_do_uskids.json | USKids | (automação, 6448 entries) | ✗ | agregador (lookup de nomes por t=) |
| brjgt*_*.json, wjgc_*.json | BJGT/WJGC | scraper antigo (⛔ não correr; ficheiros históricos) | ✓ | MajorPage (via módulo BJGTPage), FieldRivaisDashboard, agregador |
| eowagr25_*.json | EOWAGR | scraper antigo (⛔ não correr; ficheiros históricos) | ✓ | MajorPage (via módulo BJGTPage), agregador |
| ftm_doral_{2018..2025}.json | Doral | scrape-golfgenius.js | r1/r2Gross | MajorPage (via módulo DORALPage), agregador |
| coc_{2023..2026}.json | Champion of Champions | scrape-golfgenius-node.js (`--scope`) | ✓ (9 e 18 buracos) | MajorPage (source `coc`), aggregator (`sources/coc.js`) |
| france-players.json | FFG | build-france-players.js | ✗ | FFGPage (`/ffg/info/joueurs`), aggregator |
| ffgolf-player-tournaments.json | FFG | build-france-players.js | ✗ | FFGPage — torneios+resultados de cada jogador (painel expansível) |
| spain-players.json | RFEG | build-spain-players-export.js | ✗ | RFEGPage (`/rfeg/info/jugadores`, `rfeg/PlayersView`), aggregator |
| spain-player-tournaments.json | RFEG | build-spain-player-tournaments.js | ✗ | RFEGPage — torneios+resultados de cada jogador (painel expansível) |
| england_{slug}.json | England Golf | scrape-england-golf.js | ✓ (com teeColour/metersPlayed[18] por ronda) | EnglandGolfPage |
| england-golf-catalog.json | England Golf | manual | ✗ | EnglandGolfPage (sidebar) |
| torneio-greatgolf.json | Greatgolf | — | — | ⚠ ficheiro inexistente — só referido em dataRegistry e `ui/DataSources.tsx` |
| rivals-intl.json | — | — | ✗ | ⚠ ficheiro inexistente — só registado em dataRegistry |
| tournament-links.json | — | — | ✗ | FPGPage, `ui/DataSources.tsx` (registado em dataRegistry) |
