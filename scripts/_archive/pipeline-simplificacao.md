# Pipeline FPG — Diagnóstico e Simplificação

## Situação Actual: O que cada script faz

### Fluxo completo (7 passos no `golf-all.js`)

```
1. Login (Playwright)          ← JÁ NÃO FUNCIONA
2. Download WHS list           ← JÁ NÃO FUNCIONA (Playwright)
3. Download Scorecards         ← JÁ NÃO FUNCIONA (Playwright)
4. Render (make-scorecards-ui.js) → gera data.json por jogador
5. Sync players.json           → actualiza HCP, clube, escalão
6. Enrich (enrich-players.js)  → gera player-stats.json
7. Extract courses             → gera away-courses.json
```

Os passos 1–3 usam Playwright para automatizar o browser. O site já não permite isto, portanto só funcionam com `--skip-download` (passos 4–7).

### Scripts de recolha alternativos (consola do browser)

| Script | Site | Endpoint API | Schema | Tem `new_handicap`? |
|---|---|---|---|---|
| `fpg-browser-download.js` | scoring.fpg.pt | `ResultsLST` | **Schema 2** | ❌ Não |
| `fpg-download-myfpg.js` | my.fpg.pt | `ResultsLST` | **Schema 2** | ❌ Não |
| `fpg-bridge.js` | scoring.fpg.pt | `HCPWhsFederLST` | **Schema 1** | ✅ Sim |

### Scripts de processamento (pós-download)

| Script | O que faz | Input | Output |
|---|---|---|---|
| `fpg-import.js` | Copia ficheiros dos Downloads → output/ | whs-list.json + scorecards-all.json | output/\<fed\>/ |
| `make-scorecards-ui.js` | Processa rounds, eclectic, hole stats | output/\<fed\>/ | analysis/data.json |
| `enrich-players.js` | Stats para sidebar/lista | output/ + data.json | player-stats.json |
| `extract-courses.js` | Campos internacionais | output/*/scorecards/ | away-courses.json |
| `golf-all.js --sync-players` | Actualiza players.json | data.json / whs-list.json | players.json |

---

## Porque é que o HCP aparece errado

### A raiz: Schema 1 vs Schema 2

**Schema 1** (`HCPWhsFederLST` em scoring.fpg.pt):
- Campo `new_handicap` = HCP **pós-ronda** (autoritativo, oficial)
- Campo `prev_handicap` = HCP antes de jogar
- Campos `calc_*` = detalhes do cálculo WHS

**Schema 2** (`ResultsLST` em scoring.fpg.pt ou my.fpg.pt):
- Campo `exact_hcp` = HCP **pré-ronda** (antes de jogar)
- **Não existe `new_handicap`**
- `calculated_exact_hcp` = também pré-ronda

### O que o código faz para compensar (em `process-data.js`)

1. **Encadeamento**: `new_handicap[ronda N]` = `exact_hcp[ronda N+1]`
   - Funciona para todas as rondas **excepto a mais recente**
2. **Cálculo WHS**: para a última ronda, calcula a média dos N melhores SDs
   - É uma **aproximação** — pode divergir do oficial se a FPG aplicar soft/hard cap

### 3 cenários que causam HCP errado

**Cenário A — Jogador Schema 2 sem rondas recentes suficientes:**
Se tem <3 rondas qualificativas, o fallback usa `exact_hcp` (pré-ronda) → mostra HCP desactualizado.

**Cenário B — Fallback do sync-players:**
Quando não existe `data.json`, o sync lê directamente do `whs-list.json` e usa `exact_hcp` como último recurso → mostra HCP pré-ronda da última ronda jogada.

**Cenário C — Mix de schemas entre jogadores:**
Jogadores descarregados em alturas diferentes, uns via Schema 1 (correcto), outros via Schema 2 (aproximação) → inconsistência na lista.

---

## Proposta de Simplificação

### Estratégia: Schema 1 via consola + pipeline automático

O `fpg-bridge.js` já prova que é possível chamar `HCPWhsFederLST` (Schema 1) a partir da consola do browser. A ideia é:

1. **Um único script de consola** que usa o endpoint Schema 1 (`HCPWhsFederLST`) + scorecards
2. **Um único comando Node** que faz tudo o resto (import + render + sync + enrich)

### Novo fluxo (2 passos em vez de 5+)

```
PASSO 1 (browser):  Cola script na consola de scoring.fpg.pt
                    → Descarrega whs-list-<fed>.json + scorecards-<fed>.json

PASSO 2 (terminal): node pipeline.js <fed> [<fed> ...]
                    → Import + Render + Sync + Enrich + Extract (tudo junto)
```

### O que muda no script de consola

O `fpg-browser-download.js` actual usa `PlayerResults.aspx/ResultsLST` (Schema 2).
Deve ser alterado para usar `PlayerWHS.aspx/HCPWhsFederLST` (Schema 1):

```javascript
// ANTES (Schema 2 — sem new_handicap):
fetch(`PlayerResults.aspx/ResultsLST?fed_code=${FED}&...`)

// DEPOIS (Schema 1 — com new_handicap):
fetch(`PlayerWHS.aspx/HCPWhsFederLST?fed_code=${FED}&...`)
```

**Nota importante**: é preciso testar se `HCPWhsFederLST` ainda responde na consola de `scoring.fpg.pt`. Se sim, problema resolvido. Se não (a FPG pode ter desactivado), mantemos Schema 2 mas com a derivação WHS já implementada.

Para os scorecards, o endpoint `PlayerWHS.aspx/ScoreCard` deve funcionar da mesma forma.

### O que muda no pipeline Node

Fundir `fpg-import.js` + passos 4-7 do `golf-all.js` num único script:

```
node pipeline.js 52884 49085
  ├─ 1. Import: localiza ficheiros nos Downloads, copia para output/
  ├─ 2. Render: chama make-scorecards-ui.js → gera data.json
  ├─ 3. Sync:   actualiza players.json (HCP, clube, escalão)
  ├─ 4. Enrich: gera player-stats.json
  ├─ 5. Extract: gera away-courses.json
  └─ 6. Copia para public/data/
```

Basicamente, é o `golf-all.js --skip-download` + `fpg-import.js` fundidos num só.

### Scripts a manter vs eliminar

| Script | Decisão | Razão |
|---|---|---|
| `fpg-browser-download.js` | **Actualizar** → usar Schema 1 | Passa a ser o único método de recolha |
| `pipeline.js` (novo) | **Criar** | Funde import + render + sync + enrich |
| `golf-all.js` | **Reformar** | Remover passos 1-3 (Playwright), manter 4-7 como `pipeline.js` |
| `fpg-download-myfpg.js` | **Eliminar** | Redundante (Schema 2, my.fpg.pt) |
| `fpg-import.js` | **Absorver** no pipeline | Já não é necessário separado |
| `fpg-bridge.js` | **Eliminar** | Abordagem servidor local desnecessária |
| `login.js` | **Eliminar** | Sem Playwright, não é preciso |
| `session.json` | **Eliminar** | Idem |
| `test-fpg.js`, `test-fpg2.js` | **Eliminar** | Scripts de diagnóstico, já não relevantes |
| `test-dual-schema.js` | **Manter** como diagnóstico | Útil para debug de problemas de HCP |
| `enrich-players.js` | **Manter** (chamado pelo pipeline) | Gera player-stats.json |
| `make-scorecards-ui.js` | **Manter** (chamado pelo pipeline) | Core do processamento |
| `extract-courses.js` | **Manter** (chamado pelo pipeline) | Campos internacionais |

### Resultado final: rotina simplificada

```
1. Abre scoring.fpg.pt/lists/PlayerWHS.aspx?no=52884
2. F12 → Console → cola o script → espera download
3. (repete para cada jogador)
4. node pipeline.js 52884 49085 ...
5. git commit + push (se aplicável)
```

Se quiseres actualizar vários jogadores de uma vez, o script de consola pode ser adaptado para aceitar uma lista de federados e processar sequencialmente (como o `fpg-bridge.js` já fazia).

---

## Próximos passos recomendados

1. **Testar** se `HCPWhsFederLST` ainda responde na consola de scoring.fpg.pt
2. Se sim → actualizar `fpg-browser-download.js` para Schema 1
3. Criar `pipeline.js` (fundir import + golf-all --skip-download)
4. Limpar scripts obsoletos
5. Actualizar documentação/README
