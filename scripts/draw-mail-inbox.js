#!/usr/bin/env node
/**
 * draw-mail-inbox.js — entrada CLOUD do percurso dos draws CGSS: um email com
 * o PDF do draw chega ao Gmail e a GitHub Action draw-inbox-email.yml insere
 * o torneio no site SEM PC NENHUM ligado.
 * ═══════════════════════════════════════════════════════════════════════════
 * Liga ao Gmail por IMAP em MODO SÓ-LEITURA (nunca marca como lido, nunca
 * move nem apaga nada — a caixa fica exactamente como estava). O que já foi
 * processado é lembrado em scripts/draw-mail-processed.json, committado no
 * repo JUNTO com os dados do draw (atómico: se o push falhar, nada fica
 * marcado e a corrida seguinte repete — o guard de duplicados do
 * add-cgss-draw torna a repetição inofensiva).
 *
 * Critérios para um email contar como "draw":
 *   - remetente na allowlist (env DRAW_MAIL_SENDERS, CSV; default = a própria
 *     conta — ou seja, basta a Mariana REENCAMINHAR o email do clube para si
 *     mesma; emails do secretariado podem ser acrescentados à lista);
 *   - anexo PDF cujo nome OU assunto contenha "draw";
 *   - recebido nos últimos 14 dias e ainda não processado.
 *
 * Cada PDF aceite passa pelo add-cgss-draw.js --strict-cgss (que recusa
 * organizadores não-CGSS, ex. PXO Porto Santo — esses ficam relatados como
 * "manual" no aviso por email e marcados como processados para não repetir).
 *
 * ENV:  DRAW_MAIL_USER + DRAW_MAIL_PASS (Gmail app password) obrigatórios;
 *       DRAW_MAIL_SENDERS opcional.
 * DEPS: imapflow + mailparser (a Action instala com `npm i --no-save`).
 *
 * USO:
 *   node scripts/draw-mail-inbox.js --check-only   # só conta candidatos
 *   node scripts/draw-mail-inbox.js                # processa e actualiza o
 *                                                  #   draw-mail-processed.json
 * OUTPUT: escreve draw-mail-result.json (raiz, gitignored) com o sumário
 *   {candidates, inserted[], failed[], summary} para os passos seguintes do
 *   workflow (commit + aviso).
 * EXIT: 0 = inseriu ≥1 · 2 = nada novo · 3 = só falhas (avisar) · 1 = erro.
 * ═══════════════════════════════════════════════════════════════════════════
 */
"use strict";
const fs = require("fs");
const path = require("path");
const os = require("os");
const { execFileSync } = require("child_process");

const REPO = path.resolve(__dirname, "..");
const PROCESSED = path.join(__dirname, "draw-mail-processed.json");
const RESULT = path.join(REPO, "draw-mail-result.json");
const CHECK_ONLY = process.argv.includes("--check-only");

const USER = process.env.DRAW_MAIL_USER || "";
const PASS = process.env.DRAW_MAIL_PASS || "";
if (!USER || !PASS) {
  console.log("[mail] DRAW_MAIL_USER/DRAW_MAIL_PASS não definidos — nada a fazer.");
  fs.writeFileSync(RESULT, JSON.stringify({ candidates: 0, inserted: [], failed: [], summary: "sem credenciais" }));
  process.exit(2);
}
const SENDERS = (process.env.DRAW_MAIL_SENDERS || USER)
  .split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);

let ImapFlow, simpleParser;
try {
  ({ ImapFlow } = require("imapflow"));
  ({ simpleParser } = require("mailparser"));
} catch {
  console.error("[mail] ERRO: faltam as dependências imapflow/mailparser (npm i imapflow mailparser --no-save).");
  process.exit(1);
}

const loadProcessed = () => {
  try { return JSON.parse(fs.readFileSync(PROCESSED, "utf8")); } catch { return []; }
};
const isDrawPdf = (att, subject) =>
  ((att.contentType || "").includes("pdf") || /\.pdf$/i.test(att.filename || "")) &&
  (/draw/i.test(att.filename || "") || /draw/i.test(subject || ""));

(async () => {
  const processed = loadProcessed();
  const seen = new Set(processed.map((p) => p.id));
  const client = new ImapFlow({
    host: "imap.gmail.com", port: 993, secure: true,
    auth: { user: USER, pass: PASS }, logger: false,
  });
  await client.connect();
  const lock = await client.getMailboxLock("INBOX");
  const candidates = []; // {id, uid, subject, from, date}
  try {
    const since = new Date(Date.now() - 14 * 864e5);
    const uids = (await client.search({ since }, { uid: true })) || [];
    for await (const msg of uids.length ? client.fetch(uids, { uid: true, envelope: true, bodyStructure: true }, { uid: true }) : []) {
      const env = msg.envelope || {};
      const id = env.messageId || `uid-${msg.uid}`;
      if (seen.has(id)) continue;
      const from = ((env.from || [])[0] || {}).address || "";
      if (!SENDERS.includes(from.toLowerCase())) continue;
      // há anexo PDF plausível? (verificação leve pela estrutura; a definitiva
      // é feita no download com o mailparser)
      const parts = [];
      (function walk(n) { if (!n) return; if (n.childNodes) n.childNodes.forEach(walk); else parts.push(n); })(msg.bodyStructure);
      const hasPdf = parts.some((p) =>
        (/pdf/i.test(p.type || "") || /\.pdf$/i.test((p.dispositionParameters || {}).filename || (p.parameters || {}).name || "")) &&
        (/draw/i.test((p.dispositionParameters || {}).filename || (p.parameters || {}).name || "") || /draw/i.test(env.subject || "")));
      if (!hasPdf) continue;
      candidates.push({ id, uid: msg.uid, subject: env.subject || "", from, date: (env.date || new Date()).toISOString().slice(0, 10) });
    }

    console.log(`[mail] candidatos novos: ${candidates.length}${candidates.length ? " — " + candidates.map(c => `"${c.subject}" (${c.date})`).join(" · ") : ""}`);
    if (CHECK_ONLY || candidates.length === 0) {
      fs.writeFileSync(RESULT, JSON.stringify({ candidates: candidates.length, inserted: [], failed: [], summary: "check-only" }));
      process.exit(candidates.length ? 0 : 2);
    }

    /* ── processar: download → add-cgss-draw --strict-cgss ──────────────── */
    const inserted = [], failed = [];
    for (const c of candidates) {
      const { content } = await client.download(String(c.uid), undefined, { uid: true });
      const chunks = [];
      for await (const ch of content) chunks.push(ch);
      const parsed = await simpleParser(Buffer.concat(chunks));
      const atts = (parsed.attachments || []).filter((a) => isDrawPdf(a, c.subject));
      const results = [];
      for (const a of atts) {
        const tmp = path.join(os.tmpdir(), (a.filename || "draw.pdf").replace(/[^\w.À-ÿ -]/g, "_"));
        fs.writeFileSync(tmp, a.content);
        try {
          const out = execFileSync("node", [path.join(__dirname, "add-cgss-draw.js"), "--pdf", tmp, "--strict-cgss"],
            { cwd: REPO, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
          const m = out.match(/placeholder atribuído: (007\/9\d{4})/);
          results.push({ ok: true, file: a.filename, placeholder: m ? m[1] : "?", out });
          console.log(`[mail] ✓ ${a.filename}: inserido (${m ? m[1] : "?"}).`);
        } catch (e) {
          const detail = [e.stdout, e.stderr].filter(Boolean).join("\n");
          results.push({ ok: false, file: a.filename, out: detail });
          console.log(`[mail] ✗ ${a.filename}: FALHOU — ${detail.trim().split("\n").pop()}`);
        }
      }
      const okOnes = results.filter((r) => r.ok);
      (okOnes.length ? inserted : failed).push({ ...c, results });
      processed.push({ id: c.id, subject: c.subject, date: c.date,
        result: okOnes.length ? "inserido " + okOnes.map(r => r.placeholder).join("+") : "falhou" });
    }

    // memória do que já foi visto (committada pelo workflow no MESMO commit
    // que os dados — se o push falhar, nada fica marcado e repete-se)
    fs.writeFileSync(PROCESSED + ".tmp", JSON.stringify(processed.slice(-200), null, 2));
    fs.renameSync(PROCESSED + ".tmp", PROCESSED);

    const summary = [
      ...inserted.map((c) => `✅ "${c.subject}": ${c.results.filter(r => r.ok).map(r => `${r.file} → ${r.placeholder}`).join(", ")}`),
      ...failed.map((c) => `❌ "${c.subject}": ${c.results.map(r => `${r.file} — ${String(r.out).trim().split("\n").pop()}`).join("; ")} (tratar manualmente)`),
    ].join("\n");
    fs.writeFileSync(RESULT, JSON.stringify({ candidates: candidates.length, inserted, failed, summary }, null, 2));
    console.log("[mail] sumário:\n" + summary);
    process.exit(inserted.length ? 0 : failed.length ? 3 : 2);
  } finally {
    lock.release();
    await client.logout().catch(() => {});
  }
})().catch((e) => { console.error("[mail] ERRO:", e.message); process.exit(1); });
