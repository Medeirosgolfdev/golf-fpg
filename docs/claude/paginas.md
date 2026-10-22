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
| `/kids2` (+ `/scout/:tid`, `/inscricoes`, `/ranking`, `/ranking/:year`, `/:juniorId`, `/next-t`) | KIDS2Page | rebuild canonical-first do tracker de rivais; sub-rotas em `src/pages/kids2/`. `/next-t` (Próximos torneios) é um CircuitShell desde 20/10/2026 (`kids2/nextCircuit.tsx`; `?t=&esc=&tab=`, os links antigos `tab=players&vista=…` continuam) |
| `/FPG` (+ `/torneio/:tkey`, `/:filter`, `/:filter/:sub`; `/diversos` → redirect `/FPG`; o antigo `/FPG/clubes?ct=ccode-tcode` → `/FPG/torneio/ccode-tcode`) | FPGPage (estrutura em «A /FPG por dentro», abaixo) | pull-torneiosNNN.json, jovens_YYYY.json, CLUBES/clubes_sub_14&18, drive/aquapor-data (só os do `fpg-files-index.json`) |
| `/drive` (+ `/torneio/:tkey`) | DrivePage | drive-data-YYYY-MM.json, aquapor-data-YYYY-MM.json |
| — (`/bjgt` e `/bjgt-legacy` → redirect `/major`) | BJGTPage.tsx é MÓDULO (bjgtMajorDivision, FStats/HoleDiff/ManuelDay) consumido pela MajorPage; os dados vivem em `src/data/major/bluegolf.ts` — UI standalone removida 2026-07-02 | brjgt*_*.json, wjgc_*.json |
| `/bjgt-analysis/:fed?` | BJGTAnalysisPage | data.json por jogador |
| `/major` (+ `/:source/:year`) | MajorPage | funde Doral + BJGT/EOWAGR no CircuitShell, agrupado por série/ano |
| — (`/doral` e `/doral-legacy` → redirect `/major`) | DORALPage.tsx é MÓDULO (doralEvoFor, doralMajorDivision) consumido pela MajorPage; os dados vivem em `src/data/major/doral.ts` — UI standalone removida 2026-07-02 | ftm_doral_*.json |
| `/comparar` | ComparePage (redirect) | **saiu da barra 2026-10-13** → `/campos?view=comparar` (vista «Comparar» dos Campos: Campo A vs B · Vantagem de Tee — `CamposCompareView`); comparar jogadores = `/jogadores?comparar=1` (CompararPage na vista «⚔️ Comparar» dos Jogadores) |
| `/simulador` | SimuladorRedirect | **vista dos Campos desde 2026-10-13** → `/campos/<campo>?view=sim` |
| `/calendario` | CalendarioPage (dados em `src/data/calendarEvents.ts`) | players.json (aniversários) |
| `/draws` | — | **saiu da barra 2026-10-13** → `/jogadores/52884?view=draws` (vista «🤝 Draws» só na ficha do Manuel; DrawsPage embebida no PlayerDetail) |
| `/kids2/listas` | kids2/ListasPage | listas de inscritos (Entry Lists) com link para as fichas · hcp-listas-ligacoes.json (gerado pelo agregador) |
| `/om-cgss` | OmCgssPage | Ordem de Mérito Júnior CGSS de hoje (a tab `OmRankingTab` de `fpg/fpgOmRanking.tsx` sem prova aberta) · om-cgss-junior.json |
| `/titulos` (+ `/:tab`) | TitulosPage | vista histórica de campeonatos de jovens FPG (3 tabs) |
| `/titulos/nacional` | TitulosPage (tab Nacional) | fpg-nacionais-historico.json (Campeões Nacionais Sub-10→18, 2005-2026; reusa JovensAnaliseView) |
| `/ffg` (+ `/info/:key` — `joueurs` = lista de jogadores FR estilo /rfeg/info/jugadores, `categorias`) | FFGPage | ffgolf-catalog.json + ffgolf/{year}_{slug}.json (torneios juvenis franceses); france-players.json (roster c/ contagens, `src/pages/ffg/PlayersView.tsx`) |
| `/rfeg` (+ `/:compId`, `/:source/:id`) | RFEGPage | rfegolf-* + livegolfscoring + nextcaddy + fcg (torneios juvenis espanhóis) |
| `/england` (+ `/:source/:key`) | — | **arquivada 2026-10-13** → `/major/reidtrophy/<ano>` (dados england_* continuam no kids2; ver `scripts/_archive/england/LEIA-ME.md`) |
| `/global-junior` (+ `/:slug`) | GlobalJuniorPage | gjgl-catalog.json + gjgl/gjgl_{slug}.json (Global Junior Golf Live) |
| `/egr` (+ `/evt/:id`, `/info/jogadores`, `/jogador/:id`) | EGRPage | egr-ranking.json + egr/egr-events-list.json + egr/events/egr_{id}.json (European Golf Rankings) |
| `/wagr` (+ `/evt/:id`, `/info/jogadores`, `/jogador/:id`) | WAGRPage | wagr-ranking.json + wagr/wagr-events-list.json + wagr/events/wagr_{id}.json (World Amateur Golf Ranking) |
| `/faldo` (+ `/:source/:key`) | — | **arquivada 2026-10-13** → redirecciona para `/major/faldomadeira/2026` (ver `scripts/_archive/faldo/LEIA-ME.md`) |

### A /FPG por dentro (21/10/2026, depois dos passos 1–8)

| O quê | Onde vive |
|---|---|
| Rotas ↔ estado (`/FPG/jovens`, `/sto`, `/clubes`, `/pja`, `/rankingPJA`, `/rankingSub12`, `/classificacoes`, `/inscritos`, `/jovens/inscritosCN`, o antigo `?ct=`) | `src/pages/fpg/routes.ts` |
| Carregar os dados (pull-torneios, Clubes, Jovens, drive/aquapor mensais do PJA, playersDB) e as listas derivadas | `src/data/fpgPageLoader.ts` (hooks `useFpg*`) |
| Que ficheiros existem (pull-torneios, drive-data, aquapor-data) — **nada de sondar nomes até dar 404** | `public/data/fpg-files-index.json`, gerado no `predev`/`prebuild` por `scripts/build-fpg-files-index.js` (gitignored; o Vercel gera-o em cada deploy); lido por `src/data/fpgFilesIndex.ts`; os mensais do Drive/AQUAPOR entram só por `loadDriveMonthly` (`src/data/drive/driveLoader.ts`, `cachedFetchJson` — a /drive e o Ranking PJA da /FPG partilham o pedido) |
| Ranking Sub-12 e Classificações | `src/data/fpgRankingsLoader.ts` |
| Torneios → entradas do CircuitShell (Todos/STO/PJA, Jovens, Clubes), deep-link `tkey` → (entrada, escalão) | `src/pages/fpg/fpgCircuitData.ts` (`buildFpgEntries`, `buildJovensEntries`, `buildClubesEntries`, `resolveFpgTkey`) |
| Clubes: formatos de equipa, match play 3-way, nº de jogadores e voltas sem classificação por pancadas | `src/data/clubesFormats.ts` (`clubesIndividualTournament`) · abas «Grupos»/«Match Play» em `src/pages/fpg/fpgClubes.tsx` |
| Detalhe do torneio | `TournamentDetail` (via `division.renderFull`) + abas extra (`fpgPastEditions`, `fpgMatchplay`, `fpgOmRanking`) |
| A página | `src/pages/FPGPage.tsx` (~800 linhas): barra, escolha da vista, itens da sidebar, rankings e painel de inscrições |

- **Todas as vistas de torneios passam pelo `CircuitShell`** (Todos, STO, PJA, Jovens, Clubes). Ficam fora: Ranking PJA, Ranking Sub-12, Classificações (`PJARankingView`) e o painel de inscrições (`InscricoesPanel`).
- **O torneio aberto sai só do URL** (`/FPG/torneio/{ccode}-{tcode}`): `resolveFpgTkey` sobre as entradas da vista aberta dá `selectedId`/`selectedDivKey` ao shell; clicar na sidebar navega (`onSelectEntry`/`onSelectDivision`). Não há `selected`/`cur` nem efeitos URL↔estado do torneio (saíram no passo 8). O único estado é a vista (`seriesFilter`, `navMode`): um `/FPG/torneio/…` mantém a vista em que se estava.
- Deep-link de um torneio que não está na vista aberta: match play de Clubes → passa para Clubes (`tkeyToClubes`); Drive/Aquapor → `/drive/torneio/…` (`tkeyDriveTarget`). Enquanto falta algum lote de dados o shell fica «a carregar» (`tkeyPending`), para não reescrever o URL com o torneio por omissão.

> **Páginas legadas** — `/bjgt-legacy` e `/doral-legacy` foram **removidas** 2026-07-02 (redirect → `/major`, que tem paridade total via CircuitShell; BJGTPage.tsx/DORALPage.tsx sobrevivem como módulos de dados+componentes ricos consumidos pela MajorPage). **`/kids-legacy` (KIDSPage) foi REMOVIDA em 2026-08-06** (sunset; redirect → `/kids2`). As 4 funcionalidades que bloqueavam o sunset resolveram-se assim: **(1)** tabela H2H detalhada → o `kids2/components/MatchupVsManuel.tsx` foi elevado à paridade (±par por lado, coluna Resultado c/ tinte, Dif. em ±par, médias de posição; e corrigidos 2 bugs: `totalGross ?? 0` a poluir médias e confrontos perdidos quando um jogador está em 2 flights do mesmo torneio, caso England cross-trophy); **(2-4)** Previsão WHS, Course Tab e Scorecards históricos NUNCA foram exclusivas — vivem no `kids/FieldRivaisDashboard.tsx`, que o kids2 renderiza em `/kids2/next-t` (tabs `?tab=previsao|campo|scorecards`). Apagados: `KIDSPage.tsx` + cadeia legacy-only (`kids/RivalDetail`, `RivalCharts`, `H2HSortableTable`, `RivaisSidebar`, `AnaliseSection`, `MemberHistTable`, `TournScorecard`, `courseScorecards`, `dobInference`, `tournDef`, `types`). **Mantêm-se** em `src/pages/kids/`: `FieldRivaisDashboard.tsx` + `CourseTab`/`PrevisaoTab`/`previsaoModel`/`HistoricScorecardsTab` (partilhados com o kids2). O array manual `D` da KIDSPage morreu com ela (a armadilha D vs TG_D ficou resolvida).
>
> **⚠ `ScotlandPage.tsx` (Junior Tour Scotland) está COMPLETA mas deliberadamente NÃO ligada às rotas** — página de circuito de 363 linhas (como England/FFG/RFEG), com scraper `scrape-junior-tour-scotland.js` e dados `scotland-jts-*.json`, mas sem `import`/`<Route>` no `App.tsx`. **Decisão 2026-07-02: os dados actuais NÃO são úteis/fiáveis — só ligar a rota quando houver uma fonte de dados boa e fiável.** Até lá fica desligada de propósito; não é bug.
>
> **`NacionaisJovensPage.tsx` foi REMOVIDA em 2026-07-02** (era código morto: lazy-importada sem `<Route>`). A funcionalidade vive na tab **`/titulos/nacional`** (`TitulosPage`), que reusa o mesmo `JovensAnaliseView` com os mesmos dados. A secção "Página `/nacionais-jovens`" mais abaixo descreve o pipeline de dados (continua válido) mas a página/rota já não existem.

### A /drive por dentro (22/10/2026, fase 1 da reescrita por tipo de torneio)

| O quê | Onde |
|---|---|
| Mensais `drive-data`/`aquapor-data` (pelo índice, `cachedFetchJson`; partilhados com o Ranking PJA da /FPG), arranque (`loadDriveData`: crus + voltas expandidas + players), equipas das Finais (`loadDriveEquipas`), inscrições/draws (`loadDriveAdmissions`) | `src/data/drive/driveLoader.ts` |
| Lista de torneios da /drive: `attachDriveAdmissions` (⚠ pendura nos próprios objectos), `buildDriveSource` (futuros sintéticos + provisório da Final fundido), `filterDriveSource` (série/ano/zona) | `src/data/drive/driveSource.ts` |
| Adaptador para o CircuitShell (`buildDriveEntries`, `DRIVE_CONFIG`, `mergeDrivePlaceholders`) | `src/data/drive/driveCircuitData.ts` |
| Ranking Sub-12 e Classificação por escalão (`buildSub12Data`, `filterBySub12Series`, `filterTournByEsc`, contagens, KPIs) | `src/data/drive/driveSub12.ts` |
| Ranking (Sub-12 e restantes escalões) e a classificação acumulada da «Época»: capacidade `ranking` do CircuitShell | `src/pages/drive/driveRanking.tsx` (+ `ui/circuit/CircuitRanking.tsx`) |
| A página (URL, barra, ligação ao shell) | `src/pages/DrivePage.tsx` |

- **Abrir o torneio certo (decisão B, 22/10/2026):** o CircuitShell da /drive fica
  «a carregar» até chegarem as inscrições (`fpg-admissions-draws.json`) — os
  torneios por jogar (a Final de 07/11) só entram na lista com elas, e o shell
  escolhia antes o penúltimo. Teste com os dados reais:
  `src/data/drive/__tests__/driveOpenLatest.test.ts` (o `realDataFetch.ts` põe o
  `fetch` a ler `public/data`).

- **O URL é a única fonte de verdade (decisão A, 22/10/2026;
  `src/data/drive/driveUrl.ts`)** — como a /FPG: o torneio E o escalão abertos
  vivem só no caminho `/drive/torneio/{ccode}-{tcode}` (`resolveDriveTkey` →
  `selectedId`/`selectedDivKey` do shell; clicar na sidebar ou num escalão navega
  com `replace`). Os filtros vivem na query (`parseDriveQuery`/`driveQueryString`:
  `nav`, `series`, `manuel`, `region`, `esc`, `year`, `s12s`, `s12v`, `s12r`,
  `s12x`, `s12e`, e a aba em `tab`); só as acções do utilizador os mudam — não há
  efeitos de «reset» ao montar. Não há estado do torneio na página nem efeitos
  URL↔estado: **não os voltar a pôr.**
  - Torneio por omissão (sem torneio no URL, ou escondido pelos filtros): é a
    página que escolhe — o primeiro por data, na ordem da lista (o shell
    desempata pelo nome e escolhia outro na Final Nacional do Challenge). Ao shell
    passa-se sempre um `selectedId` (sentinela enquanto não há), para ele nunca
    escolher sozinho.
  - Deep-link de outra série/ano/zona: é «consumido» uma vez
    (`driveFiltersForTkey` muda série/ano/zona/escalão/★Manuel para ele aparecer);
    depois, mudar filtros que o escondam abre o mais recente.
  - Links antigos: `?t={id da entrada}` redirecciona para o caminho
    (`legacyDriveT`); `…_R1`/`…_Total` abrem o torneio; `s12v=list` abre o Ranking.
  - Torneios com várias voltas ficam com o tcode da FPG (acabou a reescrita
    para `…_R1`, que saía da lista antiga `buildGroups`, apagada).
  - Testes: `src/data/drive/__tests__/driveUrl.test.ts` (com os dados reais).

- **«Classificação» por escalão (decisão H, 22/10/2026)** —
  `driveEntriesByEsc`/`filterTournByEsc` (`driveSub12.ts`): no Tour e no AQUAPOR
  (divisões sem escalão) cada torneio fica só com os jogadores do escalão
  (escalão do jogador no torneio, comparado pela tabela única `model/escalao.ts`)
  e as posições refazem-se em CÓPIAS; no Challenge ficam os eventos que têm esse
  escalão, com todos os escalões. Já não se reescreve `p.pos` dos jogadores
  partilhados (o efeito passava ao leaderboard e aos pontos do Ranking Sub-12).
- **Ranking (decisões D e G, 22/10/2026)** — já não há modo «Rankings» com barra
  e sidebar próprias: o botão «🏅 Ranking» da barra abre a vista do shell
  (`nav=ranking-sub12` no URL), com a série/ano/zona da barra, ★ Manuel e a
  pesquisa; escalão (`s12e`), sexo (`s12x`) e vista (`s12v`: Tabela, Ranking,
  Evolução) no cabeçalho da vista; com «Todos» a série escolhe-se lá (`s12s`).
  Os links antigos `s12s`/`s12r` passam a `series`/`region`. A zona filtra os
  TORNEIOS da zona (era a zona «modal» de cada jogador): é o ranking regional.
  A aba «Época» de cada torneio abre com a classificação acumulada das etapas da
  época (série/zona/ano), no escalão aberto (Challenge) ou todos (com coluna
  Escalão).
- **Bandeiras (decisão F, 22/10/2026)** — o playersDB da /drive é o da /FPG
  (`loadFpgPlayersDB`, `src/data/fpgPlayersDB.ts`): `players.json` +
  nacionalidades dos federados estrangeiros (bandeira antes do nome, nascimento
  e sexo) + os seguidos no /kids (↗).
