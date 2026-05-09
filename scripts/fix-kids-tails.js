// Helper: completa as truncations no KIDSdataLoader.ts e KIDSPage.tsx
const fs = require("fs");
const path = require("path");

// ─── KIDSdataLoader ───
const KDL = path.resolve(__dirname, "../src/data/KIDSdataLoader.ts");
let s1 = fs.readFileSync(KDL, "utf-8");
const cutMarker1 = "for (const rival";
const lastIdx1 = s1.lastIndexOf(cutMarker1);
if (lastIdx1 > 0 && !s1.slice(lastIdx1).includes("rejected++;")) {
  s1 = s1.slice(0, lastIdx1).replace(/\s+$/, "") + "\n";
  s1 += `      let matched = 0, rejected = 0;
      for (const rival of map.values()) {
        const e = byName[normName(rival.n)];
        if (!e) continue;
        const espYear = dobYearOf(e.dob);
        if (!espYear) {
          if (e.licencia && !rival.esLicencia) rival.esLicencia = e.licencia;
          if (e.club && !rival.esClub) rival.esClub = e.club;
          continue;
        }
        const existingYear = dobYearOf(rival.dob);
        const estimatedYear = existingYear ?? estimateBirthYear(rival);
        if (estimatedYear != null && Math.abs(espYear - estimatedYear) > 1) {
          rejected++;
          continue;
        }
        if (!rival.dob && e.dob) rival.dob = e.dob;
        if (!rival.fpgClub && e.club) rival.fpgClub = e.club;
        if (!rival.esLicencia && e.licencia) rival.esLicencia = e.licencia;
        if (!rival.esClub && e.club) rival.esClub = e.club;
        if (!rival.co) rival.co = "Spain";
        matched++;
      }
      _loadedFiles.push({ path: \`spain-enrich:matched=\${matched},rejected=\${rejected}\`, status: "loaded", group: "enrich" });
    } else {
      _loadedFiles.push({ path: \`\${base}spain-players.json\`, status: "error", error: "null", group: "enrich" });
    }
  } catch (e) {
    _loadedFiles.push({ path: \`\${base}spain-players.json\`, status: "error", error: String(e), group: "enrich" });
  }

  onUpdate?.(Array.from(map.values()));
  return Array.from(map.values());
}
`;
  fs.writeFileSync(KDL, s1);
  console.log("KIDSdataLoader fixed:", s1.split("\n").length, "lines");
}

// ─── KIDSPage tail ───
const KP = path.resolve(__dirname, "../src/pages/KIDSPage.tsx");
let s2 = fs.readFileSync(KP, "utf-8");
const lastClose = s2.lastIndexOf("</RivalsCtx.Provider>");
if (lastClose < 0) {
  // Truncated — restore tail
  const cutMarker2 = "rivals.filter(p => (nPlayed(p) > 0 || p.isM) && playerMatchesFilter(p, fids))";
  const idx2 = s2.lastIndexOf(cutMarker2);
  if (idx2 > 0) {
    s2 = s2.slice(0, idx2).replace(/\s+$/, "") + "\n";
    s2 += `        rivals.filter(p => (nPlayed(p) > 0 || p.isM) && playerMatchesFilter(p, fids)).length
        }
      </span>
      </div>

      <div style={{
        display: "flex", gap: 6, padding: "6px 10px",
        overflowX: "auto", whiteSpace: "nowrap",
        borderBottom: "1px solid var(--border-light)",
        background: "var(--bg)",
        flexShrink: 0,
      }}>
        {SIDEBAR_FILTERS.filter(f => f.id !== "all").map(f => {
          const active = fids.has(f.id);
          return (
            <button key={f.id}
              className={"tourn-tab tourn-tab-sm" + (active ? " active" : " tourn-tab-muted")}
              style={{ flexShrink: 0 }}
              onClick={() => toggleFid(f.id)}>
              {f.label}
            </button>
          );
        })}
      </div>

      <div className="master-detail">
        <div className={\`sidebar \${md.open ? "" : "sidebar-closed"}\`}>
          <RivaisSidebar
            selected={selectedPlayer}
            onSelect={handleSelectPlayer}
            fids={fids} q={q}
            paisFilter={paisFilter}
            tierFilter={tierFilter}
            minTorn={minTorn}
            apenasDirectos={apenasDirectos}
            playerTypeMap={playerTypeMap}
          />
        </div>
        <div className="course-detail" ref={md.detailRef}>
          {selectedPlayer ? (
            <RivalDetail playerName={selectedPlayer} />
          ) : (
            <div className="muted p-16">Selecciona um rival à esquerda.</div>
          )}
        </div>
      </div>
    </div>
    </DataSourcesProvider>
    </ScoringStatsCtx.Provider>
    </MemberHistCtx.Provider>
    </RivalsCtx.Provider>
  );
}

export default function RivaisIntlPage() {
  const { unlocked, unlock } = usePasswordGate();
  if (!unlocked) return <PasswordGate onUnlock={unlock} />;
  return <RivaisIntlContent />;
}
`;
    fs.writeFileSync(KP, s2);
    console.log("KIDSPage fixed:", s2.split("\n").length, "lines");
  } else {
    console.log("KIDSPage cut marker not found");
  }
} else {
  console.log("KIDSPage already has closing tag");
}
