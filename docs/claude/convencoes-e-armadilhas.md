# Convenções de código, armadilhas conhecidas, ficheiros-chave e testes

> Detalhe tirado do CLAUDE.md a 2026-09-15 (o CLAUDE.md fica só com o essencial e
> aponta para aqui). Datas entre parênteses = quando a regra ou a medição foi feita.

## Convenções de código

### CSS e cores

- **Todas as cores passam por `tokens.css`** — nunca hardcodar hex nos componentes.
- `colors.ts` espelha os tokens para uso em JS/TS (recharts, arrays de dados). Alterar primeiro em `tokens.css`, depois actualizar `colors.ts`.
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
- Hooks partilhados: `useIsMobile.ts`, `useMasterDetail.ts`, `SidebarToggle.tsx` para sidebar unificada.
- `Toolbar.tsx` exporta `Toolbar`, `ToolbarTitle`, `ToolbarMeta`, `ToolbarSep`.
- `scoreDisplay.ts`: `scClass()`, `toParClass()`, `sc3m()`, `tpColorDark()`, `SC` (alias de C de colors.ts).
- `mathUtils.ts`: `zTier()`, `getTrend()`, `getAvgZ()`, `linearSlope()`, `toggleArr()`.
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
  - **Ranking Sub-12 = o SD REAL de cada miúdo** (decisão 2026-09-15): o
    `roundScores[].sd` oficial das voltas ou, sem ele, o calculado com o HCP da
    inscrição.
    Antes era um differential "de campo" sem handicap (9 buracos × 2); a Mariana
    preferiu o SD que cada um obteve de facto. O `--cap-over-par` saiu. O
    `build-analise-percurso.js` faz uma média descritiva dos 8 melhores SD
    oficiais por idade — não é conta de handicap e fica lá.
- **Máxima globalização** — definições partilhadas (constantes, formatação, CSS) devem viver em módulos globais (`constants/`, `utils/`, `App.css`), nunca duplicadas por página. Se duas páginas usam o mesmo valor, extrair para um módulo partilhado.
- **Escalões são definidos por torneio** — cada organizador define os age groups conforme o número de inscritos (9-10, 10-11, etc.). Não existe uma lista global de escalões. Filtros de UI como `ESCALOES_DESTAQUE_USKIDS` são específicos da página onde são usados.
- **Cores de tees são da FPG** — `teeColors.ts` define cores específicas das marcações de tees (Vermelhas, Amarelas, etc.) conforme a federação. Não alterar nem "corrigir" esses hex — são intencionais.
- **Data layer sobre display layer** — filtragem, normalização e cálculos pertencem ao loader/data layer, não aos componentes de display.
- **Validação de scores** — `tp` (to-par) só se calcula quando todas as rondas têm scorecard hole-by-hole completo. Em torneios de 9 buracos, validar `grossStrokes >= holes`.
- **Consistência de deduplicação** — hero cards e tabelas de detalhe devem usar a mesma fonte de dados deduplicada (e.g. `confrontosH2H`).
- **Sem dead code** — nenhum código comentado, funções mortas ou variáveis não usadas nos outputs.
- **Reescrita completa vs patches** — quando a implementação diverge do design acordado, preferir reescrita limpa de raiz.
- **Cache de fetches** — `src/data/fetchCache.ts` exporta `cachedFetchJson()` (cache global entre páginas para URLs sem query string) e `invalidateCache()`.

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
- Filtro de idade (histórico): o `processMemberHistory` do loader antigo filtrava Boys 9-13; hoje é stub — a identidade e os filtros vêm do agregador canónico.
- `MANUEL_BIRTH_YEAR = 2014` — usado para calcular o escalão do Manuel em cada torneio histórico.

---

## Armadilhas e bugs conhecidos

### Críticos

**Separação de pipelines USKids vs não-USKids** — Torneios não-USKids (Doral, WJGC, Greatgolf, QDL, EOWAGR) devem alimentar **apenas** a tab Rivais via `buildAutoRivals()`. A tab Resultados carrega **exclusivamente** de `uskids-results.json` e `uskids_torneios_completos(1-41).json`. Este bug voltou várias vezes.

**Manuel tem 4 variantes de nome + 2 contas USKids** — "Manuel Medeiros", "Manuel Francisco Medeiros", "Manuel Goulartt Medeiros", e "Manuel Francisco Goulartt De Medeiros" (este último era da **conta USKids antiga**, antes da migração para mid `630106`). Usar sempre `autoRivals.filter(d => d.isM)` (não `find()`) e fazer merge de todas as entradas. `isManuelByName()` em `src/constants/manuel.ts` já apanha as 4 variantes. Para mid USKids legacy, ver `MANUEL_PLAYER_IDS` (array) — adicionar lá o mid antigo quando validado via `scripts/verify-manuel-legacy-mid.js`.

**Manuel — conta USKids antiga (legacy)** — jogou em 2023 (Real Club de Golf El Prat tcode 15573 Boys 9, gross 44, place 3) com **mid 605933** (validado 2026-05-13 via GetTournamentPlayers&f=198807 + GetMemberTournamentResults — única aparição na carreira). Conta abandonada depois desse torneio; conta nova `630106` criada para a temporada seguinte. O nome aparecia como "Manuel Francisco Goulartt De Medeiros". Histórico, confrontos H2H e progressão de escalões mergeam os dois IDs como um único jogador via `MANUEL_PLAYER_IDS = ["630106", "605933"]` em `src/constants/manuel.ts`.

**Referências estáticas a dados fora de componentes React ficam stale** — `const manuel = D_BASE.find(x => x.isM)` fora de um componente referencia dados pré-merge. Fazer lookup dentro do componente via state.

**FPGPage — torneio resolvido pela URL, não por displayList[selected]** — o detalhe usa `cur = displayList[selected]`, mas o `selected` é sincronizado a partir do URL (`urlTkey` → `displayList.findIndex(matchesT)`, num `useEffect`). Razão: durante load async, `tournaments`/`jovensTournaments`/`clubesTournaments` chegam em batches e cada um re-calcula o `displayList` useMemo (sort por data desc). Sem tie-breaker estável entre items com a mesma data, `displayList[selected]` aponta a torneios diferentes entre re-renders → user vê "A carregar..." preso ou outro torneio. Adicionalmente, o `handleClick` da sidebar precisa de chamar `navigate()` directamente; sem isso, o guard anti-loop do `state→URL` skipa quando `params.tkey != novo cur.tcode/ccode`, deixando o user preso na URL antiga. **Source of truth = URL**. Não tentar fixar via useState/useEffect/selectedKey complexos — leva a regressões em cascata. Resolvido 2026-04-27.

### Dados

- **`TabelaGlobal.TG_D`** — array manual de rivais curado independentemente (o gémeo `KIDSPage.D` desapareceu com o sunset da KIDSPage em 2026-08-06). Não "corrigir" contra outras fontes sem curadoria manual.
- **Epochs `/Date(ms)/` da FPG = meia-noite em hora de LISBOA** (corrigido no pipeline 2026-07-02) — no horário de verão (UTC+1) o epoch é 23:00 UTC do dia anterior. Formatar com getters locais numa máquina UTC (GitHub Actions) ou com `toISOString()` em qualquer máquina dá **−1 dia** para datas de fim-Março a fim-Outubro. Fix em `lib/helpers.js`: `getPlayedAt` prefere as strings (`hcp_dateStr`/`score_dateStr`) e os fallbacks de epoch passam por `lisbonCivilDay()` (Intl em `Europe/Lisbon` → meia-noite UTC); `fmtDate` usa getters UTC. ✅ Scripts em `scripts/` corrigidos 2026-07-07 — usam agora `lisbonCivilDayStr()` (variante string do `lisbonCivilDay`, exportada de `lib/helpers.js`) sobre os epochs `started_at`: `scrape-classif-node`, `scrape-drive-node`, `scrape-jovens-node`, `scrape-crj-madeira-historico`. Os `pairings-build` (`normIsoDate`), `scrape-federados-node` (`parseNetDate` p/ birthdates) e `scrape-fpg-admissions-draws-node` (`dotNetToIsoDate`) já tinham sido corrigidos antes. `enrich-players.js` (~l.190, `dateSort`) é seguro (o `dateSort` já vem de `getPlayedAt`→`lisbonCivilDay` = meia-noite UTC do dia civil). Os `new Date().toISOString().slice(0,10)` restantes são marcadores "hoje"/"lastUpdated" (não epochs FPG) — inofensivos.
- **scrape-drive-aquapor-v6 bug R1=R2** — v6 usava API que ignora `classifround`. v7 usa `classifAgregate.aspx/ScoreCard` — corrigido.
- **ScorecardLeaderboard par vazio** — se `par[]` chegar vazio, `nh=0`, slice→[], soma=0. ⚠ Hoje o `ScorecardLeaderboard` usa `const nh = par.length` (o fix `nhRef` com fallback 9/18 já não está no código) — um `par[]` vazio volta a dar `nh=0`.
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
| `kids/FieldRivaisDashboard.tsx` | Dashboard de field/rivais USKids (tabs Jogadores/Scores/Scorecards/Campo/Previsão/Scout) — renderizado em `/kids2/next-t`; a KIDSPage legacy foi removida 2026-08-06 |
| `KIDSdataLoader.ts` | Loader que consome os 3 ficheiros canónicos do agregador (juniors / juniors-tournaments / tournament-catalog), ~580 linhas; `buildAutoRivals` para o kids2 |
| `USKIDSPage.tsx` | Resultados USKids com links cruzados para Kids |
| `FPGPage.tsx` | Dados da federação portuguesa |
| `rivalData.ts` | Dados estáticos: pars/SI/metros de campos, FIELD_2025, FIELD_CARDS, TIER |
| `dataRegistry.ts` | Registo central de paths e interfaces de todos os JSON |
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

Activos (2026-09-15): `normName` (7 testes — diacríticos, whitespace, case, strings
vazias) e `co` (10 — código ISO → nome, variantes UK=GB, null). Os grupos do
loader antigo (`shortenTournName`, `mergeInto`, `processUskidsCompleto`,
`processMemberHistory`, `processFpgJuniorTourns`, `processWjgc`,
`processManuelOverrides`) estão em `describe.skip` desde a migração para o
kids2 — as funções são stubs.
