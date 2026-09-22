#!/usr/bin/env node
/**
 * build-ics.js — escreve os ficheiros .ics do calendário em `public/c/{CAL_SECRET}/`.
 *
 * Porquê: o Google Calendar (e o Apple, e o Outlook) sabe subscrever um
 * endereço .ics e relê-lo sozinho de tempos a tempos. Assim o calendário do
 * telemóvel acompanha o site sem ninguém copiar eventos à mão — era o que se
 * fazia antes, e o calendário «Golf2026» do Gmail ficou meses desactualizado.
 *
 * A fonte é `src/data/calendarEvents.ts` (a mesma que a página usa) mais os
 * aniversários tirados de `public/data/players.json`, com as mesmas regras do
 * `CalendarioPage.tsx`: `DOB_OVERRIDES` ganha ao players.json e quem tem a tag
 * `no-priority` não entra.
 *
 * Corre no `prebuild`, por isso cada deploy republica os ficheiros.
 * Ver `docs/claude/paginas.md` e o `/calendario`.
 */
import { build } from "esbuild";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const RAIZ = path.resolve(import.meta.dirname, "..");
const PUBLICO = path.join(RAIZ, "public");
const DOMINIO = "golf-fpg.vercel.app";

/* ═══ Onde se publicam ═══
   A página /calendario tem palavra-passe, mas um .ics não pode ter: o Google só
   subscreve endereços abertos. Por isso os ficheiros vão para `public/c/{código}/`,
   com um código secreto que vive na variável de ambiente CAL_SECRET (na Vercel) ou
   no ficheiro `.cal-secret` (local, gitignored — o `.env.local` NÃO serve: está
   comitado, e o repositório é público). Quem não tiver o endereço não lhe chega:
   nada no site liga para lá.
   Sem CAL_SECRET, escreve para `public/c/dev/` e avisa: serve para experimentar
   localmente, não para publicar. */
async function codigoSecreto() {
  if (process.env.CAL_SECRET) return process.env.CAL_SECRET.trim();
  try {
    const f = await readFile(path.join(RAIZ, ".cal-secret"), "utf8");
    if (f.trim()) return f.trim();
  } catch { /* não há .cal-secret */ }
  console.warn("  ⚠ CAL_SECRET não definida — a escrever em public/c/dev/ (só para testes locais).");
  return "dev";
}

/* Um ficheiro por família, para se poderem ligar e desligar à parte no Google
   (e cada um leva a sua cor lá). A ordem aqui é a ordem de importância. */
const FICHEIROS = [
  {
    nome: "golfe.ics",
    titulo: "Golfe — Manuel",
    descricao: "Provas de golfe do Manuel: CGSS, academia júnior, Drive, FPG e internacionais.",
    aceita: (calId, grupo) => ["CGSS", "JUNIOR", "DRIVE", "FPG"].includes(grupo)
      || calId === "treino" || calId === "drive_final" || calId.startsWith("dest_"),
  },
  {
    nome: "andebol.ics",
    titulo: "Andebol — Manuel",
    descricao: "Época de andebol Sub-14, da Associação de Andebol da Madeira.",
    aceita: (calId) => calId === "andebol",
  },
  {
    nome: "viagens.ics",
    titulo: "Viagens — golfe",
    descricao: "Voos e deslocações ligados às provas.",
    aceita: (_calId, grupo) => grupo === "VIAGENS",
  },
  {
    nome: "familia.ics",
    titulo: "Família — provas e férias",
    descricao: "Badminton da Maria Antónia, colónias, férias e datas próprias.",
    aceita: (calId) => ["irma_bad", "pessoal", "profissao_fe", "ferias", "colonias"].includes(calId),
  },
  {
    nome: "aniversarios.ics",
    titulo: "Aniversários — jogadores",
    descricao: "Aniversários dos jogadores do players.json, por escalão.",
    aceita: (calId) => calId.startsWith("bday_"),
  },
];

/** Importa o módulo TypeScript dos dados (o esbuild trata do TS e dos imports). */
async function lerDados() {
  const dir = await mkdtemp(path.join(tmpdir(), "golf-ics-"));
  const saida = path.join(dir, "calendarEvents.mjs");
  await build({
    entryPoints: [path.join(RAIZ, "src/data/calendarEvents.ts")],
    outfile: saida,
    bundle: true,
    format: "esm",
    platform: "node",
    logLevel: "silent",
  });
  const mod = await import(pathToFileURL(saida).href);
  await rm(dir, { recursive: true, force: true });
  return mod;
}

/* ═══ Mecânica do formato iCalendar (RFC 5545) ═══ */

const escapar = (t) => String(t).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
const dataICS = (d) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
const maisUmDia = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);

/** As linhas não podem passar de 75 octetos; o resto continua com um espaço à frente. */
function dobrar(linha) {
  const bytes = Buffer.from(linha, "utf8");
  if (bytes.length <= 75) return linha;
  const partes = [];
  let i = 0;
  while (i < bytes.length) {
    const max = partes.length === 0 ? 75 : 74;
    let corte = Math.min(i + max, bytes.length);
    // não partir um caracter UTF-8 ao meio
    while (corte > i && corte < bytes.length && (bytes[corte] & 0xc0) === 0x80) corte--;
    partes.push((partes.length ? " " : "") + bytes.subarray(i, corte).toString("utf8"));
    i = corte;
  }
  return partes.join("\r\n");
}

function vevento(ev, carimbo) {
  const inicio = ev.date;
  const fim = maisUmDia(ev.endDate ?? ev.date);
  const chave = `${ev.calId}|${ev.title}|${dataICS(inicio)}|${dataICS(fim)}`;
  const uid = `${createHash("sha1").update(chave).digest("hex").slice(0, 24)}@${DOMINIO}`;
  const descricao = [ev.modalidade, ev.note, `golf-fpg.vercel.app/calendario`].filter(Boolean).join("\n");
  const linhas = [
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${carimbo}`,
    `DTSTART;VALUE=DATE:${dataICS(inicio)}`,
    `DTEND;VALUE=DATE:${dataICS(fim)}`,
    `SUMMARY:${escapar(ev.title)}`,
    `DESCRIPTION:${escapar(descricao)}`,
    "TRANSP:TRANSPARENT",
  ];
  if (ev.campo) linhas.push(`LOCATION:${escapar(ev.campo)}`);
  linhas.push("END:VEVENT");
  return linhas;
}

function calendario({ titulo, descricao }, eventos, carimbo) {
  const linhas = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:-//golf-fpg//calendario//PT`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapar(titulo)}`,
    `X-WR-CALDESC:${escapar(descricao)}`,
    "X-WR-TIMEZONE:Atlantic/Madeira",
    // de quanto em quanto tempo se pede ao cliente que releia (o Google faz o que quer)
    "REFRESH-INTERVAL;VALUE=DURATION:PT6H",
    "X-PUBLISHED-TTL:PT6H",
  ];
  for (const ev of eventos) linhas.push(...vevento(ev, carimbo));
  linhas.push("END:VCALENDAR");
  return linhas.map(dobrar).join("\r\n") + "\r\n";
}

/** Aniversários, com as mesmas regras da página. */
function aniversarios(players, DOB_OVERRIDES, ANO_BASE, ANO_FIM) {
  const porEscalao = {
    "Sub-10": "bday_sub10", "Sub-12": "bday_sub12", "Sub-14": "bday_sub14",
    "Sub-16": "bday_sub16", "Sub-18": "bday_sub18",
  };
  const saida = [];
  let id = 90000;
  for (const [fed, p] of Object.entries(players)) {
    const ovr = DOB_OVERRIDES[fed];
    const dob = ovr?.dob ?? p.dob;
    if (!dob || p.tags?.includes("no-priority")) continue;
    const [ano, mes, dia] = dob.split("-").map(Number);
    if (!ano || !mes || !dia) continue;
    const calId = p.tags?.includes("PJA") ? "bday_pja" : (porEscalao[p.escalao] || "bday_outros");
    for (let a = ANO_BASE; a <= ANO_FIM; a++) {
      saida.push({
        id: ++id, calId,
        title: `🎂 ${p.name.split(" ")[0]} — ${a - ano} anos`,
        date: new Date(a, mes - 1, dia),
        campo: "", modalidade: `${p.name} · #${fed}`, note: ovr?.note,
      });
    }
  }
  return saida;
}

async function main() {
  const { EVENTS, CAL_DEFS, DOB_OVERRIDES, ANO_BASE, ANO_FIM } = await lerDados();
  const destino = path.join(PUBLICO, "c", await codigoSecreto());
  await mkdir(destino, { recursive: true });
  const players = JSON.parse(await readFile(path.join(PUBLICO, "data/players.json"), "utf8"));
  const grupoDe = new Map(CAL_DEFS.map((d) => [d.id, d.group]));
  const todos = [...EVENTS, ...aniversarios(players, DOB_OVERRIDES, ANO_BASE, ANO_FIM)]
    .sort((a, b) => a.date - b.date || a.title.localeCompare(b.title, "pt"));

  const carimbo = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  let semCasa = 0;
  const arrumados = new Set();
  for (const f of FICHEIROS) {
    const eventos = todos.filter((ev) => f.aceita(ev.calId, grupoDe.get(ev.calId) ?? ""));
    eventos.forEach((ev) => arrumados.add(ev));
    await writeFile(path.join(destino, f.nome), calendario(f, eventos, carimbo), "utf8");
    console.log(`  ${f.nome.padEnd(30)} ${String(eventos.length).padStart(4)} eventos`);
  }
  semCasa = todos.filter((ev) => !arrumados.has(ev)).length;
  if (semCasa) console.warn(`  ⚠ ${semCasa} eventos não entraram em ficheiro nenhum (calId novo sem regra em FICHEIROS?)`);
  console.log(`build-ics: ${todos.length} eventos em ${FICHEIROS.length} ficheiros (${path.relative(RAIZ, destino)}).`);
}

main().catch((e) => { console.error("build-ics falhou:", e); process.exit(1); });
