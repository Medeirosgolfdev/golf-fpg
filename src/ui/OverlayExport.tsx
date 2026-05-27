/*
 * OverlayExport — UI principal do simulador para gerar scorecards visuais.
 *
 * Estrutura modular (refactor 2026-05-27):
 *   - ./overlay/types.ts        — DD, P, Vis, StT, Stats, OverlayData
 *   - ./overlay/shared.tsx      — fontes, cores, calcStats, metaStr, hiChStr, hexToRgba
 *   - ./overlay/badges.tsx      — SC/SCL/SCQ/SCO/SCA/TpBadge/Grid2/StatsRow
 *   - ./overlay/designs/        — V1-V48 agrupados por categoria visual
 *   - ./overlay/registry.tsx    — DESIGNS, CAT_*, ALL_TOGGLES, VIS_PRESETS, BG_OPTIONS
 *
 * Notas:
 *   - Cores hardcoded intencionalmente (html-to-image perde CSS vars no SVG→Canvas→PNG).
 *   - O ficheiro monolítico antigo cresceu para 2280+ linhas e o Edit tool truncava o EOF
 *     em ficheiros desse tamanho — daí o split.
 */
import React, { useState, useMemo, useRef, useCallback } from "react";
import { MONTHS_PT } from "../utils/format";
import type { OverlayData, DD, Vis, StT, Stats } from "./overlay/types";
import { FONT_LINK, getFontEmbedCSS, hexToRgba, calcStats } from "./overlay/shared";
import { DESIGNS, ALL_TOGGLES, VIS_PRESETS, BG_OPTIONS, CAT_ORDER, defaultVis } from "./overlay/registry";

/* Re-export OverlayData para consumidores externos (SimuladorPage, etc). */
export type { OverlayData } from "./overlay/types";

/* ═══════ MAIN COMPONENT ═══════ */
export default function OverlayExport({ data, inline, nextEvent }: { data: OverlayData; inline?: boolean; nextEvent?: string }) {
  const [player, setPlayer] = useState(() => {
    try { return localStorage.getItem("ov_player") || "Manuel"; } catch { return "Manuel"; }
  });
  const [event,       setEvent]       = useState(data.event || nextEvent || "");
  const [round,       setRound]       = useState(data.round || 1);
  const [date,        setDate]        = useState(() => {
    if (data.date) return data.date;
    const n = new Date();
    return `${n.getDate()} ${MONTHS_PT[n.getMonth()]} ${n.getFullYear()}`;
  });
  const [position,    setPosition]    = useState(data.position || "");
  const [vis,         setVis]         = useState<Vis>(defaultVis);
  const [bgId,        setBgId]        = useState("navy");
  const [customBg,    setCustomBg]    = useState("#1a4a2e");
  const [bgAlpha,     setBgAlpha]     = useState(88);
  /* Dois seletores independentes:
     - theme:    cor do texto PRINCIPAL (jogador, score) — dark=branco / light=preto
     - subTheme: cor do texto SECUNDÁRIO (torneio, campo, data) — dark=branco / light=preto
     Permite, por ex., principal branco com secundário preto (ou vice-versa). */
  const [theme,    setTheme]    = useState<"dark"|"light">("dark");
  const [subTheme, setSubTheme] = useState<"dark"|"light">("dark");
  const [exporting,   setExporting]   = useState(false);
  const [exportingId, setExportingId] = useState<string|null>(null);
  const [collapsed,   setCollapsed]   = useState(true);
  const [manualScore, setManualScore] = useState("");
  const designRefs = useRef<Record<string, HTMLDivElement|null>>({});

  /* Persistir nome do jogador entre sessões */
  React.useEffect(() => {
    try { localStorage.setItem("ov_player", player); } catch { /* ignore */ }
  }, [player]);

  const noHoleData   = !data.hasHoles || data.scores.length === 0;
  const allFilled    = !noHoleData && data.scores.every(s => s !== null);
  const filledScores = useMemo<number[]>(
    () => noHoleData ? [] : data.scores.map((s, i) => s !== null ? s : (data.par[i] ?? 4)),
    [noHoleData, data.scores, data.par],
  );
  const manualTotal  = noHoleData ? parseInt(manualScore) || null : null;
  const manualPar    = data.is9h ? 36 : 72;
  const manualSD     = manualTotal !== null && data.slope > 0 ? (113/data.slope)*(manualTotal - data.cr) : null;

  const dd: DD = useMemo(() => ({
    player, event, round, date, position,
    course: data.courseName, tee: data.teeName, teeDist: data.teeDist,
    cr: data.cr, slope: data.slope,
    par: noHoleData ? [] : data.par,
    scores: filledScores,
    si: noHoleData ? [] : data.si,
    meters: data.meters,
    hi: data.hi, courseHcp: data.courseHcp,
    sd: noHoleData ? (manualSD ?? null) : data.sd,
    is9h: data.is9h, hasHoles: data.hasHoles,
  }), [data, player, event, round, date, position, filledScores, noHoleData, manualSD]);

  const stats = useMemo((): Stats => {
    if (!noHoleData) return calcStats(dd);
    const sT = manualTotal ?? manualPar;
    return {
      pF:0, pB:0, pT:manualPar, sF:0, sB:0, sT,
      vpT: sT - manualPar, vpF: 0, vpB: 0,
      sd: manualSD ?? 0,
      st: { hio:0, eagles:0, birdies:0, pars:0, bogeys:0, doubles:0, triples:0 } as StT,
    };
  }, [dd, noHoleData, manualTotal, manualPar, manualSD]);

  const toggle = useCallback((key: string) => setVis(prev => ({ ...prev, [key]: !prev[key] })), []);
  const hasHIO = useMemo(() => dd.scores.some(sc => sc === 1), [dd.scores]);
  const available = useMemo(
    () => DESIGNS.filter(x => (!x.needsHoles || data.hasHoles) && (!x.needsHIO || hasHIO)),
    [data.hasHoles, hasHIO],
  );

  const bgOpt   = BG_OPTIONS.find(b => b.id === bgId);
  const bgHex   = bgId === "custom" ? customBg : (bgOpt?.hex ?? null);
  const bgColor = bgHex ? hexToRgba(bgHex, bgAlpha/100) : "transparent";

  /* tc = principal (theme); tc2/tc3/tc4 = secundário (subTheme).
     Tons intensificados (mais escuros no modo Claro, menos cinzento no modo Escuro)
     para o subtítulo ficar mais visível sobre fundos transparentes/foto. */
  const tc  = theme === "light" ? "#111111" : "#ffffff";
  const tc2 = subTheme === "light" ? "#1a1a1a" : "#f0f0f0";
  const tc3 = subTheme === "light" ? "#2a2a2a" : "#e0e0e0";
  const tc4 = subTheme === "light" ? "#3a3a3a" : "#c8c8c8";

  const checkerBg: React.CSSProperties = {
    backgroundImage: "linear-gradient(45deg,#ccc 25%,transparent 25%),linear-gradient(-45deg,#ccc 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#ccc 75%),linear-gradient(-45deg,transparent 75%,#ccc 75%)",
    backgroundSize: "12px 12px",
    backgroundPosition: "0 0,0 6px,6px -6px,-6px 0px",
    backgroundColor: "#fff",
  };

  /* ── Helpers de export ── */
  const renderDesign = useCallback(async (designId: string): Promise<Blob|null> => {
    const el = designRefs.current[designId];
    if (!el) { console.warn("[overlay] ref not found:", designId); return null; }
    try { await document.fonts.ready; } catch { /* ignore */ }
    const { toCanvas } = await import("html-to-image");
    const fontEmbedCSS = await getFontEmbedCSS();
    const opts = { pixelRatio: 3, fontEmbedCSS, cacheBust: true };
    /* Safari/iOS: html-to-image precisa de múltiplas passagens para "aquecer" o renderer SVG foreignObject. */
    const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent)
      || (/iPad|iPhone/.test(navigator.userAgent) && !("MSStream" in window));
    if (isSafari) {
      await toCanvas(el, opts).catch(() => null);
      await toCanvas(el, opts).catch(() => null);
    }
    const canvas = await toCanvas(el, opts);
    if (!canvas) return null;
    return new Promise<Blob|null>(resolve => {
      canvas.toBlob(blob => resolve(blob), "image/png");
    });
  }, []);

  const shareFiles = async (files: File[]): Promise<boolean> => {
    if (!navigator.share || !navigator.canShare) return false;
    try {
      if (!navigator.canShare({ files })) return false;
      await navigator.share({ files, title: "Scorecards" });
      return true;
    } catch (e: unknown) {
      if (e instanceof DOMException && e.name === "AbortError") return true;
      return false;
    }
  };

  const doExportAll = useCallback(async () => {
    setExporting(true);
    try {
      const files: File[] = [];
      for (const design of available) {
        const blob = await renderDesign(design.id);
        if (blob) files.push(new File([blob], `${design.label}.png`, { type: "image/png" }));
      }
      if (!files.length) return;
      if (await shareFiles(files)) return;
      for (let i = 0; i < files.length; i++) {
        const url = URL.createObjectURL(files[i]);
        const a = document.createElement("a");
        a.href = url; a.download = files[i].name; a.click();
        URL.revokeObjectURL(url);
        if (i < files.length - 1) await new Promise(r => setTimeout(r, 300));
      }
    } catch (err) {
      console.error("[overlay] export-all error:", err);
      alert(`Erro ao exportar: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setExporting(false);
    }
  }, [available, renderDesign]);

  const doExportOne = useCallback(async (designId: string) => {
    setExportingId(designId);
    try {
      const blob = await renderDesign(designId);
      if (!blob) { alert("Não foi possível gerar a imagem."); return; }
      const file = new File([blob], `scorecard-${designId}.png`, { type: "image/png" });
      if (await shareFiles([file])) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = file.name; a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("[overlay] export error:", err);
      alert(`Erro ao exportar: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setExportingId(null);
    }
  }, [renderDesign]);

  return (
    <div className={inline ? "ov-export-inline" : "ov-export"}>
      {!inline && (
        <div className="ov-header" onClick={() => setCollapsed(!collapsed)}>
          <h3 className="h-xs" style={{ margin:0, cursor:"pointer", userSelect:"none" }}>
            📷 Partilhar Scorecard{" "}
            <span style={{ fontSize:13, fontWeight:600, marginLeft:8, color:"#888" }}>{collapsed ? "▸ expandir" : "▾"}</span>
          </h3>
          {!allFilled && !noHoleData && !collapsed && (
            <div style={{ fontSize:12, color:"#999", marginTop:2 }}>Buracos em branco assumidos como Par.</div>
          )}
        </div>
      )}
      {inline && !allFilled && !noHoleData && (
        <div style={{ fontSize:12, color:"#888", marginBottom:4 }}>Buracos em branco assumidos como Par.</div>
      )}

      {(inline || !collapsed) && <>
        <link href={FONT_LINK} rel="stylesheet" />

        {/* ── 1. DADOS ── */}
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"6px 10px", marginBottom:10 }}>
          <div className="ov-field" style={{ gridColumn:"1/3" }}>
            <label style={{ fontSize:11, fontWeight:700, color:"#888" }}>Jogador</label>
            <input type="text" value={player} onChange={e=>setPlayer(e.target.value)} placeholder="Nome do jogador" className="input" style={{ width:"100%" }} />
          </div>
          <div className="ov-field">
            <label style={{ fontSize:11, fontWeight:700, color:"#888" }}>Torneio</label>
            <input type="text" value={event} onChange={e=>setEvent(e.target.value)} placeholder="Nome do torneio" className="input" style={{ width:"100%" }} />
          </div>
          <div style={{ display:"flex", gap:6 }}>
            <div className="ov-field" style={{ flex:1 }}>
              <label style={{ fontSize:11, fontWeight:700, color:"#888" }}>Round</label>
              <input type="number" value={round} min={1} max={9} onChange={e=>setRound(Number(e.target.value))} className="input" style={{ width:"100%" }} />
            </div>
            <div className="ov-field" style={{ flex:1 }}>
              <label style={{ fontSize:11, fontWeight:700, color:"#888" }}>Pos.</label>
              <input type="text" value={position} onChange={e=>setPosition(e.target.value)} placeholder="—" className="input" style={{ width:"100%" }} />
            </div>
          </div>
          <div className="ov-field">
            <label style={{ fontSize:11, fontWeight:700, color:"#888" }}>Data</label>
            <input type="text" value={date} onChange={e=>setDate(e.target.value)} className="input" style={{ width:"100%" }} />
          </div>
          {noHoleData && (
            <div className="ov-field">
              <label style={{ fontSize:11, fontWeight:700, color:"#888" }}>Score Total</label>
              <input type="text" inputMode="numeric" value={manualScore} onChange={e=>setManualScore(e.target.value.replace(/\D/g,""))} placeholder={String(manualPar)} className="input" style={{ width:"100%", fontWeight:800 }} />
            </div>
          )}
        </div>

        {/* ── 2. PERSONALIZAÇÃO ── */}
        <div className="ov-section">
          <div className="ov-section-label">Fundo</div>
          <div style={{ display:"flex", flexWrap:"wrap", gap:5, alignItems:"center", marginBottom:8 }}>
            {BG_OPTIONS.map(bg => (
              <button key={bg.id} className={`ov-opt-btn${bgId===bg.id?" active":""}`} onClick={()=>setBgId(bg.id)}
                style={{ display:"inline-flex", alignItems:"center", gap:5 }}>
                <span style={{
                  display:"inline-block", width:16, height:16, borderRadius:4, flexShrink:0,
                  border:"1.5px solid rgba(128,128,128,0.3)",
                  background: bg.hex===null ? "linear-gradient(45deg,#ccc 25%,#fff 25%,#fff 50%,#ccc 50%,#ccc 75%,#fff 75%)" : bg.hex,
                  backgroundSize: bg.hex===null ? "6px 6px" : undefined,
                }} />
                <span>{bg.label}</span>
              </button>
            ))}
            <button className={`ov-opt-btn${bgId==="custom"?" active":""}`} onClick={()=>setBgId("custom")}
              style={{ display:"inline-flex", alignItems:"center", gap:5 }}>
              <input type="color" value={customBg} onClick={e=>e.stopPropagation()}
                onChange={e=>{ setCustomBg(e.target.value); setBgId("custom"); }}
                style={{ width:16, height:16, padding:0, border:"1.5px solid rgba(128,128,128,0.3)", borderRadius:4, cursor:"pointer" }} />
              <span>Outra</span>
            </button>
            <span style={{ width:1, height:18, background:"rgba(128,128,128,.2)", margin:"0 2px" }} />
            {/* Texto PRINCIPAL (nome, score) — branco / preto */}
            <span style={{ fontSize:10, fontWeight:800, color:"#888", marginRight:2 }}>Texto:</span>
            {(["dark","light"] as const).map(t => (
              <button key={t} className={`ov-opt-btn${theme===t?" active":""}`} onClick={()=>setTheme(t)}
                title={t==="dark" ? "Texto principal a branco" : "Texto principal a preto"}
                style={{ display:"inline-flex", alignItems:"center", gap:5 }}>
                <span style={{ display:"inline-block", width:16, height:16, borderRadius:4, background:t==="dark"?"#1a1a1a":"#fff", border:"1.5px solid rgba(128,128,128,0.3)" }} />
                <span>{t==="dark"?"Escuro":"Claro"}</span>
              </button>
            ))}
            <span style={{ width:1, height:18, background:"rgba(128,128,128,.2)", margin:"0 2px" }} />
            {/* Texto SECUNDÁRIO (torneio, campo, data) — branco / preto */}
            <span style={{ fontSize:10, fontWeight:800, color:"#888", marginRight:2 }}>Subtítulo:</span>
            {(["dark","light"] as const).map(t => (
              <button key={"sub-"+t} className={`ov-opt-btn${subTheme===t?" active":""}`} onClick={()=>setSubTheme(t)}
                title={t==="dark" ? "Texto secundário a branco" : "Texto secundário a preto"}
                style={{ display:"inline-flex", alignItems:"center", gap:5 }}>
                <span style={{ display:"inline-block", width:16, height:16, borderRadius:4, background:t==="dark"?"#1a1a1a":"#fff", border:"1.5px solid rgba(128,128,128,0.3)" }} />
                <span>{t==="dark"?"Escuro":"Claro"}</span>
              </button>
            ))}
          </div>
          {bgHex && (
            <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:8 }}>
              <span style={{ fontSize:11, fontWeight:800, color:"#888" }}>Opacidade do fundo</span>
              <input type="range" min={0} max={100} value={bgAlpha} onChange={e=>setBgAlpha(parseInt(e.target.value))} style={{ flex:1, maxWidth:160, accentColor:"#2e7d32" }} />
              <span style={{ fontSize:12, color:"#666", fontWeight:800, minWidth:32 }}>{bgAlpha}%</span>
            </div>
          )}

          <div className="ov-section-label" style={{ marginTop:4 }}>Preset</div>
          <div style={{ display:"flex", flexWrap:"wrap", gap:5, marginBottom:8 }}>
            {VIS_PRESETS.map(p => (
              <button key={p.label} className="ov-opt-btn" onClick={()=>setVis(p.vis)} title={p.desc}>{p.label}</button>
            ))}
          </div>

          <div className="ov-section-label">Mostrar</div>
          <div style={{ display:"flex", flexWrap:"wrap", gap:"4px 6px" }}>
            {ALL_TOGGLES.map(t => (
              <label key={t.key} className="ov-toggle">
                <input type="checkbox" checked={!!vis[t.key]} onChange={()=>toggle(t.key)} />
                <span>{t.label}</span>
              </label>
            ))}
          </div>
        </div>

        {/* ── 3. EXPORT ALL ── */}
        <div style={{ display:"flex", gap:8, marginBottom:12 }}>
          <button className="ov-export-btn" onClick={doExportAll} disabled={exporting}>
            {exporting ? "A gerar imagens…" : `📷 Descarregar Todos (${available.length})`}
          </button>
        </div>

        {noHoleData && !manualTotal && (
          <div style={{ padding:"10px 14px", background:"#fffbeb", border:"1px solid #fde68a", borderRadius:8, color:"#92400e", fontSize:13, fontWeight:700, marginBottom:12 }}>
            Insere o <strong>Score Total</strong> acima para pré-visualizar os overlays.
          </div>
        )}

        {/* ── 4. GALERIA POR CATEGORIAS ── */}
        {CAT_ORDER.map(cat => {
          const items = available.filter(x => x.cat === cat);
          if (!items.length) return null;
          return (
            <div key={cat} style={{ marginBottom:16 }}>
              <div style={{ fontSize:12, fontWeight:800, color:"#888", letterSpacing:.5, textTransform:"uppercase", marginBottom:6, borderBottom:"1px solid rgba(128,128,128,.15)", paddingBottom:3 }}>{cat}</div>
              <div className="ov-gallery">
                {items.map(x => (
                  <div key={x.id} className="ov-card">
                    <div className="ov-card-header">
                      <span className="ov-card-label">{x.label}</span>
                      <button className="ov-share-btn" onClick={()=>doExportOne(x.id)} disabled={exportingId===x.id} title="Partilhar / Descarregar">
                        {exportingId===x.id ? "⏳" : "📤"}
                      </button>
                    </div>
                    <div className="ov-card-preview" style={checkerBg}>
                      <div ref={el=>{ designRefs.current[x.id]=el; }} style={{ display:"inline-block", color:tc }}>
                        <x.C d={dd} v={vis} s={stats} bg={bgColor} tc={tc} tc2={tc2} tc3={tc3} tc4={tc4} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </>}
    </div>
  );
}
