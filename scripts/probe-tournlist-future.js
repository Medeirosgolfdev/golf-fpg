#!/usr/bin/env node
/**
 * scripts/probe-tournlist-future.js (2026-07-10)
 * ─────────────────────────────────────────────────────────────────────
 * DIAGNÓSTICO: a TournamentsLST devolve torneios FUTUROS?
 *
 * Contexto: o auto-extend da Fonte 3 (scrape-fpg-admissions-draws-node)
 * com --since 4d deu 0 torneios ≥ hoje-4d — suspeita de que a lista só
 * contém torneios já disputados/com classificação. Este probe testa 3
 * variantes de query e imprime as datas mais recentes que o endpoint
 * conhece. Correr no PC (precisa de DATAGOLF_SCORING_COOKIES ou
 * api/.scoring-datagolf-cookies.json):
 *
 *   node scripts/probe-tournlist-future.js
 * ─────────────────────────────────────────────────────────────────────
 */
"use strict";

const fs = require("fs");
const path = require("path");
const { loadCookieHeader } = require("./lib/cookies");
const { lisbonCivilDayStr } = require("../lib/helpers");

const REPO = path.resolve(__dirname, "..");
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const ACK_TOURNLIST = "XH256YF45T";

const dgCookie = loadCookieHeader({
  envVars: ["DATAGOLF_SCORING_COOKIES"],
  file: path.join(REPO, "api", ".scoring-datagolf-cookies.json"),
  label: "[probe]",
});

function dotNetToIsoDate(s) {
  if (!s) return null;
  const m = String(s).match(/\d+/);
  if (!m) return null;
  const ms = parseInt(m[0], 10);
  return Number.isFinite(ms) ? lisbonCivilDayStr(ms) : null;
}

async function warmup() {
  const r = await fetch(`https://scoring-pt.datagolf.pt/scripts/tournaments.asp?club=ALL&ack=${ACK_TOURNLIST}`, {
    headers: {
      "User-Agent": UA, "Cookie": dgCookie,
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "pt-PT,pt;q=0.9",
    },
    redirect: "follow",
  });
  await r.text();
  console.log(`[probe] warmup entry-gate HTTP ${r.status}`);
}

async function query(label, { dtIni = "", dtFim = "", sorting = "started_at DESC", clubCode = "0" }) {
  const qs = `jtStartIndex=0&jtPageSize=50&jtSorting=` + encodeURIComponent(sorting);
  const body = {
    ClubCode: clubCode, dtIni, dtFim,
    CourseName: "", TournCode: "", TournName: "",
    jtStartIndex: "0", jtPageSize: "50", jtSorting: sorting,
  };
  try {
    const r = await fetch(`https://scoring.datagolf.pt/pt/tournaments.aspx/TournamentsLST?${qs}`, {
      method: "POST",
      headers: {
        "User-Agent": UA,
        "Content-Type": "application/json; charset=utf-8",
        "X-Requested-With": "XMLHttpRequest",
        "Accept": "application/json, text/javascript, */*; q=0.01",
        "Origin": "https://scoring.datagolf.pt",
        "Referer": "https://scoring.datagolf.pt/pt/tournaments.aspx",
        "Cookie": dgCookie,
      },
      body: JSON.stringify(body),
    });
    if (!r.ok) { console.log(`\n── ${label}: HTTP ${r.status}`); return; }
    const j = await r.json();
    const d = j.d || j;
    if (d.Result !== "OK") { console.log(`\n── ${label}: Result=${d.Result} ${d.Message || ""}`); return; }
    const recs = d.Records || [];
    console.log(`\n── ${label}: ${recs.length} records (TotalRecordCount=${d.TotalRecordCount ?? "?"})`);
    for (const rec of recs.slice(0, 12)) {
      const date = dotNetToIsoDate(rec.started_at);
      const cc = String(rec.club_code || "").padStart(3, "0");
      console.log(`   ${date}  ${cc}/${rec.code}  ${String(rec.description || "").slice(0, 60)}`);
    }
  } catch (e) {
    console.log(`\n── ${label}: ERRO ${e.message}`);
  }
}

(async () => {
  if (!dgCookie) { console.error("[probe] sem cookies scoring.datagolf.pt"); process.exit(1); }
  await warmup();
  const today = new Date().toISOString().slice(0, 10);
  const plus60 = new Date(Date.now() + 60 * 86400000).toISOString().slice(0, 10);

  // A: só dtIni = hoje → se devolver algo, a lista TEM futuros
  await query(`A) dtIni=${today} (futuros?)`, { dtIni: today });
  // B: janela explícita hoje → +60d
  await query(`B) dtIni=${today} dtFim=${plus60}`, { dtIni: today, dtFim: plus60 });
  // C: sem filtro, DESC — o topo mostra a data MAIS RECENTE que o endpoint conhece
  await query("C) sem filtro, started_at DESC (topo = mais recente)", {});
  // D: clube 982 (Drive Madeira) sem filtro — os deste fim-de-semana aparecem?
  await query("D) ClubCode=982 (Drive Madeira), sem filtro", { clubCode: "982" });
  console.log("\n[probe] concluído — cola-me este output.");
})();
