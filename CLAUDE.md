# CLAUDE.md — Golf Portugal

Aplicação web de golfe júnior português. Acompanha o percurso competitivo de um jovem golfista (Manuel, CGSS Santo da Serra, Madeira) nos circuitos USKids Golf, FPG, BJGT/WJGC, EOWAGR e Doral.

**URL produção:** `golf-fpg.vercel.app`
**Directório local:** `C:\golf-fpg\`

## Regra fundamental

**Nunca declarar uma tarefa como concluída sem correr os testes.** Antes de afirmar que algo está pronto:
1. `npm test` — confirmar que todos os testes passam (0 falhas)
2. `npm run build` — confirmar que compila sem erros (TypeScript strict + Vite)

Erros de tipo, imports em falta, variáveis não usadas, ou testes falhados invalidam a entrega.

**Entregar sempre o ficheiro definitivo.** Testar internamente antes de entregar — o utilizador nunca deve receber ficheiros intermédios ou ter de fazer passos extra. O output é o ficheiro final, pronto a substituir.

## Stack

- React 19 + TypeScript 5.9 + Vite 6
- react-router-dom 6 (SPA, client-side routing)
- recharts 3 (gráficos)
- html2canvas (exportação de overlays)
- Playwright (scraping pipeline)
- Deploy: Vercel com GitHub integration
- 5 GitHub Actions para automação de dados

## Estrutura

```
src/
  pages/          # 12 páginas lazy-loaded
  data/           # loaders, types, registos de dados (KIDSdataLoader, rivalData, dataRegistry, etc.)
  ui/             # componentes partilhados (NavBar, PillBadge, SidebarToggle, etc.)
  utils/          # format, mathUtils, teeColors, flagUtils, fixEncoding, whsCalc, scoreDisplay
  tokens/         # colors.ts (espelho JS dos tokens CSS)
  context/        # AppContext.tsx
  hooks/          # useIsMobile, useMasterDetail, useSort, usePlayerData

scripts/          # ~20 scripts Node.js para pipeline de dados
public/data/      # ficheiros JSON servidos ao runtime
public/data-archive/ # ficheiros pesados (uskids-member-history-XXX.json) — não servidos ao browser

tokens.css        # FICHEIRO ÚNICO de design tokens
App.css           # Classes de componentes (~110KB)
design-system.html # Referência visual de todos os componentes CSS
```

### Páginas (lazy-loaded)

| Rota | Página | Dados |
|------|--------|-------|
| `/jogadores/:fed` | JogadoresPage | data.json por jogador, player-stats.json |
| `/campos/:courseKey?` | CamposPage | master-courses.json, away-courses.json, extraCourses.ts |
| `/uskids` | USKIDSPage | uskids-results.json, uskids_torneios_completos(1-30).json, uskids-field.json |
| `/kids` | KIDSPage | KIDSdataLoader (todos os JSON internacionais) |
| `/diversos` | FPGPage | pull-torneiosNNN.json |
| `/drive` | DrivePage | drive-data.json, aquapor-data.json |
| `/bjgt/:fed?` | BJGTPage | bjgt_*.json, wjgc_*.json |
| `/bjgt-analysis/:fed?` | BJGTAnalysisPage | data.json por jogador |
| `/comparar` | CompararPage | — |
| `/simulador` | SimuladorPage | — |
| `/calendario` | CalendarioPage | — |
| `/doral` | DORALPage | ftm_doral_*.json |

## Comandos

```bash
npm run dev       # servidor local Vite
npm run build     # build de produção
npm test          # correr testes (vitest)
npm run preview   # preview do build
npm run scrape    # pipeline completo (golf-all.js)
npm run login     # login FPG (gera sessão)
```

## IDs importantes

| O quê | Valor |
|-------|-------|
| Manuel — FPG nfed | `52884` |
| Manuel — USKids playerID | `630106` |
| Manuel — USKids accountUID | `762810` |
| Manuel — DOB | `29/04/2014` (MANUEL_BIRTH_YEAR = 2014) |
| TORNEIOS_COMPLETOS_COUNT | `30` (constante em USKIDSPage.tsx — atualizar ao adicionar completos) |
| Signupanytime ax — intl | `1129` |
| Signupanytime ax — Marco Simone 2025 | `2739` |
| Signupanytime ax — El Prat | `2760` |
| Servidor local (update-jogadores/torneios) | `:3456` |

---

## KIDSdataLoader — Arquitectura do loader de rivais

O `KIDSdataLoader.ts` é o loader central da KIDSPage. Exporta `buildAutoRivals()`, `normName()`, `getScorecards()`, `uskTournNames` (Map) e `uskFieldSizes` (Map).

### 3 Fases de carregamento

**Fase 1 — Paralelo (core tasks):**
Carrega em paralelo todos estes ficheiros, processando cada um com a função adequada:
- `wjgc_*.json`, `eowagr*.json` → `processWjgc(d, tid)`
- `ftm_doral_*.json` → `processDoral(d)`
- `uskids-results.json` → `processUskids(d)`
- `uskids_torneios_completos(1-30).json` → `processUskidsCompleto(d)` (suporta formato v1 e v2)
- `uskids-field-sizes.json` → `processFieldSizes(d)` (popula `uskFieldSizes`)
- `t_de_tournaments_do_uskids.json` → `processTournMeta(d)` (popula `uskTournNames`, 6448 entradas)
- `processManuelOverrides()` — injeta scores manuais do Manuel (MANUEL_OVERRIDES)

O `uskids-member-history-slim.json` começa a descarregar em paralelo nesta fase mas só é processado na Fase 2.

**Fase 2 — Member History (slim):**
Aguarda o `uskids-member-history-slim.json` → `processMemberHistory(d)`. Ficheiro slim único (dados do torneio partilhados em `d.torneios`, não duplicados por jogador). Fonte complementar para torneios não cobertos pelos completos.

**Fase 3 — Pull-torneios (autoritativo):**
`pull-torneios000.json` → `processPullTorneios(d)` com `PULL_TIDS` force set. **Sobrescreve** dados parciais de outras fontes. Mapeamento `PULL_TCODE_TO_TID`:
- `10260` → `gg25` (Greatgolf Junior Open 2025)
- `10080` → `qdl25` (Quinta do Lago Junior Open 2025)
- `10296` → `gg26` (Greatgolf Junior Open 2026 U12)
- `10295` → `gg26_u14` (Greatgolf Junior Open 2026 U14)
- `10294` → `gg26_open` (Greatgolf Junior Open 2026 open)

Depois: enriquecimento FPG via `players.json` (carregado em paralelo desde o início) — corrige `co="Portugal"`, adiciona `fpgClub` e `dob`.

### Formato tid (tournament ID interno)

- USKids completo: `usk{tcode}_b{minAge}` (ex: `usk21080_b11`)
- USKids results (uskids-results.json): lookup via `USKIDS_ID[tourn.name]` (ex: `desert26`, `sandestin26`)
- WJGC/EOWAGR: tid definido no array de tasks (ex: `wjgc26`, `eowagr25_b910`)
- Doral: `doral{YY}_b{ages}` gerado por `processDoral()` baseado em `d.year`
- Pull-torneios: via `PULL_TCODE_TO_TID` (ex: `gg25`, `qdl25`)
- Manuel overrides: definido em `MANUEL_OVERRIDES[].tid` (ex: `marco26_b11`)

### MANUEL_OVERRIDES

Array que injeta manualmente scores do Manuel quando ele foi excluído pelo scraper. Actualmente: Marco Simone 2026 Boys 11 — Manuel marcado IE (Ineligible) por erro de assinatura de scorecard. Scores reais R1=86, R2=79 injectados com scorecards completos.

### processUskidsCompleto — Dois formatos

**v1 (antigo):** array `[{t, meta:{tournament, age_groups, flight_courses,...}, flights:[...]}]`
**v2 (novo):** objecto `{signupanytime_t, name, start_date, age_groups, flights:{fid:{category, course_info, flight_players}}}` — detectado por presença de `signupanytime_t`. Par extraído de `course_info.R{n}.holes[].par` (preferido) ou `flight_courses` (fallback).

### Cache

`buildAutoRivals()` tem cache interna (`_autoRivalsCache`). Chamar com `opts.force: true` ou `invalidateAutoRivalsCache()` para forçar reload.

---

## Scripts — FPG Pipeline

Dois modos: **Browser Console** (colar no F12 num site específico) e **Node.js Terminal** (correr em `C:\golf-fpg\scripts\`).

### Fluxo: Atualizar jogadores FPG

1. `node login.js` → `session.json` (abre browser para login manual em `area.my.fpg.pt`)
2. Browser Console em `scoring.fpg.pt`: `fpg-download-whs-only.js` → `fpg-whs-all.json` (alternativa headless: `node scraper-headless.js --players`)
3. `node pipeline.js --batch` → `output/{fed}/analysis/data.json`
4. `node enrich-players.js` → `player-stats.json`

### Fluxo: Atualizar torneios (DRIVE/AQUAPOR/pull)

1. Browser Console em `scoring.datagolf.pt`: `scrape-drive-aquapor-v7.js` → `drive-data.json` + `aquapor-data.json`
2. Browser Console em `scoring.datagolf.pt`: `pull-torneios.js` → `pull-torneiosNNN.json` (editar `POR_CODIGO` com ccode/tcode)
3. `node build-drive-sd-lookup.js` → `drive-sd-lookup.json`

### Scripts FPG detalhados

**golf-all.js** — Pipeline completo: login → download WHS → scorecards → data.json → sync players → enrich stats.
```bash
node golf-all.js 52884              # primeira vez
node golf-all.js --refresh 52884    # novos scorecards
node golf-all.js --login 52884      # forçar login
node golf-all.js --force 52884      # re-descarregar tudo
node golf-all.js --skip-download 52884  # só gerar (dados já existem)
node golf-all.js --all              # todos os jogadores
```

**pipeline.js** — Pós-download: import → render → sync → enrich → extract.
```bash
node pipeline.js 52884              # import+render+sync
node pipeline.js --batch            # importar fpg-batch-*.json dos Downloads
node pipeline.js --all              # todos de players.json
node pipeline.js --skip-import 52884  # só processar
node pipeline.js --sync-players     # só actualizar players.json
```
Output: `data.json`, `players.json`, `player-stats.json`, `away-courses.json`

**login.js** — Abre browser para login manual em `area.my.fpg.pt`. Depois navegar para `scoring.fpg.pt` e pressionar ENTER → guarda `session.json`.

**scraper-headless.js** — Alternativa headless ao fluxo browser.
```bash
node scraper-headless.js --tournaments
node scraper-headless.js --players
node scraper-headless.js --players --feds 47078 52884
HEADLESS=true node scraper-headless.js --tournaments --players
```

**update-jogadores.js / update-torneios.js** — Servidor local (:3456) + script para colar no browser.
```bash
node update-jogadores.js --new
node update-jogadores.js --refresh
node update-jogadores.js --feds 47078 52884
```
Depois no F12 do site correspondente: `fetch("http://localhost:3456/browser-script.js").then(r=>r.text()).then(eval)`

**scrape-drive-aquapor-v7.js** — Colar no F12 de `scoring.datagolf.pt/pt/tournaments.aspx`. v7 fix: usa `classifAgregate.aspx/ScoreCard` (v6 tinha bug R1=R2).

**pull-torneios.js** — Browser Console em `scoring.datagolf.pt`. Configurar `POR_CODIGO`: `{ tclub: "985", tcode: "12345" }` (obter da URL: `…Classifications.aspx?ccode=985&tcode=12345`). Output → copiar para `public/data/` e incrementar contador.

**fpg-download-whs-only.js** — Browser Console em `scoring.fpg.pt/lists/PlayerWHS.aspx?no=52884`. Download ~2-5 min. Se a página refreshar, alterar `START_INDEX`.

**Utilitários:**
- `node make-scorecards-ui.js 52884` / `--all` — gera UI scorecards
- `node enrich-players.js` → `player-stats.json`
- `node build-drive-sd-lookup.js` → `drive-sd-lookup.json`
- `node merge-courses.js` — consolida campos duplicados
- `node find-tcodes.js` — varre ccode/tcode, imprime torneios
- `node validate-encoding.js` — valida encoding dos JSON

---

## Scripts — USKids (Playwright)

**fetch-uskids-results.js** — Scorecards completos + par/yards reais por buraco. Torneios em curso: atualiza auto. Históricos configurados no array `HISTORICOS`.
```bash
node fetch-uskids-results.js
```
Output: `public/data/uskids-results.json`

**fetch-uskids-member-history.js** — Histórico completo de carreira USKids de cada jogador nos flights configurados. Matching memberID→nome por strokes fingerprinting. Checkpoint a cada 50 jogadores — seguro interromper.
```bash
node fetch-uskids-member-history.js         # scrape (só novos)
node fetch-uskids-member-history.js --clean  # re-match nomes offline (sem browser)
```
Output: `public/data-archive/uskids-member-history.json` (ficheiro único)

**build-member-history-slim.js** — Converte os ficheiros numerados `uskids-member-history-XXX.json` (em `public/data-archive/`) num único `uskids-member-history-slim.json` (em `public/data/`). Remove campos duplicados entre jogadores, mantém apenas gross+strokes por ronda.
```bash
node scripts/build-member-history-slim.js
```

**fetch-uskids-field.js** — Corre 1x/dia. Descobre novos torneios + inscritos.
```bash
node fetch-uskids-field.js
```

**fetch-uskids-discovery.js** — Varre IDs no signupanytime, filtra torneios internacionais por keywords. Forçar inclusão: `FORCAR_INCLUIR = new Set([21080, 21573, 21199, 21200, 21133])`.

### USKids — Script browser (F12)

**uskids_scrape_courses_PERFEITO_COM_DISTANCIAS.js** — Colar em `www.signupanytime.com` (qualquer página). Gera `uskids_torneios_completos(N).json` com par+yards reais e scorecards completos. Suporta dois formatos de output: v1 (antigo, array) e v2 (novo, objecto com `signupanytime_t`).
- Configurar: editar array `TOURNAMENTS`: `{ t: "21080" }`
- Após download: copiar para `public/data/` e atualizar `TORNEIOS_COMPLETOS_COUNT` em USKIDSPage.tsx (actualmente **30**)

### Flights no member-history (FLIGHTS + TOURN_NAMES em fetch-uskids-member-history.js)

| Torneio | t= | Boys 9 | Boys 10 | Boys 11 | Boys 12 |
|---------|-----|--------|---------|---------|---------|
| Marco Simone 2026 | 21080 | 272798 | 272799 | 272800 | 272801 |
| Venice Open 2025 | 19418 | 250227 | 250228 | 250229 | 250230 |
| Rome Classic 2025 | 20175 | 260328 | 260329 | 260330 | 260331 |
| European Championship 2025 | 18242 | 234338 | 234339 | 234340 | 234341 |
| European Championship 2026 | 21131 | 273490 | 273491 | 273492 | 273493 |

Para adicionar: obter fids via `GetMeta&t={t}` campo flights → adicionar a FLIGHTS + TOURN_NAMES → correr.

---

## Scripts — BJGT / WJGC / EOWAGR / Doral

**scrape-bluegolf.js** — Scraper genérico BlueGolf. Browser visível (CAPTCHA possível).
```bash
node scrape-bluegolf.js "https://brjgt.bluegolf.com/…/contest/73/leaderboard.htm" wjgc_2026_b1011.json
```
Depois: copiar JSON para `public/data/` e registar em `dataRegistry.ts` + `KIDSdataLoader.ts` (adicionar ao array `coreTasks`).

**scrape-eowagr25-all.js** — 3 escalões de uma vez: B9-10 (c13), B13-14 (c77), B7-8 (c121).
```bash
node scrape-eowagr25-all.js
```

**scrape-eowagr25.js** — Contest 21 (Boys 11-12) com scorecards completos.
```bash
node scrape-eowagr25.js [output.json]
```

**scrape-golfgenius.js** — Doral (First Tee Miami). v2: fix coluna "total", B8-9 suporta 9H back-9.
```bash
node scrape-golfgenius.js                    # 2025 (URL default)
node scrape-golfgenius.js ftm_doral_2024.json https://2024firstteemiamidoraljrclassic.golfgenius.com/pages/4894994
```

---

## API Signupanytime

Base: `https://www.signupanytime.com/plugins/links/admin/LinksAJAX.aspx?op={OP}&…`
Em Playwright, navegar primeiro para o iframe: `…/front/linksviews.aspx?v=results&fmt=nohead&ax=1129&t={t}`

| Endpoint | Descrição | Retorna |
|----------|-----------|---------|
| `GetMeta&t={tcode}` | Metadados: flights, age_groups, **flight_courses** (par+yards reais!), courses | tournament, flights, age_groups, flight_courses{pars[], lengths[]}, flight_rounds |
| `GetTournamentPlayers&t={tcode}&f={fid}` | Lista de memberIDs num flight | PlayerNodeId: number[] |
| `GetPlayerTeeTimes&f={fid}&r={round}&p={page}&t=0` | **Scores buraco-a-buraco.** Paginado, 20/pág | flight_players com strokes[18], country, place, status |
| `GetMemberTournamentResults&m={memberID}` | Histórico completo de carreira | Todos os torneios com rounds, strokes[], course, gross |

Em Playwright: intercettar `GetMeta` via `page.on('response')` é mais fiável do que chamar directamente.

---

## t= codes USKids conhecidos

### Em USKIDS_KNOWN_TCODES (processados pelos torneios_completos)

| t= | Nome | Data | Tipo |
|----|------|------|------|
| 8300 | European Championship 2022 | Mai 2022 | EURO |
| 11604 | World Championship 2022 | Ago 2022 | WORLD |
| 12093 | Red White & Blue Inv. 2022 | Jul 2022 | USA |
| 12229 | Venice Open 2022 | Ago 2022 | EURO |
| 13568 | European Championship 2023 | Mai 2023 | EURO |
| 14029 | World Championship 2023 | Ago 2023 | WORLD |
| 14218 | Red White & Blue Inv. 2023 | Jul 2023 | EURO |
| 14302 | Venice Open 2023 | Ago 2023 | EURO |
| 15573 | Real Club de Golf El Prat | Oct 2023 | EURO (9H) |
| 15704 | European Championship 2024 | Mai 2024 | EURO |
| 15807 | World Championship 2024 | Ago 2024 | WORLD |
| 16428 | Venice Open 2024 | Ago 2024 | EURO |
| 16705 | Red White & Blue Inv. 2024 | Jul 2024 | EURO |
| 18124 | World Championship 2025 | Jul 2025 | WORLD |
| 18242 | European Championship 2025 | Mai 2025 | EURO |
| 18438 | Marco Simone Invitational 2025 | Mar 2025 | EURO |
| 18719 | Red White & Blue Inv. 2025 | Jul 2025 | USA |
| 19418 | Venice Open 2025 | Ago 2025 | EURO |
| 20175 | Rome Classic 2025 | Out 2025 | EURO |
| 20895 | Sandestin Championship 2026 | Jan 2026 | USA |
| 21004 | Desert Shootout 2026 | Fev 2026 | USA |
| 21080 | Marco Simone Invitational 2026 | Mar 2026 | EURO |
| 21239 | Mississippi State Inv. 2026 | Mar 2026 | USA |

### Em USKIDS_ID (torneios sem completos, processados via uskids-results.json)

| Nome no JSON | tid | Notas |
|-------------|-----|-------|
| Desert Shootout 2026 | `desert26` | |
| Sandestin Championship 2026 | `sandestin26` | |
| 2026 Mississippi State Invitational | `msstate26` | |
| 2026 South Carolina State Invitational | `scstate26` | |
| Real Club de Golf El Prat | `elprat23` | 9H |

### Futuros / em FLIGHTS

| t= | Nome | Data |
|----|------|------|
| 21131 | European Championship 2026 | Ago 2026 |
| 21573 | Marco Simone Local Tour 2026 | 2026 |
| 21610 | World Championship 2026 | Set 2026 |

### Regionais USA (em LINKS_EXTRA / REGIONAL_CHAMPIONSHIPS)

20895, 21004, 21133 (Jekyll Island), 21620 (Texas), 22037 (Palmer Kids), 21471 (Hawaii), 21628 (Tennessee), 21629 (Wisconsin), 21631 (Nevada), 21650 (Northwest), 21722 (Arkansas), 21845 (Florida Spring), 21846 (N. California), 21847 (Arizona), 21848 (N. Carolina), 22059 (Illinois), 22062 (Georgia), 22080 (Oklahoma), 22088 (Ohio), 22090 (Missouri), 22099 (Texas Spring), 22121 (Washington), 22122 (Virginia).

---

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
  roundScores?: [{ round, gross, scores[18], pars[18], si[18], meters?[18], courseRating?, slope?, teeName? }]
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
⚠ `strokes[]` pode estar ausente. `par[]` nem sempre existe — usar `USKIDS_PAR["{tcode}-{age_group}"]` como fallback.

### uskids_torneios_completos(N).json — Dois formatos

**v1 (antigo):** array
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

### uskids-member-history-slim.json (formato slim para KIDSdataLoader)

Gerado por `build-member-history-slim.js` a partir dos ficheiros numerados em `public/data-archive/`. Escrito em `public/data/`.

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

### uskids-member-history.json (formato original, usado por KIDSPage H2H)

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
{ [tcode]: { escaloes: { "Boys 10": { inscritos: N }, ... } }, _gerado_em: "..." }
```
Popula `uskFieldSizes` Map. Grupos com range ("Boys 9-10") populam todas as idades: `usk{tcode}_b9` e `usk{tcode}_b10`.

### t_de_tournaments_do_uskids.json

```
[{ t: number, name: string, date: "M/D/YYYY" }, ...]  // 6448 entradas
```
Popula `uskTournNames` como fallback (hardcoded em `USKIDS_TCODE_META` tem prioridade).

### wjgc_*.json / eowagr*.json / bjgt_*.json (formato "bluegolf")

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
{ year,  // gera tids dinâmicos "doral{YY}_b{ages}"
  divisions: [{ key, label, nineHoleOnly, startingHole (10 para B8-9 back-9),
    par[], course, cr?, slope?,
    players: [{ name, country?, pos, r1Gross, r2Gross, total, toPar, rounds?[] }]
  }]
}
```

### {nfed}/analysis/data.json (por jogador)

```
{ DATA: CourseData[], HOLES: Record<scoreId, { g[18], p[18], si[18], m?[18], hc }>,
  EC, HOLE_STATS, CROSS_DATA, CURRENT_FED, HCP_INFO, META }
```

---

## Todos os ficheiros JSON em public/data/

| Ficheiro | Circuito | Gerado por | Scorecard? | Usado em |
|----------|----------|------------|------------|----------|
| pull-torneiosNNN.json (000-NNN) | FPG | pull-torneios.js | ✓ | FPGPage, KIDSdataLoader (pull-torneios000 autoritativo) |
| players.json | FPG | pipeline.js | ✗ | JogadoresPage, FPGPage, KIDSdataLoader (enriquecimento) |
| master-courses.json | FPG | pipeline.js | ✓ | CamposPage |
| drive-data.json | FPG | scrape-drive-aquapor-v7.js | ✓ | DrivePage |
| aquapor-data.json | FPG | scrape-drive-aquapor-v7.js | ✓ | DrivePage |
| melhorias.json | FPG | manual | ✓ | JogadoresPage, CamposPage |
| away-courses.json | FPG | pipeline.js | ✓ | CamposPage |
| player-stats.json | FPG | enrich-players.js | ✗ | JogadoresPage |
| drive-sd-lookup.json | FPG | build-drive-sd-lookup.js | ✗ | DrivePage |
| {fed}/analysis/data.json | FPG | make-scorecards-ui.js | ✓ | JogadoresPage, BJGTAnalysisPage, DrivePage |
| uskids-results.json | USKids | fetch-uskids-results.js | ✓ | USKIDSPage, KIDSdataLoader |
| uskids_torneios_completos(1-30).json | USKids | browser script | ✓ | USKIDSPage, KIDSdataLoader |
| uskids-member-history.json | USKids | fetch-uskids-member-history.js | ✓ (sem par/SI) | **Em `public/data-archive/`** — fonte para build-slim |
| uskids-member-history-XXX.json | USKids | fetch (legacy) | ✓ (sem par/SI) | **Em `public/data-archive/`** — fonte para build-slim |
| uskids-member-history-slim.json | USKids | build-member-history-slim.js | ✓ (sem par/SI) | KIDSdataLoader (Fase 2) + KIDSPage (H2H, DOB) |
| uskids-field.json | USKids | fetch-uskids-field.js | ✗ | USKIDSPage |
| uskids-field-sizes.json | USKids | (automação) | ✗ | KIDSdataLoader (uskFieldSizes) |
| uskids-discovery-cache.json | USKids | fetch-uskids-discovery.js | ✗ | fetch-uskids-results.js |
| t_de_tournaments_do_uskids.json | USKids | (automação, 6448 entries) | ✗ | KIDSdataLoader (uskTournNames fallback) |
| bjgt_*.json, wjgc_*.json | BJGT/WJGC | scrape-bluegolf.js | ✓ | BJGTPage, KIDSdataLoader |
| eowagr25_*.json | EOWAGR | scrape-eowagr25*.js | ✓ | KIDSdataLoader |
| ftm_doral_2024/2025.json | Doral | scrape-golfgenius.js | r1/r2Gross | KIDSdataLoader |
| torneio-greatgolf.json | Greatgolf | scrape-drive-aquapor-v7.js | ✓ | KIDSdataLoader |
| rivals-intl.json | — | — | ✗ | (registado em dataRegistry) |
| tournament-links.json | — | — | ✗ | (registado em dataRegistry) |

---

## Sites e links de dados

| Site | URL | Para quê | Auth |
|------|-----|----------|------|
| scoring.datagolf.pt | `scoring.datagolf.pt/pt/tournaments.aspx` | Torneios DRIVE+AQUAPOR+pull | Público |
| scoring.fpg.pt | `scoring.fpg.pt/lists/PlayerWHS.aspx?no=52884` | Download WHS | Login |
| area.my.fpg.pt | `area.my.fpg.pt/login/` | Login FPG (SSO) | SSO |
| signupanytime.com | `www.signupanytime.com` | Torneios USKids | Público |
| tournaments.uskidsgolf.com | `tournaments.uskidsgolf.com/tournaments/international` | Calendário torneios | Público |
| brjgt.bluegolf.com | `brjgt.bluegolf.com` | BJGT/WJGC/EOWAGR | CAPTCHA possível |
| GolfGenius (Doral) | `firstteemiamidoraljrclassic.golfgenius.com` | Doral Jr. Classic | Público |

---

## Convenções de código

### CSS e cores

- **Todas as cores passam por `tokens.css`** — nunca hardcodar hex nos componentes.
- `colors.ts` espelha os tokens para uso em JS/TS (recharts, arrays de dados). Alterar primeiro em `tokens.css`, depois actualizar `colors.ts`.
- **Excepção intencional:** `OverlayExport.tsx` usa cores hardcoded porque `html2canvas` não suporta CSS custom properties — documentado com comentário no cabeçalho.
- `.p-intl { background: #00FF00 }` (verde néon) é **intencional** — não "corrigir".
- `design-system.html` na raiz documenta visualmente todas as classes CSS.

### Scorecard — semântica de cores

| Score | Cor | Token |
|-------|-----|-------|
| Eagle | Âmbar `#f59e0b` | `--score-eagle` |
| Birdie | Vermelho `#dc2626` | `--score-birdie` |
| Par | Transparente/branco | — |
| Bogey | Azul `#bfdbfe` cantos rectos | — |

Na barra de distribuição de scores, o segmento de par usa branco/transparente, **não** o valor do token `seg-par`.

### Componentes

- `PillBadge.tsx`: usa classes CSS (`p`, `p-sm`, `p-muted`, `p-tourn`, `p-sub10`, `p-sub12`, `p-sub14`), nunca inline styles. `RoundPill` exportado para pills de rondas.
- Toggles de scorecard: usar `<span>`, não `<button>` (o styling default do browser sobrepõe o CSS).
- Hooks partilhados: `useIsMobile.ts`, `useMasterDetail.ts`, `SidebarToggle.tsx` para sidebar unificada.
- `Toolbar.tsx` exporta `Toolbar`, `ToolbarTitle`, `ToolbarMeta`, `ToolbarSep`.
- `scoreDisplay.ts`: `scClass()`, `toParClass()`, `sc3m()`, `tpColorDark()`, `SC` (alias de C de colors.ts).
- `mathUtils.ts`: `zTier()`, `getTrend()`, `getAvgZ()`, `linearSlope()`, `toggleArr()`.
- `format.ts`: `fmtToPar()` (usar em vez de `fmtTp2`/`fmtTP2` locais), `sortArrow()`, `MONTHS_PT` (abrev.), `MONTHS_PT_FULL` (lowercase), `MONTHS_PT_LONG` (Title Case), `MONTH_MAP`.
- `constants/manuel.ts`: `MANUEL_FED`, `MANUEL_BIRTH_YEAR`, `isManuel()`, `escalaoManuelParaData()`, `MANUEL_KNOWN_TIDS`.
- `constants/tournaments.ts`: `TORNEIOS_CONFIG` (10 torneios FPG).
- `constants/tierDisplay.ts`: `TIER_L`, `TR_I` (labels e ícones de tier).
- CSS `.tab-under` + `.active`: tabs com underline (substitui `tabStyle()` inline).

### Princípios de arquitectura

- **Máxima globalização** — definições partilhadas (constantes, formatação, CSS) devem viver em módulos globais (`constants/`, `utils/`, `App.css`), nunca duplicadas por página. Se duas páginas usam o mesmo valor, extrair para um módulo partilhado.
- **Escalões são definidos por torneio** — cada organizador define os age groups conforme o número de inscritos (9-10, 10-11, etc.). Não existe uma lista global de escalões. Filtros de UI como `ESCALOES_DESTAQUE_USKIDS` são específicos da página onde são usados.
- **Cores de tees são da FPG** — `teeColors.ts` define cores específicas das marcações de tees (Vermelhas, Amarelas, etc.) conforme a federação. Não alterar nem "corrigir" esses hex — são intencionais.
- **Data layer sobre display layer** — filtragem, normalização e cálculos pertencem ao loader/data layer, não aos componentes de display.
- **Validação de scores** — `tp` (to-par) só se calcula quando todas as rondas têm scorecard hole-by-hole completo. Em torneios de 9 buracos, validar `grossStrokes >= holes`.
- **Consistência de deduplicação** — hero cards e tabelas de detalhe devem usar a mesma fonte de dados deduplicada (e.g. `confrontosH2H`).
- **Sem dead code** — nenhum código comentado, funções mortas ou variáveis não usadas nos outputs.
- **Reescrita completa vs patches** — quando a implementação diverge do design acordado, preferir reescrita limpa de raiz.
- **Cache de fetches** — `fetchCache.ts` exporta `cachedFetchJson()` (cache global entre páginas para URLs sem query string), `invalidateCache()`, `clearFetchCache()`.

### Dados

- **Layer de campos:** `extraCourses.ts` (manual) sobrepõe `away-courses.json` (pipeline). `_players` do pipeline é reaplicado por cima. CourseKeys devem coincidir com aliases do pipeline.
- **`players.json`:** carregado em paralelo, cross-referenciado por nome normalizado para enriquecer rivais com `fpgClub` e `dob`.
- Ficheiros "torneios completos" curados manualmente têm precedência sobre output do pipeline.
- Jogadores sem nome nos ficheiros de histórico são mantidos (potencial matching futuro).
- Filtros multi-select (circuitos, escalões) usam `Set`.
- **`rivalData.ts`**: dados estáticos de campos (par/SI/metros para Villa Padierna, Alferini, La Forêt, Venice, Marco Simone, Doral GP/SF), FIELD_2025 (WJGC stats), FIELD_CARDS (scorecards top players), TIER cores.

### Normalização

- "Russian Federation"/"Russia" e "US"/"United States" devem ser deduplicados nos dropdowns.
- Emojis: verificar Unicode cuidadosamente (erros recorrentes).
- Nomes em ALL CAPS: usar `displayName()` (detecta >45% maiúsculas → Title Case).
- `normName()`: trim + lowercase + normalizar espaços + remover diacríticos (NFD).
- Mapeamento de país: `CC` dict no KIDSdataLoader converte códigos curtos ("PT") para nomes extensos ("Portugal"). Suporta ~80 países incluindo variantes (UK→United Kingdom, PHL→Philippines).

### Classificação de jogadores

- Pills de tipo (Elite, Top Contender, etc.) aplicam-se apenas a rivais dentro de ±2 escalões de Manuel.
- Filtro de idade: `processMemberHistory` filtra apenas Boys 9-13 (foco do tracker).
- `MANUEL_BIRTH_YEAR = 2014` — usado para calcular o escalão do Manuel em cada torneio histórico.

---

## Armadilhas e bugs conhecidos

### Críticos

**Separação de pipelines USKids vs não-USKids** — Torneios não-USKids (Doral, WJGC, Greatgolf, QDL, EOWAGR) devem alimentar **apenas** a tab Rivais via `buildAutoRivals()`. A tab Resultados carrega **exclusivamente** de `uskids-results.json` e `uskids_torneios_completos(1-30).json`. Este bug voltou várias vezes.

**Manuel tem 3 variantes de nome** — "Manuel Medeiros", "Manuel Francisco Medeiros", "Manuel Goulartt Medeiros". Usar sempre `autoRivals.filter(d => d.isM)` (não `find()`) e fazer merge de todas as entradas.

**Referências estáticas a dados fora de componentes React ficam stale** — `const manuel = D_BASE.find(x => x.isM)` fora de um componente referencia dados pré-merge. Fazer lookup dentro do componente via state.

### Dados

- **scrape-drive-aquapor-v6 bug R1=R2** — v6 usava API que ignora `classifround`. v7 usa `classifAgregate.aspx/ScoreCard` — corrigido.
- **ScorecardLeaderboard par vazio** — se `par[]` chegar vazio, `nh=0`, slice→[], soma=0. Fix: `const nhRef = par.length || (is9 ? 9 : 18)`.
- **KIDSdataLoader filtro 18H bloqueava 9H** — El Prat 2023 (9H) não aparecia. Fix: usar `expectedHoles = par.length` dinâmico. El Prat também precisou de `USKIDS_PAR["15573-2151"]` manual.
- **Irmãos com mesmo apelido** — falsos positivos no matching de rivais. Fix: first-name prefix penalty no `scoreMatch()`.
- **lengths[] nos completos são jardas** — converter ×0.9144 para metros.
- **strokes[] tem sempre 18 posições** — em torneios 9H, posições não jogadas = 0. Filtrar zeros.
- **MANUEL_OVERRIDES** — Manuel foi marcado IE (Ineligible) no Marco Simone 2026 Boys 11 por erro de assinatura de scorecard. `processManuelOverrides()` injeta os scores reais (R1=86, R2=79).
- **applyResultOverrides()** — em USKIDSPage.tsx, injeta resultados do Manuel quando marcado como WD/IE nos dados.
- **Dados de 9 buracos** — torneios USKids local tour de 9 buracos geravam scores negativos impossíveis. Resolvido validando completude do scorecard (`grossStrokes >= holes`).
- **Duplicados normCountry** — duplicados em `normCountry` (USKIDSPage) + `TW:"Taiwan"` duplicado no KIDSdataLoader causavam warnings Vite.

### Ambiente

- **iOS copy-paste** — copiar código no mobile substitui aspas rectas por aspas tipográficas curvas → rebenta esbuild. Descarregar ficheiros do desktop.
- **Cross-page linking** — `↗ Kids` links em USKIDSPage abrem `/kids#EncodedPlayerName` em novo tab; KIDSPage lê `location.hash` para auto-seleccionar.

---

## Ficheiros-chave

| Ficheiro | Papel |
|----------|-------|
| `KIDSPage.tsx` | Página de tracking de rivais internacionais (3061 linhas) |
| `KIDSdataLoader.ts` | Loader central: 3 fases, todos os JSON internacionais (1144 linhas) |
| `USKIDSPage.tsx` | Resultados USKids com links cruzados para Kids |
| `FPGPage.tsx` | Dados da federação portuguesa |
| `rivalData.ts` | Dados estáticos: pars/SI/metros de campos, FIELD_2025, FIELD_CARDS, TIER |
| `dataRegistry.ts` | Registo central de paths e interfaces de todos os JSON |
| `tokens.css` | Design tokens (fonte única de verdade para cores) |
| `colors.ts` | Espelho JS dos tokens |
| `App.css` | Todas as classes de componentes |
| `design-system.html` | Referência visual de todos os componentes |
| `extraCourses.ts` | Campos manuais (override do pipeline) |
| `players.json` | Base de dados de jogadores portugueses |
| `OverlayExport.tsx` | Exportação de imagens (cores hardcoded — excepção documentada) |
| `fetchCache.ts` | Cache global de fetches entre páginas |
| `scoreDisplay.ts` | Funções de formatação e coloração de scores |
| `mathUtils.ts` | Funções matemáticas (z-score, trend, slope, arrays) |
| `flagUtils.ts` | `FL` — mapeamento de países para emojis de bandeira |

## Testes

**Framework:** vitest (config em `vitest.config.ts`)

```bash
npm test              # correr todos os testes
npx vitest run        # one-shot
npx vitest            # watch mode
```

### Ficheiro de testes: `src/pages/__tests__/KIDSdataLoader.test.ts`

35 testes cobrindo as funções core do loader de rivais:

| Grupo | Testes | Cobre |
|-------|--------|-------|
| `normName` | 5 | Diacríticos, whitespace, case, strings vazias |
| `co` | 5 | Código ISO → nome, case-insensitive, variantes (UK=GB), null |
| `shortenTournName` | 7 | WC, EC, Venice, Marco, Rome, El Prat, RWB |
| `mergeInto` | 5 | Dedup por normName, forceTids override, memberId propagation |
| `processUskidsCompleto` | 4 | 18H válido, 9H com tp correcto, zeros rejeitados, filtro ±1 escalão |
| `processMemberHistory` | 7 | tp com scorecard completo, tp=null sem strokes, tp=null com zeros, Boys 9-13, nome "?", 9H El Prat