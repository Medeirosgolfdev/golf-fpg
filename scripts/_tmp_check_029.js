// Reconstruir DriveAllRoundsScorecardLB.tsx a partir da versao git HEAD,
// re-aplicando as edicoes (chips esc/tee + SDPill ja la estava).
const fs = require("fs");
const path = require("path");

const REPO = path.join(__dirname, "..");
const FILE = path.join(REPO, "src", "ui", "DriveAllRoundsScorecardLB.tsx");

// Carregar versao original do git (lida via shell antes deste script)
let src = fs.readFileSync("/tmp/drive-orig.tsx", "utf8");

// 1) Adicionar imports
src = src.replace(
  `import PlayerLink from "./PlayerLink";\nimport { SDPill, type PlayersDB } from "./tournamentPrimitives";\nimport { RoundPill } from "./PillBadge";\nimport { ScorecardLeaderboard, type ScorecardRow } from "./ScorecardLeaderboard";`,
  `import PlayerLink from "./PlayerLink";\nimport FilterChip from "./FilterChip";\nimport { SDPill, type PlayersDB } from "./tournamentPrimitives";\nimport { RoundPill, ESC_STYLE } from "./PillBadge";\nimport { getTeeHex } from "../utils/teeColors";\nimport { ScorecardLeaderboard, type ScorecardRow } from "./ScorecardLeaderboard";`
);

// 2) Destructure mais campos do hook
src = src.replace(
  `    nameQ, setNameQ, clubQ, setClubQ,\n    availClubs, clearFilter,\n  } = d;`,
  `    nameQ, setNameQ, clubQ, setClubQ,\n    escFilter, toggleEsc,\n    teeFilter, toggleTee,\n    availClubs, availEsc, availTees, clearFilter,\n  } = d;`
);

// 3) Filter bar: inserir chips antes do select de clubes; expandir condicao do clearFilter
const oldFilterBar = `  const filterBar = (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, paddingBottom: 8, borderBottom: "1px solid var(--border)", marginBottom: 8 }}>
      <div style={{ position: "relative" }}>
        <span className="search-icon-abs">🔍</span>
        <input
          type="text"
          placeholder="Nome ou clube…"
          value={nameQ}
          onChange={(e) => setNameQ(e.target.value)}
          className="input-search"
          style={{ width: 150 }}
        />
      </div>
      {availClubs.length > 2 && (
        <select
          value={clubQ}
          onChange={(e) => setClubQ(e.target.value)}
          className="select-compact"
          style={{ border: \`1px solid \${clubQ ? "var(--accent)" : "var(--border)"}\` }}
        >
          <option value="">Todos os clubes</option>
          {availClubs.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      )}
      {(nameQ || clubQ) && (
        <button onClick={clearFilter} className="filter-clear-btn">✕ limpar</button>
      )}
    </div>
  );`;

const newFilterBar = `  const filterBar = (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, paddingBottom: 8, borderBottom: "1px solid var(--border)", marginBottom: 8 }}>
      <div style={{ position: "relative" }}>
        <span className="search-icon-abs">🔍</span>
        <input
          type="text"
          placeholder="Nome ou clube…"
          value={nameQ}
          onChange={(e) => setNameQ(e.target.value)}
          className="input-search"
          style={{ width: 150 }}
        />
      </div>
      {availEsc.length > 1 && availEsc.map((e) => {
        const k = e.toLowerCase().replace(/[\\s-]/g, "");
        const s = ESC_STYLE[k];
        return (
          <FilterChip key={e} active={escFilter.includes(e)} onClick={() => toggleEsc(e)} color={s?.bg}>
            {e}
          </FilterChip>
        );
      })}
      {availTees.length > 1 && availTees.map((t) => {
        const hex = getTeeHex(t);
        return (
          <FilterChip key={t} active={teeFilter.includes(t)} onClick={() => toggleTee(t)} color={hex}>
            <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span className="tee-dot-sq" style={{ background: hex }} />{t}
            </span>
          </FilterChip>
        );
      })}
      {availClubs.length > 2 && (
        <select
          value={clubQ}
          onChange={(e) => setClubQ(e.target.value)}
          className="select-compact"
          style={{ border: \`1px solid \${clubQ ? "var(--accent)" : "var(--border)"}\` }}
        >
          <option value="">Todos os clubes</option>
          {availClubs.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      )}
      {(nameQ || clubQ || escFilter.length > 0 || teeFilter.length > 0) && (
        <button onClick={clearFilter} className="filter-clear-btn">✕ limpar</button>
      )}
    </div>
  );`;

if (!src.includes(oldFilterBar)) {
  console.error("ERRO: nao consegui localizar o filterBar original em /tmp/drive-orig.tsx");
  process.exit(1);
}
src = src.replace(oldFilterBar, newFilterBar);

fs.writeFileSync(FILE, src);
console.log("OK: DriveAllRoundsScorecardLB.tsx reescrito");
console.log("Tamanho:", fs.statSync(FILE).size, "bytes /", src.split("\n").length, "linhas");
