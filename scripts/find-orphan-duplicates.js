'use strict';

/**
 * find-orphan-duplicates.js — procura o "dono" das fichas órfãs do kids2.
 *
 * Porquê (18/09, observação da Mariana: "ninguém joga apenas 1 torneio"): 36%
 * das fichas (≈11 mil) têm um único torneio. Muitas são o rasto de um jogador
 * conhecido com o nome escrito de outra forma noutra fonte — e o
 * find-junior-duplicates.js não as apanha: exige idade (quase nunca há data de
 * nascimento) e desconfia de países diferentes (cada fonte regista coisas
 * diferentes: residência, licença, nacionalidade).
 *
 * O que usa, que o outro não usa:
 *   • IDADE PELOS ESCALÕES — cada participação num escalão com idades dá um
 *     intervalo de nascimento (Boys 9 em 2023 → nasceu 2013-2014); a
 *     intersecção de todas as participações é a idade do jogador.
 *   • SEXO PELOS ESCALÕES (Boys/Girls, Garçons/Filles).
 *   • VETO "JOGARAM JUNTOS" — se as duas fichas estão no mesmo torneio, são
 *     duas pessoas.
 *   • NOME TOLERANTE — invertido, nome do meio / 2.º apelido em falta, acentos,
 *     gralhas e diminutivos no 1.º nome; o apelido tem de coincidir.
 *   • SÓ CANDIDATO ÚNICO — dois donos possíveis = não se junta.
 *
 * Uso:
 *   node scripts/find-orphan-duplicates.js            # relatório
 *   node scripts/find-orphan-duplicates.js --apply    # acrescenta ao forceMerge
 * Outputs: reports/orphan-candidates.json
 */

const fs = require('fs');
const path = require('path');
const { normName } = require('./aggregator/util/names');

const DATA = path.join(__dirname, '..', 'public', 'data');
const OVERRIDES = path.join(DATA, 'juniors-overrides.json');
const REPORT = path.join(__dirname, '..', 'reports', 'orphan-candidates.json');

// ── Idade e sexo de um escalão ──────────────────────────────────────────────
/** [idadeMin, idadeMax] a partir do rótulo ou dos campos do flight; null se não der. */
function idadesDoFlight(f) {
  if (Number.isFinite(f.ageMin) && Number.isFinite(f.ageMax)) return [f.ageMin, f.ageMax];
  const s = String(f.label || '');
  const nums = (s.match(/\d+/g) || []).map(Number).filter(n => n >= 4 && n <= 21);
  if (!nums.length) return null;
  if (/under|\bu\s?\d|sub[- ]?\d|&\s*under|-\s*$/i.test(s)) return [0, Math.max(...nums)];
  return [Math.min(...nums), Math.max(...nums)];
}
function sexoDoFlight(f) {
  if (f.sex === 'M' || f.sex === 'F') return f.sex;
  const s = String(f.label || '');
  if (/\b(boys?|garçons?|men|messieurs|chicos|masc)/i.test(s)) return 'M';
  if (/\b(girls?|filles?|ladies|dames|chicas|fem)/i.test(s)) return 'F';
  return null;
}

/** Intervalo de ano de nascimento a partir das participações (intersecção). */
function nascimentoPorEscaloes(parts) {
  let lo = -Infinity, hi = Infinity, n = 0;
  for (const p of parts) {
    if (!p.idades || !p.ano) continue;
    const [a, b] = p.idades;
    lo = Math.max(lo, p.ano - b - 1);
    hi = Math.min(hi, p.ano - a);
    n++;
  }
  if (!n || lo > hi) return null; // sem dados, ou dados contraditórios (não adivinhar)
  return [lo, hi];
}
const intervalosCompativeis = (a, b) => !a || !b || (a[0] <= b[1] + 1 && b[0] <= a[1] + 1);

// ── Nomes ───────────────────────────────────────────────────────────────────
const tokens = (n) => normName(n).split(' ').filter(t => t.length >= 2);

/** Relação entre dois nomes, ou null. Exige sempre um apelido em comum. */
function relacaoNomes(na, nb, freqPrimeiro = () => 0) {
  const A = tokens(na), B = tokens(nb);
  if (A.length < 2 || B.length < 2) return null;
  const sa = [...A].sort().join(' '), sb = [...B].sort().join(' ');
  if (sa === sb) return A.join(' ') === B.join(' ') ? 'igual' : 'invertido';
  const [c, l] = A.length <= B.length ? [A, B] : [B, A];
  // Contido: o curto está todo no longo E começa pelo mesmo 1.º nome
  // ("James Martin" não está "contido" em "Maximilian Martin-James").
  // O "apelido" do curto não pode ser um nome próprio comum ("Juan Pablo" não
  // tem apelido — não serve de dono de "Juan Pablo Benavente").
  if (freqPrimeiro(c[c.length - 1]) >= 20) return null;
  if (c.every(t => l.includes(t))) return c[0] === l[0] ? 'contido' : null;
  // Variante: TODOS os apelidos do nome curto estão no longo ("Pablo Santos
  // González" ≠ "Pablo Camacho Gonzalez") e o 1.º nome é o mesmo com 1 letra
  // de diferença ou um diminutivo ("Will"/"William"; "Rylee"/"Brynlee" são irmãs).
  if (!c.slice(1).every(t => l.includes(t))) return null;
  return primeiroNomeCompativel(c[0], l[0], freqPrimeiro) ? 'variante' : null;
}

function primeiroNomeCompativel(a, b, freqPrimeiro = () => 0) {
  if (a === b) return true;
  const [x, y] = a.length <= b.length ? [a, b] : [b, a];
  if (x.length >= 3 && y.startsWith(x)) return true;           // diminutivo
  // 1 gralha — só se um dos dois for raro como 1.º nome: "Albbert"/"Sebatian"
  // são gralhas; "Justin"/"Austin" ou "Ewan"/"Evan" são nomes verdadeiros.
  return x.length >= 4 && distancia1(a, b) && Math.min(freqPrimeiro(a), freqPrimeiro(b)) <= 3;
}
/** true se a e b diferem numa só letra (troca, falta, a mais ou vizinhas trocadas). */
function distancia1(a, b) {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0; while (i < a.length && a[i] === b[i]) i++;
  if (a.length === b.length) {
    if (a.slice(i + 1) === b.slice(i + 1)) return true;
    return a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2);
  }
  const [x, y] = a.length < b.length ? [a, b] : [b, a];
  return x.slice(i) === y.slice(i + 1);
}

// ── Principal ───────────────────────────────────────────────────────────────
function main() {
  const aplicar = process.argv.includes('--apply');
  const J = JSON.parse(fs.readFileSync(path.join(DATA, 'juniors.json'), 'utf8')).juniors;
  const idx = JSON.parse(fs.readFileSync(path.join(DATA, 'juniors-tournaments.json'), 'utf8'));
  const partsDe = new Map(); // juniorId → [{tid, ano, idades, sexo}]
  for (const shard of idx.shards || ['juniors-tournaments.json']) {
    const s = JSON.parse(fs.readFileSync(path.join(DATA, shard), 'utf8'));
    const lista = Array.isArray(s.tournaments) ? s.tournaments : Object.values(s.tournaments || s);
    for (const t of lista) {
      const ano = parseInt(String(t.date || t.startDate || '').slice(0, 4), 10) || null;
      for (const f of t.flights || []) {
        const idades = idadesDoFlight(f), sexo = sexoDoFlight(f);
        for (const r of f.results || []) {
          if (!r.juniorId) continue;
          if (!partsDe.has(r.juniorId)) partsDe.set(r.juniorId, []);
          partsDe.get(r.juniorId).push({ tid: t.id, ano, idades, sexo, dia: String(t.date || t.startDate || '').slice(0, 10) });
        }
      }
    }
  }

  const info = new Map();
  for (const j of J) {
    const parts = partsDe.get(j.id) || [];
    let nasc = null;
    if (j.dob) { const y = +j.dob.slice(0, 4); nasc = [y, y]; }
    else if (j.dobRange) nasc = [+j.dobRange.lo.slice(0, 4), +j.dobRange.hi.slice(0, 4)];
    const pe = nascimentoPorEscaloes(parts);
    if (!nasc) nasc = pe; else if (pe) nasc = [Math.max(nasc[0], pe[0]), Math.min(nasc[1], pe[1])];
    const sexos = new Set(parts.map(p => p.sexo).filter(Boolean));
    const sexo = j.sex || (sexos.size === 1 ? [...sexos][0] : null);
    // Dia → torneio: dois torneios DIFERENTES no mesmo dia = duas pessoas.
    const dias = new Map();
    for (const p of parts) if (p.dia) dias.set(p.dia, p.tid);
    info.set(j.id, { j, nasc, sexo, dias, torneios: new Set(j.tournamentIds), n: j.tournamentIds.length });
  }

  // Raridade dos apelidos (quantos juniores têm o token).
  const freq = new Map();
  for (const j of J) for (const t of new Set(tokens(j.canonicalName))) freq.set(t, (freq.get(t) || 0) + 1);
  const freq1 = new Map();
  for (const j of J) { const t = tokens(j.canonicalName)[0]; if (t) freq1.set(t, (freq1.get(t) || 0) + 1); }
  const freqPrimeiro = (t) => freq1.get(t) || 0;
  const porToken = new Map();
  for (const j of J) for (const t of new Set(tokens(j.canonicalName))) {
    if ((freq.get(t) || 0) > 400) continue; // tokens muito comuns não servem de índice
    if (!porToken.has(t)) porToken.set(t, []);
    porToken.get(t).push(j.id);
  }

  const over = JSON.parse(fs.readFileSync(OVERRIDES, 'utf8'));
  const vetados = new Set((over.notDuplicates || []).map(x => [...x.sourceKeys].sort().join('|')));
  const chave = (j) => {
    const s = j.sources || {};
    if (s.uskids?.memberId) return `uskids:${s.uskids.memberId}`;
    if (s.fpg?.fed) return `fpg:${s.fpg.fed}`;
    if (s.rfeg?.lic) return `rfeg:${s.rfeg.lic}`;
    if (s.ffgolf?.lic) return `ffgolf:${s.ffgolf.lic}`;
    return (j._match?.evidence || []).find(e => !e.startsWith('dob:')) || null;
  };
  const fortes = (j) => { const s = j.sources || {}; return [['uskids', s.uskids?.memberId], ['fpg', s.fpg?.fed], ['rfeg', s.rfeg?.lic], ['ffgolf', s.ffgolf?.lic]].filter(([, v]) => v); };

  const propostas = [], ambiguas = [];
  const vistosPar = new Set(); // órfã↔órfã aparece dos dois lados
  let semCandidato = 0;
  const orfas = J.filter(j => j.tournamentIds.length === 1);
  // --todos: também fichas com 2+ torneios (exige candidato único dos DOIS lados).
  const todos = process.argv.includes('--todos');
  const melhorDe = new Map(); // id → id do único candidato (para a reciprocidade)
  const alvo = todos ? J : orfas;
  for (const o of alvo) {
    const io = info.get(o.id);
    const toks = tokens(o.canonicalName);
    if (toks.length < 2) { semCandidato++; continue; }
    const cands = new Set();
    for (const t of toks) for (const id of porToken.get(t) || []) if (id !== o.id) cands.add(id);
    const bons = [];
    for (const id of cands) {
      const ic = info.get(id), c = ic.j;
      const rel = relacaoNomes(o.canonicalName, c.canonicalName, freqPrimeiro);
      if (!rel) continue;
      // Variante com países diferentes (os dois conhecidos) = outra pessoa ("Jackson Tennant" US ≠ "Jack Tennant" GB).
      if (rel === 'variante' && o.country && c.country && o.country !== c.country) continue;
      if (io.sexo && ic.sexo && io.sexo !== ic.sexo) continue;
      if (!intervalosCompativeis(io.nasc, ic.nasc)) continue;
      if ([...io.torneios].some(t => ic.torneios.has(t))) continue; // jogaram juntos
      if ([...io.dias].some(([d, t]) => ic.dias.has(d) && ic.dias.get(d) !== t)) continue; // no mesmo dia em torneios diferentes (Michael Egan ×2)
      // Duas chaves fortes da mesma fonte e diferentes = duas contas/pessoas: não aqui.
      const fc = new Map(fortes(c));
      if (fortes(o).some(([s, v]) => fc.has(s) && String(fc.get(s)) !== String(v))) continue;
      const ka = chave(o), kb = chave(c);
      if (!ka || !kb || vetados.has([ka, kb].sort().join('|'))) continue;
      // Apelido raro? (o token menos frequente em comum)
      const comuns = tokens(o.canonicalName).filter(t => tokens(c.canonicalName).includes(t));
      const raridade = Math.min(...comuns.map(t => freq.get(t) || 0));
      const mesmoPais = o.country && c.country && o.country === c.country;
      // Nomes comuns exigem mais: mesmo país ou idade conhecida dos dois lados.
      if (raridade > 25 && !mesmoPais && !(io.nasc && ic.nasc)) continue;
      bons.push({ c, ic, rel, raridade, mesmoPais, ka, kb });
    }
    if (!bons.length) { semCandidato++; continue; }
    // Preferir o dono com mais torneios; se houver mais de um com ≥2 torneios, ambíguo.
    const donos = bons.filter(b => b.ic.n >= 2);
    const escolha = io.n >= 2
      ? (bons.length === 1 ? bons[0] : null)                                   // ficha com historial: só candidato único
      : donos.length === 1 ? donos[0] : (donos.length === 0 && bons.length === 1 ? bons[0] : null);
    if (escolha) melhorDe.set(o.id, escolha.c.id);
    const reg = (b) => ({
      orfa: { id: o.id, nome: o.canonicalName, pais: o.country, fonte: o.tournamentIds[0], nasc: io.nasc, sexo: io.sexo },
      dono: { id: b.c.id, nome: b.c.canonicalName, pais: b.c.country, torneios: b.ic.n, nasc: b.ic.nasc, sexo: b.ic.sexo },
      relacao: b.rel, raridade: b.raridade, mesmoPais: !!b.mesmoPais,
      idadeConfirmada: !!(io.nasc && b.ic.nasc),
      sourceKeys: [b.kb, b.ka],
    });
    if (escolha) {
      const par = [escolha.ka, escolha.kb].sort().join('|');
      if (!vistosPar.has(par)) { vistosPar.add(par); propostas.push(reg(escolha)); }
    }
    else ambiguas.push({ orfa: o.canonicalName, candidatos: bons.map(b => `${b.c.canonicalName} [${b.c.id} ${b.c.country} ${b.ic.n}T]`) });
  }

  // Duas fichas com historial só se juntam se cada uma for o único candidato da outra.
  for (let i = propostas.length - 1; i >= 0; i--) {
    const p = propostas[i];
    if (info.get(p.orfa.id).n >= 2 && info.get(p.dono.id).n >= 2 && melhorDe.get(p.dono.id) !== p.orfa.id) propostas.splice(i, 1);
  }

  // Níveis: forte = nome igual/invertido/contido E (idade confirmada OU mesmo país OU apelido raro).
  for (const p of propostas) {
    const nomeForte = p.relacao !== 'variante';
    const paisesDiferentes = p.orfa.pais && p.dono.pais && p.orfa.pais !== p.dono.pais;
    p.nivel = nomeForte && (p.idadeConfirmada || p.mesmoPais || p.raridade <= 5)
        && !(paisesDiferentes && p.raridade > 5)                                  // "Marco Torres" ES ≠ US
        && !(p.raridade > 50 && !(p.mesmoPais && p.idadeConfirmada)) ? 'forte'    // "Pablo Garcia"
      : (p.idadeConfirmada && (p.mesmoPais || p.raridade <= 10)) ? 'media' : 'fraca';
    // Nomes do leste asiático romanizados: uma letra muda a pessoa (Ziqiao ≠ Ziqian).
    if (p.relacao === 'variante' && [p.orfa.pais, p.dono.pais].some(c => ['CN', 'TW', 'HK', 'KR', 'JP', 'TH', 'VN'].includes(c))) p.nivel = 'fraca';
  }
  const porNivel = (n) => propostas.filter(p => p.nivel === n);
  fs.mkdirSync(path.dirname(REPORT), { recursive: true });
  fs.writeFileSync(REPORT, JSON.stringify({ geradoEm: new Date().toISOString(), orfas: orfas.length, propostas, ambiguas }, null, 1));

  console.log(`Fichas órfãs (1 torneio): ${orfas.length}`);
  console.log(`  com dono único proposto: ${propostas.length} — forte ${porNivel('forte').length} · média ${porNivel('media').length} · fraca ${porNivel('fraca').length}`);
  console.log(`  ambíguas (vários donos possíveis): ${ambiguas.length} · sem candidato: ${semCandidato}`);
  const porFonte = {};
  for (const p of propostas) { const f = p.orfa.fonte.split('-')[0]; porFonte[f] = (porFonte[f] || 0) + 1; }
  console.log('  por fonte da órfã:', Object.entries(porFonte).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(' · '));
  console.log(`→ ${path.relative(process.cwd(), REPORT)}`);

  if (aplicar) {
    const fortes = [...porNivel('forte'), ...porNivel('media')]; // médio revisto com a Mariana (18/09)
    const hoje = new Date().toISOString().slice(0, 10);
    for (const p of fortes) {
      over.forceMerge.push({ sourceKeys: p.sourceKeys, auto: true,
        reason: `[órfã ${hoje}] ${p.orfa.nome} (${p.orfa.fonte}) → ${p.dono.nome} [${p.dono.torneios}T] — ${p.relacao}${p.idadeConfirmada ? '; idade pelos escalões compatível' : ''}${p.mesmoPais ? '; mesmo país' : ''}; apelido em ${p.raridade} fichas; nunca jogaram juntos.` });
    }
    const raw = fs.readFileSync(OVERRIDES, 'utf8');
    fs.writeFileSync(OVERRIDES, JSON.stringify(over, null, 1).replace(/\n/g, raw.includes('\r\n') ? '\r\n' : '\n') + (raw.endsWith('\n') ? (raw.includes('\r\n') ? '\r\n' : '\n') : ''));
    console.log(`Aplicadas ${fortes.length} junções (forte + média) ao forceMerge.`);
  }
}

if (require.main === module) main();
module.exports = { idadesDoFlight, sexoDoFlight, nascimentoPorEscaloes, relacaoNomes, intervalosCompativeis, primeiroNomeCompativel };
