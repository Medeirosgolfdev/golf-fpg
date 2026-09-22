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
(deploy a cada push no `main`) · 33 workflows GitHub Actions a actualizar os
dados · Node 24 nos workflows.

## Estrutura

```
src/
  pages/          # páginas lazy-loaded (ver "Páginas")
  data/           # loaders, tipos, registos de dados (KIDSdataLoader, dataRegistry, playerDataLoader, …)
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
npm run scrape    # pipeline completo (golf-all.js)
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
| England Golf | [england.md](docs/claude/england.md) |
| Formatos JSON e tabela de todos os ficheiros de dados | [estruturas-json.md](docs/claude/estruturas-json.md) |
| `/campos`, `/simulador`, Vantagem de Tee | [campos-simulador.md](docs/claude/campos-simulador.md) |
| Workflows (horários, scripts, secrets) e resumo diário por email | [workflows.md](docs/claude/workflows.md) |
| Ranking PJA | [pja.md](docs/claude/pja.md) |
| Convenções de código, armadilhas, ficheiros-chave, testes | [convencoes-e-armadilhas.md](docs/claude/convencoes-e-armadilhas.md) |
| Campeões Nacionais de Jovens | [nacionais-jovens.md](docs/claude/nacionais-jovens.md) |

**Mapa de links:** `docs/links-conhecidos.html` (também publicado como
artifact) tem todos os endereços conhecidos — FPG, USKids, GolfGenius, GolfBox,
Espanha, França, rankings — com o tipo de acesso, exemplos reais, o script que
usa cada um e uma secção por clube (código, `ack`, federados). **Quando se
descobrir um link novo, acrescentá-lo lá.**

## Páginas

Rotas principais (tabela completa em [paginas.md](docs/claude/paginas.md)):
`/jogadores` e `/jogadores/:fed` · `/FPG` · `/drive` · `/uskids` · `/kids2`
(tracker de rivais; `/kids` redirecciona) · `/major` (BJGT, Doral, GolfGenius,
GolfBox) · `/england` · `/ffg` · `/rfeg` · `/global-junior` · `/egr` · `/wagr` ·
`/faldo` · `/campos` · `/comparar` · `/simulador` · `/calendario` · `/draws` ·
`/titulos` · `/torneios-recentes` · `/bjgt-analysis`.

- `BJGTPage.tsx` e `DORALPage.tsx` são módulos de dados usados pela `/major`
  (as rotas antigas redireccionam).
- `ScotlandPage.tsx` está completa mas **desligada de propósito** (os dados não
  são fiáveis) — não é bug.
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
| `TORNEIOS_COMPLETOS_COUNT` | `41` (constante em `USKIDSPage.tsx` — actualizar ao acrescentar completos) |
| Signupanytime `ax` | `1129` (internacional) · `2739` (Marco Simone 2025) · `2760` (El Prat) |

## Regras que não se quebram

### Código e interface
- **Todas as tabelas ordenáveis por clique no cabeçalho** — `useSort`
  (`src/hooks/useSort.ts`) + `SortableHdr` (`src/ui/SortableHdr.tsx`). No
  `ScorecardLeaderboard`, as colunas extra (`prefixHeaderCells`/
  `postScorecardHeaderCells`) ordenam-se à mão (ver `AdmissionsTab.tsx`, `DrawTab.tsx`).
- **Sexo: sempre `<SexBadge sex="M|F" />`**, nunca os símbolos ♂/♀.
- **Cores só via `src/tokens.css`**; `colors.ts` espelha-os para JS. Excepções de
  propósito: `OverlayExport.tsx` (o html-to-image não lê variáveis CSS),
  `--pill-intl-bg: #00FF00` e as cores de tees da FPG em `teeColors.ts`.
- **Scorecard:** eagle âmbar, birdie vermelho, par branco, bogey azul de cantos rectos.
- **Tee físico:** um tee é cor + distância; M e F são só ratings diferentes do
  mesmo tee — contar e listar com `physicalTeeGroups`/`physicalTeeKey`.
- Definições partilhadas vivem em `constants/`, `utils/` e `App.css`, nunca
  duplicadas por página. Filtrar e calcular nos loaders, não nos componentes.
  Sem código morto.

### Contas de handicap — um só sítio: `src/utils/whsCalc.ts`
- SD, Course/Playing Handicap, Net Double Bogey/AGS, Expected SD de 9 buracos,
  janela 20/8, extraordinários, caps e projecção do HI vivem **só** aí.
  `113 / slope` fora do whsCalc é erro.
- **SD de uma volta jogada:** o oficial da FPG (`roundScores[].sd`, gravado pelo
  `backfill-sd.js`); sem ele, o calculado com o HCP da inscrição (`hcpExact`).
  Tudo passa pelo `computeSD` (`src/data/fpgUtils.ts`). Nunca estimar sem
  CR/Slope. Não se descarrega WHS de ninguém só para ter o SD.
- Os scripts Node usam o **mesmo** ficheiro via `scripts/lib/whs.cjs` (o Node
  corre TypeScript). Por isso o `whsCalc.ts` só pode ter tipos e interfaces
  (nada de `enum`/`namespace`) e não importa outros ficheiros do `src`
  (`scripts/whs-loader.test.js` parte se isto falhar).
- Detalhe e validação contra o oficial: [whs-pcc-sd.md](docs/claude/whs-pcc-sd.md)
  e [convencoes-e-armadilhas.md](docs/claude/convencoes-e-armadilhas.md).

### Dados e scrapers
- **Nunca gravar um ficheiro muito mais pequeno do que o que está em disco sem
  `--force`** — as fontes às vezes respondem 200 com lixo. Os scripts têm guardas
  anti-encolhimento; um script novo também tem de ter.
- **Exit codes dos scrapers:** `0` gravou · `2` nada de novo (não é erro, o
  workflow salta o commit) · `1` erro · `3` FPG em baixo.
- **A FPG reutiliza tcodes entre clubes e anos:** nunca casar só por tcode. Usar
  tcode + data + campo (PCC), fed + data da volta (SD), `ccode:tcode` no
  `--tcodes`. No PJA, `PJA_TCODES` só leva tcodes que não se repetem; os outros
  entram por nome.
- **Gross ≥ 900 (998/999…) é "sem cartão"** — não pontua nem entra em médias.
  `grossTotal` pode vir como texto ("WD").
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
- **MAJOR:** correr `node scripts/build-major-catalog.js` sempre que um ficheiro
  de dados MAJOR muda (o workflow fá-lo em push). → [major.md](docs/claude/major.md)

## ⚠ Conflitos de git nos ficheiros GERADOS — regenerar, nunca fundir

Os workflows regeneram e committam os mesmos ficheiros que geramos em local, por
isso um `git pull` depois de um push nosso dá conflito quase sempre nestes:

| Ficheiro | Regenerar com |
|---|---|
| `public/data/major-catalog.json` | `node scripts/build-major-catalog.js` |
| `public/analise-percurso-juniores.html` (blocos `const P` e `const PATH`) | `node scripts/build-analise-percurso.js && node scripts/build-percurso-path.js` |
| `public/data/juniors.json` · `juniors-tournaments*.json` · `tournament-catalog.json` | `node scripts/aggregator/index.js` |

São output de scripts: nenhum dos lados do conflito está certo e fundir à mão só
produz lixo. Resolução:

```bash
git checkout --theirs public/data/major-catalog.json public/data/juniors.json public/data/juniors-tournaments*.json public/data/tournament-catalog.json
node scripts/build-major-catalog.js && node scripts/aggregator/index.js
git add public/data/major-catalog.json public/data/juniors*.json public/data/tournament-catalog.json && git commit
```

⚠ Deixar o conflito por resolver parte a app inteira: os marcadores `<<<<<<<`
tornam o JSON inválido e a `/major` fica sem torneios nenhuns.

## Armadilhas que continuam a morder

- **Manuel tem 4 variantes de nome e 2 contas USKids** — detectar com
  `isManuel()`/`isManuelByName()` (`src/constants/manuel.ts`, onde também estão
  os dois memberIDs, em `MANUEL_PLAYER_IDS`) e usar `autoRivals.filter(d => d.isM)`
  (não `find()`), juntando todas as entradas.
- **USKids vs resto na `/uskids`:** a tab Resultados só lê `uskids-results.json`
  e os `uskids_torneios_completos(N).json`; Doral, WJGC, QDL, etc. só entram nos
  rivais. Este erro já voltou várias vezes.
- **FPGPage: a fonte de verdade é o URL** — o torneio seleccionado sai do `tkey`;
  a sidebar tem de chamar `navigate()`.
- **Marco Simone 2026 Boys 11:** o site mostra o score oficial com penalidade
  (R1 = 91), não o jogado (`applyResultOverrides` na `USKIDSPage`).
- **Dados USKids:** `lengths[]` são jardas (×0,9144); `strokes[]` tem sempre 18
  posições, com zeros nos buracos não jogados.
- **`ScorecardLeaderboard`** usa `par.length`: um `par[]` vazio dá 0 buracos.
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
- Tabela completa dos 33 workflows, com scripts e secrets: [workflows.md](docs/claude/workflows.md).
