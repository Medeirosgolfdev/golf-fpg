#!/usr/bin/env node
/**
 * Diagnóstico: dump do HTML bruto de tournAdmissions.aspx para ccode=004
 * Corre: node scripts/diag-admissions-html.js
 * Output: scripts/diag-adm-10580.html  e  scripts/diag-adm-10581.html
 */
"use strict";
const fs = require("fs");
const path = require("path");
const { loadCookieHeader } = require("./lib/cookies");

const REPO = path.resolve(__dirname, "..");
const COOKIE_DG = loadCookieHeader({
  envVars: ["DATAGOLF_SCORING_COOKIES"],
  file: path.join(REPO, "api", ".scoring-datagolf-cookies.json"),
  label: "[diag]",
  exitOnFail: false,
}) || null;

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

async function main() {
  // 1. Warmup entry-gate
  console.log("A fazer warmup...");
  const warmupUrl = "https://scoring-pt.datagolf.pt/scripts/tournaments.asp?club=ALL&ack=XH256YF45T";
  const rw = await fetch(warmupUrl, {
    headers: { "User-Agent": UA, "Cookie": COOKIE_DG || "", "Referer": "https://scoring.datagolf.pt/" },
    redirect: "follow",
  });
  console.log(`Warmup: HTTP ${rw.status}, final URL: ${rw.url}`);

  for (const tcode of ["10580", "10581"]) {
    // Tentar os 3 métodos
    const attempts = [
      {
        label: "linkpage-fpg",
        url: `https://scoring.fpg.pt/lists/linkpage.aspx?page=admissions&club=004&tourn=${tcode}&ack=XH256YF450`,
        cookie: null,
      },
      {
        label: "linkpage-datagolf",
        url: `https://scoring.datagolf.pt/pt/linkpage.aspx?page=admissions&club=004&tourn=${tcode}&ack=XH256YF450`,
        cookie: COOKIE_DG,
      },
      {
        label: "directo-ccode-tcode",
        url: `https://scoring.datagolf.pt/pt/tournAdmissions.aspx?ccode=004&tcode=${tcode}`,
        cookie: COOKIE_DG,
      },
      {
        label: "directo-club-tourn",
        url: `https://scoring.datagolf.pt/pt/tournAdmissions.aspx?club=004&tourn=${tcode}`,
        cookie: COOKIE_DG,
      },
    ];

    for (const { label, url, cookie } of attempts) {
      try {
        const headers = { "User-Agent": UA, "Accept": "text/html", "Accept-Language": "pt-PT,pt;q=0.9" };
        if (cookie) headers["Cookie"] = cookie;
        const r = await fetch(url, { headers, redirect: "follow" });
        const html = await r.text();
        const isParamErr = /Param_Errors|Err=999|<title>Param Error/i.test(html);
        const hasTable = /table-hover|lblTdesc|PlayersCount/i.test(html);
        const hasRows = (html.match(/<tbody/g) || []).length;

        console.log(`\n[${tcode}] ${label}: HTTP ${r.status}, paramErr=${isParamErr}, hasTable=${hasTable}, tbodies=${hasRows}`);

        if (!isParamErr && hasTable) {
          const outFile = path.join(__dirname, `diag-adm-${tcode}-${label}.html`);
          fs.writeFileSync(outFile, html, "utf8");
          console.log(`  → Gravado: ${outFile}`);
          // Procurar os spans relevantes
          const spans = ["lblTdesc", "lbldt", "PlayersCount", "lblTournStatus", "ContentPlaceHolder1_lblTdesc"];
          for (const id of spans) {
            const m = html.match(new RegExp(`id=["']${id}["'][^>]*>([^<]{0,80})<`, "i"));
            if (m) console.log(`  span#${id}: "${m[1].trim()}"`);
          }
          break; // encontrou dados para este tcode — parar
        } else if (!isParamErr) {
          // Salvar na mesma para debug (pode ser redirecionamento ou página diferente)
          const snippet = html.slice(0, 1000).replace(/\s+/g, " ");
          console.log(`  Snippet: ${snippet}`);
        }
      } catch (e) {
        console.log(`[${tcode}] ${label}: ERRO ${e.message}`);
      }
    }
  }
}

main().catch(e => { console.error(e); process.exit(1); });
