/**
 * scripts/lib/estilo-global.js — conta, por ficheiro .tsx de src/, o que foge às
 * peças e aos tokens globais (pedido da Mariana, 30/10/2026: «todas as páginas
 * parecidas e alimentadas por módulos globais, para haver menos possibilidade de
 * as coisas ficarem com aspectos diferentes»).
 *
 * O teste `scripts/estilo-global.test.js` compara estas contas com
 * `scripts/estilo-global.baseline.json`: nenhum ficheiro pode SUBIR (e um ficheiro
 * novo começa em zero). Quando se arruma um ficheiro, regravar o baseline com
 *   node scripts/estilo-global-baseline.js
 * para a trava apertar.
 *
 * Fora da conta: as imagens de partilha (`src/ui/overlay/`, `OverlayExport.tsx`) —
 * o html-to-image não lê variáveis CSS, por isso usam valores literais de propósito.
 */
const fs = require("fs");
const path = require("path");

const SRC = path.resolve(__dirname, "..", "..", "src");
const EXCLUIR = [/[\\/]ui[\\/]overlay[\\/]/, /OverlayExport\.tsx$/, /[\\/]__tests__[\\/]/];

/** Classes de tabela do «modelo único» (App.css) e as famílias com regras próprias
 *  (cartões de buracos e tabelas de torneio). Uma <table> tem de usar uma delas. */
const TABELAS_GLOBAIS = [
  "dtable", "dtable-sm", "dtable-lg", "dt-compact", "player-list-table", "cs-table",
  "sc-lb", "sc-table", "sc-table-modern", "sc-table-ec", "scorecard-table", "mx-table",
];

const MEDIDAS = {
  /** `style={{…}}` escritos à mão. */
  estilosInline: (t) => (t.match(/style=\{\{/g) || []).length,
  /** Cores hex no código (as cores vivem em tokens.css). */
  coresHex: (t) => (t.match(/#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b/g) || []).length,
  /** Tamanhos de letra em número (há --fs-N para todos). */
  letraNumero: (t) => (t.match(/fontSize:\s*[0-9.]+/g) || []).length,
  /** Cantos em número (há --radius-*). */
  cantosNumero: (t) => (t.match(/borderRadius:\s*[0-9.]+/g) || []).length,
  /** <table> sem uma das classes globais. */
  tabelasSemClasse: (t) => {
    let n = 0;
    // Fora: comentários e documentos HTML exportados (`<!DOCTYPE…</html>`, ex. o
    // relatório do simulador) — levam o seu próprio CSS, o App.css não chega lá.
    const codigo = t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")
      .replace(/`<!DOCTYPE[\s\S]*?<\/html>`/gi, "");
    for (const m of codigo.matchAll(/<table\b([^>]*)>/g)) {
      const cls = (m[1].match(/className=\{?[`"']([^`"']*)/) || [])[1] || "";
      const nomes = cls.split(/[^a-zA-Z0-9_-]+/);
      if (!nomes.some((c) => TABELAS_GLOBAIS.includes(c))) n++;
    }
    return n;
  },
};

function ficheiros(dir = SRC, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { ficheiros(p, out); continue; }
    if (e.name.endsWith(".tsx") && !EXCLUIR.some((re) => re.test(p))) out.push(p);
  }
  return out;
}

/** { "pages/X.tsx": { estilosInline: 3, … } } — só as medidas acima de zero. */
function contar() {
  const res = {};
  for (const f of ficheiros()) {
    const txt = fs.readFileSync(f, "utf8");
    const linha = {};
    for (const [k, fn] of Object.entries(MEDIDAS)) { const n = fn(txt); if (n) linha[k] = n; }
    if (Object.keys(linha).length) res[path.relative(SRC, f).replace(/\\/g, "/")] = linha;
  }
  return res;
}

function totais(contas) {
  const t = {};
  for (const linha of Object.values(contas)) for (const [k, n] of Object.entries(linha)) t[k] = (t[k] || 0) + n;
  return t;
}

module.exports = { contar, totais, MEDIDAS, TABELAS_GLOBAIS, BASELINE: path.resolve(__dirname, "..", "estilo-global.baseline.json") };
