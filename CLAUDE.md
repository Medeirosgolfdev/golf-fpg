# CLAUDE.md — Golf Portugal

Aplicação web de golfe júnior português. Acompanha o percurso competitivo do
Manuel (CGSS Santo da Serra, Madeira) e dos seus rivais: FPG (Drive, Aquapor,
Nacionais, PJA), USKids e os circuitos internacionais (MAJOR, England, França,
Espanha, WAGR, EGR, Faldo…).

- Produção: `golf-fpg.vercel.app` · pasta local `C:\golf-fpg\`
- Do mesmo repo sai um 2º projecto Vercel: `ranking-pja.vercel.app` (pasta `ranking-pja/`) — ver [pja.md](docs/claude/pja.md).

Este ficheiro tem só o essencial. O detalhe de cada tema está em `docs/claude/`
(tabela "Onde está o detalhe"). **Quando uma regra nova for importante para
qualquer trabalho, entra aqui; o resto vai para o ficheiro do tema.**

## Arquivo de conversas — ler antes de começar

Todas as conversas anteriores com o Claude estão arquivadas na pasta
`_CLAUDE_HISTORICO` da OneDrive da BetaSol: `HISTORICO.md` (resumo de tudo, por
assunto — **ler primeiro**), `assuntos/*.md` (detalhe de cada assunto) e
`sessoes/` (cada conversa completa). **Antes de um assunto novo, ver se já lá
está** — não repetir trabalho nem contrariar decisões já tomadas.

- **Neste PC:** `C:\Users\Mariana\OneDrive - BetaSol SGPS\_CLAUDE_HISTORICO\`
  (noutro PC, a mesma pasta dentro da OneDrive da BetaSol).
- **Numa sessão na nuvem, sem o disco:** pelo conector Microsoft 365 —
  `sharepoint_search` com `folderName: "_CLAUDE_HISTORICO"` para encontrar os
  ficheiros e `read_resource` para os ler (testado a 2026-09-15).
- As transcrições actualizam-se sozinhas (hooks de início e fim de sessão); os
  resumos em `assuntos/` e no `HISTORICO.md` são escritos à mão, a partir das
  sessões listadas em `_motor/por-resumir.md`.

## Regra fundamental

**Nunca declarar uma tarefa como concluída sem correr os testes.** Antes de afirmar que algo está pronto:
1. `npm test` — confirmar que todos os testes passam (0 falhas)
2. `npm run build` — confirmar que compila sem erros (TypeScript strict + Vite)

Erros de tipo, imports em falta, variáveis não usadas, ou testes falhados invalidam a entrega.

**Entregar sempre o ficheiro definitivo.** Testar internamente antes de entregar — o utilizador nunca deve receber ficheiros intermédios ou ter de fazer passos extra.

## Stack

React 19 + TypeScript 5.9 + Vite 6 · react-router-dom 6 · recharts 3 ·
html-to-image (overlays) · vitest · Playwright (só alguns scrapers) · Vercel
(deploy a cada push no `main`, menos os commits que não mexem no site) · ~35 workflows GitHub Actions a actualizar os
dados · Node 24 nos workflows.

## Estrutura

```
src/
  pages/          # páginas lazy-loaded (ver "Páginas")
  data/           # loaders e tipos (KIDSdataLoader, playerDataLoader, courses, fetchCache, …)
  ui/             # componentes partilhados (NavBar, PillBadge, CircuitShell, ScorecardLeaderboard, …)
  utils/          # whsCalc, format, scoreDisplay, mathUtils, colors, teeColors, teeGroups, flagUtils, …
  constants/      # manuel.ts, config.ts, drivePoints.ts, …
  context/        # AppContext.tsx
  hooks/          # useSort, useIsMobile, useMasterDetail, useLiveAdmissions, …
  tokens.css      # FICHEIRO ÚNICO de design tokens
  App.css         # classes de componentes
  design-system.html # referência visual das classes

scripts/          # ~270 scripts Node (scrapers, builders, testes)
scripts/lib/      # lib partilhada dos scrapers — usar sempre em scripts novos
scripts/aggregator/ # agregador de juniores (kids2): sources/ + identity-matcher
scripts/_archive/ # legados e diagnóstico — não se correm
lib/              # (RAIZ, ≠ scripts/lib) processamento usado por pipeline.js (process-data, hole-stats, …)
api/              # funções Vercel: datagolf.js (proxy WHS/scorecards) + inscricoes.js
public/data/      # JSON servidos ao runtime (~1 GB)
data-archive/     # ficheiros pesados FORA do deploy
output/{fed}/     # scrape FPG por federado (versionado) — e também o outDir do Vite
docs/claude/      # detalhe de cada tema (ver abaixo)
```

- **`output/` é partilhado:** é o `outDir` do Vite e a pasta do scraper FPG. Só
  as pastas por federado estão no git; a fonte de verdade do resto é `public/`.
  Não mudar o `outDir` sem mexer na configuração do projecto Vercel.
- **Deploy:** cada deployment deve ficar em ~1 GB. Não voltar a pôr o
  `CROSS_DATA` dentro dos `data.json` (vive em `/data/cross-data.json`). O
  `prune-deploy-output.js` tira do deploy tudo o que a app não pede de
  `output/{fed}/`; se a app passar a ler outro ficheiro por federado, acrescentá-lo
  à excepção. → [deploy.md](docs/claude/deploy.md)

## Comandos

```bash
npm run dev       # servidor local Vite
npm run build     # build de produção
npm test          # testes (vitest; apanha também scripts/**/*.test.js)
npm run preview   # preview do build
npm run scrape    # scrape FPG de todos os seguidos (fpg-scrape-node.js --all → pipeline.js), o mesmo do update-data.yml
npm run login     # login FPG (gera sessão)
```

## Onde está o detalhe

| Tema | Ficheiro |
|---|---|
| Deploy, `output/`, Deployment Storage, universo de jogadores seguidos | [deploy.md](docs/claude/deploy.md) |
| Tabela completa de rotas e páginas legadas | [paginas.md](docs/claude/paginas.md) |
| `/jogadores` — arquitectura, filtros no URL, ficha só-cadastro | [jogadores.md](docs/claude/jogadores.md) |
| kids2 — KIDSdataLoader, agregador, duplicados, checklist de fontes | [kids2-agregador.md](docs/claude/kids2-agregador.md) |
| FPG — lib partilhada, sessão pública, cookies, quem corre sem cookies | [fpg-sessao-e-cookies.md](docs/claude/fpg-sessao-e-cookies.md) |
| FPG — scripts de resultados, Drive (rankings), inscrições/draws, torneios futuros, federados, torneios recentes | [fpg-pipeline.md](docs/claude/fpg-pipeline.md) |
| FPG — sites, links públicos, endpoints, proxy `api/datagolf.js`, história da descoberta | [fpg-apis.md](docs/claude/fpg-apis.md) + [api-fpg-endpoints.md](docs/api-fpg-endpoints.md) |
| Voltas internacionais (`melhorias.json`), PCC e SD oficial | [whs-pcc-sd.md](docs/claude/whs-pcc-sd.md) |
| USKids — scripts, procura de torneios, rate limit, API, tcodes | [uskids.md](docs/claude/uskids.md) |
| MAJOR — catálogo, GolfGenius, GolfBox, Champion of Champions, México | [major.md](docs/claude/major.md) |
| WAGR | [wagr.md](docs/claude/wagr.md) |
| França (FFG) e Espanha (RFEG) | [ffg-rfeg.md](docs/claude/ffg-rfeg.md) |
| Itália (Federgolf, /fig) — API, scraper, categorias | [italia.md](docs/claude/italia.md) |
| England Golf | [england.md](docs/claude/england.md) |
| Formatos JSON e tabela de todos os ficheiros de dados | [estruturas-json.md](docs/claude/estruturas-json.md) |
| `/campos`, `/simulador`, Vantagem de Tee | [campos-simulador.md](docs/claude/campos-simulador.md) |
| Workflows (horários, scripts, secrets) e resumo diário por email | [workflows.md](docs/claude/workflows.md) |
| Ranking PJA | [pja.md](docs/claude/pja.md) |
| Convenções de código, armadilhas, ficheiros-chave, testes | [convencoes-e-armadilhas.md](docs/claude/convencoes-e-armadilhas.md) |
| Campeões Nacionais de Jovens | [nacionais-jovens.md](docs/claude/nacionais-jovens.md) |
| Internacionais júnior 2027 — datas, links, distâncias, histórico (pesquisa 19/10/2026; `node docs/torneios-intl-2027/build.cjs` regera a página) | [docs/torneios-intl-2027/](docs/torneios-intl-2027/) |

**Mapa de links:** `docs/links-conhecidos.html` (também publicado como
artifact) tem todos os endereços conhecidos — FPG, USKids, GolfGenius, GolfBox,
Espanha, França, rankings — com o tipo de acesso, exemplos reais, o script que
usa cada um e uma secção por clube (código, `ack`, federados). **Quando se
descobrir um link novo, acrescentá-lo lá.**

## Páginas

Rotas principais (tabela completa em [paginas.md](docs/claude/paginas.md)):
`/jogadores` e `/jogadores/:fed` · `/FPG` · `/drive` · `/uskids` · `/kids2`
(tracker de rivais; `/kids` redirecciona) · `/major` (BJGT, Doral, GolfGenius,
GolfBox) · `/ffg` · `/rfeg` · `/fig` · `/global-junior` · `/egr` · `/wagr` ·
`/campos` · `/comparar` · `/calendario` ·
`/titulos` · `/torneios-recentes` · `/bjgt-analysis`.

- `BJGTPage.tsx` e `DORALPage.tsx` são módulos usados pela `/major` (as rotas
  antigas redireccionam); os dados da `/major` vivem em `src/data/major/`.
- A página da Escócia (Junior Tour Scotland) está no arquivo
  (`scripts/_archive/ScotlandPage_v1_ate-2026-10-23.tsx`, ver o `LEIA-ME.md` lá):
  os dados não são fiáveis — só volta com uma fonte boa.
- **Calendário**: os eventos vivem em `src/data/calendarEvents.ts` (fora da
  página, porque o `scripts/build-ics.js` também os lê). O `prebuild` gera
  `public/calendario-{golfe,andebol,viagens,familia,aniversarios}.ics`
  (gitignored) — são estes endereços que estão subscritos no Google Calendar da
  Mariana, que os relê sozinho. Mexer nos eventos chega aos dois sítios; mudar
  um `calId` obriga a rever as regras em `FICHEIROS` no script.

## IDs importantes

| O quê | Valor |
|-------|-------|
| Manuel — FPG nfed | `52884` |
| Manuel — USKids playerID | `630106` (actual) e `605933` (conta antiga, El Prat 2023) — ambos em `MANUEL_PLAYER_IDS` (`src/constants/manuel.ts`) |
| Manuel — USKids accountUID | `762810` |
| Manuel — data de nascimento | `29/04/2014` (`MANUEL_BIRTH_YEAR = 2014`) |
| Pai (Manuel Medeiros) — FPG nfed | `54907` |
| `TORNEIOS_COMPLETOS_COUNT` | `41` (constante em `src/data/uskidsResultsLoader.ts` — actualizar ao acrescentar completos) |
| Signupanytime `ax` | `1129` (internacional) · `2739` (Marco Simone 2025) · `2760` (El Prat) |

## Regras que não se quebram

### Código e interface
- **Todas as tabelas ordenáveis por clique no cabeçalho** — `useSort`
  (`src/hooks/useSort.ts`) + `SortableHdr` (`src/ui/SortableHdr.tsx`). No
  `ScorecardLeaderboard`, as colunas extra (`prefixHeaderCells`/
  `postScorecardHeaderCells`) ordenam-se à mão (ver `AdmissionsTab.tsx`, `DrawTab.tsx`).
  **Vazios («—», sem cartão) SEMPRE no fim, nas duas direcções** (03/11/2026):
  comparar com `compareNullsLast`/`compareTextNullsLast`/`compareValuesNullsLast`
  (`src/hooks/useSort.ts`), nunca trocar o vazio por 999/0/-1/Infinity e multiplicar
  pela direcção (os «—» saltavam para o topo ao inverter).
- **Sexo: sempre `<SexBadge sex="M|F" />`**, nunca os símbolos ♂/♀.
- **Trava do aspecto global** (30/10/2026, pedido dela: «todas as páginas
  parecidas e alimentadas por módulos globais»): `scripts/estilo-global.test.js`
  falha se um `.tsx` ganhar um `style={…}` (qualquer — `{{…}}` ou variável), cores
  hex, letra/cantos em número ou uma `<table>` sem classe global (baseline por
  ficheiro; ficheiro novo = zero). **Desde 03/11/2026 o site tem ZERO estilos à
  mão** (pedido dela: «queria 0 estilos à mão»): valores fixos → classes/utilitários
  `.u-*` no fim do `App.css` (com os tokens); escolhas entre valores fixos →
  className condicional; valores que vêm dos DADOS (cor do tee, cor de uma série,
  largura de barra, nº de colunas, posição de um popup) → as peças de
  `src/ui/DataStyle.tsx` — `Tint` (bg/fg/bd), `Fill` (barra), `Cols` (grelha),
  `Place` (left/top/largura/altura máx.) — o ÚNICO sítio com `style`. Só ficam de
  fora as imagens de partilha (`ui/overlay/`, `OverlayExport.tsx`). Depois de arrumar,
  `node scripts/estilo-global-baseline.js` aperta a trava (`--force` só para
  casos legítimos, ex. eixos dos gráficos).
- **Cores só via `src/tokens.css`**; `colors.ts` espelha-os para JS. Excepções de
  propósito: `OverlayExport.tsx` (o html-to-image não lê variáveis CSS),
  `--pill-intl-bg: #00FF00` e as cores de tees da FPG em `teeColors.ts`. Um
  `var(--x)` sem definição faz falhar o `scripts/css-vars.test.js`.
- **Arranque leve:** o App só espera pelo `players.json` e pelo `melhorias.json`.
  Os campos (~13 MB) carregam-se nas páginas que os usam — `<CoursesGate>` +
  `useCourses()` (`src/context/CoursesContext.tsx`); não os voltar a pôr no
  `AppContext`. As setas ↗ dos circuitos (e da /FPG) leem o `juniors-links.json`
  (~2 MB: id, nome, aliases, memberId, fed, país, sexo), nunca o `juniors.json`
  (~52 MB). Resumos dos juniores = **um só** `juniors-scout.json` (Scout, Ranking
  e ficha do kids2, Próximos torneios: nível, nascimento, forma, provas com o
  Manuel, resultados WJGC/Doral/EOWAGR) — acrescentar lá, não criar outro.
  Nascimento/sexo/país/HCP por federado → `federados-lite.json` (~0,9 MB, gerado
  no build), nunca o `federados.json` (~19 MB) só para isso; inscrições da /drive
  → `fpg-admissions-draws-drive.json` (só Drive/AQUAPOR).
- **«Hoje» = `todayIso()`** (`utils/format.ts`, dia em Lisboa), nunca
  `new Date().toISOString().slice(0, 10)` (dia em UTC). **Níveis por z-score =
  `zTier`** (`utils/mathUtils.ts`).
- **Scorecard:** eagle âmbar, birdie vermelho, par branco, bogey azul de cantos rectos.
- **Tee físico:** um tee é cor + distância; M e F são só ratings diferentes do
  mesmo tee — contar e listar com `physicalTeeGroups`/`physicalTeeKey`.
- **Detalhe de torneio: um só componente, `TournamentDetail`**
  (`src/pages/fpg/TournamentDetail.tsx`) — FPG, Drive, MAJOR, França, Espanha,
  Global Junior, USKids (cada escalão) e a análise BJGT. Tem tudo (Inscrições,
  Draws, voltas, Pré-Cut, Resumo, Scorecards, análise, partilhar volta, tabs
  extra, encaixes por volta/Resumo) e cada página esconde o que não precisa por
  props. As abas «⛳ O campo» e «🔮 Previsão» (a do Kids 2, no tee do Manuel:
  draw → voltas → regulamento/escalão) junta-as ele sozinho sempre que o campo
  da prova é conhecido (`useCampoTabs`, `pages/fpg/fpgCourseTab.tsx`; reserva: o
  `course` do CircuitShell) — as páginas não as acrescentam. **O «Scout» é UM só
  e igual em todas as páginas** (05/11/2026, «EU QUERO QUE EM TODAS AS PÁGINAS
  APAREÇA O MESMO»): `ui/circuit/ScoutProva.tsx` — field por `currentField`
  (draw → resultados → inscrições), edições anteriores no bloco «Nesta prova»,
  WHS e Previsão WHS para quem tem federado (o da prova, senão o da ficha do Kids 2).
  A FPG e o CircuitShell (`ScoutDoCircuito`) dão-lhe as edições; nas outras
  páginas junta-o o TournamentDetail. Nada de Scouts próprios por página. O `IntlTournView` é só um adaptador da interface antiga — funcionalidade
  nova entra no TournamentDetail. A aba vive no URL (`?tab=`; `tabParam` muda o
  nome — a `/uskids` usa `rt`).
- **Peças únicas, nunca uma tabela própria por página:** inscrições →
  `AdmissionsTab`; draws → `DrawTab` (fontes de fora convertem para `FpgDraw`;
  no CircuitShell vão em `admissions`/`roundDraws` da divisão); barra de filtros
  de jogadores → `PlayerFilterBar.tsx`; linha «Rótulo: Todos · a · b» →
  `FilterPillRow`; escolha única e barras de navegação → `TabRow` (separador-link
  com `href`); filtro liga/desliga → pill
  `.tourn-tab tourn-tab-sm` (+ `active`; desligada SEMPRE cinzenta, ligada SEMPRE verde `--accent`, regra
  global — decisão dela, 31/10/2026); botão de acção → `.btn` (`.btn-link`,
  `.btn-round` para ‹ ›), nunca uma pill de filtro; «✕ Limpar» → `ClearButton`; «✕» de fechar → `CloseButton`; pesquisa → `SearchInput`; erro → `ErrorState`;
  sexo → `SexSelect`; caixa de escolha → `Select` (`variant`, `active`); título de secção → `SectionTitle` (`size`, `icon`, `sub`, `right`); rótulo por cima de um controlo → `FilterField` (`hint`, `asLabel`); datas → `utils/format` (`fmtDatePt`, `fmtDateShort`, `fmtDayMonth`, `fmtMonthYear`, `fmtDateSpan`, `fmtDateTime`, `yearOfDate`; nada de formatadores locais); ordem de escalões em bruto → `compareEscalaoRaw`; carregar um ficheiro de dados numa página → `useJson` (`src/hooks/useJson.ts`; nada de `useEffect` + `cachedFetchJson` à mão); cor «bom/mau» pelo sinal → `toneClass` (classes `.tone-*`, nunca a cor em `style`); ordinal → `fmtOrd` («3.º»); nome curto de torneio → `shortTournamentName`; título da barra lateral → `SidebarSectionTitle` (`icon`, `sticky`, `onClick`); pílulas de estado → `.p-good`/`.p-warn`/`.p-bad`; seta de tendência (▲▲ ▲ ● ▼ ▼▼) → `TrendArrow`; HCP em texto com o plus a dourado → `HcpText` (`ui/HcpPill`); cores rapaz/rapariga → `.c-male`/`.c-female`/`.bg-male`/`.bg-female`; filtro liga/desliga com rótulo → `ToggleChip`; «Mostrar mais» →
  `ShowMoreButton`; janela por cima → `Modal`; separadores sublinhados → `TabRow variant="under"`;
  célula vazia → `MUTED`; cor do tee → `TeeSwatch`; SD → `SDPill`; ⓘ → `InfoIcon`;
  seta ↗ Kids → `KidsArrow`; posição do Kids 2 → `TrophyPos`; legenda de níveis → `TierLegend`;
  sinal → `fmtSign`; HCP → `fmtHcp` (plus = «+1.2»); números com PONTO decimal; zero do
  ±par = «E»; um só cinzento esbatido (`--text-muted` = `--text-3`);
  abrir/fechar → `ExpandArrow` (▸/▾); link para fora → `ExtLink` (nada de
  `<a target="_blank">` à mão); nome que abre a ficha → `PlayerLink`; cabeçalho
  ordenável → `SortableHdr` (▲▼); a carregar / sem dados → `LoadingState` /
  `EmptyState`; cartão de torneio na barra lateral → `SidebarCard`; número com
  ícone dos campos → `HeroStat`; tirar acentos → `stripAccents`; ordem dos
  escalões → `compareEscalao`/`ESC_ORDER_FULL`; ordinais «1.º»;
  paginação → `ui/Pager` + `usePaged`; espaçamento, letra e cantos no `App.css` sempre com `var(--space-*)`/`--fs-*`/`--radius-*` (só ficam em px os redondos, os negativos e o bloco de impressão); KPIs → `KpiCard` numa `.kpi-row`;
  cartão de buracos → `ScorecardTable` ou a grelha `.sc-table-modern`/`.sc-table-ec`
  + `.sc-grid`; tabela simples → `.dtable`, SEMPRE à largura toda — nunca `u-w-auto` (04/11/2026, «tabelas que se adaptam à janela e outras que não… não gosto»; trava `scripts/tabelas-largura.test.js`; larga demais → dentro de `.u-ox-auto`) (variantes `-sm`/`-lg`/`dt-compact`/
  `player-list-table` só JUNTO com `.dtable`; o aspecto vive no «MODELO ÚNICO DAS
  TABELAS», fim do `App.css`); só totais → dados `totals` da divisão, que o CircuitShell passa ao `TournamentDetail` como prova sem buraco a buraco (`totalsDivisionView`, um só caminho); lista +
  detalhe → `MasterDetail`; **rankings → capacidade `ranking` do CircuitShell**
  (`CircuitConfig.ranking`, `ui/circuit/CircuitRanking.tsx`: vista «Ranking» com
  linhas calculadas dos torneios visíveis, `RankingTable` ordenável, e a
  classificação acumulada na aba «Época»; EGR/WAGR entram pela `RankingPage`
  com `render` próprio; os rankings da /FPG usam a `CircuitRankingView` fora
  do shell, com as contas em `src/data/ranking/fpgRanking.ts`; qualquer lista
  de ranking é uma `RankingTable` — o Kids 2 também); página «📚 Categorias» dos circuitos de fora (/ffg, /rfeg, /fig) → `ui/info/CategoriasInfo` (cada página só dá os dados); «🏆 Ranking juvenil» (/fig, /rfeg) → `ui/ranking/RankingListaView`; evolução ano-a-ano → `ui/evo`; equipas em stroke play (Clubes FPG, Final Drive) → `ui/circuit/TeamStrokeStandings` (contas em `src/data/teamStroke.ts`; Cartões · Lista · Jogadores), equipas por pontos (match play) → `TeamPointsStandings`. Provas de fora da FPG:
  `intlScorecardOptions()` e `buildFPGTournament()` (`src/data/`).
- **Modelo comum por tipo de torneio: `src/data/model/`** (fase 0, 22/10/2026).
  Formato (`stroke | totals | matchplay-ind | matchplay-team | stroke-team`),
  estado (`future | live | finished`), buracos, cut e origem do par saem SEMPRE de
  `tournament.ts`/`division.ts` (os conversores gravam-nos com `withTournamentModel`/
  `withDivisionModel`); identidade do jogador (sexo, país ISO, nascimento, escalão)
  de `identity.ts`; nomes de escalão de `escalao.ts` (tabela única de sinónimos).
  Nada de inferências novas por página. Divisões do CircuitShell com DADOS, não
  JSX: draws em `roundDraws[].draw`, só totais em `totals` — quem desenha é
  `ui/circuit/divisionPieces.tsx`. → [convencoes-e-armadilhas.md](docs/claude/convencoes-e-armadilhas.md#modelo-comum-srcdatamodel)
- Definições partilhadas vivem em `constants/`, `utils/` e `App.css`, nunca
  duplicadas por página. Filtrar e calcular nos loaders, não nos componentes.
  Sem código morto.
- **Lógica repetida vai SEMPRE para um módulo global** (Mariana, 10/11/2026:
  «se identificares módulos que possam ser globais em vez de repetidos em vários
  locais, muda-os SEMPRE para módulos/componentes globais»). Os que nasceram da
  revisão de erros de 10/11/2026 — usar, nunca reescrever:
  classificar/ordenar por total → `utils/classificacao.ts` (`temCartao`,
  `voltasComCartao`, `parsePos` — «T4» → 4, «CUT» → null —, `posicoesComEmpates`,
  `classificarPorTotal`: só quem tem TODAS as voltas e cartão); quem é o jogador
  (federado, senão nome; nunca fundir homónimos) → `utils/playerKey.ts`
  (`playerKey`, `isFedFpg`, `indexPlayers`) e `utils/chaveJogador.ts`; ligar um
  nome a um federado só com clube/idade a confirmar → `utils/federadoPorNome.ts`;
  o Manuel numa prova → `findManuelNaProva` (`constants/manuel.ts`; nunca o pai);
  sexo da prova pelo rótulo → `sexoDaProva` (`utils/tournamentSex.ts`); ±par só
  dos buracos jogados → `utils/parJogado.ts`; buracos/cartão/±par de uma volta
  (9 vs 18, USKids) → `utils/voltasJogadas.ts`; ±par pelas voltas que o jogador
  jogou → `toParPlayed`/`toParByRounds` (`data/intlCommon.ts`); escolha de tee
  por tee + sexo (há pares M/F com o mesmo `teeId`) → `utils/teeChoice.ts`;
  contas com dias → `utils/dias.ts`; «Fev 2025» ordenável → `utils/mesAno.ts`;
  código de prova de fora (wjgc/doral/eowagr…) → `utils/extraTid.ts`; link da
  signupanytime → `utils/signupanytime.ts`; destaque do melhor valor →
  `utils/melhorValor.ts`; rank por z-score → `utils/zRank.ts`; clube que é um
  país → `utils/clubePais.ts`; selo do lugar → `ui/PosMedal.tsx`; separadores
  Stroke Play/Medal Net/Stableford Net → `ui/ModoClassifTabs.tsx`; cache de uma
  promessa que NÃO guarda a falha → `memoAsync` (`data/fetchCache.ts`); eclético
  de uma volta (a metade certa nas de 9) → `eclecticForRound`
  (`data/playerDataLoader.ts`).

### Contas de handicap — um só sítio: `src/utils/whsCalc.ts`
- SD, Course/Playing Handicap, Net Double Bogey/AGS, Expected SD de 9 buracos,
  janela 20/8, extraordinários, caps e projecção do HI vivem **só** aí.
  `113 / slope` fora do whsCalc é erro.
- **SD de uma volta jogada:** o oficial da FPG (`roundScores[].sd`, gravado pelo
  `backfill-sd.js`); sem ele, o calculado com o HCP da inscrição (`hcpExact`).
  Tudo passa pelo `computeSD` (`src/data/fpgUtils.ts`). Nunca estimar sem
  CR/Slope. Não se descarrega WHS de ninguém só para ter o SD.
- **Toda a volta jogada tem SD** (Mariana, 02/11/2026: «TUDO TEM DE TER SD»).
  Numa prova de várias voltas o acumulado não tem SD — tem-no CADA volta:
  `computeRoundSDs` (fpgUtils). Nunca deixar uma coluna de SD vazia por a
  entrada ser o Resumo.
- Os scripts Node usam o **mesmo** ficheiro via `scripts/lib/whs.cjs` (o Node
  corre TypeScript). Por isso o `whsCalc.ts` só pode ter tipos e interfaces
  (nada de `enum`/`namespace`) e não importa outros ficheiros do `src`
  (`scripts/whs-loader.test.js` parte se isto falhar).
- **Nomes de campo: o mesmo esquema** — a tabela de aliases e a resolução por
  par vivem só em `src/utils/courseAliases.ts`; os scripts usam
  `scripts/lib/course-aliases.cjs` (e o pipeline `lib/course-aliases.js`), que o
  carregam. Mesmas restrições (`scripts/course-aliases-loader.test.js`).
- Detalhe e validação contra o oficial: [whs-pcc-sd.md](docs/claude/whs-pcc-sd.md)
  e [convencoes-e-armadilhas.md](docs/claude/convencoes-e-armadilhas.md).

### Dados e scrapers
- **Nunca gravar um ficheiro muito mais pequeno do que o que está em disco sem
  `--force`** — as fontes às vezes respondem 200 com lixo. Os scripts têm guardas
  anti-encolhimento; um script novo também tem de ter.
  Usar `writeJsonGuarded` (`scripts/lib/shrink-guard.js`): escrita atómica +
  guarda numa só chamada. Input/cache/scope **ilegível é erro**, nunca «vazio».
- **Exit codes dos scrapers:** `0` gravou · `2` nada de novo (não é erro, o
  workflow salta o commit) · `1` erro · `3` FPG em baixo. O step do workflow
  tem de aceitar o 2 (`node scripts/x.js || [ $? -eq 2 ]`), e um
  `process.exit(0)` final não pode apagar o `exitCode = 1` de uma guarda.
- **A FPG reutiliza tcodes entre clubes e anos:** nunca casar só por tcode. Usar
  tcode + data + campo (PCC), fed + data da volta (SD), `ccode:tcode` no
  `--tcodes`. No PJA, `PJA_TCODES` só leva tcodes que não se repetem; os outros
  entram por nome.
- **Quem é o jogador e em que escalão jogou lê-se na PRÓPRIA prova** (Mariana,
  03/11/2026: «nos torneios há sempre o draw e os outros tabs… tens o número de
  federado dele»). Classificação, inscrições e draw (`fpg-admissions-draws*.json`:
  `fed`, `escalao`, `regiao` por inscrito) dizem o federado e o escalão. Sem número
  na classificação → o das inscrições/draw da MESMA prova (`fedDoJogador`,
  `scripts/aggregator/sources/fpg.js`). **Nunca** adivinhar por nome + clube noutras
  listas, nem dar a um federado a data de nascimento de um homónimo (roster GolfBox,
  outra fonte), nem juntar pessoas cujo federado ou escalão o contradiz. Num escalão
  Sub-N nunca entra alguém mais velho (regra já antiga do `pickBestFed`). Listas de
  inscritos sem números (`util/hcp-listas.js`): o número primeiro (licença da lista,
  federado da prova em `lista.prova`); só pelo nome, a ligação fica «por confirmar»
  e não escreve na ficha até algo a confirmar (único na federação, clube, handicap
  recente, idade) — e não se faz se a federação inteira tiver um homónimo.
- **Gross ≥ 900 (998/999…) é "sem cartão"** — não pontua nem entra em médias,
  posições ou ±par. `grossTotal` pode vir como texto ("WD"). Nas fontes de fora
  e nos draws a regra é uma só: `isNoCardGross` (`src/data/intlCommon.ts`),
  aplicada no `buildFPGTournament` (também nas provas só com totais) e no `DrawTab`.
- **Datas `/Date(ms)/` da FPG são meia-noite de Lisboa** — converter com
  `lisbonCivilDay`/`lisbonCivilDayStr` (`lib/helpers.js`), nunca com `toISOString()`.
- **Cartões WHS de voltas internacionais NÃO são fonte oficial do campo:** quem os
  preenche na FPG é o clube do atleta, muitas vezes à pressa (tee ao calhas, metros
  a zero, SI 1..18 seguido). Metros/SI/tee/CR vêm do organizador (GolfGenius,
  GolfBox, FFG); os cartões dos clubes só como recurso, com consenso e marcados
  (`cardSource: "whs-clubes-pt"`). Nunca tirar SI nem nome de tee daí.
- **Voltas internacionais:** enriquecer sempre com `scripts/enrich-intl-round.js`,
  nunca à mão (o `melhorias.json` da raiz é CRLF e editado por splice).
- **EGR e WAGR são ADITIVOS, nunca subtractivos** (Mariana, 19/09): as duas fontes apagam o que tem mais de ~2 anos (pontos caducam, a ficha EGR só mostra a janela do ranking). Ao regravar eventos ou fichas usar `scripts/lib/merge-aditivo.js` (o que vem actualiza, o que só existia no ficheiro fica, marcado `_mantido`). As fichas EGR refrescam-se todas uma vez por mês (`update-egr.yml`) para nada chegar aos 2 anos sem estar guardado.
- **Escrever JSON com `writeJsonAtomic`** (`scripts/lib/atomic-write.js`) e usar a
  lib partilhada em scripts novos.
- **Jogadores seguidos:** o `players.json` é cortado pelo `prune-player-scope.js`
  (tectos de índice por escalão + tags fixas). Repor alguém:
  `prune-player-scope.js --restore <fed>`.

### FPG
- **Sessão pública primeiro, cookies como plano B** (`scripts/lib/fpg-session.js`;
  `FPG_AUTH_MODE` = `auto`|`cookies`|`publico`). As cookies duram ~9 h. Só as
  inscrições (`scrape-fpg-admissions-draws-node.js`) continuam a precisar delas.
- **HTTP 500 não prova que as cookies morreram** — a FPG às vezes está em baixo.
  O `fpg-liveness.js` distingue: exit 3 = FPG em baixo; exit 2 = indeterminado
  (confirmar no browser antes de refrescar).
- Entrar sempre pelo portão (`linkpage.aspx`, `1PreparePage.aspx`), nunca directo
  às páginas. `fetch` com `redirect:"follow"` perde a sessão — usar `Sessao.get`.
- `score_id` ≠ `id`; os parâmetros extra vão na query **e** no corpo; páginas de
  100 no máximo.
- **O PCC e o SD chegam depois do scrape** — o `update-data.yml` (Dom/Seg 00:05
  UTC) corre `backfill-pcc.js` e `backfill-sd.js`.
- Detalhe: [fpg-sessao-e-cookies.md](docs/claude/fpg-sessao-e-cookies.md) ·
  [fpg-apis.md](docs/claude/fpg-apis.md) · [fpg-pipeline.md](docs/claude/fpg-pipeline.md).

### Outras fontes
- **GolfGenius: sempre `fetch`** (`scrape-golfgenius-node.js`), nunca browser
  automatizado (dá 403). A única excepção é o directório do England Golf.
- **USKids:** procura só para a frente, um pedido de cada vez, e parar à primeira
  recusa. Não voltar a varreduras em massa — a USKids já nos bloqueou. → [uskids.md](docs/claude/uskids.md)
- **BJGT, WJGC, EOWAGR, FCG, JWGC:** ficheiros históricos; os scrapers antigos
  em `scripts/` não se correm.
- **Live scoring da FPG:** só se lê navegando a página num browser e só existe
  durante a prova.
- **Ranking PJA:** as regras vivem só em `ranking-pja/pja-rules.mjs`, que é
  servido em cru ao browser — nada de notas internas nesse ficheiro. → [pja.md](docs/claude/pja.md)
- **kids2:** as fontes entram pelo agregador (`scripts/aggregator/`), nunca pelo
  `KIDSdataLoader`. Ao acrescentar uma fonte, seguir a checklist em
  [kids2-agregador.md](docs/claude/kids2-agregador.md); verificação: Manuel × Dmitrii = 7 confrontos.
- **RFEG — hándicap oficial e rankings juvenis dos espanhóis** (22/10/2026): a
  RFEG mudou de site em Set/2026 (WordPress) e os `.aspx` antigos redireccionam
  para a página inicial. `scrape-federados-es.js` (pesquisa de hándicap, só os
  ~1,1 mil juniores que interessam, um pedido de cada vez) e
  `scrape-rfeg-ranking.js` → agregador (`junior.rfegOficial`, `hr`/`rk` no
  Scout). Casar só por licença → 6 dígitos finais → nome + ano de nascimento,
  com as guardas de `scripts/lib/rfeg-oficial.js`. → [ffg-rfeg.md](docs/claude/ffg-rfeg.md)
- **Destaque PT nas fontes de fora e nos draws: sempre `isPtCountry`**
  (`utils/flagUtils.ts`: PT, PRT, POR, Portugal), nunca `country === "PT"`. Só a
  FFG soma as excepções por nome (`isPT`, `utils/ptPlayers.ts`).
- **MAJOR:** correr `node scripts/build-major-catalog.js` sempre que um ficheiro
  de dados MAJOR muda (o workflow fá-lo em push). → [major.md](docs/claude/major.md)

## ⚠ Conflitos de git nos ficheiros GERADOS — regenerar, nunca fundir

Os workflows regeneram e committam os mesmos ficheiros que geramos em local, por
isso um `git pull` depois de um push nosso dá conflito quase sempre nestes:

| Ficheiro | Regenerar com |
|---|---|
| `public/data/major-catalog.json` | `node scripts/build-major-catalog.js` |
| `public/analise-percurso-juniores.html` (blocos `const P` e `const PATH`) | `node scripts/build-analise-percurso.js && node scripts/build-percurso-path.js` |
| `public/data/juniors.json` · `juniors-tournaments*.json` · `tournament-catalog.json` · `hcp-listas-ligacoes.json` · `juniors-scout.json` · `juniors-links.json` · `egr/egr-cobertos.json` | `node scripts/aggregator/index.js` |

São output de scripts: nenhum dos lados do conflito está certo e fundir à mão só
produz lixo. Resolução:

```bash
git checkout --theirs public/data/major-catalog.json public/data/juniors.json public/data/juniors-tournaments*.json public/data/tournament-catalog.json public/data/juniors-scout.json public/data/juniors-links.json
node scripts/build-major-catalog.js && node scripts/aggregator/index.js
git add public/data/major-catalog.json public/data/juniors*.json public/data/tournament-catalog.json && git commit
```

⚠ Deixar o conflito por resolver parte a app inteira: os marcadores `<<<<<<<`
tornam o JSON inválido e a `/major` fica sem torneios nenhuns.

## Armadilhas que continuam a morder

- **Manuel tem 4 variantes de nome e 2 contas USKids** — detectar com
  `isManuel()`/`isManuelByName()` (`src/constants/manuel.ts`, onde também estão
  os dois memberIDs, em `MANUEL_PLAYER_IDS`) e usar `autoRivals.filter(d => d.isM)`
  (não `find()`), juntando todas as entradas. Nunca reimplementar com
  `includes("medeiros")`. Quando o registo traz o federado, é ele que decide no
  `isManuel` — o pai (54907) também se chama «Manuel Medeiros».
- **O `players.json` da cache é o mesmo objecto do AppContext** — nunca lhe
  acrescentar entradas (fazer `{ ...players }` primeiro). O loader da /FPG e da
  /drive enchia-o com ~100 mil nomes de consulta e a /jogadores mostrava-os
  (corrigido a 02/11/2026).
- **USKids vs resto na `/uskids`:** a tab Resultados só lê `uskids-results.json`
  e os `uskids_torneios_completos(N).json`; Doral, WJGC, QDL, etc. só entram nos
  rivais. Este erro já voltou várias vezes.
- **FPGPage: a fonte de verdade é o URL** — o torneio aberto sai do `tkey`
  (`resolveFpgTkey` → CircuitShell); a sidebar navega. Nada de `selected`/efeitos
  URL↔estado. Ficheiros numerados/mensais lêem-se pelo `fpg-files-index.json`
  (gerado no build), nunca sondando até dar 404. → [paginas.md](docs/claude/paginas.md)
- **Marco Simone 2026 Boys 11:** o site mostra o score oficial com penalidade
  (R1 = 91), não o jogado (`applyResultOverrides` na `USKIDSPage`).
- **Dados USKids:** `lengths[]` são jardas (×0,9144); `strokes[]` tem sempre 18
  posições, com zeros nos buracos não jogados.
- **Sem par oficial fica SEM PAR** (22/10/2026): nunca inventar par por buraco
  (o 4×18 de LGS/NextCaddy/RFEGolf/golfdirecto/GJGL e o par «chato» do MAJOR
  saíram — `parOrNone`). Linha PAR vazia, sem cores/contagens por buraco nem
  «Par N»; o ±par do total só o da fonte ou do par total real. O
  `ScorecardLeaderboard` tira o nº de buracos de `holes`/dos cartões quando
  `par[]` vem vazio.
- Mais em [convencoes-e-armadilhas.md](docs/claude/convencoes-e-armadilhas.md).

## Tags do `players.json`

| Tag | Na interface | No scraper |
|---|---|---|
| (sem tag) | visível | actualizado |
| `PJA` | visível, prioridade máxima | actualizado |
| `no-priority` | visível (não-jovens saem no cleanup) | actualizado se estiver na lista |
| `hidden` | escondido da sidebar | removido pelo cleanup |
| `no-scrape` | visível | **não é actualizado** |
| `inscrito-nacional` | visível | prioridade máxima, nunca `no-scrape` |
| `simulador` | visível | actualizado; o prune nunca o corta (escolhidos para o `/simulador`) |

`hidden` = invisível e sai do `players.json`; `no-scrape` = visível mas congelado.
O `cleanup-players-json.js` aplica estas regras.

## Automação — o essencial

- Horários principais (UTC): `update-data` Dom/Seg 00:05 (WHS, PCC, SD) ·
  `update-classif` Dom/Seg 01:00 · `update-drive` Sex/Sáb/Dom 21:00 ·
  `update-fpg-admissions-draws` Sex/Sáb/Dom 20:00 · `uskids-field` diário 07:00 ·
  `daily-digest` diário 07:30 (resumo por email, via issue) · `build-juniors` e
  `build-major-catalog` em push.
- **Workflow que committa dados publica SEMPRE por `scripts/ci/push-generated.sh`**
  (nunca `git pull --rebase`): repõe o run por cima do main mais recente e
  REGENERA os agregados (`-f agregador|major|tracking|ffgolf|pairings|simulador`).
  Falha real fica vermelha depois do commit (exit 2 = nada de novo, não é erro).
- Tabela completa dos workflows, com scripts e secrets: [workflows.md](docs/claude/workflows.md).
