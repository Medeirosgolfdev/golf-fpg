/**
 * roundAnalysis — o «analisador» de torneios de várias voltas: compara as voltas
 * de um jogador e escreve-as em frases («Na R2 melhorou 4 pancadas nos front
 * nine e piorou 2 nos back nine», «mais birdies, mas também mais duplos»).
 *
 * Funções puras (sem React). O campo (`field`) — as voltas de todos os jogadores
 * — é opcional: com ele há posição após cada volta e a comparação buraco a
 * buraco com a média do campo.
 */

export type ARound = { round: number; scores: number[]; par: number[] };
export type Tone = "good" | "bad" | "neutral";
export type Insight = { tone: Tone; text: string };
export type RoundBlock = { round: number; prev: number; gross: number; prevGross: number; insights: Insight[] };
export type Analysis = { headline: Insight[]; rounds: RoundBlock[]; tournament: Insight[] };

type Cnt = { eag: number; bir: number; par: number; bog: number; dbl: number };

const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
const gross = (r: ARound) => sum(r.scores);
const toPar = (r: ARound) => gross(r) - sum(r.par);
const fmtTP = (v: number) => (v > 0 ? `+${v}` : v === 0 ? "par" : String(v));
const pl = (n: number, s: string, p = `${s}s`) => `${n} ${n === 1 ? s : p}`;
const fmt1 = (v: number) => v.toFixed(1).replace(".", ",");
const fmtAvg = (v: number) => (v > 0 ? `+${fmt1(v)}` : fmt1(v));

function count(r: ARound, from = 0, to = r.scores.length): Cnt {
  const c: Cnt = { eag: 0, bir: 0, par: 0, bog: 0, dbl: 0 };
  for (let i = from; i < to; i++) {
    const d = r.scores[i] - r.par[i];
    if (d <= -2) c.eag++; else if (d === -1) c.bir++; else if (d === 0) c.par++; else if (d === 1) c.bog++; else c.dbl++;
  }
  return c;
}

/** «melhorou 4 pancadas» / «piorou 2 pancadas» / «igual». */
const better = (d: number) => (d < 0 ? `melhorou ${pl(-d, "pancada")}` : d > 0 ? `piorou ${pl(d, "pancada")}` : "ficou igual");

/** Comparação das duas metades (Out/In) de duas voltas de 18 buracos. */
function ninesInsight(a: ARound, b: ARound): Insight | null {
  if (a.scores.length < 18 || b.scores.length < 18) return null;
  const fa = sum(a.scores.slice(0, 9)), fb = sum(b.scores.slice(0, 9));
  const ba = sum(a.scores.slice(9)), bb = sum(b.scores.slice(9));
  const df = fb - fa, db = bb - ba;
  const part = (d: number, lbl: string, x: number, y: number) => `${d === 0 ? `ficou igual nos ${lbl}` : `${better(d)} nos ${lbl}`} (${x} → ${y})`;
  const tone: Tone = df + db < 0 ? "good" : df + db > 0 ? "bad" : "neutral";
  return { tone, text: `${cap(part(df, "front nine", fa, fb))} e ${part(db, "back nine", ba, bb)}.` };
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Birdies/duplos: «mais birdies (1 → 3), mas também mais duplos (1 → 2)». */
function countsInsight(a: ARound, b: ARound): Insight[] {
  const ca = count(a), cb = count(b);
  const out: Insight[] = [];
  const goodA = ca.eag + ca.bir, goodB = cb.eag + cb.bir;
  const badA = ca.dbl, badB = cb.dbl;
  const g = goodB - goodA, x = badB - badA;
  const gTxt = g > 0 ? `mais birdies (${goodA} → ${goodB})` : g < 0 ? `menos birdies (${goodA} → ${goodB})` : "";
  const xTxt = x > 0 ? `mais duplos-bogeys ou pior (${badA} → ${badB})` : x < 0 ? `menos duplos-bogeys ou pior (${badA} → ${badB})` : "";
  if (gTxt && xTxt) {
    const sameDir = (g > 0) === (x < 0);   // mais birdies e menos duplos = tudo bom
    out.push({ tone: sameDir ? (g > 0 ? "good" : "bad") : "neutral", text: `${cap(gTxt)}${sameDir ? " e " : ", mas também "}${xTxt}.` });
  } else if (gTxt) out.push({ tone: g > 0 ? "good" : "bad", text: `${cap(gTxt)}.` });
  else if (xTxt) out.push({ tone: x < 0 ? "good" : "bad", text: `${cap(xTxt)}.` });
  if (cb.bog !== ca.bog && Math.abs(cb.bog - ca.bog) >= 2) out.push({ tone: cb.bog < ca.bog ? "good" : "bad", text: `${cb.bog < ca.bog ? "Menos" : "Mais"} bogeys (${ca.bog} → ${cb.bog}).` });
  if (cb.par - ca.par >= 3) out.push({ tone: "good", text: `Mais pares (${ca.par} → ${cb.par}) — volta mais consistente.` });
  return out;
}

/** Média vs par em par 3 / 4 / 5. */
function byParType(rs: ARound[]): Record<3 | 4 | 5, { n: number; avg: number }> {
  const acc: Record<number, { n: number; s: number }> = { 3: { n: 0, s: 0 }, 4: { n: 0, s: 0 }, 5: { n: 0, s: 0 } };
  for (const r of rs) r.scores.forEach((sc, i) => { const p = r.par[i]; if (acc[p]) { acc[p].n++; acc[p].s += sc - p; } });
  const f = (p: number) => ({ n: acc[p].n, avg: acc[p].n ? acc[p].s / acc[p].n : 0 });
  return { 3: f(3), 4: f(4), 5: f(5) };
}

function parTypeInsight(a: ARound, b: ARound): Insight | null {
  const ta = byParType([a]), tb = byParType([b]);
  const diffs = ([3, 4, 5] as const).filter((p) => ta[p].n && tb[p].n).map((p) => ({ p, d: (tb[p].avg - ta[p].avg) * tb[p].n }));
  const best = [...diffs].sort((x, y) => x.d - y.d)[0], worst = [...diffs].sort((x, y) => y.d - x.d)[0];
  const parts: string[] = [];
  if (best && best.d <= -2) parts.push(`ganhou ${pl(Math.round(-best.d), "pancada")} nos par ${best.p}`);
  if (worst && worst.d >= 2 && worst !== best) parts.push(`perdeu ${pl(Math.round(worst.d), "pancada")} nos par ${worst.p}`);
  if (!parts.length) return null;
  return { tone: parts.length === 2 ? "neutral" : best && best.d <= -2 ? "good" : "bad", text: `${cap(parts.join(" e "))}.` };
}

/** Buracos que mudaram muito de uma volta para a outra (±2 ou mais). */
function holeSwings(a: ARound, b: ARound): Insight[] {
  const out: Insight[] = [];
  const up: string[] = [], down: string[] = [];
  b.scores.forEach((sc, i) => {
    const d = sc - a.scores[i];
    if (d <= -2) up.push(`${i + 1} (${a.scores[i]} → ${sc})`);
    else if (d >= 2) down.push(`${i + 1} (${a.scores[i]} → ${sc})`);
  });
  if (up.length) out.push({ tone: "good", text: `Grande melhoria no${up.length > 1 ? "s buracos" : " buraco"} ${up.join(", ")}.` });
  if (down.length) out.push({ tone: "bad", text: `Perdeu muito no${down.length > 1 ? "s buracos" : " buraco"} ${down.join(", ")}.` });
  return out;
}

/** Arranque e fecho: os 3 primeiros e os 3 últimos buracos vs par. */
function startFinish(b: ARound): Insight | null {
  const n = b.scores.length; if (n < 9) return null;
  const s = sum(b.scores.slice(0, 3)) - sum(b.par.slice(0, 3));
  const f = sum(b.scores.slice(n - 3)) - sum(b.par.slice(n - 3));
  if (s >= 3 && f <= 0) return { tone: "neutral", text: `Arranque difícil (${fmtTP(s)} nos 3 primeiros) mas fechou bem (${fmtTP(f)} nos 3 últimos).` };
  if (s <= 0 && f >= 3) return { tone: "bad", text: `Bom arranque (${fmtTP(s)} nos 3 primeiros) mas o fecho custou (${fmtTP(f)} nos 3 últimos).` };
  if (f <= -1) return { tone: "good", text: `Fecho forte: ${fmtTP(f)} nos 3 últimos buracos.` };
  return null;
}

/** Posição acumulada após cada volta (só entre quem jogou todas as voltas até lá). */
function positionsAfter(me: ARound[], field: ARound[][]): (number | null)[] {
  return me.map((_, k) => {
    const mine = sum(me.slice(0, k + 1).map(gross));
    const others = field.filter((rs) => rs.length > k).map((rs) => sum(rs.slice(0, k + 1).map(gross)));
    if (!others.length) return null;
    return 1 + others.filter((t) => t < mine).length;
  });
}

/** Média do campo por buraco (todas as voltas). */
function fieldHoleAvg(field: ARound[][], nh: number): number[] | null {
  const s = Array(nh).fill(0), n = Array(nh).fill(0);
  for (const rs of field) for (const r of rs) if (r.scores.length === nh) r.scores.forEach((v, i) => { s[i] += v - r.par[i]; n[i]++; });
  if (n.some((x) => x < 3)) return null;
  return s.map((v, i) => v / n[i]);
}

export function analyzeRounds(me: ARound[], field: ARound[][] = []): Analysis | null {
  const rs = [...me].sort((a, b) => a.round - b.round);
  if (rs.length < 2) return null;
  const nh = rs[0].scores.length;
  if (!rs.every((r) => r.scores.length === nh && r.par.length === nh)) return null;

  const pos = field.length ? positionsAfter(rs, field) : [];
  const rounds: RoundBlock[] = [];
  for (let k = 1; k < rs.length; k++) {
    const a = rs[k - 1], b = rs[k];
    const d = gross(b) - gross(a);
    const ins: Insight[] = [];
    ins.push({ tone: d < 0 ? "good" : d > 0 ? "bad" : "neutral",
      text: `${gross(b)} (${fmtTP(toPar(b))}) contra ${gross(a)} na R${a.round}: ${d === 0 ? "a mesma pontuação" : `${pl(Math.abs(d), "pancada")} ${d < 0 ? "melhor" : "pior"}`}.` });
    const n9 = ninesInsight(a, b); if (n9) ins.push(n9);
    ins.push(...countsInsight(a, b));
    const pt = parTypeInsight(a, b); if (pt) ins.push(pt);
    ins.push(...holeSwings(a, b));
    const sf = startFinish(b); if (sf) ins.push(sf);
    if (pos[k] != null && pos[k - 1] != null) {
      const dp = pos[k]! - pos[k - 1]!;
      ins.push({ tone: dp < 0 ? "good" : dp > 0 ? "bad" : "neutral",
        text: dp === 0 ? `Manteve o ${pos[k]}º lugar.` : `${dp < 0 ? "Subiu" : "Desceu"} do ${pos[k - 1]}º para o ${pos[k]}º lugar.` });
    }
    rounds.push({ round: b.round, prev: a.round, gross: gross(b), prevGross: gross(a), insights: ins });
  }

  // ── Torneio no seu todo ──
  const tour: Insight[] = [];
  const tot = sum(rs.map(gross)), tp = sum(rs.map(toPar));
  const best = rs.reduce((x, y) => (gross(y) < gross(x) ? y : x));
  const allSame = rs.every((r) => gross(r) === gross(rs[0]));
  tour.push({ tone: "neutral", text: `Total ${tot} (${fmtTP(tp)}) em ${rs.length} voltas — ${allSame ? `todas com ${gross(best)}` : `melhor volta R${best.round} (${gross(best)}), média ${fmt1(tot / rs.length)}`}.` });
  const all = byParType(rs);
  const types = ([3, 4, 5] as const).filter((p) => all[p].n);
  if (types.length >= 2) {
    const sorted = [...types].sort((x, y) => all[x].avg - all[y].avg);
    const s = sorted[0], w = sorted[sorted.length - 1];
    tour.push({ tone: "neutral", text: `Ponto forte: par ${s} (média ${fmtAvg(all[s].avg)} por buraco). A trabalhar: par ${w} (${fmtAvg(all[w].avg)}).` });
  }
  if (nh >= 18) {
    const f = sum(rs.map((r) => sum(r.scores.slice(0, 9)) - sum(r.par.slice(0, 9))));
    const bk = sum(rs.map((r) => sum(r.scores.slice(9)) - sum(r.par.slice(9))));
    if (Math.abs(f - bk) >= 3) tour.push({ tone: "neutral", text: `Joga melhor os ${f < bk ? "front" : "back"} nine: ${fmtTP(Math.min(f, bk))} contra ${fmtTP(Math.max(f, bk))} no total das voltas.` });
  }
  // Buracos sempre difíceis (acima do par em todas as voltas) e os sempre bons.
  const always = (pred: (d: number) => boolean) => Array.from({ length: nh }, (_, i) => i).filter((i) => rs.every((r) => pred(r.scores[i] - r.par[i])));
  const hard = always((d) => d >= 1), good = always((d) => d <= 0);
  if (hard.length) tour.push({ tone: "bad", text: `Acima do par em todas as voltas no${hard.length > 1 ? "s buracos" : " buraco"} ${hard.map((i) => i + 1).join(", ")}.` });
  if (good.length >= 3) tour.push({ tone: "good", text: `Par ou melhor em todas as voltas nos buracos ${good.map((i) => i + 1).join(", ")}.` });
  // Contra o campo: onde ganhou/perdeu mais face à média de todos.
  const fav = field.length ? fieldHoleAvg(field, nh) : null;
  if (fav) {
    const mine = Array.from({ length: nh }, (_, i) => sum(rs.map((r) => r.scores[i] - r.par[i])) / rs.length);
    const diff = mine.map((v, i) => ({ i, d: v - fav[i] }));
    const lost = [...diff].sort((x, y) => y.d - x.d).filter((x) => x.d >= .75).slice(0, 3);
    const won = [...diff].sort((x, y) => x.d - y.d).filter((x) => x.d <= -.5).slice(0, 3);
    if (won.length) tour.push({ tone: "good", text: `Melhor do que a média do campo no${won.length > 1 ? "s buracos" : " buraco"} ${won.map((x) => `${x.i + 1} (−${fmt1(-x.d)} por volta)`).join(", ")}.` });
    if (lost.length) tour.push({ tone: "bad", text: `Onde perdeu mais para o campo: buraco${lost.length > 1 ? "s" : ""} ${lost.map((x) => `${x.i + 1} (+${fmt1(x.d)} por volta)`).join(", ")}.` });
  }
  if (pos.length && pos[pos.length - 1] != null) {
    const p0 = pos[0]!, pN = pos[pos.length - 1]!;
    if (p0 !== pN) tour.push({ tone: pN < p0 ? "good" : "bad", text: `Do ${p0}º lugar após a R1 para o ${pN}º após a R${rs[rs.length - 1].round}.` });
  }

  // Manchete: a última comparação, em 1–2 frases.
  const last = rounds[rounds.length - 1];
  const headline = last.insights.slice(0, 1).concat(last.insights.filter((x) => /nine/.test(x.text)).slice(0, 1));
  return { headline, rounds, tournament: tour };
}
