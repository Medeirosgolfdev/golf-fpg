# HANDOFF — Próxima sessão

> Documento de continuidade. Lê isto primeiro ao recomeçar uma sessão.
> Última actualização: 2026-05-13 (sessão PT Local Tour + KIKO + Manuel multi-mid).

---

## 1. Onde começar

```powershell
cd C:\golf-fpg
git status               # confirmar working tree limpo
git pull --rebase        # incorporar workflows nocturnos
npm test                 # 139 testes devem passar
```

Se conflitos no `git pull` em ficheiros JSON gerados (workflow USKids actualiza
`uskids-member-history-*.json` e `uskids-member-history-slim.json`):

```powershell
git checkout --ours public/data-archive/uskids-member-history-001.json
git checkout --ours public/data/uskids-member-history-slim.json
git add .
git rebase --continue
```

E depois re-aplicar fixes locais via scripts (`merge-pt-local-tour-to-cache.js
--apply`, `integrate-kiko-matos-coelho.js --apply`, `build-member-history-slim.js`).

---

## 2. O que está consolidado neste momento

### Manuel — 2 contas USKids

| Conta | mid | Aparições | Notas |
|---|---|---|---|
| Actual | `630106` | Activa, várias temporadas | Manuel Goulartt Medeiros, Santo da Serra |
| Legacy | `605933` | 1 só torneio (El Prat 2023, Boys 9, gross 44, place 3) | Conta abandonada. Nome USKids antigo: "Manuel Francisco Goulartt De Medeiros" |

Ambos em `MANUEL_PLAYER_IDS` em `src/constants/manuel.ts`. `isManuel()` apanha
ambos.

### USKids torneios completos: 40 ficheiros

`public/data/uskids_torneios_completos(1..40).json` (`TORNEIOS_COMPLETOS_COUNT = 40`
em `src/pages/USKIDSPage.tsx` linha 423 + `src/data/KIDSdataLoader.ts` linha 1883).

Distribuição:
- **(1..22)**: torneios flagship internacionais (Marco Simone, Venice, Europeu, World, Doral, etc.)
- **(23..28)**: USKids Local Tour PT **2023** (Dolce, Ribagolfe Oaks, Ribagolfe Lakes)
- **(29)**: Real Club de Golf El Prat **2023** Boys 8/9/10
- **(30..40)**: USKids Local Tour PT **2016 + 2017** (Quinta do Peru, Lisbon Sports Club, Beloura Pestana, Ribagolfe, Oeiras, Montado)

### Member-history cache: 48 ficheiros chunkados <85 MB

`public/data-archive/uskids-member-history-001..048.json`:
- (001-046): histórico curado dos flagship + scrapes anteriores
- (047): 27 jogadores PT Local Tour 2023 (sessão 2026-05-12)
- (048): KIKO Matos Coelho (mid 471043, 14 torneios USKids — sessão 2026-05-13)

Slim consumido pela KIDSpage: `public/data/uskids-member-history-slim.json` —
**2.678 jogadores nomeados** + 1.601 sem nome.

### output/ rebalanceado: 2 chunks

`output/data-archive/uskids-member-history-001..002.json` (80 + 15.4 MB).
Anteriormente eram 47 chunks com duplicação massiva do `torneios` (305 MB no 001).
Re-balanceado via:

```powershell
node scripts/split-member-history.js --from-chunks --archive-dir=output/data-archive --target-mb=80
```

---

## 3. Endpoint USKids correcto (descoberto via DevTools)

⚠️ **ESTA É A FÓRMULA CORRECTA. NÃO USES `GET t=0`** — devolve `flight_players: {}` para torneios encerrados.

```js
POST https://www.signupanytime.com/plugins/links/admin/LinksAJAX.aspx
   ?op=GetPlayerTeeTimes
   &f={flight_id}
   &r={round}
   &p={page}
   &t=1                              // ← final results (não t=0)
   &pt=undefined                     // ← obrigatório
   &jbgr={Date.now()}                // ← cache-buster
   &c=1                              // ← obrigatório
```

`fetch-uskids-member-history.js` JÁ está patched com este endpoint (com fallback
para `t=0` por compatibilidade).

**Devolve:**
```json
{
  "flight_players": {
    "{pid}": {
      "first": "...", "last": "...",
      "country": "pt",
      "place": "Cidade, Distrito",   // ← CIDADE, NÃO posição na classificação
      "rounds": {
        "1": {
          "strokes": [...18 ints...],
          "num_strokes": 39, "num_holes": 9,
          "course_name": "...", "start_hole": 1
        }
      }
    }
  }
}
```

`pid` é local ao flight — **NÃO é o memberID USKids global**. Para mapear:
- `GetTournamentPlayers&t={tcode}&f={fid}` → `PlayerNodeId[]` = lista de memberIDs globais
- Match por (strokes R1 || place ranking || gross)

---

## 4. Como retomar trabalho específico

### Adicionar torneio USKids novo à UI

1. **Identificar tcode** via signupanytime
2. **Scrape browser:** abrir `https://www.signupanytime.com/plugins/links/front/linksviews.aspx?v=results&fmt=nohead&ax=1129&t={tcode}` → F12 → cola um adaptador do `scripts/browser-scrape-pt-local-tour-completos.js` ou `scripts/browser-scrape-elprat-2023.js`
3. **Mover** o JSON descarregado para `public/data-archive/`
4. **Integrar:** correr `scripts/integrate-{nome}.js --apply` (criar baseado em `scripts/integrate-elprat-2023.js` se for novo)
5. **Regenerar slim:** `node scripts/build-member-history-slim.js`
6. **Testar:** `npm test && npm run build`
7. **Commit + push**

### Resolver nomes em falta (mids com `name: "?"`)

Os 1601 mids sem nome estão na cache. Há 2 caminhos:

**A) Esperar pelo workflow** — o `uskids-member-history.yml` corre periodicamente e
agora tem o endpoint correcto. Vai resolver progressivamente nomes de tcodes antigos.

**B) Ataque dirigido** — script `scripts/resolve-missing-names.js` (criar) que:
1. Lê todos os ficheiros member-history e identifica mids com `name: "?"`
2. Para cada, descobre os tcodes onde jogou via `GetMemberTournamentResults`
3. Para cada (tcode, ageGroup), chama `GetPlayerTeeTimes` (POST + t=1) e cruza
   strokes para descobrir o nome
4. Actualiza in-place os ficheiros member-history

### Adicionar um jogador específico (como KIKO)

1. **Achar o mid** via `GetTournamentPlayers&t={tcode}&f={fid}` + scan com
   `GetMemberTournamentResults&m={mid}` matching por (escalão, gross, place)
2. **Scrape histórico** — criar `scripts/browser-scrape-{nome}.js` baseado em
   `browser-scrape-kiko.js`
3. **Integrar** via `scripts/integrate-{nome}.js` baseado em
   `integrate-kiko-matos-coelho.js`
4. **Regenerar slim** + push

### Validar mid de jogador candidato (como Manuel legacy)

Usar `scripts/verify-manuel-legacy-mid.js` como template — adapta `CANDIDATES`,
critérios de match (escalão, gross, place do torneio onde sabes que ele jogou)
e executa em F12 do signupanytime.

---

## 5. Bugs conhecidos pendentes / atenções

1. **`output/data-archive/uskids-member-history-001.json` perto do limite GitHub**
   — actualmente 80 MB. Quando crescer, vai voltar a falhar push. Solução durável:
   Git LFS.

2. **1.601 mids ainda sem nome** — em vários ficheiros member-history. Plano A
   (workflow) deve resolver com o tempo; Plano B (script dedicado) ainda não foi
   escrito.

3. **`parLabelColSpan` hardcoded em outros componentes?** — só fixei
   `TabResultados.tsx`. Verificar `DrivePage.tsx`, `AdmissionsTab.tsx`,
   `BJGTPage.tsx` etc. se algum também passa valor errado.

4. **Workflow `uskids-member-history.yml` ainda não correu com o endpoint novo**
   — o patch ao `fetch-uskids-member-history.js` foi pushed mas o próximo cron
   ainda não correu. Verificar `.github/workflows/uskids-member-history.yml` para
   schedule e correr manualmente se quiseres acelerar.

---

## 6. Scripts criados nesta sessão (17)

| Script | Tipo | Propósito |
|---|---|---|
| `browser-scrape-pt-local-tour-completos.js` | Browser F12 | Scrape PT Local Tour 2023 (6 tcodes) |
| `browser-scrape-pt-local-tour-2016-2017.js` | Browser F12 | Scrape PT Local Tour 2016+2017 (11 tcodes) |
| `browser-scrape-elprat-2023.js` | Browser F12 | Scrape El Prat 2023 Boys 8/9/10 |
| `browser-scrape-kiko.js` | Browser F12 | Scrape histórico KIKO Matos Coelho (mid 471043) |
| `split-pt-local-tour-completos.js` | Node | Split do PT 2023 → uskids_torneios_completos(23..28) + smart bump |
| `integrate-pt-local-tour-2016-2017.js` | Node | Split do PT 2016+2017 → completos(30..40) + smart bump |
| `integrate-elprat-2023.js` | Node | Split do El Prat → completos(29) + cross-ref mids |
| `integrate-kiko-matos-coelho.js` | Node | Integra KIKO na cache member-history (auto-move from Downloads) |
| `merge-pt-local-tour-to-cache.js` | Node | Merge dos 34 mids PT 2023 nos ficheiros member-history (resolve nomes "?") |
| `discover-pt-tcodes.js` | Node | Varre histórico USKids dos mids PT 2023 para descobrir tcodes em campos PT |
| `verify-manuel-legacy-mid.js` | Browser F12 | Valida candidatos a mid legacy do Manuel |
| `fetch-uskids-pt-local-tour.js` | Node (Playwright) | Fetcher inicial dos 6 tcodes 2023 — substituído por browser-scrape |
| `resolve-pt-local-tour-names.js` | Node | Cruza 34 mids PT com cache + fingerprint para resolver nomes |
| `report-pt-local-tour.js` | Node | Relatório markdown organizado por torneio×escalão |
| `map-mids-pt-local-tour.js` | Node | Mapeia mid → nome via cross-ref com canonical signupanytime |
| `fix-pt-local-tour-course-info.js` | Node | (Legacy) Fix retroactivo de `course_info.R1.holes` — não usado agora |
| `resolve-pt-local-tour-names.js` | Node | Resolve nomes via 46 ficheiros + fingerprint |

E **modificações** nos existentes:
- `fetch-uskids-member-history.js` — POST + t=1 + pt=undefined&jbgr&c=1
- `split-member-history.js` — modo `--from-chunks` + `--archive-dir`

---

## 7. Padrões do projecto a respeitar

### CLAUDE.md regras de ouro

- **Tabelas ordenáveis** — todas as tabelas têm de ser ordenáveis por clique no cabeçalho via `useSort` + `SortableHdr`
- **Cores via tokens** — `tokens.css` é a fonte única; nunca hardcodar hex
- **SexBadge** — usar `<SexBadge sex="M"|"F" />`, nunca símbolos ♂/♀
- **Nunca declarar pronto sem testes** — `npm test` + `npm run build` antes de afirmar que algo está feito

### USKids dataflow

```
[USKids signupanytime API]
         ↓ (POST + t=1)
[fetch-uskids-member-history.js / browser-scrape-*.js]
         ↓
[public/data-archive/uskids-member-history-*.json (chunks <85 MB)]
         ↓ (build-member-history-slim.js)
[public/data/uskids-member-history-slim.json]
         ↓
[KIDSdataLoader.ts buildAutoRivals() / Fase 2]
         ↓
[KIDSpage / USKIDSpage UI]
```

### Smart bump padrão

Sempre que um script altera um contador shared (ex:
`TORNEIOS_COMPLETOS_COUNT`), usa `Math.max(actual, desired)` em vez de hardcoded:

```js
const existing = glob.sync(...).map(f => parseInt(...)).filter(n => n > 0);
const finalCount = Math.max(existing.length ? Math.max(...existing) : 0, MIN_COUNT_REQUIRED);
```

---

## 8. Recursos

- **`CLAUDE.md`** — Documentação central do codebase (codifica padrões + tabela de IDs Manuel)
- **`SESSAO-2026-05-12-13-RESUMO.md`** — Resumo cronológico desta sessão
- **`docs/api-fpg-endpoints.md`** — Endpoints FPG (não USKids)
- **Scripts de exemplo** — usar `integrate-elprat-2023.js` ou `integrate-kiko-matos-coelho.js` como templates

---

*Quando recomeçar, lê esta página primeiro, depois o `CLAUDE.md` (secção USKids
de preferência), depois pergunta-me o que precisas.*
