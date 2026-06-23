# Sumário de sessão — 2026-05-09

## O que foi feito

### 1. Pipeline scrape NextCaddy — descoberta + scrape completo

**Discovered:** o NextCaddy expõe descoberta por federação via
`POST /competiciones-club/{code}` com body `anio=YYYY`. Após varrer todos os
códigos plausíveis, confirmei **apenas 4 federações regionais** usam a
plataforma (as outras 13 federações territoriais espanholas têm sistemas
próprios não-NextCaddy):

| Código | Federação | Tours | Status |
|---|---|---:|:---:|
| `am00` | Real Federación Andaluza | 215 | ✓ scrapado |
| `cm00` | Real Federación Madrileña | 427 | ✓ scrapado |
| `cp00` | Real Federación Canaria | 191 | ✓ NOVO |
| `7700` | Federación Castilla y León | 490 | ✓ NOVO |

**Scraper rebuild (`scripts/scrape-nextcaddy.js`):** apanha agora **TUDO**
o que NextCaddy expõe por torneio:
- meta + leaderboard (categorias com nomes completos via dropdown)
- inscritos
- horarios (tee times — antes era script separado)
- estadísticas + scoreTypes + roundIds
- scorecards hbh por jogador (par/SI/metros + scores hole-by-hole)
- PDFs anexos (banderas, results, etc.)
- detecção de leaderboardPdfOnly (101/191 cp00 são só PDF)

**Endpoints inúteis confirmados via `/js/routing` (143 rotas):**
`getListadoResultados` (sempre "Sin resultados publicados"),
`tour/clasificados` (No data), `renderStats` (UI shell vazia),
`tour-widget` (só wrapper), `tvirtual/recuperar-resultados` (auth needed).

### 2. Datas dos NC tours

Os ficheiros `nextcaddy/{tid}.json` não têm `dateIso` (a página
`/tour/{id}` não devolve data). Adicionado `NC_DATE_LOOKUP` em
`build-rfegolf-rivals.js`: lê os 22 scope files em
`scripts/nextcaddy-scope-*.json` e cria Map `tourId → "YYYY-MM-DD"`
(1.778 dates carregadas).

### 3. Scratch + Handicap separados

Quando uma categoria do leaderboard menciona "Scratch" ou "Handicap" no
nome, o tid agora ganha sufixo `_sc` ou `_hcp`:
- `nc60051_alevín_sc` (Scratch)
- `nc55319_benjamín_hcp` (Handicap)

Antes ambas competiam pelo mesmo tid `nc{id}_{age}` e a segunda
sobrescrevia a primeira.

### 4. Filtros de display de tids — múltiplos pontos sincronizados

`getCanonicalTids`, `nPlayed`, `RivalDetail.tournResults`, `processRfegolfRivals`
todos passaram a aceitar tids com `pos` OR `total` OR `tp` OR `rd`
(antes só com `rd`, perdendo torneios PDF-only ou só leaderboard agregado).

`nPlayed` agora delega para `getCanonicalTids(p).size` — fonte única de
verdade para sidebar↔página.

### 5. Field size para NC tours

`processRfegolfRivals` em `KIDSdataLoader.ts` agora popula `uskFieldSizes`
para tids `nc*` (count de players válidos). Antes só USKids tinha "X jogadores"
sob título.

### 6. Novo lookup de licença → nome canónico

`build-licencia-dob-lookup.js` corrige swap de `licencia`/`nivel` que
acontecia em ~5364 entradas NextCaddy (algumas linhas têm a licença no
campo nivel e vice-versa).

### 7. Split do KIDSPage.tsx (3518 → 1372 linhas, -61%)

Para resolver bug recorrente de truncação do Edit em ficheiros grandes,
extraídos para `src/pages/kids/`:

| Ficheiro | Linhas |
|---|---:|
| `KIDSPage.tsx` (main wrapper + RivaisIntlContent) | 1372 |
| `kids/RivalDetail.tsx` (1158 linhas, painel direito enorme) | 1190 |
| `kids/dobInference.ts` (computeDobInfo + escalaoIntl + ...) | 446 |
| `kids/AnaliseSection.tsx` (já existia) | 439 |
| `kids/RivalCharts.tsx` (3 charts) | 217 |
| `kids/RivaisSidebar.tsx` (sidebar de rivais) | 198 |
| `kids/MemberHistTable.tsx` | 118 |
| `kids/courseScorecards.ts` (WJGC26/EOWAGR25 cards) | 113 |
| `kids/H2HSortableTable.tsx` (já existia) | 94 |
| `kids/TournScorecard.tsx` (já existia) | 74 |
| `kids/types.ts` (já existia) | 33 |
| `kids/tournDef.ts` (T const, criado para resolver circular import) | 24 |

KIDSPage exporta 34 helpers/types/consts. Resolvido circular import
`KIDSPage ↔ dobInference` movendo `T` (tournament defs) para
`kids/tournDef.ts`.

### 8. Página `/rfeg` — vista de federações

Nova vista `RFEGFederationsView` em `src/pages/rfeg/FederationsView.tsx`
mostra as 19 federações territoriais com:
- 4 NextCaddy (rastreadas) — tabela com tours, código NC, prefixo licença
- 13 sites próprios (não rastreadas) — links oficiais
- 2 delegações (Ceuta, Melilla)

Acesso: sidebar do `/rfeg` → entry "🏛️ Federaciones de Golf España"
(logo abaixo de "📚 Categorías de edad").

## Stats finais

- **2.257 torneios** no `rfegolf-resultats-index.json` (era 2.071)
- **381 torneios** em `rfegolf-rivals.json` (66 LGS + 315 NC, era 239)
- **13.771 entries** em `licencia-dob-lookup.json` (+1.380)
- **19.549 entries** em `licencia-hcp-lookup.json` (+1.719)
- **133 testes vitest passam**
- 0 erros TS críticos em src/pages/{KIDSPage, kids/*, RFEGPage, rfeg/*}

## Bug recorrente — Edit truncation

Confirmado: o tool `Edit` consistentemente corta o tail de ficheiros
grandes (>1500 linhas) e/ou enche com null bytes (`\x00`) após a edição.
Workarounds usados nesta sessão:
- Para ficheiros grandes: usar `Write` (rewrite total) em vez de `Edit`
- Validar SEMPRE com `wc -l` + `tail` depois de cada Edit
- Reparar via Python (`d.rstrip(b'\x00').replace(b'\x00', b'')` + append)
- Aplicar `tsc --noEmit` (não só vitest) para apanhar truncations que
  vitest não exerce

Ocorreu múltiplas vezes em: KIDSPage.tsx, dobInference.ts, RivalDetail.tsx,
courseScorecards.ts, RFEGPage.tsx, build-rfegolf-rivals.js,
scrape-nextcaddy.js. Todos restaurados.

## Pendências para próxima sessão

### Alto valor — investigar **Federación Catalana** (`fcgolf.cat`)

A maior federação espanhola em jogadores federados, mas **não usa NextCaddy**.
Verificar se o site `fcgolf.cat` tem leaderboards estruturados/scrappable
(API, JSON, RSS) ou se é só HTML/PDFs estáticos. Alvo: scrape de torneios
juvenis catalães para enriquecer o tracker.

### Médio valor — outras federações regionais

Mesma investigação para Aragón, Asturias, Baleares, Cantabria, C-La Mancha,
Extremadura, Galicia, Murcia, Navarra, Rioja, Valencia, País Vasco. Se
alguma usa livegolfscoring (já temos pipeline) é fácil de integrar.

### Médio valor — pdf-parse para 101 cp00 PDF-only

101 dos 191 torneios cp00 (Canárias) só publicaram resultados como PDF
anexo (`/uploads/...banderas...pdf`). Os PDFs estão capturados em
`pdfs[]` de cada JSON. Usar `pdf-parse` (já no projecto) para extrair
tabelas de classificação e enriquecer `rfegolf-rivals.json`.

### Baixo valor — filtro de federação na UI RFEGPage

Adicionar dropdown "Federação" no sidebar do `/rfeg` que filtra torneios
por prefixo do `courseCode` (`AM`, `CM`, `CP`, `77`). Permite ver só
torneios de uma federação específica. Campo `federation` precisa de ser
adicionado a cada entry no `rfegolf-resultats-index.json` (derivado do
prefixo do `courseCode` ou da licença do primeiro inscrito).

### Baixo valor — completar split KIDSPage

`RivalDetail.tsx` é agora o maior (1190 linhas). Extrair os helpers internos
+ HERO card seria mais alguns ficheiros. Ganho marginal — provavelmente
não vale o risco.

## Ficheiros críticos para conhecer

```
public/data/rfegolf-rivals.json          — 381 torneios consumidos por KIDSpage
public/data/rfegolf-resultats-index.json — 2.257 torneios consumidos por RFEGPage
public/data/spain-players.json           — 13.771 jogadores espanhois (DOB+sex+club)
public/data/licencia-hcp-lookup.json     — 19.549 licenças com hcp+source

scripts/build-rfegolf-rivals.js          — alimenta rfegolf-rivals.json
scripts/build-rfegolf-index.js           — alimenta rfegolf-resultats-index.json
scripts/scrape-nextcaddy.js              — scrape NextCaddy (todas 4 federações)
scripts/nextcaddy-scope-{am00,cm00,cp00,7700}.json — scopes de discovery

src/pages/KIDSPage.tsx                   — main wrapper (1372 lns)
src/pages/kids/RivalDetail.tsx           — painel detalhe rival (1190 lns)
src/pages/kids/dobInference.ts           — DOB inference (446 lns)
src/pages/kids/tournDef.ts               — T const + TournDef interface
src/pages/RFEGPage.tsx                   — main RFEG page (2106 lns)
src/pages/rfeg/FederationsView.tsx       — 19 federações (NOVO)
```

## Memórias guardadas (`MEMORY.md`)

- `fpg_auth_breakthrough.md` — Chrome 90 + cookies para FPG
- `pipeline_automation.md` — pipelines Node-puros FPG
- `escalao_fpg_rule.md` — escalão year-based
- `spain_pipeline.md` — pipeline scrape Espanha (3 fontes)
- `nextcaddy_scraper_v2.md` — 4 campos novos + 4 federações ✓
- (outras + 19 entradas em MEMORY.md)
