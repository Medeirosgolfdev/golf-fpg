// scripts/lib/bluegolf-location.js
//
// Alguns microsites BlueGolf (JWGC, FCG) põem no "país" do perfil a string
// "CLASSE, LOCAL" — o ANO DE GRADUAÇÃO seguido da localidade. Exemplos:
//   "2031, Japan"                 → { gradYear: 2031, country: "Japan" }
//   "2028, Rancho Santa Fe, CA"   → { gradYear: 2028, country: "United States", hometown: "Rancho Santa Fe, CA" }
//   "2031, Richmond, BC"          → { gradYear: 2031, country: "Canada" }
//   "Portugal"                    → { gradYear: null, country: "Portugal" } (formato normal bjgt/wjgc — inalterado)
//
// Separar o ano do local e derivar um PAÍS utilizável para bandeira. Para
// miúdos dos EUA/Canadá o local é "Cidade, ST" → deriva-se o país pela sigla;
// para internacionais o local já é o país. Cidades soltas estrangeiras
// (ex: "Shanghai") ficam como estão (sem bandeira fiável) — dado da fonte.

const US_STATES = new Set(
  "AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC".split(" ")
);
const CA_PROV = new Set("AB BC MB NB NL NS NT NU ON PE QC SK YT".split(" "));

/**
 * @param {string} raw  string do campo "país" do perfil BlueGolf
 * @returns {{ gradYear: number|null, country: string, hometown: string }}
 */
function splitGradYearCountry(raw) {
  const s = String(raw == null ? "" : raw).trim();
  if (!s) return { gradYear: null, country: "", hometown: "" };

  let gradYear = null;
  let rest = s;
  const ym = /^(\d{4})\s*,\s*(.*)$/.exec(s);
  if (ym) { gradYear = +ym[1]; rest = ym[2].trim(); }
  else if (/^\d{4}$/.test(s)) { gradYear = +s; rest = ""; }

  // País para bandeira: se o local acaba em ", XX" (sigla de 2 letras),
  // resolver EUA/Canadá; senão o próprio local (país internacional ou cidade).
  let country = rest;
  // Sigla de estado no fim, precedida por vírgula OU espaço ("…, CA" ou "Burlington WA").
  const tail = /[,\s]\s*([A-Za-z]{2})\s*$/.exec(rest);
  if (tail) {
    const ab = tail[1].toUpperCase();
    if (US_STATES.has(ab)) country = "United States";
    else if (CA_PROV.has(ab)) country = "Canada";
  }

  return { gradYear, country, hometown: rest };
}

module.exports = { splitGradYearCountry, US_STATES, CA_PROV };
