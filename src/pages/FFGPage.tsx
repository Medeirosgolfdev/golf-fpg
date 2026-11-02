/**
 * FFGPage.tsx — 🇫🇷 FFGolf · Torneios juvenis franceses
 *
 * Fontes na lista: `ffgres` (portal FFG), `gg` (GolfGenius, sem gémeo no
 * portal) e `lgpidf` (PDFs Paris-Île-de-France). Match play (knockout) é
 * excluído no scrape.
 *
 * ⚠ Proveniência dos dados de campo: os metros/SI só existem quando a fonte
 * os publica (rota Playwright, ou override do cartão oficial). A rota fetch
 * (v2tournaments) NÃO os expõe, e nesses ficheiros o PAR vem INFERIDO dos
 * marcadores do scorecard (`course.parSource`) — pode divergir do oficial.
 * Nada é preenchido por adivinhação: sem fonte, o campo fica vazio.
 *
 * Os dados (tipos, nomes/escalões, conversão para o formato FPG, LGPIDF,
 * GolfGenius, entradas e o hook useFfgData) vivem em src/data/ffg/ desde
 * 21/10/2026; aqui fica o que se desenha.
 */
import { useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import ExtLink from "../ui/ExternalLink";
import { usePasswordGate } from "../hooks/usePasswordGate";
import PasswordGate from "../ui/PasswordGate";
import CategoriasInfo from "../ui/info/CategoriasInfo";
import LoadingState from "../ui/LoadingState";
import CircuitShell from "../ui/circuit/CircuitShell";
import type { CircuitConfig, CircuitSpecialItem } from "../ui/circuit/types";
import { tournamentFamilyKey } from "../ui/circuit/pastEditions";
import { FFGPlayersView } from "./ffg/PlayersView";
import { FFGMeriteView } from "./ffg/MeriteView";
import type { FFGCategoriesData, LGPIDFTournament } from "../data/ffg/types";
import type { FfgRenderers } from "../data/ffg/ffgEntries";
import { useFfgData } from "../data/ffg/useFfgData";
import { C } from "../utils/colors";
import EmptyState from "../ui/EmptyState";

/* ── CategoriesView (Catégories d'âge FFG — info no body) ─────── */
// Desenhada pela peça comum CategoriasInfo (a mesma da /rfeg e da /fig).
const FFG_DISTANCIAS = [
  { uCode: "U8",  ffgLabel: "Enfant",    keys: ["U8"] },
  { uCode: "U10", ffgLabel: "Poucet",    keys: ["U10", "Poucets", "Poucet"] },
  { uCode: "U12", ffgLabel: "Poussin",   keys: ["U12", "Poussins", "Poussin"] },
  { uCode: "U14", ffgLabel: "Benjamins", keys: ["Benjamins", "Benjamin", "U14"] },
  { uCode: "U16", ffgLabel: "Minimes",   keys: ["Minimes", "Minime", "U16"] },
  { uCode: "U18", ffgLabel: "Cadets",    keys: ["Cadets", "Cadet", "U18"] },
];

function CategoriesView({ data }: { data: FFGCategoriesData }) {
  const matches = data.distancesParCategorie?.matches;
  const temDistancias = !!matches && Object.keys(matches).length > 0;
  return (
    <CategoriasInfo
      titulo="📚 Catégories d'âge FFG"
      subtitulo="Federação Francesa de Golf — categorias oficiais por idade"
      links={[
        { label: "🔗 Página oficial", url: data._source },
        { label: "📄 Vademecum FFG (PDF, 388 págs)", url: data._vademecumUrl, destaque: true },
      ]}
      tabela={{
        colunas: [
          { label: "Catégorie FR", ordenavel: true },
          { label: "Millésime (ano nasc.)", className: "ta-c", ordenavel: true },
          { label: "Idade", className: "ta-c" },
          { label: "Catégorie Internationale", className: "ta-c", ordenavel: true },
          { label: "Sub-catégorie", className: "ta-c", ordenavel: true },
        ],
        linhas: data.categories.map((c) => ({
          key: c.name,
          celulas: [<strong>{c.name}</strong>, c.millesime, c.age, c.intl, <span className="chip fw-600">{c.subIntl}</span>],
          ordem: [c.name, c.millesime, null, c.intl, c.subIntl],
        })),
      }}
      seccoes={[{
        titulo: "📏 Distâncias máximas por categoria",
        texto: <p className="muted">Definidas no <em>Cahier des charges des Grands Prix Jeunes</em> (Vademecum FFG, secção 1.2.x).</p>,
        tabela: temDistancias ? {
          colunas: [
            { label: "Categoria", ordenavel: true }, { label: "FFG" }, { label: "#Trous", className: "ta-c", ordenavel: true },
            { label: "Garçons (m)", className: "r mono", ordenavel: true }, { label: "Filles (m)", className: "r mono", ordenavel: true },
          ],
          linhas: FFG_DISTANCIAS.map(({ uCode, ffgLabel, keys }) => {
            const m = keys.map((k) => matches![k]).find((v) => v != null);
            return {
              key: uCode,
              celulas: [<strong>{uCode}</strong>, <span className="muted">{ffgLabel}</span>, m?.trous ?? "—",
                m?.Garcons ? m.Garcons.toLocaleString("pt-PT") : "—", m?.Filles ? m.Filles.toLocaleString("pt-PT") : "—"],
              ordem: [Number(uCode.slice(1)), null, m?.trous ?? null, m?.Garcons ?? null, m?.Filles ?? null],
            };
          }),
        } : undefined,
        nota: temDistancias ? (
          <em>
            Distâncias máximas em metros (par 72 indicativo). Extraído do{" "}
            <ExtLink href={data._vademecumUrl}>Vademecum FFG</ExtLink>
            {data.distancesParCategorie?._source ? ` — ${data.distancesParCategorie._source}` : ""}.
          </em>
        ) : undefined,
        pendente: temDistancias ? undefined : (
          <>
            <p className="fs-12"><strong>Distâncias ainda não extraídas.</strong> Para popular esta tabela:</p>
            <pre className="info-pre">
{`# 1. Descarregar o Vademecum (PDF ~88MB)
Invoke-WebRequest "${data._vademecumUrl}" \`
  -OutFile public\\data\\Vademecum2024.pdf

# 2. Correr o parser
node scripts/parse-vademecum-distances.js`}
            </pre>
            <p className="fs-11 muted mt-8">
              O parser procura a secção <em>"Cahier des charges des Grands Prix Jeunes"</em> e
              extrai distâncias por categoria. Resultado é guardado em <code>public/data/ffg-categories-age.json</code>.
            </p>
          </>
        ),
      }]}
      notas={[
        "O Vademecum FFG é actualizado anualmente (este link aponta para 2024).",
        <>O <em>Cahier des charges</em> contém também regulamentos sobre tees, formato de competição, etc.</>,
        <>A categoria <strong>Poucet(te)</strong> não tem equivalente directo PT — é a faixa 9-10 anos.</>,
      ]}
    />
  );
}

function LGPIDFCourseMapTab({ data }: { data: LGPIDFTournament }) {
  if (!data.courseMapPdfs.length) return <EmptyState size="sm" message="Sem mapa do campo." />;
  return (
    <div>
      {data.courseMapPdfs.map((pdf) => {
        const total = pdf.holes.reduce((s, h) => s + h.distance, 0);
        return (
          <div key={pdf.pdfFilename} className="mb-12">
            <div className="muted fs-10 mb-8">
              <ExtLink href={pdf.pdfUrl}>📄 {pdf.pdfFilename}</ExtLink> · {pdf.holes.length} buracos · Total: {total.toLocaleString("pt-PT")} {pdf.holes[0]?.unit || ""}
            </div>
            <div className="scroll-x">
              <table className="dtable dtable-sm ta-c">
                <thead>
                  <tr>
                    <th>Buraco</th>
                    {pdf.holes.map((h) => <th key={h.hole}>{h.hole}</th>)}
                    <th>Tot</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Distância</td>
                    {pdf.holes.map((h) => <td key={h.hole}>{h.distance}</td>)}
                    <td><strong>{total}</strong></td>
                  </tr>
                  <tr>
                    <td>Lado</td>
                    {pdf.holes.map((h) => <td key={h.hole} className="fs-10">{h.entrySide.slice(0, 1)}</td>)}
                    <td>—</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}



/* ═══════════════════════════════════════════════════════════════
   FFGPage (NOVO) — assente no CircuitShell partilhado.
   • FFG-Resultats (fonte principal): divisões por série com `results` reais
     (ffgResToFPGTournament) → leaderboard + toggles Manuel/PT/Top10 funcionam.
   • LGPIDF (PDFs Paris-Île-de-France): reutiliza a LGPIDFView como customResults.
   • Catégories d'âge: item no menu Info da toolbar.
   Shell estendido com filtro `liga` + filtro `INTL`.
   ═══════════════════════════════════════════════════════════════ */

const FFG_LIGUE_LABELS: Record<string, string> = {
  "00": "Nacional (Federales)",
  "01": "Paris-Île-de-France", "02": "Auvergne-Rhône-Alpes", "03": "Nouvelle-Aquitaine",
  "04": "PACA", "06": "Occitanie", "07": "Hauts-de-France", "08": "Grand-Est",
  "09": "Normandie", "10": "Pays de la Loire", "11": "Bretagne", "12": "Centre-Val de Loire",
  "13": "Bourgogne-F.-Comte", "14": "Réunion", "15": "Corse", "16": "Nouvelle-Calédonie",
  "17": "Guadeloupe", "18": "Polynésie", "19": "Clubs étrangers", "20": "Martinique",
  "21": "Guyane", "22": "Outre-Mer",
};

/** O que se desenha dentro das divisões construídas em src/data/ffg/ (estável:
 *  o hook reconstrói a lista quando isto muda). */
const FFG_RENDERERS: FfgRenderers = {
  lgpidfCourseMap: (data) => <LGPIDFCourseMapTab data={data} />,
};

function FFGShellContent() {
  // Vista informativa via URL: /ffg/info/{key} (deep-linkável, persiste no
  // reload) — mesmo padrão da /rfeg. A selecção de torneio continua local.
  const navigate = useNavigate();
  const params = useParams<{ source?: string; key?: string }>();
  const selectedInfo = params.source === "info" ? (params.key ?? null) : null;
  // Torneio seleccionado via URL: /ffg/t/{entryId} — deep-linkável/partilhável.
  // O CircuitShell reflecte o default no URL ao aterrar em /ffg (mesmo padrão
  // da /rfeg e /egr). react-router já devolve o param descodificado.
  const selectedTourn = params.source === "t" && params.key ? params.key : undefined;
  const { entries, categories: ffgCategories, loading } = useFfgData(FFG_RENDERERS);

  const config = useMemo<CircuitConfig>(() => {
    const specialItems: CircuitSpecialItem[] = [
      { key: "joueurs", label: "👥 Joueurs de France", render: () => <FFGPlayersView /> },
      { key: "merite", label: "🏅 Mérite Jeunes", render: () => <FFGMeriteView /> },
      ...(ffgCategories
        ? [{ key: "categorias", label: "📚 Catégories d'âge FFG", render: () => <CategoriesView data={ffgCategories} /> }]
        : []),
    ];
    return {
      routeBase: "/ffg",
      title: "🇫🇷 France",
      color: "var(--color-ffg-dark)",
      textColor: "var(--text-on-color)",
      // Agrupar só por ANO, não por série: um torneio é um torneio, e a fonte
      // de onde o extraímos é um detalhe nosso, não uma divisão do calendário.
      // Separado por série, o punhado de eventos GolfGenius ficava debaixo de
      // 1265 entradas do portal — presente mas invisível. A fonte continua
      // legível na pill de cada linha e filtrável no dropdown "Fonte".
      grouping: "year",
      escalaoSource: "ffg",
      sourceColors: { ffgres: "var(--color-ffg-dark)", lgpidf: C.ffgSrc.lgpidf, gg: C.ffgSrc.gg },
      sourceLabels: { ffgres: "FFG Officiel", lgpidf: "LGPIDF", gg: "GolfGenius" },
      ligaLabels: FFG_LIGUE_LABELS,
      filters: { search: true, year: true, escalao: true, sex: true, source: true, liga: true, intl: true, toggles: ["manuel", "pt", "top10", "results"] },
      specialItems,
      // "Edições anteriores": família pelo nome (o `tournamentFamilyKey` tira o
      // prefixo "{ano} // " e os anos) — agrupa o mesmo Grand Prix ano-a-ano.
      editionKey: (e) => tournamentFamilyKey(e.name),
      loadingMessage: "A carregar FFGolf…",
    };
  }, [ffgCategories]);

  if (loading) return <LoadingState message="A carregar FFGolf…" />;
  return (
    <CircuitShell
      entries={entries}
      config={config}
      selectedId={selectedTourn}
      onSelectEntry={(e) => navigate(`/ffg/t/${encodeURIComponent(e.id)}`)}
      selectedInfo={selectedInfo}
      onSelectInfo={(key) => navigate(key ? `/ffg/info/${key}` : "/ffg")}
    />
  );
}

export default function FFGPage() {
  const { unlocked, unlock } = usePasswordGate();
  if (!unlocked) return <PasswordGate onUnlock={unlock} />;
  return <FFGShellContent />;
}
