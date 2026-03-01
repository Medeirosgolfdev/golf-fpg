#!/usr/bin/env node
/**
 * drive-scraper.js — Extrair dados dos torneios DRIVE do scoring.datagolf.pt
 *
 * ╔═══════════════════════════════════════════════════════════════╗
 * ║  COMO USAR                                                    ║
 * ║                                                               ║
 * ║  1. Abre o browser e vai a:                                   ║
 * ║     https://scoring.datagolf.pt/pt/tournaments.aspx           ║
 * ║                                                               ║
 * ║  2. Filtra por "DRIVE" para ver os torneios                   ║
 * ║                                                               ║
 * ║  3. Abre a consola do browser (F12 > Console)                 ║
 * ║                                                               ║
 * ║  4. Cola TODO este código e carrega ENTER                     ║
 * ║                                                               ║
 * ║  5. Espera — o script vai:                                    ║
 * ║     a) Ler os torneios DRIVE da página                        ║
 * ║     b) Descarregar a classificação de cada um                 ║
 * ║     c) Guardar drive-data.json com todos os dados             ║
 * ║                                                               ║
 * ║  6. Copia drive-data.json para public/data/ no projecto       ║
 * ╚═══════════════════════════════════════════════════════════════╝
 *
 * ALTERNATIVA — Se já sabes os tcodes dos torneios, podes configurar
 * manualmente a lista TOURNAMENTS abaixo e correr o script.
 */

(async () => {
  "use strict";

  /* ══════════════════════════════════════════════════════════════
     CONFIGURAÇÃO — Preenche os tcodes e ccodes dos torneios DRIVE
     
     Se o script não conseguir detectar automaticamente os torneios
     da página, podes preencher esta lista manualmente.
     
     Para encontrar os códigos:
     - Abre a classificação do torneio no scoring.datagolf.pt
     - O URL terá: ?ccode=XXX&tcode=XXXXX
     ══════════════════════════════════════════════════════════════ */

  const MANUAL_CONFIG = {
    // Descomenta e preenche se quiseres configurar manualmente
    // Se deixares vazio, o script tenta detectar automaticamente da página
    
    drive_tour: {
      norte: {
        name: "Norte",
        tournaments: [
          // { num: 1, name: "1º Torneio Drive Tour Norte", date: "2026-01-04", campo: "Estela GC", ccode: "", tcode: "" },
          // { num: 2, name: "2º Torneio Drive Tour Norte", date: "2026-02-01", campo: "Amarante", ccode: "", tcode: "" },
          // { num: 3, name: "3º Torneio Drive Tour Norte", date: "2026-02-28", campo: "Vale Pisão", ccode: "", tcode: "" },
          // { num: 4, name: "4º Torneio Drive Tour Norte", date: "2026-04-19", campo: "Ponte de Lima", ccode: "", tcode: "" },
        ],
        // Ranking regional (se houver um tcode separado para o ranking)
        ranking: { ccode: "", tcode: "" },
      },
      centro: {
        name: "Centro / Tejo",
        tournaments: [
          // { num: 1, name: "1º Torneio Drive Tour Tejo", date: "2026-01-04", campo: "Montado", ccode: "", tcode: "" },
          // { num: 2, name: "2º Torneio Drive Tour Tejo", date: "2026-01-31", campo: "Belas", ccode: "", tcode: "" },
          // { num: 3, name: "3º Torneio Drive Tour Tejo", date: "2026-03-28", campo: "St. Estêvão", ccode: "", tcode: "" },
          // { num: 4, name: "4º Torneio Drive Tour Tejo", date: "2026-04-12", campo: "Lisbon SC", ccode: "", tcode: "" },
        ],
        ranking: { ccode: "", tcode: "" },
      },
      sul: {
        name: "Sul",
        tournaments: [
          // { num: 1, name: "1º Torneio Drive Tour Sul", date: "2026-01-11", campo: "Laguna GC", ccode: "", tcode: "" },
          // { num: 2, name: "2º Torneio Drive Tour Sul", date: "2026-02-01", campo: "Vila Sol", ccode: "", tcode: "" },
          // { num: 3, name: "3º Torneio Drive Tour Sul", date: "2026-04-04", campo: "Penina", ccode: "", tcode: "" },
          // { num: 4, name: "4º Torneio Drive Tour Sul", date: "2026-06-10", campo: "Boavista", ccode: "", tcode: "" },
        ],
        ranking: { ccode: "", tcode: "" },
      },
      madeira: {
        name: "Madeira",
        tournaments: [
          // { num: 1, name: "1º Torneio Drive Tour Madeira", date: "2026-01-03", campo: "Palheiro Golf", ccode: "", tcode: "" },
          // { num: 2, name: "2º Torneio Drive Tour Madeira", date: "2026-02-07", campo: "Santo da Serra", ccode: "", tcode: "" },
          // { num: 3, name: "3º Torneio Drive Tour Madeira", date: "2026-03-07", campo: "Palheiro Golf", ccode: "", tcode: "" },
          // { num: 4, name: "4º Torneio Drive Tour Madeira", date: "2026-04-11", campo: "Porto Santo Golfe", ccode: "", tcode: "" },
        ],
        ranking: { ccode: "", tcode: "" },
      },
    },

    drive_challenge: {
      norte: { name: "Norte", tournaments: [], ranking: { ccode: "", tcode: "" } },
      centro: { name: "Centro / Tejo", tournaments: [], ranking: { ccode: "", tcode: "" } },
      sul: { name: "Sul", tournaments: [], ranking: { ccode: "", tcode: "" } },
      madeira: {
        name: "Madeira",
        tournaments: [
          // { num: 1, name: "1º Torneio Drive Challenge Madeira", date: "2026-01-04", campo: "Palheiro", ccode: "", tcode: "" },
          // { num: 2, name: "2º Torneio Drive Challenge Madeira", date: "2026-02-08", campo: "Santo da Serra", ccode: "", tcode: "" },
          // ... etc
        ],
        ranking: { ccode: "", tcode: "" },
      },
    },
  };

  /* ══════════════════════════════════════════════════════════════ */

  const log = (msg) => console.log(`%c[DRIVE] ${msg}`, "color: #16a34a; font-weight: bold");
  const logErr = (msg) => console.log(`%c[DRIVE] ❌ ${msg}`, "color: red");
  const logOk = (msg) => console.log(`%c[DRIVE] ✅ ${msg}`, "color: green; font-weight: bold");
  const logInfo = (msg) => console.log(`%c[DRIVE] ℹ️  ${msg}`, "color: #0369a1");
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  /* ── Helper: Descarregar JSON ── */
  function downloadJSON(data, filename) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    logOk(`Ficheiro descarregado: ${filename}`);
  }

  /* ── Helper: Fetch ASP.NET page e extrair tabela ── */
  async function fetchClassification(ccode, tcode, classifOrder = 2) {
    const url = `/pt/Classifications.aspx?ccode=${ccode}&tcode=${tcode}&classif_order=${classifOrder}`;
    log(`A carregar classificação: ccode=${ccode} tcode=${tcode}`);
    
    try {
      const resp = await fetch(url);
      if (!resp.ok) { logErr(`HTTP ${resp.status} para ${url}`); return null; }
      
      const html = await resp.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, "text/html");
      
      return parseClassificationTable(doc);
    } catch (e) {
      logErr(`Erro ao carregar classificação: ${e.message}`);
      return null;
    }
  }

  /* ── Parser: Extrair classificação de uma tabela HTML ── */
  function parseClassificationTable(doc) {
    // Procurar a tabela principal de classificação
    // DataGolf usa jTable ou tabelas normais
    const tables = doc.querySelectorAll("table");
    let mainTable = null;
    
    for (const t of tables) {
      const headers = t.querySelectorAll("th, thead td");
      const headerTexts = Array.from(headers).map(h => h.textContent.trim().toLowerCase());
      // Procurar tabela com colunas típicas: Pos, Nome/Jogador, Clube, Gross, Net, etc.
      if (headerTexts.some(h => h.includes("pos") || h.includes("class")) &&
          headerTexts.some(h => h.includes("nome") || h.includes("jogador") || h.includes("player"))) {
        mainTable = t;
        break;
      }
    }
    
    if (!mainTable) {
      // Fallback: procurar tabela com mais linhas
      let maxRows = 0;
      for (const t of tables) {
        const rows = t.querySelectorAll("tbody tr, tr");
        if (rows.length > maxRows) { maxRows = rows.length; mainTable = t; }
      }
    }
    
    if (!mainTable) { logErr("Tabela de classificação não encontrada"); return []; }
    
    // Mapear colunas
    const headers = Array.from(mainTable.querySelectorAll("th, thead td"));
    const colMap = {};
    headers.forEach((h, i) => {
      const txt = h.textContent.trim().toLowerCase();
      if (txt.includes("pos") || txt.includes("class")) colMap.pos = i;
      if (txt.includes("nome") || txt.includes("jogador") || txt.includes("player")) colMap.name = i;
      if (txt.includes("club") || txt.includes("clube")) colMap.club = i;
      if (txt.includes("fed") || txt.includes("feder")) colMap.fed = i;
      if (txt.includes("hcp") || txt.includes("hand")) colMap.hcp = i;
      if (txt === "gross" || txt.includes("bruto")) colMap.gross = i;
      if (txt === "net" || txt.includes("líq")) colMap.net = i;
      if (txt === "total" || txt.includes("resultado")) colMap.total = i;
      if (txt.includes("pt") || txt.includes("pontos") || txt.includes("point")) colMap.points = i;
      if (txt.includes("stb") || txt.includes("stabl")) colMap.stableford = i;
    });
    
    logInfo(`Colunas encontradas: ${JSON.stringify(colMap)}`);
    
    // Extrair linhas
    const rows = mainTable.querySelectorAll("tbody tr");
    const results = [];
    
    for (const row of rows) {
      const cells = Array.from(row.querySelectorAll("td"));
      if (cells.length < 3) continue;
      
      const getValue = (key) => {
        if (colMap[key] == null) return null;
        const cell = cells[colMap[key]];
        return cell ? cell.textContent.trim() : null;
      };
      
      const posStr = getValue("pos");
      const name = getValue("name");
      if (!name) continue;
      
      // Extrair federado do link se existir
      let fed = getValue("fed");
      if (!fed) {
        const link = row.querySelector("a[href*='fed'], a[href*='player'], a[href*='no=']");
        if (link) {
          const m = link.href.match(/(?:fed|no|player)[_=](\d+)/i);
          if (m) fed = m[1];
        }
      }
      
      const entry = {
        pos: posStr ? parseInt(posStr.replace(/[^\d]/g, ""), 10) || null : null,
        name,
        fed: fed || null,
        club: getValue("club") || "",
        gross: getValue("gross") ? parseInt(getValue("gross"), 10) || null : null,
        net: getValue("net") ? parseInt(getValue("net"), 10) || null : null,
        total: getValue("total") ? parseInt(getValue("total"), 10) || null : null,
        points: getValue("points") ? parseFloat(getValue("points")) || null : null,
        stableford: getValue("stableford") ? parseInt(getValue("stableford"), 10) || null : null,
        hcp: getValue("hcp") || null,
      };
      
      results.push(entry);
    }
    
    log(`Extraídos ${results.length} resultados`);
    return results;
  }

  /* ── PASSO 1: Detectar torneios da página (se estiver na tournaments.aspx) ── */
  function detectTournamentsFromPage() {
    const detected = { drive_tour: {}, drive_challenge: {} };
    
    // Procurar links para classificações na tabela de torneios
    const allLinks = document.querySelectorAll("a[href*='Classifications'], a[href*='classif']");
    const allRows = document.querySelectorAll("table tr, .jtable-data-row, [class*='row']");
    
    log(`Encontrados ${allLinks.length} links de classificação e ${allRows.length} linhas`);
    
    // Tentar extrair de uma tabela jTable (formato DataGolf)
    const jtRows = document.querySelectorAll(".jtable-data-row");
    if (jtRows.length > 0) {
      log(`Modo jTable: ${jtRows.length} linhas`);
      for (const row of jtRows) {
        const cells = row.querySelectorAll("td");
        const textContent = row.textContent.toLowerCase();
        
        if (!textContent.includes("drive")) continue;
        
        const classifLink = row.querySelector("a[href*='Classifications'], a[href*='classif']");
        if (!classifLink) continue;
        
        const href = classifLink.getAttribute("href") || "";
        const ccodeMatch = href.match(/ccode=(\d+)/);
        const tcodeMatch = href.match(/tcode=(\d+)/);
        
        if (!ccodeMatch || !tcodeMatch) continue;
        
        const tournName = classifLink.textContent.trim() || cells[0]?.textContent?.trim() || "";
        const ccode = ccodeMatch[1];
        const tcode = tcodeMatch[1];
        
        // Determinar série e região
        const isDriveTour = textContent.includes("drive tour");
        const isChallenge = textContent.includes("drive challenge") || textContent.includes("challenge");
        const series = isChallenge ? "drive_challenge" : "drive_tour";
        
        let region = "unknown";
        if (textContent.includes("norte")) region = "norte";
        else if (textContent.includes("centro") || textContent.includes("tejo")) region = "centro";
        else if (textContent.includes("sul")) region = "sul";
        else if (textContent.includes("madeira")) region = "madeira";
        
        // Extrair número do torneio
        const numMatch = tournName.match(/(\d+)º/);
        const num = numMatch ? parseInt(numMatch[1], 10) : null;
        
        // Extrair data
        let date = null;
        for (const cell of cells) {
          const dateMatch = cell.textContent.match(/(\d{2})[/-](\d{2})[/-](\d{4})/);
          if (dateMatch) {
            date = `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}`;
            break;
          }
        }
        
        if (!detected[series][region]) {
          detected[series][region] = {
            name: region === "centro" ? "Centro / Tejo" : region.charAt(0).toUpperCase() + region.slice(1),
            tournaments: [],
            ranking: { ccode: "", tcode: "" },
          };
        }
        
        detected[series][region].tournaments.push({
          num, name: tournName, date, campo: "", ccode, tcode,
          url: `https://scoring.datagolf.pt${href.startsWith("/") ? href : "/pt/" + href}`,
        });
        
        log(`Detectado: [${series}] [${region}] ${tournName} (ccode=${ccode}, tcode=${tcode})`);
      }
    }
    
    // Fallback: procurar em tabelas normais
    if (Object.values(detected.drive_tour).length === 0 && Object.values(detected.drive_challenge).length === 0) {
      log("Modo jTable não encontrou resultados, a tentar tabela normal...");
      
      for (const link of allLinks) {
        const row = link.closest("tr");
        if (!row) continue;
        
        const rowText = row.textContent.toLowerCase();
        if (!rowText.includes("drive")) continue;
        
        const href = link.getAttribute("href") || "";
        const ccodeMatch = href.match(/ccode=(\d+)/);
        const tcodeMatch = href.match(/tcode=(\d+)/);
        
        if (!ccodeMatch || !tcodeMatch) continue;
        
        const tournName = link.textContent.trim();
        const ccode = ccodeMatch[1];
        const tcode = tcodeMatch[1];
        
        const isChallenge = rowText.includes("challenge");
        const series = isChallenge ? "drive_challenge" : "drive_tour";
        
        let region = "unknown";
        if (rowText.includes("norte")) region = "norte";
        else if (rowText.includes("centro") || rowText.includes("tejo")) region = "centro";
        else if (rowText.includes("sul")) region = "sul";
        else if (rowText.includes("madeira")) region = "madeira";
        
        if (!detected[series][region]) {
          detected[series][region] = {
            name: region === "centro" ? "Centro / Tejo" : region.charAt(0).toUpperCase() + region.slice(1),
            tournaments: [],
            ranking: { ccode: "", tcode: "" },
          };
        }
        
        const numMatch = tournName.match(/(\d+)º/);
        detected[series][region].tournaments.push({
          num: numMatch ? parseInt(numMatch[1], 10) : null,
          name: tournName, date: null, campo: "", ccode, tcode,
          url: `https://scoring.datagolf.pt/pt/Classifications.aspx?ccode=${ccode}&tcode=${tcode}`,
        });
        
        log(`Detectado (fallback): [${series}] [${region}] ${tournName}`);
      }
    }
    
    return detected;
  }

  /* ── PASSO 2: Construir lista final de torneios ── */
  function buildTournamentList() {
    // Primeiro, tentar detectar da página
    const detected = detectTournamentsFromPage();
    
    // Merge com configuração manual (manual overrides auto)
    const final = { drive_tour: {}, drive_challenge: {} };
    
    for (const series of ["drive_tour", "drive_challenge"]) {
      const manualSeries = MANUAL_CONFIG[series] || {};
      const detectedSeries = detected[series] || {};
      
      const allRegions = new Set([...Object.keys(manualSeries), ...Object.keys(detectedSeries)]);
      
      for (const region of allRegions) {
        const manual = manualSeries[region];
        const auto = detectedSeries[region];
        
        // Preferir manual se tiver torneios com tcodes preenchidos
        const manualTourns = (manual?.tournaments || []).filter(t => t.tcode);
        
        if (manualTourns.length > 0) {
          final[series][region] = {
            name: manual.name || auto?.name || region,
            tournaments: manualTourns,
            ranking: manual.ranking || { ccode: "", tcode: "" },
          };
        } else if (auto && auto.tournaments.length > 0) {
          final[series][region] = auto;
        }
      }
    }
    
    return final;
  }

  /* ── PASSO 3: Descarregar classificações de todos os torneios ── */
  async function scrapeAllClassifications(tournamentList) {
    const data = {
      lastUpdated: new Date().toISOString().split("T")[0],
      scrapedFrom: "scoring.datagolf.pt",
      series: {},
    };
    
    let total = 0, done = 0;
    for (const [seriesKey, regions] of Object.entries(tournamentList)) {
      for (const [regionKey, region] of Object.entries(regions)) {
        total += region.tournaments.length;
        if (region.ranking?.tcode) total++;
      }
    }
    
    log(`Total de classificações a descarregar: ${total}`);
    
    for (const [seriesKey, regions] of Object.entries(tournamentList)) {
      const seriesName = seriesKey === "drive_tour" ? "Drive Tour" : "Drive Challenge";
      data.series[seriesKey] = { name: seriesName, regions: {} };
      
      for (const [regionKey, region] of Object.entries(regions)) {
        const regionData = {
          name: region.name,
          tournaments: [],
          ranking: [],
        };
        
        // Descarregar cada torneio
        for (const tourn of region.tournaments) {
          done++;
          log(`[${done}/${total}] ${seriesName} ${region.name} — ${tourn.name}`);
          
          let results = [];
          if (tourn.ccode && tourn.tcode) {
            results = await fetchClassification(tourn.ccode, tourn.tcode) || [];
            await sleep(800); // Não sobrecarregar o servidor
          } else {
            logErr(`Torneio sem tcode: ${tourn.name}`);
          }
          
          regionData.tournaments.push({
            num: tourn.num,
            name: tourn.name,
            date: tourn.date,
            campo: tourn.campo,
            url: tourn.url || `https://scoring.datagolf.pt/pt/Classifications.aspx?ccode=${tourn.ccode}&tcode=${tourn.tcode}`,
            ccode: tourn.ccode,
            tcode: tourn.tcode,
            results,
          });
        }
        
        // Descarregar ranking regional se disponível
        if (region.ranking?.tcode) {
          done++;
          log(`[${done}/${total}] Ranking ${seriesName} ${region.name}`);
          const rankResults = await fetchClassification(region.ranking.ccode, region.ranking.tcode) || [];
          regionData.ranking = rankResults;
          await sleep(800);
        }
        
        data.series[seriesKey].regions[regionKey] = regionData;
      }
    }
    
    return data;
  }

  /* ── PASSO 4: Derivar ranking a partir dos resultados dos torneios ── */
  function deriveRankingFromResults(regionData) {
    // Se já temos ranking scrapeado, usar esse
    if (regionData.ranking && regionData.ranking.length > 0) return;
    
    // Caso contrário, derivar um ranking simples (melhor posição acumulada)
    const playerMap = new Map(); // name → { results: [], totalPoints: 0 }
    
    for (let i = 0; i < regionData.tournaments.length; i++) {
      const tourn = regionData.tournaments[i];
      for (const r of tourn.results) {
        if (!r.name) continue;
        if (!playerMap.has(r.name)) {
          playerMap.set(r.name, {
            name: r.name,
            fed: r.fed,
            club: r.club,
            hcp: r.hcp,
            results: new Array(regionData.tournaments.length).fill(null),
            totalPoints: 0,
            tournsPlayed: 0,
          });
        }
        const p = playerMap.get(r.name);
        p.results[i] = r.pos;
        if (r.fed && !p.fed) p.fed = r.fed;
        if (r.club && !p.club) p.club = r.club;
        
        // Sistema de pontos simples: 100 - posição (para ordenar por mérito)
        if (r.pos != null) {
          p.totalPoints += Math.max(0, 100 - r.pos);
          p.tournsPlayed++;
        }
        
        // Se houver pontos no resultado original, acumular
        if (r.points != null) {
          p.totalPoints = (p.totalPoints || 0) + r.points;
        }
      }
    }
    
    // Ordenar por pontos (desc)
    const ranking = Array.from(playerMap.values())
      .sort((a, b) => b.totalPoints - a.totalPoints);
    
    ranking.forEach((p, i) => { p.pos = i + 1; });
    
    regionData.ranking = ranking;
  }

  /* ══════════════════════════════════════════════════════════════
     MAIN
     ══════════════════════════════════════════════════════════════ */
  
  log("═══ DRIVE Scraper — Início ═══");
  logInfo(`Página actual: ${window.location.href}`);
  
  // 1. Construir lista de torneios
  const tournamentList = buildTournamentList();
  
  const seriesCounts = {};
  for (const [s, regions] of Object.entries(tournamentList)) {
    let count = 0;
    for (const r of Object.values(regions)) count += r.tournaments.length;
    seriesCounts[s] = count;
  }
  
  log(`Torneios detectados: Drive Tour=${seriesCounts.drive_tour || 0}, Drive Challenge=${seriesCounts.drive_challenge || 0}`);
  
  if ((seriesCounts.drive_tour || 0) + (seriesCounts.drive_challenge || 0) === 0) {
    logErr("Nenhum torneio DRIVE detectado!");
    logInfo("Opção 1: Confirma que estás na página de torneios com o filtro DRIVE activo");
    logInfo("Opção 2: Preenche manualmente os tcodes na secção MANUAL_CONFIG do script");
    logInfo("");
    logInfo("Para encontrar os tcodes:");
    logInfo("  1. Abre a classificação de cada torneio DRIVE");
    logInfo("  2. Copia o ccode e tcode do URL");
    logInfo("  3. Preenche na secção MANUAL_CONFIG");
    
    // Mesmo sem classificações, exportar a estrutura para o user preencher
    const template = {
      lastUpdated: new Date().toISOString().split("T")[0],
      _instructions: "Preenche os campos ccode/tcode para cada torneio. Depois corre o script novamente.",
      series: {
        drive_tour: {
          name: "Drive Tour",
          regions: {
            norte: { name: "Norte", tournaments: [
              { num: 1, name: "1º Torneio Drive Tour Norte", date: "2026-01-04", campo: "Estela GC", ccode: "", tcode: "", results: [] },
              { num: 2, name: "2º Torneio Drive Tour Norte", date: "2026-02-01", campo: "Amarante", ccode: "", tcode: "", results: [] },
              { num: 3, name: "3º Torneio Drive Tour Norte", date: "2026-02-28", campo: "Vale Pisão", ccode: "", tcode: "", results: [] },
              { num: 4, name: "4º Torneio Drive Tour Norte", date: "2026-04-19", campo: "Ponte de Lima", ccode: "", tcode: "", results: [] },
            ], ranking: [] },
            centro: { name: "Centro / Tejo", tournaments: [
              { num: 1, name: "1º Torneio Drive Tour Tejo", date: "2026-01-04", campo: "Montado", ccode: "", tcode: "", results: [] },
              { num: 2, name: "2º Torneio Drive Tour Tejo", date: "2026-01-31", campo: "Belas", ccode: "", tcode: "", results: [] },
              { num: 3, name: "3º Torneio Drive Tour Tejo", date: "2026-03-28", campo: "St. Estêvão", ccode: "", tcode: "", results: [] },
              { num: 4, name: "4º Torneio Drive Tour Tejo", date: "2026-04-12", campo: "Lisbon SC", ccode: "", tcode: "", results: [] },
            ], ranking: [] },
            sul: { name: "Sul", tournaments: [
              { num: 1, name: "1º Torneio Drive Tour Sul", date: "2026-01-11", campo: "Laguna GC", ccode: "", tcode: "", results: [] },
              { num: 2, name: "2º Torneio Drive Tour Sul", date: "2026-02-01", campo: "Vila Sol", ccode: "", tcode: "", results: [] },
              { num: 3, name: "3º Torneio Drive Tour Sul", date: "2026-04-04", campo: "Penina", ccode: "", tcode: "", results: [] },
              { num: 4, name: "4º Torneio Drive Tour Sul", date: "2026-06-10", campo: "Boavista", ccode: "", tcode: "", results: [] },
            ], ranking: [] },
            madeira: { name: "Madeira", tournaments: [
              { num: 1, name: "1º Torneio Drive Tour Madeira", date: "2026-01-03", campo: "Palheiro Golf", ccode: "", tcode: "", results: [] },
              { num: 2, name: "2º Torneio Drive Tour Madeira", date: "2026-02-07", campo: "Santo da Serra", ccode: "", tcode: "", results: [] },
              { num: 3, name: "3º Torneio Drive Tour Madeira", date: "2026-03-07", campo: "Palheiro Golf", ccode: "", tcode: "", results: [] },
              { num: 4, name: "4º Torneio Drive Tour Madeira", date: "2026-04-11", campo: "Porto Santo Golfe", ccode: "", tcode: "", results: [] },
            ], ranking: [] },
          },
        },
        drive_challenge: {
          name: "Drive Challenge",
          regions: {
            madeira: { name: "Madeira", tournaments: [
              { num: 1, name: "1º Torneio Drive Challenge Madeira", date: "2026-01-04", campo: "Palheiro", ccode: "", tcode: "", results: [] },
              { num: 2, name: "2º Torneio Drive Challenge Madeira", date: "2026-02-08", campo: "Santo da Serra", ccode: "", tcode: "", results: [] },
              { num: 3, name: "3º Torneio Drive Challenge Madeira", date: "2026-05-24", campo: "Palheiro", ccode: "", tcode: "", results: [] },
              { num: 4, name: "4º Torneio Drive Challenge Madeira", date: "2026-04-12", campo: "Porto Santo", ccode: "", tcode: "", results: [] },
              { num: 5, name: "5º Torneio Drive Challenge Madeira", date: "2026-03-08", campo: "Santo da Serra", ccode: "", tcode: "", results: [] },
              { num: 6, name: "6º Torneio Drive Challenge Madeira", date: "2026-06-28", campo: "Porto Santo", ccode: "", tcode: "", results: [] },
              { num: 7, name: "7º Torneio Drive Challenge Madeira", date: "2026-07-11", campo: "Santo da Serra", ccode: "", tcode: "", results: [] },
            ], ranking: [] },
          },
        },
      },
    };
    
    downloadJSON(template, "drive-data-template.json");
    logInfo("Template exportado! Preenche os tcodes e corre novamente.");
    return;
  }
  
  // 2. Descarregar todas as classificações
  const data = await scrapeAllClassifications(tournamentList);
  
  // 3. Derivar rankings regionais (se não existirem)
  for (const [seriesKey, seriesData] of Object.entries(data.series)) {
    for (const [regionKey, regionData] of Object.entries(seriesData.regions)) {
      deriveRankingFromResults(regionData);
    }
  }
  
  // 4. Estatísticas finais
  let totalTourns = 0, totalPlayers = 0;
  for (const [, seriesData] of Object.entries(data.series)) {
    for (const [, regionData] of Object.entries(seriesData.regions)) {
      totalTourns += regionData.tournaments.length;
      for (const t of regionData.tournaments) totalPlayers += t.results.length;
    }
  }
  
  logOk(`═══ DRIVE Scraper — Concluído ═══`);
  logOk(`Torneios: ${totalTourns} | Resultados: ${totalPlayers}`);
  
  // 5. Guardar
  downloadJSON(data, "drive-data.json");
  logInfo("Copia drive-data.json para public/data/ no projecto");
  
})();
