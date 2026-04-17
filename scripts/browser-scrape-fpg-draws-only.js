// ─────────────────────────────────────────────────────────────────────
// Browser console script: descarrega DRAWS (R1/R2/R3) dos 107 torneios FPG
//
// COMO USAR:
//   1. Abrir Chrome e navegar para:
//      https://scoring-pt.datagolf.pt/scripts/tournaments.asp?club=ALL&ack=XH256YF45T
//      (ou qualquer página em scoring-pt.datagolf.pt com sessão activa)
//   2. F12 → Console
//   3. Colar este ficheiro inteiro e Enter
//   4. Esperar ~3-4 minutos
//   5. Descarrega automaticamente `fpg-draws.json`
//   6. Copiar para `C:\golf-fpg\public\data\fpg-draws.json`
//
// Depois, no Node local, correr o merge:
//   node scripts/merge-fpg-admissions-draws.js
// que junta `fpg-admissions-draws.json` + `fpg-draws.json` num só ficheiro final.
// ─────────────────────────────────────────────────────────────────────

(async () => {

  // ═══════════════════════════════════════════════════════
  // SCOPE — 107 torneios (mesmo que browser-scrape-fpg-admissions-draws.js)
  // ═══════════════════════════════════════════════════════
  const TORNEIOS = [{"ccode":"000","tcode":"10873","name":"1º Torneio do Circuito Aquapor-Morgado Golf","date":"2026-01-17"},{"ccode":"000","tcode":"10875","name":"2º Torneio do Circuito Aquapor - Qtª do Peru","date":"2026-03-14"},{"ccode":"982","tcode":"10198","name":"1º Torneio Drive Tour Madeira - Palheiro Golf","date":"2026-01-03"},{"ccode":"982","tcode":"10206","name":"1º Torneio Drive Challenge Madeira-Palheiro-Sub 16","date":"2026-01-04"},{"ccode":"982","tcode":"10205","name":"1º Torneio Drive Challenge Madeira-Palheiro-Sub 18","date":"2026-01-04"},{"ccode":"982","tcode":"10204","name":"1º Torneio Drive Challenge Madeira-Palheiro-Sub 14","date":"2026-01-04"},{"ccode":"982","tcode":"10203","name":"1º Torneio Drive Challenge Madeira-Palheiro-Sub 12","date":"2026-01-04"},{"ccode":"982","tcode":"10202","name":"1º Torneio Drive Challenge Madeira-Palheiro-Sub 10","date":"2026-01-04"},{"ccode":"985","tcode":"10202","name":"1º Torneio Drive Tour Tejo – Montado","date":"2026-01-04"},{"ccode":"987","tcode":"10206","name":"1º Torneio Drive Tour Norte – Estela GC","date":"2026-01-04"},{"ccode":"988","tcode":"10292","name":"1º Torneio Drive Tour Sul – Laguna G.C.","date":"2026-01-11"},{"ccode":"983","tcode":"10149","name":"1º Torneio Drive Challenge Açores–Terceira-Sub 18","date":"2026-01-24"},{"ccode":"983","tcode":"10148","name":"1º Torneio Drive Challenge Açores–Terceira-Sub 16","date":"2026-01-24"},{"ccode":"983","tcode":"10147","name":"1º Torneio Drive Challenge Açores–Terceira-Sub 14","date":"2026-01-24"},{"ccode":"983","tcode":"10146","name":"1º Torneio Drive Challenge Açores–Terceira-Sub 12","date":"2026-01-24"},{"ccode":"983","tcode":"10145","name":"1º Torneio Drive Challenge Açores–Terceira-Sub 10","date":"2026-01-24"},{"ccode":"988","tcode":"10293","name":"2º Torneio Drive Tour Sul – Vila Sol","date":"2026-02-01"},{"ccode":"982","tcode":"10199","name":"2º Torneio Drive Tour Madeira - Santo da Serra","date":"2026-02-07"},{"ccode":"982","tcode":"10211","name":"2 ºTorn.Drive Challenge Madeira-Stº da Serra-Sub18","date":"2026-02-08"},{"ccode":"982","tcode":"10210","name":"2 ºTorn.Drive Challenge Madeira-Stº da Serra-Sub16","date":"2026-02-08"},{"ccode":"982","tcode":"10209","name":"2 ºTorn.Drive Challenge Madeira-Stº da Serra-Sub14","date":"2026-02-08"},{"ccode":"982","tcode":"10208","name":"2 ºTorn.Drive Challenge Madeira-Stº da Serra-Sub12","date":"2026-02-08"},{"ccode":"982","tcode":"10207","name":"2 ºTorn.Drive Challenge Madeira-Stº da Serra-Sub10","date":"2026-02-08"},{"ccode":"988","tcode":"10300","name":"2º Torneio Drive Challenge Sul - Laguna G C Sub 16","date":"2026-02-21"},{"ccode":"988","tcode":"10297","name":"2º Torneio Drive Challenge Sul – Laguna G.C Sub 18","date":"2026-02-21"},{"ccode":"988","tcode":"10296","name":"2º Torneio Drive Challenge Sul – Laguna G.C Sub 14","date":"2026-02-21"},{"ccode":"988","tcode":"10295","name":"2º Torneio Drive Challenge Sul – Laguna G.C Sub 12","date":"2026-02-21"},{"ccode":"988","tcode":"10294","name":"2º Torneio Drive Challenge Sul – Laguna G.C Sub 10","date":"2026-02-21"},{"ccode":"985","tcode":"10215","name":"2º Torneio Drive Challenge Tejo-Montado - Sub 18","date":"2026-02-22"},{"ccode":"985","tcode":"10214","name":"2º Torneio Drive Challenge Tejo-Montado - Sub 16","date":"2026-02-22"},{"ccode":"985","tcode":"10213","name":"2º Torneio Drive Challenge Tejo-Montado - Sub 14","date":"2026-02-22"},{"ccode":"985","tcode":"10212","name":"2º Torneio Drive Challenge Tejo-Montado- Sub 12","date":"2026-02-22"},{"ccode":"985","tcode":"10211","name":"2º Torneio Drive Challenge Tejo-Montado - Sub 10","date":"2026-02-22"},{"ccode":"983","tcode":"10154","name":"2º Torneio Drive Challenge Açores–Terceira-Sub 18","date":"2026-02-28"},{"ccode":"983","tcode":"10153","name":"2º Torneio Drive Challenge Açores–Terceira-Sub 16","date":"2026-02-28"},{"ccode":"983","tcode":"10152","name":"2º Torneio Drive Challenge Açores–Terceira-Sub 14","date":"2026-02-28"},{"ccode":"983","tcode":"10151","name":"2º Torneio Drive Challenge Açores–Terceira-Sub 12","date":"2026-02-28"},{"ccode":"983","tcode":"10150","name":"2º Torneio Drive Challenge Açores–Terceira-Sub 10","date":"2026-02-28"},{"ccode":"987","tcode":"10208","name":"3º Torneio Drive Tour Norte – Vale Pisão","date":"2026-02-28"},{"ccode":"982","tcode":"10200","name":"3º Torneio Drive Tour Madeira - Palheiro Golf","date":"2026-03-07"},{"ccode":"982","tcode":"10226","name":"3º Torn.Drive Challenge Madeira-Stº da Serra-Sub18","date":"2026-03-08"},{"ccode":"982","tcode":"10225","name":"3º Torn.Drive Challenge Madeira-Stº da Serra-Sub14","date":"2026-03-08"},{"ccode":"982","tcode":"10224","name":"3º Torn.Drive Challenge Madeira-Stº da Serra-Sub16","date":"2026-03-08"},{"ccode":"982","tcode":"10223","name":"3º Torn.Drive Challenge Madeira-Stº da Serra-Sub12","date":"2026-03-08"},{"ccode":"982","tcode":"10222","name":"3º Torn.Drive Challenge Madeira-Stº da Serra-Sub10","date":"2026-03-08"},{"ccode":"985","tcode":"10220","name":"3º Torneio Drive Challenge Tejo - Jamor - Sub 18","date":"2026-03-21"},{"ccode":"985","tcode":"10219","name":"3º Torneio Drive Challenge Tejo - Jamor - Sub 16","date":"2026-03-21"},{"ccode":"985","tcode":"10218","name":"3º Torneio Drive Challenge Tejo - Jamor - Sub 14","date":"2026-03-21"},{"ccode":"985","tcode":"10217","name":"3º Torneio Drive Challenge Tejo - Jamor - Sub 12","date":"2026-03-21"},{"ccode":"985","tcode":"10216","name":"3º Torneio Drive Challenge Tejo - Jamor - Sub 10","date":"2026-03-21"},{"ccode":"983","tcode":"10155","name":"1º Torneio Drive Tour Terceira","date":"2026-03-22"},{"ccode":"988","tcode":"10301","name":"3º Torneio Drive Challenge Sul-Pinh. Altos-Sub 16","date":"2026-03-22"},{"ccode":"988","tcode":"10271","name":"3º Torneio Drive Challenge Sul-Pinh. Altos-Sub 18","date":"2026-03-22"},{"ccode":"988","tcode":"10270","name":"3º Torneio Drive Challenge Sul-Pinh. Altos-Sub 14","date":"2026-03-22"},{"ccode":"988","tcode":"10269","name":"3º Torneio Drive Challenge Sul-Pinh. Altos-Sub 12","date":"2026-03-22"},{"ccode":"988","tcode":"10268","name":"3º Torneio Drive Challenge Sul-Pinh. Altos-Sub 10","date":"2026-03-22"},{"ccode":"985","tcode":"10204","name":"3º Torneio Drive Tour Tejo – Santo Estêvão","date":"2026-03-28"},{"ccode":"987","tcode":"10224","name":"3º Torneio Drive Challenge Norte - Vidago - Sub 18","date":"2026-03-29"},{"ccode":"987","tcode":"10223","name":"3º Torneio Drive Challenge Norte - Vidago - Sub 16","date":"2026-03-29"},{"ccode":"987","tcode":"10222","name":"3º Torneio Drive Challenge Norte - Vidago - Sub 14","date":"2026-03-29"},{"ccode":"987","tcode":"10221","name":"3º Torneio Drive Challenge Norte - Vidago - Sub 12","date":"2026-03-29"},{"ccode":"987","tcode":"10220","name":"3º Torneio Drive Challenge Norte - Vidago - Sub 10","date":"2026-03-29"},{"ccode":"988","tcode":"10308","name":"3º Torneio do Circuito Drive Tour - Quinta do Vale","date":"2026-04-03"},{"ccode":"983","tcode":"10168","name":"4º Torneio Drive Challenge Açores–Terceira-Sub 18","date":"2026-04-06"},{"ccode":"983","tcode":"10167","name":"4º Torneio Drive Challenge Açores–Terceira-Sub 16","date":"2026-04-06"},{"ccode":"983","tcode":"10166","name":"4º Torneio Drive Challenge Açores–Terceira-Sub 14","date":"2026-04-06"},{"ccode":"983","tcode":"10165","name":"4º Torneio Drive Challenge Açores–Terceira-Sub 12","date":"2026-04-06"},{"ccode":"983","tcode":"10164","name":"4º Torneio Drive Challenge Açores–Terceira-Sub 10","date":"2026-04-06"},{"ccode":"983","tcode":"10156","name":"2º Torneio Drive Tour Terceira","date":"2026-04-07"},{"ccode":"983","tcode":"10163","name":"3º Torneio Drive Challenge Açores–Terceira-Sub 18","date":"2026-04-08"},{"ccode":"983","tcode":"10162","name":"3º Torneio Drive Challenge Açores–Terceira-Sub 16","date":"2026-04-08"},{"ccode":"983","tcode":"10161","name":"3º Torneio Drive Challenge Açores–Terceira-Sub 14","date":"2026-04-08"},{"ccode":"983","tcode":"10160","name":"3º Torneio Drive Challenge Açores–Terceira-Sub 12","date":"2026-04-08"},{"ccode":"983","tcode":"10159","name":"3º Torneio Drive Challenge Açores–Terceira-Sub 10","date":"2026-04-08"},{"ccode":"982","tcode":"10201","name":"4º Torneio Drive Tour Madeira – Porto Santo Golfe","date":"2026-04-10"},{"ccode":"988","tcode":"10302","name":"4º Torneio Drive Challenge Sul–Penina-Sub16","date":"2026-04-10"},{"ccode":"988","tcode":"10275","name":"4º Torneio Drive Challenge Sul–Penina-Sub18","date":"2026-04-10"},{"ccode":"988","tcode":"10274","name":"4º Torneio Drive Challenge Sul–Penina-Sub14","date":"2026-04-10"},{"ccode":"988","tcode":"10273","name":"4º Torneio Drive Challenge Sul–Penina-Sub12","date":"2026-04-10"},{"ccode":"988","tcode":"10272","name":"4º Torneio Drive Challenge Sul–Penina-Sub10","date":"2026-04-10"},{"ccode":"982","tcode":"10221","name":"4º Torn.Drive Challenge Madeira-Porto Santo-Sub 18","date":"2026-04-11"},{"ccode":"982","tcode":"10220","name":"4º Torn.Drive Challenge Madeira-Porto Santo-Sub 16","date":"2026-04-11"},{"ccode":"982","tcode":"10219","name":"4º Torn.Drive Challenge Madeira-Porto Santo-Sub 14","date":"2026-04-11"},{"ccode":"982","tcode":"10218","name":"4º Torn.Drive Challenge Madeira-Porto Santo-Sub 12","date":"2026-04-11"},{"ccode":"982","tcode":"10217","name":"4º Torn.Drive Challenge Madeira-Porto Santo-Sub 10","date":"2026-04-11"},{"ccode":"985","tcode":"10205","name":"4º Torneio Drive Tour Tejo – Lisbon SC","date":"2026-04-11"},{"ccode":"000","tcode":"10647","name":"Campeonato Nacional de Sub10 - H","date":"2023-07-04"},{"ccode":"988","tcode":"10190","name":"Final Nacional Drive Challenge 2023 - Sub10","date":"2023-10-28"},{"ccode":"000","tcode":"10772","name":"Campeonato Nacional Sub 10 - 2024 - Rapazes","date":"2024-06-24"},{"ccode":"003","tcode":"10478","name":"Miramar Internacional Open U25 ( Sub10)","date":"2024-08-26"},{"ccode":"000","tcode":"10825","name":"Campeonato Nacional de Clubes Sub 14","date":"2025-04-14"},{"ccode":"988","tcode":"10254","name":"Campeonato Nacional de Jovens Sub 12 H","date":"2025-06-27"},{"ccode":"003","tcode":"10565","name":"Miramar Internacional Open - sub 10","date":"2025-08-19"},{"ccode":"007","tcode":"10675","name":"Campeonato Regional de Jovens Sub 14-24 Dia1","date":"2023-11-18"},{"ccode":"007","tcode":"10674","name":"Campeonato Regional de Jovens Sub10&12 Dia1","date":"2023-11-18"},{"ccode":"007","tcode":"10677","name":"Campeonato Regional de Jovens Sub 14-24 Dia 2","date":"2023-11-19"},{"ccode":"007","tcode":"10676","name":"Campeonato Regional de Jovens Sub10&12 Dia 2","date":"2023-11-19"},{"ccode":"000","tcode":"10935","name":"Campeonato Nacional Jovens (tcode 10935)","date":"2026-05-01"},{"ccode":"000","tcode":"10936","name":"Campeonato Nacional Jovens (tcode 10936)","date":"2026-05-01"},{"ccode":"000","tcode":"10937","name":"Campeonato Nacional Jovens (tcode 10937)","date":"2026-05-01"},{"ccode":"000","tcode":"10938","name":"Campeonato Nacional Jovens (tcode 10938)","date":"2026-05-01"},{"ccode":"000","tcode":"10939","name":"Campeonato Nacional Jovens (tcode 10939)","date":"2026-05-01"},{"ccode":"000","tcode":"10940","name":"Campeonato Nacional Jovens (tcode 10940)","date":"2026-05-01"},{"ccode":"000","tcode":"10941","name":"Campeonato Nacional Jovens (tcode 10941)","date":"2026-05-01"},{"ccode":"000","tcode":"10942","name":"Campeonato Nacional Jovens (tcode 10942)","date":"2026-05-01"},{"ccode":"000","tcode":"10943","name":"Campeonato Nacional Jovens (tcode 10943)","date":"2026-05-01"},{"ccode":"000","tcode":"10944","name":"Campeonato Nacional Jovens (tcode 10944)","date":"2026-05-01"}];

  const MAX_ROUNDS = 3;
  const DELAY_MS   = 200;
  const ACK_DRAW   = "XH256YF45T";

  // ═══════════════════════════════════════════════════════
  // PARSER — idêntico ao do script principal
  // ═══════════════════════════════════════════════════════
  const strip = s => (s||"").replace(/<[^>]+>/g," ").replace(/&nbsp;/g," ").replace(/&#\d+;/g,"").replace(/&amp;/g,"&").replace(/\s+/g," ").trim();
  const cells = r => { const c=[],re=/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi; let m; while((m=re.exec(r))!==null) c.push(strip(m[1])); return c; };

  function parseDraw(html) {
    if (!html || html.length < 200) return { error: "empty-html", groups: [] };
    if (/Param_Errors|Err=999|Runtime Error/.test(html)) return { error: "param-errors", groups: [] };

    const mName = html.match(/<td[^>]*align=["']left["'][^>]*>([^<]*?)<\/td>\s*<td[^>]*align=["']right["'][^>]*>\s*Federa/i);
    const mDate = html.match(/<td[^>]*align=["']right["'][^>]*>\s*(\d{4}-\d{2}-\d{2})\s*<\/td>/i);
    const mTotal = html.match(/<td[^>]*align=["']right["'][^>]*>\s*Jogadores\s+(\d+)\s*<\/td>/i);

    const out = {
      name: mName ? strip(mName[1]) : null,
      date: mDate ? mDate[1] : null,
      totalJogadores: mTotal ? parseInt(mTotal[1],10) : 0,
      groups: [],
    };

    const trRe = /<tr([^>]*)>([\s\S]*?)<\/tr>/gi;
    let tm, currentGroup = null, isFirstDataRow = true;
    while ((tm = trRe.exec(html)) !== null) {
      const attrs = tm[1] || "", inner = tm[2];
      const cs = cells(inner);
      if (cs.length === 0) continue;
      const first = cs[0];
      if (!/^\d{1,2}:\d{2}$/.test(first)) continue;
      const newFlight = /border-top:\s*2pt\s+solid/i.test(attrs) || isFirstDataRow;
      if (newFlight) {
        currentGroup = {
          teeTime: first,
          startHole: cs[1] ? parseInt(cs[1],10) : null,
          tee: cs[2] || null,
          players: [],
        };
        out.groups.push(currentGroup);
        isFirstDataRow = false;
      }
      const nome = cs[3] || ""; const clube = cs[4] || "";
      if (nome) currentGroup.players.push({ nome, clube: clube || null });
    }
    return out;
  }

  const sleep = ms => new Promise(r => setTimeout(r, ms));

  async function fetchHTML(url) {
    try {
      const r = await fetch(url, { credentials: "include" });
      if (!r.ok) return { ok: false, status: r.status, html: "" };
      const html = await r.text();
      if (/Param_Errors|Err=999/.test(html)) return { ok: false, status: 200, html, errKind: "param-errors" };
      return { ok: true, status: 200, html };
    } catch (e) {
      return { ok: false, status: 0, html: "", error: e.message };
    }
  }

  // ═══════════════════════════════════════════════════════
  // CHECK DOMÍNIO
  // ═══════════════════════════════════════════════════════
  if (location.hostname !== "scoring-pt.datagolf.pt") {
    console.error(`%c⚠ ERRO: este script tem de ser corrido em scoring-pt.datagolf.pt`, "color:red;font-weight:bold;font-size:14px");
    console.error(`Estás em: ${location.hostname}`);
    console.error(`Navega primeiro para: https://scoring-pt.datagolf.pt/scripts/tournaments.asp?club=ALL&ack=XH256YF45T`);
    return;
  }

  // ═══════════════════════════════════════════════════════
  // MAIN
  // ═══════════════════════════════════════════════════════
  console.log(`%cFPG draws scrape: ${TORNEIOS.length} torneios × até ${MAX_ROUNDS} rondas`, "font-weight:bold;font-size:14px;color:#0a0");

  const results = [];
  let okTotal = 0, drawsCount = 0;
  const t0 = Date.now();

  for (let i = 0; i < TORNEIOS.length; i++) {
    const t = TORNEIOS[i];
    const pct = Math.round(((i+1)/TORNEIOS.length)*100);
    const entry = { ccode: t.ccode, tcode: t.tcode, name: t.name, date: t.date, draws: {} };
    let nDraws = 0;

    for (let r = 1; r <= MAX_ROUNDS; r++) {
      const drawUrl = `https://scoring-pt.datagolf.pt/scripts/draw.asp?club=${t.ccode}&tourn=${t.tcode}&round_number=${r}&LANG_TXT=PT&ack=${ACK_DRAW}`;
      const res = await fetchHTML(drawUrl);
      if (!res.ok) {
        if (r === 1) entry.draws[1] = { error: `HTTP ${res.status}`, groups: [] };
        break;
      }
      const draw = parseDraw(res.html);
      if (draw.groups && draw.groups.length > 0) {
        entry.draws[r] = draw;
        nDraws++;
      } else {
        if (r === 1) entry.draws[1] = { groups: [], note: "sem draw disponível" };
        break;
      }
      await sleep(DELAY_MS);
    }

    results.push(entry);
    if (nDraws > 0) { okTotal++; drawsCount += nDraws; }
    console.log(`[${pct}%] ${i+1}/${TORNEIOS.length} ${t.ccode}/${t.tcode} — ${(t.name||"").slice(0,45)} → ${nDraws} draws`);
    await sleep(DELAY_MS);
  }

  const elapsed = Math.round((Date.now() - t0) / 1000);
  console.log("");
  console.log(`%c✅ Completo em ${elapsed}s — ${okTotal} torneios com draws (${drawsCount} rondas total)`, "font-weight:bold;color:#0a0");

  const out = {
    scrapedAt: new Date().toISOString(),
    total: TORNEIOS.length,
    source: "scoring-pt.datagolf.pt (browser console)",
    tournaments: results,
  };

  const blob = new Blob([JSON.stringify(out, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "fpg-draws.json";
  document.body.appendChild(a); a.click(); document.body.removeChild(a);

  console.log(`%c📥 Descarregado: fpg-draws.json`, "font-weight:bold;color:#0a0");
  console.log(`   → Copia para C:\\golf-fpg\\public\\data\\fpg-draws.json`);
  console.log(`   → Depois: node scripts/merge-fpg-admissions-draws.js`);

})();
