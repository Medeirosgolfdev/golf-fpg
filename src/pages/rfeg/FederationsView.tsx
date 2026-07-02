/**
 * FederationsView.tsx — Lista das 19 federações territoriais espanholas (RFEG).
 *
 * Análoga à RFEGCategoriesView (categorias de idade), mas para a estrutura
 * organizacional do golfe espanhol: 1 federação nacional + 17 autonómicas + 2
 * delegações de cidades autónomas.
 *
 * Inclui mapeamento para a plataforma de scoring usada (NextCaddy / site próprio
 * / não usado) — útil para perceber onde podemos ir buscar dados.
 */
import type React from "react";
import DetailHeader from "../../ui/DetailHeader";
import ExtLink from "../../ui/ExternalLink";
import SortableHdr from "../../ui/SortableHdr";
import { useSort } from "../../hooks/useSort";

interface RFEGFederation {
  /** Nome oficial RFEG */
  name: string;
  /** Comunidade autónoma / cidade */
  region: string;
  /** Site oficial */
  website: string;
  /** Página oficial RFEG (rfeg.es/.../federacion_X.html?id=NNN) */
  rfegPage: string;
  /** Plataforma onde os torneios desta federação são publicados.
   *  - "NextCaddy" — usa nextcaddy.com (4 federações)
   *  - "GolfDirecto" — usa golfdirecto.com (Catalana, descoberto 2026-05-09)
   *  - "Próprio" — site próprio com sistema interno (não scrapado)
   *  - "Vazio" — código NC existe mas não tem dados
   */
  platform: "NextCaddy" | "GolfDirecto" | "Próprio" | "Vazio";
  /** Código NextCaddy se aplicável */
  ncCode?: string;
  /** Estado do scrape (NextCaddy só) */
  scraped?: boolean;
  /** Nº torneios scrapados (NextCaddy só) */
  scrapedCount?: number;
  /** Prefixo das licenças emitidas por esta federação (2 letras) */
  licPrefix?: string;
  /** Notas adicionais sobre a plataforma — ex: legacy, multi-sistemas */
  notes?: string;
}

export const RFEG_FEDERATIONS: RFEGFederation[] = [
  // 4 federações no NextCaddy (já scrapadas)
  {
    name: "Real Federación Andaluza de Golf",
    region: "Andalucía",
    website: "https://portal.golfandalucia.com",
    rfegPage: "https://rfeg.es/rfeg/federaciones-autonomicas/real_federacion_andaluza_de_golf.html?id=985",
    platform: "NextCaddy",
    ncCode: "am00",
    scraped: true,
    scrapedCount: 215,
    licPrefix: "AM",
  },
  {
    name: "Real Federación Canaria de Golf",
    region: "Canarias",
    website: "https://www.federacioncanariagolf.com",
    rfegPage: "https://rfeg.es/rfeg/federaciones-autonomicas/real_federacion_canaria_de_golf.html?id=990",
    platform: "NextCaddy",
    ncCode: "cp00",
    scraped: true,
    scrapedCount: 191,
    licPrefix: "CP",
  },
  {
    name: "Federación de Golf de Castilla y León",
    region: "Castilla y León",
    website: "https://www.fgcyl.com",
    rfegPage: "https://rfeg.es/rfeg/federaciones-autonomicas/federacion_de_golf_de_castilla_y_leon.html?id=982",
    platform: "NextCaddy",
    ncCode: "7700",
    scraped: true,
    scrapedCount: 490,
    licPrefix: "77",
  },
  {
    name: "Real Federación de Golf de Madrid",
    region: "Comunidad de Madrid",
    website: "https://www.fedgolfmadrid.com",
    rfegPage: "https://rfeg.es/rfeg/federaciones-autonomicas/real_federacion_de_golf_de_madrid.html?id=989",
    platform: "NextCaddy",
    ncCode: "cm00",
    scraped: true,
    scrapedCount: 427,
    licPrefix: "CM",
  },
  // 13 federações com site próprio (não scrapadas)
  {
    name: "Federación Aragonesa de Golf",
    region: "Aragón",
    website: "https://www.aragongolf.org",
    rfegPage: "https://rfeg.es/rfeg/federaciones-autonomicas/federacion_aragonesa_de_golf.html?id=978",
    platform: "Próprio",
    licPrefix: "AR",
  },
  {
    name: "Federación de Golf del Principado de Asturias",
    region: "Asturias",
    website: "https://www.fgpa.es",
    rfegPage: "https://rfeg.es/rfeg/federaciones-autonomicas/fg_principado_de_asturias.html?id=979",
    platform: "Próprio",
    licPrefix: "AS",
  },
  {
    name: "Federación Balear de Golf",
    region: "Illes Balears",
    website: "https://www.balearesgolf.com",
    rfegPage: "https://rfeg.es/rfeg/federaciones-autonomicas/federacion_balear_de_golf.html?id=986",
    platform: "Próprio",
    licPrefix: "BA",
  },
  {
    name: "Federación de Cantabria de Golf",
    region: "Cantabria",
    website: "https://www.fcantabra.com",
    rfegPage: "https://rfeg.es/rfeg/federaciones-autonomicas/federacion_de_cantabria_de_golf.html?id=980",
    platform: "Próprio",
    licPrefix: "CN",
  },
  {
    name: "Federación de Golf de Castilla La Mancha",
    region: "Castilla-La Mancha",
    website: "https://www.fcmgolf.com",
    rfegPage: "https://rfeg.es/rfeg/federaciones-autonomicas/federacion_de_golf_de_castilla_la_mancha.html?id=983",
    platform: "Próprio",
    licPrefix: "CL",
  },
  // Federación Catalana — descoberta 2026-05-09: usa golfdirecto.com (não NextCaddy).
  // Site real é catgolf.com, não fcgolf.cat. Plataforma legacy: open.imaster.golf.
  {
    name: "Federación Catalana de Golf",
    region: "Catalunya",
    website: "https://www.catgolf.com",
    rfegPage: "https://rfeg.es/rfeg/federaciones-autonomicas/federacion_catalana_de_golf.html?id=987",
    platform: "GolfDirecto",
    scraped: true,
    scrapedCount: 25,
    licPrefix: "CB",
    notes: "Plataforma actual: golfdirecto.com (desde 2024). Legacy: open.imaster.golf (2018-2023). Discovery via catgolf.com.",
  },
  {
    name: "Federación Extremeña de Golf",
    region: "Extremadura",
    website: "https://www.fexgolf.com",
    rfegPage: "https://rfeg.es/rfeg/federaciones-autonomicas/federacion_extremena_de_golf.html?id=984",
    platform: "Próprio",
    licPrefix: "EX",
  },
  {
    name: "Federación Gallega de Golf",
    region: "Galicia",
    website: "https://www.fggolf.com",
    rfegPage: "https://rfeg.es/rfeg/federaciones-autonomicas/federacion_gallega_de_golf.html?id=992",
    platform: "Próprio",
    licPrefix: "GA",
  },
  {
    name: "Federación Murciana de Golf",
    region: "Región de Murcia",
    website: "https://www.fmgolf.es",
    rfegPage: "https://rfeg.es/rfeg/federaciones-autonomicas/federacion_murciana_de_golf.html?id=996",
    platform: "Próprio",
    licPrefix: "MU",
  },
  {
    name: "Federación Navarra de Golf",
    region: "Navarra",
    website: "https://www.golfnavarra.com",
    rfegPage: "https://rfeg.es/rfeg/federaciones-autonomicas/federacion_navarra_de_golf.html?id=981",
    platform: "Próprio",
    licPrefix: "NV",
  },
  {
    name: "Federación de Golf de La Rioja",
    region: "La Rioja",
    website: "https://www.golflarioja.com",
    rfegPage: "https://rfeg.es/rfeg/federaciones-autonomicas/federacion_de_golf_de_la_rioja.html?id=997",
    platform: "Próprio",
    licPrefix: "RJ",
  },
  {
    name: "Federación de Golf de la Comunitat Valenciana",
    region: "Valencia",
    website: "https://www.golfcv.com",
    rfegPage: "https://rfeg.es/rfeg/federaciones-autonomicas/federacion_valenciana_de_golf.html?id=994",
    platform: "Próprio",
    licPrefix: "VL",
  },
  {
    name: "Real Federación Vasca de Golf",
    region: "País Vasco / Euskadi",
    website: "https://www.fvgolf.org",
    rfegPage: "https://rfeg.es/rfeg/federaciones-autonomicas/federacion_vasca_de_golf.html?id=998",
    platform: "Próprio",
    licPrefix: "VS",
  },
  // 2 delegações de cidades autónomas
  {
    name: "Delegación de Ceuta",
    region: "Ceuta",
    website: "",
    rfegPage: "https://rfeg.es/rfeg/federaciones-autonomicas/delegacion_territorial_de_ceuta.html?id=988",
    platform: "Vazio",
    ncCode: "ce00",
    licPrefix: "CE",
  },
  {
    name: "Federación Melillense de Golf",
    region: "Melilla",
    website: "",
    rfegPage: "https://rfeg.es/rfeg/federaciones-autonomicas/federacion_melillense_de_golf.html?id=995",
    platform: "Vazio",
    ncCode: "ml00",
    licPrefix: "ML",
  },
];

/** Definição de uma coluna da FedTable. Quando `sortVal` é fornecido, a coluna
 *  é ordenável por clique no cabeçalho. */
interface FedColumn {
  /** Chave única da coluna (usada como sortKey). */
  key: string;
  /** Texto do cabeçalho. */
  label: React.ReactNode;
  /** Acessor para o valor de ordenação. Omitir torna a coluna não-ordenável. */
  sortVal?: (f: RFEGFederation) => string | number;
  /** Renderiza a célula. */
  cell: (f: RFEGFederation) => React.ReactNode;
  /** Alinhamento do conteúdo (default: "center"). */
  align?: "left" | "center" | "right";
  /** Estilo extra aplicado à célula. */
  cellStyle?: React.CSSProperties;
  /** Direcção inicial ao seleccionar esta coluna (default: "asc"). */
  defaultDir?: "asc" | "desc";
}

/** Tabela de federações genérica e ordenável por qualquer coluna com `sortVal`. */
function FedTable({ rows, columns }: { rows: RFEGFederation[]; columns: FedColumn[] }) {
  const dirMap: Record<string, "asc" | "desc"> = {};
  for (const c of columns) if (c.defaultDir) dirMap[c.key] = c.defaultDir;
  const { sortKey, sortDir, toggleSort } = useSort<string>(columns[0]?.key ?? "", "asc", dirMap);

  const col = columns.find(c => c.key === sortKey);
  const sorted = col?.sortVal
    ? [...rows].sort((a, b) => {
        const av = col.sortVal!(a);
        const bv = col.sortVal!(b);
        let cmp: number;
        if (typeof av === "number" && typeof bv === "number") {
          cmp = av - bv;
        } else {
          cmp = String(av).localeCompare(String(bv), "es");
        }
        return sortDir === "asc" ? cmp : -cmp;
      })
    : rows;

  return (
    <div style={{ overflowX: "auto" }}>
      <table className="dtable">
        <thead>
          <tr>
            {columns.map(c => {
              const align = c.align ?? "center";
              if (c.sortVal) {
                return (
                  <SortableHdr
                    key={c.key}
                    k={c.key}
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSort={toggleSort}
                    style={{ textAlign: align }}
                  >
                    {c.label}
                  </SortableHdr>
                );
              }
              return (
                <th key={c.key} style={{ textAlign: align }}>{c.label}</th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.map(f => (
            <tr key={f.name}>
              {columns.map(c => (
                <td key={c.key} style={{ textAlign: c.align ?? "center", ...c.cellStyle }}>
                  {c.cell(f)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function RFEGFederationsView() {
  const ncFeds = RFEG_FEDERATIONS.filter(f => f.platform === "NextCaddy");
  const gdFeds = RFEG_FEDERATIONS.filter(f => f.platform === "GolfDirecto");
  const ownFeds = RFEG_FEDERATIONS.filter(f => f.platform === "Próprio");
  const emptyFeds = RFEG_FEDERATIONS.filter(f => f.platform === "Vazio");
  const totalScraped = ncFeds.reduce((acc, f) => acc + (f.scrapedCount || 0), 0);
  const totalGdScraped = gdFeds.reduce((acc, f) => acc + (f.scrapedCount || 0), 0);
  const trackedTotal = ncFeds.length + gdFeds.length;

  return (
    <div className="p-12-16">
      <DetailHeader
        title="🏛️ Federaciones de Golf España"
        sub={
          <>
            <span className="muted">
              Real Federación Española de Golf (RFEG) + 17 autonómicas + 2 delegações de cidades autónomas
            </span>
            <ExtLink
              href="https://rfeg.es/rfeg/federaciones-autonomicas"
              className="tourn-ext-link"
              style={{ marginLeft: 8 }}
            >
              🔗 rfeg.es
            </ExtLink>
          </>
        }
      />

      <div style={{ marginTop: 12, padding: "10px 12px", background: "var(--bg-muted)", border: "1px solid var(--border)", borderRadius: "var(--radius)", fontSize: "var(--fs-12)" }}>
        <strong>⚠ Estrutura federativa do golfe espanhol.</strong> A nível nacional
        existe a <strong>RFEG</strong> (Madrid, sede do golfe federado). Sob a sua tutela
        coexistem <strong>19 federações territoriais</strong> que organizam circuitos
        regionais e emitem licenças com prefixo de 2 letras (AM, CM, CB, CP, ...).
        O <em>número da licença é único nacionalmente</em> — um jogador catalão (CB...)
        joga em Madrid com a mesma licença.
      </div>

      <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
        <div style={{ padding: 12, background: "var(--bg-muted)", borderRadius: "var(--radius)", border: "1px solid var(--border)" }}>
          <div style={{ fontSize: "var(--fs-24)", fontWeight: 700, color: "var(--color-good)" }}>{ncFeds.length}</div>
          <div className="fs-11 muted">via NextCaddy (scrapadas)</div>
          <div className="fs-10" style={{ marginTop: 4 }}>{totalScraped} torneios indexados</div>
        </div>
        <div style={{ padding: 12, background: "var(--bg-muted)", borderRadius: "var(--radius)", border: "1px solid var(--border)" }}>
          <div style={{ fontSize: "var(--fs-24)", fontWeight: 700, color: "var(--color-good)" }}>{gdFeds.length}</div>
          <div className="fs-11 muted">via GolfDirecto (scrapada)</div>
          <div className="fs-10" style={{ marginTop: 4 }}>{totalGdScraped} games descobertos</div>
        </div>
        <div style={{ padding: 12, background: "var(--bg-muted)", borderRadius: "var(--radius)", border: "1px solid var(--border)" }}>
          <div style={{ fontSize: "var(--fs-24)", fontWeight: 700, color: "var(--text-2)" }}>{ownFeds.length}</div>
          <div className="fs-11 muted">com site próprio</div>
          <div className="fs-10" style={{ marginTop: 4 }}>sem dados scrapados</div>
        </div>
        <div style={{ padding: 12, background: "var(--bg-muted)", borderRadius: "var(--radius)", border: "1px solid var(--border)" }}>
          <div style={{ fontSize: "var(--fs-24)", fontWeight: 700, color: "var(--text-3)" }}>{emptyFeds.length}</div>
          <div className="fs-11 muted">delegações</div>
          <div className="fs-10" style={{ marginTop: 4 }}>Ceuta + Melilla</div>
        </div>
      </div>
      <div className="fs-11 muted" style={{ marginTop: 8 }}>
        <strong>{trackedTotal}</strong> federações com plataforma rastreada (NextCaddy + GolfDirecto).
      </div>

      <h3 style={{ marginTop: 24, marginBottom: 8 }}>✅ Federações com NextCaddy (rastreadas)</h3>
      <FedTable
        rows={ncFeds}
        columns={[
          {
            key: "name", label: "Federação", align: "left",
            sortVal: f => f.name,
            cell: f => <strong>{f.name}</strong>,
          },
          {
            key: "region", label: "Comunidade",
            sortVal: f => f.region,
            cell: f => f.region,
          },
          {
            key: "lic", label: "Lic.",
            cellStyle: { fontFamily: "var(--font-mono)" },
            sortVal: f => f.licPrefix ?? "",
            cell: f => <code>{f.licPrefix}</code>,
          },
          {
            key: "ncCode", label: "Cód. NC",
            cellStyle: { fontFamily: "var(--font-mono)" },
            sortVal: f => f.ncCode ?? "",
            cell: f => <code>{f.ncCode}</code>,
          },
          {
            key: "scrapedCount", label: "Torneios", align: "right", defaultDir: "desc",
            cellStyle: { fontFamily: "var(--font-mono)", color: "var(--color-good)", fontWeight: 600 },
            sortVal: f => f.scrapedCount ?? 0,
            cell: f => f.scrapedCount,
          },
          {
            key: "website", label: "Site oficial",
            cell: f => f.website && <ExtLink href={f.website} className="tourn-ext-link">🔗</ExtLink>,
          },
          {
            key: "rfegPage", label: "Página RFEG",
            cell: f => <ExtLink href={f.rfegPage} className="tourn-ext-link">📄</ExtLink>,
          },
        ]}
      />

      <h3 style={{ marginTop: 24, marginBottom: 8 }}>🟢 Federações com GolfDirecto (rastreadas)</h3>
      <p className="fs-11 muted" style={{ marginBottom: 8 }}>
        Plataforma <code>golfdirecto.com</code> — SPA com API JSON pública (sem auth). Discovery via{" "}
        <code>catgolf.com</code> que linka aos game IDs em <code>/micro/game/&#123;id&#125;</code>.
        Plataforma legacy (2018-2023): <ExtLink href="https://open.imaster.golf/" className="tourn-ext-link">open.imaster.golf</ExtLink>{" "}
        — ainda activa para torneios antigos mas requer scraper diferente (não implementado).
      </p>
      <FedTable
        rows={gdFeds}
        columns={[
          {
            key: "name", label: "Federação", align: "left",
            sortVal: f => f.name,
            cell: f => (
              <>
                <strong>{f.name}</strong>
                {f.notes && (
                  <div className="fs-10 muted" style={{ marginTop: 2 }}>{f.notes}</div>
                )}
              </>
            ),
          },
          {
            key: "region", label: "Comunidade",
            sortVal: f => f.region,
            cell: f => f.region,
          },
          {
            key: "lic", label: "Lic.",
            cellStyle: { fontFamily: "var(--font-mono)" },
            sortVal: f => f.licPrefix ?? "",
            cell: f => <code>{f.licPrefix}</code>,
          },
          {
            key: "platform", label: "Plataforma actual",
            cell: () => <ExtLink href="https://www.golfdirecto.com/" className="tourn-ext-link">golfdirecto.com</ExtLink>,
          },
          {
            key: "scrapedCount", label: "Games scrapados", align: "right", defaultDir: "desc",
            cellStyle: { fontFamily: "var(--font-mono)", color: "var(--color-good)", fontWeight: 600 },
            sortVal: f => f.scrapedCount ?? 0,
            cell: f => f.scrapedCount,
          },
          {
            key: "website", label: "Site oficial",
            cell: f => f.website && <ExtLink href={f.website} className="tourn-ext-link">🔗</ExtLink>,
          },
          {
            key: "rfegPage", label: "Página RFEG",
            cell: f => <ExtLink href={f.rfegPage} className="tourn-ext-link">📄</ExtLink>,
          },
        ]}
      />

      <h3 style={{ marginTop: 24, marginBottom: 8 }}>🔵 Federações com sistema próprio (não rastreadas)</h3>
      <p className="fs-11 muted" style={{ marginBottom: 8 }}>
        Estas federações organizam os seus circuitos em sistemas internos (não NextCaddy
        nem GolfDirecto). Para apanhar dados delas seria preciso scraper específico por
        federação. Os jogadores destas federações <em>aparecem</em> nos torneios scrapados
        quando entram em provas Andaluzas/Madrileñas/Catalanas/etc.
      </p>
      <FedTable
        rows={ownFeds}
        columns={[
          {
            key: "name", label: "Federação", align: "left",
            sortVal: f => f.name,
            cell: f => f.name,
          },
          {
            key: "region", label: "Comunidade",
            sortVal: f => f.region,
            cell: f => f.region,
          },
          {
            key: "lic", label: "Lic.",
            cellStyle: { fontFamily: "var(--font-mono)" },
            sortVal: f => f.licPrefix ?? "",
            cell: f => <code>{f.licPrefix}</code>,
          },
          {
            key: "website", label: "Site oficial",
            cell: f => <ExtLink href={f.website} className="tourn-ext-link">🔗 oficial</ExtLink>,
          },
          {
            key: "rfegPage", label: "Página RFEG",
            cell: f => <ExtLink href={f.rfegPage} className="tourn-ext-link">📄 RFEG</ExtLink>,
          },
        ]}
      />

      <h3 style={{ marginTop: 24, marginBottom: 8 }}>⚪ Delegações de cidades autónomas</h3>
      <FedTable
        rows={emptyFeds}
        columns={[
          {
            key: "name", label: "Delegação", align: "left",
            sortVal: f => f.name,
            cell: f => f.name,
          },
          {
            key: "region", label: "Cidade",
            sortVal: f => f.region,
            cell: f => f.region,
          },
          {
            key: "lic", label: "Lic.",
            cellStyle: { fontFamily: "var(--font-mono)" },
            sortVal: f => f.licPrefix ?? "",
            cell: f => <code>{f.licPrefix}</code>,
          },
          {
            key: "ncCode", label: "Cód. NC (vazio)",
            cellStyle: { fontFamily: "var(--font-mono)" },
            sortVal: f => f.ncCode ?? "",
            cell: f => <code>{f.ncCode}</code>,
          },
          {
            key: "rfegPage", label: "Página RFEG",
            cell: f => <ExtLink href={f.rfegPage} className="tourn-ext-link">📄</ExtLink>,
          },
        ]}
      />

      <div style={{ marginTop: 24 }}>
        <h3 style={{ marginBottom: 8 }}>🌐 Plataformas onde aparecem os resultados</h3>
        <ul style={{ fontSize: "var(--fs-12)", marginTop: 8 }}>
          <li>
            <strong>RFEG nacional</strong> — campeonatos nacionais (juvenis, masc., fem.,
            profissionais). Dados vêm de <code>rfegolf.es</code> (microsite com inscrições + DOB)
            e <code>rfegolf.livegolfscoring.es</code> (scorecards hbh + par real).
            <strong> 408 + 267 ficheiros indexados.</strong>
          </li>
          <li>
            <strong>NextCaddy</strong> (<code>nextcaddy.com/competiciones-club/&#123;código&#125;</code>) —
            usado por 4 federações regionais. <strong>1.323 ficheiros indexados</strong> (am00 + cm00 + cp00 + 7700).
          </li>
          <li>
            <strong>GolfDirecto</strong> (<code>golfdirecto.com/web/home/&#123;endpoint&#125;</code>) —
            usado pela Catalana desde 2024. API pública sem auth com endpoints{" "}
            <code>game/&#123;id&#125;</code>, <code>score/ranking/entry</code>, <code>score/player/&#123;id&#125;/result</code>.
            Discovery via <ExtLink href="https://www.catgolf.com/ca/campionats" className="tourn-ext-link">catgolf.com</ExtLink>.{" "}
            Plataforma legacy (2018-2023): <ExtLink href="https://open.imaster.golf/" className="tourn-ext-link">open.imaster.golf</ExtLink>{" "}
            (~18 IDs detectados em 2023; scraper não implementado).
          </li>
          <li>
            <strong>Sites próprios</strong> — 12 federações têm os seus próprios sistemas internos
            (calendário em PDF, leaderboards privados, etc.). <strong>Não rastreadas</strong>.
          </li>
        </ul>
      </div>

      <div className="muted fs-11" style={{ marginTop: 24 }}>
        <strong>Notas:</strong>
        <ul style={{ marginTop: 4 }}>
          <li>
            Os prefixos de licença são heurísticos a partir das amostras vistas — alguns
            podem variar (e.g. País Vasco emite licenças com formatos não-standard).
            O número após o prefixo é nacionalmente único.
          </li>
          <li>
            "RFEG" no nome de algumas federações (Real F. Andaluza, Real F. Canaria,
            Real F. Madrileña, Real F. Vasca) é título honorífico — todas têm a mesma
            relação institucional com a RFEG nacional.
          </li>
          <li>
            A <strong>Federación Catalana</strong> usa <code>catgolf.com</code> como portal
            e <code>golfdirecto.com</code> como plataforma de scoring (descoberto 2026-05-09).
            Scraper Node implementado em <code>scripts/scrape-fcg.js</code> + discovery em{" "}
            <code>scripts/discover-fcg-scope.js</code>.
          </li>
        </ul>
      </div>
    </div>
  );
}
