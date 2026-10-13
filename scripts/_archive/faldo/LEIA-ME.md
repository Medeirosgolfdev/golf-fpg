# Faldo Series — página /faldo (arquivada a 2026-10-13)

A página `/faldo` (FaldoPage) mostrava 25 provas Faldo, quase todas «Futures |
Regional Final», scrapeadas UMA vez a 2026-07-18: sem cartões, sem o Manuel,
sem workflow a actualizar e fora do kids2. A Mariana: «não tem info nenhuma».

**O que interessa vive na /major:** o Faldo Junior Tour Madeira (source
`faldomadeira`, scope do `update-golfgenius`). Uma prova Faldo nova que
interesse (ex: Grand Final de Al Ain) entra na /major da mesma maneira
(`scripts/golfgenius-scope.json`), não aqui.

## O que está arquivado
| Ficheiro | Estava em |
|---|---|
| `FaldoPage.tsx` | `src/pages/` |
| `scrape-faldo.js` | `scripts/` |
| `faldo-scope.json` | `scripts/` |
| `data-archive/faldo/faldo/` (25 JobFiles) | `public/data/faldo/` |
| `data-archive/faldo/faldo-catalog.json` | `public/data/` |

## Repor
`git mv` de volta para os sítios da tabela, voltar a pôr a rota em `src/App.tsx`
(`/faldo` e `/faldo/:source/:key` → FaldoPage, lazy) e a entrada «🏆 Faldo» em
`NAV_ITEMS` (`src/ui/NavBar.tsx`). Portal: golfgenius.com/pages/8621313389626429411.
