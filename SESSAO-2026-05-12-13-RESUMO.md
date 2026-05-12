# Sessão 2026-05-12 / 2026-05-13 — Resumo

> USKids Local Tour Portugal + El Prat 2023 + KIKO Matos Coelho + Manuel multi-mid + bugfixes scorecard.

---

## Tl;dr

Partimos de **uma pergunta**: o Dmitrii Elchaninov jogou Local Tours em Portugal em 2023; quem mais lá jogou e como integramos isso?

Acabámos com:

- **17 torneios novos** integrados na USKidsPage (6 do PT 2023 + 11 de 2016/2017 + El Prat 2023)
- **28 jogadores novos** na cache USKids (27 do PT 2023 + KIKO Matos Coelho)
- **Manuel multi-mid resolvido**: descobrimos que o Manuel jogou em 2023 com uma **conta USKids diferente** (mid 605933) — agora ambos os mids (legacy + actual 630106) ficam ligados como o mesmo jogador
- **Endpoint correcto descoberto** via Chrome DevTools: POST + t=1 + pt=undefined&jbgr&c=1 (o nosso código antigo usava GET + t=0 que silenciosamente devolvia vazio para torneios antigos)
- **3 bugfixes na UI do scorecard**
- **Tudo pushed para `origin/main`** (commit `0006f99c0`)

---

## 1. Como começou

Tarefa: "o Dmitrii jogou Local Tours em Portugal em 2023... acontece que não temos esses jogadores referenciados, então quero que verifiques os memberIDs desses jogadores".

Identificámos 6 tcodes do PT Local Tour 2023:

| tcode | Torneio | Data |
|---|---|---|
| 13702 | Dolce Campo Real | 22/Jan/2023 |
| 13703 | Ribagolfe Oaks | 28/Jan/2023 |
| 13704 | Ribagolfe Lakes | 29/Jan/2023 |
| 13705 | Ribagolfe Oaks | 25/Fev/2023 |
| 13706 | Ribagolfe Lakes | 26/Fev/2023 |
| 13707 | Dolce Campo Real (Tour Championship) | 16/Abr/2023 |

---

## 2. Descoberta crítica do endpoint

Tentámos primeiro o nosso `fetch-uskids-member-history.js` mas devolvia 0 jogadores para estes tcodes antigos. Andei às voltas com fingerprint matching de strokes para resolver nomes — **3-4 horas perdidas**.

Solução veio quando fui ao **Chrome DevTools → Network** ver o pedido real:

| Antes (errado) | Depois (correcto) |
|---|---|
| `GET /LinksAJAX.aspx?op=GetPlayerTeeTimes&f=X&r=1&p=1&t=0` | `POST /LinksAJAX.aspx?op=GetPlayerTeeTimes&f=X&r=1&p=1&t=1&pt=undefined&jbgr={timestamp}&c=1` |
| GET | POST |
| `t=0` (live tee times — falha para torneios encerrados) | `t=1` (final results — universal) |
| sem params extra | `pt=undefined&jbgr={Date.now()}&c=1` obrigatórios |

**Lição:** quando uma página pública mostra dados que a API não retorna, abrir DevTools → Network → ver o pedido real é o caminho rápido. Andei a contornar via fingerprints quando bastava ter feito isto na primeira hora.

Este patch foi aplicado a `scripts/fetch-uskids-member-history.js` (com fallback para t=0). Próximos runs do workflow `uskids-member-history.yml` vão apanhar nomes em falta nos 1601 mids que ainda têm `name="?"` na cache.

---

## 3. Pipeline construído

Padrão reutilizável (3 scripts por "lote de torneios"):

1. **`browser-scrape-{NAME}.js`** — colar em F12 Chrome, descarrega JSON consolidado
2. **`integrate-{NAME}.js`** — Node, integra no `public/data/uskids_torneios_completos(N).json` + actualiza contadores
3. **`build-member-history-slim.js`** — regenera o slim para a app

Pipelines criados:

| Pipeline | Browser | Integrate | Resultado |
|---|---|---|---|
| PT 2023 (6 tcodes) | `browser-scrape-pt-local-tour-completos.js` | `split-pt-local-tour-completos.js` | Ficheiros 23-28 |
| El Prat 2023 Boys 8/9/10 | `browser-scrape-elprat-2023.js` | `integrate-elprat-2023.js` | Ficheiro 29 |
| PT 2016+2017 (11 tcodes) | `browser-scrape-pt-local-tour-2016-2017.js` | `integrate-pt-local-tour-2016-2017.js` | Ficheiros 30-40 |
| KIKO Matos Coelho (mid 471043) | `browser-scrape-kiko.js` | `integrate-kiko-matos-coelho.js` | Member-history-048 |

Total: **18 ficheiros `uskids_torneios_completos`** novos + 2 ficheiros member-history novos.

---

## 4. Manuel multi-mid

A descoberta mais importante para a integridade dos dados:

**Manuel jogou em 2023 com conta USKids ANTIGA** (mid `605933`), validado via:
1. `GetTournamentPlayers&t=15573&f=198807` → lista de 73 mids do Boys 9 El Prat 2023
2. Scan via `GetMemberTournamentResults&m={mid}` → match em `(Boys 9, gross 44, place 3)` ✓
3. Mid 605933 tem **apenas 1 torneio** no histórico (El Prat 2023) — conta abandonada depois

Implementação:

```ts
// src/constants/manuel.ts
export const MANUEL_PLAYER_IDS: readonly string[] = [
  "630106",  // conta actual (Manuel Goulartt Medeiros, Madeira / Santo da Serra)
  "605933",  // conta legacy (única aparição: El Prat 2023, Boys 9, gross 44, place 3)
];
export function isManuelUskidsMid(mid): boolean { ... }
```

`isManuel()` actualizado para apanhar ambos mids via `memberId` / `uskidsId` props.

Documentado em `CLAUDE.md`:
- Tabela de IDs distingue "actual" vs "legacy"
- Secção "Armadilhas" agora diz **"Manuel tem 4 variantes de nome + 2 contas USKids"**

**Nome USKids antigo:** `"Manuel Francisco Goulartt De Medeiros"` (apanhado por `isManuelByName()` que já considerava todas as variantes).

---

## 5. Bugfixes na UI do scorecard

Encontrei e corrigi 3 bugs visíveis nos scorecards:

### Bug 1: `parLabelColSpan={6}` hardcoded
- **Local:** `src/ui/TabResultados.tsx` linha 193
- **Sintoma:** linhas "m" e "PAR" apareciam deslocadas 1-2 colunas à direita em **TODOS** os 39 torneios da USKidsPage
- **Fix:** removido hardcoded — o `ScorecardLB` recalcula dinamicamente em função de `5 - hidden + showAge`

### Bug 2: alinhamento par/metros em flights 9H
- **Local:** `src/ui/converterTorneioCompleto.ts` linhas 65-94
- **Sintoma:** em flights 9H (Boys 6-10), `holes[]` vinha com 18 entries no signupanytime (yards completos do percurso), mas só 9 com `par > 0` — metros e par filtrados separadamente desalinhavam
- **Fix:** filtrar AMBOS pelo mesmo `playedIdx` (índices onde par > 0)

### Bug 3: campo do torneio errado
- **Local:** `src/ui/converterTorneioCompleto.ts` linhas 124-137
- **Sintoma:** Ribagolfe Lakes 13704 aparecia como "Quinta do Peru Golf and Country Club" (primeiro curso na lista global)
- **Fix:** usar o `course_name` dominante entre flights (via tally), não o primeiro `courses[]` global

---

## 6. Estado da cache USKids member-history

| Antes | Depois |
|---|---|
| 46 ficheiros, 6.734 mids | **48 ficheiros**, 6.762 mids |
| 1.602 sem nome (23.8%) | 1.601 sem nome (Nikita 584158 agora resolvido) |
| **0 jogadores do PT Local Tour 2023** | **27 mids novos** em `047.json` |
| **0 do KIKO** | KIKO no `048.json` (14 torneios USKids) |

O `uskids-member-history-slim.json` (que a KIDSpage consome) agora tem **2.678 jogadores nomeados** e **272.469 entradas** jogador×torneio.

---

## 7. Robustez para o futuro

### Smart bump dos contadores

Todos os 3 scripts integrate (`split-pt-local-tour-completos.js`, `integrate-elprat-2023.js`, `integrate-pt-local-tour-2016-2017.js`) agora têm:

```js
const existing = glob.sync(...uskids_torneios_completos(*).json...)
  .map(f => parseInt(f.match(/\((\d+)\)/)?.[1] || '0'));
const finalCount = Math.max(existing, NEW_COUNT);  // NUNCA baixa
```

Razão: numa altura desta sessão re-corri o `integrate-elprat-2023.js --apply` e ele baixou o contador de 40 → 29, "escondendo" os 11 ficheiros PT 2016/2017. Agora isso não pode acontecer.

### Workflows USKids continuam OK

Os 5 fixes locais estão seguros contra futuros workflow runs porque:
- O workflow lê + actualiza `public/data-archive/uskids-member-history-*.json` (preserva nomes existentes via merge)
- Manuel multi-mid e bugfixes UI estão em código TS (workflow não toca)
- Os 18 ficheiros `uskids_torneios_completos` são curados manualmente (workflow não toca)

### `output/` rebalanceado

`output/data-archive/uskids-member-history-001.json` tinha **305 MB** (acima do limite GitHub de 100 MB). Implementei modo `--from-chunks` no `split-member-history.js`:

```bash
node scripts/split-member-history.js --from-chunks --archive-dir=output/data-archive --target-mb=80
```

Consolidou 47 chunks (610 MB total, com duplicação massiva do campo `torneios`) → **2 chunks** (95.4 MB total, sem perda de dados). Os 80% de redução vêm de eliminar a duplicação do envelope `torneios` que cada chunk repetia.

---

## 8. Pendente (próxima sessão)

1. **Verificar deploy Vercel** — em `https://golf-fpg.vercel.app/uskids` confirmar que os 17 torneios PT Local Tour aparecem (2016/2017/2023)
2. **Validar Manuel multi-mid em prática** — na KIDSpage, ver se os jogadores do El Prat 2023 aparecem ligados ao perfil dele
3. **Resolver os 1.601 nomes "?" restantes** — agora que o `fetch-uskids-member-history.js` está patched (POST + t=1), próximos runs do workflow `uskids-member-history.yml` vão resolver progressivamente nomes de tcodes antigos
4. **Considerar Git LFS** — `output/data-archive/uskids-member-history-001.json` está nos 80 MB; vai voltar a passar 100 MB quando a cache crescer mais. Git LFS é a solução durável
5. **Cleanup dos `parLabelColSpan` noutros consumidores** — DrivePage, AdmissionsTab, etc. podem ter o mesmo bug se algum hardcoded outro valor

---

## 9. Aprendizagens

1. **DevTools Network é a fonte de verdade.** Quando uma página mostra dados mas a API não devolve, ver o pedido real — não tentar adivinhar parâmetros nem fazer fingerprint matching elaborado.
2. **Validar com 4 critérios independentes.** O mid antigo do Manuel (605933) ficou confirmado por: (a) Boys 9, (b) gross 44, (c) place 3, (d) único torneio na carreira — qualquer um sozinho podia ser coincidência; os 4 juntos não.
3. **Smart bump em qualquer counter.** Para qualquer contador shared entre scripts, sempre `Math.max(actual, desired)` em vez de hardcoded — evita regressões.
4. **`--from-chunks` quando há duplicação por envelope.** Quando os chunks têm um campo partilhado grande duplicado em cada, consolidar+redistribuir reduz brutalmente.
5. **Aceitar upstream para JSONs gerados em conflitos de rebase.** Workflows do GitHub Actions regeneram esses ficheiros — não vale fundir manualmente, melhor é tomar a versão fresca e re-aplicar os fixes locais via scripts.

---

## 10. Commits no remote

```
0006f99c0 (HEAD -> main, origin/main) Sessão 2026-05-12/13: USKids PT Local Tour 2016/2017/2023 + El Prat + KIKO + Manuel multi-mid + bugfixes UI + chunks rebalanceados
5bd941901 data: histórico USKids [2026-05-12 19:21 UTC]
```

120 ficheiros modificados, 135.683 inserções, 14.869.617 deleções (consolidação dos chunks output/).

---

*Resumo gerado 2026-05-13.*
