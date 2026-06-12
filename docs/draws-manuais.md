# Draws manuais — estado, arquitectura e como continuar

> Última actualização: 2026-06-12
> Âmbito: pairings/draws do Manuel (fed **52884**) que a FPG **não publica** e que
> são curados à mão a partir de PDFs / imagens / Excel / texto.

---

## 1. O problema que isto resolve

A FPG publica draws (pairings + tee times) só para alguns torneios. Para **torneios
sociais de clube (CGSS Santo da Serra)** e para vários **PJA Tour**, o scraper
nunca obtém o draw — deixa o campo `draws` **vazio** na entrada do
`fpg-admissions-draws.json` (muitas vezes com nome/data placeholder, ex.
`"Torneio 10961"` / `2026-05-27`).

Temos esses draws noutros formatos (PDF oficial do clube, folha de cálculo, foto
da app de scoring, ou texto). Esta pipeline converte-os para JSON e injecta-os
**sem tocar** no `fpg-admissions-draws.json` (que o scraper regenera).

Onde aparecem depois de incorporados:
- **/draws** (`DrawsPage`) — vista centrada no Manuel: com quem foi parelhado, com cruzamento de scores.
- **/FPG** (`FPGPage` → `DrawTab`) — o **campo completo** do torneio, todos os grupos.

---

## 2. Arquitectura (fluxo de dados)

```
PDFs CGSS  ──scripts/extract-cgss-draws.py──►  public/data/cgss-draws-manual.json
imagens/Excel/texto PJA ──(construção manual)─►  public/data/pja-draws-manual.json
                                                       │
                          ┌────────────────────────────┴───────────────────────────┐
                          ▼                                                          ▼
   src/data/nacional2026Loader.ts                                 scripts/pairings-build.js
   ::mergeCgssManualDraws (runtime, no browser)                   ::mergeCgssDraws (build, Node)
                          │                                                          │
                          ▼                                                          ▼
   FPGPage / DrawTab  (campo completo)                            public/data/manuel-pairings.json
                                                                          │
                                                                          ▼
                                                                   DrawsPage (/draws)
```

**Dois ficheiros curados** em `public/data/`, ambos lidos pelos dois merges, por
chave `${ccode}-${tcode}`:

| Ficheiro | Origem | Gerado por |
|---|---|---|
| `cgss-draws-manual.json` | PDFs oficiais do CGSS | `scripts/extract-cgss-draws.py` (re-gerável) |
| `pja-draws-manual.json` | imagens/Excel/texto PJA | construído à mão (não há gerador automático) |

**Regra `fixMeta`** (por entrada): `fixMeta !== false` ⇒ nome/data do ficheiro
curado são autoritativos e **sobrescrevem** os do scrape (placeholders). É o
default. As entradas PJA são autoritativas (têm meta real vinda da tabela de
resultados). Entradas sem match no scrape são **injectadas** como draw-only
(ex.: torneios futuros).

**Formato de uma entrada** (igual ao `FpgTournamentData` em
`src/data/nacional2026Loader.ts`):
```jsonc
{
  "ccode": "007", "tcode": "10961",
  "name": "Torneio CGSS São Martinho", "date": "2025-11-08",
  "campo": "...", "drawOnly": false,
  "draws": {
    "1": {                                  // chave = nº da ronda
      "totalJogadores": 54,
      "groups": [
        { "teeTime": "09:30", "startHole": 10, "tee": null,
          "players": [
            { "nome": "Manuel Goulartt Medeiros", "clube": "Santo da Serra",
              "fed": "52884", "hcp": 9.3, "tee": "Vermelhas" },
            ...
          ] }
      ]
    }
  }
}
```

---

## 3. Regras críticas (não esquecer)

### 3.1 Manuel identifica-se pela LICENÇA, não pelo nome
- Júnior = fed **52884**. Aparece como **"Manuel Goulartt Medeiros"** nos PDFs CGSS
  mas como **"Manuel Medeiros"** nas folhas PJA.
- Homónimo (o marido) = fed **54907**, nome "Manuel Medeiros".
- `pairings-build.js` foi alterado para **detecção fed-first**: se o jogador traz
  fed, a licença decide quem é o Manuel; só sem fed se usa a heurística por nome.
  Assim o homónimo nunca é confundido, mesmo em draws completos onde os dois
  aparecem em grupos diferentes.
- O extractor força `fed=54907` quando `norm(nome)=="manuel medeiros"`.

### 3.2 Licenças dos companheiros vêm da tabela de resultados
As folhas/imagens nem sempre trazem o nº de federado. **Resolve-se por nome
contra a tabela de resultados do próprio torneio** (`pull-torneios*.json`,
`jovens_*.json`, `clubes_*.json` — campo `fedCode`). Foi assim que se obtiveram
os feds dos rivais do PJA Aroeira 2026 a partir do plantel do t10543.

### 3.3 Datas
A data das admissions costuma ser placeholder (`2026-05-27` = data do scrape).
O `/draws` agora **prefere sempre a data autoritativa dos scorecards do Manuel**
(`m.data`). Corrigiu o bug de torneios de 2024 aparecerem com 27/05/2026.

### 3.4 Scores (cruzamento)
`buildFpgScoreIndex` em `pairings-build.js` indexa scores de
`pull-torneios*`, `drive-data-*`, `aquapor-data-*`, **`jovens_*`** e **`clubes_*`**.
Se um torneio tiver resultados **só** noutro tipo de ficheiro, os scores aparecem
como "—" até esse ficheiro ser adicionado a esta lista.
Gross sentinela `>= 200` (ex. 998 nos stableford de pares) é tratado como nulo.

---

## 4. Estado actual (2026-06-12)

**Cobertura /draws (FPG):** 87/120 rondas com draw (73%), 69/90 torneios.

### 4.1 CGSS — `cgss-draws-manual.json` (12 torneios, draws COMPLETOS)

| tcode | Data | Torneio | Grupos |
|---|---|---|---|
| t10983 | 2026-01-17 | Torneio de Inverno CGSS | 18 |
| t10989 | 2026-01-31 | T1 Camp. CGSS de Pares (Greensomes) | 15 |
| t10888 | 2025-05-04 | I ABERTO CGSS 2025 | 4 |
| *draw-only* | 2025-07-06 | III ABERTO CGSS 2025 | 7 |
| *draw-only* | 2026-06-13 | Torneio Diário de Notícias da Madeira 2026 | 18 |
| t10921 | 2025-08-02 | Torneio CGSS RALI Madeira 2025 | 14 |
| t10933 | 2025-09-06 | Torneio Quinta de São João 2025 | 25 |
| t10961 | 2025-11-08 | Torneio CGSS São Martinho | 14 |
| t10868 | 2025-03-08 | T2 Camp. CGSS de Pares (Foursomes) | 18 |
| t11020 | 2026-05-09 | Torneio Cidade de Machico 2026 | 29 |
| t10986 | 2026-01-24 | TORNEIO DA RESTAURAÇÃO CGSS 2026 | 19 |
| t10886 | 2025-04-26 | T3 Camp. CGSS de Pares | 16 |

> `drawOnly=true` = não há entrada de resultados no repo (futuro ou edição não scrapada);
> é injectado como torneio novo. Quando a FPG publicar resultados, trocar a chave
> sintética (`cgss-...`) pelo `ccode-tcode` real.

### 4.2 PJA Tour — `pja-draws-manual.json` (5 torneios)

| tcode | Data | Torneio | Rondas | Fonte |
|---|---|---|---|---|
| 192-10013 | 2025-09-12 | PJA Race to Dunas (Torre) | 1 | imagem |
| 191-10036 | 2025-02-22 | Ribagolfe Oaks Masters 2025 | 1 | imagem |
| 029-10492 | 2025-02-15 | Aroeira Master by Details | 1 | imagem |
| 017-10189 | 2025-10-24 | PJA Tour Troia | 1 | Excel |
| 029-10543 | 2026-04-24 | PJA Aroeira Masters 2026 ("PJA Aroeira 2") | 1+2 | texto (D1) + screenshots (D2) |

---

## 5. O que falta / TODO

### 5.1 Torneios SEM draw (27) — precisam de folha/PDF/imagem
São torneios que o Manuel jogou mas para os quais **não temos o draw**. Atenção:
muitos têm o mesmo nome de edições já incorporadas mas **ano diferente**.

```
2025-08-24  125-10371  PJA TOUR Vale Pisão - Dia 2
2025-08-23  125-10370  PJA TOUR Vale Pisão - Dia 1
2025-08-08  183-10142  Torneio José Rosado
2025-06-20  183-10135  Torneio de São João
2025-04-18  183-10129  Torneio da Páscoa
2025-02-08  007-10857  TORNEIO da RESTAURAÇÃO CGSS         (edição 2025; já temos a 2026)
2025-02-01  152-10444  AT&T PEBBLE BEACH PRO-AM BY TITLEIST
2024-10-25  007-10812  XIII Torneio CGSS OM NOS
2024-10-18  007-10809  TAÇA PRESIDENTE CGSS
2024-09-27  007-10800  TORNEIO C. SANTOS VP
2024-09-20  007-10796  XI Torneio Vinhos Barbeito Madeira
2024-08-16  920-10078  Liga Portuguesa Contra o Cancro
2024-08-09  920-10077  Torneio José Rosado
2024-08-02  007-10777  Torneio CGSS RALI                  (edição 2024; já temos a 2025)
2024-06-07  007-10752  MADEIRA GOLF TROPHY [DS] 2024
2024-05-25  007-10746  Torneio NOS Empresas
2024-05-10  007-10741  Torneio Cidade de Machico          (edição 2024; já temos a 2026)
2024-04-19  007-10734  Torneio Golf & Clássicos 2024
2024-02-10  007-10705  Torneio de Carnaval 2024
2023-11-19  007-10676  Campeonato Regional de Jovens Sub10&12 Dia 2
2023-11-18  007-10674  Campeonato Regional de Jovens Sub10&12 Dia 1
2023-10-28  988-10190  Final Nacional Drive Challenge 2023 - Sub10
2023-10-14  007-10658  Torneio SVR Lazartigue
2023-09-29  007-10651  Final Circuito CGSS Junior by PKF
2023-08-14  920-10062  Torneio da LPCC
2023-06-16  007-10607  6º Torneio CGSS Junior by PKF 9B
2023-03-26  007-10572  3º Torneio CGSS Junior by PKF
```

### 5.2 Rondas sem score do Manuel (8) — não são bug de pipeline
- **Diário de Notícias 2026** e **III ABERTO CGSS 2025**: draw-only, sem resultados no repo (futuro / não scrapado).
- **T1 Greensomes, T2 Foursomes, T3 CC Pares**: stableford de pares — o gross individual não existe (sentinela 998, filtrado).
- **Final Drive Challenge 2023 (988-10189), Circuito Fim de Semana (992-10455), LevelUP Madeira (982-10165)**: o Manuel **não consta na tabela de resultados** (provável WD/DNS). Só se resolve com os resultados reais.

### 5.3 Pendentes conhecidos
- **PJA Aroeira Masters 2026 (t10543)** — falta o **Dia 1** "oficial" se vier melhor fonte; o que está veio do texto enviado. Dia 2 veio das screenshots.
- Re-keying dos draw-only do CGSS quando a FPG publicar resultados dessas edições.

---

## 6. Como incorporar um novo draw (passo-a-passo)

### Caso A — PDF oficial do CGSS
1. Pôr o(s) PDF(s) numa pasta.
2. Correr:
   ```bash
   python3 scripts/extract-cgss-draws.py \
     --pdf-dir <pasta-dos-pdfs> \
     --data-dir public/data \
     --out public/data/cgss-draws-manual.json
   ```
   (usar `--print-only` primeiro para inspeccionar sem escrever)
3. Confirmar o match (`-> c007 tNNNNN`) e a contagem de grupos vs. "Nº.Jog." do PDF.

### Caso B — imagem / Excel / texto (PJA ou outro)
1. Transcrever os grupos (tee time, buraco, jogadores).
2. Resolver os feds por nome contra a tabela de resultados do torneio
   (`pull-torneios*` / `jovens_*` / `clubes_*`, campo `fedCode`).
3. Acrescentar/editar a entrada em `public/data/pja-draws-manual.json` no formato
   da secção 2. Manuel = fed `52884`. Multi-dia ⇒ rondas `"1"`, `"2"`, ...
   `fixMeta` ausente (autoritativo) e `date`/`name` reais.

### Em ambos os casos, no fim:
```bash
node scripts/pairings-build.js     # regenera public/data/manuel-pairings.json (/draws)
npx vitest run                     # 174 testes devem passar
```
O FPGPage (DrawTab) não precisa de build — lê os ficheiros curados em runtime via
`loadFpgAdmissionsDraws`.

---

## 7. Ficheiros-chave

| Ficheiro | Papel |
|---|---|
| `public/data/cgss-draws-manual.json` | draws curados CGSS (gerável) |
| `public/data/pja-draws-manual.json` | draws curados PJA (manual) |
| `public/data/manuel-pairings.json` | output do /draws (gerado) |
| `scripts/extract-cgss-draws.py` | extractor de PDFs CGSS → JSON |
| `scripts/pairings-build.js` | merge + cruzamento de scores → manuel-pairings |
| `src/data/nacional2026Loader.ts` | `loadFpgAdmissionsDraws` + `mergeCgssManualDraws` (FPGPage) |
| `src/pages/DrawsPage.tsx` | página /draws |
| `src/ui/DrawTab.tsx` | tab de draw no FPGPage (campo completo) |

---

## 8. Armadilhas / lições

- **Editar `pairings-build.js` / `nacional2026Loader.ts` via file-tools trunca no
  mount do sandbox.** Editar com patch Python em bash (`python3 - <<'PY' ...`) ou
  via bridge outputs→`cp`. Ver memória `mount-sync-instavel`.
- **Detecção do Manuel:** sempre por fed; nunca confiar só no nome ("Manuel
  Medeiros" pode ser o marido).
- **Datas placeholder `2026-05-27`:** são artefacto do scrape; o /draws ignora-as
  preferindo a data dos scorecards.
- **Pares (Greensomes/Foursomes/CC Pares):** dividir cada par em indivíduos; o
  gross individual não existe nestes formatos stableford.
- **Editar dois sítios em sintonia:** qualquer mudança ao formato dos ficheiros
  curados tem de ser reflectida nos DOIS merges (loader TS + pairings-build JS).
