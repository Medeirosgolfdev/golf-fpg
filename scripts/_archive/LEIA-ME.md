# scripts/_archive — código fora de uso

Código que deixou de correr, guardado de propósito (não se apaga). Nada daqui
é importado pela app nem corrido pelos workflows.

| Ficheiro | O que era | Porque saiu | Desde |
|---|---|---|---|
| `ScotlandPage_v1_ate-2026-10-23.tsx` | Página do Junior Tour Scotland (circuito, 363 linhas), nunca ligada às rotas | O JTS só publica PDFs e os dados não são fiáveis (decisão de 02/07/2026). Saiu do `src/` a pedido da Mariana (23/10/2026). Os dados `public/data/scotland-jts-*.json` e o scraper `scripts/scrape-junior-tour-scotland.js` ficam onde estão. Para voltar: mover para `src/pages/ScotlandPage.tsx` e ligar a rota no `App.tsx` — só com uma fonte boa. | 23/10/2026 |
