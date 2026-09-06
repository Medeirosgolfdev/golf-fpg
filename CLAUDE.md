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
- 17 GitHub Actions para automação de dados (ver tabela "GitHub Actions — estado")

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

scripts/          # ~225 scripts Node.js para pipeline de dados (scrapers, builders, testes)
scripts/lib/      # lib partilhada dos scrapers (cookies, fpg-http, atomic-write) — ver secção própria
scripts/aggregator/ # orquestrador do agregador de juniores (sources/ + identity-matcher); workflow build-juniors.yml
scripts/_archive/ # scripts legados/diagnóstico (browser-console, testes-diagnostico, etc.) — não corridos
lib/              # (RAIZ, ≠ scripts/lib) biblioteca de processamento usada por pipeline.js e alguns builders
                  #   (process-data, hole-stats, cross-stats, scorecard-fragment, course-aliases, players, …)
api/              # funções serverless Vercel: datagolf.js (proxy WHS/scorecards) + inscricoes.js
public/data/      # ficheiros JSON servidos ao runtime
data-archive/ (raiz, fora de public/) # ficheiros pesados — NÃO copiados para o build/deploy (movido de public/data-archive em 2026-06-12)

tokens.css        # FICHEIRO ÚNICO de design tokens
App.css           # Classes de componentes (~110KB)
design-system.html # Referência visual de todos os componentes CSS
```

> **Pastas retiradas do Git em 2026-06-23 (arrumação)** — `scripts_backup/`, `_archive_2026-*/`, `_probe-tmp/`, `diag-out/`, `outputs/` foram removidas do versionamento (`git rm --cached`, continuam em disco) e adicionadas ao `.gitignore`. Eram backups/temporários sem referência no código. `output/{fed}/*` continua tracked de propósito (output do scraper FPG que alimenta as páginas). Os dois scripts browser-console legados da raiz (`pull-torneios.js`, `scrape-drive-aquapor-v7.js`) foram movidos para `scripts/_archive/browser-console/`.

> **⚠ `output/` é PARTILHADO entre o build e o scraper (arrumado 2026-08-20)** —
> o `outDir` do Vite é `output/` (`vite.config.ts`), a MESMA pasta onde o
> scraper FPG escreve `output/{nfed}/…`. Cada `npm run build` copia lá para
> dentro TODO o `public/`: `index.html`, `assets/`, `data/` (~191 MB) e, à raiz,
> os mesmos ficheiros e pastas que existem em `public/` (`Logos/`, `docs/`,
> `reports/`, `logos para outras nupcias/`, `player-stats.json`,
> `analise-percurso-juniores.html`, …). Essas cópias estavam **tracked** — 423
> ficheiros / ~144 MB duplicados de `public/` — por isso correr o build em local
> sujava o `git status` e arriscava entrar lixo nos commits de dados (aconteceu
> a 2026-08-20). Foram retiradas do versionamento (`git rm --cached`, continuam
> em disco) e o `.gitignore` passou a ignorar **tudo à raiz de `output/`**,
> re-incluindo só o que é do scraper: `!/output/[0-9]*/` (os directórios por
> federado, incluindo os que ainda não existem) e
> `!/output/extract-courses-cache.json`. **A fonte de verdade destes ficheiros é
> sempre `public/`** — é lá que os geradores escrevem (`enrich-players.js` →
> `public/player-stats.json`); o que está em `output/` é resíduo do build.
> ⚠ Não mover o `outDir` para `dist/` sem confirmar a *Output Directory* do
> projecto Vercel `golf-fpg` — o deploy de produção depende dela.

## ⚠ Deployment Storage do Vercel — o que entra no deploy (2026-09-06)

A Vercel avisou por email que o plano gratuito tinha chegado a **100% dos 10 GB
de Deployment Storage**. A causa não era tráfego: **cada deployment pesava
~9,1 GB**, por isso um único deployment enchia a conta — e os workflows de dados
fazem ~11 commits/dia, cada um a gerar outro.

Porquê: `output/` é ao mesmo tempo o `outDir` do Vite e a pasta onde o scraper
escreve. O Vercel clona o repo, o Vite copia `public/` (~1 GB) para lá, e o
Output Directory publicado passa a incluir **também as 697 pastas por federado
que estão em git** (8,1 GB). Estava tudo a ser servido publicamente — medido em
produção, `golf-fpg.vercel.app/52884/scorecards.json` devolvia 3,9 MB a quem o
pedisse, e a ficha de cada jogador obrigava o browser a descarregar **10 MB**.

Três correcções, por ordem de retorno:

| # | O quê | Ganho |
|---|---|---|
| 1 | `CROSS_DATA` extraído para `/data/cross-data.json` | −6,4 GB |
| 2 | Universo de jogadores reduzido de 673 para 179 | −5,6 GB |
| 3 | Intermédios do scraper fora do deployment | −0,8 GB |

Resultado medido: **9,1 GB → 1,10 GB por deployment**, e a ficha de um jogador
de 10,2 MB → ~1 MB.

### 1. `CROSS_DATA` vive agora em `/data/cross-data.json`

O `CROSS_DATA` é uma tabela indexada por federado — a MESMA para toda a gente —
e vinha embutida em cada `output/{fed}/analysis/data.json`: 9,4 MB × 678
ficheiros = 6,4 GB, com cada cópia parada num instante diferente (554 de 673
entradas iguais entre dois ficheiros; as outras eram só staleness).

- **Escrita:** `scripts/make-scorecards-ui.js` → `writeCrossData()`, uma vez por
  run (o `crossStats` é sempre calculado sobre TODOS os jogadores descobertos em
  `output/`, mesmo em runs incrementais).
- **Leitura:** `src/data/playerDataLoader.ts` → `loadCrossData()`, um `fetch`
  partilhado e cacheado; pedido em paralelo com o `data.json`, por isso só a
  primeira ficha aberta é que o paga.
- **Retrocompatível:** um `data.json` que ainda traga `CROSS_DATA` embutido
  ganha prioridade sobre o ficheiro partilhado.

⚠ Não voltar a pôr `CROSS_DATA` dentro do `data.json` — é a duplicação O(n²) que
encheu o Deployment Storage.

### 2. `scripts/prune-player-scope.js` — o universo seguido

Reduz `players.json` + as pastas `output/{fed}/` a quem é relevante para o
percurso do Manuel. Regra decidida em 2026-09-06 (constantes no topo do script):

| | Tecto de índice |
|---|---|
| Sub-10 | ≤ 36 |
| Sub-12 | ≤ 25 |
| Sub-14 | ≤ 15 |
| Sub-16 | ≤ 10 |
| Sub-18 | ≤ 5 |

Mais, sempre e independentemente do índice: o Manuel, a **coorte dos 18** de
`build-percurso-path.js` (sem ela a `/analise-percurso-juniores` fica sem
dados) e quem tem tag `PJA` ou `inscrito-nacional`. Sai quem for adulto sem
essas tags, quem não jogou no ano corrente, e quem está acima do tecto ou sem
índice estabelecido (≥54).

Primeira passagem: 673 → **179 jogadores**, 518 pastas apagadas (24 delas órfãs,
sem entrada em `players.json`). Lista dos removidos em
`data-archive/players-removidos-2026-09-06.json` (fora de `public/`, não vai
para o deploy).

⚠ **Não é perda de dados** — vêm todos da FPG. Repor um jogador é voltar a
pô-lo no `players.json` e correr `node scripts/fpg-scrape-node.js <fed> --full`.
⚠ **Custo real:** as páginas derivadas das voltas dos nossos (`/campos` →
"quem jogou este campo", `/torneios-recentes`, comparação entre jogadores)
passam a cobrir 179 jogadores em vez de 673.

### 3. `scripts/prune-deploy-output.js` — o que NÃO vai para o deploy

Corre a seguir ao `vite build` (está no `npm run build`) e **só quando `VERCEL`
está definido** — em local apagaria ficheiros de que o `pipeline.js` precisa e
que estão em git. Remove do Output Directory o que a app nunca pede:
`output/*/{whs.json,whs-list.json,scorecards.json,summary.json,scorecards/}` e
as caches à raiz. A app só lê `/{fed}/analysis/data.json`.

⚠ Se um dia a app passar a ler outro ficheiro por federado, **acrescentá-lo à
excepção** — senão passa a dar 404 em produção e funciona em local.

### O que continua por fazer

- **Apagar deployments antigos no Vercel** — nada disto encolhe os que já
  existem; a conta só desce quando forem apagados (dashboard → Deployments, ou
  `DELETE /v13/deployments/{id}`).
- `public/data/` são ~1 GB e é agora quase todo o deployment. Os pesos: 
  `ffgolf-resultats` 168 MB, `nextcaddy` 92 MB, `juniors-tournaments-0{0,1}` 94 MB,
  `uskids-member-history-slim` 40 MB, `juniors.json` 40 MB. O `nextcaddy` e o
  `rfegolf-livegolfscoring` (38 MB) **não são pedidos por nenhum `fetch` do
  `src/`** — são entradas dos builders; podem seguir o caminho do
  `data-archive/` quando houver tempo para confirmar.

### Páginas (lazy-loaded)

| Rota | Página | Dados |
|------|--------|-------|
| `/jogadores` | JogadoresListPage | federados.json + métricas (landing de /jogadores, tabela tipo FederatedsList) |
| `/jogadores/:fed` | JogadoresPage | data.json por jogador, player-stats.json |
| `/jogadores-por-ano` | JogadoresPorAnoPage | players/federados por coorte de ano de nascimento (utilidade, fora da NavBar) |
| `/torneios-recentes` (+ `/:key`) | RecentTournamentsPage | recent-tournaments.json — torneios recentes reconstruídos das voltas WHS dos nossos jogadores (utilidade, fora da NavBar); detalhe reutiliza `TournamentDetail` |
| `/campos/:courseKey?` | CamposPage | master-courses.json, away-courses.json, extraCourses.ts, course-players.json, {MANUEL}/analysis/data.json (tab "Como jogou") |
| `/uskids` | USKIDSPage | uskids-results.json, uskids_torneios_completos(1-40).json, uskids-field.json |
| — (`/kids` e `/kids-legacy` → redirect `/kids2`) | KIDSPage REMOVIDA 2026-08-06 (sunset — ver "Páginas legadas") | — |
| `/kids2` (+ `/scout/:tid`, `/inscricoes`, `/ranking/:year`, `/:juniorId`, `/next-t`) | KIDS2Page | rebuild canonical-first do tracker de rivais; sub-rotas em `src/pages/kids2/` |
| `/FPG` (`/diversos` → redirect `/FPG`) | FPGPage | pull-torneiosNNN.json |
| `/drive` | DrivePage | drive-data.json, aquapor-data.json |
| — (`/bjgt` e `/bjgt-legacy` → redirect `/major`) | BJGTPage.tsx é MÓDULO de dados (URLS, loadT, bjgtMajorDivision, FStats/HoleDiff/ManuelDay) consumido pela MajorPage — UI standalone removida 2026-07-02 | bjgt_*.json, wjgc_*.json |
| `/bjgt-analysis/:fed?` | BJGTAnalysisPage | data.json por jogador |
| `/major` (+ `/:source/:year`) | MajorPage | funde Doral + BJGT/EOWAGR no CircuitShell, agrupado por série/ano |
| — (`/doral` e `/doral-legacy` → redirect `/major`) | DORALPage.tsx é MÓDULO de dados (DATA_FILES, normalizeFile, doralMajorDivision) consumido pela MajorPage — UI standalone removida 2026-07-02 | ftm_doral_*.json |
| `/comparar` | ComparePage (3 tabs: Campos, Vantagem de Tee, Jogadores; tab Jogadores delega em CompararPage) | master-courses, players.json, {MANUEL}/analysis/data.json |
| `/simulador` | SimuladorPage | simCourses (master), players.json, {fed}/analysis/data.json (selector de jogador + "E se?") |
| `/calendario` | CalendarioPage | — |
| `/draws` | DrawsPage | manuel-pairings.json (jogadores com quem o Manuel já foi parelhado, FPG + USKids) |
| `/titulos` (+ `/:tab`) | TitulosPage | vista histórica de campeonatos de jovens FPG (3 tabs) |
| `/titulos/nacional` | TitulosPage (tab Nacional) | fpg-nacionais-historico.json (Campeões Nacionais Sub-10→18, 2005-2026; reusa JovensAnaliseView) |
| `/ffg` (+ `/info/:key` — `joueurs` = lista de jogadores FR estilo /rfeg/info/jugadores, `categorias`) | FFGPage | ffgolf-catalog.json + ffgolf/{year}_{slug}.json (torneios juvenis franceses); france-players.json (roster c/ contagens, `src/pages/ffg/PlayersView.tsx`) |
| `/rfeg` (+ `/:compId`, `/:source/:id`) | RFEGPage | rfegolf-* + livegolfscoring + nextcaddy + fcg (torneios juvenis espanhóis) |
| `/england` | EnglandGolfPage | england-golf-catalog.json + england_{slug}.json (England Golf / GolfGenius) |
| `/global-junior` (+ `/:slug`) | GlobalJuniorPage | gjgl-catalog.json + gjgl/gjgl_{slug}.json (Global Junior Golf Live) |

> **Páginas legadas** — `/bjgt-legacy` e `/doral-legacy` foram **removidas** 2026-07-02 (redirect → `/major`, que tem paridade total via CircuitShell; BJGTPage.tsx/DORALPage.tsx sobrevivem como módulos de dados+componentes ricos consumidos pela MajorPage). **`/kids-legacy` (KIDSPage) foi REMOVIDA em 2026-08-06** (sunset; redirect → `/kids2`). As 4 funcionalidades que bloqueavam o sunset resolveram-se assim: **(1)** tabela H2H detalhada → o `kids2/components/MatchupVsManuel.tsx` foi elevado à paridade (±par por lado, coluna Resultado c/ tinte, Dif. em ±par, médias de posição; e corrigidos 2 bugs: `totalGross ?? 0` a poluir médias e confrontos perdidos quando um jogador está em 2 flights do mesmo torneio, caso England cross-trophy); **(2-4)** Previsão WHS, Course Tab e Scorecards históricos NUNCA foram exclusivas — vivem no `kids/FieldRivaisDashboard.tsx`, que o kids2 renderiza em `/kids2/next-t` (tabs `?tab=previsao|campo|scorecards`). Apagados: `KIDSPage.tsx` + cadeia legacy-only (`kids/RivalDetail`, `RivalCharts`, `H2HSortableTable`, `RivaisSidebar`, `AnaliseSection`, `MemberHistTable`, `TournScorecard`, `courseScorecards`, `dobInference`, `tournDef`, `types`). **Mantêm-se** em `src/pages/kids/`: `FieldRivaisDashboard.tsx` + `CourseTab`/`PrevisaoTab`/`previsaoModel`/`HistoricScorecardsTab` (partilhados com o kids2). O array manual `D` da KIDSPage morreu com ela (a armadilha D vs TG_D ficou resolvida).
>
> **⚠ `ScotlandPage.tsx` (Junior Tour Scotland) está COMPLETA mas deliberadamente NÃO ligada às rotas** — página de circuito de 363 linhas (como England/FFG/RFEG), com scraper `scrape-junior-tour-scotland.js` e dados `scotland-jts-*.json`, mas sem `import`/`<Route>` no `App.tsx`. **Decisão 2026-07-02: os dados actuais NÃO são úteis/fiáveis — só ligar a rota quando houver uma fonte de dados boa e fiável.** Até lá fica desligada de propósito; não é bug.
>
> **`NacionaisJovensPage.tsx` foi REMOVIDA em 2026-07-02** (era código morto: lazy-importada sem `<Route>`). A funcionalidade vive na tab **`/titulos/nacional`** (`TitulosPage`), que reusa o mesmo `JovensAnaliseView` com os mesmos dados. A secção "Página `/nacionais-jovens`" mais abaixo descreve o pipeline de dados (continua válido) mas a página/rota já não existem.

## JogadoresPage — arquitectura pós-refactor (2026-08-15)

A `/jogadores/:fed` deixou de ser um monólito de ~4700 linhas: o shell
(`src/pages/JogadoresPage.tsx`, ~500 linhas) compõe módulos em
`src/pages/jogadores/`:

- **`filterPlayers.ts`** — filtragem/ordenação PURA da sidebar (testada em
  `__tests__/filterPlayers.test.ts`): pesquisa multi-palavra com índice
  pré-calculado (`buildSearchIndex`), seniores ocultos por defeito, pin
  (`PIN_RANK`), cadeia de contagem de rondas, `HCP_UNESTABLISHED_THRESHOLD=54`.
- **`filtersUrl.ts`** — codec filtros↔query (`?q&esc&sexo&regiao&nac&clube&
  hmin&hmax&activos&fonte&novos&pp&ord&dir&modo&stats`). FILTROS vivem no URL
  (partilháveis, replace-only, só não-defaults, preserva `?view=`);
  PREFERÊNCIAS (viewMode, 👴 seniores, ⭐ destaques) em localStorage
  (`jogadores_prefs_v1`). Seleccionar jogador preserva a query e apaga só
  `?view=` (análogo do `?tab=` da FPGPage).
- **`JogadoresToolbar.tsx`** — linha 1 magra (padrão FPG/Drive: DataSourcesChip,
  segmented Nossos/TODOS + Lista|📊 Stats, pesquisa 🔎+×, pills de escalão +
  presets rotulados 🧒/🟢/🏌️, ⚙️ Filtros com badge, ⓘ Info select) + painel
  colapsável (selects raros, HCP DO/AO, Ordenar, ToggleChips de preferências).
  `FilterField`/`ToggleChip` são partilhados com a landing via `src/ui/FilterField.tsx`.
- **`PlayerDetail.tsx`** — vistas consolidadas 5→3 no dropdown: 🗓 Rondas
  (segmented Data|Torneio) · ⛳ Campos (SEMPRE a análise rica — o modo simples
  e a TeeSummaryTable morreram, o Eclético cobre) · 📊 Análises. Deep-links
  legados `?view=by_tournament`/`by_course_analysis` continuam válidos.
- **Dois mundos deliberados**: `PlayerDetail` (análise local) e
  `FederadoOnlyDetail` (cadastro + WHS live) mantêm-se separados mas partilham
  `IdentityPills`, `eventInfo` (effectivePill/OriginPill/EventInfo),
  `FederadoRoundsTable` e as células de `ui/tableCells`.
- Stats: `FederadosStatsPanel` (+`computeGlobalStats`), `FilteredStatsCard`,
  `hcpBins.ts` (`isCountableHcp` exclui placeholders ≥54/99 em TODOS os
  painéis), `statsWidgets.tsx` (KpiCard/MFBar/MFColumn/MFLegend).
- Perf: `PlayerSidebarItem` é `React.memo` com `onSelect` estável; contagens
  da toolbar memoizadas no shell; batch de scorecards live com tecto 250.

## Comandos

```bash
npm run dev       # servidor local Vite
npm run build     # build de produção
npm test          # correr testes (vitest)
npm run preview   # preview do build
npm run scrape    # pipeline completo (golf-all.js)
npm run login     # login FPG (gera sessão)
```

## ⚠ Conflitos de git nos ficheiros GERADOS — regenerar, nunca fundir

Os workflows regeneram e committam os mesmos ficheiros que nós geramos em
local, por isso um `git pull` depois de um push nosso dá conflito quase sempre
**nestes quatro**:

| Ficheiro | Regenerar com |
|---|---|
| `public/data/major-catalog.json` | `node scripts/build-major-catalog.js` |
| `public/analise-percurso-juniores.html` (blocos `const P` e `const PATH`) | `node scripts/build-analise-percurso.js && node scripts/build-percurso-path.js` |
| `public/data/juniors.json` · `juniors-tournaments*.json` · `tournament-catalog.json` | `node scripts/aggregator/index.js` |

São **output de scripts, não fonte**: nenhum dos lados do conflito está certo
(são builds de instantes diferentes) e fundir à mão só produz lixo. Resolução:

```bash
git checkout --theirs public/data/major-catalog.json public/data/juniors.json public/data/juniors-tournaments.json public/data/tournament-catalog.json
node scripts/build-major-catalog.js && node scripts/aggregator/index.js
git add public/data/major-catalog.json public/data/juniors*.json public/data/tournament-catalog.json && git commit
```

⚠ **Deixar o conflito por resolver parte a app inteira**, não só o ficheiro: os
marcadores `<<<<<<<` tornam o JSON inválido e, como a `/major` lê a lista
lateral SÓ do `major-catalog.json` (lazy-load desde 2026-07-06), a página fica
sem torneios nenhuns. Aconteceu a 2026-07-23.

## IDs importantes

| O quê | Valor |
|-------|-------|
| Manuel — FPG nfed | `52884` |
| Manuel — USKids playerID (actual) | `630106` |
| Manuel — USKids playerID (legacy 2023) | `605933` — validado 2026-05-13. Conta abandonada: única aparição no El Prat 2023 Boys 9 (gross 44, place 3). **Nome USKids antigo:** "Manuel Francisco Goulartt De Medeiros". Ambos os IDs estão em `MANUEL_PLAYER_IDS` em `src/constants/manuel.ts`. |
| Manuel — USKids accountUID | `762810` |
| Manuel — DOB | `29/04/2014` (MANUEL_BIRTH_YEAR = 2014) |
| TORNEIOS_COMPLETOS_COUNT | `40` (constante em USKIDSPage.tsx — atualizar ao adicionar completos; espelhar em KIDSdataLoader.ts) |
| Signupanytime ax — intl | `1129` |
| Signupanytime ax — Marco Simone 2025 | `2739` |
| Signupanytime ax — El Prat | `2760` |
| Servidor local (update-jogadores/torneios — LEGADO, em `scripts/_archive/browser-console/`) | `:3456` |

---

## KIDSdataLoader — Arquitectura do loader de rivais

O `KIDSdataLoader.ts` era o loader central da KIDSPage (removida 2026-08-06); hoje o consumidor principal é o `kids2/NextTournaments.tsx` (`buildAutoRivals` → `FieldRivaisDashboard`). Exporta `buildAutoRivals()`, `normName()`, `getScorecards()`, `uskTournNames` (Map) e `uskFieldSizes` (Map).

### 3 Fases de carregamento

**Fase 1 — Paralelo (core tasks):**
Carrega em paralelo todos estes ficheiros, processando cada um com a função adequada:
- `wjgc_*.json`, `eowagr*.json` → `processWjgc(d, tid)`
- `ftm_doral_*.json` → `processDoral(d)`
- `uskids-results.json` → `processUskids(d)`
- `uskids_torneios_completos(1-40).json` → `processUskidsCompleto(d)` (suporta formato v1 e v2)
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

## Agregador de juniores (kids2) — fontes e regras (2026-07-02)

`scripts/aggregator/index.js` orquestra os adapters de `scripts/aggregator/sources/`
e escreve `public/data/{juniors,juniors-tournaments*,tournament-catalog}.json`
(consumidos pelo `KIDS2Page`). Corre no `build-juniors.yml` (push nos paths de
input + workflow_dispatch). ~30.2k juniores / ~20.8k torneios.

### Fontes (11 adapters)

| Adapter | Lê | Tipo |
|---|---|---|
| `uskids` | member-history-slim + results + completos | **forte** (memberId) |
| `fpg` | players.json + pull-torneios (whitelist: Nacionais/PJA/GG/QDL/Finais Drive; **Drive/Aquapor regionais excluídos por design**) | **forte** (fed) |
| `rfeg` | spain-players.json (roster) + rfegolf-rivals.json | **forte** (licencia) |
| `ffgolf` | france-players.json + ffgolf-juniors-slim.json | **forte** (lic) |
| `eowagr` / `wjgc` / `doral` / `fm` | eowagr*/wjgc_*+bjgt_*/ftm_doral_*/ftm_fm_* | fracas (nome+país) |
| `fcg` (2026-07-02) | fcg-rivals.json (Catalunha, golfdirecto) | fraca (nome+**dob** ~58%) |
| `england` (2026-07-02) | england_{slug}*.json | fraca (nome+país; memberIds GG são por-torneio) |
| `gjgl` (2026-07-02) | gjgl/gjgl_*.json (exclui U23) | fraca (nome+país + dobRange do birthYearEst) |

⚠ **FCG NÃO pode ir dentro do sourceId `rfeg`**: as licenças catalãs (ex:
`CB35994870`) vivem noutro keyspace — um miúdo com licença RFEG (roster) + FCG
seria 2 entidades "fortes" da mesma fonte e o identity-matcher RECUSA o merge
(invariante de 1 chave forte por fonte). Como fonte fraca separada, funde por
nome+DOB.

⚠ **O slim FFG não filtra pelo escalão da PROVA** (corrigido 2026-08-19). O
`build-ffgolf-juniors-slim.js` só deixava passar séries U10/U12/U14 e ainda
cortava provas cujos miúdos "já teriam >15 hoje" (`MAX_AGE_TODAY`) — confundia a
idade do JOGADOR com o escalão da PROVA. Um miúdo pode inscrever-se acima do
escalão dele (nunca abaixo): o Ricardo Castro-Ferreira (PT, fed 49085, n. 2015)
jogou a "2e Division B U16 Garçons" de 2026 com 11 anos e a prova nunca chegava
ao kids2. Como o corpus do `scrape-ffgolf-all-jeunes.js` já é 100% juvenil, o
slim guarda agora TODAS as séries (escalões U10→U18 + `ageGroup: null` quando
desconhecido): 1129 → 2034 séries, 6,4 → 11,7 MB, +12.1k participações de 2.6k
juniores que já eram entidades canónicas. **Regra:** se o jogador já existe no
corpus, todos os resultados dele devem entrar — filtra-se pela idade do miúdo,
nunca pelo nome do escalão da prova.

### Regras do identity-matcher que os adapters têm de respeitar

- **Resultados só contam se o adapter também declarar o jogador em `players[]`**
  — `playerSourceKey` sem entidade correspondente é descartado em silêncio.
- Chaves `anon|{normname}` são tratadas como fracas mesmo em fontes fortes
  (vão para `sources._secondary` como `{sid}-anon`).
- Juniores sem nenhum torneio agregado são dropped (`droppedNoTourn`).

### rfegolf-rivals.json — 3 fontes espanholas num só ficheiro

`scripts/build-rfegolf-rivals.js` consolida: **lgs** (LiveGolfScoring),
**nc{id}_{cat}** (NextCaddy) e **rfeg{compId}_{cat}_{sexo}** (microsite
rfegolf.es — blocos de `results` dos `rfegolf-resultats/*.json`, incl. blocos
mitarjeta com lic+dob+club+holeScores). Dedup de gémeos via
`rfegolf-lgs-twins.json`: compIds em `twins` são saltados (versão LGS ganha) e
lgsIds em `lgsSuppressed` são removidos (versão mitarjeta, mais rica, ganha).
⚠ **No `update-spain.yml`, `build-lgs-twins.js` corre ANTES de
`build-rfegolf-rivals.js`** — inverter a ordem faria o rivals usar twins do run
anterior.

O adapter `rfeg` resolve resultados **sem licença** (todo o LGS + blocos
nativos do microsite) por lookup de nome normalizado contra `spain.byName`
(nomes ambíguos ficam fora), com fallback `anon|`. Sem isto, os torneios LGS
existiam no kids2 mas não creditavam nenhum jogador. Jogadores vistos em
resultados mas fora do roster ganham RawPlayer próprio (com dob/club quando o
mitarjeta os traz).

### UI kids2 — checklist ao adicionar uma fonte

1. `Kids2SourceKey` + `SOURCE_PILLS` em `KIDS2Page.tsx` e `SourceKey` em `kids2/Sidebar.tsx` (o filtro para fontes fracas funciona via `tournament.sourceId`, sem mais código).
2. Token `--source-{id}` em `tokens.css` + `SOURCE_COLORS`/`SOURCE_LABELS` no `kids2/components/EvolutionChart.tsx`.
3. Matcher de domínio em `kids2/tournamentLinks.ts` (nota: `eg-*.golfgenius.com` → england tem de vir ANTES do matcher genérico `golfgenius.com` → doral).
4. Paths de trigger no `build-juniors.yml`.
5. Sanity: Manuel×Dmitrii = **7 confrontos** (EC26, Venice25, Venice26, QDL25, EOWAGR LTQ25, WJGC25, WJGC26).

### Limpeza de duplicados — `scripts/find-junior-duplicates.js` (2026-07-08)

**Limpeza de nomes no intake do matcher (2026-07-09):** `stripDupAbbrev()`
(`aggregator/util/names.js`) conserta nomes corrompidos "Jessica WangJ. Wang"
(EGR/BlueGolf colam nome completo + abreviatura na célula) antes do matching E
do display; o `normName` do agregador remove anotações entre parênteses
("(IRE)", "(AJ)", "(jr)") só para matching. Sem isto havia ~185 entidades
fantasma que nenhum merge apanhava.

O matcher é conservador de propósito, por isso sobram duplicados no canónico:
mesmo miúdo federado em 2 países (país difere → matcher recusa), nome abreviado
("J. Smith"), só 1 dos sobrenomes ("Tomás Silva" vs "Tomás Costa Silva"), nome
invertido ("Ziyang Guo" vs "Guo Ziyang"). O detector lê `juniors.json` +
shards de torneios e gera pares candidatos com score/evidência.

Sinais positivos: relação de nome (exacto/invertido/subset/inicial/prefixo/
sobrenome parcial) + mesma DOB (+35) + mesmo país (+10) + mesmo clube (+12) +
**sufixo RFEG igual** (+30 — mudar de clube muda o prefixo da licença mas os
últimos 6 dígitos mantêm-se, ex: LV60968059↔LV70968059; gera `preferStrongKey`
+ `manualHistoricalIds` automáticos no snippet) + **nome raro** (+15,
2026-07-09 — nome exacto/invertido cujo multiset de tokens só existe nas 2
entidades do par em TODO o corpus E com ≥1 token raro, visto em ≤3 juniores,
ex: "Bernardini"; um "João Silva" que por acaso só aparece 2× NÃO conta porque
os tokens são comuns). Com DOB igual OU nome raro, país diferente NÃO penaliza
(é o caso multi-país/2-bandeiras que procuramos: miúdos com pais de
nacionalidades diferentes escolhem a bandeira consoante o torneio — caso
Victor Bernardini FR↔BE, fundido nessa passagem). Sinais negativos/kill: sexo
diferente, DOB exacta diferente, **escalão impossível** (dos flights jogados —
ageMax + ano — infere-se o ano de nascimento mínimo; jogar para cima é
permitido, para baixo não), e **co-ocorrência no mesmo flight do mesmo torneio**
(lado a lado na leaderboard → 2 pessoas; `--include-coplay` desactiva). Mesmo
torneio em flights diferentes = −15 + flag (irmãos?). Chaves fortes
conflituantes na mesma fonte sem sufixo RFEG igual = −25 + flag.

**Ambiguidade:** se um junior aparece em vários pares (ex: "Pablo Garcia" bate
com 3 nomes completos), todos os seus pares ficam marcados ambíguos → só
revisão manual, nunca auto-merge.

**Auto-merge (`--apply`):** candidatos com CERTEZA (nome exacto/invertido/
contido + mesma DOB, ou sufixo RFEG igual, ou **nome raro** — este último nunca
em pares ambíguos) ou corroborados (mesmo clube/país + score ≥ `--merge-min`,
default 55), sem ambiguidade nem flags, são acrescentados ao `forceMerge` do
`juniors-overrides.json` com `"auto": true`. Primeira passagem 2026-07-08: 221
merges aplicados (17195→16952 juniores), 9/9 sanity. Segunda passagem
2026-07-09 (com nome raro, pós-EGR): 208 merges (22373→22165), 9/9 sanity.

```bash
node scripts/find-junior-duplicates.js                # relatório (score ≥45)
node scripts/find-junior-duplicates.js --apply        # aplicar merges seguros
node scripts/find-junior-duplicates.js --player gao   # filtrar por nome
```

Outputs: `reports/duplicate-candidates.{json,html}` + `proposed-merges.json`
(gitignored). O HTML é o fluxo de revisão dos restantes: cada card tem 2
snippets prontos a copiar — ✅ mesma pessoa → `forceMerge`; ❌ pessoas
diferentes → **`notDuplicates`** (lista no `juniors-overrides.json`, formato
`{sourceKeys:[a,b], reason}`) que suprime a sugestão em runs futuros **e, desde
2026-08-14, é também um VETO no identity-matcher** (o `tryUnion` recusa juntar
grupos que ponham um par listado na mesma entidade; `forceMerge` explícito
continua a ganhar) — usado para desfazer fusões automáticas de homónimos, ex:
o "Luis Maier" do Doral ≠ Luis Maier DE do USKids (confirmado pelo próprio:
há 3 miúdos DE com este nome no mesmo escalão). Ciclo:
`aggregator/index.js` → detector → rever HTML → colar overrides → repetir.
Pares já cobertos por `forceMerge`/`notDuplicates` nunca são re-sugeridos.
Testes: `scripts/find-junior-duplicates.test.js` (vitest apanha
`scripts/**/*.test.js`).

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

### ⚠ As cookies duram ~9 HORAS, não uma semana (2026-08-30)

Sempre se assumiu "validade típica ~1 semana" (ver "Cenário 1" mais abaixo).
Medido num dia inteiro, com o log do `run-cookie-refresh.bat` a datar a
captura:

| Hora UTC | Estado das MESMAS cookies |
|---|---|
| 09:33 | capturadas e validadas nos 3 hosts (`TotalRecordCount=84986`) |
| 18:14 | ✅ ainda autenticam |
| 19:14 | ❌ mortas (o `cookie-health` testou o próprio Secret) |
| 22:07 | ❌ mortas (ficheiro do repo, mesmo valor) |

⚠ **E o refresh não cobria os scrapes.** A Scheduled Task corria só ao
meio-dia; a janela de scrapes do fim-de-semana começa 9h depois:

| | Local | UTC | Após o refresh |
|---|---|---|---|
| refresh | 12:00 | 11:00 | — |
| `update-fpg-admissions-draws` | 21:00 | 20:00 | **+9h** |
| `update-drive` | 22:00 | 21:00 | **+10h** |
| `update-jovens` | 22:20 | 21:20 | **+10h20** |
| `update-classif` | 02:00 | 01:00 | **+14h** |

Era isto que estava por trás dos "cookies expiraram" recorrentes ao
fim-de-semana — não eram cookies frágeis nem Secrets por actualizar (o log
prova `gh secret set … exit=0` nos quatro), era o refresh a acabar antes de
os scrapes começarem. O `setup-cookie-refresh-task.ps1` passou a registar um
**segundo refresh diário às 19:30 local**, ~1h30 antes do primeiro scrape. A
guarda de dedup do `.bat` é de 4h e o intervalo é de 7h30, por isso corre.

⚠ Só tem efeito depois de **re-correr o `setup-cookie-refresh-task.ps1` como
administrador** — editar o script não mexe na tarefa já registada.

⚠ **A Scheduled Task vive NOUTRO computador** (2026-08-30) — o refresh
automático não corre no PC de trabalho. Consequências: (1) re-correr o
`setup-cookie-refresh-task.ps1` só tem efeito na máquina onde a tarefa está
registada, e essa precisa de `git pull` primeiro (o gatilho das 19:30 entrou em
`71e6f2a33`); (2) com mais do que um PC a refrescar, o push para os Secrets
passou a ser **condicionado à validação de cada host** — antes o
`run-cookie-refresh.bat` escrevia os 4 Secrets desde que o `gh` estivesse
autenticado, sem olhar aos `FPG_EXIT`/`DG_EXIT` (que só serviam para a
notificação e para a cascata dos federados). Um refresh falhado num PC
secundário apagava assim as cookies boas que o principal tinha acabado de pôr,
e o log dizia `exit=0` na mesma — porque esse `exit` é do `gh`, não da
validação. Agora: `FPG_COOKIES` exige `FPG_EXIT=0`, os dois `DATAGOLF_*` exigem
`DG_EXIT=0`, e o `FPG_ADMISSIONS_COOKIES` (que não tem teste local próprio)
exige `REFRESH_EXIT=0`, para um refresh parcial não o carimbar.

### ⚠ HTTP 500 da FPG NÃO é prova de cookie expirado (2026-08-30)

O ASP.NET da FPG explode em vez de devolver 401, por isso sempre lemos 500 como
"cookies mortos" (está assim no `lib/fpg-http.js` e em várias secções abaixo).
Na maioria das vezes acerta — mas a 30-08-2026 mediu-se o contrário e a
heurística mandou fazer trabalho inútil:

| Hora (UTC) | Facto |
|---|---|
| 10:40 | cookies dos 3 sites refrescados (commit `1831dd0bc`) |
| 17:21 | `update-drive` morre com HTTP 500 na `TournamentsLST` |
| 17:26 | `cookie-health` dá 2 dos 3 secrets por **expirados** |
| 17:5x | os **mesmos** cookies, à mão, dão o mesmo 500 — e o `1PreparePage.aspx`, um entry gate **sem credencial nenhuma**, dá 500 também |

Não eram os cookies: as aplicações ASP.NET `scoring.datagolf.pt/pt` e
`scoring.fpg.pt/lists` estavam a arder. O `my.fpg.pt` (outro backend) estava de
pé, e o ASP clássico (`scoring-pt.datagolf.pt/scripts/draw.asp`) também.

**A avaria acabou por si**, às ~18:10 UTC, sem ninguém mexer em nada: às 18:14
o `scoring.datagolf.pt` voltou a responder com os mesmos cookies. Foram ~9h.

⚠ **Não há forma fiável de distinguir as duas causas de fora.** A primeira
versão do `fpg-liveness.js` usava o `linkpage.aspx?page=admissions` **sem
cookies** como controlo, a assumir que respondia 200 com o serviço de pé. Não
responde: às 18:15, com a FPG recuperada e o scrape do Drive a correr bem, esse
controlo continuava a dar 500. Como controlo era pior do que nenhum —
mascararia cookies mesmo mortos como "não é connosco".

O que ficou (`scripts/lib/fpg-liveness.js`, 9 testes) é modesto de propósito:
uma sonda de **alcançabilidade** (`linkpage.aspx?page=draw`, a única rota
medida de pé com e sem avaria; não apodrece, um torneio inexistente devolve 200
na mesma) e um veredicto de três estados:

| veredicto | quando | exit | efeito |
|---|---|---|---|
| `fonte-em-baixo` | a FPG nem responde na rota pública | **3** | `cookie-health` regista e não falha; `update-drive` não pinta o cron de vermelho |
| `indeterminado` | a FPG responde mas o nosso 500 não se explica | **2** | o alarme TOCA à mesma — calá-lo por dúvida esconderia cookies mortos |
| `ok` | autenticou | 0 | — |

A mensagem do `indeterminado` manda **confirmar no browser antes de
refrescar** — foi o que resolveu este caso: a utilizadora abriu o linkpage e
funcionava, o que provou que o problema não eram os cookies.

### ✅ As cookies NÃO são precisas para os resultados — `scripts/lib/fpg-session.js`

**Confirmado 2026-08-30, com o serviço estável** (a 1ª medição, às 18:09,
apanhou a janela de recuperação e não provava nada; esta isolou o mecanismo).
O gateway `scoring.fpg.pt/lists/linkpage.aspx` (ack universal) **emite ele
próprio** `ASP.NET_SessionId` + `DG_Lists_URL` a quem chega sem credenciais.
Medido no mesmo minuto, mesmo URL:

| | resultado |
|---|---|
| **com** cookie jar (aceita a sessão) | **4/4 OK** — página 200, ClassifLST OK (18), ScoreCard OK |
| **sem** jar | **3/3 → HTTP 500** Runtime Error |
| POST directo sem sessão | `Result:ERROR — Object reference not set to an instance of an object` |

Aquele *"Object reference..."* é a cara do 500 que se lia como "cookies
expiraram". O que faltava era **aceitar** a sessão, não guardá-la.

⚠ **`fetch` com `redirect:"follow"` não chega.** O linkpage responde 302 e a
sessão é emitida NO CAMINHO; o fetch nativo não reenvia o `Set-Cookie` de um
hop para o seguinte, por isso o pedido final chega sem sessão. O `Sessao.get`
segue os redirects à mão, acumulando cookies.

**Cobertura: o pipeline INTEIRO, descoberta incluída.**

| Passo | Entrada pública (sem cookies) | PageMethod |
|---|---|---|
| Resultados de um torneio (leaderboard + scorecards) | `scoring.fpg.pt/lists/linkpage.aspx?page=classif&…&ack=8428ACK987` | `classif.aspx/ClassifLST` · `classifAgregate.aspx/ScoreCard` |
| **Descoberta** de torneios | `scoring-pt.datagolf.pt/scripts/tournaments.asp?club=ALL&ack=XH256YF45T` → `1PreparePage.aspx` | `tournaments.aspx/TournamentsLST` |

⚠ **A entrada da lista tem um hop em JavaScript.** O `tournaments.asp` responde
com o `datalinkpt.html`, que NÃO faz redirect HTTP: é o `DataGolfeRedirect` da
página que constrói a URL do `1PreparePage.aspx` e navega. Como não corremos
JS, reconstruímos essa URL (`criarSessaoLista`), incluindo o detalhe de o
`club=ALL` virar `ccode=All`. É o `1PreparePage.aspx` que emite a sessão.

⚠ **Chegou a dar-se a descoberta por impossível sem cookies — era erro de
método:** testou-se o `linkpage.aspx?page=tournlist` no host errado
(`scoring.fpg.pt/lists`, onde falha com os 3 acks) e o `1PreparePage.aspx`
*durante* a avaria da FPG, sem voltar a testar depois. Pelo caminho certo e com
a FPG de pé: `Result:OK`, **84 993 torneios**, com filtro por clube/data/nome.

⚠ **Duas sessões separadas, não uma.** O `DG_Lists_URL` guarda o CONTEXTO da
página; um POST ao `tournaments.aspx` reescreve-o e o `classif` a seguir perde
o seu (devolve `Result:ERROR` logo depois de um warmup bem sucedido). O
`scrape-classif-node.js` mantém `SESSAO` (classif) e `SESSAO_LISTA`
(descoberta) independentes.

### Quem já corre sem cookies (2026-08-30)

O gate `datalinkpt.html` lista as páginas públicas do portal — é o mapa do que
é alcançável. Medido uma a uma, e **só se portou o que passou**:

| Script | Workflow | Endpoint | Sem cookies |
|---|---|---|---|
| `scrape-classif-node.js` | update-classif | ClassifLST + ScoreCard | ✅ |
| `scrape-drive-node.js` | update-drive | TournamentsLST + ClassifLST + ScoreCard | ✅ |
| `scrape-jovens-node.js` | update-jovens | idem | ✅ |
| `scrape-federados-node.js` | update-federados | HandicapsLST (gate `fedlist_v2`) | ✅ 17 840 federados |
| `scrape-drive-rankings.js` | update-drive (Dom) | RankingsClassifLST (gate `rankingresult`) | ✅ 62 jog. no RDTN26 |
| `update-cgss-draw-results.js` | update-cgss-draw | ClassifLST + ScoreCard + TournamentsLST | ✅ **60 jog. / 54 scorecards** no 192/10023 |
| `scrape-fpg-admissions-draws-node.js` | update-fpg-admissions-draws | admissions | ❌ **fica com cookies** |
| `fpg-scrape-node.js` | update-data | my.fpg.pt (WHS) | ❌ exige login a sério |

⚠ **As admissions NÃO são fiavelmente públicas.** O mesmo gate serve
`000/10941` (página real de inscritos) e devolve `Param Error — Link address
inválido` (Err=400) em `987/10245`. Enquanto não se souber a regra, esse
scraper mantém-se autenticado — o `draw` continua público como sempre foi.

⚠ **A ordem foi INVERTIDA a 2026-08-30: público primeiro, cookies como
fallback.** A regra era "cookies primeiro, público quando falham" — o caminho
autenticado era o primário por ser o testado. Medido o dia inteiro, isso é o
avesso do que interessa: **a sessão pública não expira** (é emitida pelo ack a
cada pedido) e as cookies duram ~9h, morrendo sempre a meio da janela de
scrapes do fim-de-semana. Pôr o caminho perecível à frente do perene fazia com
que cada fim-de-semana dependesse de um refresh manual ter corrido nas horas
certas.

O fallback é **bidireccional**: se o gate público falhar (FPG em baixo, gate
mudado), ainda se tenta com cookies antes de desistir. Comuta no `criarRoteador`
de `fpg-session.js` e no `warmupLinkpage` do `scrape-classif-node.js`, os dois
com o mesmo interruptor de emergência:

| `FPG_AUTH_MODE` | Efeito |
|---|---|
| (não definido) / `auto` | **público primeiro**, cookies como fallback |
| `cookies` | ordem antiga (cookies primeiro) — sem mexer em código |
| `publico` | só público, nunca toca nas cookies |

Validado com o 987/10207 nos dois caminhos: **18 jogadores, 14 scorecards**,
ficheiros byte a byte idênticos. Testes: `scripts/lib/fpg-session-modo.test.js`
(6). O log diz sempre por onde foi (`[classif] sessão pública (ack, sem
credenciais)`).

⚠ **As admissions ficam de fora — e agora sabe-se porquê.** Medido a
2026-08-30 sobre os torneios que JÁ têm inscritos guardados no
`fpg-admissions-draws.json`: o gate público serve o `000/10941` (Nacional
Sub-12, 21 linhas) mas recusa **6 em 6** torneios de CLUBE que têm inscritos
(988/10306, 985/10236, 987/10245-48). Não é ausência de dados — esses têm
inscritos e a via autenticada trá-los. Cobertura nos nossos dados: FPG
(ccode 000) 84% com inscrições, clubes 43% (o resto são provas cujas
inscrições os clubes fazem por email e nunca chegam a publicar). Logo as
cookies compram mesmo alguma coisa aqui, e o `scrape-fpg-admissions-draws-node.js`
mantém-se autenticado.

⚠ **`redirect:"follow"` do fetch nativo perde a sessão** e mordeu em TRÊS
sítios (o `Sessao.get` segue os redirects à mão e é a correcção):
- o `scrape-federados-node.js` aquecia com `redirect:"follow"` e só lia o
  `Set-Cookie` da resposta FINAL — a sessão emitida no 302 do
  `1PreparePage.aspx` evaporava-se e o `HandicapsLST` vinha sem contexto
  (0 registos, salvos pela guarda anti-overwrite);
- o `scrape-drive-rankings.js` tinha o mesmo padrão no seu warmup;
- e foi por isto que, à primeira, se concluiu que a descoberta precisava de
  cookies.

⚠ Ao encaminhar chamadas por um wrapper, cuidado com o *find-and-replace*: a
substituição em massa de `dgPost(` apanhou também a chamada DENTRO do próprio
`dgPostSmart` e criou recursão infinita. O router tem de chamar o original.

⚠ Ao encaminhar chamadas por um wrapper, cuidado com o *find-and-replace*: a
substituição em massa de `dgPost(` apanhou também a chamada DENTRO do próprio
`dgPostSmart` e criou recursão infinita. O router tem de chamar o original.

Medido com o 987/10207 (Drive Tour Norte – Amarante) nos três cenários —
cookies boas, **sem cookies** e **cookies mortas**: os `drive-data-2026-08.json`
saem **byte a byte idênticos** (metadata, leaderboard, scorecards, par, metros,
CR/slope, tee e PCC). Verificado com os ficheiros de cookies
escondidos e as env vars limpas: **18 jogadores e 14 scorecards idênticos linha
a linha** aos da via autenticada, com metadata completa (nome, campo, data,
rondas, circuito).

⚠ **Três armadilhas neste caminho, todas com caso real:**
1. **HTTP 200 não é prova de sessão útil.** Sem cookies o linkpage do
   `scoring.datagolf.pt` devolve 200 na mesma e só o PageMethod a seguir
   rebenta — o warmup dava-se por bom e o fallback nunca corria. O teste é o
   CONTEÚDO (`parseMetaClassif(html).name`), não o `res.ok`.
2. **Os params extra vão na query string E no body** — o `ScoreCard` devolve
   500 se só forem num dos sítios (mesma armadilha do `my.fpg.pt`).
3. Uma variável de cor inexistente (`${C}`) num `console.log` **dentro do
   try** do fallback fazia o `catch` engolir tudo: a metadata já estava
   preenchida (o nome aparecia no log!) mas `SESSAO` ficava a null e o scrape
   caía no caminho autenticado sem cookies. Um throw cosmético a fingir-se de
   falha de rede.

⚠ O gémeo `scoring.datagolf.pt/pt` **não** emite sessão (500 mesmo com jar) —
continua a exigir o hash do `1EntryPage.aspx`.

## Scripts — FPG Pipeline

Dois modos: **Browser Console** (colar no F12 num site específico) e **Node.js Terminal** (correr em `C:\golf-fpg\scripts\`).

> **⚠ Reorganização 2026-06-23 — localização dos scripts da raiz.** A raiz já só
> contém `pipeline.js` (continua na raiz porque o `scripts/fpg-scrape-node.js` o
> invoca via `node pipeline.js --skip-import`). Os restantes scripts que estavam
> soltos na raiz foram movidos:
> - **Activos** (sem substituto Node-puro) → `scripts/`: `find-tcodes.js`, `uskids_scrape_courses - PERFEITO COM DISTANCIAS.js`.
> - **Legados** (browser-console / Playwright / servidor-local, todos substituídos pelos `*-node.js` da era 2026-04) → `scripts/_archive/browser-console/`: `scraper-headless.js`, `update-jogadores.js`, `update-torneios.js`, `fpg-download-whs-only.js`, `scrape-consola-inscritos-campeonato-nacional.js`, `pull-torneios.js`, `scrape-drive-aquapor-v7.js`.
>
> **Os "Fluxos" abaixo (browser console + login.js + pipeline.js manual) são LEGADOS.** O fluxo de produção actual é 100% Node-puro via GitHub Actions (ver "GitHub Actions — estado" e os scripts `fpg-scrape-node.js` / `scrape-drive-node.js` / `scrape-classif-node.js`). Mantidos como referência / fallback manual.

### Fluxo: Atualizar jogadores FPG (LEGADO — usar `fpg-scrape-node.js` + Actions)

1. `node scripts/login.js` → `session.json` (abre browser para login manual em `area.my.fpg.pt`)
2. Browser Console em `scoring.fpg.pt`: `scripts/_archive/browser-console/fpg-download-whs-only.js` → `fpg-whs-all.json` (alt. headless: `node scripts/_archive/browser-console/scraper-headless.js --players`)
3. `node pipeline.js --batch` → `output/{fed}/analysis/data.json`
4. `node scripts/enrich-players.js` → `player-stats.json`

### Fluxo: Atualizar torneios (DRIVE/AQUAPOR/pull) (LEGADO — usar `scrape-drive-node.js` + Actions)

1. Browser Console em `scoring.datagolf.pt`: `scripts/_archive/browser-console/scrape-drive-aquapor-v7.js` → `drive-data.json` + `aquapor-data.json`
2. Browser Console em `scoring.datagolf.pt`: `scripts/_archive/browser-console/pull-torneios.js` → `pull-torneiosNNN.json` (editar `POR_CODIGO` com ccode/tcode)
3. `node scripts/build-drive-sd-lookup.js` → `drive-sd-lookup.json`

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

**Parsers Node em `scripts/fpg-admissions-draw-parser.js`** — `parseAdmissions`
(tournAdmissions.aspx), `parseAdmissionsPt` (admissions.asp pública) e
`parseDraw`. Usados pelos testes (`npm test`); os scripts browser têm parsers
inline equivalentes.

⚠ **O `parseDraw` mapeia as colunas pelo CABEÇALHO da tabela** (2026-08-20). Os
torneios de clube publicam `Hora | Tee | cor | Jogador | Federado | Club/Equipa
| HCP Exacto | HCP Jogo`, os da FPG trocam Federado/HCP por `V1 | Total | To
PAR`. Sem ler o cabeçalho, três coisas partiam-se nos torneios de clube com
estrangeiros (caso real: 962/10084, 12 dos 20 não federados): o `-` da coluna
Federado era lido como CLUBE (e o país real desaparecia), o nome do torneio
ficava `null` (a regex exigia que a célula da direita começasse por "Federa…",
verdade só nos torneios da FPG — daí os 962/* aparecerem na UI como "Torneio
10084") e os flights de tees MISTOS perdiam o tee de quem não jogava o tee do
grupo. Agora cada jogador leva `tee` próprio quando difere do grupo, mais `hcp`
exacto; `campo` e `clube` saem do bloco de meta.

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

**login.js** (`scripts/login.js`, = `npm run login`) — Abre browser para login manual em `area.my.fpg.pt`. Depois navegar para `scoring.fpg.pt` e pressionar ENTER → guarda `session.json`.

**scraper-headless.js** (`scripts/_archive/browser-console/`) — **LEGADO** (substituído pelos `*-node.js`). Alternativa headless Playwright ao fluxo browser. Movido da raiz em 2026-06-23.
```bash
node scripts/_archive/browser-console/scraper-headless.js --tournaments
node scripts/_archive/browser-console/scraper-headless.js --players --feds 47078 52884
```

**update-jogadores.js / update-torneios.js** (`scripts/_archive/browser-console/`) — **LEGADO** (substituídos por `fpg-scrape-node.js` / `scrape-drive-node.js`). Servidor local (:3456) + script para colar no browser. Movidos da raiz em 2026-06-23.
```bash
node scripts/_archive/browser-console/update-jogadores.js --new
```
Depois no F12 do site correspondente: `fetch("http://localhost:3456/browser-script.js").then(r=>r.text()).then(eval)`

**scrape-drive-aquapor-v7.js** (`scripts/_archive/browser-console/`) — Colar no F12 de `scoring.datagolf.pt/pt/tournaments.aspx`. v7 fix: usa `classifAgregate.aspx/ScoreCard` (v6 tinha bug R1=R2). **Legacy** — substituído por `scrape-drive-node.js` (Node puro, correr em GitHub Actions). Movido da raiz para `scripts/_archive/browser-console/` em 2026-06-23.

### Rankings oficiais Drive/Aquapor — `scrape-drive-rankings.js` + `verify-drive-rankings.js` (2026-07-19)

O `RankingsClassifLST` (`scoring.fpg.pt/lists/rankings_classif.aspx`) publica os
rankings oficiais. **São QUATRO famílias de código, não uma** — e cada uma tem
regras próprias, todas medidas contra o oficial (não são suposições):

| Código | O que é | Clube | Regra |
|---|---|---|---|
| `DC_{ZONA4}{esc}{G\|N}{aa}` | Challenge, **fase regular** | 988 | melhores-4; **as Finais NÃO entram** |
| `RDT{M\|S\|T\|N\|A}{aa}` | Drive Tour por zona | 988 | melhores-N (3 ou 4) |
| `RFDC_{aa}{M\|N\|S\|T\|A\|C}{esc}{G\|N}` | Challenge, **ranking final** | 988 | total da fase regular **+ Final ×1.5** |
| `RCA{H\|S}{aa}` | Circuito Aquapor | **000** | nacional, **separado por sexo** |

- **Final ×1.5** (arredondado): 1º 250→375 · 2º 165→**248** · 3º 94→141 · 4º 75→**113**.
  A Final **Nacional** não entra em ranking regional nenhum.
- **Empates:** o Challenge/Tour desempata por **countback** (última volta →
  últimos 9 → 6 → 3 → 1 buraco — `scripts/lib/drive-countback.cjs`); o
  **Aquapor NÃO** — empatados partilham o lugar e **dividem os pontos**
  (2 no 14º → 22,5 cada; 3 no 12º → 24,3). O oficial publica 1 decimal.
- **Sentinelas:** gross ≥ 900 (999, 1044, 1080…) é "sem cartão" — não pontua
  nem ocupa lugar. Contá-las dava pontos a quem a FPG não pontua.
- **Aquapor ≠ gross puro no leaderboard guardado:** o `pos` dos
  `aquapor-data-*.json` é do leaderboard combinado M+F; o ranking usa a posição
  **dentro do sexo** (sexo via `federados.json.gender`, com os próprios rankings
  como fonte primária para estrangeiros). Por isso o `scrape-drive-node.js`
  **não recalcula posições no Aquapor** — lá a classificação não é por gross.
- **Desfasamento:** o verify ignora provas nossas posteriores à última prova
  publicada no oficial (senão um torneio de ontem gera dezenas de falsos
  positivos).

`--details` é **incremental** (só refaz o detalhe de quem mudou de pontos);
`--force-details` ignora a cache. Estado 2026-07-19: **71 rankings iguais, 1
divergente** — o RDTN26, por causa do 3º Drive Tour Norte (2026-02-28), cujo
desempate não segue R1, R2 nem countback (anomalia da fonte).
No `update-drive.yml` estes dois passos correm **só ao Domingo** (ou em run
manual): mudam devagar e dominavam o tempo do workflow.

**O site calcula como a FPG** (2026-07-20): `src/constants/drivePoints.ts`
(+ espelho `scripts/lib/drive-points.cjs`) exporta `tournamentPoints(field,
series)` — pontos de UMA prova por federado, com empates partilhados (Aquapor
por sexo) — e `rankingTotal(results)` — melhores-4 da fase regular + Finais
regionais ×1.5 (Final Nacional fora). A `DrivePage` (`buildSub12Data`) e a
`ResumoTable` usam-nas em vez de somar `drivePoints` de todas as provas.
Teste de integração `scripts/lib/drive-ranking-vs-oficial.test.js` confronta o
total calculado com os rankings oficiais reais do repo (RFDC_ quando existe).

**scrape-fpg-admissions-draws-node.js** — Node puro (2026-04-22). Substitui os browser-scripts `browser-scrape-fpg-admissions-draws.js` + `browser-scrape-fpg-draws-only.js` + `merge-fpg-admissions-draws.js`. Corre linkpage cross-domain (scoring.fpg.pt/lists) em paralelo, merge aditivo (preserva bons, rejeita `_suspect`), output único em `public/data/fpg-admissions-draws.json`. Scope: `scripts/fpg-admissions-scope.json` (333 torneios). Exit code 2 = sem novidades. Workflow: `update-fpg-admissions-draws.yml` (Sex/Sáb/Dom 20:00 UTC) — **regenera também `public/data/manuel-pairings.json` via `pairings-build.js` e committa-o** (alimenta a página `/draws`). Secret: `FPG_ADMISSIONS_COOKIES`.

⚠ **Trava `_manual` (2026-06-14):** uma entrada de torneio com `"_manual": true` é **curada à mão** e o scraper preserva-a INTACTA (salta-a no merge — ver guarda no topo do loop em `scrape-fpg-admissions-draws-node.js`). Usar quando se inserem draws/admissions manualmente (ex: folhas de pairing fotografadas) que NÃO devem ser sobrescritos num run futuro — crítico porque a FPG reutiliza tcodes (um tcode antigo reaproveitado traria um draw "legítimo" `nScore>0` que de outra forma ganhava ao manual). Os draws por jogador podem ter `tee` próprio (flights com tees mistos M/F) — `FpgDrawFlight.players[].tee` em `nacional2026Loader.ts`, lido pelo `DrawTab` (`p.tee ?? g.tee`). Actualmente marcados: `125/10370` (PJA Vale Pisão Dia 2) e `152/10444` (AT&T Pebble Beach Royal Óbidos D1+D2).

⚠ **Congelamento automático de draws passados (2026-06-14):** além do `_manual`, o scraper congela AUTOMATICAMENTE qualquer torneio cujo evento terminou há >2 dias — os draws não mudam depois de o jogo ser jogado. `drawsAreFrozen()` estima o fim do evento por `date + (maxRound−1)` (nº de rondas já capturadas) + buffer `DRAW_FREEZE_BUFFER_DAYS=2` e remove esses torneios do scope ANTES do fetch (poupa requests + elimina overwrite por reutilização de tcode). Só congela quando JÁ há draws na base — eventos passados sem draw capturado ainda podem ser backfilled. `--tcodes` (escolha explícita) ignora a trava (escape hatch para forçar re-scrape).
```bash
node scripts/scrape-fpg-admissions-draws-node.js                # scope todo
node scripts/scrape-fpg-admissions-draws-node.js --year 2026    # só 2026
node scripts/scrape-fpg-admissions-draws-node.js --tcodes 10941,10937,10935
node scripts/scrape-fpg-admissions-draws-node.js --since 2026-01-01 --concurrency 3
```

### Template de torneios FUTUROS em destaque — `FEATURED_TOURNAMENTS` (2026-07-10)

Generalização da injecção sintética que existia hardcoded para o Nacional 2026:
`src/data/featuredTournaments.ts` é a config única de torneios futuros que devem
aparecer na sidebar da FPGPage (lista geral "Todos" + secção Jovens) ANTES de
haver resultados em pull-torneios/jovens_YYYY.json — com tabs Inscrições/Draw
automáticas (TournamentDetail). O Nacional 2026 vive agora lá (meta importada de
`NACIONAL_2026_META`); primeiros torneios do template novo: Amendoeira 2026
(`179/10604-10606`, adicionados 2026-07-10 ainda só com draw).

**DrivePage (2026-07-10):** o mesmo template cobre torneios Drive futuros —
entradas com `series: "tour"|"challenge"|"aquapor"` (+ `region`) são injectadas
na sidebar da DrivePage (useMemo `driveEntries`) em vez de /FPG/jovens; o
detalhe Drive já usa o mesmo `TournamentDetail` (renderFull), logo tabs +
verificação live vêm de borla. O construtor do sintético é partilhado:
`buildFeaturedSynthetic()` + `inferEscalao`/`stripEscalaoSuffix` exportados de
`featuredTournaments.ts`. Dedup por ccode/tcode em ambas as páginas: quando o
torneio real chega aos ficheiros de resultados, o sintético deixa de entrar.

**Drives futuros AUTO-DESCOBERTOS (2026-07-10):** sem config manual — dois
mecanismos em cadeia: (1) o `INCLUDE_RX` da Fonte 3 do
`scrape-fpg-admissions-draws-node.js` ganhou `/\bdrive\s+(tour|challenge)\b/i`
e `/\baquapor\b/i`, por isso o cron `--auto-extend` (Sex/Sáb/Dom) descobre os
torneios Drive futuros na TournamentsLST e scrapa admissions/draws; (2) a
DrivePage auto-injecta qualquer torneio do `fpg-admissions-draws.json` cujo
nome bata esses regex e que ainda não exista nos `drive-data-*` (série
inferida do nome: aquapor/challenge/tour; região por
madeira/açores/norte/tejo/sul; fallback null).
⚠ A TournamentsLST NÃO devolve torneios futuros (confirmado 2026-07-10 via
`scripts/probe-tournlist-future.js` — max(started_at) = hoje). A descoberta
de futuros é a **Fonte 4** do auto-extend (`scanDriveFutureProbes`): os
organizadores Drive alocam tcodes sequencialmente (Madeira 982: 5º=10212-16,
6º=10227-31, 7º=10232-36), por isso sonda-se a página de admissions dos
tcodes acima do máximo conhecido de cada ccode com ≥2 torneios drive/aquapor
(pára após 5 misses seguidos, tecto +20); página válida entra no scope com a
data real. ⚠ `--tcodes` com ccode explícito faz match no scope por
(ccode,tcode) — nunca por tcode isolado (a FPG reutiliza tcodes entre clubes;
herdar a data do clube errado gerava falsos `_suspect` que apagavam dados
bons — caso dos Drive Challenge remarcados por mau tempo); sem entrada no
scope o `--tcodes` usa `date: null` (sem validação _suspect). A verificação live no
`TournamentDetail` cobre QUALQUER sintético admissions-only
(`_sourceFile === "fpg-admissions-draws.json"`, incl. jovens auto-detectados
da FPGPage), não só os FEATURED; `live: false` na config continua a desligar.

**Checklist para adicionar um torneio futuro:**
1. Entrada em `FEATURED_TOURNAMENTS`: `{ ccode, tcode }` chega — nome/data/campo/
   escalão vêm do scrape; overrides opcionais (name, escalao, date, campo, rounds,
   region, extraLinks).
2. Entrada(s) em `scripts/fpg-admissions-scope.json` com `"date": null` (⚠ null
   salta a validação `_suspect` — obrigatório quando a data ainda não é conhecida)
   e `_src: "manual-jovens"`.
3. Scrape inicial: `node scripts/scrape-fpg-admissions-draws-node.js --tcodes {ccode}:{tcode},...`
   (o cron Sex/Sáb/Dom mantém depois; quando a data real for conhecida, preenchê-la
   no scope para o `--since` do cron ser preciso).
4. Sem dados scraped, a entrada da config fica dormente (não aparece nada) — o
   `if (!ad) continue` na injecção (2) da FPGPage garante isso.

**Verificação LIVE ao abrir (2026-07-10):** para torneios FEATURED ainda não
jogados (`live !== false` e sem rondas), o `TournamentDetail` chama
automaticamente `/api/inscricoes?ccode=X&tcode=Y` (hook
`src/hooks/useLiveAdmissions.ts`, cache 3 min) — a tab Inscrições mostra a
lista ACTUAL da FPG com badge `🟢 live FPG · hora · N inscritos` e diff
"+N novos / −N saíram" face ao último scrape; se o live falhar cai no scrape
(`💾 live indisponível`). Ambos os endpoints foram GENERALIZADOS (aceitam
qualquer ccode/tcode, antes hardcoded 10935-10944 + club=000): função Vercel
`api/inscricoes.js` (agora via gateway linkpage.aspx; precisa do env
`FPG_ADMISSIONS_COOKIES` no Vercel) e middleware dev em `vite.config.ts`
(cache key `ccode/tcode` para clubes ≠000 no `inscricoes_nacionais.json`).
No Nacional 2026 o `live: false` está posto (evento já disputado).

**scrape-classif-node.js** — Node puro (2026-04-22). Substitui `pull-torneios.js` browser-console. GET linkpage warmup + POST `classif.aspx/ClassifLST` paginado + POST `classifAgregate.aspx/ScoreCard` por jogador. Output formato compatível com `pull-torneiosNNN.json`. Scope: `scripts/classif-scope.json` (217 torneios já processados) ou flags CLI. Workflow: `update-classif.yml` (Sáb/Dom 20:30 UTC). Secret: `DATAGOLF_SCORING_COOKIES`.
```bash
node scripts/scrape-classif-node.js --tclub 000 --tcode 10825
node scripts/scrape-classif-node.js --scope scripts/classif-scope.json --out public/data/pull-torneios-node.json
node scripts/scrape-classif-node.js --scope scripts/batch-aroeira.json --concurrency 2
```

**pull-torneios.js** (`scripts/_archive/browser-console/`) — Browser Console em `scoring.datagolf.pt`. **Legacy** — usar `scrape-classif-node.js` para novos torneios. Mantido como fallback para casos em que Node não funciona (e.g. ad-hoc num torneio de clube com `ccode` desconhecido). Movido da raiz para `scripts/_archive/browser-console/` em 2026-06-23.

**fpg-download-whs-only.js** (`scripts/_archive/browser-console/`) — **LEGADO** (v4; substituído pelo WHS Node-puro do `fpg-scrape-node.js`). Browser Console em `scoring.fpg.pt/lists/PlayerWHS.aspx?no=52884`. Download ~2-5 min. Se a página refreshar, alterar `START_INDEX`. Movido da raiz em 2026-06-23.

**Utilitários** (todos em `scripts/`):
- `node scripts/make-scorecards-ui.js 52884` / `--all` — gera UI scorecards (= `npm run scorecards`)
- `node scripts/enrich-players.js` → `player-stats.json`
- `node scripts/build-drive-sd-lookup.js` → `drive-sd-lookup.json`
- `node scripts/merge-courses.js` — consolida campos duplicados
- `node scripts/find-tcodes.js` — varre ccode/tcode, imprime torneios (movido da raiz em 2026-06-23)
- `node scripts/validate-encoding.js` — valida encoding dos JSON

### Refresh de federados (`scrape-federados-node.js`)

Refresh COMPLETO de `public/data/federados.json` (~15.600 activos, `FedStat=9`)
via Node puro. Substitui o antigo `scrape-federados.js` (browser console).
Endpoint `POST /pt/FederatedsList_V2.aspx/HandicapsLST`, paginado a 100
(200+ → HTTP 500), ~156 páginas / ~30s. Apanha fotos novas (paths antigos →
404), novos federados e mudanças de clube/HCP.

```bash
node scripts/scrape-federados-node.js                 # full refresh, grava só se mudou
node scripts/scrape-federados-node.js --check-only    # compara sem gravar
node scripts/scrape-federados-node.js --force         # grava mesmo sem alterações / parcial
node scripts/scrape-federados-node.js --max-pages 5   # debug (parcial — exige --force p/ gravar)
node scripts/scrape-federados-inativos.js             # script separado: federados-inativos.json (FedStat=7)
```

Cookies: env `DATAGOLF_SCORING_COOKIES` (Actions) ou ficheiro
`api/.scoring-datagolf-cookies.json` (dev) — os mesmos do `scoring.datagolf.pt`.
Compara byte-a-byte (ignorando timestamps) e tem guardas anti-overwrite (recusa
gravar 0 registos, run incompleto, ou perda >10% sem `--force`). Exit codes:
**0** = actualizado, **2** = sem alterações (não é erro), **1** = erro.
Validar cookies antes: `node scripts/test-datagolf-node.js` (deve dar `Result:"OK"`).
Workflow: `update-federados.yml` (Quarta 05:00 UTC). Secret: `DATAGOLF_SCORING_COOKIES`.

---

## Enriquecimento de rondas internacionais — MÉTODO ÚNICO (2026-08-14)

Rondas de torneios internacionais chegam da FPG **sem metros**, com campo
genérico ("INTERNACIONAL", nome sem combo) e tee por cor ("VERMELHAS"). O
enriquecimento é SEMPRE **full-bake** no `melhorias.json` da **RAIZ** (a UI
importa-o directamente em `App.tsx`; o antigo `public/data/melhorias.json` era
órfão e foi eliminado 2026-08-14) — entrada por scoreId com
`whs.course_description` + `scorecard {course_description, tee_name, par_1..18,
meters_1..18, course_rating?, slope?}`. Gerado por **`scripts/enrich-intl-round.js`**
(nunca escrever entradas à mão):

```bash
# Fonte USKids: TEES_LOOKUP (src/ui/uskidsData.ts, curado dos PDFs oficiais) com
# fallback par+yards do uskids-results.json (yards×0.9144, guarda _yards)
node scripts/enrich-intl-round.js --scores 4333809,4333833,4333835 --uskids 21795:2105 --course "Val d'Europe"
# Fonte cópia: outra entrada do melhorias (D2/D3 a partir do D1; mesmo tee físico noutro ano)
node scripts/enrich-intl-round.js --scores 4213116 --copy-from 3946427 --tee "Boys 10-11"
# Depois, sempre:
node pipeline.js --skip-import 52884 && npm test && npm run build
```

Flags: `--course`/`--tee` sobrepõem os da fonte (default: campo/tee do lookup);
`--par n,n,...` sobrepõe o par da fonte — para quando a ORGANIZAÇÃO joga o campo
com par diferente do homologado (caso real: WJGC 2026 jogou o Flamingos par-71
como par 72 no buraco 10 "para não haver tantos bogeys"; a FPG manteve 71 no
WHS — o site mostra o par do TORNEIO, o SD da FPG não muda);
`--nota`/`--pill`/`--group`/`--link`; `--comment "..."` cria a linha `_comment_*`
antes de entradas novas; `--dry-run`. Entradas existentes são FUNDIDAS (notas,
links, pill, campos extra preservados). O ficheiro é editado por splice textual
(⚠ nunca re-serializar o JSON inteiro: o JS reordena as chaves numéricas para a
frente dos `_comment_*`; e o ficheiro é CRLF).

Checklist para um torneio internacional novo:
1. Garantir o evento no `TEES_LOOKUP` (`src/ui/uskidsData.ts`): par/metros dos
   results oficiais + CR/Slope **só do PDF USKids "SSS & SLOPE"** (nunca
   inventar; sem PDF → sem cr/slope e a coluna SD do /uskids fica "—").
2. scoreIds das rondas: `output/{fed}/analysis/data.json` (campo + data).
3. Correr o script (1 comando por evento/tee) + regenerar + testar.

⚠ **Não usar `MANUEL_AWAY_TEE` para casos novos** — é um override por CAMPO e
parte quando o mesmo campo tem tees diferentes por ano (Montecchia: 2025 Boys 11
vs 2026 Boys 12). O runtime (`resolvePlayedMeters`/`resolvePlayedSI` na
JogadoresPage) mantém-se como fallback para rondas ainda não tratadas. Estado
2026-08-14: TODOS os internacionais do Manuel até ao Venice Open 2026 estão
full-bake (Padierna/Le Touquet/Doral/Venice 25+26/Paris/Glen/Marco Simone).

---

## PCC — o ajuste que chega SEMPRE depois do scrape (2026-08-30)

O **PCC** (*Playing Conditions Calculation*, Regra 5.6 do WHS) é um inteiro de
**−1 a +3** calculado pela FPG **por campo e por dia**, a partir de todos os
cartões válidos de jogadores com índice ≤ 36.0 entregues nesse campo nesse dia.
Entra **subtraído** no differential:

```
SD = (113 / Slope) × (AGS − CR − PCC)
```

Logo **PCC −1 SOBE o SD em ~1 pancada** (dia fácil → o bom resultado conta um
pouco menos) e +1..+3 baixam-no (dia difícil). Sem ele a tabela diverge do SD
oficial exactamente por (113/slope)×PCC.

⚠ **A FPG só o calcula ao FIM DO DIA** — e todos os nossos scrapes de resultados
correm na própria noite do torneio (`update-drive` Sex/Sáb/Dom 21:00,
`update-classif` Dom/Seg 01:00, `update-cgss-draw-results` a pedido). O
`extractPcc()` desses scripts lê o campo `cba` do scorecard, encontra-o vazio, e
o torneio ficava **para sempre** sem PCC. Caso que destapou isto: 8º Torneio
CGSS OM NOS 2026 (007/11057, 29-08, Santo da Serra), scrapado às 22:57 do
próprio dia — o Manuel aparecia com SD 5.5 em vez do oficial 6.4.

### `scripts/backfill-pcc.js` — a rede de segurança

Cada volta do WHS (`output/{fed}/whs.json`) traz o **`cba` oficial** mais
`tournament_code`, `hcp_dateStr` e `course_description`. Como o WHS é
re-descarregado às 00:05 UTC (já depois da meia-noite de Lisboa), o PCC chega-nos
de graça — sem cookies e sem um pedido extra à FPG.

```bash
node scripts/backfill-pcc.js                      # dry-run
node scripts/backfill-pcc.js --apply
node scripts/backfill-pcc.js --apply --since 2026-01-01
node scripts/backfill-pcc.js --tcode 11057 --verbose
```

Alvos: `pull-torneios*.json`, `drive-data-*.json`, `aquapor-data-*.json`.
Exit **0** = preencheu · **2** = nada a fazer · **1** = erro. Idempotente.

⚠ **Chave = tcode + DATA + CAMPO, nunca só o tcode.** A FPG reutiliza tcodes
entre clubes — o 10052 é ao mesmo tempo um Drive Challenge dos Açores e um do
Tejo. Casar só por tcode carimba um torneio com o PCC de outro, noutro ano.

⚠ **Valor MODAL com maioria estrita, não o primeiro que aparece.** A própria FPG
guarda `cba` desactualizado nalguns registos: na "Final Regional Drive Challenge
Açores-Sub18" (10121, 27-08-2024) cinco dos nossos têm −1 e um tem 0 — o cartão
desse foi processado antes de o PCC existir. É a mesma avaria pelo outro lado.
Empate → não se mexe.

⚠ **Só se escreve PCC ≠ 0.** 0 é "sem ajuste", idêntico a não ter campo nenhum —
e é o que o `extractPcc()` dos scrapers faz, por isso um re-scrape futuro produz
o mesmo ficheiro. O `pcc` vive no **`roundScores[]`** (a seguir a `meters`), não
no jogador; o `normalizePlayer` levanta-o para o topo em runtime.

Passagem inicial (2026-08-30): **5008 rondas em 136 torneios**; a coincidência
exacta entre o SD calculado e o `sgd` oficial subiu de **63,4% para 73,4%** em
15 421 rondas dos nossos. Limitação: só cobre torneios onde pelo menos um dos
nossos jogadores jogou.

### Onde corre

| Workflow | Quando | Papel |
|---|---|---|
| `update-data.yml` | Dom+Seg 00:05 UTC | Varredura geral, a seguir a descarregar o WHS. O passo tem `id: pcc` e o commit corre também quando `steps.pcc.outputs.filled == '1'` (senão o PCC ficava no runner) |
| `update-classif.yml` | Dom+Seg 01:00 UTC | Os torneios acabados de scrapar apanham o PCC na mesma noite, em vez de esperar uma semana |

⚠ O `git add` dos dois workflows **tem de incluir** `pull-torneios*`,
`drive-data-*` e `aquapor-data-*` — faltavam no `update-data.yml` e o backfill
teria sido silenciosamente deitado fora.

### ⚠ Sentinelas de "sem cartão" (o bug do badge verde)

A FPG põe **998** (ND/NR — não devolveu) e **999** (NS/WD) no lugar do gross, e o
`numGross()` converte um `grossTotal` null no mesmo 999. O `computeSD` só
rejeitava `null`: o cartão a zeros era "reparado" pelo Net Double Bogey e saía um
SD de **−58.8** que, sendo ≤ HCP, pintava o badge de **VERDE** — as 9
desistências do CGSS OM NOS apareciam como as melhores voltas do dia (25 verdes
em vez de 16). Guarda `gross >= 900` em `computeSD` (`fpgUtils.ts`) e nas duas
cópias da mesma lógica (`ResumoTable.tsx`, `DrivePage.tsx`). Mesma convenção do
ranking Drive. Testes em `src/data/__tests__/computeSD.test.ts`.

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

Cache separada do member-history: `uskids-rich-flight-cache.json.gz` (re-fetch só se torneio ≤15d). **É gzipada de propósito** (2026-08-24): em claro são ~84 MB a crescer ~20 MB/semana e passou os **100 MB** do GitHub a 17 Ago — o push era rejeitado e, como o commit era ÚNICO, levava atrás as fichas dos jogadores desse run (2 segundas-feiras seguidas, ~10h de scrape perdidas). Gzipada dá ~8 MB e o histórico do repo deixa de levar um blob de 100+ MB por semana. O `loadFlightCache` ainda lê um `.json` legado para migrar; o primeiro save grava o `.gz` e apaga-o. ⚠ O workflow faz **dois commits com pushes separados** (fichas primeiro, cache depois) — um ficheiro problemático nunca mais pode custar os dados novos. Skip-existing por `lastUpdated` (default `--since-days 14`). Matching memberID→pid local via fingerprint de strokes (mesmas salvaguardas `MIN_FINGERPRINT_HOLES=6`, `MIN_FINGERPRINT_DISTINCT=3` do member-history). Exit code 2 = sem novidades.

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

**fetch-uskids-field.js** — Corre 1x/dia (`uskids-field.yml`, 07:00 UTC). Fase 1
descobre torneios novos (→ `uskids-discovery-cache.json`), Fase 2 recolhe
inscritos por escalão (→ `uskids-field.json`). O `fetch-uskids-results.js` lê a
MESMA cache para saber que torneios estão em curso — descoberta partida = sem
resultados também.
```bash
node fetch-uskids-field.js
node fetch-uskids-field.js --force-discovery   # ignora a cache
```

⚠ **A varredura de tcodes tem de ser em DUAS passagens (corrigido 2026-08-23).**
Os tcodes do signupanytime são sequenciais por criação mas só uma fatia pertence
à conta internacional (`ax=1129`) — o resto devolve `GetMeta` sem torneio. A
versão antiga começava na âncora (`ultimo_t+1`) e parava ao fim de **100 tcodes
seguidos vazios**; entre 21610 e o torneio conhecido seguinte (22243) há **632
vazios**, por isso morria sempre a ~21710 e **não descobria um torneio novo
desde 6 de Julho** (o site ficou preso em Outubro). Por cima disso havia um
`T_MAX = 23000` fixo, com os tcodes vivos já em ~23590. Agora:

- **Passagem A** — âncora → maior tcode conhecido: varrida **por inteiro, sem
  paragem antecipada** (é onde estão os buracos gigantes).
- **Passagem B** — acima do maior conhecido: segue o plano de
  `scripts/lib/uskids-scan-plan.js` (9 testes), que **nunca desiste
  definitivamente num buraco**. Duas redes: (1) varredura **densa com margem
  dinâmica** — varre tudo até `últimoVivo + 1500`, e como a margem conta a
  partir do último tcode VIVO, cada torneio encontrado empurra o fim para a
  frente (enquanto houver vida a varredura não acaba); (2) **sondas de salto** —
  janelas de 20 tcodes de 250 em 250 até `últimoVivo + 20000`, para o caso de um
  buraco absurdo: se alguma acha vida, a densa RETOMA a partir dela. Só termina
  quando as sondas esgotam o alcance sem nada. Nunca há tecto absoluto.

⚠ **Um tcode que não responde NÃO é um tcode vazio.** `metaTournament` devolve o
sentinela `ERRO` (≠ `null`) ao fim das tentativas, e `varrerIntervaloFiavel`
repete qualquer intervalo que venha vazio com >25% de erros. Sem isto uma falha
de rede passageira parece o fim da fronteira e trunca a varredura em silêncio —
a mesma classe de avaria, por outra porta. Um **disjuntor** (3 intervalos
degradados seguidos) abandona a fronteira e marca `fim: 'rede-degradada'` — não
`fronteira-esgotada` — para o canário gritar e a Fase 2 ainda correr.

⚠ **Um tcode inexistente responde HTTP 200 com CORPO VAZIO.** Chamar `r.json()`
nesse corpo lança, e classificar essa excepção como falha de rede fazia cada
tcode inexistente custar 3 tentativas × 12 s — a fronteira, que por definição
acaba em milhares de tcodes vazios, deixava de ser varrível em tempo útil
(medido: 60/60 "sem resposta" num servidor que respondia perfeitamente). Ler
`r.text()` primeiro e tratar vazio/lixo como "não existe".

**🐤 Canário — a defesa que faltava.** A avaria durou 7 semanas porque o
workflow ficava VERDE a descobrir zero torneios. A cache guarda agora
`ultima_descoberta` / `dias_sem_descoberta` e `fronteira_avancou_em` /
`dias_sem_avanco` (o maior tcode vivo alguma vez visto), mais o diagnóstico da
varredura (`varredura: {fim, blocos, sondas, retomas, intervalos_degradados}`).
O passo **"Canário"** do `uskids-field.yml` corre DEPOIS do commit (para os
dados nunca se perderem por causa do alarme) e **falha o job** — logo o GitHub
manda email — com >30d sem torneios novos, >21d sem a fronteira avançar, ou >3
intervalos degradados. Limiares largos de propósito: isto avisa que a varredura
parou, não que houve uma semana fraca.
- `GetMeta` por **`fetch` directo** (`metaTournament`, sem browser — a API é
  pública server-side), concorrência 5. É o que torna viável varrer ~2000
  tcodes/dia; com `page.goto` cada tcode custava ~3,2 s. A Fase 2 continua no
  browser.
- A cache guarda `varredura_max_t` (último tcode vivo visto) — na corrida
  seguinte a Passagem A já cobre tudo o que foi varrido antes.

Primeira corrida com a correcção: **8 torneios novos** (Spanish Open 20 Nov,
South American Championship 31 Out, Australian Challenge 21 Set, Mexico
Invitational 12 Dez, Indian Championship 22 Dez, Florida Winter State 5 Dez,
Antalya Turkish Open 30 Jan 2027, Circolo Golf Venezia 3 Out).

### Datas de inscrição USKids — reconstruídas pelo `pid` (2026-08-23)

**A API não publica data de inscrição.** `GetPlayerTeeTimes` devolve
nome/país/cidade/tee/status e mais nada, e não existe `op=` de registos
(testados 9 nomes plausíveis — todos HTTP 200 com corpo vazio). Até aqui a UI
mostrava o `firstSeen`, que é só o dia em que o NOSSO scraper viu o jogador —
por isso num torneio acabado de descobrir o campo inteiro aparecia como
"inscrito hoje".

O que dá para usar é o **`pid`** (chave do `flight_players`): um auto-incremento
**global** da tabela de inscrições do signupanytime, que ordena sempre pela
ordem real de inscrição. Verificado duas vezes: 7/7 na ordem certa contra os
nossos `firstSeen` no Belgium Invitational (15 Mai → 5 Ago), e o William Clarke
com pids **consecutivos** (1813945/1813946) em dois torneios diferentes — as
duas inscrições feitas ao mesmo tempo.

`scripts/lib/uskids-reg-dates.js` (13 testes) transforma isso em datas:
- **Âncoras** = jogadores que apareceram DEPOIS de já seguirmos o torneio (aí o
  `firstSeen` é a data real ±1 dia). Acumulam-se entre corridas em
  `public/data/uskids-pid-anchors.json` (636 na primeira passagem).
- Tudo o resto sai por **interpolação linear** entre as âncoras à volta;
  `estimarDia` marca `fora: true` quando extrapola fora do intervalo calibrado.
- Cada jogador ganha `regDia` + `regObs` (true = observado, false = estimado). A
  UI (`TabCampoDetalhe`) prefere `regDia` e prefixa a pill com **`~`** quando é
  estimativa; o tooltip di-lo por extenso.

⚠ **O `firstSeen` do primeiro dia de monitorização NÃO serve de âncora** — essa
gente já lá estava inscrita antes de o torneio entrar no radar. Usá-la
carimbaria centenas de inscrições antigas com o dia em que começámos a olhar,
que é exactamente o erro que esta datação corrige.

⚠ **`KEYWORDS_EXCLUIR_SEMPRE` vence o `INCLUIR_FORTE`.** As variantes
`Parent/Child` herdam o nome do evento principal ("Holiday Classic Parent/Child
2026") e o `INCLUIR_FORTE` ignora o `KEYWORDS_EXCLUIR` — era por isso que cada
uma tinha de ser listada à mão em `FORCAR_EXCLUIR` (4 entradas). A guarda corre
ANTES de tudo e resolve a classe inteira.

### ⚠ O NOME não classifica o torneio — o `type` do GetMeta classifica (2026-08-30)

A decisão de que torneios entram no radar vive agora em
**`scripts/lib/uskids-classify.js`** (`incluirTorneio(t, name, type)`, 10 testes).
Enquanto foi só por palavras-chave sobre o nome, falhava nos dois sentidos —
o nome de um evento USKids é livre. Três **Regionais** com inscrições abertas
nunca chegaram à app (medidos 2026-08-30, todos dentro da zona já varrida):

| t | Torneio | Porque caiu |
|---|---|---|
| 22986 | PGA Golf Club Invitational 2026 | batia no exclude `'golf club'` — que existe para deitar fora os ~1200 eventos do Local Tour, que se chamam pelo nome do campo |
| 23318 | Colonial Williamsburg Classic 2026 | `'classic'` só existia colado a um sítio (`'venice classic'`, `'holiday classic'`) |
| 23420 | Monterey Challenge 2026 | `'challenge'` nem sequer era include |

O `tournament` do `GetMeta` já traz a taxonomia oficial — `tour`
("Domestic Championships Tour") e `type` (inteiro). Medido sobre os 1320
torneios vivos em t=22240…23640:

| type | tour | n | exemplo |
|---|---|---|---|
| **1** | Domestic Championships Tour | 5 | Seaview Open 2026 ← **Regional** |
| 2 | Teen Series Tour | 30 | Teen Series at Longleaf (NC) |
| 5 | `{cidade} Tour` | ~1150 | The Legends Golf Club ← **Local Tour** |
| 6 | `{cidade} Tour` (Tour Championship) | ~190 | Longleaf … (Tour Championship) |
| **7** | State Invitationals Tour | 8 | 2026 Kansas State Invitational |
| **8** | International Championships Tour | 14 | Venice Open 2026 |
| 9 | Team Golf Tour | 23 | Concord Local Parent/Child 2026 |
| 12 | Girls Invitationals Tour | 2 | 2026 Girls Invitational - Longleaf (NC) |
| 13 | International Teen Series Tour | 3 | International Teen Series at Al Hamra |

`TIPOS_INCLUIR = {1, 7, 8}` entram **sempre**, seja qual for o nome.

**`TIPOS_INCLUIR_SE_INTL = {6}` — Tour Championship, só fora dos EUA.** O
type 6 é a final de época de cada Local Tour de cidade (irmão do type 5, que
fica de fora): 184, das quais 133 por jogar. Todas no radar levariam a Fase 2
do monitor diário de 33 para ~166 torneios — 5× o trabalho — e a esmagadora
maioria é americana, onde não nos cruzamos com ninguém. Entram as **54 de fora
dos EUA**: Azata/Andaluzia, Venice, Milão, Turim, Toscana, Munique, Hamburgo,
Nuremberga, Lyon, Londres, Panamá, América Latina, Ásia, África.

⚠ **O sinal é o código de país ENTRE PARÊNTESES** no `tour` ("Lima (PE) Tour",
"Andalusia (ES) Tour"). Os tours americanos com sigla de estado usam
**vírgula** e nunca parênteses ("Charleston, SC Tour", "Central Valley, CA
Tour") — verificado nos 158 tours distintos do corpus: 14 com vírgula, zero
falsos positivos. E os únicos "(CA)" são Niagara e Vancouver, que são o
**Canadá**, não a Califórnia: entram de propósito. Efeito medido: **+64 no
corpus (54 futuros), 0 americanos**. As
palavras-chave ficam como camada **aditiva** — é só isso que continua a trazer
as etapas de Local Tour que seguimos de propósito (Azata/Andaluzia, Panamá,
Al Hamra, OPEN.9 Eichenried, Circolo Golf Venezia) sem abrir a porta às outras
~1200. `KEYWORDS_EXCLUIR_SEMPRE` (Parent/Child) corre antes do tipo e
`FORCAR_EXCLUIR` vence tudo. Diferença medida sobre os 1320: **+3, −0**.

⚠ **O `type` tem de ser guardado na cache.** O `descobrirTorneios` re-filtra as
entradas de `uskids-discovery-cache.json` à entrada; sem `tour`/`type`
persistidos, a re-entrada voltava a decidir só pelo nome e os Regionais caíam
outra vez na corrida seguinte. Entradas antigas sem `type` continuam a ser
lidas pelo nome (retrocompatível). O `uskids-field.json` também passa a
carregar `tour`/`type` por torneio.

**fetch-uskids-discovery.js** — Varre IDs no signupanytime, filtra torneios internacionais por keywords. Forçar inclusão: `FORCAR_INCLUIR = new Set([21080, 21573, 21199, 21200, 21133])`.

### USKids — Script browser (F12)

**uskids_scrape_courses - PERFEITO COM DISTANCIAS.js** (`scripts/`, movido da raiz em 2026-06-23) — **Activo, sem substituto Node** (gerador canónico dos completos). Colar em `www.signupanytime.com` (qualquer página). Gera `uskids_torneios_completos(N).json` com par+yards reais e scorecards completos. Suporta dois formatos de output: v1 (antigo, array) e v2 (novo, objecto com `signupanytime_t`).
- Configurar: editar array `TOURNAMENTS`: `{ t: "21080" }`
- Após download: copiar para `public/data/` e atualizar `TORNEIOS_COMPLETOS_COUNT` em USKIDSPage.tsx (actualmente **40**)

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

>  correr `scrape-bluegolf.js`, `scrape-eowagr25*.js` ou qualquer
> fetch automatizado a `*.bluegolf.com` 

**scrape-bluegolf.js** — Scraper genérico BlueGolf.  Browser visível (CAPTCHA possível).
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

## Scripts — MAJOR: campeonatos juvenis internacionais (2026-07-03)

> **⚡ Catálogo + lazy load (2026-07-06)** — a `/major` deixou de pedir ~127
> ficheiros (~14.6 MB, incl. ~48 pedidos 404 por adivinhar anos) no arranque.
> Agora pede SÓ `public/data/major-catalog.json` (~50 KB, gerado por
> `scripts/build-major-catalog.js`): a lista lateral sai desse índice (name,
> campo, datas, nº jog/esc/rondas, hasManuel/hasPt) e o detalhe de cada torneio
> (scorecards) carrega **lazy** ao clicar, via `loadDivisions` no `CircuitShell`
> (que já suportava + cacheia — mesmo padrão do FFG/England). Os builders eager
> (`buildMajorEntries`/`buildJobEntries`/`buildFmEntries`/`buildGgJobEntries`)
> **mantêm-se** — o `loadDivisions` reusa-os por-fonte, dando-lhes só a fatia
> mínima: bjgt/eowagr → ano + irmão 2025↔2026 (evo `bjgtEvoFor`); doral → todos
> os anos ≤ seleccionado (evo multi-ano `doralEvoFor`); gg-job → [ano-1, ano]
> (evo `jobEvoFor`). O `veteranIndex` (toggle ✦ Veteranos) vem pré-calculado no
> catálogo (o shell não tem os jogadores em memória no modo lazy).
>
> ⚠ Correr `node scripts/build-major-catalog.js` sempre que um ficheiro de dados
> MAJOR muda. Automatizado em `build-major-catalog.yml` (push nos paths
> brjgt/eowagr/ftm_doral/orangebowl/ftm_fm/fsga/uajt/mexnacional/icopa/interzonas/
> avtrophy + o próprio script). As regras de metadata do script **espelham** os
> builders da `MajorPage.tsx` — se um builder mudar name/playerCount/etc., alinhar
> o script.
>
> **`vetKey` (2026-07-24)** — o `veteranIndex` (toggle ✦ Veteranos) e a tab de
> internacionalizações usam agora `vetKey` (`src/utils/normName.ts`): `normName`
> + vírgulas removidas + **tokens ordenados alfabeticamente**, para "Apelido, Nome"
> (Doral) e "Nome Apelido" (Future Masters/GolfGenius) darem a MESMA chave — antes
> a mesma pessoa contava 2× (o Axel Monssoh saltou de 8→15 presenças). O
> `build-major-catalog.js` espelha o `vetKey`; o `CircuitShell` faz o lookup com o
> mesmo; o `normNameVet` da RFEGPage passou a reexportar o `vetKey` partilhado.
>
> **`major-veterans.json` + tab "✈️ Internacionalizações" (2026-07-24)** — o mesmo
> `build-major-catalog.js` emite um 2º ficheiro (`public/data/major-veterans.json`,
> ~800 KB, jogadores com ≥2 torneios: nome, país dominante, flags pt/usa, nº
> torneios/anos/circuitos, séries e lista de entradas). A tab (menu ⓘ Info da
> /major, `src/pages/major/MajorVeteransView.tsx`) carrega-o **lazy** e mostra um
> ranking ordenável com filtros (procura, circuito, mín. torneios, 🇵🇹 Só PT,
> 🚫🇺🇸 Esconder EUA); cada linha expande para os torneios do jogador com link
> para `/major`. O `build-major-catalog.yml` committa ambos os ficheiros.

Fonte única `/major` cresceu com campeonatos juvenis mundiais/nacionais. Dois
formatos de output e dois caminhos de scrape:

| Torneio | Plataforma | URL | Scraper | Output | Estado |
|---|---|---|---|---|---|
| **FSGA — 72nd Boys' Junior Championship** | GolfGenius (v2tid) | `v2tournaments/4708880` + `4739657` | `scrape-fsga.js` | `fsga_2026.json` (JobFile, 2 divisões) | ✅ ligado a `/major` (source `fsga`) |
| **Under Armour — Summer National Championship** | GolfGenius (pages) | `pages/12770450567004716088` | **`scrape-golfgenius-node.js`** (Node-puro) | `uajt_2026.json` (JobFile, 12 divisões) | ✅ ligado (source `uajt`) |
| **México — Campeonato Nacional Infantil Juvenil (LXXV)** | GolfGenius (multi-liga) | `pages/5989156` (hub JS) | **`scrape-golfgenius-node.js --v2tids`** | `mexnacional_2026.json` (JobFile, 12 divisões) | ✅ ligado (source `mexnacional`) |
| **México — Copa Bobby Díaz (7-15)** | GolfGenius | `pages/5666137` (liga 502696) | `scrape-golfgenius-node.js --v2tids` | `icopa_2025.json` (4 divisões c/ jogadores) | ✅ ligado (source `icopa`) |
| **México — Nacional Interzonas Lorena Ochoa (LXV)** | GolfGenius | `pages/5897587` + v2tid `4619271` INDIVIDUAL GENERAL | `scrape-golfgenius-node.js --v2tids "Individual General=4619271"` | `interzonas_2025.json` | ✅ ligado (source `interzonas`) — tem o Andres Marcos Cantu |
| **'Champion of Champions' World Championship** | GolfGenius (pages) | `pages/12114827382448210411` (2026) | **`scrape-golfgenius-node.js --scope`** | `coc_{2023,2024,2025,2026}.json` (JobFile, 8-10 divisões) | ✅ ligado (source `coc`) — cron `update-golfgenius.yml` |
| **Optimist International Junior Championships** (600+/ano, 25+ países; PGA National→Trump Doral) | GolfGenius (microsites `tndm-*`) | 3 FASES/ano por escalões (P1 = Boys 10-11/12-13 + Girls 10-12 ⭐ universo do Manuel; P2 = 14-15/13-14; P3 = 16-18/15-18) — URLs por fase em `golfgenius-scope.json` | **`scrape-golfgenius-node.js --scope`** (país+gradYear do roster "Players"; `stop` = nº da fase) | `optimist{1..3}_{2023..2026}.json` (JobFile; ids `optimist:{ano}:{fase}` como o ejt) | ✅ ligado (source `optimist`, 2026-08-06) — cron `update-golfgenius.yml`. ⚠ `optimist3_2023` é vista agregada sem divisões (o GG de 2023 não tem select — fica 1 flight). ⚠ o site ShotStat (optimist.shotstat.com) só tem o Tournament of Champions, NÃO o International |
| **Belgian International U14 — Albert Vermeiren Trophy** | GolfBox | `scores.golfbox.dk` comp `5388972` | `scrape-golfbox.js` | `avtrophy_2026.json` (JobFile, CR/Slope+HCP) | ✅ ligado (source `avtrophy`) |
| **Estonian Junior Open** (Estonian Golf Association; o campeonato nacional EMV corre DENTRO do Open) | GolfBox | comp 2026 `5417057` (2025 `4931278`, 2024 `4393974`, … até 2013 — ver golf.ee/voistlused/estonian-junior-open) | `scrape-golfbox.js` (`classRe` no scope filtra as classes sobrepostas EMV/combinadas) | `ejo_{2019..2026}.json` (JobFile, 10 divisões Boys/Girls U12-U21, CR/Slope+HCP+birthYear 100%) | ✅ ligado (source `ejo`, `showAges: true` → coluna IDADE) — 2026 no scope do cron |
| **Estonian Junior Tour** (circuito EGA estónio, 5-7 etapas/ano U9-U21 + o EJO como major do circuito) | GolfBox | comps 2026: `5417113` (EGCC, 1 Jun) · `5417123` (White Beach, 29 Jun) · `5417127` (Rae, 21 Jul) · `5417128` (Saaremaa, 11 Ago) · `5417129` (Otepää, 19 Ago) · `5417080` (FINAL Pärnu Bay, 24-25 Ago). **Histórico 2021-2025 (34 provas)**: IDs descobertos via `OrderOfMeritsHandler/GetOrderOfMerit/OrderOfMeritId/{id}` (os OoMs por categoria listam as provas da época; IDs dos OoMs na página golf.ee/voistlused/estonian-junior-tour) | `scrape-golfbox.js` — **1º circuito MULTI-EVENTO/ano**: 1 ficheiro por etapa, `stop` no scope → id `ejt:{ano}:{n}` (catálogo + MajorPage, range 1-8); `classRe` filtra as vistas HCP-Stroke/Scratch (e as LAT de 2023 — jogadores letões confirmados presentes nas classes por escalão) | `ejt{1..7}_{2021..2026}.json` (JobFile, 8 divisões Boys/Girls U9-U21) | ✅ ligado (source `ejt`, showAges) — 6 etapas 2026 no scope do cron (futuras dormentes até terem scores); histórico scrapeado ad-hoc (não está no scope — nunca muda); tab "Época" (`seasonKey`) junta as etapas do ano, "Edições anteriores" compara a MESMA etapa entre anos |
| **EGA — European Boys' Team Championship, Div. 2** | GolfBox | `ega-golf.ch/…#/competition/5731554/leaderboard` | `scrape-golfbox.js` | `ebtc2_2026.json` (JobFile) | ✅ ligado (source `ebtc2`) — começa 7 Jul 2026 |
| **EGA — European Girls' Team Championship (U18)** | GolfBox | `ega-golf.ch/…#/competition/5478100/` | `scrape-golfbox.js` | `egtc_2026.json` (JobFile) | ✅ ligado (source `egtc`) — U18, GCC Zürich; começa 7 Jul 2026 |
| **FCG Callaway World Championship** | BlueGolf | `fcg.bluegolf.com/bluegolf/fcg26/event/fcg268/` (+`fcg25/…/fcg251`) | ~~scrape-bluegolf.js~~ | `fcg268_{cat}.json` (formato bluegolf) | ⛔ BlueGolf descontinuado 2026-07-09 (pedido nominal p/ parar automação) — só via manual/permissão |
| **Uswing Mojing Junior World (JWGC)** | BlueGolf | `jwgc.bluegolf.com/bluegolf/jwgc26/event/jwgc261/` | ~~scrape-bluegolf.js~~ | `jwgc261_{cat}.json` (formato bluegolf) | ⛔ idem — BlueGolf descontinuado |

### GolfBox (`scores.golfbox.dk`) — EGA European Team Championships + avtrophy

Sites tipo `ega-golf.ch` (Drupal) embutem o leaderboard GolfBox
(`scores.golfbox.dk/api/js/leaderboard/competitionid/{id}/template/ega`). O
`scrape-golfbox.js` (Node-puro, JSONP público, **sem cookies**) lê a competição
pelo `competitionId` e escreve um JobFile `{slug}_{ano}.json` — mesmo formato dos
GolfGenius, com CR/Slope + HCP + ano de nascimento (`showRatings: true` na
`MajorPage`). Usa a `PlayerClass` "Individual" (ignora a `TeamClass`) → leaderboard
individual, com o `team` de cada jogador guardado.

**Inscritos + DOB completa (`entries: true` no scope / `--entries`, 2026-08-05):**
`PlayersHandler/GetPlayers/CompetitionId/{id}` responde para provas passadas E
futuras (medido 2021→2026) e traz o que o leaderboard não tem: **DOB completa**
(o leaderboard só dá o ano), clube e HCP (formato ×10000; `EntryStatus` 0 =
inscrito, 1 = jogou — muda quando a prova acontece; `Entries` vive DENTRO de
`Classes.C{id}`, não no top-level). O scraper usa-o para (1) enriquecer os
jogadores do leaderboard com `dob`/clube → matching FORTE nome+DOB no agregador
(ejo/ejt, como o fcg), e (2) em provas FUTURAS (leaderboard vazio) semear a
divisão com o ROSTER de inscritos (0 voltas) — o `util/jobfile.js` tem uma
guarda que NÃO os transforma em participações, e o catálogo MAJOR ignora-os
(sem scores). O kids2 `/next-t` consome esses rosters via `JOBFILE_INTL`
(FieldRivaisDashboard) — etapas EJT futuras aparecem com o field inscrito.

**Automação:** as competições vivem em `scripts/golfbox-scope.json`; o
`update-golfbox.yml` (cron diário 21:00 UTC + `workflow_dispatch`) scrapa TODO o
scope, regenera juniores + **`major-catalog.json`** e committa. Adicionar um evento
= 1 entrada no scope (`competitionId`/`slug`/`name`) + ligar a fonte na `MajorPage`
(`sourceColors`/`sourceLabels`/`GG_JOB_LOADERS`), no `build-major-catalog.js`
(`GG_SOURCES`) e nos paths do `build-major-catalog.yml`. Eventos futuros (sem campo/
scores ainda) são **saltados** pelo catálogo até terem jogadores — aparecem sozinhos
quando o cron os apanha.

⚠ **O GolfGenius devolve 403 a browsers automatizados** (Playwright headless *e*
o Chrome do utilizador em modo automação) **mas responde a `fetch` puro.** Por
isso o `scrape-junior-orange-bowl.js` (Playwright) parte-se nestes eventos (UA
deu "browser closed"; a hub JS do México deu "0 tids"). **A via correcta é
Node-puro** via `scrape-golfgenius-node.js` (descoberta pela API v2tournaments) —
corre em qualquer lado, sem browser. O **BlueGolf** (FCG + JWGC) está
**⛔ DESCONTINUADO desde 2026-07-09** — pedido nominal da BlueGolf para parar
pedidos automatizados (ver aviso na secção "Scripts — BJGT / WJGC / EOWAGR / Doral").

### scrape-fsga.js — GolfGenius Node-puro (v2tid, sem Playwright)
Já ligado. Deriva o **par por buraco dos marcadores** (birdie=círculo,
bogey=quadrado…) porque a FSGA não expõe `leagueId` no domínio público (portal
SPA + fsga.org atrás de Cloudflare) → sem `course_analytics` (metros/SI ficam
`null`). Multi-campo: **R1 Roost, R2/R3 Karoo** (par hole-by-hole diferente,
ambos 72) → cada ronda leva o seu `pars[18]` (consenso por campo). Divisões via
`EDITIONS[].divisions[{label,v2tid}]` (Overall 4708880 + 13-15 4739657); um
jogador pode aparecer nas duas (cross-divisão, como no England Golf).
```bash
node scripts/scrape-fsga.js                 # EDITIONS (72nd Boys' Junior)
node scripts/scrape-fsga.js 4708880 4739657 # v2tids ad-hoc (uma edição, várias divisões)
```
Wiring: `buildFsgaEntries` + source `fsga` em `MajorPage.tsx`; `FSGA_YEARS`
tenta `fsga_{ano}.json`. `jobDivisionToTournament` ganhou suporte a `pars` por
ronda (retrocompatível — FM/JOB sem `pars` usam o par da divisão).

### scrape-golfgenius-node.js — GolfGenius genérico Node-puro (pages/v2tids) ⭐
**A via preferida para eventos GolfGenius multi-divisão** (UA, México). Sem
Playwright — usa a API v2tournaments (mesmo motor que o `scrape-fsga.js`, que
reexporta `scrapeEdition`/`ggGet`/`courseNamesLabel`). Descoberta:
`/pages/{id}` → `leagueId` → `/leagues/{lid}/widgets/tournament_results?page_id={id}`
(o `<select name="round">` lista `(divisão × ronda)`) → escolhe a vista agregada
("Final Round" = todas as rondas) de cada divisão → `&round={optVal}` devolve o
**v2tid dessa divisão** (leaderboard multi-ronda). Depois: leaderboard +
scorecards + par por buraco dos marcadores (como FSGA).
```bash
node scripts/scrape-golfgenius-node.js "https://www.golfgenius.com/pages/12770450567004716088"  # UA → uajt_2026.json (12 divisões auto)
node scripts/scrape-golfgenius-node.js <url> --league 528939       # página 100% JS sem leagueId no HTML
node scripts/scrape-golfgenius-node.js <url> --skip-scorecards     # só leaderboards (rápido)
```
**Slug/nome**: `SLUG_OVERRIDES` (UA→`uajt`, "infantil juvenil"→`mexnacional`,
"champion of champions"→`coc`) ou `--slug/--name/--year`. Output
`{slug}_{ano}.json` (JobFile).

**Modo `--scope` (cron, 2026-07-23):** `--scope scripts/golfgenius-scope.json`
corre uma lista de eventos (`{url|v2tids, slug, name, year, league, country,
skipScorecards, profiles, disabled, rosterPage, stop}`); `--slug X` filtra a um.
`stop` (2026-08-06) = nº de etapa/fase para eventos multi-ficheiro por ano
(Optimist Phase 1-3) — vai para o JobFile e dá ids `{source}:{ano}:{stop}`
como o ejt. O `fetchRoster` aceita tanto "Handle|Home Club|Country" (England)
como "Last Name|First Name|Graduation Year|Country" (Optimist — junta
First+Last e guarda `gradYear`, que o agregador converte em dobRange de 2 anos
via `dobRangeFromGrad`); a página de roster é auto-descoberta pelo link de nav
"List of Players" OU "Players". ⚠ inferCountry é case-insensitive (o roster
Optimist escreve "UNITED STATES OF AMERICA" em caixa alta). O ficheiro só é
reescrito quando o conteúdo muda (comparação ignorando o `scrapedAt`) → **exit
0** = houve novidades, **2** = nada novo (não é erro), **1** = tudo falhou.
Workflow: `update-golfgenius.yml` (diário 22:00 UTC), que a seguir regenera o
agregador de juniores + o `major-catalog.json` e committa. `--country none`
desliga o país por defeito "US" (ver CoC abaixo).

**Tee sheets = draws REAIS (2026-07-23).** ⚠ O widget dos tee sheets chama-se
**`next_round`** — `tee_times`, `pairings`, `tee_sheet` e `tee_sheets` dão todos
404. A página é descoberta sozinha: o HTML da página de resultados anuncia-a num
input escondido `tee_sheet_button` (⚠ que em edições antigas vem VAZIO apesar de
a página existir — CoC 2024 — daí o fallback pelo link "Tee Sheets" da nav). O `<select>` do widget lista as rondas
(`&round_id=…`) e cada uma traz a tabela `by_tee_times_table` com pares
(hora, jogadores); cada jogador leva a afiliação **e a divisão**, que é o que
permite dar a cada escalão o seu draw (um flight pode juntar escalões — o grupo
entra no draw de todos os que estão nele). Vai para `divisions[].draws` do
JobFile, que a `MajorPage` já converte para as abas Draw R1/R2/R3.
Sem isto o `TournamentDetail` só mostrava draws **estimados** do acumulado
(`synthesizeDrawFromCumulative`) — e nunca para a R1, que não tem ronda anterior
de onde inferir. `--skip-tee-sheets` desliga.

**Merge ADITIVO (default, `--no-merge` desliga):** re-scrapar uma prova a
decorrer apanha jogadores a meio da volta e devolveria MENOS buracos do que já
temos guardado. Antes de escrever, cada volta é casada com a de disco **pela
DATA** (não pelo índice — quem falta a uma ronda desalinha os dias) e fica a que
tem **mais buracos**; voltas que só existem em disco são mantidas. Posição,
total e ±par vêm sempre do scrape novo (autoritativo). Assim pode-se correr o
scraper as vezes que se quiser durante a prova sem perder nada.

⚠ **México é multi-LIGA** (uma liga por categoria de idade, cada uma com Varonil
+ Femenil; a hub `pages/5989156` é 100% JS sem leagueId). Não dá para descobrir
por 1 página → passa-se a lista curada de v2tids com labels (2026, ligas
528936-528949, excluir Scramble/Nassau/Prueba):
```bash
node scripts/scrape-golfgenius-node.js --slug mexnacional --year 2026 --country MX \
  --name "Campeonato Nacional Infantil Juvenil (México)" \
  --v2tids "Varonil 18=4582829,Femenil 18=4582833,Varonil 15=4582863,Femenil 15=4582876,Varonil 12-13=4582867,Femenil 12-13=4582880,Varonil 10-11=4582871,Femenil 10-11=4582884,Varonil 8-9=4582898,Femenil 8-9=4582906,Varonil 7=4582894,Femenil 7=4582902"
```
`--country MX` corrige o país: o `inferCountry` do motor cai em "US" quando a
afiliação é só um clube (sem país) → força "MX" nesses. Para reencontrar as
ligas/v2tids doutro ano: varrer o range de `leagueId` à volta da liga "18 y
menores" e ficar com os v2 cujo `event.name` bate `/VARONIL|FEMENIL/` (excluir
Scramble/Nassau/Prueba). O `discoverDivisions` (modo pages, ex: UA) já **exclui
side events** (`isSideEvent`: Adult/Par 3/Scramble/Nassau/Prueba) e **ordena** as
divisões Boys→Girls, idade crescente.

### scrape-junior-orange-bowl.js — GolfGenius genérico (pages, Playwright, LEGADO p/ multi-divisão)
Serve o JOB/World Junior Girls (páginas simples). Tem UA + México no `EDITIONS` +
`SLUG_OVERRIDES` (incl. `romanToInt` para "LXXV"=75 → 2026) **mas parte-se em
eventos multi-divisão** (GG 403 ao browser / hub JS) — usar o
`scrape-golfgenius-node.js` para esses. Mantido para o JOB clássico:
```bash
node scripts/scrape-junior-orange-bowl.js   # EDITIONS (JOB + World Junior Girls)
```

### scrape-bluegolf.js — generalizado para microsites `{sub}.bluegolf.com` — ⛔ NÃO CORRER
**DESCONTINUADO 2026-07-09** (pedido nominal da BlueGolf — ver aviso na secção
"Scripts — BJGT / WJGC / EOWAGR / Doral"). Documentação mantida só como
referência do formato/parser (útil para parse offline de HTML guardado à mão).
`discoverContests` passou a derivar a base do contest **directamente da URL do
evento** (`.../event/{slug}/…`), cobrindo `fcg.bluegolf.com/bluegolf/fcg26/event/…`
e `jwgc.bluegolf.com/…` além do legado `brjgt`. Regex de sub-evento aceita
`bluegolfw?` e `slugEvent` captura `/event/` (singular). Comandos históricos:
```bash
node scrape-bluegolf.js "https://fcg.bluegolf.com/bluegolf/fcg26/event/fcg268/index.htm" public/data
node scrape-bluegolf.js "https://fcg.bluegolf.com/bluegolf/fcg25/event/fcg251/index.htm" public/data
node scrape-bluegolf.js "https://jwgc.bluegolf.com/bluegolf/jwgc26/event/jwgc261/index.htm" public/data
```
Output: 1 JSON por escalão (`{evSlug}_{cat}.json`, ex: `fcg268_boys_10-11.json`),
formato **bluegolf** (`{tournament,category,course,year,par,si,yards,parTotal,
players:[{name,country,pos,result,total,rounds:[{day,scores,f9,b9,gross}]}]}`) —
o mesmo dos `wjgc_*`/`bjgt_*`. Ligar ao `/major` = registar em `BJGT_URLS`
(`BJGTPage.tsx`) com série/escalão/ano, como os BJGT/EOWAGR. Registados:
`fcg251_*` (2025), `fcg268_*` (2026, 10 escalões, 13-15 Jul) e `jwgc261_*`.

⚠ **Localidade FCG/JWGC é preenchida pelo inscrito e vem suja** — resolvida em
`scripts/lib/bluegolf-location.js` (`splitGradYearCountry`, usada pelo
`scrape-bluegolf.js` da RAIZ). O campo "país" do perfil é `"CLASSE, LOCAL"` e o
LOCAL trazia (1) cidade estrangeira + sigla de estado dos EUA — "Bangkok, CA",
"Hong Kong, FL", "Mexico City, NM" → bandeira americana errada; (2) só a cidade
— "Auckland", "Tokyo", "宇都宮" → sem bandeira. Resolução por confiança:
**(a)** um segmento é um país (também colado no fim: "Cap Cana Dominican
Republic") → **(b)** dicionário de cidades, onde as inequívocas (`strong`)
GANHAM à sigla de estado e as ambíguas (London, Melbourne, Panama City,
Ontario, La Canada — todas com gémea nos EUA) só valem sem sigla → **(c)** sigla
→ EUA/Canadá (territórios GU/MP/PR/VI/AS com bandeira própria). Quando o país
resolvido não é EUA/Canadá a sigla é lixo e sai do `hometown` mostrado.
Testes: `scripts/lib/bluegolf-location.test.js`.

`node scripts/backfill-bluegolf-location.js [--dry-run]` aplica a resolução aos
`fcg*`/`jwgc*` já scrapados (BlueGolf está descontinuado — **não re-scrapar**;
a string original é reconstruída do `hometown`/`country` guardados). É
idempotente por uma guarda que salta jogadores cujo país já está resolvido — sem
ela a 2ª passagem re-derivava de um `hometown` já limpo ("Tamuning" sem ", GU")
e perdia o país. Passagem 2026-07-19: 552 jogadores corrigidos; ficam ~28
localidades genuinamente ambíguas (Santiago, San Jose, Victoria, Milton…) sem
país — de propósito, mostram só o texto da cidade.

### Tab "Edições anteriores" na `/major` (2026-07-23)

Última tab da barra de cada escalão (a seguir a Resumo/📋 Scorecards/Match
Play): uma coluna por EDIÇÃO do mesmo torneio+escalão, linhas = posição,
células = nome · total · ±par · pancadas de cada ronda. É o equivalente à tab
`scores` do `/kids2/next-t` (`HistoricTopNTable`), que só serve o mundo USKids
(lê `uskids-member-history-slim.json` + `autoRivals`) — daí um componente
próprio, `src/ui/circuit/PastEditionsTable.tsx`. Responde a "que score foi
preciso para ganhar / entrar no top-10 neste escalão ao longo dos anos".

Funciona em **TODAS** as fontes do MAJOR porque o carregador (`PastEditionsTab`
na `MajorPage`) passa pelo **`loadDivisionsFor`** — o mesmo loader que o shell
usa para abrir um torneio — em vez de ler os JobFiles directamente. Anos vêm do
`major-catalog.json`; tudo lazy (só ao abrir a tab) e cacheado.

Duas vias de injecção, conforme a divisão:
- **`renderFull`** (JOB, FM e as JobFile GolfGenius/GolfBox) → `extraTabs` do
  `TournamentDetail`;
- **render por secções do shell** (BJGT/EOWAGR/FCG/JWGC, Doral) → novo
  `pastEditionsTab` no `CircuitConfig`, que o `CircuitShell` acrescenta aos
  `trailingTabs`.

⚠ **Ordenar por total põe quem NÃO acabou em 1º** — 2 voltas somam menos que 3
(168 < 205) e um WD aparecia como campeão; num caso real o vencedor (205, −11)
caía para 89º atrás de 88 desistências. A chave é **voltas completas** desc,
depois voltas com gross, e só então o total. "Volta completa" distingue os dois
motivos para um cartão ter buracos em branco: se o gross é MAIOR que a soma dos
buracos visíveis, o cartão é que está truncado na fonte (conta como completa);
se é IGUAL, a volta está a decorrer (não conta) — ver `isFullRound`. Os totais
de quem não acabou aparecem em itálico esbatido.

⚠ **O match de escalão entre edições exige o mesmo FORMATO de nome.** Só idade
±1 não chega: no Future Masters casava "10 and Under" com "11 & 12". A regra é
sexo igual + o nome sem dígitos igual ("Under 15 Girls"→"under girls" bate com
"Under 14 Girls"; "10 and Under"→"and under" não bate com "11 & 12").

⚠ **Destaque Manuel/PT é por CÉLULA** (`td.cell-manuel` / `td.cell-portuguese`
no `App.css`, mesmas cores das regras `.row-*`): cada coluna é um torneio
diferente, logo a linha tem jogadores distintos e `.row-manuel` pintaria a linha
toda. Nunca inventar tokens novos aqui — a 1ª versão usava
`var(--bg-manuel, …)`, token inexistente, e ficava com o fallback hardcoded
(cores diferentes do resto da app).

### Deep-link de abas (`?tab=…`) unificado — 2026-07-23

O `TournamentDetail` já sincronizava a aba com o URL; o `IntlTournView` (a barra
das páginas assentes no `CircuitShell` — MAJOR BJGT/Doral, RFEG, FFG, England,
GJGL, Drive) tinha a aba só em estado local, por isso `?tab=…` não abria nada
lá. Agora cada aba do `IntlTournView` tem uma `key` com o MESMO vocabulário
(`admissions` · `draw:N` · `round:I` · `precut` · `resumo` · `scorecards` +
a chave das leading/trailing tabs) e o `CircuitShell` liga-a ao `?tab=` via
`useSearchParams` (escrita com `replace` para não encher o histórico). O URL
manda enquanto apontar para uma aba existente; caso contrário mantém-se a
escolha automática (Resumo).

### ⚠ Campo hardcoded na família BlueGolf (corrigido 2026-07-23)

O `tDataToTournament` (`BJGTPage.tsx`) fixava o campo em "Villa Padierna —
Flamingos"/"— Alferini", com uma excepção para o EOWAGR. Quando o **FCG** e o
**JWGC** entraram nesta família (também BlueGolf) herdaram o hardcode: o FCG
Callaway World Championship aparecia a jogar-se em Villa Padierna em vez de
Desert Willow. Os ficheiros BJGT/WJGC trazem `course: "Villa Padierna"` sem o
percurso e o EOWAGR vem vazio — daí os hardcodes serem úteis — mas fcg/jwgc
trazem o campo certo, por isso agora só bjgt/eowagr usam o valor fixo e as
restantes séries usam `data.course`.

### 'Champion of Champions' World Championship (`coc`) — 2026-07-23

Convite mundial de campeões nacionais juvenis no **Lough Erne Resort** (Irlanda
do Norte), 3 voltas nos campos **Faldo (par 72)** e **Castle Hume (par 71)**;
~250 miúdos de 40+ países, escalões **Under 7/9/12/14/15/19 Boys+Girls** (o
Under 9 e o Under 7 jogam **27 buracos = 3×9**). Ficheiros
`coc_{2023,2024,2025,2026}.json`, source `coc` na `/major`.

⚠ **Os subdomínios `coc20…coc26.golfgenius.com` NÃO são um por ano** — só o
`coc26` existe (os outros caem em `golfgenius.com`), e qualquer um deles serve a
mesma página se lhe dermos o id. As edições anteriores vivem noutras ligas, com
o prefixo **`mpg-coc{YY}`** (MG Pro Golf, o organizador) — descobertas pelo CDX
do Wayback Machine, porque o site oficial (`championofchampions.co`) só linka a
edição em curso e, das passadas, publica apenas o campeão de cada escalão:

| Ano | Página de resultados | Como se chega lá |
|---|---|---|
| 2026 | `pages/12114827382448210411` | `coc26.golfgenius.com` |
| 2025 | `pages/10999123520230801498` | `mpg-coc25.golfgenius.com` |
| 2024 | `pages/10007590223342485762` | `mpg-coc24.golfgenius.com` ou `ggid/coc24` |
| 2023 | `pages/8989257390612300246`  | `ggid/cocwc23` |

2020-2022 **não estão no GolfGenius** (o torneio nasceu em 2020 em Powerscourt).

Quatro armadilhas resolvidas neste evento — todas no motor partilhado
(`scrape-fsga.js`), por isso valem para qualquer fonte GolfGenius:
1. **Uma vista, várias divisões.** O `<select name="round">` só muda de RONDA e
   o widget traz os 8-10 escalões empilhados. O agrupamento por label descobria
   "Round 1/2/3" em vez de divisões → `discoverDivisions` detecta labels que só
   nomeiam a ronda e passa a tratar **cada v2tid do widget** como uma divisão,
   com o label vindo do `event.name` ("54 Hole World Championship - Under 12
   Boys" → "Under 12 Boys").
2. **Rondas fora de ordem.** Com o evento a decorrer o GG devolve a ronda em
   curso PRIMEIRO (medido: R3, R1, R2) → a R1 ficava com o gross da ronda por
   jogar e o dia 1 saía a zero. `sortRounds()` reordena pela data de `ev.rounds`.
3. **Outro vocabulário de marcadores.** As células são `par-hole` /
   `birdie-hole` / `eagle-hole` / `plusN-hole` (não os `circle`/`square` do
   FSGA) → sem isso TODA a célula contava como par e o par derivado saía igual
   ao score ("Under 12 Girls par 82"). Ver `parAdjust`.
4. **Chave de campo colidia.** `courseKey` ficava-se pelo último segmento depois
   do "-": "Faldo - World Championship" e "Castle Hume - World Championship"
   davam ambos `world championship` e misturavam os pares dos dois campos. Passa
   a usar o nome completo (sem o tee entre parênteses).

Mais: `parseScorecard` passou a ler **cada nine em separado** (cartões de 9
buracos usam a mesma tabela de 18 com metade em branco) e a ronda leva
`startingHole`; o consenso de par aceita 9 ou 18 e a chave inclui `|f9`/`|b9`
(front e back do mesmo campo têm pares diferentes).

⚠ **Tecto por buraco = 30, não 15.** O Maximilian Oberlin fez **17** no buraco 8
da R2 de 2026: com o tecto antigo o `readNine` rejeitava o nine inteiro e a
volta de 100 entrava na UI como uma volta de **9 buracos** (só o back). O tecto
serve só para rejeitar lixo — a célula vazia (buraco por jogar) já é rejeitada
por não ser numérica.

⚠ **Nacionalidade:** a afiliação do GG é o PRÓPRIO PAÍS (~50 valores, incl.
"Great Britain and Ireland", "Golf Ireland", "Hong Kong, China", "Türkiye"),
mas **a edição de 2023 não publica afiliação nenhuma**. O default `US` do
`inferCountry` (correcto para FSGA/UA, cujas afiliações são cidades
americanas) carimbava 243 miúdos de 40 países como americanos → `inferCountry`
ganhou um `fallback` e o `--country none` passa `null`. Todas as entradas CoC
do scope usam `country: "none"`.

### Enriquecimento por DOB (ficha GG `/profiles`) — México
O `scrape-fsga.js` ganhou `fetchProfile(id)`: o scorecard detail page linka
`/profiles/{id}` (ficha do jogador), que a FMG-México expõe com **DATE OF BIRTH
+ CLUB + AÑO DE GRADUACIÓN**. `fetchScorecard` devolve `{rounds, profileId}` e,
com `opts.profiles`, faz um fetch por jogador → grava `dob`/`club`/`gradYear`.
Auto-ligado quando se passa `--country` no `scrape-golfgenius-node.js`. México
2026: **136/238 DOBs** (as divisões novas 8-9/7 não têm scorecards→sem perfil).
Ex: Mauricio Mijares Lugo → `dob 2014-10-07`, Campestre Torreón.

### MAJOR → kids2 (agregador) — 2026-07-03
Directiva "todos os dados de MAJORpage enriquecem KIDS2". Os ficheiros JobFile
(FSGA/UA/México) são lidos por 3 adapters novos em `scripts/aggregator/sources/`
(`fsga.js`, `uajt.js`, `mexnacional.js`) que partilham
`scripts/aggregator/util/jobfile.js` (`buildJobfileSource` + `parseSexAge`).
Registados no `SOURCES` do `index.js`. O **México passa `dob`** → matching FORTE
por nome+DOB (como o fcg catalão); UA/FSGA são fracas (nome+país US). UI kids2
registada (checklist completo): `Kids2SourceKey`/`SOURCE_PILLS`
(`KIDS2Page.tsx`), `SourceKey` (`kids2/Sidebar.tsx`), `--source-{fsga,uajt,
mexnacional}` (`tokens.css`) + `SOURCE_COLORS`/`SOURCE_LABELS`
(`EvolutionChart.tsx`), paths de trigger no `build-juniors.yml`. Build validado:
**15878 juniores** (+~1.6k), 9/9 sanity checks (Manuel×Dmitrii=6 mantido).
⚠ O matcher é conservador: "Mauricio Mijares" (uskids, sem DOB) **não** funde
automaticamente com "Mauricio Mijares Lugo" (mexnacional, com DOB) — nomes
diferentes + sem chave forte partilhada. Resolvido por `forceMerge` em
`juniors-overrides.json` (`uskids:564372` + `fm:fm-…` + `mexnacional:mexnacional-…`)
→ 1 entidade com 34 torneios. Padrão a repetir para outros casos MX↔US.

**Card México na ficha kids2** (`HeroIdentity.tsx`): jogadores com
`nationality/country === "MX"` mostram um `FedCard` "México" (clube + `FMG · N
torneios`) **em vez do FFG** (a FMG não expõe fed code/licença; só a ficha GG
com DOB/clube). Flag em `SOURCE_FLAGS.México = flagOf("Mexico")`.

> **Nota México — handicaps:** a FMG (`fmg.org.mx/ghin`) publica índices dos
> jovens mas o GHIN bloqueia consultas fora do México. Não incorporado.

---

## Scripts — FFG (França)

### Categoria FFG de um jogador (`cat`/`catYear`) — 2026-07-23

A FFG **não expõe DOB**, por isso a categoria de cada jogador do
`france-players.json` é inferida. ⚠ **A série sozinha não chega**: no portal
resultats as divisões de uma prova juvenil chamam-se muitas vezes só
"Messieurs"/"Dames" (a idade vive no NOME — "1re Division U16 Garçons"). Antes
`cat` saía só do `lastSerie` e apenas **4560/13230** jogadores ficavam
classificados; os outros caíam fora de QUALQUER filtro de escalão e do toggle
"Só Jovens" da `/ffg/info/joueurs` (o Xan Iribarne, inscrito no torneio mais
recente, era invisível). O `build-france-players.js` passou a acumular os
escalões por ÉPOCA a partir de **série + nome da prova** (`addEsc`) → **13187/13230**.

`cat` = escalão **mais novo** da época mais recente com sinal de idade
(`categoriaDe` + `ffgEscalaoMaisNovo`), **não** o da última prova: um júnior
pode inscrever-se acima do escalão dele mas nunca abaixo, e o Xan (U12) fez a
"1re Division U16" em Julho — pelo máximo ficava Sub-16. `catYear` guarda a
época usada (tooltip da coluna Catégorie).

A regra canónica vive em `src/utils/ffgEscalao.ts` (`ffgEscalaoCanonico` +
`ffgEscalaoMaisNovo`), **espelhada** em `scripts/lib/ffg-escalao.cjs` para o
build Node — `scripts/ffg-escalao-mirror.test.js` compara as duas sobre os
labels reais do portal e falha se divergirem (padrão do `lib/course-aliases.cjs`).
A `FFGPage` reexporta `ffgEscalaoCanonico` (metade da app importa-o de lá).

### Torneios+resultados por jogador — `ffgolf-player-tournaments.json` (2026-07-23)

Clicar numa linha da `/ffg/info/joueurs` expande a lista de **todos os torneios
do jogador com o resultado** (data · torneio · série · posição · voltas ·
total), e o nome do torneio abre a leaderboard completa em `/ffg/t/{entryId}`.
UI: `src/pages/ffg/PlayerTournaments.tsx`.

Gerado pelo **mesmo passo** que o `france-players.json`
(`build-france-players.js`, 2ª saída) — de propósito: a dedup de participações
é a MESMA que a da coluna 📊 Tot (por `trnId`; um jogador aparece por vezes em
2 séries do mesmo torneio), por isso o nº de linhas bate sempre certo. O
builder avisa se divergir.

Formato compacto (~95k participações → 2,5 MB): catálogo `tournaments[]`
partilhado + labels de série internados em `series[]`, e cada linha é
`[ti, pos, total, [gross por volta], si]`. Carregado só quando o utilizador
expande a primeira linha (não pesa no load da página).

⚠ **O `pos` do portal FFG é a classificação do TORNEIO INTEIRO, não da série** —
medido: em 1212/1225 provas o máximo bate certo com o nº de licenças do torneio,
e há séries de 41 jogadores com gente em 42º. Por isso o "N.º de" vem de
`tournaments[].np` (licenças distintas de todo o `trnId`) e não do tamanho da
série. Duas sentinelas: `pos ≥ 900` = sem classificação, e **sem score não há
posição** (nas provas por jogar / só com tee sheet o `pos` é a ordem da linha na
lista de partida — dava "91º" a quem nem jogou; nesses casos mostra-se
"inscrito").

### Torneios+resultados por jogador (ES) — `spain-player-tournaments.json` (2026-07-23)

Gémeo espanhol do `ffgolf-player-tournaments.json`: clicar numa linha da
`/rfeg/info/jugadores` expande as provas do jogador com posicao e voltas, e o
nome abre a classificacao em `/rfeg/{source}/{id}`. UI partilhada com a FFG:
`src/ui/PlayerTournamentsPanel.tsx` + adaptador `src/pages/rfeg/PlayerTournaments.tsx`.
⚠ O painel recebe TODAS as licencas do jogador (a lista agrupa quem mudou de
clube) e deduplica por prova.

**Substituiu o `build-spain-player-results.js`** (removido): esse gerava um
`spain-player-results.json` de 9,6 MB, era corrido e committado pelo workflow
mas **nunca teve consumidor no `src/`** — a UI nunca chegou a ser feita. O que
tinha de bom foi portado (matching de nome contra os inscritos da propria prova,
FCG/golfdirecto, e o unswap `licencia`↔`nivel` do NextCaddy).

Linhas = inscricoes (`sources[]` do `licencia-dob-lookup.json`) ∪ classificacoes.
As inscricoes trazem provas em que o jogador nao chegou a jogar — mostradas com
o estado (baja/reserva/no admitido). As classificacoes trazem os **Campeonatos
de España publicados so no LiveGolfScoring** (164 provas), que nao tem lista de
inscritos na RFEGolf e por isso nao apareciam em `sources[]` nenhuma.

⚠ **`counts` (tot/ano) vem deste ficheiro para o `spain-players.json`** — o
`build-spain-players-export.js` le-os, para a coluna 📊 Tot ser exactamente o nº
de linhas do painel. Logo **a ordem no `update-spain.yml` importa**:
`build-lgs-twins` → `build-fcg-rivals` → `build-spain-player-tournaments` →
`build-spain-players-export`.

Armadilhas medidas (todas com caso real):
- **`pos` do NextCaddy é dentro da CATEGORIA**, e um tour junta 12 categorias →
  o "de N" é por LINHA (tamanho da categoria), não do torneio: "34º de 768" era
  na verdade 34º de 113.
- **Os blocos do microsite RFEGolf são muitas vezes de UMA jornada**
  ("Clasificación - 3ª Jornada", 60 jogadores). Quando a prova tem gémeo LGS, o
  **LGS ganha** — senão o Sub-16 2025 dizia "1º de 60" a quem foi 3º de 90.
- **Classificações por handicap trazem LÍQUIDOS** nos campos de gross → preferir
  sempre a scratch (mesma regra da memória "NextCaddy par real = tarjeta").
- **Gémeos RFEGolf↔LGS que o `rfegolf-lgs-twins.json` não apanha** (cruza por
  nome+ano, e a RFEG baptiza o mesmo evento de forma diferente em cada
  plataforma) são detectados aqui por ROSTER — possível porque os nomes do LGS
  ficam resolvidos em licenças. Guardas contra o falso gémeo: as duas datas têm
  de existir e ficar a ≤7 dias, ≥5 licenças e ≥80% de sobreposição. Sem o guard
  de data, a "Copa S.M. El Rey" (sem data) fundia com um Sub-16 de outro ano a
  0,81 — a mesma coorte de juniores de topo joga tudo.
- **Deep-link para provas agrupadas**: o `buildRfegEntries` funde as categorias
  de um Campeonato numa entrada `grp-…`, e um link `/rfeg/{source}/{id}` não
  batia com entrada nenhuma. As entradas combinadas passaram a levar
  `memberIds[]` (novo campo opcional em `CircuitEntry`) e o `selectedId` da
  RFEGPage resolve o membro → grupo.

---

## Scripts — England Golf (GolfGenius)

Cada torneio England Golf vive num microsite GolfGenius (alguns em `www.golfgenius.com`, outros em subdomínios `eg-{slug}{YY}.golfgenius.com`). A página `/england` é uma duplicação minimalista da `/bjgt` (mesmos `TournView`, sub-tabs por ronda, ManuelPill, etc.).

**Catálogo:** `public/data/england-golf-catalog.json` — 39 edições de torneios juvenis 2023-2026 (Carris/McGregor/Reid Trophies, English U18 Amateur, English Girls' Open/U16/U14, Justin Rose Telegraph, Bronte Law Junior Series, England U16 v Spain, Boys' County Finals, Junior Champion Club, English Schools). Cada entry tem `year`, `section`, `slug`, `title`, `gender`, `ageGroup`, `gg_base`, `gg_page`.

**Cobertura efectiva:** 19/28 das edições 2023-2025 com dados completos. 9 falham por motivos estruturais do GolfGenius (ver "Limitações conhecidas" abaixo).

### ⚠ A época de 2026 esteve um Verão inteiro por scrapar (2026-08-30)

O England era o **único circuito sem automação**: não havia workflow nenhum a
correr o `scrape-england-golf.js`, e todos os `england_*.json` tinham
`scrapedAt: 2026-05-18` — o dia em que o scraper foi escrito. Some-se a isso o
catálogo ser **curado à mão** e os ids do GolfGenius **mudarem todos os anos**
(o subdomínio inclusive: `eg-carristrophy25` → `eg-carristrophy26`), e o
resultado foi 2026 ficar com **uma única entrada** — o `bronte-law-farnham-2026`,
inserido em Maio quando a página ainda nem estava publicada. Corrigido com as
três peças abaixo: descoberta, 11 entradas novas no catálogo e o
`update-england.yml` semanal.

### Descoberta de provas novas — `discover-england-golf-events.js`

A fonte é o **directório público do England Golf** no GolfGenius:
`/leagues/36129/customer_directories/10291/directory_iframe` (o link vive no
próprio `englandgolf.org`). Lista os ~41 eventos da época com, para cada um, um
link `/ggid/{ggid}` que redirecciona para a **página de resultados** — que é
exactamente o `gg_page` que o scraper quer. Os ggid terminam no ano a 2 dígitos
(`carris26`, `reid26`, `bljse26`), o que dá o filtro por época de borla.

```bash
node scripts/discover-england-golf-events.js            # juvenis do ano corrente
node scripts/discover-england-golf-events.js --all      # todos os eventos (incl. adultos)
node scripts/discover-england-golf-events.js --year 2027 --json /tmp/eg.json
```

Exit **0** = há provas por acrescentar · **2** = nada novo · **1** = erro.
Imprime as entradas já em JSON, prontas a colar — com `section`/`gender`/
`ageGroup` a `"REVER"`, **de propósito**: são esses três campos que fazem a
`/england` agrupar as provas por secção e não há como inferi-los do nome com
confiança. O workflow corre a descoberta mas **nunca edita o catálogo** — só
escreve o aviso no resumo do run.

⚠ **O directório é uma app React** — o HTML cru vem vazio, é preciso browser.
⚠ **O GolfGenius devolve 403 a um `page.goto` directo em `/pages/{id}`** vindo de
browser automatizado, mas serve o directório e os widgets à mesma. Por isso a
resolução `ggid → /pages/{id}` é feita por `fetch` DENTRO do contexto do browser,
nunca por navegação.
⚠ **Cada evento tem DUAS páginas e nem sempre servem as duas.** O cartão do
directório tem um link "Results" e o `/ggid/{ggid}` redirecciona para uma página
de aterragem — que podem ser diferentes. No **Carris Trophy 2026** a aterragem é
`/pages/6135942` ("Leaderboard"), onde o dropdown de eventos vem **vazio** e o
scraper salta o torneio com `⚠ dropdown sem eventos`; o "Results" do cartão
(`/pages/5644445`) abre a vista certa, com as 4 rondas e 195 jogadores. O
discover propõe o "Results" primeiro e imprime a aterragem como `alt=` — se um
torneio do catálogo der "dropdown sem eventos", **trocar pelo outro id antes de
o dar como falhado**.

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

**Exit codes (2026-08-30):** **0** = gravou ficheiros novos/alterados · **2** =
nada novo (NÃO é erro — o workflow salta o commit) · **1** = erro real. O
ficheiro só é reescrito quando o conteúdo muda **ignorando o `scrapedAt`**
(`sameContent`) — sem isso cada run do cron produzia um diff em todos os
ficheiros só por causa do timestamp e o commit semanal era ruído puro.

**Variáveis de ambiente (2026-08-30):** `launchOptions()` deixa o Playwright
adaptar-se ao ambiente sem mexer no CI. `PLAYWRIGHT_CHROMIUM_EXECUTABLE` aponta
para um Chromium pré-instalado; se houver `HTTPS_PROXY`, passa-o ao browser
**mais** `--disable-quic --disable-http2 --ssl-version-max=tls1.2` (sem estes o
Chromium não fala com um proxy que re-termina TLS — dá `ERR_CONNECTION_RESET`
enquanto o `curl` funciona perfeitamente). Em CI nenhuma das duas está definida
e o comportamento é o de sempre.

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

### Limitações conhecidas — torneios que não passam

| Slug | Razão |
|---|---|
| `carris-trophy-2024`, `mcgregor-trophy-2023`, `english-girls-championship-2025` | "dropdown sem eventos" — England Golf arquivou e removeu os dados do GG |
| `english-girls-open-stroke-play-2023`, `english-junior-champion-club-2024`, `english-junior-champion-club-2025`, `england-u16-v-spain-u16-2025` | Iframe redirecciona para `campaigns/2261/run` (template homepage do England Golf), sem leaderboard real montada |
| `bronte-law-farnham-2026`, `bronte-law-moor-allerton-2026` | Idem — `campaigns/2263/run`. Tentados os DOIS ids (aterragem e "Results"). |
| `boys-county-finals-2025`, `boys-county-finals-2026` | **Match play entre condados** — o dropdown traz "Somerset vs Yorkshire", "Nottinghamshire vs Hampshire"… O `isStrokePlay` exclui match play **de propósito** (não há leaderboard individual para extrair). Não é falha do scraper nem da página. |
| `english-schools-team-2026`, `english-schools-scratch-team-2026` | Campeonatos por EQUIPAS (escolas) — "dropdown sem eventos" nos dois ids. |

Estes não são bugs do scraper. Confirmado via Chrome live: as páginas existem mas o iframe `tournament_results` nunca é carregado.

⚠ **Estas provas contam em `semDados`, NUNCA em `fail`** (2026-08-30) — e por isso
não fazem o cron ficar vermelho. Se contassem, o alarme tocava **todas as
semanas**, porque o catálogo tem provas permanentemente sem stroke play e porque
no início de cada época NENHUMA prova do ano tem ainda resultados. Um alarme que
toca sempre deixa de ser lido — que é, no fundo, como o England chegou a estar
três meses por scrapar. `fail` fica reservado a excepções (exit 1).

### Época de 2026 — o que ficou coberto

8 ficheiros / 7 provas, scrapados a 2026-08-30:

| Prova | Jogadores | Par |
|---|---|---|
| Carris Trophy (4 rondas) | 144 | 70 |
| Reid Trophy (3 rondas) | 144 | 70 |
| McGregor Trophy | 144 | 71 |
| English Girls' Open Stroke Play | 142 | 73 |
| English Girls' U16 & U14 (`_div1` + `_div2`) | 51 + 93 | 73 |
| Bronte Law — Royal Mid Surrey | 30 | 73 |
| Bronte Law — Edgbaston | 27 | 72 |

Todas entram no canónico do kids2 (agregador: 30296 juniores · 20898 torneios,
9/9 sanity checks, Manuel×Dmitrii = 7 mantido).

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
  EC, ECDET, HOLE_STATS, TEE, CURRENT_FED, HCP_INFO, META }
```
⚠ **Sem `CROSS_DATA` desde 2026-09-06** — a tabela global vive em
`/data/cross-data.json` e é fundida em runtime pelo `playerDataLoader`
(ver "Deployment Storage do Vercel").

---

## Torneios recentes reconstruídos (`/torneios-recentes`) — 2026-07-10

Página utilitária (fora da NavBar) que lista os **últimos torneios em que os
nossos jogadores participaram**, mesmo os que NÃO temos scrapeados. Ideia:
cada volta WHS de um jogador (`output/{fed}/analysis/data.json`) traz
`eventName`, `ccode`/`tcode`, data, gross, tee e o scorecard buraco-a-buraco
(`HOLES[scoreId]`). Agregando por torneio (`ccode|tcode`) e juntando todos os
nossos que lá aparecem, reconstrói-se "quem dos nossos jogou + a pontuação".
Torneios com **muitos** dos nossos são bons candidatos a scrapear a sério.

- **Build:** `scripts/build-recent-tournaments.js` → `public/data/recent-tournaments.json`
  (formato "fpg-pull" — `tournaments[].players[].roundScores[]`, o MESMO que a
  FPGPage/DrivePage consomem). Só voltas `scoreOrigin==="Torn"` com tcode real
  (exclui actos administrativos: tcode `000000000`, "Transferência de Clube").
  Agrupa multi-dia pelo `ccode|tcode` (as rondas diferem por data; nome limpo
  via `cleanTournName` tira sufixos "D2"/"R3"). `date` em ISO (`toIsoDate`);
  `parTotal` = par de UMA ronda (convenção pull-torneios — os componentes
  multiplicam por nº de rondas). Cada torneio ganha `scraped` (já há leaderboard
  completa em pull-torneios/drive/aquapor/jovens?) e `nOurs` (nº de nossos).
  Janela default `--since 2024-01-01` (~2.8k torneios, ~10 MB). CLI:
  `--since`, `--min-ours`, `--all-origins`. Teste: `build-recent-tournaments.test.js`.
  Também emite `public/data/recent-tournaments-scrape-scope.json` (ver "Auto-scrape").
- **Página:** `src/pages/RecentTournamentsPage.tsx`. Lista = tabela sortável
  (`useSort`+`SortableHdr`, estilo `player-list-table`) com filtros (pesquisa,
  mín. nº nossos, estado scrapeado, ano) + coluna **FPG** (link directo à
  classificação oficial, `fpgScoringUrl`). Clicar numa linha: torneios com **< 10
  nossos EXPANDEM inline** (linha `row-expanded` com `colSpan`), a partir de **10
  abrem em janela nova** (rota `/:key`). O detalhe **reutiliza `TournamentDetail`**
  da FPGPage (tabs de ronda + Resumo + Scorecards; os links Inscrições/Draw/
  Scoring ↗ da Federação já vêm de lá). ⚠ A posição é **entre os nossos**, não a oficial.
- **Auto-scrape dos valiosos (>5 nossos):** o build emite
  `recent-tournaments-scrape-scope.json` = `[{tclub,tcode,name,nOurs}]` dos
  **não scrapeados com ≥6 nossos** (só FPG, ccode presente), ordenado por `nOurs`
  desc. O `update-classif.yml` tem um passo que corre
  `scrape-classif-node.js --scope <esse ficheiro> --limit 80 --out public/data/pull-torneios006.json`
  (`--limit` novo no scraper). Merge aditivo → o scope **auto-drena** a cada
  semana (à medida que ficam scrapeados, saem do scope no build seguinte) e a
  FPGPage passa a mostrar o leaderboard completo (lê `pull-torneios000..NNN`).
- **Automação:** regenerado no `update-data.yml` (a seguir a rebuild dos
  índices de campos), committa `recent-tournaments.json` + o scope.

## Todos os ficheiros JSON em public/data/

| Ficheiro | Circuito | Gerado por | Scorecard? | Usado em |
|----------|----------|------------|------------|----------|
| pull-torneiosNNN.json (000-NNN) | FPG | scrape-classif-node.js (novos) ou pull-torneios.js browser (legacy) | ✓ | FPGPage, KIDSdataLoader (pull-torneios000 autoritativo) |
| fpg-admissions-draws.json | FPG | scrape-fpg-admissions-draws-node.js (novo) | ✗ | AdmissionsTab, DrawTab (inscrições + pairings pré-jogo) |
| players.json | FPG | pipeline.js | ✗ | JogadoresPage, FPGPage, KIDSdataLoader (enriquecimento) |
| master-courses.json | FPG | pipeline.js (+ add-paco-do-lumiar.js p/ campos manuais) | ✓ | CamposPage |
| course-players.json | FPG | build-course-players.js | ✓ | CamposPage (`_players` dos campos PT — quem jogou + scores por volta) |
| course-player-names.json | FPG | build-course-player-names.js | ✗ | CamposPage (mapa fed→nome + `dob`/`sex` p/ os jogadores dos campos) |
| recent-tournaments.json | FPG | build-recent-tournaments.js | ✓ | RecentTournamentsPage (`/torneios-recentes`) — torneios reconstruídos das voltas dos nossos |
| drive-data.json | FPG | scrape-drive-aquapor-v7.js | ✓ | DrivePage |
| aquapor-data.json | FPG | scrape-drive-aquapor-v7.js | ✓ | DrivePage |
| melhorias.json | FPG | manual | ✓ | JogadoresPage, CamposPage |
| away-courses.json | FPG | pipeline.js | ✓ | CamposPage |
| player-stats.json | FPG | enrich-players.js | ✗ | JogadoresPage |
| drive-sd-lookup.json | FPG | build-drive-sd-lookup.js | ✗ | DrivePage |
| {fed}/analysis/data.json | FPG | make-scorecards-ui.js | ✓ | JogadoresPage, BJGTAnalysisPage, DrivePage |
| uskids-results.json | USKids | fetch-uskids-results.js | ✓ | USKIDSPage, KIDSdataLoader |
| uskids_torneios_completos(1-40).json | USKids | browser script | ✓ | USKIDSPage, KIDSdataLoader |
| uskids-member-history.json | USKids | fetch-uskids-member-history.js | ✓ (sem par/SI) | **Em `data-archive/`** — fonte para build-slim |
| uskids-member-history-XXX.json | USKids | fetch (legacy) | ✓ (sem par/SI) | **Em `data-archive/`** — fonte para build-slim |
| uskids-member-history-slim.json | USKids | build-member-history-slim.js | ✓ (sem par/SI) | KIDSdataLoader (Fase 2) + kids/FieldRivaisDashboard (tabs Scores/Scorecards/Campo/Previsão) |
| uskids-rich-players/{mid}.json | USKids | fetch-uskids-rich-players-node.js | ✓ (com teeMarker, startTime, groupNumber) | **Em `data-archive/`** — 1 ficheiro por jogador, carreira completa rica |
| uskids-rich-flight-cache.json.gz | USKids | fetch-uskids-rich-players-node.js | ✗ | **Em `data-archive/`** — cache (tcode → flights/players) para a pipeline rica; **gzipada** (em claro passava o limite de 100 MB do GitHub) |
| uskids-rich-run-summary.json | USKids | fetch-uskids-rich-players-node.js | ✗ | **Em `data-archive/`** — sumário do último run (debug) |
| uskids-field.json | USKids | fetch-uskids-field.js | ✗ | USKIDSPage |
| uskids-field-sizes.json | USKids | (automação) | ✗ | KIDSdataLoader (uskFieldSizes) |
| uskids-discovery-cache.json | USKids | fetch-uskids-discovery.js | ✗ | fetch-uskids-results.js |
| t_de_tournaments_do_uskids.json | USKids | (automação, 6448 entries) | ✗ | KIDSdataLoader (uskTournNames fallback) |
| bjgt_*.json, wjgc_*.json | BJGT/WJGC | scrape-bluegolf.js | ✓ | BJGTPage, KIDSdataLoader |
| eowagr25_*.json | EOWAGR | scrape-eowagr25*.js | ✓ | KIDSdataLoader |
| ftm_doral_2024/2025.json | Doral | scrape-golfgenius.js | r1/r2Gross | KIDSdataLoader |
| coc_{2023..2026}.json | Champion of Champions | scrape-golfgenius-node.js (`--scope`) | ✓ (9 e 18 buracos) | MajorPage (source `coc`), aggregator (`sources/coc.js`) |
| france-players.json | FFG | build-france-players.js | ✗ | FFGPage (`/ffg/info/joueurs`), KIDSdataLoader (france-enrich), aggregator |
| ffgolf-player-tournaments.json | FFG | build-france-players.js | ✗ | FFGPage — torneios+resultados de cada jogador (painel expansível) |
| spain-players.json | RFEG | build-spain-players-export.js | ✗ | RFEGPage (`/rfeg/info/jugadores`), KIDSdataLoader, aggregator |
| spain-player-tournaments.json | RFEG | build-spain-player-tournaments.js | ✗ | RFEGPage — torneios+resultados de cada jogador (painel expansível) |
| england_{slug}.json | England Golf | scrape-england-golf.js | ✓ (com teeColour/metersPlayed[18] por ronda) | EnglandGolfPage |
| england-golf-catalog.json | England Golf | manual | ✗ | EnglandGolfPage (sidebar) |
| torneio-greatgolf.json | Greatgolf | scrape-drive-aquapor-v7.js | ✓ | KIDSdataLoader |
| rivals-intl.json | — | — | ✗ | (registado em dataRegistry) |
| tournament-links.json | — | — | ✗ | (registado em dataRegistry) |

---

## Redesign /campos + /simulador (2026-06-13)

Sessão grande de melhorias visuais e funcionais às páginas `/campos` e
`/simulador`. **Sem gráficos** (decisão da utilizadora). Doc de pesquisa/ideias
em `docs/melhorias-campos-simulador.md`.

### Módulos partilhados novos

| Ficheiro | Exporta | Papel |
|---|---|---|
| `src/utils/teeGroups.ts` | `physicalTeeGroups(tees)`, `physicalTeeKey(tee)`, `sexesIn(groups, pick)`, tipos `SexKey`/`TeeRating`/`PhysTeeGroup` | Agrupa tees por **tee FÍSICO** (cor + distância total). O mesmo tee aparece como entradas M e F separadas (CR/Slope diferentes) — aqui junta-se tudo: `h18`/`f9`/`b9` (ratings por sexo) + `teeBySex` (objecto Tee por sexo, para selecção). Chave = `teeGroupHex(name, scorecardMeta.teeColor)|round(distances.total)`. |
| `src/ui/TeeBars.tsx` | `TeeBars` (default) | Barras de tees partilhadas entre Campos e Simulador. Uma barra por tee físico: **só a bolinha colorida** (`.tee-dot`, sem nome) + distância (bold, tamanho normal) + CR/Slope por sexo. Dois modos: **display** (Campos, M/F como texto), **selector por sexo** (`onSelectTee`+`selectedTeeId`, Simulador — M/F viram botões), **selector de grupo** (`onSelectGroup`+`selectedGroupKey`, Campos — barra inteira clicável). |

⚠ **Regra do tee físico:** um campo tem N tees físicos (cor/distância); o CR e o
Slope é que diferem entre M e F — é o MESMO tee. Nunca listar "Amarelas M" e
"Amarelas F" como tees distintos (inflaciona a contagem). Usar `physicalTeeGroups`
/`physicalTeeKey` em todo o lado que conte ou liste tees.

### SimuladorPage

- **Persistência URL + localStorage** (`SIM_LS_KEY = "simulador_state_v1"`):
  campo, tee, modo de buracos, sexo, HI, PCC, allowance e jogador. URL tem
  prioridade no arranque (`readInitialSimState`); efeito espelha estado →
  query params (replace) + localStorage. Refrescar já não perde nada.
- **Selector de jogador** na toolbar (de `players.json`, default Manuel via
  `MANUEL_FED`): escolher um jogador pré-preenche o HI (se vazio) e carrega o
  `PlayerPageData` via `loadPlayerData(fed)`.
- **Simulador "E se?"** — reutiliza o `RoundSimulator` (que já existia na
  JogadoresPage). Projecta o HI após uma volta simulada (best-N de 20 via
  `whsQtyCalc`/tabela 5.2a + regra Exceptional Score), top-N, rondas
  deslocadas, tabela gross→HCP. Recebe `hcp=playerData.HCP_INFO`, `whs20`
  (últimas 20 com SD válido), `playerData` e `storageKey` (prop nova:
  persiste em páginas sem `:fedId` no URL).
- Selector de tees passou a usar o `TeeBars` partilhado (modo selector por
  sexo) — clicar num botão M/F continua a fixar o tee+rating do cálculo.

### CamposPage

- **Hero KPI cards** (`.kpi-card*`): Par, Tees (FÍSICOS), Jogadores. Distância
  e CR/Slope NÃO vão aqui (são por tee → vivem nas barras/tabela).
- **Header legível**: deixou de expor a `courseKey` crua; mostra tipo de campo
  (PT/Internacional/Torneio).
- **Barras de tees** (`TeeBars`, modo grupo): clicáveis — seleccionar um tee
  realça a linha na tabela e abre a coluna **Δm** (diferença de metros total
  para o tee seleccionado; sinal +/− = mais longo/curto; clicar de novo
  desactiva).
- **Tabela unificada (Scorecard + Ratings 18h)** — `ScorecardGrid`. Eliminou-se
  o split de tabs Scorecard/Ratings. Estrutura: **PAR e SI no topo, ACIMA da
  linha de cabeçalho** (para o cabeçalho colar aos tees), cabeçalho com colunas
  **CR/Slope por sexo** (cada M/F é uma CAIXA sem linhas internas), depois
  buracos 1-18 + OUT/IN/TOT. OUT e IN fechados dos dois lados (`.sc-col-out`/
  `.sc-col-in`). PAR/SI: rótulo com merge da coluna Tee+ratings, alinhado à
  direita; CR/Slope em branco (sem "–"). CR/Slope dos tees sem M ou F → célula
  vazia (sem "–").
- **Bloco F9/B9** — `CourseNineRatings`, **colapsável** (`<details>`), agrupado
  Front9/Back9 → sexo (caixa) → CR/Slope.
- **Tab "Como jogou"** — `CourseHoleAverages`: média por buraco do Manuel neste
  campo (formato scorecard, buracos em colunas), cruzando `loadPlayerData(MANUEL_FED)`
  com o campo por `canonicalCourseName`.
- **Sidebar + contadores** usam tees FÍSICOS (`physicalTeeKey` dedup).

### CSS (`.sc-table`, local à CamposPage — usado também em CourseNineRatings/CourseHoleAverages)

- `.sc-wrap`: `width: fit-content; max-width: 100%` — o fundo (cartão) acaba
  onde a tabela acaba; em ecrãs estreitos limita à viewport + scroll-x.
- Fonte: **sans normal + `tabular-nums`** (não monoespaçada) — alinhar com os
  scorecards de análise da casa.
- OUT/IN/TOT mantêm a banda verde (`accent-light`) + divisores (`.sc-col-out`/
  `.sc-col-in`). PAR/SI sem bandas de cor (estilo limpo), separador 2px sob SI.

### ⚠ Sandbox Cowork não compila este repo

`npx tsc --noEmit` / `npm run build` / `npm test` dão erros FALSOS no sandbox
(o mount lê os .tsx com bytes NUL + encoding misto pelos emojis/acentos). A
validação corre SEMPRE no PC da utilizadora. Ver memória `cowork-sandbox-build-scripts`.

---

## CamposPage — "Quem jogou neste campo" (cruzamento jogador↔campo) — 2026-06-13

A secção `CoursePlayersSection` da `CamposPage` mostra, por campo, quem lá jogou
e os resultados. Os dados vêm de **dois ficheiros gerados** que cruzam as voltas
dos jogadores (`output/<nfed>/analysis/data.json`) com os campos do master.

### Pipeline (correr por esta ordem no PC — NÃO no sandbox Cowork, que trunca os JSON)

```bash
node scripts/add-paco-do-lumiar.js        # (1×) adiciona campos manuais ao master
node scripts/build-course-players.js      # → public/data/course-players.json
node scripts/build-course-player-names.js # → public/data/course-player-names.json
```

`App.tsx` anexa o `course-players.json` aos campos PT do master por `courseKey`
em runtime (os campos *away* já trazem `_players` do pipeline). O formato de cada
volta: `{ date, gross, toPar, holes, tee, event, sd }` (`holes` = 9 ou 18).

### `scripts/lib/course-aliases.cjs` — ESPELHO Node de `src/utils/courseAliases.ts`

O Node não importa `.ts`, mas o cruzamento precisa da MESMA canonização de nomes
que a app usa em runtime — senão perde ~16% das voltas (nomes FPG curtos/variantes
que não batem com o master). **Manter sincronizado** com `courseAliases.ts`
(precedente: `colors.ts` espelha `tokens.css`).

Resolução de courseKey por volta (`resolveCourseKey` em `build-course-players.js`),
por ordem:
1. **Por par[]** (mais fiável; par vem de `HOLES[scoreId].p`):
   - Santo da Serra → combos/loops (par dos nines; a FPG troca etiquetas, o par manda)
   - Multi-loop (Vila Sol, Pinheiros Altos, Castro Marim) → combo pelos 2 nines; **nine
     isolado (9h) → combo onde é o front-nine** (aparece na linha "9b" na UI)
   - Ribagolfe I/II → Lakes/Oaks (VERIFICADO por par: I→Lakes, II→Oaks, 100%)
   - Aroeira II → No.1/No.2 (só por par; sem par fica por casar — ambíguo de propósito)
2. **Fallbacks por nome** (voltas sem scorecard): Santo da Serra, multi-loop, Ribagolfe.
3. **`canonicalCourseName`** (sufixos CNJ/CN + `COURSE_NAME_ALIASES`) → `masterByNorm`.

Aliases novos (2026-06-13): `Tróia→Troia Golf`, `Porto Santo→Porto Santo Golfe`,
`Santo Estevão→Santo Estevão Golf`, `Oceânico Faldo→Faldo Course`.

**Sentinelas filtradas:** gross `0`/`998`/`999` (toPar absurdo = "sem cartão") → `gross:null`
(continuam a contar como volta mas não entram em Melhor/Média).

O script imprime no fim o diagnóstico "Voltas sem campo correspondente" (top 30). O que
resta aí é esperado: nomes-lixo (`NONE`/`INTERNACIONAL`/`Campo desconhecido`), campos
**internacionais** (geridos pelo pipeline *away*) e `Aroeira II` sem par.

### `scripts/build-course-player-names.js`

Resolve fed→nome contra `players.json` + `federados.json` + `federados-inativos.json`.
**Lê os 3 ficheiros de campos:** `away-courses.json`, `master-courses.json` E
`course-players.json` (este último era ignorado, fazendo os jogadores dos campos PT
aparecerem como NÚMERO de federado).

### `scripts/add-paco-do-lumiar.js`

Adiciona o **Paço do Lumiar** (campo público de 9 buracos par-3, par 29) ao
`master-courses.json`. Reconstruído dos scorecards reais; representado como 18 buracos
(9 jogados 2× = par 58), 3 tees (Brancas/Amarelas/Vermelhas, +F nas da frente).
CR/Slope `null` (par-3 sem rating publicado). Idempotente, escrita atómica. ~900 voltas
órfãs recuperadas. Padrão a reusar para outros campos PT em falta no master.

### UI da `CoursePlayersSection` (tabela ordenável)

- Tabela ordenável por cabeçalho (Voltas/Melhor/Média/Última); **Manuel fixo no topo**,
  fora da ordenação. Default: mais voltas primeiro.
- **Duas linhas de estatística por jogador: `18b` e `9b`** (nunca misturadas — uma volta
  de 9 buracos não é comparável com uma de 18). `roundHoles()` usa `r.holes`; se faltar,
  deriva do par (`gross − toPar`).
- Cor só no TEXTO do to-par (`tpTextColor`), nunca fundos berrantes.
- Clicar na linha expande as voltas individuais (data + resultado, info completa no hover);
  sentinelas mostradas como "s/ cartão".

### Vista por-tee — `CoursePlayersByTee` (tab "Como jogou", 2026-07-10)

A `CoursePlayersSection` foi refactorizada: o corpo da tabela é agora
`PlayersTable` (componente reutilizável, `{entries, title, onSelectPlayer}`) e a
construção dos resumos vive em `buildSummaries(raw, players, nameMap, teeFilter?)`
(o `teeFilter` opcional restringe as voltas a um tee). Dois consumidores:
- **`CoursePlayersSection`** (tab **Scorecard**): lista geral, todos os tees →
  `Jogadores (N)`.
- **`CoursePlayersByTee`** (tab **Como jogou**, a seguir aos KPIs por tee):
  UMA `PlayersTable` por tee (Brancas, Amarelas, Azuis, Vermelhas, …) com os nossos
  jogadores e os scores que fizeram NESSE tee. Agrupa por `teeCanonicalLabel(r.tee)`
  (junta variantes M/F da mesma cor), ordena back→front (`TEE_COLOR_ORDER`; "Sem
  tee" por último). Cada tee é um **cartão com o mesmo look dos KPIs** (faixa
  superior da cor + header tingido `teeTint` com ponto `teeDot`, nome, **distância +
  CR/Slope ♂/♀** vindos de `useTeeInfoMap`); a `PlayersTable` renderiza em modo
  `bare` (sem o wrapper `.course-players-section`/título) dentro do cartão. Cada
  tabela mantém sort próprio (regra: todas as tabelas ordenáveis). Helpers de
  aspecto (`teeTint`/`teeDot`/`useTeeInfoMap`) são partilhados com o `CourseTeeKpis`.

**KPIs por cor de tee — `CourseTeeKpis` (topo do "Como jogou", 2026-07-10).** O tab
"Como jogou" deixou de mostrar os KPIs genéricos (Par/Tees/Jogadores — esses ficam
só no Scorecard) e a média-por-buraco do Manuel passou para o fim. Lidera com um
**cartão por cor de tee**, cada um com: header (ponto de cor + **distância + CR/Slope**
do sexo/volta seleccionados, vindos de `physicalTeeGroups`), nº jogadores + voltas, e
o **TOP-3 de cada escalão** (Sub-10→Absoluto) com nome (link), to-par colorido,
**data com ano** (`fmtDMYfull`) e **SD** da volta do recorde. Extras:
- **Dois toggles** (`Seg`): **♂ Rapazes / ♀ Raparigas** (separa por sexo, `meta.sex`)
  e **18 buracos / Front 9 / Back 9** (`roundValue`; F9/B9 vêm de `r.f9`/`r.b9` — o
  `build-course-players.js` passou a emitir `f9`/`f9tp`/`b9`/`b9tp` por volta de 18 a
  partir do `HOLES[scoreId].g`). As ratings (CR/Slope) do header seguem o toggle
  (h18/f9/b9).
- **Ordenado por distância** (dificuldade) desc, não por cor.
- **Cartão do Manuel sempre no topo** (`MANUEL_FED`): o seu recorde por tee (ordenado
  por distância), com escalão à data, data e SD — independente do filtro de sexo.
- **Nota de fonte** (canto): "dados: voltas dos nossos · última {data}" com tooltip a
  explicar a origem (course-players.json, regen semanal `update-data.yml`).

O escalão é calculado **à data da volta** (`escalaoAtDate`: coorte FPG por ano de
nascimento vs ano do evento) — o mesmo miúdo aparece como Sub-12 numa volta antiga e
Sub-14 noutra. Precisa da **DOB**: o `build-course-player-names.js` emite `dob` + `sex`
por fed (além de `names`); o loader expõe-os via `useCoursePlayerMeta()`
(`loadCoursePlayerMeta` substitui o antigo `loadCoursePlayerNames`).

## Tab "Vantagem de Tee" (`/comparar`) — conselho de tee para júnior (2026-06-14)

`src/pages/comparar/TeeAdvisorView.tsx`, 3ª tab da `ComparePage`. Compara dois tees
de um campo e dá um **conselho fundamentado** sobre se o Manuel deve subir de tee.
Sessão grande de 2026-06-14 transformou-o de heurística mecânica em conselho
ancorado em **evidência real** e em **literacia WHS**. Sem gráficos.

### Toolbar / inputs
Campo, sexo dos tees, **HCP** (default = índice actual do Manuel), **Drive (m)**
default **185**, **2ª panc. (m)** default 160. A barra "📏 Distância habitual" é
editável (override) e mostra o valor automático.

### Distância de competição (P70, não mediana)
`habitualDistance()` = **percentil 70** dos metros das últimas 20 voltas 18B — a
distância que ele **já joga a sério**, não a típica (a mediana caía no aglomerado
dos tees curtos de treino). As voltas internacionais sem metros no `data.json`
(Marco Simone, Villa Padierna, Glen, La Forêt…) são recuperadas via
`resolvePlayedMeters` (mesmo util da JogadoresPage, com override `MANUEL_AWAY_TEE`)
— senão eram excluídas em silêncio e o valor vinha baixo demais.

### Conclusões pontuadas (veredicto A vs B)
1. **⚖️ Saldo: perdão vs perigos** — pancadas de perdão que o tee longo dá (playing
   handicap WHS) MENOS nº de perigos que cria (buracos fora de alcance em regulação).
   **Banda morta ±1 = empate** (uma pancada de margem para um perigo não é vantagem —
   se o dia corre mal não há folga); só saldo ≥2 favorece o tee longo, ≤−2 o curto.
2. **📏 Ajuste à distância de competição** — premia jogar PERTO da distância de
   competição; penaliza tanto jogar muito ACIMA (estica o jogo) como muito ABAIXO
   (tira o desafio — um júnior não cresce a recuar de tee).
3. **⚠️ Buracos de alerta** — informativo (não pontua); lista buracos fora de alcance
   e a estratégia.
4. **📊 Histórico real neste campo** — **por tee**, mostra mesmo quando só há voltas
   de UM tee (é a transição em análise). Usa o **resultado típico recente = mediana
   das últimas ≤4 voltas** (a mesma janela em todo o lado: tabela, conclusão,
   recomendação — não divergir). Só pontua quando há ≥2 voltas em AMBOS.

### Recomendação — modos (não há "arrisca sempre")
Computa um `mode` por prioridade: **go** 🚀 (avança), **suit** 🎯 (o tee curto não
premia o jogo dele — tira o driver da mão, distâncias *tweener* — o longo pode
encaixar melhor), **caution** 🤔 (tem distância mas o **saldo é negativo** ou **não
conhece o campo** → o tee curto/conhecido é a escolha sensata), **master** 🛡️ (ainda
não domina nem o tee curto deste campo → consolida primeiro), **hold** 🛡️ (longo
ainda é grande demais). Âncoras: distância de competição + forma recente no campo
(mediana) + desempenho em campos longos + jogar ao handicap no curto (= superou-o).
A janela 24-28× do drive é **referência secundária**.

### Desempenho em campos longos — métrica WHS-correcta
`longTeePerformance()` **NÃO usa a média** de score differential. Razão: o índice
WHS é a **média das 8 MELHORES de 20** voltas (potencial num bom dia) e só se joga
ao índice **~1 em cada 5 voltas** → a média de differential fica sempre vários pontos
acima do índice e seria enganadora (um índice ~10 tem médias 14-15). Em vez disso
conta as voltas jogadas **ao nível do índice ou melhor** (`sd ≤ index`) e guarda o
**melhor differential**. Só os **últimos 12 meses** (um júnior cresce depressa — não
comparar com o que era capaz há 15 meses).

### Correspondência robusta campo↔volta (teeHistory)
Usa `courseKeyName` (ignora travessão vs hífen, pontuação) + `teeKey` (ignora o
prefixo "USKids": "Boys 11" ↔ "USKids Boys 11") + fallback a `resolvePlayedTee`
(override/cor curados). Sem isto perdiam-se voltas inteiras (ex: 3 voltas em
Montecchia não apareciam).

### Helpers e detalhes
- `toNum` (sd às vezes vem string), `median`, `teeKey`, `ClubDistanceTable` (tabela
  de distâncias do saco reactiva ao Drive — % constantes do drive).
- `HoleDiffTable` tem linhas "após drive faltam" E "após 2ª pancada faltam" (par 4/5),
  agrupadas por tee (amarelas juntas, vermelhas juntas, com espaço entre).
- Dois colapsáveis didácticos: **📐 Porquê 24–28× a distância de drive?** e
  **📊 Porquê contamos voltas ao nível do índice — e não a média?**
- `playedDistance.ts` passou a **exportar `courseKeyName`**.

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
| brjgt.bluegolf.com | `brjgt.bluegolf.com` | BJGT/WJGC/EOWAGR | ⛔ scraping descontinuado 2026-07-09 (pedido nominal BlueGolf) — só consulta manual |
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
| Live Scoring | — (app própria, ver secção abaixo) | — | `/live-scoring/1.aspx?pa=classif&c={ccode}&t={tcode}&r=0` |

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

#### 4ª página: LIVE SCORING — `/live-scoring/` (app separada, com scorecards)

**URL a guardar** (o "género que já conhecemos", mas noutra app):

```
https://scoring.fpg.pt/live-scoring/1.aspx?pa=classif&c={ccode}&t={tcode}&r=0
```

Não é `linkpage.aspx` nem usa `ack`: é uma aplicação ASP.NET à parte, com
**entry gate próprio** (`1.aspx`) que guarda o torneio NA SESSÃO e faz 302 para
`/live-scoring/Home/ls_classif.aspx`. Ir directo a `ls_classif.aspx` dá sempre
HTTP 500 — falta contexto, não cookies. **Não precisa dos cookies do Chrome 90**
(emite sessão própria) — é o único backend FPG assim.

**Porque interessa:** é a ÚNICA fonte com o jogo a decorrer — posição, buraco
em que cada um vai (ou tee time se ainda não saiu), to-par do dia — **e tem
scorecards buraco-a-buraco** (na UI abre-se um por um, clicando no nome).
A `classif.aspx/ClassifLST` só publica depois de fechada, e a `TournamentsLST`
nem sequer lista o torneio enquanto decorre (confirmado 2026-07-18: o 4º
Aquapor de nesse dia não aparecia em nenhuma das duas).

⚠ **EFÉMERO** — só existe enquanto a prova decorre. Não há backfill: o que não
for capturado durante o jogo perde-se.

| Recurso | Chamada |
|---|---|
| Gate (obrigatório 1º) | `GET /live-scoring/1.aspx?pa=classif&c={ccode}&t={tcode}&r={ronda}` |
| Leaderboard | `POST /live-scoring/Home/ls_classif.aspx/lsClassifLST?jtSorting=Topar_cl ASC` · body **só** `{jtSorting}` |
| **Scorecard de 1 jogador** | `POST /live-scoring/Home/ls_classif.aspx/ScoreCard?score_id={Score_id}&Classi={n}` → `Records[].scdisplay` (HTML) |

Campos do record: `Player_name`, `Score_id`, `Team_description`, `Nholes`,
`Tee_Time`, `ScoreStatusId`, `Topar`, `Topar_day`, `Tot_R1..R3`.
`Nholes=0` → ainda não saiu (mostrar `Tee_Time`); `Topar_cl>900` → sem posição
(`ScoreStatusId` 20/30=DQ, 40=NR, 99=NS). `Classi` = tipo de classificação do
dropdown `DpClassif` (1=Gross, 2=Medal Net, 3=Stableford Gross, 4=Stableford
Net, 5=Bogey par).

⚠ **Os PageMethods só respondem à chamada disparada pela NAVEGAÇÃO que
renderiza a página.** Medido em 2026-07-18 na mesma prova e sessão: navegação
real do browser → 200; `fetch()` na própria página → 500; `jQuery.ajax` na
própria página → 500; `$(…).jtable('load')` na própria página → 500; Node → 500.
Eliminadas por medição as hipóteses de cookies/sessão, IP/rate-limit,
fingerprint TLS e headers/body (interceptados no XHR e replicados à letra).
⇒ **Para automatizar, é preciso navegar mesmo a página num browser** e ler o
DOM. Detalhe completo no cabeçalho de `scripts/scrape-fpg-livescoring.js`.

**O `ack` é universal cross-domain** (mesma infra ASP.NET partilhada) — `XH256YF450` para admissions, `8428ACK987` para draw/classif, iguais em ambos os domínios.

Implicação para o middleware: as duas fontes (`FPG_URL_1` e `FPG_URL_2`) passam a ser ambas linkpage — redundância real, não mais "scoring.datagolf.pt só por esperança". Em cada pedido esperamos os mesmos inscritos dos dois domínios; se divergirem, o log marca como "novos" os de cada fonte e sabes que uma está desincronizada.

```
FPG_URL_1 = scoring.fpg.pt/lists/linkpage.aspx?page=admissions&club=000&tourn=X&ack=XH256YF450
FPG_URL_2 = scoring.datagolf.pt/pt/linkpage.aspx?page=admissions&club=000&tourn=X&ack=XH256YF450
```

Cada um usa os seus próprios cookies (`.fpg-admissions-cookies.json` e `.scoring-datagolf-cookies.json` respectivamente).

#### ✅ `scripts/admissions.asp` + `scripts/draw.asp` são PÚBLICOS (sem cookies) — 2026-08-20

Correcção ao "dead end" abaixo: com o **`ack` na query string**, as duas páginas
ASP clássicas do `scoring-pt.datagolf.pt` respondem a `fetch` puro, **sem
cookies nenhuns** (o redirect para `datalinkpt.html` só acontece sem `ack`).
Qualquer um dos acks universais serve — medidos os 4 conhecidos
(`XH256YF450`, `8428ACK987`, `XH256YF45T`, `MN0JF0I697`) no mesmo torneio, todos
com resposta idêntica.

```
https://scoring-pt.datagolf.pt/scripts/admissions.asp?club={ccode}&tourn={tcode}&LANG_TXT=PT&ack=XH256YF450
https://scoring-pt.datagolf.pt/scripts/draw.asp?club={ccode}&tourn={tcode}&round_number={n}&ack=XH256YF450
```

Traz **menos** que a `tournAdmissions.aspx` autenticada (sem posição de
inscrição, data de registo, VAC nem reservas — a lista vem por ordem alfabética),
por isso é **fallback, nunca primeira escolha**: o `scrapeAdmissions` do
`scrape-fpg-admissions-draws-node.js` só lá vai quando o linkpage falha ou
devolve lista vazia (`parseAdmissionsPt`, log `fallback admissions.asp
(público)`). Vale ouro porque é exactamente o que salva o scrape enquanto as
cookies de `scoring.fpg.pt` estão expiradas — que é o estado normal entre
refrescos manuais.

**Dead ends confirmados no mesmo probe (não voltar a testar):**
- ~~`scoring-pt.datagolf.pt/scripts/admissions.asp`~~ — **RESOLVIDO 2026-08-20**, ver acima (faltava o `ack`).
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
| **`update-data.yml`** | ✅ Node puro desde 2026-04-15 | `scripts/fpg-scrape-node.js` | Dom/Seg 00:05 UTC (depois do cut SD) | Default: incremental (só rondas novas). Override `full_rebuild=true`. Secret: `FPG_COOKIES`. **Timing tardio intencional: o SD e WHS Index são atribuídos pela FPG depois da meia-noite Lisboa.** Corre também `backfill-pcc.js --apply` — ver "PCC — o ajuste que chega SEMPRE depois do scrape". |
| **`update-jovens.yml`** | ✅ Node puro desde 2026-04-17 | `scripts/scrape-jovens-node.js` | Sex/Sáb/Dom 21:20 UTC | Scrape inscrições dos Nacionais de Jovens. Secret: `DATAGOLF_SCORING_COOKIES`. |
| **`update-fpg-admissions-draws.yml`** | ✅ Novo 2026-04-22 | `scripts/scrape-fpg-admissions-draws-node.js` | Sex/Sáb/Dom 20:00 UTC | **Cron aplica `--auto-extend --since 4d`**: scope manual (333) + Fonte 2 (JSONs locais: drive-data, jovens, pull-torneios, SdS) + Fonte 3 (TournamentsLST com warmup entry-gate, filtros INCLUDE=junior/PJA/jovens/sub-XX/ccode=007, EXCLUDE=Flintstones/Quarta Feira Europeia). Janela: futuros + em curso + torneios ≤3 rondas até dia seguinte ao fim. Para scope histórico completo: workflow_dispatch sem filtros. Secrets: `FPG_ADMISSIONS_COOKIES` + `DATAGOLF_SCORING_COOKIES`. |
| **`update-classif.yml`** | ✅ Novo 2026-04-22 | `scripts/scrape-classif-node.js` | Dom/Seg 01:00 UTC | Scope dinâmico via `--auto-from-tracking` (lê `fpg-tournaments-tracking.json`, filtra `status in [missing_classif, missing_scorecards]`). Fallback manual via `--scope` ou `--tclub/--tcode`. Secret: `DATAGOLF_SCORING_COOKIES`. Corre também `backfill-pcc.js --apply` (o WHS das 00:05 já traz o `cba` do próprio fim-de-semana). |
| **`build-tournaments-tracking.js`** | ✅ Novo 2026-04-22 | helper (corre dentro do admissions-draws + classif workflows) | — | Cruza fpg-admissions-draws + pull-torneios* + drive-data-* + jovens_* e gera `public/data/fpg-tournaments-tracking.json` com status por torneio (complete/missing_classif/missing_scorecards/future/in_progress). Alimenta o scope dinâmico do `update-classif`. |
| **`update-ffgolf-resultats.yml`** | ✅ Novo 2026-05-08 | `scripts/scrape-ffgolf-all-jeunes.js` + `build-ffgolf-resultats-index.js` + `build-ffgolf-juniors-slim.js` | Seg 02:00 UTC (1×/semana, madrugada Lisboa) | **Sem secrets** — portal `pages.ffgolf.org/resultats/` é público (bootstrap GET apanha PHPSESSID). Default do cron: `--types 01,03 --since 2025 --skip-existing` (Compétitions Fédérales filtradas por keyword juvenil + GP Jeunes regionais nas 22 ligas, anos 2025-2026, só novos). Output: `public/data/ffgolf-resultats/{type}-{ligue}-{trnId}.json` + `ffgolf-resultats-index.json` + `ffgolf-juniors-slim.json`. workflow_dispatch tem inputs `types`/`since`/`ligues`/`force_rebuild`. |
| **`update-ffgolf-golfgenius.yml`** | ✅ Novo 2026-05-08 | `scripts/scrape-ffgolf.js` | Seg 03:00 UTC (1×/semana, 1h depois do anterior) | **Playwright headless** — torneios juvenis FFG hospedados em GolfGenius (Championnats de France, Internationaux U14/U18). Default do cron: `--year <ano corrente>` (varre `public/data/ffgolf-catalog.json` filtrado por ano). Output: `public/data/ffgolf/{year}_{slug}.json`. Depois do scrape corre `build-france-players.js`: os torneios GG contam para o roster via **matching de nome** (`scripts/lib/ffgolf-gg.js` — o GG não publica licenças) com **dedup de gémeos** do portal resultats por overlap de licenças (`ffgolf-gg-twins.json`; 18/21 eventos GG são o MESMO evento publicado nos 2 sítios). workflow_dispatch tem inputs `year`/`slug`/`gg_page` (ad-hoc). Sem secrets. |
| **`update-spain.yml`** | ✅ Novo 2026-05-17 | `scripts/discover-fcg-scope.js` + `scrape-rfegolf-node.js` + `scrape-livegolfscoring.js` + `scrape-nextcaddy.js` (+ horarios) + `scrape-fcg.js` + 7 builds (enrich-lgs-dates, infer-nextcaddy-par, build-rfegolf-index, build-licencia-{dob,hcp}-lookup, build-spain-player-tournaments, build-spain-players-export, build-rfegolf-rivals, build-fcg-rivals) | Seg 04:00 UTC (1×/semana, 1h depois do GolfGenius) | **Node puro, sem secrets** — pipeline única que cobre RFEG (microsite + livegolfscoring), NextCaddy (RFGA Andaluzia + FGM Madrid) e FCG (Federació Catalana via golfdirecto.com). Default do cron: discovery + `--skip-existing` em todos os scrapers + builds. workflow_dispatch tem inputs `force_rebuild`/`skip_discovery`/`lgs_range`/`rfegolf_range`/`fcg_years`. Timeout 240 min. Outputs em `public/data/{rfegolf-resultats,rfegolf-livegolfscoring,nextcaddy,fcg}/` + agregados. |
| **`update-federados.yml`** | ✅ Novo 2026-06-14 (email 2026-08-23) | `scripts/scrape-federados-node.js` (+ `build-run-digest` → email do cadastro) | Quarta 05:00 UTC (1×/semana, off-peak) | Refresh completo de `public/data/federados.json` (~15.600 activos). Exit code 2 = sem alterações. workflow_dispatch tem inputs `check_only`/`force_commit`. Secret: `DATAGOLF_SCORING_COOKIES`. |
| **`update-golfgenius.yml`** | ✅ Novo 2026-07-23 | `scripts/scrape-golfgenius-node.js --scope scripts/golfgenius-scope.json` | Diário 22:00 UTC | Eventos GolfGenius do scope (hoje: as 4 edições do Champion of Champions). Sem secrets (GG público a `fetch`). Exit 2 = sem alterações. Quando há novidades regenera o agregador + `major-catalog.json` e committa. `workflow_dispatch` aceita `slug` (só um evento do scope) ou `page_url` ad-hoc. |
| **`update-england.yml`** | ✅ Novo 2026-08-30 | `scripts/discover-england-golf-events.js` + `scripts/scrape-england-golf.js` | Segunda 05:00 UTC | Torneios juvenis England Golf (GolfGenius) do catálogo, ano corrente. **Playwright** (o GG depende de JS para os dropdowns e scorecards); sem secrets (público). Os campeonatos ingleses jogam-se de Terça a Sexta, por isso à Segunda a semana anterior já fechou. A descoberta corre antes e AVISA (no `$GITHUB_STEP_SUMMARY`) que provas estão fora do catálogo, mas nunca o edita. Exit 2 = sem alterações. Com novidades regenera o agregador de juniores e committa. `workflow_dispatch` aceita `year`/`slug`/`gg_page`/`skip_existing`. |
| **`build-juniors.yml`** | ✅ | `scripts/aggregator/index.js` | workflow_dispatch | Build do agregador canónico de juniores (orquestra adapters em `scripts/aggregator/sources/` + identity-matcher + sanity checks). Alimenta a vista global de juniores. |
| **`uskids-refresh-all.yml`** | ✅ | `fetch-uskids-member-history.js --refresh-all` → `split-member-history.js` → `build-member-history-slim.js` | Dia 1 do mês 17:00 UTC | Refresh mensal completo do member-history USKids: re-scrape de toda a carreira, split em chunks ≤70 MB e rebuild do slim servido ao browser. |
| **`future-masters-scrape.yml`** | ✅ | `scripts/scrape-future-masters-all.js` | Junho 05:00 UTC (anual) | Scrape do Future Masters (torneio juvenil UK). `workflow_dispatch` com `all_years=true` refaz todos os anos. |
| **`daily-digest.yml`** | ✅ Novo 2026-08-17 | `scripts/build-run-digest.js` + `send-digest-issue.js` | Diário 07:30 UTC | **Resumo por email** do que os scrapers trouxeram nas últimas 24h. Sem secrets. Ver secção própria abaixo. |
| **`analytics-snapshot.yml`** | ✅ Novo 2026-08-28 | `scripts/snapshot-web-analytics.js` | Diário 03:15 UTC (+ mensal no dia 1) | **Retrato do Vercel Web Analytics** para `data-archive/analytics/`. O plano Hobby só guarda 30 dias — isto copia-os para o repo antes de desaparecerem. Secret: `VERCEL_TOKEN`. Exit 2 = sem novidades. |

### ⚠ FCG (catgolf.com) — guarda anti-overwrite do scope (2026-08-17)

O `catgolf.com` serve **intermitentemente** um edge node com certificado
self-signed. O `discover-fcg-scope.js` já degradava para uma tentativa sem
verificação TLS (melhor do que derrubar o workflow), mas essa resposta vem por
vezes **HTTP 200 com uma página SEM a lista de torneios** → `0 tournaments
listed` → gravava um `scripts/fcg-scope.json` VAZIO por cima do bom, committava-o,
e o `scrape-fcg.js` a seguir ficava sem jogos e falhava o `update-spain.yml`
inteiro. Aconteceu a **2026-07-20, 2026-07-27 e 2026-08-17** — o run de 17-08
apagou um scope de 27 torneios / 25 games / 43 inscritos.

Resolvido com a mesma política do `scrape-federados-node.js` (recusar gravar
zero registos):

- `discover-fcg-scope.js` **recusa** gravar se a descoberta der 0 torneios com
  um scope não-vazio em disco, ou se perder **>50%** dos torneios. Preserva o
  ficheiro anterior e sai com **exit 2** (= sem novidades utilizáveis, não é
  erro). `--force` ignora a guarda (para quebras legítimas, ex: mudar `--years`).
- `scrape-fcg.js` com um scope existente mas vazio imprime "nada para scrapar"
  e sai 2, em vez do texto de *usage* — que nos logs do workflow mandava uma
  pista errada (parecia erro de invocação).
- Os dois passos do `update-spain.yml` traduzem **exit 2 → sucesso**. Resultado
  prático: quando o catgolf está degradado, o scrape usa o scope bom que já lá
  estava e o workflow fica **verde**, em vez de vermelho com dados destruídos.

## Resumo por email das actualizações — `daily-digest.yml` (2026-08-17)

Um email por dia com o que os scrapers trouxeram:

```
Novo torneio Grand Prix Jeunes em França — 2 escalões:
  escalão POUSSINS, vencedor Victor Canot Januel
Novo torneio Campeonato de España Sub 16 em Espanha, escalão Cadete M, vencedor …
Manuel Goulartt Medeiros tem 2 scorecards novos; participou em Campeonato Nacional Sub-12
Joana Sousa tem 4 scorecards novos; por via de EDS
```

**Sem secrets nenhuns:** o email sai como **issue** (o GitHub notifica o dono do
repo — o corpo menciona `@Medeirosgolfdev` para garantir a notificação mesmo com
subscrição "Participating and @mentions") e a issue é **fechada logo a seguir**,
porque a notificação sai na criação e assim a lista de issues fica limpa. Basta
o `GITHUB_TOKEN` do próprio workflow (`permissions: issues: write`).

### ⚠ O resumo sai do HISTÓRICO DO GIT, não de passos nos workflows de dados

`build-run-digest.js --since "24 hours ago"` resolve a base da janela
(`git rev-list -1 --before`) e faz **um diff** entre esse commit e o `HEAD`.
Consequências deliberadas:

- **Nenhum dos ~20 workflows de dados foi tocado** (excepto o `update-data.yml`
  e o `update-federados.yml`, e só para o aviso imediato) — zero risco de partir
  os pipelines que trazem os dados, que é o que interessa.
- Se um workflow falhar a meio, a janela do dia seguinte apanha na mesma o que
  ficou commitado.
- O `daily-digest.yml` precisa de `fetch-depth: 0` no checkout — com o clone
  raso o `rev-list --before` não encontra a base.

O outro modo (default, sem `--since`) lê a **árvore de trabalho** contra o HEAD
e serve o aviso imediato: corre ANTES do commit, porque depois do push o
`git pull --rebase` traz commits de outros workflows e o diff deixaria de ser só
daquele run.

### Avisos imediatos — um email por RUN (2026-08-23)

Dois workflows mandam email no próprio run, sem esperar pelo resumo das 07:30
(que os repete de manhã, de propósito):

| Workflow | Passo | O que vai no email |
|---|---|---|
| `update-data.yml` (scorecards dos nossos) | "Aviso imediato de scorecards novos" | quem tem voltas novas e em que prova (`--source federados --only-players`) |
| `update-federados.yml` (cadastro FPG) | "Resumo por email (quem entrou/saiu do cadastro)" | juniores novos um a um + adultos contados por escalão + quem saiu (`--source cadastro --only-players`) |

Ambos correm ANTES do commit (modo árvore de trabalho), com
`continue-on-error: true` e `permissions: issues: write`.

⚠ **Um resumo só de cadastro tem `tournaments = 0` e `players = 0`.** O filtro do
`send-digest-issue.js` era `counts.tournaments || counts.players`, por isso o
email do `update-federados.yml` era descartado em silêncio — nunca chegava nada.
O filtro (`hasNews`), o título e o cabeçalho contam agora também
`federadosEntrou`/`federadosSaiu`. O rodapé também distingue os dois casos: só
os resumos com `window` é que dizem "últimas 24h".

### Como sabe o que é novo

| O quê | Como |
|---|---|
| Torneios | `scripts/lib/digest-extract.js` — routing por **FORMA** do JSON (`detectFormat`), não por caminho: lgs · rfegMicrosite · nextcaddy · fcg · ffgResultats · jobfile · flatPlayers · fpgPull · uskidsResults. Uma fonte nova entra sozinha; só o rótulo país/circuito vem do caminho (`SOURCES`). |
| Vencedor | `winnerOf` — o `pos 1` (aceita `"T1"`, `classement`, `rankingPosition`); sentinelas ≥900 fora. Sem 1º classificado a prova ainda não entra. |
| Escalão | O rótulo REAL da fonte ("Handicap Alevin Femenino", "1ère Série Messieurs", "Under 12 Boys"); só sem rótulo é que se infere do nome (`inferEscalao`). |
| Federados | `diffWhs` por **`score_id`** (não `id` — ver "score_id ≠ id"); a frase distingue `Torn`/`Intern` (→ "participou em X") de `EDS`/`Indiv`/`Import` (→ "por via de EDS"). ⚠ **Actos administrativos fora** — ver abaixo. |
| Cadastro FPG | `diffFederados` sobre o `federados.json` (FedStat=9): quem entrou e quem saiu da lista de activos. Tratado ANTES do filtro de fontes conhecidas — não é um ficheiro de resultados. |

### Cadastro FPG — novos federados e saídas

O `federados.json` (~17,7k activos, refrescado pelo `update-federados.yml`) é
comparado entre os dois extremos da janela. Medido no diff real 05→14 Ago:
**113 entraram, 2 saíram**.

- **Juniores um a um, adultos só contados.** Dos 113, só 16 eram SUB*; listar os
  outros 97 despejava linhas de MidAmateur/Senior que ninguém lê. Os adultos
  saem numa linha de contagem por escalão. Juniores ordenados do escalão mais
  novo para o mais velho.
- **REENTRADA ≠ novo federado.** Quem aparece na lista nova com uma
  `admission_date` ANTERIOR ao snapshot passado não é novo — estava inactivo e
  voltou (caso real: "Antonio Ferreira", inscrito em 2023-08-28, reapareceu em
  Agosto/26). São 3 dos 16 juniores dessa janela.
- **As saídas aparecem sempre todas** (são raras) e mostram a data de admissão
  ("era federado desde 2008-04-03"), que diz há quanto tempo lá estavam.
- **HCP:** `fedHcp` espelha o `HCP_UNESTABLISHED_THRESHOLD = 54` do
  `src/pages/jogadores/filterPlayers.ts` (`isCountableHcp`: h < 54) e trata
  também `hcp_status_id === 99`. A FPG guarda **99 / "Sem HCP"** em quem ainda
  não tem índice — 12 dos 16 juniores da janela 05→14 Ago — logo mostrar "99"
  seria mentira. Nesses casos a linha diz **"sem HCP"** em vez de calar: num
  federado novo isso é informação, o silêncio pareceria falha de leitura.
- ⚠ **Guarda:** se qualquer dos lados vier vazio, `diffFederados` devolve
  `{entrou:[],saiu:[]}`. Sem isto um scrape falhado (o `federados.json` já veio
  com 0 registos a 2026-08-12) anunciava o país inteiro a deixar de ser federado.

### ⚠ Nem toda a linha do WHS é uma volta jogada (2026-08-17)

A FPG regista no histórico WHS **actos administrativos** com
`score_origin: "Torn"` — "Atribuição Inicial WHS", "Transferencia de Clube",
"Atribuição Inicial de Handicap", "Alteração Tipo de Jogador"… São **1105
linhas** no repo. Sem os filtrar, o resumo anunciava *"Fulano tem 1 scorecard
novo; participou em Transferencia de Clube"*. O `isAdminAct` do
`digest-extract.js` deita-os fora (mesma armadilha que o
`build-recent-tournaments.js` já tratava com o tcode `000000000`).

⚠ **`score_id` vem a 0 nesses registos** — 639 dos 640 que têm valor. É
sentinela, não um ID: usá-lo como chave de dedup fazia 639 registos diferentes
colidirem no mesmo `"0"` e só o primeiro passava. O `roundKey` só aceita
`score_id > 0`; sem ID real, a chave é `data|evento|campo`.

Descoberto a investigar um caso concreto: o federado 60382 entrou com índice
**4.7** e a única coisa no WHS dele era a "Atribuição Inicial WHS" (o índice foi
**atribuído**, não jogado) mais uma volta de treino.

### Três filtros que evitam um email ilegível

1. **Só fontes conhecidas** — ficheiros que não batem em `SOURCES` (agregados e
   derivados: `recent-tournaments`, `juniors-tournaments*`, `*-rivals`, `*-slim`,
   catálogos) são saltados. Sem isto cada torneio saía 2-3× com rótulos
   diferentes, porque os derivados republicam o que a fonte primária já trouxe.
2. **Dedup global** por `torneio|escalão|vencedor` — a mesma prova chega por mais
   do que um caminho (ex: microsite RFEG + LiveGolfScoring).
3. **Só golfe de jovens** (`isJuniorish`, desligável com `--all`) — as mesmas
   fontes trazem agarradas as competições sociais de clube ("MENS DAY 11/8",
   "Competição Mensal", "Mid-Amateur"). Medido no histórico real: 39 derivados
   + 8 provas de adultos ignorados numa janela de 24h.

### Armadilhas resolvidas (todas com caso real)

- **`\b` não fecha depois de vogal acentuada** (o `\w` do JS é só `[A-Za-z0-9_]`):
  o catalão escreve **BENJAMÍ**/**ALEVÍ** sem `-n` e os padrões falhavam. Idem
  `(?!\d)` em vez de `\b` depois do número, porque a FFG cola o sexo ao escalão
  ("u12G", "u12F").
- **FCG: `game.name` é a JORNADA**, a prova está em `game.tournament.name` —
  senão o email anunciava dezenas de torneios chamados "Jornada 1".
- **FFG: o nome junto vem "APELIDO Nome"** sem vírgula (impossível de desfazer
  depois) → usar `namePrenom`/`nameNom` quando existem.
- **Alguns scrapers guardam o SLUG no campo do nome** (`ffgolf/2026_*.json` traz
  "championnat-de-france-des-jeunes-benjamines") → `prettyTournamentName`.
- **RFEG microsite:** preferir o bloco "Clasificación final" a uma jornada
  isolada — o vencedor de uma jornada não é o vencedor da prova.

### Comandos

```bash
node scripts/build-run-digest.js --since "24 hours ago" --source diario --print
node scripts/build-run-digest.js --since "7 days ago" --print --all   # inclui adultos
node scripts/build-run-digest.js --source federados --only-players --out /tmp/d.json
node scripts/build-run-digest.js --base <sha-do-run-anterior> --source cadastro --only-players --print
node scripts/send-digest-issue.js --file /tmp/d.json --dry-run        # ver o email
```

`workflow_dispatch` do `daily-digest.yml` aceita `since`, `dry_run` e
`include_all`. Testes: `scripts/lib/digest-extract.test.js` (36).
Ambos os scripts engolem os próprios erros — **o resumo nunca pode falhar um
workflow de dados**.

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

## Ranking PJA — página standalone + fonte única de regras (2026-08-12)

**`ranking-pja.vercel.app` NÃO é a app principal** — é uma página standalone
(`ranking-pja/index.html`, HTML único com motor inline) num 2º projecto Vercel
(`ranking-pja`, root directory = `ranking-pja/`) do MESMO repo. Ambos os
projectos fazem deploy a cada push no `main`. A página busca os dados via
rewrite `/data/* → golf-fpg.vercel.app/data/*` (ver `ranking-pja/vercel.json`).

**As REGRAS do ranking (elegibilidade, classificação DT/Aquapor/GG, GF,
multiplicadores, pontos) vivem numa fonte ÚNICA: `ranking-pja/pja-rules.mjs`**
(ESM puro sem dependências, tipos em `pja-rules.d.mts`), consumida por:
- `src/pages/FPGPage.tsx` — `isPJACore()` no filtro do `pjaRankingList` (o
  wrapper local só acrescenta `_manual`/`_origin === "PJA"` e a exclusão SSerra);
- `src/ui/PJARankingView.tsx` — `classifyPJAEvent`/`isGFTournament`/
  `getTournMultiplier`/`pjaPts`;
- `src/pages/fpg/constants.ts` — `TOURN_PILLS` deriva de `PJA_TCODES`;
- `ranking-pja/index.html` — importa via `<script type="module">` (same-origin,
  a pasta é o root do projecto).

⚠ **Alterar regras do ranking SEMPRE em `pja-rules.mjs`** — nunca duplicar nos
consumidores (aconteceu 2026-08-12: o Amendoeira World Kids foi adicionado só
à FPGPage e a standalone ficou sem ele). Testes: `src/data/__tests__/pjaRules.test.ts`.
⚠ **`PJA_TCODES` é match por tcode SEM ccode** — não adicionar tcodes que a FPG
reutilize (ex: 10604-10606 = Amendoeira 2026 E Clube de Belas 2025 → o
Amendoeira entra por NOME em `isPJACore`, não por tcode).
O que fica FORA da fonte única: `shortTournName` (apresentação, cada superfície
tem a sua) e o motor de agregação/UI de cada lado.

### ⚠ O `pja-rules.mjs` é servido EM CRU ao browser (2026-08-31)

A standalone importa-o com `<script type="module">` **same-origin** — a pasta
`ranking-pja/` é o root do projecto Vercel — por isso o ficheiro é
descarregável tal e qual em `ranking-pja.vercel.app/pja-rules.mjs`,
**comentários incluídos**. Não é bundled nem minificado (ao contrário da app
principal, onde o Vite os deita fora).

Logo: **nada de notas internas nesse ficheiro** — processo interno, decisões
por confirmar, nomes de pessoas, raciocínio que fora de contexto se lê mal.
O que for preciso guardar vai para aqui (o CLAUDE.md nunca é servido).
Comentários curtos e neutros que expliquem o código chegam.

⚠ As restantes secções do ficheiro ainda têm comentários desse género
(o motivo do ×1.75 do Royal Óbidos, as notas do Amendoeira/Clube de Belas,
o "legacy confirmado contra o Excel oficial" de 2025). Ficaram como estavam —
limpar quando houver decisão sobre cada um.

### Notas públicas do ranking — `PJA_NOTAS` (2026-08-31)

O que o público lê sobre elegibilidade vive em `PJA_NOTAS` + `notasPJA(ano,
hoje)` no `pja-rules.mjs`, e é renderizado por AMBAS as superfícies
(`RankingNotas` na `PJARankingView`, `renderNotas()` na standalone). O texto
está na fonte única pela mesma razão que as regras: senão as duas páginas
acabam a dizer coisas diferentes.

- `tipo: "fora"` — prova do calendário que não conta (fica indefinidamente).
  ⚠ Só entram aqui as exclusões que alguém de fora **iria estranhar** (uma
  prova do calendário sem coluna no ranking). O Sub-10 do Miramar não tem nota
  pública de propósito: não há Sub-10 no circuito, ninguém dá pela falta, e a
  nota só levantava uma pergunta que não existia.
- `tipo: "info"` + `ate: "YYYY-MM-DD"` — nota de agenda, desaparece sozinha
  depois dessa data (senão o site fica a anunciar provas já jogadas).
- O bloco é desenhado ANTES do fetch dos dados — aparece mesmo que o
  carregamento falhe.

### ⚠ TOP-14 voltas: mostrar QUAIS caíram (2026-08-31)

O total é a soma das **14 MELHORES voltas** do ano — caem as piores. ⚠ São
**voltas, não provas**: uma prova de 3 rondas gasta 3 lugares, por isso o tecto
aperta muito antes das "14 provas" (medido a 31-08: João Rocha 13 voltas em 6
provas, Nuno Palmares 12 — o Torre e a Grande Final passam-nos os dois).

Os dois motores já ordenavam por pontos e cortavam no 14 — o que faltava era
**dizê-lo na tabela**. A `PJARankingView` chegava a calcular `inTop14` por
volta e nunca o usava no render; a standalone nem isso. Resultado: a partir da
15ª volta a linha deixava de somar para o total e não havia como perceber
porquê ("as contas não batem").

Agora, nas duas superfícies:
- volta fora do top-14 → **esbatida** (`opacity .35`) + tooltip "Fora das 14
  melhores voltas — não soma";
- colunas **Vlt** e **Total** mostram DOIS números quando o tecto morde: o que
  conta em tamanho normal e, a seguir, o que se jogou em pequeno e esbatido —
  `14/18` e `276/309`. Quem não passou as 14 mantém um número só.
  ⚠ **Na mesma linha, nunca empilhados** (`display:block`): empilhar punha a
  linha da tabela a **38-46px contra os 26px** das outras e dava muito nas
  vistas. Inline a altura fica igual à das restantes (medido: excesso 0);
- a linha de regras explica-o em texto.

⚠ Não confundir com o `excluded` (GG Main R1, Aquapor de quem joga Drive Tour),
que continua **riscado** — são coisas diferentes: uma regra tirou-a vs. jogou-se
e vale, mas há 14 melhores.

⚠ O "total de todas" soma só as voltas ELEGÍVEIS (as `excluded` ficam fora dos
dois números, como já ficavam da contagem de voltas) — senão os dois totais
falavam de universos diferentes.

Validado num browser com dados reais + um torneio fabricado a forçar 18 voltas:
`14/18` e `276/309`, com 276 + (12+9+7+5) = 309 a fechar, e as 4 esbatidas a
serem exactamente as 4 piores.

### Provas do calendário 2026 que NÃO contam — e porquê

| Prova | ccode/tcode | Porque fica fora |
|---|---|---|
| Camp. Juvenil — Taça Visconde Pereira Machado (6-7 Jul, Estoril) | 004/10580 (Esc. A) + 004/10581 (Esc. B) | Os tees de partida não foram os estabelecidos para as restantes provas do circuito (jogou-se das **brancas**) — resultados não comparáveis. **Exclusão deliberada — não re-adicionar.** ⚠ A nota pública fica-se pelo facto, em registo formal: não entra em cores de marcas nem na mecânica dos pontos. |
| Miramar Open — Sub-10 (19-21 Ago) | 003/10653 | Não há Sub-10 inscritos no PJA 2026 → nunca creditaria ninguém, só acrescentava uma coluna vazia. Do Miramar conta só o U25 (003/10652). Basta apagar a linha do `Sub 10` no `isPJACore` se um dia houver um. **Sem nota pública** (ver acima). |

⚠ Se alguma delas vier a entrar, entra **por NOME** em `isPJACore` — nunca por
`PJA_TCODES`. A FPG reutiliza os quatro números noutros clubes e anos: 10580 em
007/022/068, 10581 em 022, 10652 em 009/022, 10653 em 009/022. Pô-los na
whitelist por tcode arrastaria torneios que não têm nada a ver (mesma armadilha
do Amendoeira ↔ Clube de Belas).

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

**Separação de pipelines USKids vs não-USKids** — Torneios não-USKids (Doral, WJGC, Greatgolf, QDL, EOWAGR) devem alimentar **apenas** a tab Rivais via `buildAutoRivals()`. A tab Resultados carrega **exclusivamente** de `uskids-results.json` e `uskids_torneios_completos(1-40).json`. Este bug voltou várias vezes.

**Manuel tem 4 variantes de nome + 2 contas USKids** — "Manuel Medeiros", "Manuel Francisco Medeiros", "Manuel Goulartt Medeiros", e "Manuel Francisco Goulartt De Medeiros" (este último era da **conta USKids antiga**, antes da migração para mid `630106`). Usar sempre `autoRivals.filter(d => d.isM)` (não `find()`) e fazer merge de todas as entradas. `isManuelByName()` em `src/constants/manuel.ts` já apanha as 4 variantes. Para mid USKids legacy, ver `MANUEL_PLAYER_IDS` (array) — adicionar lá o mid antigo quando validado via `scripts/verify-manuel-legacy-mid.js`.

**Manuel — conta USKids antiga (legacy)** — jogou em 2023 (Real Club de Golf El Prat tcode 15573 Boys 9, gross 44, place 3) com **mid 605933** (validado 2026-05-13 via GetTournamentPlayers&f=198807 + GetMemberTournamentResults — única aparição na carreira). Conta abandonada depois desse torneio; conta nova `630106` criada para a temporada seguinte. O nome aparecia como "Manuel Francisco Goulartt De Medeiros". Histórico, confrontos H2H e progressão de escalões mergeam os dois IDs como um único jogador via `MANUEL_PLAYER_IDS = ["630106", "605933"]` em `src/constants/manuel.ts`.

**Referências estáticas a dados fora de componentes React ficam stale** — `const manuel = D_BASE.find(x => x.isM)` fora de um componente referencia dados pré-merge. Fazer lookup dentro do componente via state.

**FPGPage — torneio resolvido pela URL, não por displayList[selected]** — o render do detalhe usa `tShow = displayList.find(t.ccode/tcode === params.tkey)`, não `cur = displayList[selected]`. Razão: durante load async, `tournaments`/`jovensTournaments`/`clubesTournaments` chegam em batches e cada um re-calcula o `displayList` useMemo (sort por data desc). Sem tie-breaker estável entre items com a mesma data, `displayList[selected]` aponta a torneios diferentes entre re-renders → user vê "A carregar..." preso ou outro torneio. Adicionalmente, o `handleClick` da sidebar precisa de chamar `navigate()` directamente; sem isso, o guard anti-loop do `state→URL` skipa quando `params.tkey != novo cur.tcode/ccode`, deixando o user preso na URL antiga. **Source of truth = URL**. Não tentar fixar via useState/useEffect/selectedKey complexos — leva a regressões em cascata. Resolvido 2026-04-27.

### Dados

- **`TabelaGlobal.TG_D`** — array manual de rivais curado independentemente (o gémeo `KIDSPage.D` desapareceu com o sunset da KIDSPage em 2026-08-06). Continua a ter homónimos distintos de propósito ("Maxime Vervaet" Spain/B12-13 vs Belgium/B10-11) — não "corrigir" contra outras fontes sem curadoria manual.
- **Epochs `/Date(ms)/` da FPG = meia-noite em hora de LISBOA** (corrigido no pipeline 2026-07-02) — no horário de verão (UTC+1) o epoch é 23:00 UTC do dia anterior. Formatar com getters locais numa máquina UTC (GitHub Actions) ou com `toISOString()` em qualquer máquina dá **−1 dia** para datas de fim-Março a fim-Outubro. Fix em `lib/helpers.js`: `getPlayedAt` prefere as strings (`hcp_dateStr`/`score_dateStr`) e os fallbacks de epoch passam por `lisbonCivilDay()` (Intl em `Europe/Lisbon` → meia-noite UTC); `fmtDate` usa getters UTC. ✅ Scripts em `scripts/` corrigidos 2026-07-07 — usam agora `lisbonCivilDayStr()` (variante string do `lisbonCivilDay`, exportada de `lib/helpers.js`) sobre os epochs `started_at`: `scrape-classif-node`, `scrape-drive-node`, `scrape-jovens-node`, `scrape-crj-madeira-historico`. Os `pairings-build` (`normIsoDate`), `scrape-federados-node` (`parseNetDate` p/ birthdates) e `scrape-fpg-admissions-draws-node` (`dotNetToIsoDate`) já tinham sido corrigidos antes. `enrich-players.js:197` é seguro (o `dateSort` já vem de `getPlayedAt`→`lisbonCivilDay` = meia-noite UTC do dia civil). Os `new Date().toISOString().slice(0,10)` restantes são marcadores "hoje"/"lastUpdated" (não epochs FPG) — inofensivos.
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
- **Cross-page linking** — `↗ Kids` links em USKIDSPage abrem `/kids#EncodedPlayerName` em novo tab; `/kids` redirige para `/kids2` preservando o hash, e o KIDS2Page resolve-o (`resolveToId`: id canónico → memberId → fed → normName/aliases).

---

## Ficheiros-chave

| Ficheiro | Papel |
|----------|-------|
| `kids/FieldRivaisDashboard.tsx` | Dashboard de field/rivais USKids (tabs Jogadores/Scores/Scorecards/Campo/Previsão/Scout) — renderizado em `/kids2/next-t`; a KIDSPage legacy foi removida 2026-08-06 |
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
| `teeGroups.ts` | Agrupamento por tee físico (`physicalTeeGroups`/`physicalTeeKey`/`sexesIn`) — partilhado Campos+Simulador (2026-06-13) |
| `TeeBars.tsx` | Barras de tees partilhadas (bolinha + distância + CR/Slope por sexo); modos display / selector-por-sexo / selector-de-grupo (2026-06-13) |
| `RoundSimulator.tsx` | Simulador "E se?" de impacto no HI (best-N/5.2a + Exceptional Score); usado em JogadoresPage e SimuladorPage (prop `storageKey`) |
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