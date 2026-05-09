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
import DetailHeader from "../../ui/DetailHeader";
import ExtLink from "../../ui/ExternalLink";

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
   *  - "Próprio" — site próprio com sistema interno (não scrapado)
   *  - "Vazio" — código NC existe mas não tem dados
   */
  platform: "NextCaddy" | "Próprio" | "Vazio";
  /** Código NextCaddy se aplicável */
  ncCode?: string;
  /** Estado do scrape (NextCaddy só) */
  scraped?: boolean;
  /** Nº torneios scrapados (NextCaddy só) */
  scrapedCount?: number;
  /** Prefixo das licenças emitidas por esta federação (2 letras) */
  licPrefix?: string;
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
  {
    name: "Federación Catalana de Golf",
    region: "Catalunya",
    website: "https://www.fcgolf.cat",
    rfegPage: "https://rfeg.es/rfeg/federaciones-autonomicas/federacion_catalana_de_golf.html?id=987",
    platform: "Próprio",
    licPrefix: "CB",
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

export function RFEGFederationsView() {
  const ncFeds = RFEG_FEDERATIONS.filter(f => f.platform === "NextCaddy");
  const ownFeds = RFEG_FEDERATIONS.filter(f => f.platform === "Próprio");
  const emptyFeds = RFEG_FEDERATIONS.filter(f => f.platform === "Vazio");
  const totalScraped = ncFeds.reduce((acc, f) => acc + (f.scrapedCount || 0), 0);

  return (
    <div style={{ padding: "12px 16px" }}>
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

      <div style={{ marginTop: 12, padding: "10px 12px", background: "var(--bg-muted, #fff7e6)", border: "1px solid var(--border, #f1bf00)", borderRadius: 6, fontSize: 12 }}>
        <strong>⚠ Estrutura federativa do golfe espanhol.</strong> A nível nacional
        existe a <strong>RFEG</strong> (Madrid, sede do golfe federado). Sob a sua tutela
        coexistem <strong>19 federações territoriais</strong> que organizam circuitos
        regionais e emitem licenças com prefixo de 2 letras (AM, CM, CB, CP, ...).
        O <em>número da licença é único nacionalmente</em> — um jogador catalão (CB...)
        joga em Madrid com a mesma licença.
      </div>

      <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
        <div style={{ padding: 12, background: "var(--bg-muted, #f5f5f5)", borderRadius: 6, border: "1px solid var(--border)" }}>
          <div style={{ fontSize: 24, fontWeight: 700, color: "#0a5" }}>{ncFeds.length}</div>
          <div className="fs-11 muted">via NextCaddy (scrapadas)</div>
          <div className="fs-10" style={{ marginTop: 4 }}>{totalScraped} torneios indexados</div>
        </div>
        <div style={{ padding: 12, background: "var(--bg-muted, #f5f5f5)", borderRadius: 6, border: "1px solid var(--border)" }}>
          <div style={{ fontSize: 24, fontWeight: 700, color: "var(--text-2)" }}>{ownFeds.length}</div>
          <div className="fs-11 muted">com site próprio</div>
          <div className="fs-10" style={{ marginTop: 4 }}>sem dados scrapados</div>
        </div>
        <div style={{ padding: 12, background: "var(--bg-muted, #f5f5f5)", borderRadius: 6, border: "1px solid var(--border)" }}>
          <div style={{ fontSize: 24, fontWeight: 700, color: "var(--text-3)" }}>{emptyFeds.length}</div>
          <div className="fs-11 muted">delegações</div>
          <div className="fs-10" style={{ marginTop: 4 }}>Ceuta + Melilla</div>
        </div>
      </div>

      <h3 style={{ marginTop: 24, marginBottom: 8 }}>✅ Federações com NextCaddy (rastreadas)</h3>
      <div style={{ overflowX: "auto" }}>
        <table className="data-table" style={{ width: "100%", fontSize: 12 }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left" }}>Federação</th>
              <th>Comunidade</th>
              <th>Lic.</th>
              <th>Cód. NC</th>
              <th>Torneios</th>
              <th>Site oficial</th>
              <th>Página RFEG</th>
            </tr>
          </thead>
          <tbody>
            {ncFeds.map(f => (
              <tr key={f.name}>
                <td><strong>{f.name}</strong></td>
                <td style={{ textAlign: "center" }}>{f.region}</td>
                <td style={{ textAlign: "center", fontFamily: "monospace" }}>
                  <code>{f.licPrefix}</code>
                </td>
                <td style={{ textAlign: "center", fontFamily: "monospace" }}>
                  <code>{f.ncCode}</code>
                </td>
                <td style={{ textAlign: "right", fontFamily: "monospace", color: "#0a5", fontWeight: 600 }}>
                  {f.scrapedCount}
                </td>
                <td style={{ textAlign: "center" }}>
                  {f.website && <ExtLink href={f.website} className="tourn-ext-link">🔗</ExtLink>}
                </td>
                <td style={{ textAlign: "center" }}>
                  <ExtLink href={f.rfegPage} className="tourn-ext-link">📄</ExtLink>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3 style={{ marginTop: 24, marginBottom: 8 }}>🔵 Federações com sistema próprio (não rastreadas)</h3>
      <p className="fs-11 muted" style={{ marginBottom: 8 }}>
        Estas federações organizam os seus circuitos em sistemas internos (não NextCaddy).
        Os respectivos sites foram verificados e <strong>não usam <code>nextcaddy.com</code></strong>
        nem outras plataformas standard agregadoras. Para apanhar dados delas seria preciso
        scraper específico por federação. Os jogadores destas federações <em>aparecem</em>
        nos torneios scrapados quando entram em provas Andaluzas/Madrileñas/etc.
      </p>
      <div style={{ overflowX: "auto" }}>
        <table className="data-table" style={{ width: "100%", fontSize: 12 }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left" }}>Federação</th>
              <th>Comunidade</th>
              <th>Lic.</th>
              <th>Site oficial</th>
              <th>Página RFEG</th>
            </tr>
          </thead>
          <tbody>
            {ownFeds.map(f => (
              <tr key={f.name}>
                <td>{f.name}</td>
                <td style={{ textAlign: "center" }}>{f.region}</td>
                <td style={{ textAlign: "center", fontFamily: "monospace" }}>
                  <code>{f.licPrefix}</code>
                </td>
                <td style={{ textAlign: "center" }}>
                  <ExtLink href={f.website} className="tourn-ext-link">🔗 oficial</ExtLink>
                </td>
                <td style={{ textAlign: "center" }}>
                  <ExtLink href={f.rfegPage} className="tourn-ext-link">📄 RFEG</ExtLink>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3 style={{ marginTop: 24, marginBottom: 8 }}>⚪ Delegações de cidades autónomas</h3>
      <div style={{ overflowX: "auto" }}>
        <table className="data-table" style={{ width: "100%", fontSize: 12 }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left" }}>Delegação</th>
              <th>Cidade</th>
              <th>Lic.</th>
              <th>Cód. NC (vazio)</th>
              <th>Página RFEG</th>
            </tr>
          </thead>
          <tbody>
            {emptyFeds.map(f => (
              <tr key={f.name}>
                <td>{f.name}</td>
                <td style={{ textAlign: "center" }}>{f.region}</td>
                <td style={{ textAlign: "center", fontFamily: "monospace" }}>
                  <code>{f.licPrefix}</code>
                </td>
                <td style={{ textAlign: "center", fontFamily: "monospace" }}>
                  <code>{f.ncCode}</code>
                </td>
                <td style={{ textAlign: "center" }}>
                  <ExtLink href={f.rfegPage} className="tourn-ext-link">📄</ExtLink>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 24 }}>
        <h3 style={{ marginBottom: 8 }}>🌐 Plataformas onde aparecem os resultados</h3>
        <ul style={{ fontSize: 12, marginTop: 8 }}>
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
            <strong>Sites próprios</strong> — 13 federações têm os seus próprios sistemas internos
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
            A <strong>Federación Catalana</strong> é a maior em número de jogadores federados
            mas usa o seu próprio sistema (<code>fcgolf.cat</code>). Investigar como
            aceder programaticamente aos seus leaderboards seria um próximo passo de alto valor.
          </li>
        </ul>
      </div>
    </div>
  );
}
