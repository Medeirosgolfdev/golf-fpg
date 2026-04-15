#!/usr/bin/env node
/**
 * test-datagolf-node.js — Iteração 3
 *
 * Descobrimentos do cURL real:
 * 1. Endpoint correcto: POST /pt/tournaments.aspx/TournamentsLST
 * 2. GET direto a tournaments.aspx → 500/302 (Err=999)
 * 3. Precisa de passar pela 1EntryPage.aspx primeiro (com hash pré-autenticado)
 * 4. Cookies necessários: ASP.NET_SessionId + DG_Lists_URL
 *
 * Teste A: chamar 1EntryPage.aspx (hash hardcoded do teu browser) → ver se seta DG_Lists_URL
 * Teste B: se A falhar, usar os teus cookies manuais directamente
 */

// Cookies copiados do cURL do user (Chrome 90, sessão activa)
const MANUAL_COOKIES = "ASP.NET_SessionId=o2k5mzpr5jzszdhwhsrddwia; DG_Lists_URL=OriginalUrl=https%3a%2f%2fscoring.datagolf.pt%3a443%2fpt%2f1EntryPage.aspx%3fuser%3dfpguser%26dt%3d1452%26page%3dtournlist%26hash%3dbb785d568c2b8e6f8d3a9c6a016be549ef50ece3%26ccode%3dAll%26pagelang%3dPT%26callcontext%3ddirect";

const ENTRY_URL = "https://scoring.datagolf.pt/pt/1EntryPage.aspx?user=fpguser&dt=1452&page=tournlist&hash=bb785d568c2b8e6f8d3a9c6a016be549ef50ece3&ccode=All&pagelang=PT&callcontext=direct";
const POST_URL = "https://scoring.datagolf.pt/pt/tournaments.aspx/TournamentsLST?jtStartIndex=0&jtPageSize=25&jtSorting=started_at%20DESC";
const POST_BODY = {
  ClubCode: "0", dtIni: "", dtFim: "", CourseName: "", TournCode: "", TournName: "",
  jtStartIndex: "0", jtPageSize: "25", jtSorting: "started_at DESC",
};

const UA = "Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/90.0.4430.93 Safari/537.36";

async function tryPost(cookieHeader, label) {
  console.log(`\n═══ ${label} ═══`);
  console.log("  Cookie:", cookieHeader.slice(0, 100) + "...");
  const r = await fetch(POST_URL, {
    method: "POST",
    headers: {
      "User-Agent": UA,
      "Content-Type": "application/json; charset=UTF-8",
      "X-Requested-With": "XMLHttpRequest",
      "Accept": "application/json, text/javascript, */*; q=0.01",
      "Origin": "https://scoring.datagolf.pt",
      "Referer": "https://scoring.datagolf.pt/pt/tournaments.aspx",
      "Cookie": cookieHeader,
    },
    body: JSON.stringify(POST_BODY),
  });
  console.log("  HTTP", r.status, r.statusText);
  const text = await r.text();
  if (text.includes("Runtime Error") || text.includes("Param_Errors") || text.includes("Erro 999")) {
    console.log("  ❌ Resposta de erro");
    console.log("  First 200 chars:", text.slice(0, 200).replace(/\s+/g, " "));
    return false;
  }
  try {
    const j = JSON.parse(text);
    if (j.d?.Result === "OK") {
      const recs = j.d.Records || [];
      console.log("  ✅ SUCESSO — Result:OK, " + recs.length + " torneios, TotalRecordCount=" + j.d.TotalRecordCount);
      if (recs[0]) {
        console.log("  Primeiro torneio:", recs[0].name, "(" + (recs[0].ccode || "?") + "/" + (recs[0].tcode || "?") + ")");
      }
      return true;
    } else {
      console.log("  ⚠ JSON sem Result:OK:", JSON.stringify(j).slice(0, 300));
    }
  } catch {
    console.log("  ⚠ Resposta não é JSON:", text.slice(0, 300));
  }
  return false;
}

async function testEntryPage() {
  console.log("═══ TESTE A: chamar 1EntryPage.aspx para obter cookies ═══");
  console.log("→ GET", ENTRY_URL);
  const r = await fetch(ENTRY_URL, {
    headers: { "User-Agent": UA },
    redirect: "manual",
  });
  console.log("  HTTP", r.status, r.statusText);
  console.log("  Location:", r.headers.get("location") || "—");
  // Capturar TODOS os cookies setados
  const allCookies = [];
  for (const [k, v] of r.headers.entries()) {
    if (k.toLowerCase() === "set-cookie") allCookies.push(v);
  }
  // Em Node fetch, todos os Set-Cookie ficam juntos — usar raw header
  const setCookie = r.headers.get("set-cookie") || "";
  console.log("  Set-Cookie (bruto):", setCookie.slice(0, 500));

  // Extrair ASP.NET_SessionId e DG_Lists_URL
  const sessionMatch = setCookie.match(/ASP\.NET_SessionId=([^;,]+)/);
  const dgListsMatch = setCookie.match(/DG_Lists_URL=([^;,]+)/);
  const cookies = [];
  if (sessionMatch) cookies.push(`ASP.NET_SessionId=${sessionMatch[1]}`);
  if (dgListsMatch) cookies.push(`DG_Lists_URL=${dgListsMatch[1]}`);

  if (cookies.length === 0) {
    console.log("  ⚠ Nenhum cookie crítico setado pelo 1EntryPage.aspx");
    return null;
  }
  console.log("  ✓ Cookies obtidos:", cookies.length);
  return cookies.join("; ");
}

async function main() {
  // ── Teste A ──
  let cookiesFromEntry = null;
  try { cookiesFromEntry = await testEntryPage(); } catch (e) {
    console.log("  ❌ ERRO no teste A:", e.message);
  }

  if (cookiesFromEntry) {
    const ok = await tryPost(cookiesFromEntry, "Teste A-POST: usar cookies da 1EntryPage.aspx");
    if (ok) {
      console.log("\n🎉 CONSEGUIMOS! Pipeline completo em Node puro:");
      console.log("   1. GET 1EntryPage.aspx → cookies automáticos");
      console.log("   2. POST TournamentsLST → dados");
      console.log("   Sem Chrome 90, sem Playwright, sem nada manual.");
      process.exit(0);
    }
  }

  // ── Teste B ──
  const okManual = await tryPost(MANUAL_COOKIES, "Teste B: usar cookies manuais do Chrome 90");
  if (okManual) {
    console.log("\n✅ Cookies manuais funcionam!");
    console.log("   Podemos usar este método: user copia cookies 1×/sessão e scripts usam.");
    console.log("   Menos elegante que o teste A mas funciona.");
    process.exit(0);
  }

  console.log("\n❌ Nenhum método funcionou. Mantemos o wrapper Playwright.");
  process.exit(2);
}

main().catch(e => { console.error("ERRO FATAL:", e.message); process.exit(1); });
