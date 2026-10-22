# Convenções de código, armadilhas conhecidas, ficheiros-chave e testes

> Detalhe tirado do CLAUDE.md a 2026-09-15 (o CLAUDE.md fica só com o essencial e
> aponta para aqui). Datas entre parênteses = quando a regra ou a medição foi feita.

## Convenções de código

### CSS e cores

- **Todas as cores passam por `tokens.css`** — nunca hardcodar hex nos componentes.
- `colors.ts` espelha os tokens para uso em JS/TS (recharts, arrays de dados). Alterar primeiro em `tokens.css`, depois actualizar `colors.ts`.
- Cores das fontes das páginas de circuito (pill «Fonte» da sidebar do CircuitShell, «Internacionalizações»): `tokens.css` §11c (`--color-major`, `--major-src-*`, `--ffg-src-*`, `--rfeg-src-*`) e `C.major`/`C.majorSrc`/`C.ffgSrc`/`C.rfegSrc` no `colors.ts`. As páginas usam o **hex do `C`**, não `var()`: o shell escolhe o texto preto/branco da pill pelo hex (`fgFor`) e com `var()` dava sempre branco (o Optimist, dourado, tem texto preto). `scripts/circuit-source-colors.test.js` parte se `tokens.css` e `colors.ts` divergirem (21/10/2026).
- Páginas de circuito (FFG, RFEG, BJGT, Doral, GJGL) sem `style={{}}` desde 21/10/2026: as classes estão no fim do `App.css` («Páginas de circuito»). Ao trocar um inline por classe, atenção à especificidade — um inline ganha a tudo, a classe não: `.dtable th` alinha à esquerda (daí `.dtable th.th-c`), `.sc-table-modern .meta-row td` impõe a cor (daí `.sc-table-modern .meta-row td.c-danger`), e o `.chip` encolhe no telemóvel (daí `.chip.chip-round` com tamanho).
- **Cor por série da /drive** (decisão C, 22/10/2026): tokens `--drive-tour`/`--drive-challenge`/`--drive-aquapor` (`tokens.css`) e classes `.drive-serie-{série}` (definem `--drive-serie`), `.badge-serie.drive-serie`, `.drive-cal-pill.is-next` (fundo/borda por `color-mix`). Nunca `cor + "18"`: com `var(--…)` não é CSS válido (o fundo da pill «próximo» e do badge da série desapareciam no Tour e no AQUAPOR). Guarda: `src/data/drive/__tests__/driveColors.test.ts`.
- **Excepção intencional:** `OverlayExport.tsx` usa cores hardcoded porque `html-to-image` não suporta CSS custom properties — documentado com comentário no cabeçalho.
- `--pill-intl-bg: #00FF00` (verde néon, usado por `.p-intl`) é **intencional** — não "corrigir".
- `src/design-system.html` documenta visualmente todas as classes CSS.

### Scorecard — semântica de cores

| Score | Cor | Token |
|-------|-----|-------|
| Eagle | Âmbar `#f59e0b` | `--score-eagle` |
| Birdie | Vermelho `#dc2626` | `--score-birdie` |
| Par | Transparente/branco | — |
| Bogey | Azul `#bfdbfe` cantos rectos | `--score-bogey` |

Na barra de distribuição de scores o segmento de par deve ser branco/transparente, **não** o token `--score-par-seg` (verde; classe `.seg-par`). ⚠ Hoje só o `kids2/components/ScoringDistribution.tsx` segue a regra: o `ui/HoleStatsSection.tsx` e o `kids2/components/AnaliseSection.tsx` ainda pintam o par de verde.

### Componentes

- **`SexBadge.tsx` — NUNCA usar símbolos Unicode ♂ ou ♀ na UI.** Usar sempre `<SexBadge sex="M" />` ou `<SexBadge sex="F" />`. O badge é um círculo/pill com as cores oficiais do projecto (`--badge-male` / `--badge-female`). Isto aplica-se a legendas, labels, cabeçalhos de tabelas, contadores, tooltips — em TODO o lado onde seria tentador escrever ♂/♀ para indicar sexo.
- ⚠⚠⚠ **REGRA ABSOLUTA — TODAS as tabelas têm de ser ordenáveis por CLIQUE NO CABEÇALHO.** Sem excepções. Independente de número de linhas, tipo de página, ou contexto. Se vais criar uma tabela (ou ajustar uma existente) e NÃO tens as colunas sortable, **estás a violar a regra do projecto — revê antes de commitar**. Ferramentas obrigatórias:
  - Hook `useSort` de `src/hooks/useSort.ts` — gere `sortKey`/`sortDir`/`toggleSort`.
  - Componente `SortableHdr` de `src/ui/SortableHdr.tsx` para os `<th>` clicáveis com seta (↑/↓/↕).
  - Exemplo canónico: `const { sortKey, sortDir, toggleSort } = useSort<"pos"|"nome"|"hcp">("pos")` + `<SortableHdr k="pos" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>#</SortableHdr>`.
  - Quando renderizas via `ScorecardLeaderboard` a pos/nome/gross/toPar são ordenáveis com `sortable={true}`. **Mas colunas custom em `prefixHeaderCells`/`postScorecardHeaderCells` não são ordenáveis automaticamente** — tens de ordenar os rows manualmente antes de passar (com useSort + sort do array + SortableHdr nos headers custom). Ver `AdmissionsTab.tsx` e `DrawTab.tsx` como referência actual.
- `PillBadge.tsx`: usa classes CSS (`p`, `p-sm`, `p-muted`, `p-tourn`, `p-sub10`, `p-sub12`, `p-sub14`); a excepção são as cores das pills de ronda e de tcode (`PILL_ROUND`/`PILL_TCODE`, inline — o `PILL_ROUND` também é usado pela `DrawsPage`). `RoundPill` exportado para pills de rondas.
- Toggles de scorecard: usar `<span>`, não `<button>` (o styling default do browser sobrepõe o CSS).
- Hooks partilhados: `useIsMobile.ts`, `useMasterDetail.ts`, `SidebarToggle.tsx` para sidebar unificada; o layout é o `MasterDetail` (`src/ui/MasterDetail.tsx`: `<MasterDetail md={md} sidebar={…}>detalhe</MasterDetail>`).
- **Componentes únicos (consolidação de 2026-10-17)** — antes de escrever uma tabela, ver se já existe:
  - Inscrições: `AdmissionsTab` (aceita overrides por jogador: `dob`, `country`, `escalao`, `teeName`, `tags`). No CircuitShell a divisão entrega `admissions` (formato `FpgAdmissions`).
  - Draws: `DrawTab`. Fontes de fora convertem para `FpgDraw` (USKids `uskidsDrawToFpg`, LGPIDF `lgpidfDraws`, GolfGenius FFG `ggDrawToFpgDraw`, MAJOR `jobDrawsToFpg` (`data/major/jobFile.ts`), Espanha `rfegRoundDraw` (`data/rfeg/roundDraw.ts`, desenhado pelo `DrawSaidaView`)); no CircuitShell vão em `roundDraws`. As quatro de fora (LGPIDF, GG, MAJOR, Espanha) montam o draw no construtor único `buildFpgDraw` (`src/data/intlDraw.ts`): flights + o que o tee sheet traz + o enriquecimento por nome (`indexByName`, com as chaves e a regra «1.º/último ganha» de cada fonte); `groupConsecutive` faz os flights das fontes que dão uma linha por jogador (21/10/2026).
  - Filtros de jogadores: `PlayerFilterBar.tsx` — `PlayerFilterBar` (jogadores FPG do ScorecardLB) e `RowsFilterBar` + `filterRows` (linhas `MultiRoundRow`/Inscrições/Draw/Scorecards combinado), a mesma `FilterBarView`.
  - Scorecards de todas as voltas: `AllRoundsScorecardLB` desenha na `ScorecardLeaderboard`.
  - Só totais (sem buraco a buraco): `TotalsResumo` — EGR, WAGR, GJGL, LGPIDF e, desde 22/10/2026, o NextCaddy só com totais (Liguillas) e os destaques de live scoring (as tabelas próprias `NCResultsLeaderboard`/`NCHighlights` da RFEGPage saíram). O `TotalsPlayer` aceita `toPar` da fonte, `sex` (SexBadge) e `fed` (coluna FED); `extra[].sortValue` torna a coluna extra ordenável (`ExtraColumn.sortValue` no MultiRoundLeaderboard) e sem nenhum resultado a coluna Total sai (`showCols.gross`). No MultiRoundLeaderboard quem não tem gross fica sem posição (antes ficavam todos «1.º» empatados).
  - Rankings com circuito de eventos: `ui/ranking/RankingPage` (`RankingPage`, `RankingList`, `RankingTable`, `RankingDetail`) — a página só dá configuração e colunas.
  - Evolução ano-a-ano: `ui/evo.tsx` (`EvoSummary`, `tagEvo`, `makeEvoCols`).
  - Provas de fora da FPG: `intlScorecardOptions({...})` (`src/data/intlScorecard.ts`) e `buildFPGTournament()` (`src/data/intlTournament.ts`) — usado por TODAS as fontes de fora (BlueGolf, Doral, GJGL, BJGT, MAJOR/JobFile, FFG portal e GolfGenius, LGS, NextCaddy, RFEGolf, mitarjeta, golfdirecto; 21/10/2026). O que difere entre fontes entra por opção explícita: cartão por volta (`card`), `startHole`, `extra` da volta/jogador/torneio, `keepNoRounds`, `raw` (dados tal como vêm), `wd`/`isPortuguese` (`null` = sem marca) — nunca uma cópia do construtor. **Sem par oficial fica sem par** (decisão de 22/10/2026): `parOrNone` devolve o par da fonte ou `[]`; o `PAR_INVENTADO` (4×18 em LGS, NextCaddy, RFEGolf PDF, golfdirecto e GJGL) e o par «chato» do JobFile (total−toPar repartido pelos buracos) saíram. No MAJOR o par TOTAL de uma volta continua (é real: total − toPar) e dá o ±par; por buraco fica vazio. Sem par: `ScorecardLB`/`useAllRoundsData`/`AccumulatedLB` não contam 🦅/🐦/=/■ nem dão ±par por buraco ou por volta (só com o par total real e o cartão inteiro), a linha de info não diz «Par N», o `expandMultiRound` não faz `gross − 0` (o total fica com o ±par da fonte), o `fillBlankHoles` não reparte buracos em falta e o NextCaddy não deriva CR/Slope (sem SD). O que é IGUAL entre os conversores vive em `src/data/intlCommon.ts`: `intlCountryCell` (bandeira + país), `holesOf` (9/18 pelo tamanho do par), `dobLookupByName`, os tipos `DobLookup`/`HcpLookup` e `isNoCardGross` (gross ≥ 900 = «sem cartão», decisão de 22/10/2026: o `buildFPGTournament` tira essas voltas — o jogador fica WD — e um total ≥ 900 fica sem total, ±par nem posição; o `TotalsResumo`, o `DrawTab`, o LGS (`isLgsCard`, que antes só cortava a partir de 999), o BlueGolf e o Doral usam a mesma função). **Destaque PT = `isPtCountry`** (PT, PRT, POR, Portugal; decisão de 22/10/2026) em todas as fontes e draws: o `buildFPGTournament` aplica-o ao `country` do jogador (já não há `isPortuguese: null` nem `country === "PT"`); em Espanha o país dos resultados sem país (RFEGolf PDF, mitarjeta) vem das listas de inscritos (`rfegPaisLookup`, `rfeg/flags.ts`) e o LGS com gémeo RFEGolf vai buscar aos inscritos do gémeo o país de quem não tem bandeira (`lgsWithTwinCountries`, `divisionData.ts`). A FFG soma a lista de excepções por nome (`isPT`/`isPTByName`, `utils/ptPlayers.ts` — Ricardo Castro Ferreira, PT federado em França): vale mesmo com bandeira FR, por isso não é um recurso para país em falta e fica só na FFG (leaderboards, draws GG/LGPIDF e match play). **Escalão de Espanha = `escaloEsForPlayer`** (coorte de ano = ano do torneio − ano de nascimento; sem nascimento, a categoria) em todas as fontes de Espanha, golfdirecto incluído desde 22/10/2026 (o `escalaoFromCategory` do fcgAdapter, com idade exacta, saiu); o nome da categoria da prova lê-se com `escaloEsFromCategory` (`rfeg/escalao.ts`: «SCR Inf Mas», «SCR Cad Fem», «SCR Alv Mas», «ALEVÍ», «BENJAMÍ», «Sub-12», «SUB16»…; duas categorias como «GP CAD-INF» → nada). As letras soltas do `catEdad` (B, I, A, C, J, M, S, Mid, P+) NÃO se interpretam — não se sabe o que querem dizer. A normalização de nomes DIFERE entre fontes e fica em cada conversor até decisão da Mariana.
  - CircuitShell: abas próprias de uma divisão em `extraSections`. Com `renderFull` (TournamentDetail), as abas da página vão em `leadingTabs`/`extraTabs` e a aba inicial sem `?tab=` em `defaultTab` (os Clubes da FPG abrem em «Grupos», 21/10/2026).
  - Match play: `ui/circuit/MatchplayView` (formato `MatchplayFile`) — brackets ETC/FFG/Taça da Federação e o 3-way dos Clubes (`sides`, `playerRefs`, `pendingNote`, prop `roundPicker`; adaptador `data/clubesMatchplayAdapter.ts`). Classificação de equipas por pontos (categoria × dia): `ui/circuit/TeamPointsStandings` (21/10/2026).
- Datas/idades/bandeiras em `utils/`: `dateParts`, `ageAtDate`, `birthYearOf`, `todayIso`, `fmtDateRangePt`, `shortDateSlash` (`format.ts`); `flagOrEmpty`, `clubFlagPrefix`, `isPtCountry` (`flagUtils.ts`); `normLoose`/`normName` (`normName.ts`).
- `Toolbar.tsx` exporta `Toolbar`, `ToolbarTitle`, `ToolbarMeta`, `ToolbarSep`.
- `scoreDisplay.ts`: `scClass()`, `toParClass()`, `sc3m()`, `tpColorDark()`, `SC` (cores semânticas em `var(--…)`, definidas no próprio `scoreDisplay.ts` — não é o `C` de colors.ts).
- `mathUtils.ts`: `zTier()` (único sítio dos níveis por z-score; a Tabela global tinha limiares próprios até 21/10/2026), `getTrend()`, `getAvgZ()`, `linearSlope()`, `toggleArr()`.
- `format.ts`: `fmtToPar()` (usar em vez de `fmtTp2`/`fmtTP2` locais), `sortArrow()`, `MONTHS_PT` (abrev.), `MONTHS_PT_FULL` (lowercase), `MONTHS_PT_LONG` (Title Case), `MONTH_MAP`.
- `constants/manuel.ts`: `MANUEL_FED`, `MANUEL_BIRTH_YEAR`, `isManuel()`, `escalaoManuelParaData()`, `MANUEL_KNOWN_TIDS`.
- `constants/config.ts`: `TORNEIOS_CONFIG` (10 torneios FPG), `TIER_L`, `TR_I` (labels e ícones de tier).
- CSS `.tab-under` + `.active`: tabs com underline (substitui `tabStyle()` inline).

### Features novas em JogadoresPage (2026-04-15)

- **Modal scorecard** no `FederadoOnlyDetail` — clicar em qualquer ronda da
  tabela abre modal com grelha hole-by-hole estilo oficial: `sc-score` +
  `scClass(gross, par)` + halftotal F9/B9 + `fmtToPar()`. Fetch via
  `getScorecard(round.id, scoring_type_id, competition_type_id)` de `datagolfClient.ts`.
- **Preset 🧒 Jovens** (pill rotulada na `JogadoresToolbar`) — filtra todos os
  Sub-* (Sub-10 a Sub-21) de uma vez e mostra KPI grid por escalão (total +
  distribuição por sexo com `SexBadge`).
- **Sidebar sem tecto** — rendering progressivo (`SIDEBAR_CHUNK = 300`), ver
  "Sidebar de JogadoresPage — sem tecto fixo".
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
| `simulador` | Visível | Scraped; o `prune-player-scope.js` nunca o corta — família e amigos escolhidos para o selector do `/simulador` (lista em `src/constants/simuladorPlayers.ts`, 2026-09-15) |

**Regra de ouro:** `hidden` vs `no-scrape` distinguem-se por visibilidade.
- `hidden` = invisível na UI + removido do players.json via cleanup
- `no-scrape` = visível na UI, mas congelado (dados não actualizados)

`cleanup-players-json.js` aplica estas regras automaticamente.

### Princípios de arquitectura

- ⛔ **Contas de handicap — um só sítio: `src/utils/whsCalc.ts`** (decisão
  2026-09-15: "vários sítios a calcular dão informações diferentes"). SD, Course/
  Playing Handicap (com `is9`), pancadas por buraco, Net Double Bogey/AGS,
  Expected SD de 9 buracos, janela 20/8, extraordinários, caps e projecção do HI.
  Nenhuma página reescreve estas fórmulas — `113 / slope` fora do whsCalc é erro.
  - ⛔ **SD de uma volta JOGADA (decisão 2026-09-15):** (1) o **oficial da FPG**
    — o `sgd` do WHS de cada jogador, gravado em cada volta dos ficheiros de
    torneios (`roundScores[].sd`, ou `sd` no jogador flat) pelo
    `scripts/backfill-sd.js` (ver "SD oficial nas voltas dos torneios"); (2) sem
    ele, o **calculado** pelo `roundDifferential` com o **HCP da inscrição**
    (`hcpExact`), em 18 e em 9 buracos. Tudo passa pelo `computeSD` (fpgUtils).
    Porquê esta ordem: em 18 buracos o cálculo bate com o oficial em 99,4% (o HCP
    só entra no NDB); em 9 buracos só em 85–91% (o Expected SD depende do HI
    exacto do dia) — daí o oficial ir buscar-se só aos juniores. Nunca se
    **estima** sem CR/Slope (as voltas de treino deixaram de ter o SD "CR = par");
    espanhóis (RFEG/mitarjeta) e os scorecards históricos USKids do kids2
    (`HistoricScorecardsTab`) não mostram SD — não há HCP de inscrição. O
    `drive-sd-lookup` (nunca existiu em disco) e os símbolos "~"/"≈" do `SDPill`
    saíram.
  - **Métodos validados** contra o `sgd` oficial (3253 voltas, 2026-09-15):
    18 buracos `(113/Slope)×(AGS−CR−PCC)` → **99,4%**; 9 buracos **desde 2024**
    `(113/Slope)×(AGS−CR−½PCC) + (0,52×HI+1,2)` → 91% (85% com o HI do torneio);
    9 buracos **antes de 2024** (net par + 1 nos 9 não jogados, SD sobre 18) → 77%.
    ⚠ O Expected SD é a FÓRMULA com as décimas do HI — a tabela por HI inteiro só
    batia em 63%. ⚠ O NDB de 9 buracos usa o Course Handicap de 9 (metade do HI).
    ⚠ O PCC em 9 buracos conta metade. ⚠ AGS só com o cartão completo.
  - Antes da consolidação havia a fórmula em 7+ sítios, com diferenças: a
    DrivePage ignorava o PCC, os overlays não somavam o Expected SD, o simulador
    arredondava à sua maneira e a previsão dava no máximo 1 pancada por buraco.
  - **Os scripts Node usam o MESMO ficheiro, não uma cópia**: `require("./lib/whs.cjs")`
    (`scripts/lib/whs.cjs`) carrega o `src/utils/whsCalc.ts` — o Node ≥ 22.18 corre
    TypeScript directamente, e **todos os workflows passaram a Node 24**
    (2026-09-15; o Node 20 já não tinha suporte). ⚠ Por isso o whsCalc.ts só pode
    ter sintaxe que o Node sabe apagar (tipos e interfaces — nada de `enum` nem
    `namespace`) e não pode importar outros ficheiros do `src`.
    `scripts/whs-loader.test.js` corre um Node a sério e parte se isto deixar de
    funcionar. Usam-no: `lib/process-data.js` (HI derivado com `indexFromWindow`;
    Low HI = mínimo dos 365 dias antes da última volta), `enrich-players.js`
    ("SD Best 8/20" = média das voltas que contam — a ±0,1 da média oficial em 90
    de 184 jogadores, eram 84).
  - **Nomes de campo: o mesmo esquema** (2026-10-20). `src/utils/courseAliases.ts`
    é a única tabela de aliases e de resolução por par (Aroeira II, Santo da
    Serra, Ribagolfe, Vila Sol/Pinheiros Altos/Castro Marim); o
    `scripts/lib/course-aliases.cjs` e o `lib/course-aliases.js` (pipeline)
    carregam-no. Eram 3 cópias à mão e já divergiam (Tróia, Porto Santo, Santo
    Estevão e Oceânico Faldo só nos scripts). Mesmas restrições do whsCalc.ts;
    `scripts/course-aliases-loader.test.js` compara Node real × site.
  - **Ranking Sub-12 = o SD REAL de cada miúdo** (decisão 2026-09-15): o
    `roundScores[].sd` oficial das voltas ou, sem ele, o calculado com o HCP da
    inscrição.
    Antes era um differential "de campo" sem handicap (9 buracos × 2); a Mariana
    preferiu o SD que cada um obteve de facto. O `--cap-over-par` saiu. O
    `build-analise-percurso.js` faz uma média descritiva dos 8 melhores SD
    oficiais por idade — não é conta de handicap e fica lá.
- **Máxima globalização** — definições partilhadas (constantes, formatação, CSS) devem viver em módulos globais (`constants/`, `utils/`, `App.css`), nunca duplicadas por página. Se duas páginas usam o mesmo valor, extrair para um módulo partilhado.
- **Escalões são definidos por torneio** — cada organizador define os age groups conforme o número de inscritos (9-10, 10-11, etc.). Não existe uma lista global de escalões. Filtros de UI como `ESCALOES_DESTAQUE_USKIDS` são específicos da página onde são usados. O que existe (22/10/2026) é a tabela única de SINÓNIMOS — `src/data/model/escalao.ts` (`escalaoCanon`/`escaloesCanon`): «Sub 10» = «Sub-10» = «U10» = «S10» = «Benjamín» = «10 and Under»… (ver «Modelo comum», abaixo).
- **Cores de tees são da FPG** — `teeColors.ts` define cores específicas das marcações de tees (Vermelhas, Amarelas, etc.) conforme a federação. Não alterar nem "corrigir" esses hex — são intencionais.
- **Data layer sobre display layer** — filtragem, normalização e cálculos pertencem ao loader/data layer, não aos componentes de display.
- **Validação de scores** — `tp` (to-par) só se calcula quando todas as rondas têm scorecard hole-by-hole completo. Em torneios de 9 buracos, validar `grossStrokes >= holes`.
- **Consistência de deduplicação** — hero cards e tabelas de detalhe devem usar a mesma fonte de dados deduplicada (e.g. `confrontosH2H`).
- **Sem dead code** — nenhum código comentado, funções mortas ou variáveis não usadas nos outputs.
- **Reescrita completa vs patches** — quando a implementação diverge do design acordado, preferir reescrita limpa de raiz.
- **Cache de fetches** — `src/data/fetchCache.ts` exporta `cachedFetchJson()` (cache global entre páginas para URLs sem query string) e `invalidateCache()`. Guarda a Promise do objecto JÁ convertido — todos recebem o mesmo objecto, tratá-lo como só de leitura; uma falha (rede, HTTP ≥ 500, JSON inválido) sai da cache e a chamada seguinte tenta outra vez; um 404 fica como `null` (21/10/2026).
- **Campos sob pedido** — `src/data/courses.ts` (`loadCourses`: fusão FPG + away + melhorias + manuais, uma vez por sessão) e `src/context/CoursesContext.tsx` (`<CoursesGate withPlayers?>` + `useCourses()`). Só a /campos pede o `course-players.json`. O `AppContext` tem só `players`, `melhorias`, `playerCount` e `calUnlocked`; os totais de campos/tees da NavBar vêm do `master-courses.json` em segundo plano (21/10/2026).

### Modelo comum (`src/data/model/`)

Fase 0 do plano «reescrita por tipo de torneio» (22/10/2026, sessão `9bd8db8a`;
plano em `_CLAUDE_HISTORICO/auditoria/2026-10-22_plano-reescrita-por-tipo-de-torneio.md`).
Só código de dados (sem React), para os loaders servirem a todas as páginas (Drive,
rankings, inscrições, Kids 2, equipas) e aos scripts.

| Ficheiro | O quê |
|---|---|
| `types.ts` | `TournamentFormat` (`stroke`, `totals`, `matchplay-ind`, `matchplay-team`, `stroke-team`), `TournamentStatus` (`future`, `live`, `finished`), `CutInfo` (`afterRound`, `line`, `out`), `ParOrigin` (`oficial`, `total-only`, `none`), `PlayerIdentity`, `RoundDrawData`, `TotalsNotice`, `TotalsExtraCol`. Campos opcionais no `Tournament` e no `CircuitDivision` (`TournamentModel`) e `identity` no `Player`. |
| `tournament.ts` | `tournamentStatus/Format/Holes/Cut/ParOrigin/HasResults`, `tournamentModel`, `withTournamentModel`. Dizem o MESMO que as inferências antigas (testes com dados reais): estado = `_openRound` / resultados do `jovensCandidates`; cut = `_cutAfterRound` do `expandMultiRound` (memorizado por torneio — custava ~50 ms a cada reconstrução da /FPG); buracos = regra do `ScorecardLB`. |
| `division.ts` | `divisionModel`/`withDivisionModel` (results › totals › match play › só inscrições). Aplicado em todas as divisões: /FPG (todas as vistas), /drive, /uskids e Kids 2, /major, /ffg, /rfeg, GJGL, /egr, /wagr. O que o conversor já disse não é substituído. |
| `identity.ts` | `playerIdentity`/`enrichPlayerIdentity`, `sexOf`, `countryIsoOf` (nome/ISO-2/ISO-3/COI → ISO-2), `dobIso`. Preenchido no `buildFPGTournament` (todas as fontes de fora) e nos USKids. Ano ESTIMADO não entra; «Mixed» não dá sexo. |
| `escalao.ts` | Tabela única: Sub N (Sub/S/U/Under N, «N & Under», «N&U», «NU», «N/Under», «N and Under», com ou sem sexo), nomes ES/FR (os ambíguos — Benjamin, Junior, Juvenil, Cadet — só com a fonte `ffg`/`es`; acento espanhol «í» conta como `es`), idades/intervalos («Boys 10» → «10 anos», «13 & 14» → «13-14 anos»), adultos (Absoluto/«All Ages», Seniores, Mid-Amateur, Adultos), dois escalões («U18 & U16»). O desconhecido fica como veio. `escalaoFilterOptions` dá as opções que o filtro teria. |

- ⚠ **Ainda nada disto se vê no ecrã.** As páginas continuam a ler `_openRound`,
  `hasResults`, `_cut`, `_sex`, `country`, `escalao`… — os campos novos estão ao lado.
  Ligar o filtro «Escalão» do CircuitShell à tabela muda o ecrã: é decisão da
  Mariana (contagens antes/depois no relatório da fase 0).
- **Desenho escolhido pelos dados** (`ui/circuit/divisionPieces.tsx`):
  `roundDrawNode` (draw de uma volta → `DrawTab`; um `render` da página ganha) e
  `divisionResultsNode` (`totals` → `TotalsResumo`; um `customResults` ganha). Usados
  pelo CircuitShell, IntlTournView e TournamentDetail. Já são dados: draws
  GolfGenius e LGPIDF (/ffg) e USKids; totais EGR, WAGR, GJGL e LGPIDF. Ainda JSX:
  `renderFull` (FPG, Drive, MAJOR, USKids — o TournamentDetail com props da página),
  draws de Espanha (`DrawSaidaView`, com `playersDB` e estados vazios próprios),
  totais/destaques do NextCaddy, mapa do campo da LGPIDF e a Escócia.
- Divisão nova: entregar dados (`results`, `totals`, `roundDraws[].draw`,
  `admissions`, `matchplay`) e passar por `withDivisionModel`; JSX só quando não
  há peça partilhada.

### Dados

- **Layer de campos:** `extraCourses.ts` (manual) sobrepõe `away-courses.json` (pipeline). `_players` do pipeline é reaplicado por cima. CourseKeys devem coincidir com aliases do pipeline.
- **`players.json`:** carregado em paralelo, cross-referenciado por nome normalizado para enriquecer rivais com `fpgClub` e `dob`.
- Ficheiros "torneios completos" curados manualmente têm precedência sobre output do pipeline.
- Jogadores sem nome nos ficheiros de histórico são mantidos (potencial matching futuro).
- Filtros multi-select (circuitos, escalões) usam `Set`.
- **`rivalData.ts`**: dados estáticos de campos (par/SI/metros para Villa Padierna, Alferini, La Forêt, Venice, Marco Simone, Doral GP/SF), FIELD_2025 (WJGC stats), FIELD_CARDS (scorecards top players), TIER cores.

### Scripts — escrita de JSON, guardas e exit codes (auditoria 2026-10-20)

- **Escrita sempre atómica com fsync.** `scripts/lib/atomic-write.js` →
  `lib/atomic-write.js` (chunks + `fsync` + verificação de tamanho + rename +
  fsync da pasta). `writeJsonAtomic(path, data, { spaces })` para objectos,
  `writeAtomic(path, string)` para texto já serializado. O tmp+rename sem fsync
  (que havia no `pipeline.js`, no rich-players, no update-cgss…) **não chega** —
  foi assim que o `players.json` e o `drive-data-2026-06.json` ficaram truncados.
  Os ~45 scripts chamados pelos workflows passaram todos para aqui (codemod).
- **Guarda anti-encolhimento: `writeJsonGuarded`** (`scripts/lib/shrink-guard.js`)
  — grava atómico, excepto se o novo perder mais de `maxDrop` face ao disco
  (`count: (d) => …` para contar jogadores/torneios; sem `count` compara bytes).
  Ficheiro anterior ausente/ilegível → grava. `--force` (ou `force: true`) passa.
  Com `failOnRefuse: true` (builders) sai com 1 e escreve `::error::` no log do
  GitHub. Já a usam: os builders de França/Espanha/FFG/EGR/GJGL, `federados.json`,
  catálogos England/FFG, scopes NextCaddy/RFEGolf, `players.json` (pipeline, 10%),
  NextCaddy/RFEGolf/FFG/LGS por torneio.
- **Input corrupto = erro, nunca reparação silenciosa.** O agregador cortava NUL
  bytes e «fechava» JSONs truncados; hoje `readJsonSafe` lança `CorruptInputError`
  (exit 1). O mesmo para caches/scopes ilegíveis que antes eram tratados como
  vazios e depois regravados só com a corrida actual (rich-players flight-cache,
  `uskids-draws.json`, scope RFEGolf no `--merge`).
- **Exit codes:** `0` gravou · `2` nada de novo · `1` erro · `3` FPG em baixo.
  Um `process.exit(0)` no fim do script **apaga** o `process.exitCode = 1` que a
  guarda pôs — usar `process.exit(process.exitCode || …)` ou deixar acabar
  sozinho. Quem passa a devolver 2 tem de ter, no workflow,
  `node scripts/x.js || [ $? -eq 2 ]` (o bash dos Actions corre com `-e`).
  Excepções antigas e documentadas: as guardas do `fetch-uskids-field`,
  `build-course-players`, `build-recent-tournaments` e `discover-fcg-scope`
  recusam com 2 (o ficheiro anterior fica); o `verify-drive-rankings` usa 1 para
  «divergências».

### Normalização

- "Russian Federation"/"Russia" e "US"/"United States" devem ser deduplicados nos dropdowns.
- Emojis: verificar Unicode cuidadosamente (erros recorrentes).
- Nomes em ALL CAPS: usar `displayName()` (detecta >45% maiúsculas → Title Case).
- `normName()`: trim + lowercase + normalizar espaços + remover diacríticos (NFD).
- Mapeamento de país: `CC` dict no KIDSdataLoader converte códigos curtos ("PT") para nomes extensos ("Portugal"). Suporta ~80 países incluindo variantes (UK→United Kingdom, PHL→Philippines).

### Classificação de jogadores

- Pills de tipo (Elite, Top Contender, etc.) aplicam-se apenas a rivais dentro de ±2 escalões de Manuel.
- Filtro de idade (histórico): o `processMemberHistory` do loader antigo filtrava Boys 9-13; saiu — a identidade e os filtros vêm do agregador canónico.
- `MANUEL_BIRTH_YEAR = 2014` — usado para calcular o escalão do Manuel em cada torneio histórico.

---

## Armadilhas e bugs conhecidos

### Críticos

**Separação de pipelines USKids vs não-USKids** — Torneios não-USKids (Doral, WJGC, Greatgolf, QDL, EOWAGR) devem alimentar **apenas** os rivais via `buildAutoRivals()` (Tabela global no menu ⓘ Info da /uskids, ↗ do kids2). A tab Resultados carrega **exclusivamente** de `uskids-results.json` e `uskids_torneios_completos(1-41).json`. Este bug voltou várias vezes.

**Manuel tem 4 variantes de nome + 2 contas USKids** — "Manuel Medeiros", "Manuel Francisco Medeiros", "Manuel Goulartt Medeiros", e "Manuel Francisco Goulartt De Medeiros" (este último era da **conta USKids antiga**, antes da migração para mid `630106`). Usar sempre `autoRivals.filter(d => d.isM)` (não `find()`) e fazer merge de todas as entradas. `isManuelByName()` em `src/constants/manuel.ts` já apanha as 4 variantes. Para mid USKids legacy, ver `MANUEL_PLAYER_IDS` (array) — adicionar lá o mid antigo quando validado via `scripts/verify-manuel-legacy-mid.js`.

**Manuel — conta USKids antiga (legacy)** — jogou em 2023 (Real Club de Golf El Prat tcode 15573 Boys 9, gross 44, place 3) com **mid 605933** (validado 2026-05-13 via GetTournamentPlayers&f=198807 + GetMemberTournamentResults — única aparição na carreira). Conta abandonada depois desse torneio; conta nova `630106` criada para a temporada seguinte. O nome aparecia como "Manuel Francisco Goulartt De Medeiros". Histórico, confrontos H2H e progressão de escalões mergeam os dois IDs como um único jogador via `MANUEL_PLAYER_IDS = ["630106", "605933"]` em `src/constants/manuel.ts`.

**Referências estáticas a dados fora de componentes React ficam stale** — `const manuel = D_BASE.find(x => x.isM)` fora de um componente referencia dados pré-merge. Fazer lookup dentro do componente via state.

**FPGPage — o torneio aberto sai só do URL** — `/FPG/torneio/{ccode}-{tcode}` → `resolveFpgTkey` sobre as entradas do CircuitShell da vista aberta → `selectedId`/`selectedDivKey`; a sidebar navega (`onSelectEntry`/`onSelectDivision`). Os dados chegam em lotes (jovens e drives antes dos pull-torneios): enquanto falta algum, um deep-link por resolver deixa o shell «a carregar» com um id sentinela (`tkeyPending`) — sem isso o shell abria o torneio por omissão e reescrevia o URL. O `selected`/`cur = displayList[selected]` e os efeitos URL↔estado (com o `skipNextStateUrlRef` anti-loop) saíram no passo 8 (21/10/2026): **não os voltar a pôr** — duas fontes de verdade deram ping-pong entre torneios e deep-links perdidos (2026-04). Estrutura completa em [paginas.md](paginas.md#a-fpg-por-dentro-21102026-depois-dos-passos-18).

**DrivePage — o torneio aberto e os filtros saem só do URL** (decisão A, 22/10/2026) — `/drive/torneio/{ccode}-{tcode}` → `resolveDriveTkey` (`src/data/drive/driveUrl.ts`) → `selectedId`/`selectedDivKey`; a query (`parseDriveQuery`) dá os filtros e os controlos navegam (`driveQueryString`). Antes havia `selectedDriveId` + `?t=` + a lista antiga `buildGroups` com três efeitos URL↔estado: o link de um torneio com várias voltas virava `…_R1`, `region`/`esc`/`year` perdiam-se ao montar (efeitos de «reset») e o caminho e o `?t=` podiam apontar a torneios diferentes. O torneio por omissão escolhe-o a página (o shell recebe sempre um `selectedId`, sentinela enquanto espera — sem isso escolhia antes das inscrições, decisão B, e desempatava pelo nome). Estrutura em [paginas.md](paginas.md#a-drive-por-dentro-22102026-fase-1-da-reescrita-por-tipo-de-torneio).

**Ficheiros que podem não existir: nunca sondar** — a /FPG e a /drive pediam `pull-torneios007…` até dois 404 seguidos e todos os meses de `drive-data`/`aquapor-data`. Hoje leem o `fpg-files-index.json` (gerado no build, `scripts/build-fpg-files-index.js`) e pedem só o que lá está. Uma série nova de ficheiros numerados → acrescentá-la ao gerador, não a um ciclo de tentativas.

**Clubes em match play — «líder» e nº de jogadores** — o ficheiro do Regional de Clubes 2026 traz `playerCount: 0` e cartões de só alguns jogadores (3 de 34 no Dia 1). `clubesIndividualTournament` conta quem jogou (draws dos dois dias + confrontos, por federado; 37) e marca em `_noStrokeRankRounds` as voltas em match play ou com cartões de só parte do campo — o `ManuelResultPills` não diz «líder» nelas.

### Dados

- **`TabelaGlobal.TG_D`** — array manual de rivais curado independentemente (o gémeo `KIDSPage.D` desapareceu com o sunset da KIDSPage em 2026-08-06). Não "corrigir" contra outras fontes sem curadoria manual.
- **Epochs `/Date(ms)/` da FPG = meia-noite em hora de LISBOA** (corrigido no pipeline 2026-07-02) — no horário de verão (UTC+1) o epoch é 23:00 UTC do dia anterior. Formatar com getters locais numa máquina UTC (GitHub Actions) ou com `toISOString()` em qualquer máquina dá **−1 dia** para datas de fim-Março a fim-Outubro. Fix em `lib/helpers.js`: `getPlayedAt` prefere as strings (`hcp_dateStr`/`score_dateStr`) e os fallbacks de epoch passam por `lisbonCivilDay()` (Intl em `Europe/Lisbon` → meia-noite UTC); `fmtDate` usa getters UTC. ✅ Scripts em `scripts/` corrigidos 2026-07-07 — usam agora `lisbonCivilDayStr()` (variante string do `lisbonCivilDay`, exportada de `lib/helpers.js`) sobre os epochs `started_at`: `scrape-classif-node`, `scrape-drive-node`, `scrape-jovens-node`, `scrape-crj-madeira-historico`. Os `pairings-build` (`normIsoDate`), `scrape-federados-node` (`parseNetDate` p/ birthdates) e `scrape-fpg-admissions-draws-node` (`dotNetToIsoDate`) já tinham sido corrigidos antes. `enrich-players.js` (~l.190, `dateSort`) é seguro (o `dateSort` já vem de `getPlayedAt`→`lisbonCivilDay` = meia-noite UTC do dia civil). Os `new Date().toISOString().slice(0,10)` restantes são marcadores "hoje"/"lastUpdated" (não epochs FPG) — inofensivos.
- **scrape-drive-aquapor-v6 bug R1=R2** — v6 usava API que ignora `classifround`. v7 usa `classifAgregate.aspx/ScoreCard` — corrigido.
- **ScorecardLeaderboard par vazio** — resolvido a 22/10/2026: com `par[]` vazio o nº de buracos vem da prop `holes` ou dos cartões (9/18), a linha PAR fica com as células vazias e os nines não mostram ±par. O `ScorecardLB` passa `holes`.
- **(histórico, loader antigo)** KIDSdataLoader filtro 18H bloqueava 9H (El Prat 2023) e irmãos com o mesmo apelido davam falsos positivos no matching — hoje tudo isso vive no agregador canónico e no identity-matcher de `scripts/aggregator/`.
- **lengths[] nos completos são jardas** — converter ×0.9144 para metros.
- **strokes[] tem sempre 18 posições** — em torneios 9H, posições não jogadas = 0. Filtrar zeros.
- **applyResultOverrides (Marco Simone 2026 Boys 11)** — Manuel foi marcado IE (Ineligible) pela USKids porque não confirmou o scorecard da R1 (avisou depois → penalidade aplicada). O site mostra o score **oficial com penalidade** (R1=91 com hole 5=10, R2=79), não o score jogado (R1=86 com hole 5=5, R2=79). Detalhe completo no comentário do override em `src/pages/USKIDSPage.tsx::applyResultOverrides`.
- **applyResultOverrides()** — em USKIDSPage.tsx, injeta resultados do Manuel quando marcado como WD/IE nos dados.
- **Dados de 9 buracos** — torneios USKids local tour de 9 buracos geravam scores negativos impossíveis. Resolvido validando completude do scorecard (`grossStrokes >= holes`).
- **Duplicados normCountry** (histórico, resolvido) — duplicados em `normCountry` (hoje em `utils/flagUtils.ts`) + `TW:"Taiwan"` duplicado no KIDSdataLoader causavam warnings Vite.

### Ambiente

- **iOS copy-paste** — copiar código no mobile substitui aspas rectas por aspas tipográficas curvas → rebenta esbuild. Descarregar ficheiros do desktop.
- **Cross-page linking** — `↗ Kids` links em USKIDSPage abrem `/kids#EncodedPlayerName` em novo tab; `/kids` redirige para `/kids2` preservando o hash, e o KIDS2Page resolve-o (`resolveToId`: id canónico → memberId → fed → normName/aliases).

---

## Ficheiros-chave

| Ficheiro | Papel |
|----------|-------|
| `kids/FieldRivaisDashboard.tsx` | Dados e abas de análise dos Próximos torneios do Kids 2 (`useFieldRivaisData` + `FieldRivaisSection`: Por torneio/Scores/Scorecards anteriores/O Campo/Previsão). Desde 20/10/2026 a página `/kids2/next-t` é um CircuitShell (`kids2/nextCircuit.tsx`); a KIDSPage legacy foi removida 2026-08-06 |
| `KIDSdataLoader.ts` | Loader que consome os 3 ficheiros canónicos do agregador (juniors / juniors-tournaments / tournament-catalog), ~580 linhas; `buildAutoRivals` para o kids2 |
| `USKIDSPage.tsx` | Resultados USKids com links cruzados para Kids |
| `FPGPage.tsx` | Dados da federação portuguesa |
| `rivalData.ts` | Dados estáticos: pars/SI/metros de campos, FIELD_2025, FIELD_CARDS, TIER |
| `tokens.css` | Design tokens (fonte única de verdade para cores) |
| `colors.ts` | Espelho JS dos tokens |
| `App.css` | Todas as classes de componentes |
| `src/design-system.html` | Referência visual de todos os componentes |
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

`normName` (7 testes — diacríticos, whitespace, case, strings vazias) e `co` (10 —
código ISO → nome, variantes UK=GB, null). Os 7 grupos do loader antigo em
`describe.skip` e os stubs `process*`/`mergeInto` saíram a 21/10/2026 — já não há
testes «skipped».

### Guardas automáticas (21/10/2026)

- `scripts/css-vars.test.js` — falha se o `src` usar um `var(--x)` sem definição
  (em `tokens.css`/`App.css` ou num style inline). Token novo vai para o
  `tokens.css`; nada de fallbacks com hex (`var(--x, #fff)`).
- `scripts/data-paths.test.js` — falha se o site pedir um `/data/…` fixo que não
  exista em `public/` (dá 404 em produção). Ficheiro que pode faltar: não o
  pedir, ou gerá-lo vazio (como o `ffgolf-lgpidf-index.json`). Os gerados no
  build (`fpg-files-index.json`) vão em `GERADOS_NO_BUILD`, com o gerador no
  `prebuild`.
- `src/data/__tests__/fpgFilesIndex.test.ts` — a /FPG só pede os pull-torneios
  do índice (zero 404); `src/pages/fpg/__tests__/fpgDeepLinks.test.ts` — os
  deep-links 007-11011 (Sub 14) e 059-10685 (Clubes) com os dados reais.
- `scripts/compact-deploy-json.test.js` — a compactação dos JSON no deploy
  (ver [deploy.md](deploy.md)).
