# Golfe Juvenil no Reino Unido + Irlanda — Planeamento Manuel

**Data:** 28 Maio 2026
**Manuel:** 12 anos (nascido 29/04/2014)
**Objectivo:** Mapear circuitos e eventos onde o Manuel pode jogar agora (2026) e a planear para 2027.

---

## 1. Resumo executivo — 4 circuitos que importam

| Circuito | Idade 2026 | Idade 2027 | Plataforma | Aceita PT? |
|---|---|---|---|---|
| **Faldo Futures** | Boys 11-12 | ❌ acaba aos 12 | GolfGenius | ✅ (9 países em 2025) |
| **PING JGT** | Rookies (6-12) | Masters (13-15) | GolfGenius | ⚠️ confirmar por email |
| **BJGT** | 12-13 (a confirmar) | 12-13 (a confirmar) | BlueGolf | ✅ WAGR oficial |
| **Junior Tour Scotland** | Boys U14 | Boys U14 | DotGolf | ✅ via Scottish Golf App |

**Tours secundários:** PING Welsh Junior Tour (limitado, residents-focused); Golf Ireland Championships (Ulster Boys' U16, Faldo @ Lough Erne).

---

## 2. ⚡ Eventos AGORA (próximas 4 semanas) onde o Manuel pode tentar entrar

### Faldo Futures Regional Finals (escalão 11-12 Boys)

Os qualifiers já terminaram a 4 Mai. Para entrar num Regional Final, o Manuel teria de ter passado num qualifier. **Mas** — em 2025 a final teve 9 países, o que sugere que existe um caminho para internacionais (provavelmente via convite directo do organizador ou via parceria com a USKids). Vale escrever ao Faldo Series (info@faldoseries.com) a perguntar.

Regional Finals próximos onde estamos perto:
- **Hoje (28 Mai)** — Oulton Hall (East England) + Dyrham Park (North London)
- **29 Mai** — Macdonald Portal GC (North West)
- **31 Mai** — The Warwickshire GC (Midlands)
- **14 Jun** — Castle Royle GC (South)
- **20 Jun** — Lough Erne GC (N. Ireland)
- **27/28 Jun** — Crieff GC + Dalmahoy GC (Scotland)
- **26/27 Ago** — Final Nacional @ The Belfry (semana do British Masters)

### PING Junior Golf Tour — Rookies (6-12)

Próximos eventos **abertos** (não Sold Out) onde basta inscrição online (£29.99):
- **31 Mai** — Louth GC, Lincolnshire
- **23 Jul** — Wrekin GC, Shropshire
- **26 Jul** — Faversham GC (Kent) **ou** Nelson GC (Lancashire)
- **27 Jul** — Wilpshire GC, Lancashire
- **30 Jul** — Brokenhurst Manor, Hampshire
- **14 Ago** — Beamish Park GC, Durham
- **18 Ago** — Southern Cup (Major), Essendon Country Club
- **19 Ago** — Norwood Park, Notts
- **20 Ago** — Horsley Lodge, Derbyshire
- **23 Ago** — Melton Mowbray GC
- **30 Ago** — Minchinhampton (Major), Gloucestershire

**Verificar antes de inscrever:** se o PING JGT exige UK club membership ou se aceita um WHS handicap português qualquer.

### Junior Tour Scotland (Boys U14 = 2012-2015)

**Manuel é elegível em 2026 já**. Eventos ainda abertos:
- **27/28 Jun** — Hayston (54H)
- **11/12 Jul** — Tain (54H)
- **1/2 Ago** — Peterculter (54H)
- **15/16 Ago** — Hilton Park (54H)
- **22/23 Ago** — Kilspindie (36H)
- **5/6 Set** — Fraserburgh (54H, último qualifier OOM)
- **19/20 Set** — Baberton (54H)

**Entry:** Scottish Golf App, £40/evento. WHS de qualquer federação aceite. Eventos populares (Dornoch, Alyth, Musselburgh) já fecharam — recomenda-se criar conta na app **já** para construir "JT playing history" e ganhar prioridade em ballots futuros.

---

## 3. Planeamento 2027 (Manuel 13 anos, escalão Sub-14)

Quando Manuel passar a 13 anos a 29/04/2027:

| Circuito | Categoria 2027 | Notas |
|---|---|---|
| **PING JGT** | Masters Tour (13-15) | Transita de Rookies; novos formatos 18H |
| **BJGT** | 12-13 ainda (na última época) | Idade em 24 Jun do ano. Em 2028 sobe a 14-15. |
| **JTS** | Boys U14 ainda | U14 = 4 anos rolling window |
| **England Golf** | English U14 / Reid Trophy | County-level U14 |
| **Welsh U14 Championship** | Sim, se aceitar internacional | Verificar 1×/ano |
| **Faldo Futures** | ❌ acaba aos 12 | Manuel já não joga em 2027 |

**Primeira temporada Sub-14 (2027) — sugestão de calendário base:**
1. Janeiro-Abril: torneios FPG nacionais + Madeira + USKids europeu (Marco Simone, El Prat)
2. Maio: BJGT Telford 3-day (WAGR) — primeiro WAGR oficial
3. Junho-Setembro: 2-3 eventos PING JGT Masters Tour (UK) + 2-3 eventos Junior Tour Scotland
4. Julho-Agosto: USKids World Championship (US) ou European Championship
5. Setembro-Outubro: Tour Championship qualifiers + County events em England

---

## 4. Próximos passos no projecto Golf Portugal

### Já feito
- ✅ `public/data/uk-junior-catalog.json` — catálogo consolidado de 4 circuitos UK+IE com eventos 2026
- ✅ Esta nota de planeamento

### A fazer (por ordem de prioridade)

**Fase 1 — Scrapers Node puro (sem Playwright):**
- [ ] `scripts/scrape-junior-tour-scotland.js` — HTML estático (DotGolf server-rendered). Resultados, OOM, calendar.
- [ ] Extender `scripts/scrape-england-golf.js` para aceitar `--catalog` flag → usar `uk-junior-catalog.json` para PING JGT + Faldo Futures (ambos GolfGenius).

**Fase 2 — Scrapers Playwright:**
- [ ] Estender `scripts/scrape-bluegolf.js` para BJGT 2026 schedule (confirmar divisões 12-13!) + OOM por divisão.
- [ ] Novo scraper Wales (PING Welsh) — DotGolf JS-rendered.
- [ ] Novo scraper Golf Ireland — DotGolf JS-rendered.

**Fase 3 — UI no website:**
- [ ] Página `/uk` ou separar em `/ping`, `/faldo`, `/scotland`, `/wales`, `/ireland`.
- [ ] Reutilizar `CircuitShell` (já existe no projecto).
- [ ] Grupo "🇬🇧 Reino Unido" na NavBar.

**Fase 4 — Manuel-specific:**
- [ ] Cross-link `/jogadores/Manuel` com participações UK quando ele começar a jogar.
- [ ] Order of Merit tracking para BJGT 12-13 e JTS U14.

---

## 5. ⚠️ Aviso de verificação — divisões BJGT 2026

A nossa investigação preliminar indica que o BJGT mudou as divisões para 2026:
- **Antes:** 7&Under, 8-9, **10-11, 11-12, 13-14**, 15-16, 16-18
- **Provável 2026:** 7&Under, 8-9, 10-11, **12-13**, 14-15, 16-18 (acabou-se o 11-12 e o 13-14)
- **Age qualifying date:** 24 Junho 2026 (idade em 24/06)

Se confirmado: Manuel (12 a 29/04/2026, "not yet 14 on 24/06/2026") joga **12-13 division** em 2026 e ainda 12-13 em 2027. Só sobe a 14-15 em 2028.

**Confirmação requer correr `scrape-bluegolf.js`** contra `https://brjgt.bluegolf.com/bluegolf/brjgt26/schedule/index.htm?display=champ` no PC (o sandbox de Cowork não corre Playwright e é demasiado pesado para scrape).

---

## 6. Sources

- [Faldo Futures](https://www.faldoseries.com/the-faldo-futures/)
- [PING Junior Golf Tour Events 2026](https://pingjuniorgolftour.co.uk/events/)
- [PING JGT 2026 schedule announced](https://pingjuniorgolftour.co.uk/2026-schedule-announced/)
- [British Junior Golf Tour](https://juniorgolftour.co.uk/)
- [BJGT 2026 Tour Policy](https://juniorgolftour.co.uk/bjgt-2026-tour-policy/)
- [Junior Tour Scotland 2026 events](https://www.juniortourscotland.com/2026-events)
- [PING Welsh Junior Tour](https://www.walesgolf.org/ping-welsh-junior-tour)
- [Golf Ireland Championships Hub](https://www.golfireland.ie/championships-and-other-events-hub)
- [Golf Ireland 2026 Fixtures (GolferNI)](https://www.golferni.com/latest-news/golf-ireland-national-regional-championship-fixtures-2026)
