# Auditoria de limpeza — 2026-05-17

Análise completa do projecto Golf Portugal (`src/`, `scripts/`, `public/data/`).
Objectivo: identificar código morto, ficheiros JSON órfãos e oportunidades
de melhoria.

---

## 1. Aplicado nesta sessão

### Resumo

1. **Fix de import partido** em `src/ui/InscricoesComponents.tsx`
2. **24 ficheiros movidos para `_archive_2026-05-17/`** (não apagados — preservados para consulta futura)
3. Testes: 132 passados, 0 falhas (mesmo da baseline)

### Correcção crítica: import partido em `InscricoesComponents.tsx`

**Antes:**
```ts
// src/ui/InscricoesComponents.tsx, linha 23
import type { InscricaoJogador, TorneioData, BdPlayer, PlayerStats, StatsDb }
  from "../nacionais/types";          //  ← path não existe (src/nacionais/)
```

**Depois:**
```ts
import type { InscricaoJogador, TorneioData, BdPlayer, PlayerStats, StatsDb }
  from "../pages/nacionais/types";    //  ← path correcto
```

O import era `import type` (apagado em runtime), por isso não dava erro
no Vite, mas o IDE/tsc não conseguia resolver os tipos. Confirmado:
`npm test` continua a passar com 132 testes (8 suites, 0 falhas).

---

## 2. Arquivados — ficheiros fonte mortos (`src/` → `_archive_2026-05-17/src/`)

Confirmado por `grep` exaustivo: nenhum destes ficheiros é importado em
qualquer lado do projecto (`src/`, `scripts/`, `api/`, `index.html`). São
módulos que ficaram para trás depois de refactorings.

| Caminho | Tamanho | Motivo |
|---------|---------|--------|
| `src/pages/kids2/.fuse_hidden0000000500000001` | 19 KB | Ficheiro temporário FUSE (cópia antiga de `data.ts`) |
| `src/data/KIDSdataLoaderV2.ts` | 387 B | Marcado `DEPRECATED` no próprio header; era re-export de KIDSdataLoader |
| `src/pages/NacionaisPage.tsx` | **66 KB** | Substituído por `NacionaisJovensPage`; o `App.tsx` já não lazy-importa |
| `src/hooks/usePlayerStats.ts` | 3.5 KB | Único consumidor era NacionaisPage |
| `src/pages/nacionais/AroeiraBurTable.tsx` | — | Único consumidor era NacionaisPage |
| `src/pages/nacionais/FieldIntelligence.tsx` | — | Único consumidor era NacionaisPage |
| `src/data/doralLegacyLoader.ts` | 7.7 KB | Sem imports |
| `src/data/fpgLoaders.ts` | 12 KB | Sem imports (a funcionalidade migrou para `nacional2026Loader`, `fpgUtils`, etc.) |
| `src/data/tournamentMerge.ts` | 2 KB | Sem imports |
| `src/utils/tournamentClassification.ts` | 3.5 KB | Sem imports |
| `src/hooks/useCachedFiles.ts` | 4 KB | Sem imports |
| `src/hooks/usePersistedState.ts` | 3.5 KB | Sem imports |
| `src/ui/TournLayout.tsx` | 2 KB | Sem imports |
| `src/ui/USKidsLink.tsx` | 1 KB | Sem imports |

**Total arquivado:** ~125 KB de código fonte morto.

**Manter:**
- `src/pages/nacionais/types.ts` — ainda usado por `InscricoesComponents.tsx`
  (depois do fix de path do ponto 1).
- `src/data/dataRegistry.ts` (67 KB) — não é importado, mas o seu propósito
  declarado é servir como documentação viva das fontes de dados. Decisão
  editorial: manter ou não.

**Status:** ✅ Movidos para `_archive_2026-05-17/src/` preservando a árvore
original (`src/data/`, `src/hooks/`, etc.). Para reverter qualquer um:
`Move-Item _archive_2026-05-17\src\<path> src\<path>`.

---

## 3. Arquivados — ficheiros JSON órfãos (`public/data/` → `_archive_2026-05-17/public-data/`)

Ficheiros que não são lidos por nenhum loader do app (verificado contra
patterns dinâmicos como `drive-data-YYYY-MM`, `aquapor-data-YYYY-MM`,
`uskids_torneios_completos(1..40)`, e shards declarados em manifestos).

| Ficheiro | Tamanho | Origem |
|---|---|---|
| `brjgt2431_contest_9.json` | 55 KB | Scrape único antigo (WJGC 12-13 Boys) |
| `fpg-calendario-drive-tour.json` | 1 KB | Output de `scripts/fpg-calendario.js` — script só escreve, não lê |
| `fpg-calendario-madeira.json` | 14 KB | idem |
| `fpg-calendario-santo-da-serra.json` | 5 KB | idem |
| `gg_champ_france_u12_filles_2025.json` | 133 KB | Scrape FFG GolfGenius não registado em `build-kids-tracked-names.js` |
| `gg_champ_france_u12_gar_ons_2025.json` | 170 KB | idem |
| `gg_internationaux_france_u21_filles_2026.json` | 86 KB | idem |
| `gg_junior_invitational_2026.json` | 143 KB | idem |
| `tournaments-index.json` | 664 KB | Metadados de inspecção gerados em 2026-05-05 |
| `tournaments-index-full.json` | 7.3 MB | idem (ficheiro completo, 18.400 entradas) |
| `uskids-flights-cache.json` | 6.2 MB | Cache antiga do fetcher — sem leitores |

**Total arquivado:** ~15 MB. ✅ Movidos.

---

## 4. Não relevante — falsos positivos verificados

Os seguintes ficheiros foram inicialmente marcados como suspeitos mas
**são carregados dinamicamente** e devem ficar:

- `drive-data-YYYY-MM.json` (≥40 ficheiros) — carregados pela função inline
  `loadAllFiles()` dentro de `src/pages/DrivePage.tsx` (linha 1175). A
  função `loadMonthlyTournaments()` em `fpgLoaders.ts` é um duplicado morto
  (nunca chamada — verificado por `grep`); seguro apagar `fpgLoaders.ts`.
- `aquapor-data-YYYY-MM.json` (≥14 ficheiros) — idem, mesma `loadAllFiles`
  em DrivePage.
- `uskids_torneios_completos(1..40).json` — `USKIDSPage.tsx` itera de 1 a 40.
- `juniors-tournaments-00.json` / `-01.json` — declarados em
  `juniors-tournaments.json` como shards do manifesto.

---

## 4b. Duplicação identificada (extra)

`src/pages/DrivePage.tsx` (linha 1175) define inline `loadAllFiles(prefix, forceAqapor, startYear)`
que itera meses e carrega `drive-data-YYYY-MM.json` / `aquapor-data-YYYY-MM.json`.
A função `loadMonthlyTournaments(prefix, startYear)` em `src/data/fpgLoaders.ts`
faz essencialmente o mesmo (mais simples, sem `forceAqapor` nem painel meta).
Como `loadMonthlyTournaments` nunca é chamada, o ficheiro `fpgLoaders.ts`
pode ser removido inteiramente sem regressão.

Oportunidade de refactor futuro: extrair `loadAllFiles` de DrivePage para
um módulo partilhado (`src/data/monthlyLoader.ts`) se outra página vier
a precisar do mesmo padrão.

---

## 5. Recomendação de ordem

1. Aplicar pontos 2 e 3 acima
2. Correr `npm test` (~10s)
3. Correr `npm run build` (lento em sandbox, OK localmente)
4. Re-correr o teste de TypeScript completo: `npx tsc --noEmit` — esperar
   que detecte exactamente 0 erros (já que `noUnusedLocals: true` e
   `noUnusedParameters: true` estão ligados no `tsconfig.json` e o build
   actual já passava).
5. Avaliar manualmente `src/data/dataRegistry.ts` (67 KB) — manter como
   documentação viva ou apagar?

---

## 6. Verificação automática

A análise foi feita com:

```python
# Para cada .json em public/data/, verificar se o nome ou stem aparece
# em src/, scripts/, api/, index.html, vite.config.ts. Excluir patterns
# dinâmicos conhecidos (loadMonthlyTournaments, manifest shards, etc.).
```

Para o `src/`, a verificação foi por `Grep` directa procurando
`from ["'][^"']*(?:basename)["']` em todo o repositório.
