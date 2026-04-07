/**
 * api/inscricoes.js
 * Vercel Serverless Function — proxy para as páginas de inscrições FPG
 *
 * GET /api/inscricoes?tcode=10941
 * → Devolve { tcode, nome, escalao, sex, totalInscritos, jogadores[], lastFetched }
 *
 * GET /api/inscricoes?tcode=10941&raw=1
 * → Devolve o HTML original (para debug)
 */

const BASE_URL = "https://scoring.fpg.pt/lists/tournAdmissions.aspx";

const TORNEIOS = {
  "10935": { nome: "Campeonato Nacional de Jovens Sub-18 H", escalao: "Sub-18", sex: "M" },
  "10936": { nome: "Campeonato Nacional de Jovens Sub-18 S", escalao: "Sub-18", sex: "F" },
  "10937": { nome: "Campeonato Nacional de Jovens Sub-16 H", escalao: "Sub-16", sex: "M" },
  "10938": { nome: "Campeonato Nacional de Jovens Sub-16 S", escalao: "Sub-16", sex: "F" },
  "10939": { nome: "Campeonato Nacional de Jovens Sub-14 H", escalao: "Sub-14", sex: "M" },
  "10940": { nome: "Campeonato Nacional de Jovens Sub-14 S", escalao: "Sub-14", sex: "F" },
  "10941": { nome: "Campeonato Nacional de Jovens Sub-12 H", escalao: "Sub-12", sex: "M" },
  "10942": { nome: "Campeonato Nacional de Jovens Sub-12 S", escalao: "Sub-12", sex: "F" },
  "10943": { nome: "Campeonato Nacional de Jovens Sub-10 H", escalao: "Sub-10", sex: "M" },
  "10944": { nome: "Campeonato Nacional de Jovens Sub-10 S", escalao: "Sub-10", sex: "F" },
};

// ── Parser HTML simples (sem dependências externas) ───────────────────────
// O GridView do ASP.NET gera uma <table> com <tr><th>...</th></tr> no topo
// e depois linhas <tr><td>...</td></tr>

function stripTags(html) {
  return html.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&#\d+;/g, "").trim();
}

function extractFed(s) {
  const m = String(s || "").match(/\b(\d{4,6})\b/);
  return m ? m[1] : null;
}

function normalizeHcp(s) {
  const v = s.replace(",", ".").trim();
  if (!v || v === "-" || v === "–") return null;
  const n = parseFloat(v);
  return isNaN(n) ? null : n;
}

function parseAdmissionsTable(html) {
  // Encontrar a primeira tabela com dados
  const tableMatch = html.match(/<table[^>]*>([\s\S]*?)<\/table>/i);
  if (!tableMatch) return [];

  const tableHtml = tableMatch[1];

  // Extrair todas as linhas <tr>
  const rows = [];
  const trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let trMatch;
  while ((trMatch = trRegex.exec(tableHtml)) !== null) {
    rows.push(trMatch[1]);
  }

  if (rows.length < 2) return [];

  // Primeira linha = cabeçalhos
  const headerCells = [];
  const thRegex = /<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi;
  let thMatch;
  while ((thMatch = thRegex.exec(rows[0])) !== null) {
    headerCells.push(stripTags(thMatch[1]).toLowerCase());
  }

  // Índices das colunas relevantes
  const idxNome  = headerCells.findIndex(h => h.includes("nome") || h === "jogador");
  const idxFed   = headerCells.findIndex(h => h.includes("fed") || h.includes("licença") || h.includes("lic"));
  const idxHcp   = headerCells.findIndex(h => h.includes("hcp") || h.includes("handicap") || h.includes("índice") || h.includes("indice"));
  const idxClube = headerCells.findIndex(h => h.includes("clube") || h.includes("associação") || h.includes("assoc"));

  // Linhas de dados
  const jogadores = [];

  for (let i = 1; i < rows.length; i++) {
    const cells = [];
    const tdRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    let tdMatch;
    while ((tdMatch = tdRegex.exec(rows[i])) !== null) {
      cells.push(stripTags(tdMatch[1]).replace(/\s+/g, " ").trim());
    }
    if (cells.length < 2) continue;

    // Nº federado: coluna dedicada ou scan de todas as células
    let fed = idxFed >= 0 ? extractFed(cells[idxFed]) : null;
    if (!fed) {
      for (const c of cells) {
        fed = extractFed(c);
        if (fed) break;
      }
    }

    const nome  = idxNome  >= 0 ? cells[idxNome]  : (cells.find(c => c.length > 5 && /[a-záéíóú]/i.test(c)) || "");
    const clube = idxClube >= 0 ? cells[idxClube] : "";
    const hcp   = idxHcp   >= 0 ? normalizeHcp(cells[idxHcp]) : null;

    if (!nome && !fed) continue;

    jogadores.push({ fed: fed || null, nome, clube, hcp });
  }

  return jogadores;
}

// ── Handler principal ─────────────────────────────────────────────────────
export default async function handler(req, res) {
  // CORS para o domínio da app
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET");
  res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600"); // cache 5 min

  const { tcode, raw } = req.query;

  if (!tcode) {
    return res.status(400).json({ error: "Parâmetro tcode obrigatório" });
  }

  const meta = TORNEIOS[tcode];
  if (!meta) {
    return res.status(400).json({ error: `tcode ${tcode} não reconhecido (10935–10944)` });
  }

  try {
    const url = `${BASE_URL}?ccode=000&tcode=${tcode}`;

    const fpgRes = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "pt-PT,pt;q=0.9",
        "Referer": "https://scoring.fpg.pt/",
      },
    });

    if (!fpgRes.ok) {
      return res.status(502).json({
        error: `FPG devolveu HTTP ${fpgRes.status}`,
        tcode,
        ...meta,
        totalInscritos: 0,
        jogadores: [],
      });
    }

    const html = await fpgRes.text();

    if (raw === "1") {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      return res.send(html);
    }

    const jogadores = parseAdmissionsTable(html);

    return res.json({
      tcode,
      ...meta,
      totalInscritos: jogadores.length,
      jogadores,
      lastFetched: new Date().toISOString(),
      fpgUrl: url,
    });

  } catch (err) {
    return res.status(500).json({
      error: String(err),
      tcode,
      ...meta,
      totalInscritos: 0,
      jogadores: [],
    });
  }
}
