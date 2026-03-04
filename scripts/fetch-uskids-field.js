'use strict';

const fs   = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const TORNEIOS = [
  { t: 21131, name: 'European Championship 2026', emoji: '🏆' },
  { t: 21652, name: 'Vallarta Open 2026',          emoji: '🇲🇽' },
  { t: 21455, name: 'Irish Open 2026',             emoji: '🇮🇪' },
  { t: 21795, name: 'Paris Invitational 2026',     emoji: '🇫🇷' },
  { t: 21456, name: 'Canadian Invitational 2026',  emoji: '🇨🇦' },
];

const ESCALOES_COM_NOMES = new Set([2103, 2104, 2105, 2114, 2106]);

// URL público do iframe USKids (não requer autenticação)
const IFRAME_URL  = (t) => `https://www.signupanytime.com/plugins/links/front/linksviews.aspx?v=results&fmt=nohead&ax=1129&t=${t}`;
const API_BASE    = 'https://www.signupanytime.com/plugins/links/admin/LinksAJAX.aspx';
const DELAY_MS    = 500;

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function parsearJogadores(flightPlayers) {
  return Object.values(flightPlayers || {})
    .filter(p => p.status === 1)
    .map(p => ({
      nome:   `${p.first || ''} ${p.last || ''}`.trim(),
      pais:   (p.country || '').toUpperCase(),
      cidade: p.place || '',
    }))
    .sort((a, b) => a.nome.localeCompare(b.nome));
}

// Intercept: aguarda uma resposta da API enquanto a página carrega
function esperarRespostaAPI(page, urlContains, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout esperando ${urlContains}`)), timeoutMs);

    page.on('response', async (response) => {
      if (!response.url().includes(urlContains)) return;
      if (!response.ok()) return;
      clearTimeout(timer);
      try {
        const json = await response.json();
        resolve(json);
      } catch (e) {
        reject(e);
      }
    });
  });
}

async function processarTorneio(page, torneio) {
  console.log(`\n▶ ${torneio.emoji}  ${torneio.name}  (t=${torneio.t})`);

  // Preparar intercepção ANTES de navegar
  const metaPromise = esperarRespostaAPI(page, `op=GetMeta&t=${torneio.t}`);

  // Navegar para a página pública do torneio — esta faz GetMeta automaticamente
  await page.goto(IFRAME_URL(torneio.t), { waitUntil: 'domcontentloaded', timeout: 20000 });

  let meta;
  try {
    meta = await metaPromise;
  } catch (err) {
    // A página pode não ter chamado GetMeta — tentar via fetch directo como fallback
    console.log(`  ℹ️  Intercepção falhou (${err.message}), a tentar fetch directo...`);
    try {
      meta = await page.evaluate(async (url) => {
        const r = await fetch(url, { credentials: 'include' });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      }, `${API_BASE}?op=GetMeta&t=${torneio.t}`);
    } catch (err2) {
      console.warn(`  ⚠️  GetMeta falhou: ${err2.message}`);
      return { ...torneio, erro: err2.message, escaloes: [], ultima_atualizacao: new Date().toISOString() };
    }
  }

  const tn        = meta.tournament;
  const ageGroups = meta.age_groups || {};
  const flights   = meta.flights    || {};

  console.log(`  ✓ GetMeta OK — ${Object.keys(flights).length} flights | ${tn.players_9} (9H) + ${tn.players_18} (18H)`);

  // Agora que temos sessão, tentar GetPlayerTeeTimes para os escalões relevantes
  const flightsPorAG = {};
  for (const [fid, f] of Object.entries(flights)) {
    if (!flightsPorAG[f.age_group]) flightsPorAG[f.age_group] = { fid, f };
  }

  const escaloes = [];

  for (const [ag, { fid, f }] of Object.entries(flightsPorAG)) {
    const agInfo    = ageGroups[ag] || {};
    const nome      = agInfo.name   || `age_group_${ag}`;
    const inscritos = f.registered  || 0;
    const maximo    = f.max_entry   || 0;

    const escalao = {
      age_group: parseInt(ag),
      nome,
      genero:    agInfo.gender          || null,
      holes:     agInfo.holes_per_round || 18,
      flight_id: parseInt(fid),
      inscritos,
      maximo,
      vagas:     maximo - inscritos,
      pct_cheio: maximo > 0 ? Math.round((inscritos / maximo) * 100) : 0,
      jogadores: null,
      paises:    null,
    };

    if (ESCALOES_COM_NOMES.has(parseInt(ag)) && inscritos > 0) {
      try {
        await sleep(DELAY_MS);
        const data = await page.evaluate(async (url) => {
          const r = await fetch(url, { credentials: 'include' });
          if (!r.ok) throw new Error('HTTP ' + r.status);
          return r.json();
        }, `${API_BASE}?op=GetPlayerTeeTimes&f=${fid}&r=1&p=1&t=0`);

        const jogadores = parsearJogadores(data.flight_players);
        const cp = {};
        for (const j of jogadores) cp[j.pais] = (cp[j.pais] || 0) + 1;
        escalao.paises    = Object.entries(cp).sort((a, b) => b[1] - a[1]).map(([p, n]) => ({ pais: p, n }));
        escalao.jogadores = jogadores;

        const pt = jogadores.filter(j => j.pais === 'PT');
        const ptStr = pt.length ? `  🇵🇹 ${pt.map(j => j.nome).join(', ')}` : '';
        console.log(`  ✓ ${nome}: ${jogadores.length}/${maximo}${ptStr}`);
      } catch (err) {
        // GetPlayerTeeTimes pode continuar a dar 403 — não é crítico
        console.log(`  · ${nome}: ${inscritos}/${maximo} (nomes indisponíveis: ${err.message.replace('page.evaluate: Error: ', '')})`);
      }
    } else {
      console.log(`  · ${nome}: ${inscritos}/${maximo}`);
    }

    escaloes.push(escalao);
  }

  escaloes.sort((a, b) => {
    if (a.genero !== b.genero) return a.genero === 'Boys' ? -1 : 1;
    return a.age_group - b.age_group;
  });

  return {
    t:                  torneio.t,
    name:               tn.name || torneio.name,
    emoji:              torneio.emoji,
    date_inicio:        tn.start_date,
    date_fim:           tn.end_date,
    rondas:             tn.rounds,
    campo:              tn.courses || null,
    fee_18:             tn.fee_18  || null,
    total_inscritos:    escaloes.reduce((s, e) => s + e.inscritos, 0),
    total_maximo:       escaloes.reduce((s, e) => s + e.maximo,    0),
    escaloes,
    ultima_atualizacao: new Date().toISOString(),
  };
}

async function main() {
  console.log('══════════════════════════════════════');
  console.log('⛳  USKids Field Monitor');
  console.log(`    ${new Date().toLocaleString('pt-PT')}`);
  console.log('══════════════════════════════════════');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  });
  const page = await context.newPage();

  const resultados = [];
  try {
    for (const torneio of TORNEIOS) {
      resultados.push(await processarTorneio(page, torneio));
      await sleep(DELAY_MS);
    }
  } finally {
    await browser.close();
  }

  const outputDir  = path.join(__dirname, '..', 'public', 'data');
  const outputPath = path.join(outputDir, 'uskids-field.json');
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify({ gerado_em: new Date().toISOString(), torneios: resultados }, null, 2), 'utf8');

  console.log('\n══════════════════════════════════════');
  console.log('✅  public/data/uskids-field.json gerado');
  console.log('\n📊  Resumo:');
  for (const t of resultados) {
    if (t.erro) { console.log(`  ❌ ${t.emoji} ${t.name}: ${t.erro}`); continue; }
    console.log(`  ${t.emoji}  ${t.name}: ${t.total_inscritos}/${t.total_maximo} total`);
    const b12 = t.escaloes.find(e => e.nome === 'Boys 12');
    if (b12) {
      const pt = (b12.jogadores || []).filter(j => j.pais === 'PT');
      const ptStr = pt.length ? `  🇵🇹 ${pt.map(j => j.nome).join(', ')}` : '';
      console.log(`     ★ Boys 12: ${b12.inscritos}/${b12.maximo} (${b12.vagas} vagas)${ptStr}`);
    }
  }
  console.log('══════════════════════════════════════');
}

main().catch(err => { console.error('Erro fatal:', err); process.exit(1); });
