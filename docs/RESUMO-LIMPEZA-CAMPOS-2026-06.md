# Resumo — Limpeza e enriquecimento dos campos (Junho 2026)

Sessão de trabalho sobre os **campos** (`/campos`, `/simulador`) e a sua ligação às
páginas de **jogadores** (`/jogadores`). Objectivo: nomenclatura correcta dos campos
de 27 buracos, eliminar duplicados, validar países, ligar a informação toda
(distância/SI jogados) e verificar exaustivamente os campos internacionais.

> Quase tudo é **frontend** (efeito imediato no `npm run dev`). As partes de dados
> (away-courses, nomes, países) regeneram-se com scripts no PC. No fim: `npm test` + `npm run build`.

---

## 1. Campos de 27 buracos — nomenclatura canónica

Os campos de 27 buracos já tinham os combos de nines correctos no `master-courses.json`:

- **Santo da Serra** — Machico / Desertas / Serras
- **Montebelo** — Buçaco / Caramulo / Estrela
- **Vila Sol** — Prime / Challenge / Prestige
- **Pinheiros Altos** — Oliveiras(Olives) / Pinheiros(Pines) / Sobreiros(Corks)
- **Castro Marim** — Atlântico / Grouse / Guadiana
- **Penha Longa** — Atlantic North/South
- **Palmares** — Alvor / Lagos / Praia
- **Verdegolf** — Batalha A/B/C + Furnas

**Limpeza:** o `away-courses.json` tinha entradas legadas/duplicadas (denominações
antigas) que não correspondiam aos combos canónicos. Removidas/fundidas:
`Montebelo`, `Montebelo A-B`, 4× variantes `Vila Sol`, 3× `Pinheiros Altos`, etc.

---

## 2. Entradas PT a "vazar" para o away

Campos **portugueses** apareciam como internacionais (badge INTL) por terem nome
ligeiramente diferente do master e não fundirem. Resolvidos por **fusão** (não
remoção, para preservar os jogadores): dá-se à entrada o nome exacto do master e
a CamposPage funde-as.

Casos: Tróia, Porto Santo, Oitavos Dunes, Santo Estevão, Oceânico Faldo, Álamos,
Morgado do Reguengo, Vilamoura Old Course, Castro Marim Grouse+Atlântico, Santo da
Serra Machico-Serras, e as variantes Aroeira (Challenge/Pines/CNJ → No.1/No.2).

---

## 3. Países dos campos

- Validei **todos** os países; os existentes não tinham erros reais (falsos
  positivos como "Cañada"/"St Leon-Rot"/"Haguer").
- Preenchi **88+** países em falta (pesquisa web onde necessário: Golf Xaz=Espanha,
  Colony Club Gutenhof=Áustria, Armada=Polónia, Costa Navarino=Grécia, Royal
  Hague=Holanda, Sothwind=EUA, Daily Mail WJGC=Espanha…). Guardados de forma
  **durável** no `countryMap` do `course-aliases.json`.
- ~12 ficam sem país de propósito: torneios de **sede rotativa** (European Young
  Masters, European Boys/Girls Team Champ) ou entradas-lixo.

**Limpeza:** o script `extract-courses.js` perdia os países ao regenerar (a fonte
`melhorias.json` só tinha 2). Tornei-o **acumulativo** (preserva o país do ficheiro
anterior) e o `countryMap` repõe-os sempre.

---

## 4. Nomes dos jogadores

**Bug:** o `_players` ligava o nº de federado, e a UI mostrava o **número** em vez do
nome em alguns casos. Causas:

1. **Filtro `scoreOrigin`** no `extract-courses.js` só aceitava rondas `"Intern"`/
   `"Extra"` — mas a maioria das rondas internacionais vem como `"Torn"` ou vazia.
   Resultado: **dezenas de campos sem jogadores**. Removido o filtro → ligações
   jogador↔campo subiram de ~183 para ~278 campos.
2. **Placeholders** no `players.json`: 3 entradas com `name` igual ao próprio número
   (27849, 34186, 40112). Corrigido o runtime e o gerador para ignorarem
   placeholders e usarem o nome real dos `federados.json`. Criado
   `scripts/fix-players-placeholder-names.js`.
3. `build-course-player-names.js` regenera o mapa nº→nome a partir dos federados.

---

## 5. Resultados dos jogadores nos campos

O `_players` passou de `{ nfed: data }` para `{ nfed: [{ data, gross, toPar, tee,
event, sd }] }` — guarda **todas as rondas com o resultado**, não só a última. A
CamposPage mostra agora os scores de cada ano (ex: Manuel no Villa Padierna: 2026 e
2025). Data em **DD/MM/AAAA**.

---

## 6. Separação dos "Torneios"

Algumas entradas do away são, na verdade, **nomes de torneio/organização** (não
campos): Campeonato Andalucía, European Boys Team Champ, etc. (lista curada em
`src/constants/tournamentCourses.ts`).

- Por defeito **não aparecem** em lado nenhum (Simulador, Comparar, Jogadores).
- Na **CamposPage** há um novo filtro de origem **🏆 Torneios** que os mostra só
  quando escolhido (com país e quem jogou).
- `None` e `Internacional` (lixo puro) → removidos via `blacklist`.

Arquitectura: `App.tsx` expõe `simCourses` (sem torneios) e `tournamentCourses`
(à parte).

---

## 7. Ligação RICA: distância e SI jogados

Em torneios internacionais a FPG regista o **score** mas não as **jardas** nem o
**SI** real (vinha sequencial 1–18). Novo `src/utils/playedDistance.ts` liga a
ronda ao **tee do campo** e preenche:

- **Distância** — do tee específico que o jogador jogou.
- **SI** — da **referência do campo** (igual ao que a CamposPage mostra). Se o SI
  vier sequencial e não houver fonte, **fica oculto** (nunca mostra números falsos).

Como em torneios USKids a marcação real depende da **idade** (não da cor que a FPG
regista), há um mapa curado `src/constants/manuelAwayTees.ts` para o Manuel
(confirmado com o jogador): Marco Simone→Boys 11/10 (4430 m), Glen→Boys 12 (5280 m),
Villa Padierna→Vermelhas (5295 m), etc.

**Merge geral de duplicados:** o `App.tsx` passou a fundir campos pelo **nome
canónico** (`canonicalCourseName`), e o lookup de courseKey ignora pontuação — por
isso "Villa Padierna Flamingos" (ronda) liga a "Villa Padierna - Flamingos" (campo),
"Golden Palm" → "Trump Doral - Golden Palm", etc. Bónus: corrige os links ↗ para a
página do campo.

**Rótulo uniforme:** "HCP"/"S.I." → sempre **"SI"**.

---

## 8. Villa Padierna Flamingos — caso de estudo

Estava duplicado e com o tee WJGC errado (4842 m). Recriado em `extraCourses.ts`
como **um** campo com 2 tees: Vermelhas (par 71, 5295 m, 2025) e Vermelhas WJGC 2026
(par 72 — buraco 10 passou a par 5 — mesmas 5295 m e mesmo CR/Slope). Cobre as duas
chaves de origem para eliminar o "Vermelho" redundante.

---

## 9. Verificação exaustiva

Criado `scripts/verify-international-courses.js` — verifica SI (permutação válida),
soma de pares, soma de distâncias, países, e duplicados.

**Resultado:** **0 erros estruturais** nos 420 campos (303 away + 117 master).
- SI dos campos curados (`extraCourses`): 9 arrays, todos permutações válidas.
- Pares e distâncias: 19 + 16 arrays, todos batem com os totais.
- Tees vazios (≈10): a FPG só trouxe o score, não o scorecard — mas **os jogadores
  e os scores estão preservados** em `_players`.
- "Par declarado ≠ soma" em campos PT (Cantanhede, Vilamoura Old, Castro Marim,
  Pinheiros): é um campo **cosmético** da FPG; os pares dos buracos (que contam para
  o scoring) estão certos.

---

## melhorias.json — decisão

Mantido **como está** (camada de correções viva: sobrepõe-se à FPG em runtime e
sobrevive aos re-scrapes). Não foi "assado" nos ficheiros para não perder as
correcções no próximo scrape.

---

## Ficheiros tocados

**Dados / config**
- `course-aliases.json` — aliases, nameOverrides, countryMap (281 países), blacklist
- `public/data/away-courses.json` — duplicados removidos (regenerado pelo pipeline)

**Scripts (Node — correr no PC)**
- `scripts/extract-courses.js` — sem filtro scoreOrigin, modo acumulativo de país, `_players` com rondas+score
- `scripts/build-course-player-names.js` — ignora placeholders
- `scripts/fix-players-placeholder-names.js` — **novo**
- `scripts/verify-international-courses.js` — **novo** (verificação exaustiva)

**Frontend (TS/TSX)**
- `src/App.tsx` — merge por nome canónico, split de torneios, herança de SI
- `src/context/AppContext.tsx` — `tournamentCourses`
- `src/pages/CamposPage.tsx` — filtro Torneios, resultados dos jogadores, nomes, data DD/MM/AAAA, rótulo SI
- `src/pages/SimuladorPage.tsx` — exclui torneios
- `src/pages/JogadoresPage.tsx` — distância + SI ligados ao campo
- `src/ui/jogadoresHelpers.tsx` — lookup de courseKey imune a pontuação
- `src/ui/ScorecardTable.tsx` — rótulo SI
- `src/data/extraCourses.ts` — Villa Padierna, SI da Montecchia
- `src/data/types.ts` — `CoursePlayerRound`
- `src/utils/playedDistance.ts` — **novo**
- `src/constants/tournamentCourses.ts` — **novo**
- `src/constants/manuelAwayTees.ts` — **novo**
- `src/App.css` — estilos dos resultados
- `src/utils/__tests__/courseAliases.test.ts` — **novo**

---

## Comandos para aplicar (no PC)

```powershell
cd C:\golf-fpg
node scripts/fix-players-placeholder-names.js --apply
node scripts/extract-courses.js --force
node scripts/build-course-player-names.js
node scripts/verify-international-courses.js      # deve dar 0 erros
npm test
npm run build
```

---

## Follow-ups opcionais (não feitos)

- Confirmar candidatos a duplicado ainda incertos: *Sancti Petri* vs *Real Novo
  Sancti Petri*; *Ribagolfe* vs *Ribagolfe Oaks*; *Royal St George's* (identidade
  confundida com George GC, África do Sul); *Lisbon* vs *Lisbon Sports Club*.
- App mostrar a **soma dos buracos** em vez do "par declarado" cosmético da FPG.
- Países dos torneios de sede rotativa (ficam em branco de propósito).
