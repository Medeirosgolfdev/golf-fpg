# Documentação completa das APIs FPG e golf-portugal.pt

> **Data da investigação:** 14 de Abril de 2026
> **Resumo executivo no `CLAUDE.md`** (secção "FPG — APIs em tempo real")
> **Este ficheiro:** registo exaustivo de tudo o que descobrimos para
> evitar redescobrir mais tarde.

---

## Índice

1. [Os dois websites gémeos da FPG](#1-os-dois-websites-g%C3%A9meos-da-fpg)
2. [Autenticação ASP.NET](#2-autentica%C3%A7%C3%A3o-aspnet)
3. [PageMethods descobertos](#3-pagemethods-descobertos)
4. [Diferenças críticas entre os gémeos](#4-diferen%C3%A7as-cr%C3%ADticas-entre-os-g%C3%A9meos)
5. [Padrão recomendado para nunca falhar](#5-padr%C3%A3o-recomendado-para-nunca-falhar)
6. [O proxy `golf-portugal.pt`](#6-o-proxy-golf-portugalpt)
7. [Por que não conseguimos copiar cookies do golf-portugal](#7-por-que-n%C3%A3o-conseguimos-copiar-cookies-do-golf-portugal)
8. [Estratégia final do nosso proxy](#8-estrat%C3%A9gia-final-do-nosso-proxy)
9. [Estatísticas do scraping de federados](#9-estat%C3%ADsticas-do-scraping-de-federados)
10. [Comportamentos observados (erros, status codes)](#10-comportamentos-observados-erros-status-codes)
11. [Ficheiros relacionados](#11-ficheiros-relacionados)
12. [Lições aprendidas](#12-li%C3%A7%C3%B5es-aprendidas)
13. [O backoffice clubarea (`1Page.aspx` + HMAC)](#13-o-backoffice-clubarea-1pageaspx--hmac)

---

## 1. Os dois websites gémeos da FPG

A FPG mantém **dois sistemas paralelos** que servem o mesmo backend de dados
(handicaps, rondas, federados) com diferenças subtis no path e auth.

| Aspecto | `scoring.datagolf.pt` | `my.fpg.pt` |
|---|---|---|
| Domínio | `scoring.datagolf.pt` | `my.fpg.pt` |
| Path base | `/pt/` | `/Home/` |
| Auth | Cookie ASP.NET via GET inicial (público) | **Login SSO obrigatório** via `area.my.fpg.pt/login/` |
| Tecnologia | ASP.NET + jTable | ASP.NET + jTable (mesma versão) |
| Server header | `Microsoft-IIS/10.0` | `Microsoft-IIS/10.0` |
| `x-powered-by` | `ASP.NET` | `ASP.NET` |
| CORS | `Access-Control-Allow-Origin: *` | `Access-Control-Allow-Origin: *` |
| Estabilidade | Mais estável (público) | Pode requerer re-login |
| Quando usar | Acesso público / scripts batch | User logado pessoal |

**Conclusão:** São o **mesmo backend** com dois "frontends" diferentes. Os
PageMethods existem em ambos com nomes idênticos, mas há detalhes (ver §4)
que exigem código adaptado por gémeo.

---

## 2. Autenticação ASP.NET

### Cookies envolvidos

| Cookie | Visibilidade | Uso |
|---|---|---|
| `ASP.NET_SessionId` | Visível (não httpOnly) | Identifica a sessão ASP.NET |
| Outros validadores | **httpOnly** (invisíveis a JS) | Anti-CSRF / state validation |
| `_ga`, `_LLMN8JTFJ6`, `_SBKT3JPZ7V` | Visíveis | Google Analytics tracking |

### O que cada GET seta (testado server-side e browser)

| URL | Status | Set-Cookie | Body |
|---|---|---|---|
| `scoring.datagolf.pt/pt/` | 500 (Runtime Error) | nenhum | "Server Error in '/pt' Application" |
| `scoring.datagolf.pt/pt/Default.aspx` | 404 | nenhum | — |
| `scoring.datagolf.pt/pt/PlayerWHS.aspx?no=X` | 500 (sem sessão prévia) | nenhum | "Runtime Error" |
| **`scoring.datagolf.pt/pt/FederatedsList_V2.aspx`** | **200 (Param Error esperado)** | **`ASP.NET_SessionId=...`** | "Erro 999 — autenticação inválida" mas seta cookie |
| `scoring-pt.datagolf.pt/scripts/datalinkpt.html?...` | 200 | nenhum | wrapper iframe |
| `my.fpg.pt/Home/PlayerWHS.aspx?no=X` (sem login) | 302 → login | sessão SSO |  — |

**A URL canónica para obter cookie ASP.NET fresca via Node fetch é
`scoring.datagolf.pt/pt/FederatedsList_V2.aspx`** — paradoxalmente devolve
"Param Error" no body mas seta o `Set-Cookie` que precisamos.

### Por que cookie sozinho não chega para PageMethods

Mesmo com `ASP.NET_SessionId` válido, POSTs aos PageMethods individuais
(`PlayerWHS.aspx/HCPWhsFederLST` etc.) devolvem:
```json
{"d":{"Result":"ERROR","Message":"Error executing child request for Param_Errors.aspx."}}
```

Tentámos exaustivamente e **nenhum dos seguintes desbloqueia**:
- Referer dinâmico (`/pt/PlayerWHS.aspx?no=X`)
- `Sec-Fetch-Site: same-origin` + `Sec-Fetch-Mode: cors` + `Sec-Fetch-Dest: empty`
- `Sec-Ch-Ua`, `Sec-Ch-Ua-Mobile`, `Sec-Ch-Ua-Platform`
- `Priority: u=1, i`
- `Accept-Encoding: gzip, deflate, br`
- User-Agent realista

**Causa provável:** sessões FPG são **IP-bound**. O servidor IIS regista
o IP que criou a sessão (no GET inicial) e só aceita PageMethods do mesmo IP.
Server-side fetch a partir de máquinas diferentes (Vercel, localhost) não
consegue herdar a sessão criada por outro IP.

**Confirmação experimental:** quando o browser tem `credentials: include`,
o POST funciona — porque o browser tem cookies httpOnly setados em
visitas anteriores (provavelmente via JavaScript da página + redirects)
**e** o IP do browser foi o que criou a sessão original.

---

## 3. PageMethods descobertos

Todos em `PlayerWHS.aspx/<MétodoNome>` (POST JSON). Listo formato + campos
da resposta.

### `HCPWhsFederLST` — Lista de rondas WHS

```http
POST /pt/PlayerWHS.aspx/HCPWhsFederLST?fed_code=52884
Content-Type: application/json; charset=utf-8
X-Requested-With: XMLHttpRequest

{ "fed_code": "52884", "jtStartIndex": "0", "jtPageSize": "100", "jtSorting": "hcp_date DESC" }
```

Devolve `{ d: { Result: "OK", Records: [...], TotalRecordCount: N } }`.

**38 campos por ronda (sample do Manuel)**:
```js
{
  id: 2875259,
  score_id: 4244840,           // ← usar em ScoreCard
  federated_code: "52884",
  modif_type: 1,
  tourn_name: "4º Torn.Drive Challenge Madeira-Porto Santo-Sub 12",
  movhcp: 500,
  hcp_date: "/Date(1775948400000)/",
  hcp_dateStr: "2026-04-12",
  mov_date: "/Date(1775995440000)/",
  mov_dateStr: "2026-04-12 13:04:00.000",
  tournament_id: 292384,
  tournament_code: "10218",
  course_description: "Porto Santo Golfe",
  play_handicap: 0,
  par: 36,
  cba: 0,
  score_status_id: 10,
  score_origin_id: 1,
  net_difference: -3,
  prev_handicap: 10,
  new_handicap: 10,
  comment: "",
  holes: 9,
  exact_handicap: 10,
  stableford: 15,
  scoring_type_id: 1,            // ← usar em ScoreCard
  competition_type_id: 10,        // ← usar em ScoreCard
  score_origin: "Torn",
  score_status: "OK",
  sgd: 14,                       // Score Gross Differential
  calc_calculated_hcp: 10,
  calc_score_avg: 10,
  calc_qty_scores: 20,
  calc_qty_scores_calc: 8,
  calc_adjust_total: 0,
  calc_low_hcp: 9.3,
  calc_hcp_softcap: 10,
  calc_hcp_hardcap: 10,
}
```

### `ScoreCard` — Scorecard hole-by-hole

```http
POST /pt/PlayerWHS.aspx/ScoreCard?score_id=4244840
Content-Type: application/json

{ "score_id": "4244840", "scoringtype": "1", "competitiontype": "10" }
```

`scoringtype` e `competitiontype` vêm de cada record da lista WHS
(`scoring_type_id`, `competition_type_id`).

**Campos hole-by-hole (sample)**:
```js
{
  id: 4244840,
  score_id: "1822",
  score_id_pairs: "1822",
  federated_code: "52884",
  player_name: "Manuel Goulartt Medeiros",
  player_acronym: "Santo da Serra",
  player_club_code: "007",
  tournament_code: "10218",
  tournament_description: "...",
  round_number: 1,
  course_description: "Porto Santo Golfe",
  played_at: "/Date(1775948400000)/",
  par_total: 36,
  course_rating: 31.6,
  slope: 110,
  tee_color_id: 80,
  tee_name: "VERDES",
  exact_hcp: 10,
  play_hcp: 0,
  cba: 0,
  hole_count: 9,
  nholes: 9,
  starting_hole_index: 1,
  scoring_type: "Gross",
  scoring_type_id: 1,
  competition_type: "Individual",
  competition_type_id: 10,
  score_origin: "Torn",
  score_status: "V",
  gross_total: 39,
  penalty: 0,

  // Hole-by-hole (1..18, null em buracos não jogados):
  par_1: 4, par_2: 4, par_3: 5, ..., par_18: 0,
  gross_1: 4, gross_2: 4, gross_3: 6, ..., gross_18: null,
  stroke_index_1: 2, ..., stroke_index_18: 0,
  meters_1: 250, meters_2: 260, ..., meters_18: 0,
  stbgross_1: 2, ..., stbgross_18: null,        // stableford gross
  stbnet_1: 2, ..., stbnet_18: null,            // stableford net
  bogey_1: 0, bogey_2: 0, bogey_3: -1, ...      // bogey competition scoring
}
```

### `View20Scores` — As 20 rondas usadas no cálculo WHS

```http
POST /pt/PlayerWHS.aspx/View20Scores?fed_code=52884
{ "fed_code": "52884" }
```

### `ViewWHSCalc` — Cálculo detalhado do HCP

```http
POST /pt/PlayerWHS.aspx/ViewWHSCalc?fed_code=52884
{ "fed_code": "52884" }
```

### `FederatedsList_V2.aspx/HandicapsLST` — Lista de federados

```http
POST /pt/FederatedsList_V2.aspx/HandicapsLST
{
  name: "", fedno: "",
  ClubCode: "0",
  FedStat: "9",       // 0=Todos, 5=Falecido, 7=Inativo, 9=Ativo
  Gender: "0",        // 0=Todos, M, F
  Agelev: "0", HcpStat: "0", FHcp: "", THcp: "",
  ProAm: "0", IniFlag: "0", FAge: "", TAge: "",
  Permit: "", MaxResults: "0",
  MessMax: "Demasiados resultados...",
  jtStartIndex: "0", jtPageSize: "100", jtSorting: "name ASC"
}
```

**Limite real do servidor:** `jtPageSize` máximo é **100**. Acima devolve
HTTP 500. Para scrape completo (15.646 activos), iterar com pageSize=100.

**32 campos por federado** — ver `scripts/scrape-federados.js` para o
mapeamento completo. Campos críticos:
- `federation_code` (ex: "52884")
- `federation_number` (ex: "0052884", 7 dígitos com zeros)
- `name`, `gender`, `birthdate` (`/Date(ms)/`)
- `admission_date` (`/Date(ms)/`)
- `club_code`, `club_name`, `acronym`
- `country_prefix`, `country`
- `hcp_exact`, `hcp_index`, `hcp_status`, `hcp_type` (sempre "EGA")
- `age_level` (SUB10, SUB12, ..., MidAmateur, Senior, SuperSenior)
- `player_type` (Amador / Profissional)
- `federated_status` (Ativo / Inativo / Falecido)
- `rounds_current_year`
- `photo` (path relativo)
- `last_hcp_date`
- **`encryptedfedcode`** — token único usado em URLs internos

---

## 4. Diferenças críticas entre os gémeos

**Esta é a parte mais importante deste documento.** Vai poupar horas no futuro.

### Tabela comparativa do POST WHS

| Aspecto | `scoring.datagolf.pt/pt/` | `my.fpg.pt/Home/` |
|---|---|---|
| URL do listAction | `/pt/PlayerWHS.aspx/HCPWhsFederLST?fed_code=X` | `/Home/PlayerWHS.aspx/HCPWhsFederLST?fed_code=X&pp=N` |
| Param `pp:"N"` na URL | inexistente | **obrigatório** |
| Body do POST WHS | `{ fed_code, jtStartIndex, jtPageSize, jtSorting }` | `{ fed_code, pp:"N", jtStartIndex, jtPageSize }` |
| Param `pp:"N"` no body | rejeitado (ou ignorado) | **obrigatório** |
| `jtSorting` no body | obrigatório (`"hcp_date DESC"`) | **rejeitado** (HTTP 500 se incluído) |
| Default jtPageSize | 25 | 100 |

### Exemplos lado-a-lado

**`scoring.datagolf.pt`** ✅ funciona:
```js
fetch("/pt/PlayerWHS.aspx/HCPWhsFederLST?fed_code=52884", {
  method: "POST",
  body: JSON.stringify({
    fed_code: "52884",
    jtStartIndex: "0",
    jtPageSize: "25",
    jtSorting: "hcp_date DESC"
  })
});
```

**`my.fpg.pt`** ✅ funciona:
```js
fetch("/Home/PlayerWHS.aspx/HCPWhsFederLST?fed_code=52884&pp=N", {
  method: "POST",
  body: JSON.stringify({
    fed_code: "52884",
    pp: "N",                  // ← obrigatório
    jtStartIndex: "0",
    jtPageSize: "100"
    // jtSorting OMITIDO  ← se incluir → HTTP 500
  })
});
```

**Erro típico de hardcoding:** copiar o body do `scoring.datagolf.pt` e
usar contra `my.fpg.pt` → **HTTP 500 Internal Server Error**.

---

## 5. Padrão recomendado para nunca falhar

Em vez de hardcoding, **descobrir o endpoint dinamicamente** na própria
página. Funciona em ambos os gémeos sem alterações:

```js
// Em qualquer página com jTable carregado (ex: PlayerWHS.aspx)
const parent = document.querySelector(".jtable-main-container").parentElement;
const jt = jQuery.data(parent, "hik-jtable");
const listAction = jt.options.actions.listAction;
// → "/pt/PlayerWHS.aspx/HCPWhsFederLST?fed_code=52884"
//   OU
//   "/Home/PlayerWHS.aspx/HCPWhsFederLST?fed_code=52884&pp=N"

// Construir URL absoluto
const u = new URL(listAction, location.href);

// Extrair params extra (todos excepto jt*)
const extraParams = {};
for (const [k, v] of u.searchParams) {
  if (!k.startsWith("jt")) extraParams[k] = v;
}

// Body do POST = extras (incluindo pp:"N" se existir) + paging
const body = {
  ...extraParams,            // fed_code, pp (se my.fpg.pt), etc.
  jtStartIndex: "0",
  jtPageSize: "100",
  // NOTA: NÃO incluir jtSorting incondicionalmente — my.fpg.pt rejeita
};

// O fed_code dinâmico (substituir pelo jogador alvo na URL):
const url = u.pathname + u.search.replace(/fed_code=\d+/, `fed_code=${targetFed}`);

const response = await fetch(url, {
  method: "POST",
  credentials: "include",     // envia cookies httpOnly do browser
  headers: {
    "Content-Type":     "application/json; charset=utf-8",
    "X-Requested-With": "XMLHttpRequest",
  },
  body: JSON.stringify(body),
});
```

**Implementação canónica:** `scripts/console-fpg-whs-scrape.js` faz exactamente
isto. Sempre que precisares de tocar em endpoints FPG, copia o padrão.

---

## 6. O proxy `golf-portugal.pt`

Site externo que **proxia a FPG** e expõe REST limpa sem auth.

### Infraestrutura (deduzida dos response headers)

| Header | Valor exemplo | Significado |
|---|---|---|
| `server` | `envoy` | Proxy Envoy (Cloud-native) |
| `via` | `1.1 google` | Google Cloud Run / Cloud Functions |
| `x-cloud-trace-context` | UUID-base64 | Google Cloud Tracing |
| `cdn-cache-status` | `miss` / `hit` | Google Cloud CDN |
| `cache-tag` | `678160687113, 678160687113:backend` | Tag de cache backend |
| `x-cookie-provider` | `FPG` | Identifica o backend (FPG) |
| `x-cookie-session-id` | `ASP.NET_SessionId=gmjub...` (42 chars) | **Cookie ASP.NET FPG real** |
| `x-cookie-timestamp` | `1776189036719` (ms epoch) | Momento da request actual |
| `x-cookie-version` | `20260307-1` | Versão da pool de sessões |

### Endpoints REST (sem auth)

| URL | Devolve |
|---|---|
| `/api/clubs/{any_code}/players/{fed}` | Perfil completo (32 campos, mesmos do `FederatedsList_V2.aspx`) |
| `/api/clubs/{any_code}/players/{fed}/results?startIndex=0&limit=N` | Lista de rondas WHS (proxia `PlayerWHS.aspx/HCPWhsFederLST`) |
| `/api/clubs/{any_code}/players/{fed}/handicaps` | Histórico de movimentos de HCP |
| **`/api/scorecards/{score_id}`** | **Scorecard hole-by-hole completo** (proxia `PlayerWHS.aspx/ScoreCard`) |

**Observações importantes:**
- O `{any_code}` é praticamente ignorado — qualquer código válido funciona;
  o servidor filtra pelo `{fed}`. Convenção: usar `144`.
- Limite implícito: testado até `limit=200`, funciona OK.
- Resposta para `results` está em formato jTable: `{ Result: "OK", Records: [...], TotalRecordCount: N }`.
- Resposta para `scorecards` está no mesmo formato: `{ Result: "OK", Records: [scorecard] }`.
- Resposta para `players/{fed}` é **array** com 1 elemento (o jogador).
- **Campos das rondas são DIFERENTES dos da FPG directa**:
  - FPG: `tourn_name`, `course_description`, `hcp_dateStr`, `new_handicap`, `stableford`, `sgd`, `score_origin`
  - GP: `tournament_description`, `course_description`, `score_dateStr`, `calc_hcp_index`, `calculated_stablnet_total`, `score_differential`, `score_origin`
- CORS: **MISSING** — `Access-Control-Allow-Origin` não é enviado, pelo que
  fetch cross-origin de browser falha. Necessita proxy server-side.

### Erros transitórios

Quando o backend deles tem hiccup:
```json
HTTP 500
{"error":"Failed to fetch player results"}
```

Acontece raramente (testámos 7 fed codes diferentes — 0 falhas). Quando
acontece, retry com backoff resolve. O nosso proxy faz 2 retries com
500ms / 1s e tenta múltiplos club codes.

---

## 7. Por que não conseguimos copiar cookies do golf-portugal

A descoberta tentadora: o header `x-cookie-session-id` **expõe literalmente
`ASP.NET_SessionId=XYZ`** — o cookie real do FPG.

Testámos passar esse valor como `Cookie` no nosso POST directo ao FPG:

```js
const stolenCookie = "ASP.NET_SessionId=gmjub...";
fetch("https://scoring.datagolf.pt/pt/PlayerWHS.aspx/HCPWhsFederLST?fed_code=52884", {
  method: "POST",
  headers: { ..., "Cookie": stolenCookie },
  body: ...
});
```

**Resultado: HTTP 200 com `"Error executing child request for Param_Errors.aspx"`** —
o mesmo erro de "sem auth".

### Hipótese mais provável: **IP-binding**

O servidor IIS da FPG provavelmente regista o IP de origem no momento
em que cria a sessão. POSTs subsequentes só são aceites do **mesmo IP**.

Como golf-portugal corre em Google Cloud Run com IPs deles, e o nosso
proxy tenta usar o cookie de IPs Vercel/locais → o servidor FPG rejeita.

**Confirmação indirecta:**
- Pool versionada (`x-cookie-version: 20260307-1` há 5 semanas) sugere
  que golf-portugal mantém **N sessões** em simultâneo, todas criadas
  e usadas dos seus IPs internos.
- Eles próprios não expõem outros cookies (httpOnly?) que pudessem
  validar a sessão para outros IPs.

### Outras hipóteses descartadas

- ❌ Cookie validador adicional invisível: testámos passar **todos** os
  cookies que conseguimos extrair do browser do user — mesmo erro.
- ❌ Sec-Fetch-* headers: testámos várias combinações — sem efeito.
- ❌ User-Agent / Sec-Ch-Ua-*: idem.
- ❌ Origin / Referer headers: testámos múltiplas variantes — sem efeito.

---

## 8. Estratégia final do nosso proxy

Implementada em `api/datagolf.js` + `src/data/datagolfClient.ts`.

### Ordem de tentativa

1. **Primário: golf-portugal.pt**
   - Sem auth, REST limpa, rápido
   - Retry com 5 club codes diferentes (`144`, `000`, `001`, `007`, `170`)
   - 2 retries com backoff 500ms/1s em caso de HTTP 500 transitório
   - Cache HTTP 600s + stale-while-revalidate 1h

2. **Fallback: scoring.datagolf.pt** (datagolf directo)
   - Tenta com cookies de `api/.datagolf-cookies.json` (gerado por Playwright)
   - Se ficheiro não existe ou cookies expiraram → tenta GET para obter
     `ASP.NET_SessionId` fresca (não chega para PageMethods, mas tentamos)
   - Cache de sessão em memória 5 min

### Envelope de resposta

Sempre o mesmo formato:
```json
{ "ok": true, "data": [...], "source": "gp" | "datagolf" }
```

Header `X-Data-Source: gp|datagolf` indica qual backend serviu a resposta.

### API pública do proxy

```
GET /api/datagolf?action=whs&fed=52884[&limit=200]
GET /api/datagolf?action=scorecard&score_id=4244840
GET /api/datagolf?action=profile&fed=52884
GET /api/datagolf?action=handicaps&fed=52884
```

Endpoints de debug (úteis para troubleshooting):
```
GET /api/datagolf?action=debug_session
GET /api/datagolf?action=debug_post&fed=52884
GET /api/datagolf?action=debug_fpg_direct&fed=52884
GET /api/datagolf?action=force_datagolf&fed=52884
```

### Cliente JS (`src/data/datagolfClient.ts`)

```ts
import { getPlayerHistory, getScorecard, getProfile, getHandicaps } from "@/data/datagolfClient";

const rondas = await getPlayerHistory("52884");
const [sc] = await getScorecard(rondas[0].id);
const par_array = [sc.par_1, sc.par_2, ..., sc.par_18];
```

Cache em memória (session-scoped) + leitura preferencial de
`public/data/fpg-whs.json` (gerado pelo console script — instantâneo).

---

## 9. Estatísticas do scraping de federados

### Activos (FedStat=9)

- **Total: 15.646 federados**
- 12.348 masculinos, 3.298 femininos
- Por escalão:
  - Senior: 7.313 · SuperSenior: 4.644 · MidAmateur: 2.225
  - Sub-21: 207 · Sub-10: 300 · Sub-12: 192
  - Sub-14: 218 · Sub-16: 218 · Sub-18: 181
  - Sub-24: 148
- Por país (top): PT 9.030 · GB 1.663 · IE 617 · SE 491 · DE 455
- 100% têm `birthdate`
- 100% têm `encryptedfedcode`
- Estrangeiros (não-PT): 6.616 (~42%)

### Inactivos (FedStat=7)

- **Total: 43.054 federados**
- ~30 mil fizeram parte mas deixaram de pagar quotas
- 100% têm `birthdate`

### Falecidos (FedStat=5)

- ~5.000 (não scrapado em detalhe)

### Histórico FPG aproximado: **~58.700 federações alguma vez registadas**

### Limite jtPageSize do servidor

| pageSize | Funciona? | Tempo |
|---|---|---|
| 100 | ✅ | ~0.7s |
| 200 | ❌ HTTP 500 | — |
| 500 | ❌ HTTP 500 | — |
| 1000 | ❌ HTTP 500 | — |

Para scrape completo (15.646 activos): 157 calls × 100 = ~2 min total.

### Tempo de scrape real

- 15.646 activos: 5m 23s
- 43.054 inactivos: 21 min

---

## 10. Comportamentos observados (erros, status codes)

### Códigos de resposta esperados

| Cenário | Status | Body |
|---|---|---|
| GET `/pt/` (sem nada) | 500 | "Server Error in '/pt' Application" |
| GET `/pt/Default.aspx` | 404 | empty |
| GET `/pt/PlayerWHS.aspx?no=X` (sem sessão) | 500 | "Runtime Error" |
| GET `/pt/PlayerWHS.aspx?no=X` (com sessão) | 200 | HTML com jTable + dados |
| GET `/pt/FederatedsList_V2.aspx` (sem sessão) | 200 | "Erro 999 — autenticação inválida" + Set-Cookie |
| POST PageMethod sem cookie | 200 | `{"d":{"Result":"ERROR","Message":"Param_Errors..."}}` |
| POST PageMethod sem auth válida | 200 | `{"d":{"Result":"ERROR","Message":"Param_Errors..."}}` |
| POST PageMethod com auth + body certo | 200 | `{"d":{"Result":"OK","Records":[...]}}` |
| POST PageMethod com `jtSorting` no `my.fpg.pt` | 500 | Internal Server Error |
| POST PageMethod com `pageSize > 100` | 500 | Internal Server Error |

### Mensagens de erro do FPG e seu significado

| Mensagem | Causa |
|---|---|
| "Erro 999 — Dados de autênticação inválidos" | Browser sem cookie ASP.NET válido |
| "Param Error" (página) | Página exigia query params em falta |
| "Server Error in '/pt' Application" | Path raiz não tem default route |
| "Error executing child request for Param_Errors.aspx" | PageMethod chamado sem sessão válida (servidor tenta redirect interno) |
| "Demasiados resultados. Por favor refine a pesquisa..." | (FederatedsList) `MaxResults` excedido |

### Detecção de bot

Não detectamos sinais activos (CAPTCHA, rate limiting visível). User-Agent
realista é suficiente. Tentámos User-Agents idênticos ao Chrome real e
funcionou consistentemente.

---

## 11. Ficheiros relacionados

### Código

- **`api/datagolf.js`** — proxy serverless com fallback golf-portugal → datagolf
- **`src/data/datagolfClient.ts`** — cliente TypeScript typed
- **`src/pages/JogadoresPage.tsx`** — `FederadoOnlyDetail` integra esta API
- **`vite.config.ts`** — middleware `/api/datagolf` para dev local

### Scripts

- **`scripts/console-fpg-whs-scrape.js`** — script para colar na consola
  (browser-side, usa sessão do user). **Implementação canónica do padrão
  recomendado** (descoberta dinâmica do endpoint).
- **`scripts/scrape-federados.js`** — scrape batch de federados activos
  (FedStat=9) via browser console
- **`scripts/scrape-federados-inativos.js`** — variante para inactivos (FedStat=7)
- **`scripts/refresh-datagolf-cookies.js`** — Playwright warmup (alternativa ao
  console script — ainda não validada com todas as auth subtleties)
- **`scripts/login.js`** — login interactivo na FPG (legado, para `scoring.fpg.pt`)

### Dados

- **`public/data/federados.json`** (15 MB, 15.646 activos)
- **`public/data/federados-inativos.json`** (41 MB, 43.054 inactivos)
- **`public/data/federados-inativos-stats.json`** (~25 KB, agregados)
- **`public/data/federados-inativos-jovens.json`** (~2.7 MB, Sub-10 a Sub-21)
- **`public/data/fpg-whs.json`** (gerado pelo console script — usar como cache
  local de rondas dos 396 jogadores)
- **`api/.datagolf-cookies.json`** (gerado pelo Playwright — gitignored)

### Configuração

- **`.env.local`** — `DATAGOLF_SESSION` (cookie ASP.NET fixo, expira em ~min;
  fallback raríssimo no proxy)

---

## 12. Lições aprendidas

1. **Nunca hardcodar paths/bodies de PageMethods FPG.** Sempre auto-descobrir
   via `jt.options.actions.listAction` da página. As subtilezas entre `/pt/`
   e `/Home/` quebram tudo silenciosamente.

2. **Os 2 sites são gémeos no nome, primos na implementação.** Mesma origem
   de dados, mas frontends ASP.NET separados com configurações diferentes.

3. **Sessão ASP.NET FPG é IP-bound.** Não há "atalho" para copiar cookie
   de outro IP. A única forma de fazer requests server-side é:
   - usar um proxy externo que mantém pool de sessões (golf-portugal.pt)
   - manter as nossas próprias sessões via Playwright local

4. **golf-portugal.pt é dádiva.** Eles fazem o trabalho pesado de manter
   sessões FPG vivas e rotativas. Para 99% dos casos, usar a API deles
   resolve. Só investir em alternativas se eles caírem permanentemente.

5. **Browser console > Playwright para casos manuais.** O user já tem o
   browser aberto e logado; um script pasted é mais fiável que automação
   headless (anti-bot, dependências, etc.).

6. **Documentar é vital aqui.** Cada uma destas descobertas custou tempo
   real. Sem este documento, redescobrir tudo demoraria as mesmas horas.

---

## 13. O backoffice clubarea (`1Page.aspx` + HMAC)

> **Data da descoberta:** 26 de Maio de 2026
> **Contexto:** investigação sobre se a FPG expõe e-mails de federados em
> algum endpoint adicional aos 32 campos públicos do `HandicapsLST`.
> Resposta curta: o e-mail existe no sistema mas vive atrás de um
> backoffice paralelo que **exige autenticação de admin de clube**.
> O esquema técnico abaixo está completo; só falta o cookie de role.

### 13.1 O que é

Para além das páginas públicas (`tournaments.aspx`, `Classifications.aspx`,
`PlayerWHS.aspx`, `FederatedsList_V2.aspx`) e dos entry-points modernos
`linkpage.aspx` documentados em §1–§5, a FPG mantém um **shell ASP.NET
único** em `scoring.fpg.pt/lists/1Page.aspx` que serve **38 páginas
distintas** de gestão de clube, escolhidas por um parâmetro `page=`.

É o backoffice que os administradores de clube usam para:
- Ver/editar perfis completos de federados (incluindo email, telefone,
  morada — campos NÃO expostos no `HandicapsLST` público)
- Gerir pagamentos de quotas
- Aprovar inscrições, fazer draws, lançar scores
- Calcular handicaps, propor novos federados, etc.

O router público que mapeia `page=X` para a URL completa do `1Page.aspx`
é `scoring.fpg.pt/lists/1ClubCall.html` — uma página HTML estática que
o browser pede e que executa um pequeno JavaScript para construir a URL
final via HMAC (ver §13.3).

### 13.2 Catálogo das 38 páginas (`page=` valores)

Extraído integralmente de `1ClubCall.html` (público, sem auth).
Agrupado por finalidade:

| Categoria | `page=` valores |
|---|---|
| **Federados (lista)** | `fedsearch`, `fedlist`, `fedlist_v2` |
| **Federado individual** | `federated`, `federated_v2`, `federated_v3` |
| **Federado — outras vistas** | `fedhcp`, `fedpayments`, `fedaudit`, `fedprop`, `init_hcp` |
| **Torneios** | `tournlist`, `tourndetail`, `tournclassif`, `livetourns`, `tourns`, `tourncalc` |
| **Inscrições / Draws** | `admissions`, `drawlist`, `drawsnext` |
| **Scores** | `scores`, `singlescores`, `singlescoresall`, `indivscore`, `confscore`, `confscoresclub` |
| **Rankings** | `ranklist`, `rankclassif`, `ranklistecl`, `rankclassifecl` |
| **HCP — gestão** | `calchcp`, `reviewfed`, `reviewclub`, `hcp_pref`, `freezes` |
| **Clubes e campos** | `clubs`, `courses`, `coursepcc`, `coursedailystatus` |
| **Sistema** | `users`, `roles`, `affrequest`, `tourn_sub_req`, `sacechamps`, `sacfcalc` |

**Páginas relevantes para o objectivo "obter emails":**

- `federated_v3` — perfil COMPLETO do federado (substitui v1/v2 antigos);
  quase de certeza expõe os campos email, telefone, morada que o
  `HandicapsLST` filtra.
- `fedpayments` — histórico de quotas e pagamentos; tipicamente inclui
  contacto para o admin de clube emitir recibos / cobrar.
- `fedprop` — proposta de novo federado; o formulário de inscrição
  obriga a email (que fica visível no perfil do proposto).

### 13.3 O esquema HMAC

Cada URL para o `1Page.aspx` é assinada com um HMAC-SHA1 que protege
contra adulteração trivial. **O algoritmo e o segredo estão no JS
público** `scoring.fpg.pt/lists/Scripts/DataGolfe.js`:

```js
// Excerto desofuscado de DataGolfe.js
function DataGolfeRedirect(user, page, param, callContext) {
    var SecretPass = '123';                          // ← segredo "secreto"
    var dt = new Date();
    var month = dt.getMonth() + 1;
    var day   = dt.getDate();
    var min   = dt.getMinutes();
    var dttomod = day.toString() + month.toString() + min.toString();
    var strtoenc = user + dttomod;
    var hmac = Crypto.HMAC(Crypto.SHA1, strtoenc, SecretPass);

    var partparam = "?user=" + user + "&dt=" + dttomod + "&page=" + page
                  + "" + param + "&hash=" + hmac;
    window.location.replace("1Page.aspx" + partparam);
}
```

Equivalente em Node/Python:

```python
import hmac, hashlib
from datetime import datetime
SECRET = "123"
user   = "admin"           # qualquer string — o servidor não valida o user aqui
now    = datetime.now()
dt     = f"{now.day}{now.month}{now.minute}"     # SEM zero-padding
h      = hmac.new(SECRET.encode(), (user+dt).encode(), hashlib.sha1).hexdigest()
url    = (f"https://scoring.fpg.pt/lists/1Page.aspx"
          f"?user={user}&dt={dt}&page=federated_v3"
          f"&fedno=52884&loggedfed=52884&pagelang=PT"
          f"&callcontext=clubarea&hash={h}")
```

⚠ **Janela temporal:** o hash incorpora `day+month+minute` (sem ano nem
hora). Tecnicamente colide a cada `60 × 24 × 31` = 44.640 minutos do
calendário, mas dentro de uma sessão de scraping é só uma string nova
por minuto. Gerar o hash fresco sempre que mude o `minute`.

### 13.4 Parâmetro `callcontext`

`1Page.aspx` aceita um `callcontext=` que define qual o "modo" da
sessão. Valores observados:

| `callcontext=` | Significado | Página que o seta |
|---|---|---|
| `clubarea` | Admin de clube — vê tudo do clube | `1ClubCall.html` (hardcoded) |
| `direct` | Entry-page público | `1EntryPage.aspx?...page=tournlist` |
| (omitido) | Vista pública | linkpage.aspx para tournaments |

Testei `public`, `direct`, `federate`, `playerarea`, `myarea`, `user`,
`self`, `fed`, e sem callcontext — todos devolvem o mesmo template
vazio para `page=federated_v3` sem cookie de admin. O `callcontext`
sozinho não muda o controlo de acesso, só sugere ao server qual o
layout/permissões a aplicar dentro da role já autenticada.

### 13.5 Autenticação em duas camadas

O servidor valida **duas coisas independentes**:

1. **HMAC do URL** — protecção contra adulteração de query string.
   Garante que o URL foi construído por um cliente que conhece o
   algoritmo (que é público desde a publicação do JS). Bloquear isto
   é trivial em qualquer linguagem.

2. **Sessão ASP.NET com role de admin de clube** — verificação real
   server-side. Sem ela, o `1Page.aspx` devolve HTTP 200 mas com
   template vazio (`<span id="label1"></span>` sem conteúdo).

**Evidência empírica (testado 2026-05-26):**

```
$ curl "https://scoring.fpg.pt/lists/1Page.aspx?user=admin&dt=26553&page=federated_v3
        &fedno=52884&loggedfed=52884&pagelang=PT&callcontext=clubarea&hash={H}"

HTTP/2 200
Content-Length: 715
Body: <!DOCTYPE html><html><head><title></title></head><body>
      <form method="post" action="..." id="form1">
      <input type="hidden" name="__VIEWSTATE" value="..." />
      <div><span id="label1"></span></div>
      </form></body></html>
```

Tentei com **todos** os nossos sets de cookies (`.datagolf-cookies.json`,
`.fpg-admissions-cookies.json`, `.scoring-datagolf-cookies.json`) — todos
capturados como utilizador anónimo/normal no Chrome 90. Em todos os casos
o response é o mesmo template vazio. Nenhum desses cookies tem a role
necessária.

**Quem teria essa role:**
- Staff administrativo da FPG central
- Administradores de clube (designados pelo próprio clube; a Mariana
  poderia ter esta role no CGSS Santo da Serra se o clube formalmente
  a nomeasse — vê apenas os ~270 sócios do CGSS, não a base toda)
- Comissões organizadoras de torneios pontuais (acesso temporário ao
  ccode/tcode específico)

### 13.6 Como construir o URL completo (referência)

Cada `page=` tem o seu conjunto de parâmetros, definidos no
`1ClubCall.html`. Resumo dos mais úteis:

```
page=federated_v3   →  &fedno=<F>&loggedfed=<F>&pagelang=PT&callcontext=clubarea
page=fedpayments    →  &fedno=<F>&pagelang=PT&callcontext=clubarea
page=fedhcp         →  &fedno=<F>&pagelang=PT&callcontext=clubarea
page=fedlist_v2     →  &ccode=<C>&param=<X>&pagelang=PT&callcontext=clubarea
page=fedsearch      →  &ccode=<C>&pagelang=PT&callcontext=clubarea
page=admissions     →  &ccode=<C>&tcode=<T>&pagelang=PT&callcontext=clubarea
page=tournclassif   →  &ccode=<C>&tcode=<T>&score=<S>&param=<O>&pagelang=PT&callcontext=clubarea
page=drawlist       →  &ccode=<C>&counting=<P>&pagelang=PT&callcontext=clubarea
page=tourndetail    →  &ccode=<C>&tcode=<T>&round=<R>&pagelang=PT&callcontext=clubarea
```

Lista completa em `scoring.fpg.pt/lists/1ClubCall.html` (consultar o
ficheiro JS quando duvidares).

### 13.7 Relação com o `linkpage.aspx` que já usamos

`linkpage.aspx` (documentado no `CLAUDE.md`) é um wrapper público mais
recente que internamente redirige para o `1Page.aspx` com
`callcontext=clubarea` mas usando uma **sessão pública sem role**
(o user "admin" é apenas uma string, não está logado). Por isso o
linkpage só consegue mostrar as páginas que não exigem role — admissions
(no modo público, sem contactos), classif (no modo público, sem cartões
completos), draws.

O `/api/debug/fpg/trace` do `golf-portugal.pt` (descoberto na mesma
investigação) confirma: o resolver oficial recebe um URL legacy
`linkpage.aspx?page=classif&...` e mapeia para
`1Page.aspx?user=admin&page=tournclassif&...&callcontext=clubarea&hash=...`.
A nota dele é literal:

> "Uses the live 1ClubCall JS redirect matrix instead of the broken
>  linkpage handler."

### 13.8 Implicação prática para emails de federados

Mesmo com o HMAC totalmente reproduzível, **não conseguimos automatizar
a recolha de e-mails** porque:

- Como utilizador público / federado normal, o `federated_v3` devolve
  template vazio.
- Como admin de clube, **só veríamos os e-mails do nosso próprio clube**
  (ccode=007 para o CGSS Santo da Serra), não a base de 15.646
  federados.
- A FPG central tem a base toda mas não há forma de scrapar isso sem
  ser staff.

A protecção real está na sessão server-side, não no HMAC público. Esta
documentação serve apenas para registar a arquitectura — não há aqui
um atalho para contornar a privacy policy da FPG.

### 13.9 Ficheiros públicos relevantes

| URL | O que é |
|---|---|
| `scoring.fpg.pt/lists/1ClubCall.html` | Router público com as 38 mappings de `page=` → parâmetros |
| `scoring.fpg.pt/lists/Scripts/DataGolfe.js` | Algoritmo HMAC + segredo `"123"` em claro |
| `scoring.fpg.pt/lists/Scripts/2.5.3-crypto-sha1-hmac.js` | Biblioteca crypto usada pelo `DataGolfe.js` |
| `scoring.fpg.pt/lists/1Page.aspx` | Shell ASP.NET único que renderiza todas as 38 páginas |
| `scoring.fpg.pt/lists/1EntryPage.aspx` | Entry-page público que setta `DG_Lists_URL` antes de redirigir para `linkpage.aspx` |
| `golf-portugal.pt/api/debug/fpg/trace` | Debug endpoint que mostra a resolução `linkpage → 1Page` em tempo real |
