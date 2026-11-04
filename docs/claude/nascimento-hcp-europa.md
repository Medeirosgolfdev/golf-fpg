# Nascimento, clube e HCP dos juniores europeus — fontes públicas por país (03/11/2026)

Pedido dela («o que mais se consegue descobrir?» → «vamos fazer todos»). O que há
de público por país, o que entrou no Kids 2 e o que não vale a pena.

| País | Fonte | Dá | Entrou |
|---|---|---|---|
| Suécia | golfdata.se (ranking SGF) | data de nascimento, clube (13+ e adultos) | `scrape-golfdata-se.js` → `golfdata-se.json` → `util/golfdata-se.js` |
| Suécia | GolfBox customers 4/7 | data, clube | já estava (`build-golfbox-players.js`) |
| Suécia | golfing.se | clube, provas de clube (sem HCP) | à mão (fichas manuais `golfing-<id>`) |
| Suécia | Min Golf | HCP, inscritos | ✗ pede Golf-ID |
| Alemanha | DGV-Jugendrangliste (no site do EGR) | ano de nascimento, clube (AK18 e AK14) | `scrape-dgv-rangliste.js` → `dgv-rangliste.json` → `util/dgv-rangliste.js` |
| Alemanha | provas DGV (JobFile `dgv_*.json`) | HCP por prova | `util/jobfile.js` → hcpHistory |
| Suíça | GolfBox customer 1085 (Swiss Golf) | data, clube, federado | `build-golfbox-players.js` (+1 004 jogadores) |
| Dinamarca / Noruega | GolfBox OoM (DGU 264173; NGF Srixon U15 275583 / U19 275581) | data, clube, HCP actual | não feito — os mesmos miúdos já vêm das provas (customers 15 e 18) |
| França | Mérite Jeunes (lista + ficha) | ano exacto (categoria), Index | `scrape-ffgolf-merite.js` abre também a ficha dos rapazes não classificados de 2010–2018; `sources/ffgolf.js` lê o ano e o Index (04/11/2026) |
| Itália | Federgolf (inscritos, classificação) | índice por prova | já estava (`fig.js`, campo `indice`; `hcp` é o de jogo) |
| Áustria, Finlândia, Países Baixos | — | — | ✗ atrás de login ou sem lista pública |
| Inglaterra | intelligentgolf (listas de inscritos) | HI de parte dos inscritos | já estava (`hcp-listas`) |

## Regras

- **Ano/data de um ranking de federação é CERTO** (`birthYear`, `birthYearSource`
  «dgv-rangliste»; `dob` do golfdata). Só completa fichas sem data/ano; o scout
  continua a recusar um ano que contradiga os escalões USKids (`ne`).
- **Homónimos:** golfdata — só um jogador com o mesmo apelido e primeiro nome, e o
  nome único entre as fichas suecas; data de júnior (≥ 2004). DGV — a federação
  marca homónimos com «(R)»; com vários candidatos decide o clube, sem ele não se
  escolhe (Luis Maier de Reutlingen ≠ o de München, os dois de 2013).
- **GolfBox: 1 de Janeiro = sem data.** 177 de 14 611 datas caíam a 1/1 (4× um dia
  normal; «1920-01-01»; Luis Maier «2014-01-01» quando a DGV diz 2013) — é o
  preenchimento por omissão. O `build-golfbox-players.js` grava agora sem elas, é
  aditivo (`--customers 1085` não apaga as outras federações) e tem guarda.
- **HCP de cada prova, com data, em todas as fontes** — peça `util/hcp-historico.js`
  e o `jobfile.js` (ver kids2-agregador.md). Juniores com HCP datado 14 791 → 18 442.
- Pedidos sempre um a um com pausa (golfdata 3 s; EGR/DGV 3 s); nada de logins.

## Efeito (03/11/2026)

Datas de nascimento 7 098 → 7 541; anos certos 792 → 1 694 (919 alemães pela DGV);
só estimados 4 072 → 4 006. Suíços do Spanish Open/Venice: Hugo Strasser 12/05/2014,
Henry Liechti 20/12/2014, Haqvin Sylven 18/04/2014, Maximilien Demole 18/06/2014.
