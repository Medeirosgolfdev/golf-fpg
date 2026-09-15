# FPG — scripts do pipeline (resultados, Drive, inscrições, draws, federados, torneios recentes)

> Detalhe tirado do CLAUDE.md a 2026-09-15 (o CLAUDE.md fica só com o essencial e
> aponta para aqui). Datas entre parênteses = quando a regra ou a medição foi feita.

## Scripts — FPG Pipeline

Dois modos: **Browser Console** (colar no F12 num site específico) e **Node.js Terminal** (correr em `C:\golf-fpg\scripts\`).

> **⚠ Reorganização 2026-06-23 — localização dos scripts da raiz.** Na raiz fica
> o `pipeline.js` (o `scripts/fpg-scrape-node.js` invoca-o via `node pipeline.js
> --skip-import`) e os utilitários `pg-*.js`. Os restantes scripts que estavam
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

### Fluxo: Descarregar inscrições + draws de torneios FPG

**LEGADO** — substituído pelo `scrape-fpg-admissions-draws-node.js` (Node puro desde 2026-04-22, descrito mais abaixo). O fluxo browser fica como referência dos URLs e fallback manual.

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

**Script Node `scripts/scrape-fpg-admissions-draws.js` (legacy)** — existe mas **não funciona**. Servidor FPG rejeita (HTTP 500 ou HTML truncado) mesmo com cookies capturados de Chrome 90. Mantido como referência dos URLs e da tentativa; **usar o `scrape-fpg-admissions-draws-node.js`** (abaixo).

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

- **Final ×1.5** (arredondado): 1º 250→375 · 2º 165→**248** · 3º 94→141 · 4º 75→**113** · 8º **38**→57.
  ⚠ **As Finais usam a tabela do TOUR (8º = 38), não a do Challenge (8º = 35)** — medido a
  2026-09-10: 16/16 oitavos lugares nas Finais oficiais valem 57, e a fase regular do Challenge
  dá 35 em 137/137. `DRIVE_POINTS_FINAL` + `tournamentPoints(field, series, tournName)` — sem o
  nome da prova o 8º de uma Final sai com 35. Apanhado pelo `drive-ranking-vs-oficial.test.js`
  na Final do Norte Sub 12 (4 Set 2026).
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

**scrape-fpg-admissions-draws-node.js** — Node puro (2026-04-22). Substitui os browser-scripts `browser-scrape-fpg-admissions-draws.js` + `browser-scrape-fpg-draws-only.js` + `merge-fpg-admissions-draws.js`. Corre linkpage cross-domain (scoring.fpg.pt/lists) em paralelo, merge aditivo (preserva bons, rejeita `_suspect`), output único em `public/data/fpg-admissions-draws.json`. Scope: `scripts/fpg-admissions-scope.json` (~390 torneios em 2026-09; cresce com o `--auto-extend`). Exit code 2 = sem novidades. Workflow: `update-fpg-admissions-draws.yml` (Sex/Sáb/Dom 20:00 UTC) — **regenera também `public/data/manuel-pairings.json` via `pairings-build.js` e committa-o** (alimenta a página `/draws`). Secret: `FPG_ADMISSIONS_COOKIES`.

⚠ **Trava `_manual` (2026-06-14):** uma entrada de torneio com `"_manual": true` é **curada à mão** e o scraper preserva-a INTACTA (salta-a no merge — ver guarda no topo do loop em `scrape-fpg-admissions-draws-node.js`). Usar quando se inserem draws/admissions manualmente (ex: folhas de pairing fotografadas) que NÃO devem ser sobrescritos num run futuro — crítico porque a FPG reutiliza tcodes (um tcode antigo reaproveitado traria um draw "legítimo" `nScore>0` que de outra forma ganhava ao manual). Os draws por jogador podem ter `tee` próprio (flights com tees mistos M/F) — `FpgDrawFlight.players[].tee` em `nacional2026Loader.ts`, lido pelo `DrawTab` (`p.tee ?? g.tee`). Actualmente marcados (2026-09): `125/10370` (PJA Vale Pisão Dia 2), `152/10444` (AT&T Pebble Beach Royal Óbidos D1+D2), `059/10685`, `038/10754`, `003/10652`, `003/10653` e `988/90800` (placeholder de torneio só-draw).

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
`scrape-fpg-admissions-draws-node.js` ganhou `/\bdrive\s+(tour\b|chall)/i` (prefixo "chall": a FPG abrevia os nomes longos)
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

**scrape-classif-node.js** — Node puro (2026-04-22). Substitui `pull-torneios.js` browser-console. GET linkpage warmup + POST `classif.aspx/ClassifLST` paginado + POST `classifAgregate.aspx/ScoreCard` por jogador. Output formato compatível com `pull-torneiosNNN.json`. Scope: `scripts/classif-scope.json` (~218 torneios já processados) ou flags CLI. Workflow: `update-classif.yml` (Dom/Seg 01:00 UTC). Corre pela sessão pública (ack, sem cookies); o Secret `DATAGOLF_SCORING_COOKIES` é só fallback — ver "Quem já corre sem cookies".
```bash
node scripts/scrape-classif-node.js --tclub 000 --tcode 10825
node scripts/scrape-classif-node.js --scope scripts/classif-scope.json --out public/data/pull-torneios-node.json
node scripts/scrape-classif-node.js --scope scripts/aroeira-2026-scope.json --concurrency 2
```

**pull-torneios.js** (`scripts/_archive/browser-console/`) — Browser Console em `scoring.datagolf.pt`. **Legacy** — usar `scrape-classif-node.js` para novos torneios. Mantido como fallback para casos em que Node não funciona (e.g. ad-hoc num torneio de clube com `ccode` desconhecido). Movido da raiz para `scripts/_archive/browser-console/` em 2026-06-23.

**fpg-download-whs-only.js** (`scripts/_archive/browser-console/`) — **LEGADO** (v4; substituído pelo WHS Node-puro do `fpg-scrape-node.js`). Browser Console em `scoring.fpg.pt/lists/PlayerWHS.aspx?no=52884`. Download ~2-5 min. Se a página refreshar, alterar `START_INDEX`. Movido da raiz em 2026-06-23.

**Utilitários** (todos em `scripts/`):
- `node scripts/make-scorecards-ui.js 52884` / `--all` — gera UI scorecards (= `npm run scorecards`)
- `node scripts/enrich-players.js` → `player-stats.json`
- `node scripts/merge-courses.js` — consolida campos duplicados
- `node scripts/find-tcodes.js` — varre ccode/tcode, imprime torneios (movido da raiz em 2026-06-23)
- `node scripts/validate-encoding.js` — valida encoding dos JSON

### Refresh de federados (`scrape-federados-node.js`)

Refresh COMPLETO de `public/data/federados.json` (~17,9k activos em 2026-09, `FedStat=9`)
via Node puro. Substitui o antigo `scrape-federados.js` (browser console).
Endpoint `POST /pt/FederatedsList_V2.aspx/HandicapsLST`, paginado a 100
(200+ → HTTP 500), ~180 páginas. Apanha fotos novas (paths antigos →
404), novos federados e mudanças de clube/HCP.

```bash
node scripts/scrape-federados-node.js                 # full refresh, grava só se mudou
node scripts/scrape-federados-node.js --check-only    # compara sem gravar
node scripts/scrape-federados-node.js --force         # grava mesmo sem alterações / parcial
node scripts/scrape-federados-node.js --max-pages 5   # debug (parcial — exige --force p/ gravar)
node scripts/scrape-federados-inativos.js             # script separado: federados-inativos.json (FedStat=7)
```

Corre pela sessão pública (gate `fedlist_v2`, sem cookies — ver "Quem já corre
sem cookies"); as cookies (`DATAGOLF_SCORING_COOKIES` / ficheiro
`api/.scoring-datagolf-cookies.json`) ficam só como fallback.
Compara byte-a-byte (ignorando timestamps) e tem guardas anti-overwrite (recusa
gravar 0 registos, run incompleto, ou perda >10% sem `--force`). Exit codes:
**0** = actualizado, **2** = sem alterações (não é erro), **1** = erro.
Workflow: `update-federados.yml` (Quarta 17:00 UTC).

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
  `scrape-classif-node.js --scope <esse ficheiro> --limit 80 --out <ficheiro-cauda dado por pull-torneios-tail.cjs> --concurrency 2`
  (`--limit` novo no scraper). Merge aditivo → o scope **auto-drena** a cada
  semana (à medida que ficam scrapeados, saem do scope no build seguinte) e a
  FPGPage passa a mostrar o leaderboard completo (lê `pull-torneios000..NNN`).
- **Automação:** regenerado no `update-data.yml` (a seguir a rebuild dos
  índices de campos), committa `recent-tournaments.json` + o scope.

---

### Pipeline de actualização de dados — arquitectura 2026-04-15

Três camadas de automação, escolhidas por onde fazem sentido:

**1. GitHub Actions (cloud, automático no fim-de-semana):**
- `update-drive.yml` (torneios públicos DRIVE/AQUAPOR)
- `update-data.yml` (WHS + scorecards dos jogadores seleccionados em players.json)
- `uskids-*.yml` (4 workflows USKids, 3 deles diários) + `update-uskids-rich-players.yml`
- Todos respeitam exit code 2 = "sem dados novos" → sem commit (não é erro)

**2. Scheduled Task Windows local (ao PC, 13:00 diário):**
- `scripts/setup-scheduled-task.ps1` regista tarefa
- Corre `scripts/fpg-scrape-node.js --all --concurrency 3` por default incremental (o `.bat` também passa `--new-only`, que o script ignora — é redundante)
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
# update-drive.yml — scrape de torneios (scoring.datagolf.pt)
- cron: '0 21 * * 5,6,0'   # 21:00 UTC Sex+Sáb+Dom

# update-data.yml — WHS/scorecards dos nossos jogadores (gate público fedhcp)
- cron: '5 0 * * 0,1'      # 00:05 UTC Dom+Seg — depois do cut SD da meia-noite
```

21:00 UTC = 21:00 Lisboa no inverno (WET, UTC+0) / 22:00 no verão (WEST,
UTC+1), após os torneios estarem carregados. O drive corre também à Sexta para
apanhar torneios que começam nesse dia. A tabela "GitHub Actions — estado" tem
os restantes.

### Scripts Node-puros criados 2026-04-15

Substituem a abordagem Playwright antiga. Desde 2026-08-30/09-15 vão
**primeiro pela sessão pública** (`scripts/lib/fpg-session.js`); as cookies de
env (`FPG_COOKIES`/`DATAGOLF_COOKIES` no fpg-scrape; `DATAGOLF_SCORING_COOKIES` no scrape-drive) ou de
`api/.datagolf-cookies.json` / `api/.scoring-datagolf-cookies.json` ficam como
fallback — ver "Quem já corre sem cookies".

#### `scripts/fpg-scrape-node.js`
Scraper de WHS + scorecards: gate público `fedhcp` (`PlayerWHS.aspx/HCPWhsFederLST`
+ `fed_hcp.aspx/ScoreCard`, sem login), com `my.fpg.pt/Home/PlayerWHS.aspx/*`
(cookies) de fallback.

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
- **ADICIONA:** inscritos em `inscricoes_nacionais.json` que faltem, com tag
  `inscrito-nacional` (vencem até o `hidden`; o `no-scrape` é-lhes retirado)

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

`scripts/run-scrape-drive-headless.js` implementa 3 níveis (⚠ legado — nenhum
workflow o usa; o `update-drive.yml` chama o `scrape-drive-node.js`, que aplica a
mesma semântica de exit 0/2/1, mais o 3 = FPG em baixo):

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
