# scripts/_archive — código fora de uso

Código que deixou de correr, guardado de propósito (não se apaga). Nada daqui
é importado pela app nem corrido pelos workflows.

| Ficheiro | O que era | Porque saiu | Desde |
|---|---|---|---|
| `ScotlandPage_v1_ate-2026-10-23.tsx` | Página do Junior Tour Scotland (circuito, 363 linhas), nunca ligada às rotas | O JTS só publica PDFs e os dados não são fiáveis (decisão de 02/07/2026). Saiu do `src/` a pedido da Mariana (23/10/2026). Os dados `public/data/scotland-jts-*.json` e o scraper `scripts/scrape-junior-tour-scotland.js` ficam onde estão. Para voltar: mover para `src/pages/ScotlandPage.tsx` e ligar a rota no `App.tsx` — só com uma fonte boa. | 23/10/2026 |
| `build-kids-links_v1_ate-2026-10-23.js` | Gerava `public/data/kids-links.json` (38 estrangeiros à mão: seta ↗, país, sexo na /FPG) | O `juniors-links.json` do agregador já tem todos (36 dos 38; os 2 que faltam não têm ficha no kids2) e passou a levar o país e o sexo. Ficheiro em `data-archive/kids-links_ate-2026-10-23.json`. | 23/10/2026 |
| `build-kids-tracked-names_v1_ate-2026-10-23.js` | Gerava `public/data/kids-tracked-names.json` (~11 mil nomes do /kids → memberId, país, sexo; 438 KB), lido pela /FPG | Fazia o mesmo que o `juniors-links.json` e estava parado desde 10/05/2026 (nenhum workflow o corria). Ficheiro em `data-archive/kids-tracked-names_ate-2026-10-23.json`. | 23/10/2026 |
| `compare-kids-tracked-vs-rivals_v1_ate-2026-10-23.js` | Diagnóstico: comparava o `kids-tracked-names.json` com os rivais | Saiu com o ficheiro que comparava. | 23/10/2026 |
