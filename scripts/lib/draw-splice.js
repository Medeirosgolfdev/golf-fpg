/**
 * scripts/lib/draw-splice.js
 *
 * Re-chavear o placeholder de um torneio só-draw (`9xxxx` → tcode real) nos
 * ficheiros `*-draws-manual.json`, por SPLICE TEXTUAL.
 *
 * ⚠ Estes ficheiros NÃO podem ser re-serializados. Os draws são curados à mão
 * com uma linha por jogador (`{ "nome": …, "hcp": … }`); um
 * `JSON.stringify(…, null, 2)` rebenta cada uma em seis linhas e produz um diff
 * de ~900 linhas onde as alterações reais são DUAS. Foi o que aconteceu na
 * promoção do PJA Torre 2026 (90101 → 10024) antes desta função existir. O CRLF
 * do repo também se perderia.
 */
"use strict";

/**
 * @param {string} raw          conteúdo do ficheiro, tal e qual
 * @param {string} ccode        clube do torneio (guarda contra homónimos de tcode)
 * @param {string} placeholder  tcode inventado (9xxxx)
 * @param {string} realTcode    tcode publicado pela FPG
 * @returns {string|null} texto novo, ou null quando não é seguro fazê-lo
 *          (o chamador re-serializa e avisa).
 */
function spliceDrawTcode(raw, ccode, placeholder, realTcode) {
  const alvo = new RegExp('"tcode"\\s*:\\s*"' + placeholder + '"', "g");
  const hits = [...raw.matchAll(alvo)];
  if (hits.length !== 1) return null;                 // ambíguo — não arrisco

  // Delimitar o objecto do torneio: recuar até ao `{` que o abre e avançar a
  // contar chavetas. As chavetas dentro de strings não contam (um nome de
  // torneio pode trazê-las), daí a máquina de estados em vez de um contador.
  const ini = raw.lastIndexOf("{", hits[0].index);
  if (ini < 0) return null;
  let fim = -1, prof = 0, emString = false, escape = false;
  for (let i = ini; i < raw.length; i++) {
    const c = raw[i];
    if (escape) { escape = false; continue; }
    if (c === "\\") { escape = true; continue; }
    if (c === '"') { emString = !emString; continue; }
    if (emString) continue;
    if (c === "{") prof++;
    else if (c === "}") { prof--; if (prof === 0) { fim = i + 1; break; } }
  }
  if (fim < 0) return null;

  const bloco = raw.slice(ini, fim);
  // A FPG reutiliza tcodes entre clubes — sem esta guarda podia-se re-chavear
  // o torneio errado.
  if (!new RegExp('"ccode"\\s*:\\s*"' + ccode + '"').test(bloco)) return null;

  const novo = bloco
    .replace(alvo, '"tcode": "' + realTcode + '"')
    .replace(/"drawOnly"\s*:\s*true/, '"drawOnly": false');
  return raw.slice(0, ini) + novo + raw.slice(fim);
}

module.exports = { spliceDrawTcode };
