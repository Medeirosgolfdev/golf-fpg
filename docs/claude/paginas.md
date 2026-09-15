# Páginas e rotas (tabela completa e páginas legadas)

> Detalhe tirado do CLAUDE.md a 2026-09-15 (o CLAUDE.md fica só com o essencial e
> aponta para aqui). Datas entre parênteses = quando a regra ou a medição foi feita.

### Páginas (lazy-loaded)

| Rota | Página | Dados |
|------|--------|-------|
| `/jogadores` | JogadoresListPage | federados.json + métricas (landing de /jogadores, tabela tipo FederatedsList) |
| `/jogadores/:fed` | JogadoresPage | data.json por jogador, player-stats.json |
| `/jogadores-por-ano` | JogadoresPorAnoPage | players/federados por coorte de ano de nascimento (utilidade, fora da NavBar) |
| `/torneios-recentes` (+ `/:key`) | RecentTournamentsPage | recent-tournaments.json — torneios recentes reconstruídos das voltas WHS dos nossos jogadores (utilidade, fora da NavBar); detalhe reutiliza `TournamentDetail` |
| `/campos/:courseKey?` | CamposPage | master-courses.json, away-courses.json, extraCourses.ts, course-players.json, {MANUEL}/analysis/data.json (tab "Como jogou") |
| `/uskids` | USKIDSPage | uskids-results.json, uskids_torneios_completos(1-41).json, uskids-field.json |
| — (`/kids` e `/kids-legacy` → redirect `/kids2`) | KIDSPage REMOVIDA 2026-08-06 (sunset — ver "Páginas legadas") | — |
| `/kids2` (+ `/scout/:tid`, `/inscricoes`, `/ranking`, `/ranking/:year`, `/:juniorId`, `/next-t`) | KIDS2Page | rebuild canonical-first do tracker de rivais; sub-rotas em `src/pages/kids2/` |
| `/FPG` (+ `/torneio/:tkey`, `/:filter`, `/:filter/:sub`; `/diversos` → redirect `/FPG`) | FPGPage | pull-torneiosNNN.json |
| `/drive` (+ `/torneio/:tkey`) | DrivePage | drive-data-YYYY-MM.json, aquapor-data-YYYY-MM.json |
| — (`/bjgt` e `/bjgt-legacy` → redirect `/major`) | BJGTPage.tsx é MÓDULO de dados (URLS, loadT, bjgtMajorDivision, FStats/HoleDiff/ManuelDay) consumido pela MajorPage — UI standalone removida 2026-07-02 | brjgt*_*.json, wjgc_*.json |
| `/bjgt-analysis/:fed?` | BJGTAnalysisPage | data.json por jogador |
| `/major` (+ `/:source/:year`) | MajorPage | funde Doral + BJGT/EOWAGR no CircuitShell, agrupado por série/ano |
| — (`/doral` e `/doral-legacy` → redirect `/major`) | DORALPage.tsx é MÓDULO de dados (DATA_FILES, normalizeFile, doralMajorDivision) consumido pela MajorPage — UI standalone removida 2026-07-02 | ftm_doral_*.json |
| `/comparar` | ComparePage (4 tabs: Campos, Vantagem de Tee, Jogadores, Simulador; a tab Jogadores delega em CompararPage e a Simulador embute a SimuladorPage) | master-courses, players.json, {MANUEL}/analysis/data.json |
| `/simulador` | SimuladorPage | simCourses (master), players.json, {fed}/analysis/data.json (selector de jogador + "E se?") |
| `/calendario` | CalendarioPage | — |
| `/draws` | DrawsPage | manuel-pairings.json (jogadores com quem o Manuel já foi parelhado, FPG + USKids) |
| `/titulos` (+ `/:tab`) | TitulosPage | vista histórica de campeonatos de jovens FPG (3 tabs) |
| `/titulos/nacional` | TitulosPage (tab Nacional) | fpg-nacionais-historico.json (Campeões Nacionais Sub-10→18, 2005-2026; reusa JovensAnaliseView) |
| `/ffg` (+ `/info/:key` — `joueurs` = lista de jogadores FR estilo /rfeg/info/jugadores, `categorias`) | FFGPage | ffgolf-catalog.json + ffgolf/{year}_{slug}.json (torneios juvenis franceses); france-players.json (roster c/ contagens, `src/pages/ffg/PlayersView.tsx`) |
| `/rfeg` (+ `/:compId`, `/:source/:id`) | RFEGPage | rfegolf-* + livegolfscoring + nextcaddy + fcg (torneios juvenis espanhóis) |
| `/england` (+ `/:source/:key`) | EnglandGolfPage | england-golf-catalog.json + england_{slug}.json (England Golf / GolfGenius) |
| `/global-junior` (+ `/:slug`) | GlobalJuniorPage | gjgl-catalog.json + gjgl/gjgl_{slug}.json (Global Junior Golf Live) |
| `/egr` (+ `/evt/:id`, `/info/jogadores`, `/jogador/:id`) | EGRPage | egr-ranking.json + egr/egr-events-list.json + egr/events/egr_{id}.json (European Golf Rankings) |
| `/wagr` (+ `/evt/:id`, `/info/jogadores`, `/jogador/:id`) | WAGRPage | wagr-ranking.json + wagr/wagr-events-list.json + wagr/events/wagr_{id}.json (World Amateur Golf Ranking) |
| `/faldo` (+ `/:source/:key`) | FaldoPage | faldo-catalog.json + faldo/{tour}_{id}.json (Faldo Series — um JobFile por etapa) |

> **Páginas legadas** — `/bjgt-legacy` e `/doral-legacy` foram **removidas** 2026-07-02 (redirect → `/major`, que tem paridade total via CircuitShell; BJGTPage.tsx/DORALPage.tsx sobrevivem como módulos de dados+componentes ricos consumidos pela MajorPage). **`/kids-legacy` (KIDSPage) foi REMOVIDA em 2026-08-06** (sunset; redirect → `/kids2`). As 4 funcionalidades que bloqueavam o sunset resolveram-se assim: **(1)** tabela H2H detalhada → o `kids2/components/MatchupVsManuel.tsx` foi elevado à paridade (±par por lado, coluna Resultado c/ tinte, Dif. em ±par, médias de posição; e corrigidos 2 bugs: `totalGross ?? 0` a poluir médias e confrontos perdidos quando um jogador está em 2 flights do mesmo torneio, caso England cross-trophy); **(2-4)** Previsão WHS, Course Tab e Scorecards históricos NUNCA foram exclusivas — vivem no `kids/FieldRivaisDashboard.tsx`, que o kids2 renderiza em `/kids2/next-t` (tabs `?tab=previsao|campo|scorecards`). Apagados: `KIDSPage.tsx` + cadeia legacy-only (`kids/RivalDetail`, `RivalCharts`, `H2HSortableTable`, `RivaisSidebar`, `AnaliseSection`, `MemberHistTable`, `TournScorecard`, `courseScorecards`, `dobInference`, `tournDef`, `types`). **Mantêm-se** em `src/pages/kids/`: `FieldRivaisDashboard.tsx` + `CourseTab`/`PrevisaoTab`/`previsaoModel`/`HistoricScorecardsTab` (partilhados com o kids2). O array manual `D` da KIDSPage morreu com ela (a armadilha D vs TG_D ficou resolvida).
>
> **⚠ `ScotlandPage.tsx` (Junior Tour Scotland) está COMPLETA mas deliberadamente NÃO ligada às rotas** — página de circuito de 363 linhas (como England/FFG/RFEG), com scraper `scrape-junior-tour-scotland.js` e dados `scotland-jts-*.json`, mas sem `import`/`<Route>` no `App.tsx`. **Decisão 2026-07-02: os dados actuais NÃO são úteis/fiáveis — só ligar a rota quando houver uma fonte de dados boa e fiável.** Até lá fica desligada de propósito; não é bug.
>
> **`NacionaisJovensPage.tsx` foi REMOVIDA em 2026-07-02** (era código morto: lazy-importada sem `<Route>`). A funcionalidade vive na tab **`/titulos/nacional`** (`TitulosPage`), que reusa o mesmo `JovensAnaliseView` com os mesmos dados. A secção "Página `/nacionais-jovens`" mais abaixo descreve o pipeline de dados (continua válido) mas a página/rota já não existem.
