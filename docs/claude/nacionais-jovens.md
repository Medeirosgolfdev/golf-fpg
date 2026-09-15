# Campeões Nacionais de Jovens (`/titulos/nacional`)

> Detalhe tirado do CLAUDE.md a 2026-09-15 (o CLAUDE.md fica só com o essencial e
> aponta para aqui). Datas entre parênteses = quando a regra ou a medição foi feita.

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

**Drive Tour Finals como Nacional de facto:** o `classifyTournament` de
`jovensAnaliseData.ts` já trata `Final/Grande Final Drive Tour` como tipo
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
`jovensAnaliseData.ts`), pois essa regra usa o `fedCode` para ir buscar a
nacionalidade ao `players-nationality.json`; sem fed_code o jogador é
considerado elegível.

**Workaround actual (hoje na tab `/titulos/nacional` da `TitulosPage`; a `NacionaisJovensPage` foi removida):** capturamos `player_gender` no
scrape e populamos `player.sex` directamente no registo (não no playersDB
sintético — abandonámos essa abordagem porque deixava `synth-XXXX` visíveis na
UI). O `playerSex` (em `jovensAnaliseData.ts`) prefere `p.sex`
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

A tab `/titulos/nacional` (`TitulosPage`, antes `NacionaisJovensPage`) usa `splitByEscalao={true}`. `/FPG/jovens` continua
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
- 2024: 10802-10808 (sem Sub-12; só Sub-14/16/18 H+S + Sub-25)

**Sub-10 NÃO existiu como Nacional individual em 2007-2011** — gap real, não há
nada para scrapar.

**2025 Sub-10/12 foram organizados pela FPG Sul (ccode=988), não pela FPG
central (ccode=000)** — tabela TournamentsLST com filtro `ClubCode='000'`
deixa-os de fora. É preciso pesquisar com `ClubCode='0'` (todos) ou
explicitamente `ClubCode='988'` para os apanhar.
