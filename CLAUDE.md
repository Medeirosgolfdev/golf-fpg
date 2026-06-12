# CLAUDE.md — Golf Portugal

Aplicação web de golfe júnior português. Acompanha o percurso competitivo de um jovem golfista (Manuel, CGSS Santo da Serra, Madeira) nos circuitos USKids Golf, FPG, BJGT/WJGC, EOWAGR, Doral, FFG (França), RFEG (Espanha) e England Golf.

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
- html-to-image (exportação de overlays)
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
data-archive/ (raiz, fora de public/) # ficheiros pesados — NÃO copiados para o build/deploy (movido de public/data-archive em 2026-06-12)

tokens.css        # FICHEIRO ÚNICO de design tokens
App.css           # Classes de componentes (~110KB)
design-system.html # Referência visual de todos os componentes CSS
```

### Páginas (lazy-loaded)

| Rota | Página | Dados |
|------|--------|-------|
| `/jogadores/:fed` | JogadoresPage | data.json por jogador, player-stats.json |
| `/campos/:courseKey?` | CamposPage | master-courses.json, away-courses.json, extraCourses.ts |
| `/uskids` | USKIDSPage | uskids-results.json, uskids_torneios_completos(1-22).json, uskids-field.json |
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
| Manuel — USKids playerID (actual) | `630106` |
| Manuel — USKids playerID (legacy 2023) | `605933` — validado 2026-05-13. Conta abandonada: única aparição no El Prat 2023 Boys 9 (gross 44, place 3). **Nome USKids antigo:** "Manuel Francisco Goulartt De Medeiros". Ambos os IDs estão em `MANUEL_PLAYER_IDS` em `src/constants/manuel.ts`. |
| Manuel — USKids accountUID | `762810` |
| Manuel — DOB | `29/04/2014` (MANUEL_BIRTH_YEAR = 2014) |
| TORNEIOS_COMPLETOS_COUNT | `29` (constante em USKIDSPage.tsx — atualizar ao adicionar completos; espelhar em KIDSdataLoader.ts) |
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
- `uskids_torneios_completos(1-22).json` → `processUskidsCompleto(d)` (suporta formato v1 e v2)
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

Array que injeta manualmente scores do Manuel quando ele foi excluído pelo scraper. Actualmente: Marco Simone 2026 Boys 11 — Manuel marcado IE (Ineligible) pela USKids porque não confirmou o scorecard da R1 (alertou a organização posteriormente e foi-lhe aplicada uma penalidade).

**Política do site (2026-05-17):** mostrar SEMPRE o score **oficial com penalidade** (R1=91 com hole 5=10, R2=79) e não o score real jogado (R1=86 com hole 5=5, R2=79). O `uskids-member-history-slim.json` já regista o oficial e isso alimenta o canónico que o `KIDS2Page` consome. O override do `applyResultOverrides()` na USKIDSPage replica os mesmos valores oficiais para preencher o leaderboard de `uskids-results.json` (que continua a excluir o Manuel por IE). Para reverter para o score jogado, ver comentário no override em `USKIDSPage.tsx`.

### processUskidsCompleto — Dois formatos

**v1 (antigo):** array `[{t, meta:{tournament, age_groups, flight_courses,...}, flights:[...]}]`
**v2 (novo):** objecto `{signupanytime_t, name, start_date, age_groups, flights:{fid:{category, course_info, flight_players}}}` — detectado por presença de `signupanytime_t`. Par extraído de `course_info.R{n}.holes[].par` (preferido) ou `flight_courses` (fallback).

### Cache

`buildAutoRivals()` tem cache interna (`_autoRivalsCache`). Chamar com `opts.force: true` ou `invalidateAutoRivalsCache()` para forçar reload.

---

## Scripts — lib partilhada (`scripts/lib/`)

Criada 2026-06-12 para eliminar duplicação entre scrapers. **Scripts novos devem usar a lib em vez de copiar funções.**

| Módulo | Exporta | Substitui |
|---|---|---|
| `lib/cookies.js` | `loadCookieHeader({envVars, file, label})` | as cópias de `loadCookies()` (env primeiro, ficheiro local depois) |
| `lib/fpg-http.js` | `makeFpgPost({baseUrl, cookie, ua, origin, referer, extraHeaders, retries})`, `FpgHttpError`, `sleep` | as cópias de `dgPost()`/`fpgPost()` — retry em HTTP 500 + detecção `Result:"ERROR"` |
| `lib/atomic-write.js` | `writeJsonAtomic(filePath, data)` | escritas directas com `writeFileSync` (tmp+rename, nunca deixa JSON truncado) |

Migrados: scrape-drive-node, scrape-jovens-node, scrape-classif-node, scrape-fpg-admissions-draws-node, fpg-scrape-node, scrape-nacionais-feds-node.

**Validação de dados:** `scripts/validate-data.js` valida estrutura mínima dos JSON (contagens, campos obrigatórios) — corre nos workflows antes do commit. `node scripts/validate-data.js <ficheiro...>` ou `--glob "public/data/drive-data-*.json"`.

**Cookie health:** workflow `cookie-health.yml` (Quinta 09:00 UTC) valida os 3 secrets de cookies via test-fpg-auth.js + test-datagolf-node.js + test-fpg-admissions-auth.js — falha (= email) se expirados, antes da janela de scrapes do fim-de-semana.

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

### Fluxo: Descarregar inscrições + draws de torneios FPG

**Fluxo que funciona (browser console + merge Node). Não fazer Node puro — o servidor FPG exige sessão de browser real.**

Duas páginas públicas são necessárias, em subdomínios diferentes:

- **Admissions:** `https://scoring.datagolf.pt/pt/tournAdmissions.aspx?ccode={ccode}&tcode={tcode}`
- **Draws:** `https://scoring-pt.datagolf.pt/scripts/draw.asp?club={ccode}&tourn={tcode}&round_number={n}&LANG_TXT=PT&ack=XH256YF45T`

⚠ **Entry-gate e redirects** (peculiaridade crítica):
- `https://scoring-pt.datagolf.pt/scripts/tournaments.asp?club=ALL&ack=XH256YF45T` é um entry-gate que seta cookies de sessão nos DOIS subdomínios e **redireciona** para `scoring.datagolf.pt/pt/tournaments.aspx`.
- Ir directo a `scoring.datagolf.pt/pt/tournaments.aspx` sem passar pelo entry-gate → falha com HTTP 500.
- Passar pelo entry-gate deixa o tab em `scoring.datagolf.pt` — ideal para fetch same-origin de admissions. **Mas draws em `scoring-pt.datagolf.pt` dão erro CORS daí**.
- Para correr draws: abrir **directamente** uma URL de `scripts/draw.asp?...` (ex: `https://scoring-pt.datagolf.pt/scripts/draw.asp?club=000&tourn=10941&round_number=1&LANG_TXT=PT&ack=XH256YF45T`). Essa URL específica **não redireciona**, deixa o tab em `scoring-pt.datagolf.pt` e permite fetch same-origin dos restantes draws.

**Pipeline em 3 passos:**

1. **Admissions** — tab em `https://scoring-pt.datagolf.pt/scripts/tournaments.asp?club=ALL&ack=XH256YF45T` (deixa redirecionar para scoring.datagolf.pt), F12 → Console, colar `scripts/browser-scrape-fpg-admissions-draws.js`. Descarrega `fpg-admissions-draws.json` (admissions OK, draws vazios por CORS).
2. **Draws** — tab em `https://scoring-pt.datagolf.pt/scripts/draw.asp?club=000&tourn=10941&round_number=1&LANG_TXT=PT&ack=XH256YF45T` (URL directa, sem redirect). F12 → Console, colar `scripts/browser-scrape-fpg-draws-only.js`. Descarrega `fpg-draws.json`.
3. **Merge** — copiar ambos os JSONs para `public/data/`, depois:
   ```bash
   node scripts/merge-fpg-admissions-draws.js
   ```
   Junta os dois em `public/data/fpg-admissions-draws.json` final.

**Scope embutido nos scripts** (107 torneios, regenerar ao adicionar novos):
- Drive + Aquapor 2026: ~86 torneios de `drive-data-2026-*.json` e `aquapor-data-2026-*.json`
- Jovens FPG: ~11 torneios de `pull-torneios*.json` com escalão Sub-* ou nome "Jovens"
- Nacional 2026 Aroeira: 10 escalões (tcodes 10935-10944, 01-03 Maio 2026)

**Taxa de sucesso esperada:** ~92/107 com draws (torneios futuros como Nacional 2026 ainda não têm draw publicado — é normal, não é erro).

**Output consolidado** (`public/data/fpg-admissions-draws.json`):
```json
{
  "scrapedAt": "ISO datetime", "total": 107, "source": "merged (admissions + draws)",
  "tournaments": [
    {
      "ccode": "000", "tcode": "10941",
      "name": "Campeonato Nacional de Jovens Sub 12 H", "date": "2026-05-01",
      "admissions": {
        "name": "...", "date": "...", "status": "Inscrições em curso",
        "totalInscritos": 15, "reservas": 2,
        "players": [{ "pos": 1, "fed": "51804", "nome": "Joe Short", "clube": "Vila Sol",
                      "hcp": 6.3, "vac": 81.3, "dataInscricao": "2026/04/01 09:52", "status": "confirmed" }]
        // reservas: pos reinicia em 1 e status="reserva"
      },
      "draws": { "1": { "totalJogadores": 23, "groups": [...] }, "2": {...}, "3": {...} }
      // cada grupo: { teeTime: "08:00", startHole: 10, tee: "Vermelhas", players: [{nome, clube}] }
    }
  ]
}
```

**Parsers Node em `scripts/fpg-admissions-draw-parser.js`** — usados pelos testes (`npm test`). Os scripts browser têm parsers inline equivalentes.

**Script Node `scripts/scrape-fpg-admissions-draws.js` (legacy)** — existe mas **não funciona**. Servidor FPG rejeita (HTTP 500 ou HTML truncado) mesmo com cookies capturados de Chrome 90. Mantido como referência dos URLs e da tentativa; **usar sempre o fluxo browser acima**.

### Scripts FPG detalhados

**scripts/golf-all.js** — Pipeline completo: login → download WHS → scorecards → data.json → sync players → enrich stats.
```bash
node scripts/golf-all.js 52884              # primeira vez
node scripts/golf-all.js --refresh 52884    # novos scorecards
node scripts/golf-all.js --login 52884      # forçar login
node scripts/golf-all.js --force 52884      # re-descarregar tudo
node scripts/golf-all.js --skip-download 52884  # só gerar (dados já existem)
node scripts/golf-all.js --all              # todos os jogadores
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

**scrape-drive-aquapor-v7.js** — Colar no F12 de `scoring.datagolf.pt/pt/tournaments.aspx`. v7 fix: usa `classifAgregate.aspx/ScoreCard` (v6 tinha bug R1=R2). **Legacy** — substituído por `scrape-drive-node.js` (Node puro, correr em GitHub Actions).

**scrape-fpg-admissions-draws-node.js** — Node puro (2026-04-22). Substitui os browser-scripts `browser-scrape-fpg-admissions-draws.js` + `browser-scrape-fpg-draws-only.js` + `merge-fpg-admissions-draws.js`. Corre linkpage cross-domain (scoring.fpg.pt/lists) em paralelo, merge aditivo (preserva bons, rejeita `_suspect`), output único em `public/data/fpg-admissions-draws.json`. Scope: `scripts/fpg-admissions-scope.json` (333 torneios). Exit code 2 = sem novidades. Workflow: `update-fpg-admissions-draws.yml` (Sex/Sáb/Dom 20:00 UTC). Secret: `FPG_ADMISSIONS_COOKIES`.
```bash
node scripts/scrape-fpg-admissions-draws-node.js                # scope todo
node scripts/scrape-fpg-admissions-draws-node.js --year 2026    # só 2026
node scripts/scrape-fpg-admissions-draws-node.js --tcodes 10941,10937,10935
node scripts/scrape-fpg-admissions-draws-node.js --since 2026-01-01 --concurrency 3
```

**scrape-classif-node.js** — Node puro (2026-04-22). Substitui `pull-torneios.js` browser-console. GET linkpage warmup + POST `classif.aspx/ClassifLST` paginado + POST `classifAgregate.aspx/ScoreCard` por jogador. Output formato compatível com `pull-torneiosNNN.json`. Scope: `scripts/classif-scope.json` (217 torneios já processados) ou flags CLI. Workflow: `update-classif.yml` (Sáb/Dom 20:30 UTC). Secret: `DATAGOLF_SCORING_COOKIES`.
```bash
node scripts/scrape-classif-node.js --tclub 000 --tcode 10825
node scripts/scrape-classif-node.js --scope scripts/classif-scope.json --out public/data/pull-torneios-node.json
node scripts/scrape-classif-node.js --scope scripts/batch-aroeira.json --concurrency 2
```

**pull-torneios.js** — Browser Console em `scoring.datagolf.pt`. **Legacy** — usar `scrape-classif-node.js` para novos torneios. Mantido como fallback para casos em que Node não funciona (e.g. ad-hoc num torneio de clube com `ccode` desconhecido).

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
Output: `data-archive/uskids-member-history.json` (ficheiro único)

**fetch-uskids-rich-players-node.js** — **Node puro** (sem Playwright). Pipeline RICA por jogador (não por torneio). Para cada memberID no slim + novos descobertos: `GetMemberTournamentResults` → cruza para `(tcode, age_group)` → `GetMeta` (cached) → `GetPlayerTeeTimes` (cached) → escreve `data-archive/uskids-rich-players/{memberID}.json` com TODOS os campos da API (teeMarkerName, teeMarkerColor, startHole, startTime, groupNumber, playerNumber, status, points, handicap, place, etc.). **Sem filtros TOP-N nem MAX_AGE_TODAY** — carreira completa.

Cache separada do member-history: `uskids-rich-flight-cache.json` (re-fetch só se torneio ≤15d). Skip-existing por `lastUpdated` (default `--since-days 14`). Matching memberID→pid local via fingerprint de strokes (mesmas salvaguardas `MIN_FINGERPRINT_HOLES=6`, `MIN_FINGERPRINT_DISTINCT=3` do member-history). Exit code 2 = sem novidades.

```bash
node scripts/fetch-uskids-rich-players-node.js                    # default (skip-existing 14d)
node scripts/fetch-uskids-rich-players-node.js --limit 10         # smoke test
node scripts/fetch-uskids-rich-players-node.js --players 630106,591440
node scripts/fetch-uskids-rich-players-node.js --since-days 30 --concurrency 8
node scripts/fetch-uskids-rich-players-node.js --force-rebuild    # ignora todos os caches
node scripts/fetch-uskids-rich-players-node.js --discovery-only   # só descobre novos mids
```

Workflow: `update-uskids-rich-players.yml` (Seg 02:00 UTC, depois do member-history). Sem secrets (signupanytime é público server-side).

**build-member-history-slim.js** — Converte os ficheiros numerados `uskids-member-history-XXX.json` (em `data-archive/`) num único `uskids-member-history-slim.json` (em `public/data/`). Remove campos duplicados entre jogadores, mantém apenas gross+strokes por ronda.
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

## Scripts — England Golf (GolfGenius)

Cada torneio England Golf vive num microsite GolfGenius (alguns em `www.golfgenius.com`, outros em subdomínios `eg-{slug}{YY}.golfgenius.com`). A página `/england` é uma duplicação minimalista da `/bjgt` (mesmos `TournView`, sub-tabs por ronda, ManuelPill, etc.).

**Catálogo:** `public/data/england-golf-catalog.json` — 28 edições de torneios juvenis 2023-2026 (Carris/McGregor/Reid Trophies, English U18 Amateur, English Girls' Open/U16/U14, Justin Rose Telegraph, Bronte Law Junior Series, England U16 v Spain, Boys' County Finals, Junior Champion Club). Cada entry tem `year`, `section`, `slug`, `title`, `gender`, `ageGroup`, `gg_base`, `gg_page`.

**Cobertura efectiva:** 19/28 com dados completos. 9 falham por motivos estruturais do GolfGenius (ver "Limitações conhecidas" abaixo).

### CLI

```bash
node scripts/scrape-england-golf.js                              # tudo
node scripts/scrape-england-golf.js --since-year 2023            # ≥ 2023
node scripts/scrape-england-golf.js --slug carris-trophy-2025    # só esse
node scripts/scrape-england-golf.js --slugs A,B,C                # vários slugs (2026-05-18)
node scripts/scrape-england-golf.js --year 2025
node scripts/scrape-england-golf.js --skip-existing              # idempotente
node scripts/scrape-england-golf.js --gg-base https://eg-X.golfgenius.com --gg-page 1234567 --slug X --year 2026  # ad-hoc
node scripts/scrape-england-golf.js --no-headless                # debug com browser visível
```

### Output enriquecido (refactor 2026-05-18)

`public/data/england_{slug}.json` (single division) ou `england_{slug}_div1.json`, `_div2.json`... (multi-divisão).

**Top-level:**
```json
{
  "tournament": "...", "slug": "...", "year": 2025, "section": "...",
  "gender": "M|F|null", "ageGroup": "U18|U16|U14|...", "category": "...",
  "course": "Luffenham Heath", "tee": "...",
  "source": "...", "gg_page": "...", "gg_league": "...",
  "rounds": 4,
  "par": [4,4,3,...],          // 18 valores do tee principal
  "si": [8,4,9,...],            // 18 stroke index
  "meters": [363,437,389,...],  // YARDAGES POR BURACO (yardages convertidas para metros)
  "parTotal": 70, "parF9": 35, "parB9": 35, "metersTotal": 6592,
  "courses": [                  // TODAS as configurações de tee (multi-tee)
    { "teeName": "", "courseName": "", "par": [...], "si": [...], "meters": [...], "parTotal": 70, "metersTotal": 6592 }
  ],
  "players": [...],
  "scrapedAt": "..."
}
```

**Cada player:**
```json
{
  "id": "2058156618",                  // player ID GolfGenius (único por linha)
  "memberIds": ["37343006"],           // member ID GG — único POR TORNEIO (não global!) — só serve para dedup dentro do mesmo torneio
  "eventId": "3854563",                // ID do evento (R1 stroke)
  "rank": 1,                            // data-rank cru (limpo, sem "T5")
  "pos": 1,                             // alias do rank
  "name": "Callixte Alzas",            // nome LIMPO (sem club concatenado)
  "country": "FR",                      // código flag-icon (FR, GB-ENG, GB-SCT, IT, DE...)
  "club": "Saint Cloud",
  "hcp": null,                          // SEMPRE null — confirmado que GG público não publica
  "toPar": -9,                          // novo campo
  "result": -9,                         // retro-compat
  "total": 271,
  "roundScores": [70,67,69,65],
  "division": "Carris Trophy",         // divisão principal
  "divisions": [                        // TODAS as divisões em que apareceu (cross-trofeu)
    "Carris Trophy",
    "Jean Case Memorial (Under 15's)",  // se U15 elegível
    "The Nations Cup"                    // se elegível
  ],
  "rounds": [
    {
      "day": 1, "scores": [4,5,4,...], "f9": 35, "b9": 35, "gross": 70,
      "teeColour": "Blue",              // extraído do header_row do detail page
      "gender": "Men",                  // "Men", "Boys", "Girls" etc.
      "courseName": "Luffenham Heath",
      "headerText": "Tue, July 22 Luffenham Heath - 3 - Archived on 08-07-2025 (Blue - Men)",
      "parPlayed": [4,4,3,...],         // par[18] do tee jogado
      "metersPlayed": [363,437,389,...],// METROS POR BURACO do tee jogado
      "parTotalPlayed": 70, "metersTotalPlayed": 6592
    }
  ]
}
```

### `data-*` attributes do `<tr>` da leaderboard (descobertos 2026-05-18 via Chrome live)

Cada linha de leaderboard real é `<tr class="aggregate-row">` com:
- `data-aggregate-id` → player ID GolfGenius (único por linha/divisão)
- `data-aggregate-name` → nome LIMPO (separado do clube — antes era misturado em string)
- `data-member-ids` → member ID GG **POR TORNEIO** (não cross-event). Confirmado empiricamente 2026-05-18: Callixte Alzas (FR) tem mid distinto em torneios diferentes (`28134152` vs `37343006`). Serve para dedup DENTRO de UM torneio (separar Carris Trophy / Hazards Salver / Nations Cup do mesmo evento, onde o player aparece em múltiplas divisões) mas NÃO para cross-ref entre torneios. Para cross-event matching usar `name + club` (heurístico).
- `data-rank` → posição limpa (independente de "T5"/"1" formatting)
- O `<a.favorite-star>` filho tem `data-event-id`

**⚠ Crítico:** filtrar SÓ `tr.aggregate-row` (ou `tr[data-aggregate-id]`). Iterar todos os `tr` que têm `a[href*=tournaments2/details]` pega ~30% de SUB-ROWS (net-score, etc.) sem data-* que ficariam com null e corromperiam o sort.

### Dedup por `memberId` — cross-trofeu

Uma pessoa pode aparecer múltiplas vezes na MESMA leaderboard porque é elegível para várias sub-tróficas:
- McGregor Trophy 2024: 144 jogadores principais. Dos U15, ~56 também são elegíveis para Jean Case Memorial (Under 15's). 9 internacionais elegíveis para Nations Cup. Total linhas: 144+56+9 = **209**.
- Sem dedup: leaderboard tem 209 linhas → 209 jogadores "consolidados" (com Leo Cahi 2×, Samuel Love 2× etc.)
- Com dedup por `memberId`: **144 jogadores únicos**, cada U15 com `divisions: ["McGregor Trophy", "Jean Case Memorial (Under 15's)", ...]` permitindo filtros tipo "🏆 elegíveis para Jean Case".

Estratégia: `playerLatestRecord` chaveado por `memberId || id`, preferindo o registo da divisão PRINCIPAL (heurística `isSubTrophy = /\b(memorial|salver|cup|series)\b/i`). `playerAllDivisions` acumula todas as divisões num Set.

### Tee colour por jogador (detail page)

O detail page `tournaments2/details/{id}` tem um `<tr class="header_row">` antes da `net-line` (scores hole-by-hole) com texto tipo:
```
Tue, July 22 Luffenham Heath - 3 - Archived on 08-07-2025 (Blue - Men)
```
O `(Blue - Men)` no fim identifica a tee jogada. Combinado com `courses[]` (que tem par/meters por tee), permite saber a yardage exacta jogada por cada divisão. Regex permissivo `\(([^()]{1,40})\)\s*$` split por ` - ` → `teeColour="Blue"`, `gender="Men"`.

**⚠ CORS subdomain:** quando o torneio vive num subdomínio `eg-*.golfgenius.com`, fazer `fetch` directo para `https://www.golfgenius.com/tournaments2/details/{id}` falha com `TypeError: Failed to fetch` (CORS). Solução: usar URL RELATIVA `/tournaments2/details/{id}` — fica same-origin com o iframe da league.

### O que GolfGenius PÚBLICO NÃO expõe

Confirmadíssimo via Chrome live em Carris 2025 (validado contra detail page do Callixte Alzas):
- ❌ HCP por jogador (não é coluna nem data-attribute em lado nenhum)
- ❌ DOB / idade / ano de nascimento (a única classe "handicap-dots" no detail page é CSS, sem valor)
- ❌ Yards por shot/drive (só yards por buraco do tee — que já temos via course_analytics)
- ❌ Widgets adicionais úteis — `scoreboard`, `pairings`, `tee_times`, `handicaps`, `divisions`, `members` todos retornam HTTP 404. Só `tournament_results` e `course_analytics` respondem.

Idade está IMPLÍCITA pelo tier do torneio (Carris=U18, McGregor=U16, Reid=U14) ou pela divisão (Jean Case Memorial U15 dentro do McGregor).

### Limitações conhecidas — 9 torneios que não passam

| Slug | Razão |
|---|---|
| `carris-trophy-2024`, `mcgregor-trophy-2023`, `english-girls-championship-2025` | "dropdown sem eventos" — England Golf arquivou e removeu os dados do GG |
| `english-girls-open-stroke-play-2023`, `english-junior-champion-club-2024`, `english-junior-champion-club-2025`, `boys-county-finals-2025`, `england-u16-v-spain-u16-2025` | Iframe redirecciona para `campaigns/2261/run` (template homepage do England Golf), sem leaderboard real montada |
| `bronte-law-farnham-2026` | Torneio futuro, página ainda não publicada |

Estes não são bugs do scraper. Confirmado via Chrome live: as páginas existem mas o iframe `tournament_results` nunca é carregado.

### Bugs históricos resolvidos (2026-05-18)

Cadeia de 5 bugs que tornaram o output incrivelmente pobre durante várias iterações:
1. Iterator pegava 214 trs (sub-rows com link mas sem data-*) → fix com filtro `tr.aggregate-row, tr[data-aggregate-id]`
2. `eventPlayers.map()` em `scrapeOne` jogava fora memberIds/eventId/rank antes de chegar ao consolidate → fix mapeando explicitamente
3. `playerLatestRecord` no consolidate também não propagava → fix mapeando explicitamente
4. Refactor do dedup REVERTEU o fix #3 → re-aplicado (lição: editar funções monolíticas é frágil, validar sempre via output)
5. `transformToBjgtPerDivision` (que é onde o output JSON é montado) também ignorava os campos novos → fix mapeando + adicionando `divisions[]`, `meters[18]` top-level, `courses[]` multi-tee, e por ronda `teeColour`/`gender`/`parPlayed`/`metersPlayed`

Diagnóstico que desempatou: adicionar `[debug-lb-out]` no `scrapeOne` para imprimir `lb.players[0]` recém-saído de `fetchLeaderboard`, comparar com `[debug-consolidate]` impresso a partir do `playerLatestRecord`. Mostrou que os campos sumiam ENTRE os dois pontos (no `eventPlayers.map`).

**Página `/england`** — `src/pages/EnglandGolfPage.tsx`. Duplicação da BJGTPage com array `URLS` construído **dinamicamente** a partir do catálogo (não hardcoded). Carrega `england-golf-catalog.json` em runtime, tenta `england_{slug}.json` para cada entry, e auto-selecciona o torneio onde o Manuel jogou (ou o primeiro com dados). Sidebar agrupa por ano, tabs de escalão dentro do ano.

**Séries cobertas (Sub-10 a Sub-18, Boys + Girls, desde 2023):** Carris Trophy (U18 boys), McGregor Trophy (U16 boys), Reid Trophy (U14 boys), English U18 Amateur (mixed), English Girls' Open Stroke Play / Championship, English Girls' U16 & U14, Justin Rose Telegraph Junior, Bronte Law Junior Series (várias paragens), England U16 v Spain U16, Boys' County Finals, English Junior Champion Club.

---

## API Signupanytime

Base: `https://www.signupanytime.com/plugins/links/admin/LinksAJAX.aspx?op={OP}&…`
Em Playwright, navegar primeiro para o iframe: `…/front/linksviews.aspx?v=results&fmt=nohead&ax=1129&t={t}`

| Endpoint | Método | Descrição | Retorna |
|----------|--------|-----------|---------|
| `GetMeta&t={tcode}` | GET | Metadados: flights, age_groups, **flight_courses** (par+yards reais!), courses, flight_rounds | tournament, flights, age_groups, flight_courses{pars[], lengths[]}, flight_rounds |
| `GetTournamentPlayers&t={tcode}&f={fid}` | GET | Lista de **memberIDs USKids globais** num flight (não pids locais) | PlayerNodeId: number[] |
| `GetPlayerTeeTimes&f={fid}&r={round}&p={page}&t=1&pt=undefined&jbgr={ts}&c=1` | **POST** | **Scores buraco-a-buraco + nomes + país.** Paginado, 20/pág. **⚠️ Tem de ser POST (não GET) e tem de incluir `t=1` + `pt=undefined&jbgr={Date.now()}&c=1`.** Endpoint descoberto via DevTools Network 2026-05-12 (validado em t=15573 e nos 6 tcodes PT 2023). Old endpoint `GET t=0` devolve `flight_players: {}` silenciosamente para torneios encerrados | `flight_players: {[pid]: {first,last,country,place(cidade!),rounds:{[rn]:{strokes[],num_strokes,num_holes,course_name}}}}` |
| `GetMemberTournamentResults&m={memberID}` | GET | Histórico completo de carreira | `{[tcode]: {t_name, t_start_date, p_age_group, p_place, p_strokes, p_country?, p_rounds:{[rn]:{strokes, course_name, num_strokes, num_holes}}}}` |

**Armadilhas críticas dos endpoints USKids:**
- O `pid` no `flight_players` (ex: `1108352`) é **local ao flight, NÃO é o memberID USKids global** (ex: `591440`). Para mapear nome→mid usa o `GetTournamentPlayers` em paralelo + match por strokes/place/gross dentro de (tcode, ageGroup).
- O `place` no `flight_players` é a **CIDADE** (ex: "Lisbon, Lisboa"), não a posição. A posição calcula-se ordenando por `num_strokes`.
- `flight_courses` no `GetMeta` é indexado por `flight_round_id`, **NÃO por flight_id**. Para mapear: `flight_rounds[frId].flight === flightId && flight_rounds[frId].round === 1` → `flight_courses[frId].{pars,lengths}`.
- Em flights 9H, `flight_courses[].pars` tem 18 entries mas só as 9 jogadas têm `par > 0`; `flight_courses[].lengths` tem yards completos do percurso (todos > 0). **Filtrar AMBOS pelos índices onde par > 0 para alinhamento.**

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
| 21131 | European Championship 2026 | 26 Mai 2026 | EURO |

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
| 21573 | Marco Simone Local Tour 2026 | 2026 |
| 21610 | World Championship 2026 | Set 2026 (a ocorrer) |
| 22243 | Venice Open 2026 | Ago 2026 (a ocorrer) |

> **Nota (2026-06-12):** European Championship 2026 (`21131`) já ocorreu a **26 Mai 2026** — movido para a tabela de conhecidos acima (estava erradamente marcado "Ago 2026"). O World 2026 (`21610`) e o Venice 2026 (`22243`) ainda estão por ocorrer — ver `FULL_FIELD_TCODES` abaixo para correr o campo completo quando acontecerem.

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
| pull-torneiosNNN.json (000-NNN) | FPG | scrape-classif-node.js (novos) ou pull-torneios.js browser (legacy) | ✓ | FPGPage, KIDSdataLoader (pull-torneios000 autoritativo) |
| fpg-admissions-draws.json | FPG | scrape-fpg-admissions-draws-node.js (novo) | ✗ | AdmissionsTab, DrawTab (inscrições + pairings pré-jogo) |
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
| uskids_torneios_completos(1-22).json | USKids | browser script | ✓ | USKIDSPage, KIDSdataLoader |
| uskids-member-history.json | USKids | fetch-uskids-member-history.js | ✓ (sem par/SI) | **Em `data-archive/`** — fonte para build-slim |
| uskids-member-history-XXX.json | USKids | fetch (legacy) | ✓ (sem par/SI) | **Em `data-archive/`** — fonte para build-slim |
| uskids-member-history-slim.json | USKids | build-member-history-slim.js | ✓ (sem par/SI) | KIDSdataLoader (Fase 2) + KIDSPage (H2H, DOB) |
| uskids-rich-players/{mid}.json | USKids | fetch-uskids-rich-players-node.js | ✓ (com teeMarker, startTime, groupNumber) | **Em `data-archive/`** — 1 ficheiro por jogador, carreira completa rica |
| uskids-rich-flight-cache.json | USKids | fetch-uskids-rich-players-node.js | ✗ | **Em `data-archive/`** — cache (tcode → flights/players) para a pipeline rica |
| uskids-rich-run-summary.json | USKids | fetch-uskids-rich-players-node.js | ✗ | **Em `data-archive/`** — sumário do último run (debug) |
| uskids-field.json | USKids | fetch-uskids-field.js | ✗ | USKIDSPage |
| uskids-field-sizes.json | USKids | (automação) | ✗ | KIDSdataLoader (uskFieldSizes) |
| uskids-discovery-cache.json | USKids | fetch-uskids-discovery.js | ✗ | fetch-uskids-results.js |
| t_de_tournaments_do_uskids.json | USKids | (automação, 6448 entries) | ✗ | KIDSdataLoader (uskTournNames fallback) |
| bjgt_*.json, wjgc_*.json | BJGT/WJGC | scrape-bluegolf.js | ✓ | BJGTPage, KIDSdataLoader |
| eowagr25_*.json | EOWAGR | scrape-eowagr25*.js | ✓ | KIDSdataLoader |
| ftm_doral_2024/2025.json | Doral | scrape-golfgenius.js | r1/r2Gross | KIDSdataLoader |
| england_{slug}.json | England Golf | scrape-england-golf.js | ✓ (com teeColour/metersPlayed[18] por ronda) | EnglandGolfPage |
| england-golf-catalog.json | England Golf | manual | ✗ | EnglandGolfPage (sidebar) |
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
| my.fpg.pt | `my.fpg.pt/Home/PlayerWHS.aspx?no=52884` | WHS — **gémeo de scoring.datagolf.pt** | Login |
| golf-portugal.pt | `golf-portugal.pt/api/*` | Proxy público FPG (REST) | Público |
| signupanytime.com | `www.signupanytime.com` | Torneios USKids | Público |
| tournaments.uskidsgolf.com | `tournaments.uskidsgolf.com/tournaments/international` | Calendário torneios | Público |
| brjgt.bluegolf.com | `brjgt.bluegolf.com` | BJGT/WJGC/EOWAGR | CAPTCHA possível |
| GolfGenius (Doral) | `firstteemiamidoraljrclassic.golfgenius.com` | Doral Jr. Classic | Público |

### scoring.fpg.pt — URLs públicas (linkpage.aspx)

O `scoring.fpg.pt` expõe publicamente (sem auth) páginas de inscrições, draw, live scoring e resultados de **todos os torneios FPG**. Padrão:

```
https://scoring.fpg.pt/lists/linkpage.aspx?page={page}&club={ccode}&tourn={tcode}[&round={n}]&ack={ack}
```

**⚠ Os `ack` tokens são UNIVERSAIS — não são específicos por torneio.** Os mesmos dois valores funcionam para qualquer `tcode`:

| Página | `page=` | `ack=` universal | Params extra |
|---|---|---|---|
| Inscrições | `admissions` | `XH256YF450` | — |
| Draw (pairings) | `draw` | `8428ACK987` | `&round={1|2|3}` |
| Resultados (classificação) | `classif` | `8428ACK987` | — |
| Live Scoring | — (URL diferente) | — | `/live-scoring/1.aspx?pa=classif&c={ccode}&t={tcode}&r=0` |

`club` é normalmente `000` (três dígitos, com zeros à esquerda) para Campeonatos Nacionais; outros ccodes aplicam-se a torneios organizados por clubes. `tcode` é o identificador numérico do torneio (ex: `10941` para Sub-12 Masculino Jovens 2026 Aroeira, `10935-10944` para o conjunto Sub 10/12/14/16/18 M+F).

Estas URLs são úteis para scrapar dados **pré-jogo** (quem está inscrito, tee times) que não vêm nos endpoints de classificação usados pelo `pull-torneios.js`.

#### ⚠ `linkpage.aspx` é o gateway canónico — NÃO ir directo às páginas alvo

**Descoberta 2026-04-22 via `scripts/probe-admissions-sources.js`.** Ir directamente às páginas alvo (`tournAdmissions.aspx`, `classifications.aspx`, etc.) com os cookies certos funciona *às vezes*, mas é frágil — devolve `Param Error` (HTTP 200 com título "Param Error") se a sessão do servidor não estiver "aquecida" pelo `linkpage.aspx` logo antes. Depois do `linkpage.aspx` rodar, o directo passa a funcionar na mesma sessão (estado server-side).

**Consequência prática:** sempre usar `linkpage.aspx?page=...` como ponto de entrada. O servidor FPG faz automaticamente o redirect 302 para a página alvo (`tournAdmissions.aspx`, etc.), `fetch` com `redirect: 'follow'` apanha a resposta final com os dados. Nunca saltar o linkpage em clientes server-side em que o warmup não está garantido.

**Sintoma de bug escondido se ignorares isto:** o middleware em `vite.config.ts` apontava para `tournAdmissions.aspx` directamente e funcionava em 99% dos casos (porque corridas anteriores aqueciam a sessão). Após restart do Vite, a primeira chamada podia devolver "Param Error" silenciosamente — o parser parsearia 0 linhas e a UI ficaria vazia. Mudar para `linkpage.aspx` eliminou essa fragilidade.

#### ⚡ `linkpage.aspx` cobre admissions, draw e classif — cross-domain

**Descoberta alargada 2026-04-22 via probe:** o padrão `linkpage.aspx?page=...` funciona nos dois domínios gémeos (`scoring.fpg.pt/lists/` e `scoring.datagolf.pt/pt/`) para as **três páginas** principais de um torneio:

| Página | `page=` | `ack=` universal | Forma de obter dados | Scraper Node puro |
|---|---|---|---|---|
| **admissions** | `admissions` | `XH256YF450` | GET (HTML com tabela) | ✓ linkpage GET basta |
| **draw** (pairings) | `draw` + `&round=1/2/3` | `8428ACK987` | GET (HTML com tabela) | ✓ linkpage GET basta |
| **classif** (resultados) | `classif` | `8428ACK987` | GET linkpage (warmup) + POST `classif.aspx/ClassifLST` | ✓ dois passos |

**Testado e confirmado em 3 casos reais** (futuro, passado 1 ronda, passado 3 rondas), ambos domínios, 17 pares comparados, 0 divergências entre `scoring.fpg.pt` e `scoring.datagolf.pt`.

**O `ack` é universal cross-domain** (mesma infra ASP.NET partilhada) — `XH256YF450` para admissions, `8428ACK987` para draw/classif, iguais em ambos os domínios.

Implicação para o middleware: as duas fontes (`FPG_URL_1` e `FPG_URL_2`) passam a ser ambas linkpage — redundância real, não mais "scoring.datagolf.pt só por esperança". Em cada pedido esperamos os mesmos inscritos dos dois domínios; se divergirem, o log marca como "novos" os de cada fonte e sabes que uma está desincronizada.

```
FPG_URL_1 = scoring.fpg.pt/lists/linkpage.aspx?page=admissions&club=000&tourn=X&ack=XH256YF450
FPG_URL_2 = scoring.datagolf.pt/pt/linkpage.aspx?page=admissions&club=000&tourn=X&ack=XH256YF450
```

Cada um usa os seus próprios cookies (`.fpg-admissions-cookies.json` e `.scoring-datagolf-cookies.json` respectivamente).

**Dead ends confirmados no mesmo probe (não voltar a testar):**
- `scoring-pt.datagolf.pt/scripts/admissions.asp` — redirect para `datalinkpt.html` que é página-frame com iframes. Dados não estão no HTML inicial. Não vale o esforço.
- `scoring-pt.datagolf.pt/scripts/tournAdmissions.asp` — HTTP 404 (path não existe).
- `golf-portugal.pt/api/tournaments/{tcode}/admissions` e variantes — HTTP 404. O proxy não expõe admissions, só WHS/scorecards por jogador.

---

## FPG — APIs em tempo real (descobertas 2026-04-14)

Documentação completa em `docs/api-fpg-endpoints.md`. Resumo crítico:

### ⚡ DUPLO BREAKTHROUGH (2026-04-14, tarde) — automação server-side TOTAL

Depois de dezenas de tentativas falhadas em sessões anteriores, descobriu-se
num único dia a solução para **ambos os backends da FPG**: `my.fpg.pt`
(autenticado) e `scoring.datagolf.pt` (público mas com proteção). Os dois
funcionam agora em Node puro com `fetch`, sem Playwright, sem
`golf-portugal.pt`, sem browser automation.

**Impacto:** toda a pipeline FPG (federados, WHS, scorecards, torneios, drive,
aquapor) pode correr em GitHub Actions ou Node.js local. Playwright deixa de
ser necessário para estes domínios.

---

#### Backend 1: `my.fpg.pt` (autenticado — WHS, scorecards, federados)

**Cookie em falta:** `.AspNet.ApplicationCookie` (ASP.NET Identity auth token).

**Por que nunca o tínhamos visto antes:** o servidor FPG não seta `SameSite`
nos cookies. O Chrome moderno aplica `SameSite=Lax` por default →
**rejeita o cookie silenciosamente antes de o persistir** → nenhuma ferramenta
(DevTools UI, `document.cookie`, `cookieStore`, Playwright `context.cookies()`)
o mostra, porque nunca chegou a existir na sessão do browser.

A conclusão histórica "há um cookie httpOnly invisível" estava errada. **O
cookie não era invisível — era ausente**, bloqueado na fase de setting pelo
próprio browser.

**Solução:** instalar **Chrome 90** (última versão com flags SameSite
toggleáveis em `chrome://flags`), desactivar:
- `SameSite by default cookies` → **Disabled**
- `Cookies without SameSite must be secure` → **Disabled**
- `Schemeful Same-Site` → **Disabled** (opcional)

Depois fazer login em `area.my.fpg.pt/login/` → navegar para
`my.fpg.pt/Home/PlayerWHS.aspx?no=52884` → F12 → Application → Cookies →
copiar os 6 cookies que aparecem (incluindo `.AspNet.ApplicationCookie`).

Qualquer script Node com `fetch` + esse `Cookie:` header autentica
imediatamente. Teste confirmado 2026-04-14: `POST /Home/PlayerWHS.aspx/HCPWhsFederLST`
devolveu `Result:"OK"` com 138 rondas do Manuel.

**IP-binding:** **CONFIRMADO NÃO IP-BOUND** (teste 2026-04-15 — cookies do
Firefox capturados num IP continuaram a funcionar noutro IP diferente).
GitHub Actions pode usar estes cookies via GitHub Secret `FPG_COOKIES` /
`DATAGOLF_COOKIES`.

**Armadilha encontrada (para não repetir):** o `scripts/test-fpg-auth.js`
tinha inicialmente o cookie header **hardcoded** numa constante, em vez
de ler de `api/.datagolf-cookies.json`. Resultado: actualizar o ficheiro
de cookies não mudava nada no teste, e durante horas debitei "cookies
inválidos" quando na realidade estava a testar sempre com os cookies
expirados originais. **Lição:** scripts de teste devem SEMPRE ler cookies
de ficheiro/env var — nunca hardcoded. Actualmente corrigido.

---

#### Backend 2: `scoring.datagolf.pt` (público — torneios, drive, aquapor)

**Cookies necessários:** dois, **ambos obrigatórios**:
- `ASP.NET_SessionId` — sessão ASP.NET (HttpOnly, SameSite=None)
- `DG_Lists_URL` — cookie de "entry context" que prova que o browser passou
  pela `1EntryPage.aspx` com hash válido

**Gotcha crítico:** `GET /pt/tournaments.aspx` **direto devolve HTTP 500 ou
302 → Param_Errors.aspx?Err=999**. A página não é acessível sem passar
primeiro por `1EntryPage.aspx?user=fpguser&dt=X&page=Y&hash=Z&...` — esse
entry page seta o `DG_Lists_URL` e valida o hash server-side.

**O hash NÃO é replicável de fora do browser.** Tentámos chamar
`1EntryPage.aspx` com o hash copiado do browser a partir de Node → 500.
O servidor valida o hash contra estado só conhecido pela sessão do browser
que o pediu originalmente (provavelmente timestamp + user-agent + alguma
entropy server-side).

**Solução:** capturar cookies uma vez do Chrome 90 (depois de navegar
normalmente para `scoring.datagolf.pt/pt/tournaments.aspx`), guardar em
ficheiro/secret, e usar via `fetch` Node.

**IP-binding:** **CONFIRMADO NÃO IP-BOUND** (teste 2026-04-14 via hotspot 4G
com IP completamente diferente do login original — os cookies continuaram a
funcionar). Isto valida **GitHub Actions** como alvo viável.

Teste confirmado: `POST /pt/tournaments.aspx/TournamentsLST` devolveu
`Result:"OK"` com 25 torneios, `TotalRecordCount=83131`.

---

#### Fluxo prático de captura de cookies (Chrome 90)

Para **qualquer** dos dois backends, o fluxo é o mesmo:

1. Abrir Chrome 90 com SameSite flags desactivadas
2. Fazer login (para `my.fpg.pt`) ou apenas navegar (para `scoring.datagolf.pt`)
3. F12 → **Network** → reload da página
4. Encontrar qualquer pedido XHR/Fetch → botão direito → **Copy as cURL (bash)**
5. Extrair o header `cookie:` do cURL — isso dá os cookies completos
6. Guardar em `api/.datagolf-cookies.json` (gitignored) ou em GitHub Secret

Alternativa sem cURL: F12 → **Application** → **Cookies** → clicar no
domínio → copiar cada linha (nome=valor). Ambos os métodos dão os mesmos
cookies.

Validade dos cookies:
- `my.fpg.pt` — `.AspNet.ApplicationCookie` dura dias a semanas (ASP.NET
  Identity default é 14 dias sliding expiration)
- `scoring.datagolf.pt` — `ASP.NET_SessionId` dura 20min sem actividade
  (ASP.NET default), mas pode ser muito mais longo na FPG. `DG_Lists_URL`
  não testada individualmente. Para fins práticos, assumir **1 semana**
  e refrescar por precaução.

---

#### Scripts de prova de conceito

- `scripts/test-fpg-auth.js` — valida cookies `my.fpg.pt` com POST a
  `HCPWhsFederLST`. Devolve `Result:"OK"` se cookies válidos.
- `scripts/test-datagolf-node.js` — valida cookies `scoring.datagolf.pt`
  com POST a `TournamentsLST`. Tem dois testes (A: tentar
  `1EntryPage.aspx` de Node — falha sempre; B: usar cookies manuais —
  funciona).

### Chrome 90 — setup detalhado (INSTRUÇÕES PARA NÃO REDESCOBRIR)

Chrome 90 é **a última versão** com as flags SameSite toggleáveis em
`chrome://flags`. Chrome 91+ removeu as flags da UI; Chrome 94+ removeu a
flag CLI `--disable-features=SameSiteByDefaultCookies`. Playwright/Chromium
bundled nunca vai conseguir — as features estão hard-coded desde v100+.

**Passos exactos (testados 2026-04-14):**
1. Download Chrome 90 offline installer (arquivos históricos — pesquisar
   "Chrome 90.0.4430.93 offline installer" em sites como slimjet.com)
2. Instalar numa pasta dedicada ou como perfil portátil (evitar substituir
   Chrome principal)
3. Abrir, ir a `chrome://flags`, procurar "SameSite"
4. Desactivar:
   - `SameSite by default cookies` (ID `#same-site-by-default-cookies`)
   - `Cookies without SameSite must be secure` (ID `#cookies-without-same-site-must-be-secure`)
   - `Schemeful Same-Site` (ID `#schemeful-same-site`) — opcional
5. Clicar "Relaunch" em baixo
6. Usar **exclusivamente para FPG** — não para navegação geral (Chrome 90
   tem 5+ anos de vulnerabilidades não patchadas)

⚠ Se as flags não aparecerem: estás a ver Chrome moderno, não o 90. Confirmar
versão em `chrome://version` — deve dizer exactamente `Chrome/90.0.4430.93`
ou similar.

### Endpoints descobertos — referência completa

#### `my.fpg.pt/Home/*` (autenticado)

| Endpoint | Método | Body/Params | Devolve |
|---|---|---|---|
| `/Home/PlayerWHS.aspx/HCPWhsFederLST?fed_code=X&pp=N&jtStartIndex=0&jtPageSize=100` | POST | `{fed_code, pp:"N", jtStartIndex, jtPageSize}` **sem jtSorting** | Lista rondas WHS (~38 campos/ronda) |
| `/Home/PlayerWHS.aspx/ScoreCard?score_id=X&scoringtype=Y&competitiontype=Z&pp=N` | POST | `{score_id, scoringtype, competitiontype, pp:"N"}` | Scorecard hole-by-hole (par_1..18, gross_1..18, meters_1..18, stroke_index_1..18, stbgross_1..18, stbnet_1..18, bogey_1..18). **Atenção:** `scoringtype` e `competitiontype` TÊM de estar na URL E no body (descoberto 2026-04-15). Valores vêm do record da lista WHS (`scoring_type_id` e `competition_type_id`). Hardcodar valores fixos (1/10 para tudo) falha com "An error occurred while processing this request". |
| `/Home/PlayerWHS.aspx/View20Scores?fed_code=X` | POST | `{fed_code}` | 20 rondas do cálculo WHS |
| `/Home/PlayerWHS.aspx/ViewWHSCalc?fed_code=X` | POST | `{fed_code}` | Cálculo WHS detalhado (soft/hard cap) |
| `/Home/FederatedsList_V2.aspx/HandicapsLST` | POST | ver `scripts/scrape-federados.js` | Lista de federados (32 campos, incl. `encryptedfedcode`) |

Headers obrigatórios: `Cookie:` (6 cookies), `Content-Type: application/json`,
`X-Requested-With: XMLHttpRequest`, `Referer: https://my.fpg.pt/Home/PlayerWHS.aspx?no=X`.

#### `scoring.datagolf.pt/pt/*` (público com entry-gate)

| Endpoint | Método | Body | Devolve |
|---|---|---|---|
| `/pt/tournaments.aspx/TournamentsLST?jtStartIndex=0&jtPageSize=25&jtSorting=started_at%20DESC` | POST | `{ClubCode, dtIni, dtFim, CourseName, TournCode, TournName, jtStartIndex, jtPageSize, jtSorting}` | Lista de torneios (name, ccode, tcode, started_at, etc.) |
| `/pt/Classifications.aspx/ScoreCard?...` | POST | `{score_id, classifround:1}` | Scorecard de torneio (1 ronda) |
| `/pt/classifAgregate.aspx/ScoreCard` | POST | `{score_id, classifround:""}` | Scorecards de torneio agregado (array, 1 record por ronda) — USAR para torneios >1 ronda |
| `/pt/classif.aspx/ClassifLST?jt*` | POST | ver "Body ClassifLST" abaixo | Classificação geral de torneio (paginada, todos os inscritos) |

**⚠ Não confundir `Classifications.aspx` (maiúsculo, é a página jTable shell) com `classif.aspx` (minúsculo, é o PageMethod que devolve os dados).** O CLAUDE.md histórico tinha `Classifications.aspx/GetClassifications` mas esse endpoint devolve sempre HTTP 500 — não existe. Confirmado 2026-04-22 via probe.

**Body ClassifLST** (todos os campos são strings, filtros em default abertos):
```json
{
  "Classi": "1",
  "tclub": "{ccode}",    "tcode": "{tcode}",
  "classiforder": "1",   "classiftype": "I",
  "classifroundtype": "D","scoringtype": "1",
  "round": "1",          "members": "0",
  "playertypes": "0",    "gender": "0",
  "minagemen": "0",      "maxagemen": "999",
  "minageladies": "0",   "maxageladies": "999",
  "minhcp": "-8",        "maxhcp": "99",
  "idfilter": "-1",
  "jtStartIndex": "0",   "jtPageSize": "100",
  "jtSorting": "score_id DESC"
}
```
Os params `jt*` vão também na query string além do body. Headers: `Content-Type: application/json; charset=utf-8`, `X-Requested-With: XMLHttpRequest`. Cross-domain: mesmo endpoint em `scoring.fpg.pt/lists/classif.aspx/ClassifLST`.

Headers obrigatórios: `Cookie:` (2 cookies), `Content-Type: application/json`,
`X-Requested-With: XMLHttpRequest`, `Origin: https://scoring.datagolf.pt`,
`Referer: https://scoring.datagolf.pt/pt/tournaments.aspx`.

**Body mínimo do `TournamentsLST` (testado)**:
```json
{"ClubCode":"0","dtIni":"","dtFim":"","CourseName":"","TournCode":"","TournName":"","jtStartIndex":"0","jtPageSize":"25","jtSorting":"started_at DESC"}
```
`ClubCode:"0"` = todos os clubes. Paginar via `jtStartIndex` (múltiplos de 25).

### Estrutura dos cookies

#### `my.fpg.pt` — 6 cookies

```
.AspNet.ApplicationCookie=<~600 chars base64>    ← auth token (crítico)
ASP.NET_SessionId=<24 chars>                     ← sessão
PlayerArea=photo=&fedStatId=9                    ← estado player
playerIsLogin=<N>                                ← user-id interno
_ga=GA1.1.X.Y                                    ← GA
_ga_LLMN8JTFJ6=GS2.1.sX$o1$g0$tY$j56$l0$h0       ← GA
_ga_SBKT3JPZ7V=GS2.1.sX$o1$g1$tY$j56$l0$h0       ← GA
```

#### `scoring.datagolf.pt` — 2 cookies

```
ASP.NET_SessionId=<24 chars>                     ← sessão
DG_Lists_URL=OriginalUrl=https%3a%2f%2fscoring.datagolf.pt%3a443%2fpt%2f1EntryPage.aspx%3fuser%3dfpguser%26dt%3dXXXX%26page%3dtournlist%26hash%3d<40-char hash SHA-1>%26ccode%3dAll%26pagelang%3dPT%26callcontext%3ddirect
```

O `DG_Lists_URL` é URL-encoded. Descodificado: `1EntryPage.aspx?user=fpguser&dt=XXXX&page=tournlist&hash=<SHA-1>&ccode=All&pagelang=PT&callcontext=direct`.
O `hash` (40 chars hex) é gerado pelo browser ao entrar pela primeira vez e
validado server-side. **Não replicável de Node puro.**

### GitHub Actions — estado 2026-05-08

| Workflow | Estado | Script | Cron | Notas |
|---|---|---|---|---|
| `uskids-field.yml` | ✅ | Playwright headless | — | Site público signupanytime.com |
| `uskids-results.yml` | ✅ | idem | — | idem |
| `uskids-member-history.yml` | ✅ | idem | — | idem |
| **`update-drive.yml`** | ✅ Node puro desde 2026-04-15 | `scripts/scrape-drive-node.js` | Sex/Sáb/Dom 21:00 UTC | Default: mês corrente + mês anterior (`--months-back 1`). Secret: `DATAGOLF_SCORING_COOKIES`. |
| **`update-data.yml`** | ✅ Node puro desde 2026-04-15 | `scripts/fpg-scrape-node.js` | Dom/Seg 00:05 UTC (depois do cut SD) | Default: incremental (só rondas novas). Override `full_rebuild=true`. Secret: `FPG_COOKIES`. **Timing tardio intencional: o SD e WHS Index são atribuídos pela FPG depois da meia-noite Lisboa.** |
| **`update-jovens.yml`** | ✅ Node puro desde 2026-04-17 | `scripts/scrape-jovens-node.js` | Sex/Sáb/Dom 21:20 UTC | Scrape inscrições dos Nacionais de Jovens. Secret: `DATAGOLF_SCORING_COOKIES`. |
| **`update-fpg-admissions-draws.yml`** | ✅ Novo 2026-04-22 | `scripts/scrape-fpg-admissions-draws-node.js` | Sex/Sáb/Dom 20:00 UTC | **Cron aplica `--auto-extend --since 4d`**: scope manual (333) + Fonte 2 (JSONs locais: drive-data, jovens, pull-torneios, SdS) + Fonte 3 (TournamentsLST com warmup entry-gate, filtros INCLUDE=junior/PJA/jovens/sub-XX/ccode=007, EXCLUDE=Flintstones/Quarta Feira Europeia). Janela: futuros + em curso + torneios ≤3 rondas até dia seguinte ao fim. Para scope histórico completo: workflow_dispatch sem filtros. Secrets: `FPG_ADMISSIONS_COOKIES` + `DATAGOLF_SCORING_COOKIES`. |
| **`update-classif.yml`** | ✅ Novo 2026-04-22 | `scripts/scrape-classif-node.js` | Dom/Seg 01:00 UTC | Scope dinâmico via `--auto-from-tracking` (lê `fpg-tournaments-tracking.json`, filtra `status in [missing_classif, missing_scorecards]`). Fallback manual via `--scope` ou `--tclub/--tcode`. Secret: `DATAGOLF_SCORING_COOKIES`. |
| **`build-tournaments-tracking.js`** | ✅ Novo 2026-04-22 | helper (corre dentro do admissions-draws + classif workflows) | — | Cruza fpg-admissions-draws + pull-torneios* + drive-data-* + jovens_* e gera `public/data/fpg-tournaments-tracking.json` com status por torneio (complete/missing_classif/missing_scorecards/future/in_progress). Alimenta o scope dinâmico do `update-classif`. |
| **`update-ffgolf-resultats.yml`** | ✅ Novo 2026-05-08 | `scripts/scrape-ffgolf-all-jeunes.js` + `build-ffgolf-resultats-index.js` + `build-ffgolf-juniors-slim.js` | Seg 02:00 UTC (1×/semana, madrugada Lisboa) | **Sem secrets** — portal `pages.ffgolf.org/resultats/` é público (bootstrap GET apanha PHPSESSID). Default do cron: `--types 01,03 --since 2025 --skip-existing` (Compétitions Fédérales filtradas por keyword juvenil + GP Jeunes regionais nas 22 ligas, anos 2025-2026, só novos). Output: `public/data/ffgolf-resultats/{type}-{ligue}-{trnId}.json` + `ffgolf-resultats-index.json` + `ffgolf-juniors-slim.json`. workflow_dispatch tem inputs `types`/`since`/`ligues`/`force_rebuild`. |
| **`update-ffgolf-golfgenius.yml`** | ✅ Novo 2026-05-08 | `scripts/scrape-ffgolf.js` | Seg 03:00 UTC (1×/semana, 1h depois do anterior) | **Playwright headless** — torneios juvenis FFG hospedados em GolfGenius (Championnats de France, Internationaux U14/U18). Default do cron: `--year <ano corrente>` (varre `public/data/ffgolf-catalog.json` filtrado por ano). Output: `public/data/ffgolf/{year}_{slug}.json`. workflow_dispatch tem inputs `year`/`slug`/`gg_page` (ad-hoc). Sem secrets. |
| **`update-spain.yml`** | ✅ Novo 2026-05-17 | `scripts/discover-fcg-scope.js` + `scrape-rfegolf-node.js` + `scrape-livegolfscoring.js` + `scrape-nextcaddy.js` (+ horarios) + `scrape-fcg.js` + 7 builds (enrich-lgs-dates, infer-nextcaddy-par, build-rfegolf-index, build-licencia-{dob,hcp}-lookup, build-spain-players-export, build-rfegolf-rivals, build-fcg-rivals) | Seg 04:00 UTC (1×/semana, 1h depois do GolfGenius) | **Node puro, sem secrets** — pipeline única que cobre RFEG (microsite + livegolfscoring), NextCaddy (RFGA Andaluzia + FGM Madrid) e FCG (Federació Catalana via golfdirecto.com). Default do cron: discovery + `--skip-existing` em todos os scrapers + builds. workflow_dispatch tem inputs `force_rebuild`/`skip_discovery`/`lgs_range`/`rfegolf_range`/`fcg_years`. Timeout 240 min. Outputs em `public/data/{rfegolf-resultats,rfegolf-livegolfscoring,nextcaddy,fcg}/` + agregados. |

**IP-binding em Actions:** `scoring.datagolf.pt` CONFIRMADO não IP-bound
(teste via hotspot 4G). `my.fpg.pt` CONFIRMADO não IP-bound (teste cross-IP
2026-04-15). Os mesmos cookies do user funcionam em qualquer IP — Actions
OK.

**Quando os cookies expiram:** user refresca no browser (Firefox com
SameSite=off em about:config, ou Chrome 90) → copia via DevTools → actualiza
GitHub Secret no repo + `api/.datagolf-cookies.json` local. Validade típica
~1 semana.

### Pipeline de actualização de dados — arquitectura 2026-04-15

Três camadas de automação, escolhidas por onde fazem sentido:

**1. GitHub Actions (cloud, automático no fim-de-semana):**
- `update-drive.yml` (torneios públicos DRIVE/AQUAPOR)
- `update-data.yml` (WHS + scorecards dos jogadores seleccionados em players.json)
- `uskids-*.yml` (3 workflows para USKids)
- Todos respeitam exit code 2 = "sem dados novos" → sem commit (não é erro)

**2. Scheduled Task Windows local (ao PC, 13:00 diário):**
- `scripts/setup-scheduled-task.ps1` regista tarefa
- Corre `scripts/fpg-scrape-node.js --all --concurrency 3` por default incremental
- Útil para complementar actions (se for preciso running extra)
- Log em `logs/scheduled-task.log`

**3. Manual / ad-hoc:**
- `node scripts/fpg-scrape-node.js <fedcode>` — scrape de 1 jogador
- `node scripts/fpg-scrape-node.js --full <fedcode>` — re-fetch de tudo (lento)
- `node scripts/scrape-drive-node.js --months-back 99` — histórico completo anual
- `node scripts/test-fpg-auth.js` — validar cookies
- `node scripts/test-datagolf-node.js` — validar cookies scoring.datagolf.pt

### Cron schedules

Torneios FPG acontecem tipicamente **Sexta/Sábado/Domingo**. Crons:

```yaml
# update-drive.yml — scrape de torneios (usa scoring.datagolf.pt)
- cron: '0 21 * * 5,6,0'   # 21:00 UTC Sex+Sáb+Dom

# update-data.yml — scrape de WHS/scorecards dos nossos jogadores (usa my.fpg.pt)
- cron: '0 21 * * 6,0'     # 21:00 UTC Sáb+Dom
```

21:00 UTC = 22:00 Lisboa (inverno) / 22:00 BST (verão), após torneios
estarem carregados. O drive corre também à Sexta para apanhar torneios
que começam nesse dia.

### Scripts Node-puros criados 2026-04-15

Substituem a abordagem Playwright antiga. Todos lêem cookies de
env (`FPG_COOKIES` ou `DATAGOLF_SCORING_COOKIES`) ou de
`api/.datagolf-cookies.json` / `api/.scoring-datagolf-cookies.json`.

#### `scripts/fpg-scrape-node.js`
Scraper de WHS + scorecards via `my.fpg.pt/Home/PlayerWHS.aspx/*`.

```bash
node scripts/fpg-scrape-node.js 52884                  # 1 jogador, incremental
node scripts/fpg-scrape-node.js --all --concurrency 3  # todos em players.json
node scripts/fpg-scrape-node.js --full 52884           # re-fetch completo
```

Por default **incremental** (--new-only implícito): só scorecards de rondas
novas (rápido, ~1-2s por jogador). Use `--full`/`--full-rebuild` para
re-fetch (lento, ~12s).

Respeita tag `no-scrape` (salta jogadores marcados) e tag `hidden` (idem).

Output em `output/{fed}/whs.json`, `scorecards.json`, `summary.json`.

Exit codes: 0=há novidades (commit), 2=sem novidades (skip), 1=erro.

#### `scripts/scrape-drive-node.js`
Scraper de torneios Drive/Aquapor via `scoring.datagolf.pt`.

```bash
node scripts/scrape-drive-node.js                    # mês corrente + anterior (default)
node scripts/scrape-drive-node.js --months-back 0    # só mês corrente
node scripts/scrape-drive-node.js --months-back 99   # ano inteiro
```

Output mensal em `public/data/drive-data-YYYY-MM.json` e
`public/data/aquapor-data-YYYY-MM.json`.

Re-implementação pura Node do antigo `scrape-drive-aquapor-v8.js` (browser
console). Elimina Playwright wrapper.

#### `scripts/cleanup-players-json.js`
Limpeza de `players.json` segundo regras que podem ser combinadas:

- **REMOVE:** qualquer jogador com tag `hidden` (já não está visível na UI)
- **REMOVE:** não-jovens com tag `no-priority`
- **KEEP:** todos os jovens (Sub-*) sem hidden
- **KEEP:** não-jovens PJA ou sem-tag negativa
- **ADICIONA:** Manuel Medeiros (fed 54907, marido)
- **MARCA no-scrape:** Sub-16/18 com hcp > 15 (ficam na UI mas scraper salta)
- **PRIORIDADE MÁXIMA:** fed codes em `inscricoes_nacionais.json` — sempre
  keep, nunca no-scrape (reavaliar quando o ficheiro for actualizado para
  um novo torneio)

Dry-run por default, `--apply` aplica. Cria backup automático antes de
escrever.

#### `scripts/setup-scheduled-task.ps1`
Regista Windows Scheduled Task "GolfFPG-DailyScrape" que corre `fpg-scrape-node.js`
todos os dias às 13:00 locais. Output em `logs/scheduled-task.log`.

Correr como administrador. Re-correr para actualizar (remove e recria).

### Descobertas críticas do endpoint `ScoreCard` do my.fpg.pt

Duas armadilhas descobertas 2026-04-15 ao construir o scraper Node puro:

**1. `score_id` ≠ `id`.** O endpoint `HCPWhsFederLST` devolve para cada
ronda dois IDs:
- `id` (~2875259) = ID interno da entrada WHS
- `score_id` (~4244840) = ID do scorecard real

O endpoint `ScoreCard?score_id=X` quer o **segundo**. Usar o primeiro
retorna `"An error occurred while processing this request"` silenciosamente.

**2. `scoringtype` e `competitiontype` têm de estar na URL E no body.**
```
POST /Home/PlayerWHS.aspx/ScoreCard?score_id=X&scoringtype=Y&competitiontype=Z&pp=N
body: {score_id, scoringtype, competitiontype, pp:"N"}
```
Se faltarem na URL (mesmo estando no body), o servidor retorna o mesmo
erro genérico. Os valores vêm do record da lista WHS (`scoring_type_id`
e `competition_type_id`) — NÃO hardcodar 1/10 fixo porque algumas rondas
são 4/10, etc.

### Controlo "só commit se há mais informação"

`scripts/run-scrape-drive-headless.js` implementa 3 níveis:

1. **Comparar JSON normalizado** (ignorando timestamps `gerado_em`) — se
   igual byte-a-byte, é "inalterado"
2. **Comparar totais** (`totalTournaments`, `totalPlayers`,
   `totalScorecards`) — "mais informação" significa algum total aumentou
3. **Exit code semântico**: `0` = mais dados (commit), `2` = nada novo
   (skip commit, **não é erro**), `1` = erro real (workflow falha)

No workflow:
```yaml
- run: |
    set +e
    node scripts/run-scrape-drive-headless.js
    EXIT_CODE=$?
    if [ "$EXIT_CODE" = "1" ]; then exit 1; fi
    if [ "$EXIT_CODE" = "2" ]; then echo "Nada novo"; fi
    echo "exit_code=$EXIT_CODE" >> $GITHUB_OUTPUT
- if: steps.scrape.outputs.exit_code == '0'
  run: git commit ... && git push
```

### Websites gémeos da FPG (CRÍTICO — diferenças subtis)

`scoring.datagolf.pt/pt/*` e `my.fpg.pt/Home/*` são **quase o mesmo backend** —
mesma estrutura jTable + ASP.NET PageMethods, mesmos dados de origem, mesmos
nomes de método. **MAS** têm diferenças no formato exacto do POST body que
fazem código hardcoded falhar com **HTTP 500** ao chamar o endpoint do gémeo
errado.

| Diferença | `scoring.datagolf.pt/pt/` | `my.fpg.pt/Home/` |
|---|---|---|
| Path base | `/pt/` | `/Home/` |
| Auth | Cookie ASP.NET via GET inicial | **Login SSO obrigatório** (area.my.fpg.pt) |
| listAction da `PlayerWHS.aspx` | `/pt/PlayerWHS.aspx/HCPWhsFederLST?fed_code=X` | `/Home/PlayerWHS.aspx/HCPWhsFederLST?fed_code=X&pp=N` |
| Body do POST WHS | `{ fed_code, jtStartIndex, jtPageSize, jtSorting }` | `{ fed_code, pp:"N", jtStartIndex, jtPageSize }` (**sem `jtSorting`!**) |
| `jtSorting` no body | obrigatório (`"hcp_date DESC"`) | rejeitado (devolve HTTP 500) |
| Param `pp:"N"` | inexistente | obrigatório (na URL E no body) |

**Lição aprendida:** nunca hardcodar o path nem o body do POST. Sempre fazer
auto-descoberta via `jt.options.actions.listAction` (string com URL completo
incluindo query params extra como `pp=N`). Os params extra (excepto `jt*`)
têm de ser **espelhados no body**.

Padrão recomendado em scripts/clientes:
```js
const u = new URL(jt.options.actions.listAction, location.href);
const extraParams = {};
for (const [k, v] of u.searchParams) if (!k.startsWith("jt")) extraParams[k] = v;
const body = { ...extraParams, fed_code: fed, jtStartIndex: "0", jtPageSize: "100" };
```

Implementação de referência: `scripts/console-fpg-whs-scrape.js`.

### PageMethods descobertos em `PlayerWHS.aspx`

POST JSON com `Cookie: ASP.NET_SessionId=X` + Referer da própria página.

| Endpoint | Body | Devolve |
|---|---|---|
| `PlayerWHS.aspx/HCPWhsFederLST?fed_code=X` | `{ fed_code, jtStartIndex, jtPageSize, jtSorting }` | Lista de rondas WHS (~38 campos/ronda) |
| `PlayerWHS.aspx/ScoreCard?score_id=X` | `{ score_id, scoringtype, competitiontype }` | Scorecard hole-by-hole (`par_1..18`, `gross_1..18`, `meters_1..18`, `stroke_index_1..18`, `stbgross_1..18`, `stbnet_1..18`, `bogey_1..18`) |
| `PlayerWHS.aspx/View20Scores?fed_code=X` | `{ fed_code }` | 20 rondas do cálculo WHS |
| `PlayerWHS.aspx/ViewWHSCalc?fed_code=X` | `{ fed_code }` | Cálculo WHS detalhado (soft/hard cap, etc.) |
| `FederatedsList_V2.aspx/HandicapsLST` | Ver `scripts/scrape-federados.js` | Lista de federados (32 campos — o `encryptedfedcode` é token único por jogador) |

### Autenticação — cookies necessários

São 6 cookies. **O crítico é o `.AspNet.ApplicationCookie`** (ASP.NET Identity
token de autenticação). Sem ele o servidor devolve `Param_Errors.aspx`;
com ele devolve `Result:"OK"`. Os outros 5 são necessários em conjunto
mas nenhum isolado chega.

| Cookie | Papel | Obtenção |
|---|---|---|
| `.AspNet.ApplicationCookie` | **Token de autenticação (crítico)** | Setado por SSO em `area.my.fpg.pt/login/` após submit de credenciais |
| `ASP.NET_SessionId` | Sessão ASP.NET | Setado pelo GET inicial a qualquer página `my.fpg.pt` |
| `PlayerArea` | Estado da área do jogador (`photo=&fedStatId=9`) | Setado pelo server após login |
| `playerIsLogin` | Flag de login (valor numérico, aparenta ser user-id interno) | Setado após login |
| `_ga`, `_ga_LLMN8JTFJ6`, `_ga_SBKT3JPZ7V` | Google Analytics | Benignos, mantêm-se por consistência |

Validade: não testada, mas `.AspNet.ApplicationCookie` de ASP.NET Identity
tipicamente dura dias a semanas (configurável no servidor). Refresh feito
re-fazendo login manual em `area.my.fpg.pt`.

### Gotcha crítico: Chrome SameSite enforcement bloqueia a captura do cookie

O servidor FPG **não seta `SameSite` nos cookies**. O Chrome moderno
aplica por default `SameSite=Lax` → **cookies de autenticação rejeitados
silenciosamente antes de serem persistidos** → sessão inválida → FPG
devolve "Erro 999" a pedir que desactives as flags SameSite.

**O user comum faz isto no Chrome dele e tudo funciona.** As flags a
desactivar (até estarem disponíveis):
- `SameSite by default cookies` → **Disabled**
- `Cookies without SameSite must be secure` → **Disabled**

**Problema:** essas flags **foram REMOVIDAS do `chrome://flags` no Chrome 91**
(Mai 2021) e a flag de linha de comandos `--disable-features=SameSiteByDefaultCookies`
foi removida no Chrome 94. Em Chrome 94+, tentar desactivar não é possível
nem via flags nem via args.

**✅ SOLUÇÃO QUE FUNCIONA:** instalar **Chrome 90** (última versão com as
flags ainda na UI), configurar `chrome://flags` → fazer login em
`area.my.fpg.pt` → copiar cookies do DevTools (Application → Cookies →
my.fpg.pt). O `.AspNet.ApplicationCookie` fica visível e copiável.

⚠ Segurança: Chrome 90 tem 5+ anos de vulnerabilidades não patchadas. Usar
**apenas para FPG**, não para navegação geral. Idealmente numa instalação
portátil isolada, ou num perfil dedicado.

**Tentativas falhadas anteriormente:**
- Playwright Chromium bundled + `--disable-features=SameSiteByDefaultCookies`
  → Chromium v100+ ignora (hard-coded)
- Playwright `channel: "chrome"` → abre Chrome do user com perfil limpo,
  sem as flags configuradas
- `channel: "chromium"` + warmup multi-step → falha no passo 3 com 500

Alternativa futura sem Chrome 90: Playwright conectado via CDP a Chrome
do user já aberto e logado (`--remote-debugging-port=9222`). Permite
extrair cookies incluindo httpOnly via `Network.getAllCookies`. Não testado
mas tecnicamente viável.

### Histórico de tentativas server-side (ambos os backends)

#### `my.fpg.pt`

| Tentativa | Resultado |
|---|---|
| `fetch` Node com só `ASP.NET_SessionId` | ❌ Param_Errors |
| `fetch` Node com 5 cookies visíveis (sem `.AspNet.ApplicationCookie`) | ❌ Param_Errors — conclusão errada: "há cookie invisível" |
| Adicionar Sec-Fetch-*, Sec-Ch-Ua-*, Origin, Priority, etc. | ❌ Nenhum desbloqueia |
| Playwright Chromium bundled + `--disable-features` | ❌ Chromium v100+ ignora flags SameSite (hard-coded) |
| Playwright `channel: "chrome"` com perfil limpo | ❌ Sem as flags chrome://flags configuradas |
| Copiar `ASP.NET_SessionId` do header `x-cookie-session-id` do golf-portugal | ❌ Sessão IP-bound a Google Cloud IPs |
| **`fetch` Node com 6 cookies (incluindo `.AspNet.ApplicationCookie`), capturados em Chrome 90** | **✅ FUNCIONA — Result:"OK", 138 rondas Manuel** |

#### `scoring.datagolf.pt`

| Tentativa | Resultado |
|---|---|
| GET direto a `/pt/tournaments.aspx` | ❌ HTTP 500 ou 302 → Param_Errors?Err=999 |
| GET a `/pt/` ou `/pt/Default.aspx` | ❌ HTTP 500 (bug ASP.NET sem sessão) |
| GET a `/pt/FederatedsList_V2.aspx` | ⚠ Outrora setava `ASP.NET_SessionId` mas agora também devolve 500 |
| Chamar `1EntryPage.aspx` de Node com hash copiado do browser | ❌ HTTP 500 (hash validado contra estado server-side da sessão que o pediu) |
| POST a `tournaments.aspx/GetTournamentList` (nome inventado) | ❌ HTTP 500 Runtime Error (endpoint não existe) |
| **POST a `tournaments.aspx/TournamentsLST` com 2 cookies do Chrome 90 (`ASP.NET_SessionId` + `DG_Lists_URL`)** | **✅ FUNCIONA — Result:"OK", 25 torneios, TotalRecordCount=83131** |
| Teste IP-binding: mesmos cookies via hotspot 4G (IP completamente diferente) | ✅ **Continuam a funcionar** → NÃO IP-bound |

**Insight chave:** durante meses pensámos que havia um cookie httpOnly
"invisível" que faltava. Na verdade o cookie `.AspNet.ApplicationCookie`
é visível na Application tab do DevTools — mas só quando o browser
consegue persisti-lo, o que requer SameSite desactivado. Em Chrome
moderno o cookie era rejeitado silenciosamente no momento de setting,
logo nunca aparecia em lado nenhum — nem no DevTools, nem em `document.cookie`,
nem em `cookieStore`, nem em Playwright. A ilusão de "cookie invisível"
era na verdade "cookie ausente".

### Estratégias disponíveis (em ordem de preferência, 2026-04-14 tarde)

1. **⭐ Primário — server-side direto com `.AspNet.ApplicationCookie`**
   - Login manual em Chrome 90 → copiar cookies do DevTools → guardar em
     `api/.datagolf-cookies.json` (gitignored) → proxy/scripts lêem o ficheiro
     e usam como `Cookie:` header
   - Endpoints diretos em `my.fpg.pt/Home/*` (ou `scoring.datagolf.pt/pt/*`)
   - Refresh ~1×/semana via novo login manual (validade do token ASP.NET Identity)
   - **Sem dependência de golf-portugal.pt, sem Playwright, sem Cloud Run**
   - Prova de conceito: `scripts/test-fpg-auth.js`
   - Implementações a fazer: `scripts/scrape-fpg-server.js` (bulk scrape),
     atualizar `api/datagolf.js` para usar `my.fpg.pt` diretamente

2. **Fallback — `golf-portugal.pt/api/*` via proxy `api/datagolf.js`**
   - Se os nossos cookies expirarem e o user não puder refrescar logo
   - Hospedado em Google Cloud Run; mantém pool de cookies FPG vivos
   - Headers: `x-cookie-provider: FPG`, `x-cookie-session-id`, `x-cookie-version`
   - CORS `MISSING` → precisa do nosso proxy server-side
   - Endpoints:
     - `/api/clubs/{anyCode}/players/{fed}/results?startIndex=0&limit=N`
     - `/api/clubs/{anyCode}/players/{fed}` (perfil)
     - `/api/clubs/{anyCode}/players/{fed}/handicaps`
     - `/api/scorecards/{score_id}` (hole-by-hole)

3. **Alternativa manual — console browser script**
   - `scripts/console-fpg-whs-scrape.js` — colar na consola de `my.fpg.pt`
     ou `scoring.datagolf.pt` (gémeos)
   - Scrape bulk de todos os 396 jogadores, download de `fpg-whs.json`
   - Ainda útil quando queres snapshot datado sem configurar pipeline
   - App usa como cache local (datagolfClient.ts lê primeiro este ficheiro
     antes de ir ao proxy live)

### Proxy `api/datagolf.js` — arquitectura actualizada 2026-04-14/15

Depois dos breakthroughs do `.AspNet.ApplicationCookie` e dos cookies do
`scoring.datagolf.pt`, o proxy `api/datagolf.js` foi refactorizado.
Comportamento actual:

**Fluxo de autenticação (`dgGetSession`) — por ordem de preferência:**

1. **Env var `DATAGOLF_COOKIES`** (produção Vercel) — ler cookieHeader directo.
   Opcional: `DATAGOLF_HOST` (default "my.fpg.pt").
2. **Ficheiro `api/.datagolf-cookies.json`** (dev local, gitignored) com
   formato `{host, cookieHeader, ...}`. Quando `host` é `"my.fpg.pt"`, o
   proxy seta `DG_BASE = https://my.fpg.pt/Home` e `DG_PP = "N"`.
3. **Fallback: `golf-portugal.pt` + `x-cookie-session-id`** — só usado se
   response foi `r.ok` (bug corrigido: antes usava mesmo em HTTP 500, e o
   session ID vinha mas era inválido para outros fed codes → Param_Errors).
4. **Último recurso: GET simples** a páginas que setavam `ASP.NET_SessionId`.
   Hoje quase todas devolvem 500 sem contexto do browser.

**Fluxo de scraping (`tryBoth`) — por ordem de preferência:**

Se há cookies locais (`hasLocalDgCookies()` retorna true):
1. Tentar **datagolf PRIMEIRO** (com os nossos cookies, ~2-6 segundos)
2. Fallback ao **golf-portugal.pt** só se o datagolf falhar

Se NÃO há cookies locais:
1. Tentar **golf-portugal.pt PRIMEIRO** (comportamento histórico)
2. Fallback ao datagolf

**Razão da inversão:** antes, o código tentava sempre GP primeiro — e como
o GP tenta 5 clubs × 3 retries com backoff (~10-15s de esperas), a latência
total era ~30s para jogadores que o GP não suporta. Com os nossos cookies a
funcionar directamente no `my.fpg.pt`, ir lá primeiro corta latência de 30s
→ 3-6s.

**Paginação obrigatória (confirmado 2026-04-14):**
- `my.fpg.pt/Home/PlayerWHS.aspx/HCPWhsFederLST` **rejeita `jtPageSize > 100`
  com HTTP 500** ("There was an error processing the request")
- Proxy pagina em batches de 100 (`jtStartIndex` 0, 100, 200, …) até
  atingir `TotalRecordCount` ou o `limit` pedido
- Paginação é sequencial — poderia ser paralela se total fosse conhecido
  à partida

**Normalização FPG → WhsRound (`normalizeFpgWhsRecord`):**

`my.fpg.pt/HCPWhsFederLST` e `golf-portugal.pt/api/.../results` devolvem os
mesmos dados mas com nomes diferentes. A UI em `datagolfClient.ts` (tipo
`WhsRound`) espera o formato do golf-portugal. O proxy converte os records
do `my.fpg.pt` antes de devolver à UI:

| Campo WhsRound (UI) | Campo my.fpg.pt |
|---|---|
| `id` | `id` (ou `score_id`) |
| `federation_code` | `federated_code` |
| `tournament_description` | `tourn_name` |
| `course_description` | `course_description` ✓ |
| `score_dateStr` | `hcp_dateStr` ou `mov_dateStr` |
| `hole_count` | `holes` |
| `par_total` | `par` |
| `exact_hcp` | `exact_handicap` |
| `calc_hcp_index` | `exact_handicap` (aproximação — FPG não expõe index separado) |
| `calculated_stablnet_total` | `stableford` |
| `score_differential` | `sgd` |
| `score_origin` | `score_origin` ✓ ("Torn", "Indiv", etc.) |
| `cba_value` | `cba` |
| `status_name` | `score_status` |
| `gross_total` | **não devolvido** pelo `HCPWhsFederLST` — disponível via `ScoreCard` endpoint |

Campos originais são preservados via `...r` spread, para não quebrar código
que possa vir a inspeccionar campos não-canónicos.

### UI de "Só cadastro FPG" em `JogadoresPage.tsx`

Componente `FederadoOnlyDetail` (linha ~1982) renderiza jogadores que só têm
cadastro em `federados.json` (sem `{fed}/analysis/data.json` pré-calculado).
Usa `getPlayerHistory(fed)` de `datagolfClient.ts` → `/api/datagolf?action=whs&fed=X`.

Depois das correcções 2026-04-14/15:
- Erro é mostrado num `<details>` expansível "Ver detalhes do erro" em vez
  de truncado a 80 chars (antes ficavam invisíveis mensagens importantes
  como o erro do segundo backend)
- Mensagem auxiliar sugere consultar o site da FPG directamente quando
  ambos falham
- Tabela renderiza 100 primeiras rondas com data, torneio, campo, buracos,
  HCP, stableford, score differential, origem

### Sidebar de JogadoresPage — limite aumentado

`MAX_SIDEBAR_ITEMS = 2000` (era 500, 2026-04-15). Razão: com 15.646
federados activos, 500 não chega para encontrar jogadores com nomes
comuns (ex: "Joana Sousa" aparecia depois da 500ª posição). O filtro
`filtered` já corre sobre todos os federados, só o render é limitado.
Para uma lista maior, considerar virtualização real (react-window).

### Pitfall histórico: não copiar o cookie do `x-cookie-session-id`

Parece tentador porque o header do golf-portugal expõe literalmente
`ASP.NET_SessionId=gmjub...` — mas é uma sessão IP-bound a Google Cloud IPs,
logo usá-la a partir de outro IP falha. **Isto continua verdade** — mas
agora é irrelevante porque com o `.AspNet.ApplicationCookie` (e o teu
`ASP.NET_SessionId` local do próprio login) a autenticação funciona sem
dependências externas.

### Padrão recomendado para chamar PageMethods FPG

**Nunca hardcodar paths/bodies.** Sempre auto-descobrir o endpoint via DOM:

```js
// Em qualquer página com jTable carregado (PlayerWHS.aspx etc.)
const parent = document.querySelector(".jtable-main-container").parentElement;
const jt = jQuery.data(parent, "hik-jtable");
const u = new URL(jt.options.actions.listAction, location.href);

// Extrair params extra (todos excepto jt*) → têm de ir no body também
const extraParams = {};
for (const [k, v] of u.searchParams) {
  if (!k.startsWith("jt")) extraParams[k] = v;   // fed_code, pp:"N", etc.
}

const body = {
  ...extraParams,                 // OBRIGATÓRIO espelhar params extra
  jtStartIndex: "0",
  jtPageSize: "100",              // máximo aceite (200+ → HTTP 500)
  // jtSorting: NÃO incluir incondicionalmente (my.fpg.pt rejeita)
};

const response = await fetch(u.pathname + u.search.replace(/fed_code=\d+/, `fed_code=${targetFed}`), {
  method: "POST", credentials: "include",
  headers: { "Content-Type": "application/json; charset=utf-8", "X-Requested-With": "XMLHttpRequest" },
  body: JSON.stringify(body),
});
```

Implementação canónica: `scripts/console-fpg-whs-scrape.js`.

### Códigos de resposta e erros conhecidos

| Cenário | Status | Body / Mensagem |
|---|---|---|
| GET `/pt/` puro | 500 | "Server Error in '/pt' Application" |
| GET `/pt/PlayerWHS.aspx?no=X` (sem sessão prévia) | 500 | "Runtime Error" |
| GET `/pt/FederatedsList_V2.aspx` (sem sessão) | 200 | Body diz "Erro 999 — autenticação inválida" mas **seta `Set-Cookie: ASP.NET_SessionId`** ← URL útil para getSession() |
| POST PageMethod sem cookie / sem auth válida | 200 | `{"d":{"Result":"ERROR","Message":"Error executing child request for Param_Errors.aspx."}}` |
| POST PageMethod com auth + body certo | 200 | `{"d":{"Result":"OK","Records":[...],"TotalRecordCount":N}}` |
| POST PageMethod com `jtSorting` no `my.fpg.pt` | **500** | Internal Server Error |
| POST PageMethod com `pageSize > 100` | **500** | Internal Server Error |
| POST `golf-portugal.pt` transitório | 500 ocasional | `{"error":"Failed to fetch player results"}` — retry resolve |

### Lições aprendidas (ATUALIZADAS 2026-04-14)

1. **Os cookies crave de autenticação são 2, não 1.** Para `my.fpg.pt` é
   o `.AspNet.ApplicationCookie` (ASP.NET Identity token). Para
   `scoring.datagolf.pt` é o par `ASP.NET_SessionId` + `DG_Lists_URL`.
   Sem eles, nenhum PageMethod autentica. Com eles + cookies acompanhantes,
   server-side funciona em Node `fetch` puro.

2. **"Cookie invisível" era "cookie ausente".** SameSite enforcement do
   Chrome moderno rejeita cookies da FPG silenciosamente antes de persistir
   (o servidor FPG não seta `SameSite` nos Set-Cookie headers). Resultado:
   testávamos sempre sem o cookie de auth e concluíamos que havia algo
   httpOnly escondido — não havia, simplesmente não tinha sido guardado.
   **Debug heuristic:** quando um cookie parece "não existir" no browser,
   verificar F12 → Network → Response Headers → Set-Cookie e comparar com
   F12 → Application → Cookies. Se aparece no Set-Cookie mas não em
   Application, o browser rejeitou-o na chegada (SameSite, Secure, domain
   mismatch, etc.).

3. **Chrome 90 + SameSite OFF é a combinação fundadora.** Qualquer browser
   headless/moderno falha na captura. Chrome 91+ removeu as flags da UI;
   Chrome 94+ removeu a flag CLI. Playwright/Chromium bundled nunca vai
   conseguir — as features estão hard-coded desde v100+.

4. **Os cookies da FPG NÃO são IP-bound ao servidor.** Testado explicitamente
   2026-04-14 via hotspot 4G (IP completamente diferente do login original) —
   cookies continuaram a funcionar. Isto contradiz a conclusão anterior
   ("sessão ASP.NET FPG é IP-bound") que era baseada em testes com o
   `ASP.NET_SessionId` do `golf-portugal.pt` (que É IP-bound, mas por causa
   da infra deles, não do ASP.NET em geral). **Consequência prática:**
   GitHub Actions pode usar cookies capturados localmente.

5. **`scoring.datagolf.pt` exige passagem pelo `1EntryPage.aspx`.** GET
   directo a `/pt/tournaments.aspx` devolve sempre 500 ou redirect para
   Err=999. O entry page valida um hash SHA-1 que é impossível de
   replicar de Node (depende do estado server-side da sessão que o pediu).
   Logo: a captura tem de ser feita via browser real (Chrome 90), não pode
   ser automatizada sem Playwright+browser.

6. **Nunca hardcodar paths/bodies de PageMethods FPG.** Auto-descobrir
   sempre via `jt.options.actions.listAction`. As subtilezas `/pt/` vs
   `/Home/` (pp=N obrigatório num, ausente noutro; jtSorting obrigatório
   num, proibido noutro) quebram silenciosamente com HTTP 500.

7. **Os 2 sites são gémeos no nome, primos na implementação.** Mesma
   origem de dados, mas frontends ASP.NET separados com configurações
   diferentes. Ver tabela "Websites gémeos" para diferenças exactas.

8. **Para descobrir endpoints novos: DevTools Network + Copy as cURL.**
   O fluxo padrão:
   - Abrir página no Chrome 90 com sessão válida
   - F12 → Network → limpar (Ctrl+L)
   - Interagir com a página (reload, filtrar, paginar) para disparar XHR
   - Encontrar o pedido certo → botão direito → Copy → Copy as cURL
   - Colar numa conversa ou num script de teste — tens o endpoint exacto,
     body, headers e cookies

9. **golf-portugal.pt degradado a fallback.** Era a solução primária antes
   (proxy externo que mantinha pool de cookies FPG). Agora só serve se os
   nossos cookies expirarem e o user não puder refrescar. Evitar dependência
   externa — somos donos da pipeline agora.

10. **Browser console > Playwright para testes exploratórios.** Quando
    precisares de testar um endpoint novo, colar um script na consola do
    browser logado é mais rápido e fiável que configurar Playwright.

11. **Playwright só é necessário para (a) captura inicial de cookies — e
    nem isso, porque o Chrome 90 do user resolve — ou (b) scraping de
    sites não-FPG que tenham protecção extra.** Para FPG, **não precisamos
    mais de Playwright**.

12. **Documentação completa em `docs/api-fpg-endpoints.md`** — 12 secções
    com tudo o que descobrimos. Consultar em caso de dúvida antes de
    redescobrir.

### Playbook — cookbook para futuras sessões

**Cenário 1: "Os cookies expiraram, preciso de os refrescar"**
1. Abrir Chrome 90
2. Navegar para `https://scoring.datagolf.pt/pt/tournaments.aspx` → F12 →
   Application → Cookies → copiar `ASP.NET_SessionId` + `DG_Lists_URL`
3. Navegar para `https://my.fpg.pt/Home/PlayerWHS.aspx?no=52884` → login
   se pedir → F12 → Application → Cookies → copiar os 6 cookies
4. Atualizar GitHub Secrets (`DATAGOLF_COOKIES` e `FPG_COOKIES`) ou
   ficheiro local `api/.datagolf-cookies.json`
5. Correr `node scripts/test-fpg-auth.js` e `node scripts/test-datagolf-node.js`
   para confirmar que ambos devolvem `Result:"OK"`

**Cenário 2: "Quero automatizar scraping novo endpoint"**
1. Identificar o que a página faz ao carregar (abrir no Chrome 90 + F12 Network)
2. Copy as cURL do pedido XHR que devolve os dados
3. Replicar em Node (`scripts/test-<endpoint>.js`) — manter os mesmos
   cookies, headers, body
4. Se funcionar, integrar no pipeline (script Node puro, não Playwright)
5. Se não funcionar, verificar:
   - Cookies completos? (especialmente `.AspNet.ApplicationCookie` e `DG_Lists_URL`)
   - Headers obrigatórios? (`X-Requested-With: XMLHttpRequest`, `Referer`)
   - Body no formato exacto? (ASP.NET é sensível a tipos — tudo como string)

**Cenário 3: "GitHub Action parou de funcionar"**
1. Ver logs do último run — procurar `HTTP 500` ou `Result:"ERROR"` ou
   `Param_Errors`
2. Se `Param_Errors` → cookies expiraram, seguir Cenário 1
3. Se `HTTP 500` Runtime Error → endpoint mudou, seguir Cenário 2 para
   re-descobrir
4. Se timeout → site lento ou bloqueado, dar retry manual

**Cenário 4: "Parece que um cookie não existe"**
1. F12 → Network → encontrar a response que devia setar o cookie
2. Response Headers → procurar `Set-Cookie:` — está lá?
3. Se sim mas cookie não aparece em Application → Cookies: browser rejeitou
   - Ver atributos (SameSite, Secure, domain) — algum a bloquear?
   - Chrome moderno → SameSite quase sempre a causa, usar Chrome 90
4. Se não está no Set-Cookie do servidor: servidor não o está a enviar
   - Falta algum passo no fluxo (ex: redirect intermédio, POST de login)
   - Ver o Network completo: há algum request "anterior" que deveria
     setá-lo e não foi chamado?

### Ficheiros de dados relacionados

- `public/data/federados.json` (15 MB, 15.646 activos — `FedStat=9`)
- `public/data/federados-inativos.json` (41 MB, 43.054 inactivos — `FedStat=7`)
- `public/data/federados-inativos-stats.json` (~25 KB, agregados)
- `public/data/federados-inativos-jovens.json` (~2.7 MB, Sub-10 a Sub-21)
- `public/data/fpg-whs.json` (gerado pelo console script — usar como cache)
- `api/.datagolf-cookies.json` (gerado pelo Playwright — gitignored)

---

## Convenções de código

### CSS e cores

- **Todas as cores passam por `tokens.css`** — nunca hardcodar hex nos componentes.
- `colors.ts` espelha os tokens para uso em JS/TS (recharts, arrays de dados). Alterar primeiro em `tokens.css`, depois actualizar `colors.ts`.
- **Excepção intencional:** `OverlayExport.tsx` usa cores hardcoded porque `html-to-image` não suporta CSS custom properties — documentado com comentário no cabeçalho.
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

- **`SexBadge.tsx` — NUNCA usar símbolos Unicode ♂ ou ♀ na UI.** Usar sempre `<SexBadge sex="M" />` ou `<SexBadge sex="F" />`. O badge é um círculo/pill com as cores oficiais do projecto (`--badge-male` / `--badge-female`). Isto aplica-se a legendas, labels, cabeçalhos de tabelas, contadores, tooltips — em TODO o lado onde seria tentador escrever ♂/♀ para indicar sexo.
- ⚠⚠⚠ **REGRA ABSOLUTA — TODAS as tabelas têm de ser ordenáveis por CLIQUE NO CABEÇALHO.** Sem excepções. Independente de número de linhas, tipo de página, ou contexto. Se vais criar uma tabela (ou ajustar uma existente) e NÃO tens as colunas sortable, **estás a violar a regra do projecto — revê antes de commitar**. Ferramentas obrigatórias:
  - Hook `useSort` de `src/hooks/useSort.ts` — gere `sortKey`/`sortDir`/`toggleSort`.
  - Componente `SortableHdr` de `src/ui/SortableHdr.tsx` para os `<th>` clicáveis com seta (↑/↓/↕).
  - Exemplo canónico: `const { sortKey, sortDir, toggleSort } = useSort<"pos"|"nome"|"hcp">("pos")` + `<SortableHdr k="pos" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>#</SortableHdr>`.
  - Quando renderizas via `ScorecardLeaderboard` a pos/nome/gross/toPar são ordenáveis com `sortable={true}`. **Mas colunas custom em `prefixHeaderCells`/`postScorecardHeaderCells` não são ordenáveis automaticamente** — tens de ordenar os rows manualmente antes de passar (com useSort + sort do array + SortableHdr nos headers custom). Ver `AdmissionsTab.tsx` e `DrawTab.tsx` como referência actual.
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

### Features novas em JogadoresPage (2026-04-15)

- **Modal scorecard** no `FederadoOnlyDetail` — clicar em qualquer ronda da
  tabela abre modal com grelha hole-by-hole estilo oficial: `sc-score` +
  `scClass(gross, par)` + halftotal F9/B9 + `fmtToPar()`. Fetch via
  `getScorecard(round.id)` de `datagolfClient.ts`.
- **Botão "🧒 Jovens"** na toolbar (modo Todos) — activa filtro com todos os
  Sub-* (Sub-10 a Sub-21) de uma vez. Quando activo, levanta o cap de
  `MAX_SIDEBAR_ITEMS` e mostra KPI grid por escalão (total + distribuição
  por sexo com `SexBadge`).
- **`MAX_SIDEBAR_ITEMS = 2000`** (era 500) — para jogadores com nomes comuns
  aparecerem sem refinar filtros. Para virtualização real usar react-window
  no futuro.
- **Erro expansível** no `FederadoOnlyDetail` com `<details>` — mostra
  mensagem COMPLETA (antes truncava a 80 chars e escondia parte crítica do
  fallback).

### Tags no `players.json` e o que fazem

| Tag | Efeito na UI (JogadoresPage) | Efeito no scraper |
|---|---|---|
| (sem tag) | Visível na sidebar, prioridade normal | Scraped na automação |
| `PJA` | Visível, prioridade máxima | Scraped |
| `no-priority` | Visível (não-jovens são removidos pelo cleanup) | Scraped se estiver na lista |
| `hidden` | **Escondido da sidebar** (filtro em JogadoresPage) | Removido pelo cleanup |
| `no-scrape` | Visível normalmente | **Scraper salta** (não actualizado) |
| `inscrito-nacional` | Marcador, visível | Prioridade máxima, nunca no-scrape |

**Regra de ouro:** `hidden` vs `no-scrape` distinguem-se por visibilidade.
- `hidden` = invisível na UI + removido do players.json via cleanup
- `no-scrape` = visível na UI, mas congelado (dados não actualizados)

`cleanup-players-json.js` aplica estas regras automaticamente.

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

**Separação de pipelines USKids vs não-USKids** — Torneios não-USKids (Doral, WJGC, Greatgolf, QDL, EOWAGR) devem alimentar **apenas** a tab Rivais via `buildAutoRivals()`. A tab Resultados carrega **exclusivamente** de `uskids-results.json` e `uskids_torneios_completos(1-22).json`. Este bug voltou várias vezes.

**Manuel tem 4 variantes de nome + 2 contas USKids** — "Manuel Medeiros", "Manuel Francisco Medeiros", "Manuel Goulartt Medeiros", e "Manuel Francisco Goulartt De Medeiros" (este último era da **conta USKids antiga**, antes da migração para mid `630106`). Usar sempre `autoRivals.filter(d => d.isM)` (não `find()`) e fazer merge de todas as entradas. `isManuelByName()` em `src/constants/manuel.ts` já apanha as 4 variantes. Para mid USKids legacy, ver `MANUEL_PLAYER_IDS` (array) — adicionar lá o mid antigo quando validado via `scripts/verify-manuel-legacy-mid.js`.

**Manuel — conta USKids antiga (legacy)** — jogou em 2023 (Real Club de Golf El Prat tcode 15573 Boys 9, gross 44, place 3) com **mid 605933** (validado 2026-05-13 via GetTournamentPlayers&f=198807 + GetMemberTournamentResults — única aparição na carreira). Conta abandonada depois desse torneio; conta nova `630106` criada para a temporada seguinte. O nome aparecia como "Manuel Francisco Goulartt De Medeiros". Histórico, confrontos H2H e progressão de escalões mergeam os dois IDs como um único jogador via `MANUEL_PLAYER_IDS = ["630106", "605933"]` em `src/constants/manuel.ts`.

**Referências estáticas a dados fora de componentes React ficam stale** — `const manuel = D_BASE.find(x => x.isM)` fora de um componente referencia dados pré-merge. Fazer lookup dentro do componente via state.

**FPGPage — torneio resolvido pela URL, não por displayList[selected]** — o render do detalhe usa `tShow = displayList.find(t.ccode/tcode === params.tkey)`, não `cur = displayList[selected]`. Razão: durante load async, `tournaments`/`jovensTournaments`/`clubesTournaments` chegam em batches e cada um re-calcula o `displayList` useMemo (sort por data desc). Sem tie-breaker estável entre items com a mesma data, `displayList[selected]` aponta a torneios diferentes entre re-renders → user vê "A carregar..." preso ou outro torneio. Adicionalmente, o `handleClick` da sidebar precisa de chamar `navigate()` directamente; sem isso, o guard anti-loop do `state→URL` skipa quando `params.tkey != novo cur.tcode/ccode`, deixando o user preso na URL antiga. **Source of truth = URL**. Não tentar fixar via useState/useEffect/selectedKey complexos — leva a regressões em cascata. Resolvido 2026-04-27.

### Dados

- **scrape-drive-aquapor-v6 bug R1=R2** — v6 usava API que ignora `classifround`. v7 usa `classifAgregate.aspx/ScoreCard` — corrigido.
- **ScorecardLeaderboard par vazio** — se `par[]` chegar vazio, `nh=0`, slice→[], soma=0. Fix: `const nhRef = par.length || (is9 ? 9 : 18)`.
- **KIDSdataLoader filtro 18H bloqueava 9H** — El Prat 2023 (9H) não aparecia. Fix: usar `expectedHoles = par.length` dinâmico. El Prat também precisou de `USKIDS_PAR["15573-2151"]` manual.
- **Irmãos com mesmo apelido** — falsos positivos no matching de rivais. Fix: first-name prefix penalty no `scoreMatch()`.
- **lengths[] nos completos são jardas** — converter ×0.9144 para metros.
- **strokes[] tem sempre 18 posições** — em torneios 9H, posições não jogadas = 0. Filtrar zeros.
- **MANUEL_OVERRIDES / applyResultOverrides Marco Simone 2026 Boys 11** — Manuel foi marcado IE (Ineligible) pela USKids porque não confirmou o scorecard da R1 (avisou depois → penalidade aplicada). O site mostra o score **oficial com penalidade** (R1=91 com hole 5=10, R2=79), não o score jogado (R1=86 com hole 5=5, R2=79). Detalhe completo no comentário do override em `src/pages/USKIDSPage.tsx::applyResultOverrides`.
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
---

## Página `/nacionais-jovens` — Campeões Nacionais de Jovens (2005-2026)

Página dedicada à vista histórica dos Campeonatos Nacionais Sub-10 a Sub-18.
Reusa o `JovensAnaliseView` (mesmo layout de `/FPG/jovens`) mas alimentado por
`fpg-nacionais-historico.json` (160 + 46 = 206 torneios, 21 anos).

### Workflow de scrape em chunks

Devido a limites de tamanho do download via `URL.createObjectURL` no browser
(~3.4 MB capa silenciosamente), o scrape de 4500+ jogadores não cabe num só
ficheiro. Solução: dividir em chunks de ~500 KB e fazer merge offline.

**Pipeline:**

1. Browser → ClassifLST agregado para cada tcode (concorrência 5, batches de 40)
2. Browser → trigger 4-5 downloads sequenciais (`nacionais-v4-chunk{1..5}.json` + `nacionais-v4-meta.json`)
3. Move-Item dos ~5 ficheiros para `public/data/`
4. `node scripts/merge-nacionais-chunks.js` → produz `fpg-nacionais-historico.json`

**Chunks v4:**
- 1-4: 160 Nacionais "principais" (118 Jovens + 42 Clubes, ccode=000)
- 5 (opcional): 46 extras — Drive Tour Finals 2018/19/21/22/23/24 + ccode=988 2025 Sub-10/12

**Drive Tour Finals como Nacional de facto:** o `classifyTournament` da
`JovensAnaliseView` já trata `Final/Grande Final Drive Tour` como tipo
"Nacional". Em anos onde o Campeonato Nacional individual de Sub-12+ não
correu (2018, 2021-2024), a Final Drive Tour é o equivalente.

### ClassifLST NÃO devolve fed_code nem nationality

Pesquisado 2026-05-04: o endpoint `/lists/classif.aspx/ClassifLST` retorna
estes campos (e SÓ estes):

```
id, classif_pos, classif_total, score_status_id,
player_name, player_gender, player_age, player_type_id,
player_club_member, player_identifier (sempre 0!), official,
player_club_description, exact_hcp, play_hcp,
classif_r1..r4, gross_total, gross_r1..r4, to_par_total, to_par_r1..r4,
score_id, agregatecol, score_tpe
```

**NÃO inclui** `fed_code`, `player_country`, ou `nationality`. O
`player_identifier` aparece sempre como 0 — provavelmente um campo legacy não
utilizado.

**Consequência:** dados scrapados via ClassifLST não permitem ativar a regra
"só portugueses podem ser campeões Nacional" (`isEligibleForTitle` em
`jovensAnaliseData.ts`), pois essa regra usa `playersDB[fedCode].sex` para
identificar nacionalidade.

**Workaround actual em `NacionaisJovensPage`:** capturamos `player_gender` no
scrape e populamos `player.sex` directamente no registo (não no playersDB
sintético — abandonámos essa abordagem porque deixava `synth-XXXX` visíveis na
UI). A `JovensAnaliseView.playerSex` foi modificada para preferir `p.sex`
sobre o lookup `playersDB[fedCode]`.

**Endpoints alternativos testados (2026-05-04, NÃO funcionaram):**
- `/lists/classifAgregate.aspx/ScoreCard` POST `{score_id, classifround:""}`
  → "There was an error processing the request" (precisa de body diferente)
- `/pt/Classifications.aspx/ScoreCard` POST `{score_id, classifround:1}`
  → HTML em vez de JSON (provavelmente requer scoringtype/competitiontype
  específicos vindos do record da lista)
- Inspecção de scripts inline da página: o body é construído por funções
  jTable que o filtro de safety bloqueia (`[BLOCKED: Cookie/query string data]`)

**Próximas opções (não testadas):**
1. Capturar nacionalidade via `FederatedsList_V2.aspx/HandicapsLST` (endpoint
   já documentado em `my.fpg.pt`) — mas exige fed_code que não temos.
2. Matching por nome contra `players-nationality.json` local (baseado em
   federados-inativos consolidados).
3. Heurística: nomes "estrangeiros" via lista de surnames internacionais.

### Bug `parseEscaloes` (corrigido 2026-05-04)

**Sintoma:** Sub-10 2024 e outros anos com nomes "Sub N - YYYY" não
apareciam na grelha.

**Causa:** `parseEscaloes` em `jovensAnaliseData.ts` (regex de range
`Sub N1-N2`) interpretava "Sub 10 - 2024" como range Sub-10→Sub-2024.
Como ESC_BRACKETS = [10,12,14,16,18,24] e todos os valores são ≤2024, o
filtro `b >= 10 && b <= 2024` retornava TODOS os escalões.

`combinedEscalao` ficava `true` → a logic exigia DOB para filtrar jogadores
por escalão real, e como os dados de `fpg-nacionais-historico.json` não têm
DOB (sem fed_code), TODOS os players eram filtrados → 0 champions.

**Fix:** se `n2 >= 31` (fora do range plausível de Sub-N), tratar como
mono-escalão (apenas n1).

```ts
if (n2 >= 31) {
  return [`Sub ${n1}`];
}
```

### Prop `splitByEscalao` na `JovensAnaliseView`

Para datasets grandes (21 anos × 5 escalões = grelha enorme), a `ChampionsGrid`
agora aceita `splitByEscalao?: boolean`. Quando true, renderiza UMA tabela
por escalão (Sub-10, Sub-12, ...) em vez de uma única grelha empilhada.

`NacionaisJovensPage` usa `splitByEscalao={true}`. `/FPG/jovens` continua
com layout original (default `false`).

Cada bloco de escalão tem o seu próprio `escYears` filtrado (anos onde ESSE
escalão teve champion) — assim Sub-10 não mostra 2024 se 2024 só correu
Sub-12+, e vice-versa.

### Sticky columns — Escalão + Tipo

Na `RegionChampionsBlock`, AS DUAS primeiras colunas ficam sticky em scroll
horizontal:
- **Escalão** (Sub-10 M, Sub-12 F, etc.): `position: sticky, left: 0, width: 90px`
- **Tipo** (Camp/Vice): `position: sticky, left: 90px`

Antes só uma sobrepunha-se à outra (ambas com `left: 0`). Fix: dar `width: 90px`
explícito à Escalão e `left: 90px` à Tipo.

### Padding-bottom para barra de scroll

A scrollbar horizontal da `<div style={{overflowX:"auto"}}>` tapava os nomes dos
jogadores na última linha. Fix: `paddingBottom: 14px` na div wrapper.

### Tcodes Nacionais Jovens conhecidos

**Pré-2018 (formato antigo "Sub N - YYYY", torneios mistos M+F):**
- 2005-2017: tcodes 00xxx (5 dígitos com zero leading) e 100xx
- M e F competiam no MESMO torneio; campeões separados por sexo via `p.sex`

**2018+ (formato H/S separado):**
- "Campeonato Nacional de Sub 10 H" / "Campeonato Nacional de Sub 10 S"
- 2024 Aroeira PGA: 10770-10773 (Sub-10/12 H+S)
- 2025 Santo Estevão (ccode=988!): 10254 (Sub-12 H), 10255 (Sub-12 S), 10256 (Sub-10 H)
- 2025 Aroeira (ccode=000): 10865-10870 (Sub-14, 16, 18 H+S)
- 2026 Aroeira: 10935-10944 (todos os 10 escalões)

**Drive Tour Finals (Nacional de facto Sub-12+ quando CNJ directo não correu):**
- 2018: 10158-10164
- 2019: 10254-10260 (NÃO confundir com 2025/988/10254-10256!)
- 2021: 10458-10464
- 2022: 10572-10579
- 2023: 10682-10689
- 2024: 10802-10808 (sem Sub-12; s