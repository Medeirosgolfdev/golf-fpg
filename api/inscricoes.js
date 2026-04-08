/**
 * api/inscricoes.js
 * Vercel Serverless Function — proxy para inscrições FPG
 *
 * GET /api/inscricoes?tcode=10941
 * GET /api/inscricoes?tcode=10941&raw=1   (HTML bruto para debug)
 */

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

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36";

// Obter session cookie fresco (sem login — so inicializa a sessao ASP.NET)
async function getSession() {
  try {
    const r = await fetch("https://scoring.datagolf.pt/pt/", {
      headers: { "User-Agent": UA, "Accept": "text/html", "Accept-Language": "pt-PT,pt;q=0.9" },
      redirect: "follow",
    });
    const cookie = r.headers.get("set-cookie") || "";
    const m = cookie.match(/ASP\.NET_SessionId=([^;,\s]+)/);
    if (m) return "ASP.NET_SessionId=" + m[1];
  } catch {}
  return process.env.DATAGOLF_SESSION || "";
}

// ── Parser (mesmo formato do vite.config.ts local) ───────────────────────
function stripTags(html) {
  return html.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&#\d+;/g, "").replace(/\s+/g, " ").trim();
}

function parseAdmissionsTable(html) {
  const jogadores = [];

  // Limpar scripts/styles
  const clean = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "");

  // Extrair todas as linhas <tr>
  const rows = [];
  const trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let trM;
  while ((trM = trRe.exec(clean)) !== null) rows.push(trM[1]);
  if (rows.length < 2) return jogadores;

  // Cabeçalhos
  const headers = [];
  const thRe = /<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi;
  let thM;
  while ((thM = thRe.exec(rows[0])) !== null)
    headers.push(stripTags(thM[1]).toLowerCase());

  const iNome  = headers.findIndex(h => h.includes("nome") || h === "jogador");
  const iFed   = headers.findIndex(h => h.includes("fed") || h.includes("lic"));
  const iHcp   = headers.findIndex(h => h.includes("hcp") || h.includes("handicap") || h.includes("ndice"));
  const iVac   = headers.findIndex(h => h.includes("vac"));
  const iClube = headers.findIndex(h => h.includes("clube") || h.includes("assoc"));
  const iData  = headers.findIndex(h => h.includes("data") || h.includes("insc"));

  for (let i = 1; i < rows.length; i++) {
    const cells = [];
    const tdRe = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    let tdM;
    while ((tdM = tdRe.exec(rows[i])) !== null)
      cells.push(stripTags(tdM[1]));
    if (cells.length < 2) continue;

    // nfed: coluna dedicada ou scan
    let fed = iFed >= 0 ? (cells[iFed].match(/\b(\d{4,6})\b/) || [])[1] || null : null;
    if (!fed) {
      for (const c of cells) {
        const m = c.match(/\b(\d{4,6})\b/);
        if (m) { fed = m[1]; break; }
      }
    }

    const parseNum = (s) => {
      if (!s || s === "-" || s === "–") return null;
      const n = parseFloat(s.replace(",", "."));
      return isNaN(n) ? null : n;
    };

    const nome  = iNome  >= 0 ? cells[iNome]                : (cells.find(c => c.length > 4 && /[a-záéíóúâêîôûãõç]/i.test(c)) || "");
    const clube = iClube >= 0 ? cells[iClube]               : "";
    const hcp   = iHcp   >= 0 ? parseNum(cells[iHcp])       : null;
    const vac   = iVac   >= 0 ? parseNum(cells[iVac])       : null;
    const dataInscricao = iData >= 0 ? cells[iData] || null : null;

    if (!nome && !fed) continue;
    jogadores.push({ fed: fed || null, nome, clube, hcp, vac, dataInscricao });
  }

  return jogadores;
}

// ── Handler ──────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET");

  const { tcode, raw } = req.query;
  if (!tcode) return res.status(400).json({ error: "tcode obrigatorio" });

  const meta = TORNEIOS[tcode];
  if (!meta) return res.status(400).json({ error: "tcode " + tcode + " nao reconhecido" });

  const fpgUrl = "https://scoring.datagolf.pt/pt/tournAdmissions.aspx?ccode=000&tcode=" + tcode;

  try {
    const cookie = await getSession();
    console.log("[inscricoes] tcode=" + tcode + " cookie=" + (cookie ? cookie.slice(0, 30) + "..." : "VAZIA"));

    const fpgRes = await fetch(fpgUrl, {
      headers: {
        "User-Agent":      UA,
        "Accept":          "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "pt-PT,pt;q=0.9",
        "Referer":         "https://scoring.datagolf.pt/",
        ...(cookie ? { "Cookie": cookie } : {}),
      },
      redirect: "follow",
    });

    console.log("[inscricoes] tcode=" + tcode + " HTTP=" + fpgRes.status);

    if (!fpgRes.ok) {
      return res.status(502).json({
        error: "FPG HTTP " + fpgRes.status,
        tcode, ...meta, totalInscritos: 0, jogadores: [], lastFetched: null,
      });
    }

    const html = await fpgRes.text();

    if (raw === "1") {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      return res.send(html);
    }

    const jogadores = parseAdmissionsTable(html);
    console.log("[inscricoes] tcode=" + tcode + " -> " + jogadores.length + " inscritos");

    // Sem cache agressivo — queremos dados frescos
    res.setHeader("Cache-Control", "no-cache");
    return res.status(200).json({
      tcode, ...meta,
      totalInscritos: jogadores.length,
      jogadores,
      lastFetched: new Date().toISOString(),
      fpgUrl,
      fromCache: false,
    });

  } catch (err) {
    console.error("[inscricoes] Erro tcode=" + tcode + ":", err);
    return res.status(500).json({
      error: String(err),
      tcode, ...meta, totalInscritos: 0, jogadores: [], lastFetched: null,
    });
  }
}
