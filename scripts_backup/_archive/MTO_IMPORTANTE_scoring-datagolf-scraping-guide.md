# Guia Completo: Scraping de scoring.datagolf.pt

## Contexto

O site **https://scoring.datagolf.pt** é a plataforma pública da Federação Portuguesa de Golfe (FPG) para consulta de torneios e scorecards. Utilizamos este site para descarregar dados dos circuitos **DRIVE** (junior) e **AQUAPOR** para análise cruzada de jogadores na nossa aplicação React de golfe.

O site é uma aplicação ASP.NET WebForms com endpoints JSON internos (WebMethods). Não tem API pública documentada — toda a interação é feita via browser console scripts que emulam os pedidos AJAX da própria interface.

---

## Arquitectura do Site

### Tecnologia
- **ASP.NET WebForms** com jQuery/jTable no frontend
- **WebMethods** expostos como endpoints `.aspx/NomeDaFunção`
- Respostas em JSON wrapped: `{ d: { Result: "OK", Records: [...], TotalRecordCount: N } }`
- Datas em formato .NET: `"/Date(1234567890000)/"`

### Páginas Principais
| Página | URL | Função |
|--------|-----|--------|
| Torneios | `/pt/tournaments.aspx` | Lista todos os torneios |
| Classificações | `/pt/Classifications.aspx?ccode=X&tcode=Y` | Resultados de um torneio |
| Scorecard | (modal dentro de Classifications) | Scorecard hole-by-hole |

### Sites Irmãos
- **scoring.datagolf.pt** — site principal, dados mais completos
- **scoring.fpg.pt** — site irmão (possível migração em curso), mesma estrutura
- Os endpoints são iguais em ambos, mas os `score_id` são DIFERENTES entre sites

---

## Regra Crítica: Parâmetros Duplicados

**TODAS as chamadas à API requerem parâmetros duplicados na query string E no body do POST.** Se enviarmos só no body, recebemos HTTP 500. Descoberto via análise HAR.

```
POST endpoint.aspx/Metodo?param1=val1&param2=val2
Content-Type: application/json; charset=utf-8
X-Requested-With: XMLHttpRequest

{"param1":"val1","param2":"val2"}
```

---

## Endpoint 1: Descoberta de Torneios

### `tournaments.aspx/TournamentsLST`

Devolve lista paginada de torneios. Pode ser pesquisado por nome.

#### Parâmetros (todos strings)

| Parâmetro | Valor | Notas |
|-----------|-------|-------|
| `ClubCode` | `"0"` | "0" = todos os clubes |
| `dtIni` | `""` | Data início (vazio = sem filtro) |
| `dtFim` | `""` | Data fim |
| `CourseName` | `""` | Filtro por campo |
| `TournCode` | `""` | Filtro por código |
| `TournName` | `"drive"` ou `"aquapor"` | **Pesquisa textual no nome** |
| `jtStartIndex` | `"0"` | Offset (string!) |
| `jtPageSize` | `"50"` | Registos por página (max 50, >50 dá 500) |
| `jtSorting` | `"started_at DESC"` | **NÃO é** `tournament_date DESC` |

#### Exemplo de Chamada
```javascript
const body = {
  ClubCode: "0", dtIni: "", dtFim: "",
  CourseName: "", TournCode: "",
  TournName: "drive",
  jtStartIndex: "0", jtPageSize: "50",
  jtSorting: "started_at DESC"
};
const qs = "jtStartIndex=0&jtPageSize=50&jtSorting=" + encodeURIComponent("started_at DESC");

const res = await fetch("tournaments.aspx/TournamentsLST?" + qs, {
  method: "POST",
  headers: {
    "Content-Type": "application/json; charset=utf-8",
    "X-Requested-With": "XMLHttpRequest"
  },
  body: JSON.stringify(body)
});
const json = await res.json();
const records = json.d.Records;      // array de torneios
const total = json.d.TotalRecordCount; // para paginação
```

#### Campos do Torneio (resposta)

| Campo | Tipo | Exemplo | Notas |
|-------|------|---------|-------|
| `description` | string | `"1º Torneio DRIVE Tour Sul Sub 16"` | Nome completo |
| `club_code` | string | `"988"` | Código da região/clube |
| `code` | string | `"10292"` | Código do torneio (tcode) |
| `started_at` | string | `"/Date(1709769600000)/"` | Data início |
| `acronym` | string | `"FPG_DTS"` | DRIVE = começa com `FPG_D` |
| `course_description` | string | `"Laguna Golf Course"` | Nome do campo |
| `rounds` | number | `1` | Número de rondas |

#### Filtros Pós-Fetch
```javascript
// Filtrar DRIVE 2026
const is2026 = r => new Date(parseInt(r.started_at.match(/\d+/)[0])).getFullYear() === 2026;
const isDrive = r => (r.acronym || "").startsWith("FPG_D");
const drive2026 = allRecords.filter(is2026).filter(isDrive);

// Filtrar AQUAPOR 2026
const isAquapor = r => /aquapor/i.test(r.description);
const aquapor2026 = allRecords.filter(is2026).filter(isAquapor);
```

#### Mapa de Regiões (club_code)
```javascript
const regionMap = {
  "982": "madeira",
  "983": "acores",
  "985": "tejo",
  "987": "norte",
  "988": "sul",
  "000": "nacional"
};
```

---

## Endpoint 2: Classificações

### `classif.aspx/ClassifLST`

**ATENÇÃO**: O ficheiro é `classif.aspx` (minúsculo), NÃO `Classifications.aspx`!

Devolve a classificação/leaderboard de um torneio específico.

#### Parâmetros (todos strings)

| Parâmetro | Valor | Notas |
|-----------|-------|-------|
| `Classi` | `"1"` | Obrigatório |
| `tclub` | ex: `"988"` | **NÃO é** `ccode` nem `ClubCode` |
| `tcode` | ex: `"10292"` | Código do torneio |
| `classiforder` | `"1"` | Ordem da classificação |
| `classiftype` | `"I"` | Individual |
| `classifroundtype` | `"D"` | Dia |
| `scoringtype` | `"1"` | Stroke play |
| `round` | `"1"` | Ronda |
| `members` | `"0"` | Todos |
| `playertypes` | `"0"` | Todos |
| `gender` | `"0"` | Todos |
| `minagemen` | `"0"` | |
| `maxagemen` | `"999"` | |
| `minageladies` | `"0"` | |
| `maxageladies` | `"999"` | |
| `minhcp` | `"-8"` | HCP mínimo |
| `maxhcp` | `"99"` | HCP máximo |
| `idfilter` | `"-1"` | Sem filtro |
| `jtStartIndex` | `"0"` | Paginação |
| `jtPageSize` | `"150"` | Até 150 registos/página |
| `jtSorting` | `"score_id DESC"` | Ordenação |

#### Exemplo de Chamada
```javascript
const body = {
  Classi: "1", tclub: "988", tcode: "10292",
  classiforder: "1", classiftype: "I", classifroundtype: "D",
  scoringtype: "1", round: "1", members: "0", playertypes: "0",
  gender: "0", minagemen: "0", maxagemen: "999",
  minageladies: "0", maxageladies: "999",
  minhcp: "-8", maxhcp: "99", idfilter: "-1",
  jtStartIndex: "0", jtPageSize: "150", jtSorting: "score_id DESC"
};
const qs = "jtStartIndex=0&jtPageSize=150&jtSorting=" + encodeURIComponent("score_id DESC");

const res = await fetch("classif.aspx/ClassifLST?" + qs, {
  method: "POST",
  headers: {
    "Content-Type": "application/json; charset=utf-8",
    "X-Requested-With": "XMLHttpRequest"
  },
  body: JSON.stringify(body)
});
```

#### Campos do Jogador (resposta)

| Campo | Tipo | Exemplo |
|-------|------|---------|
| `score_id` | number | `2915` |
| `classif_pos` | string | `"1"` ou `"NS"` |
| `player_name` | string | `"Rodrigo Sousa Correia"` |
| `player_club_description` | string | `"Estoril"` |
| `gross_total` | string | `"72"` ou `"NS"` |
| `to_par_total` | string | `"-1"` ou `"PAR"` ou `"NS"` |
| `exact_hcp` | number | `3.2` |
| `play_hcp` | number | `3` |
| `score_status_id` | number | `99` = NS/DQ/WD |

**Nota**: Este endpoint NÃO devolve `federated_code`, `course_rating`, `slope`, nem dados hole-by-hole. Para isso, é preciso o endpoint ScoreCard.

---

## Endpoint 3: Scorecards (Hole-by-Hole)

### `classif.aspx/ScoreCard`

Devolve o scorecard completo de um jogador numa ronda específica. Contém TODOS os dados em falta na classificação.

#### Parâmetros (todos strings)

| Parâmetro | Valor | Notas |
|-----------|-------|-------|
| `score_id` | ex: `"2915"` | Do ClassifLST |
| `tclub` | ex: `"988"` | Região/clube |
| `tcode` | ex: `"10292"` | Torneio |
| `scoringtype` | `"1"` | Stroke play |
| `classiftype` | `"I"` | Individual |
| `classifround` | `"1"` | Número da ronda (1, 2, etc.) |

#### Exemplo de Chamada (PARAMS DUPLICADOS!)
```javascript
const scoreId = "2915", tclub = "988", tcode = "10292", round = 1;

// Query string COM os mesmos parâmetros
const qs = `score_id=${scoreId}&tclub=${tclub}&tcode=${tcode}&scoringtype=1&classiftype=I&classifround=${round}`;

// Body COM os mesmos parâmetros (tudo strings)
const body = {
  score_id: String(scoreId),
  tclub: String(tclub),
  tcode: String(tcode),
  scoringtype: "1",
  classiftype: "I",
  classifround: String(round)
};

const res = await fetch("classif.aspx/ScoreCard?" + qs, {
  method: "POST",
  headers: {
    "Content-Type": "application/json; charset=utf-8",
    "X-Requested-With": "XMLHttpRequest"
  },
  body: JSON.stringify(body)
});
const json = await res.json();
const scorecard = json.d.Records[0]; // primeiro (e único) registo
```

#### Campos do Scorecard (resposta)

| Campo | Tipo | Exemplo |
|-------|------|---------|
| `federated_code` | string | `"44934"` |
| `course_rating` | number | `71.8` |
| `slope` | number | `135` |
| `tee_name` | string | `"BRANCAS"` |
| `tee_color_id` | number | `1` |
| `par_total` | number | `72` |
| `nholes` | number | `18` (ou `9`) |
| `course_description` | string | `"Laguna Golf Course"` |
| `gross_total` | number | `72` |
| `penalty` | number | `0` |
| `gross_1` a `gross_18` | number | `5` | Score em cada buraco |
| `par_1` a `par_18` | number | `5` | Par de cada buraco |
| `stroke_index_1` a `stroke_index_18` | number | `16` | Stroke index |
| `meters_1` a `meters_18` | number | `480` | Comprimento em metros |

#### Extracção de Dados por Buraco
```javascript
function extractHoleData(rec) {
  const n = rec.nholes || 18;
  const scores = [], pars = [], si = [], meters = [];
  for (let h = 1; h <= n; h++) {
    scores.push(Number(rec["gross_" + h]) || 0);
    pars.push(Number(rec["par_" + h]) || 0);
    si.push(Number(rec["stroke_index_" + h]) || 0);
    meters.push(Number(rec["meters_" + h]) || 0);
  }
  return { scores, pars, si, meters };
}
```

---

## Erros Comuns e Soluções

### HTTP 500 no TournamentsLST
| Causa | Solução |
|-------|---------|
| Parâmetro `ccode` em vez de `ClubCode` | Usar `ClubCode: "0"` |
| Falta query string | Duplicar `jtStartIndex`, `jtPageSize`, `jtSorting` na URL |
| `jtSorting: "tournament_date DESC"` | Usar `"started_at DESC"` |
| Faltam campos `CourseName`, `TournCode`, `TournName` | Incluir todos (podem ser `""`) |
| `jtPageSize > 50` | Máximo 50 por página |
| Valores numéricos em vez de strings | **Tudo strings**: `"0"` não `0` |

### HTTP 500 no ScoreCard
| Causa | Solução |
|-------|---------|
| Params só no body | **DUPLICAR** na query string E no body |
| Jogador NS/DQ/WD | Saltar — não têm scorecard |
| `score_id` inválido | Verificar que vem do ClassifLST |

### Outros Erros
- **Endpoint `Classifications.aspx/ClassifLST`** → ERRADO. Usar `classif.aspx/ClassifLST`
- **Parâmetro `ccode` no ClassifLST** → ERRADO. Usar `tclub`
- **Chamar de outra página** → Os endpoints `classif.aspx/*` e `tournaments.aspx/*` funcionam de qualquer página do mesmo domínio

---

## Script Completo: scrape-drive-aquapor-v6.js

### Como Usar
1. Abrir `https://scoring.datagolf.pt/pt/tournaments.aspx` no browser
2. Abrir DevTools → Console
3. Colar o script inteiro
4. Aguardar ~3-5 minutos
5. Dois ficheiros JSON são descarregados automaticamente

### Fases do Script
1. **Fase 1**: Pesquisa `"drive"` e `"aquapor"` no TournamentsLST, filtra por ano e acrónimo
2. **Fase 2a**: Para cada torneio, busca classificação via ClassifLST
3. **Fase 2b**: Para cada jogador com score válido, busca scorecard via ScoreCard
4. **Fase 3**: Exporta `drive-data.json` e `aquapor-data.json`

### Estrutura do Output

```json
{
  "lastUpdated": "01/03/2026",
  "source": "scoring.datagolf.pt",
  "circuit": "drive",
  "totalTournaments": 37,
  "totalPlayers": 366,
  "totalScorecards": 340,
  "tournaments": [
    {
      "name": "1º Torneio DRIVE Tour Sul Sub 16",
      "ccode": "988",
      "tcode": "10292",
      "date": "2026-01-15",
      "campo": "Laguna Golf Course",
      "series": "tour",
      "region": "sul",
      "escalao": "Sub 16",
      "num": 1,
      "rounds": 1,
      "playerCount": 12,
      "players": [
        {
          "scoreId": "2915",
          "pos": 1,
          "name": "Rodrigo Sousa Correia",
          "club": "Estoril",
          "grossTotal": 72,
          "toPar": -1,
          "hcpExact": 3.2,
          "hcpPlay": 3,
          "fedCode": "44934",
          "courseRating": 71.8,
          "slope": 135,
          "teeName": "BRANCAS",
          "teeColorId": 1,
          "parTotal": 72,
          "nholes": 18,
          "course": "Laguna Golf Course",
          "roundScores": [
            {
              "round": 1,
              "gross": 72,
              "scores": [5,3,4,3,3,4,4,4,4,5,4,2,4,4,5,5,4,5],
              "pars": [5,3,4,3,4,4,4,5,4,5,4,3,4,4,5,4,3,4],
              "si": [16,12,4,6,8,18,10,14,2,17,7,5,1,3,13,15,11,9],
              "meters": [480,133,357,196,315,300,321,474,378,484,372,181,405,334,507,354,153,377],
              "courseRating": 71.8,
              "slope": 135,
              "teeName": "BRANCAS",
              "teeColorId": 1
            }
          ]
        }
      ]
    }
  ]
}
```

### Detecção Automática de Metadados
```javascript
// Série (tour vs challenge)
const series = /challenge/i.test(name) ? "challenge" : "tour";

// Escalão
const escalao = name.match(/Sub\s*(\d+)/i)?.[1]; // "Sub 16" → 16

// Número do torneio
const num = name.match(/(\d+)º/)?.[1]; // "1º" → 1

// Região (pelo club_code)
const region = regionMap[ccode]; // "988" → "sul"
```

---

## Dados Conhecidos (Março 2026)

### DRIVE 2026
- ~37 torneios (5 regiões × ~7-8 jornadas)
- ~366 jogadores únicos
- Séries: Tour + Challenge
- Escalões: Sub 10, Sub 12, Sub 14, Sub 16, Sub 18
- Regiões: Norte (987), Tejo (985), Sul (988), Madeira (982), Açores (983)

### AQUAPOR 2026
- Circuito profissional/sénior
- Torneios em campos do Algarve (Morgado Golf, etc.)
- Jogadores com HCP muito baixo ou profissional
- Tipicamente 2 rondas por torneio
- ~79 jogadores no primeiro torneio

### Volume Total
- ~3644 registos "drive" na base de dados (todos os anos)
- ~13 registos "aquapor" (todos os anos)

---

## Notas Técnicas Importantes

1. **Delay entre pedidos**: 150ms mínimo para evitar rate limiting
2. **Paginação**: 50/página para torneios, 150/página para classificações
3. **Jogadores NS/DQ/WD**: `score_status_id === 99` ou `classif_pos === "NS"` — saltar scorecards
4. **Torneios futuros**: Aparecem na lista mas têm 0 jogadores — tratar graciosamente
5. **Deduplicação**: Mesmos torneios podem aparecer em múltiplas regiões — dedup por `tcode`
6. **Multi-ronda**: AQUAPOR tem 2 rondas — buscar scorecard para `classifround` 1 e 2
7. **Debug**: O script guarda dados em `window._driveData` e `window._aquaporData`
8. **federated_code**: Só disponível via ScoreCard, não via ClassifLST

---

## Histórico de Versões do Scraper

| Versão | Estado | Funcionalidades |
|--------|--------|-----------------|
| v1-v3 | Descartados | Tentativas iniciais com endpoints errados |
| v4 | ✅ Funcional | Torneios + Classificações (sem scorecards) |
| v5 | ❌ Falhou | Tentou adicionar scorecards mas quebrou TournamentsLST (params errados) |
| v6 | ✅ Funcional | Versão completa: Torneios + Classificações + Scorecards |

### Lição Principal da v5→v6
A v5 falhou porque ao refactorizar o código para adicionar scorecards, alterou inadvertidamente os parâmetros do TournamentsLST que funcionavam na v4:
- `ccode` em vez de `ClubCode`
- Faltava query string
- `tournament_date DESC` em vez de `started_at DESC`
- Faltavam campos obrigatórios
- Valores numéricos em vez de strings

**Regra**: Nunca alterar código que funciona ao adicionar funcionalidades. Copiar os padrões exactos.
