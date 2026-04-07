import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { join, extname } from 'path'
import { existsSync, statSync, createReadStream, readFileSync } from 'fs'

function loadEnvLocal() {
  const p = join(process.cwd(), '.env.local')
  console.log('[env] A procurar .env.local em: ' + p)
  if (!existsSync(p)) { console.warn('[env] Ficheiro nao encontrado!'); return }
  let raw = readFileSync(p)
  let text: string
  if (raw[0] === 0xFF && raw[1] === 0xFE) {
    text = raw.slice(2).toString('utf16le')
  } else if (raw[0] === 0xFE && raw[1] === 0xFF) {
    text = raw.slice(2).swap16().toString('utf16le')
  } else {
    text = raw.toString('utf8').replace(/^\uFEFF/, '')
  }
  let loaded = 0
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim().replace(/[\x00]/g, '')
    if (!t || t.startsWith('#')) continue
    const eq = t.indexOf('=')
    if (eq < 0) continue
    const k = t.slice(0, eq).trim()
    const v = t.slice(eq + 1).trim()
    console.log('[env] Linha: k=' + JSON.stringify(k) + ' v=' + JSON.stringify(v.slice(0,20)))
    if (k && !(k in process.env)) { process.env[k] = v; loaded++ }
  }
  console.log('[env] Carregadas ' + loaded + ' variaveis do .env.local')
  console.log('[env] DATAGOLF_SESSION = ' + (process.env.DATAGOLF_SESSION ? process.env.DATAGOLF_SESSION.slice(0,30) + '...' : '(indefinido)'))
}
loadEnvLocal()

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
}

const TORNEIOS: Record<string, { nome: string; escalao: string; sex: string }> = {
  '10935': { nome: 'Campeonato Nacional Sub-18 H', escalao: 'Sub-18', sex: 'M' },
  '10936': { nome: 'Campeonato Nacional Sub-18 S', escalao: 'Sub-18', sex: 'F' },
  '10937': { nome: 'Campeonato Nacional Sub-16 H', escalao: 'Sub-16', sex: 'M' },
  '10938': { nome: 'Campeonato Nacional Sub-16 S', escalao: 'Sub-16', sex: 'F' },
  '10939': { nome: 'Campeonato Nacional Sub-14 H', escalao: 'Sub-14', sex: 'M' },
  '10940': { nome: 'Campeonato Nacional Sub-14 S', escalao: 'Sub-14', sex: 'F' },
  '10941': { nome: 'Campeonato Nacional Sub-12 H', escalao: 'Sub-12', sex: 'M' },
  '10942': { nome: 'Campeonato Nacional Sub-12 S', escalao: 'Sub-12', sex: 'F' },
  '10943': { nome: 'Campeonato Nacional Sub-10 H', escalao: 'Sub-10', sex: 'M' },
  '10944': { nome: 'Campeonato Nacional Sub-10 S', escalao: 'Sub-10', sex: 'F' },
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#\d+;/g, '').replace(/\s+/g, ' ').trim()
}

// Formato: {seq} {fed} {nome clube} {hcp} {score} {YYYY/MM/DD} {HH:MM}
// Exemplo: "1 46311 Tomas Rente Miramar 6.9 77.6 2026/04/04 08:46"
function parseAdmissionsTable(html: string) {
  const text = stripHtml(html)

const re = /\b(\d+)\s+(\d{4,6})\s+([\wÀ-ú][^0-9\r\n]+?)\s+(\d{1,3}\.\d)\s+[\d.]+\s+\d{4}\/\d{2}\/\d{2}/g  const jogadores: { fed: string | null; nome: string; clube: string; hcp: number | null }[] = []
  let m: RegExpExecArray | null

  while ((m = re.exec(text)) !== null) {
    const fed  = m[2]
    const nome = m[3].trim()
    const hcp  = parseFloat(m[4])
    jogadores.push({ fed, nome, clube: '', hcp: isNaN(hcp) ? null : hcp })
  }

  if (jogadores.length === 0) {
    const fedRe = /\b(\d{4,6})\b/g
    const feds = new Set<string>()
    let fm: RegExpExecArray | null
    while ((fm = fedRe.exec(text)) !== null) feds.add(fm[1])
    for (const fed of feds) jogadores.push({ fed, nome: '', clube: '', hcp: null })
  }

  return jogadores
}
export default defineConfig({
  plugins: [
    react(),
    {
      name: 'serve-output',
      configureServer(server) {

        server.middlewares.use(async (req, res, next) => {
          if (!req.url?.startsWith('/api/inscricoes')) return next()

          const url   = new URL(req.url, 'http://localhost')
          const tcode = url.searchParams.get('tcode') ?? ''
          const raw   = url.searchParams.get('raw') === '1'
          const meta  = TORNEIOS[tcode]

          if (!tcode || !meta) {
            res.writeHead(400, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: 'tcode invalido (10935-10944)' }))
            return
          }

          const cookie = process.env.DATAGOLF_SESSION ?? ''
          if (!cookie) console.warn('[inscricoes] DATAGOLF_SESSION em falta no .env.local !')
          console.log('[inscricoes] tcode=' + tcode + ' cookie=' + (cookie ? cookie.slice(0, 30) + '...' : 'VAZIA'))

          const fpgUrl = 'https://scoring.datagolf.pt/pt/tournAdmissions.aspx?ccode=000&tcode=' + tcode
          const headers: Record<string, string> = {
            'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            'Accept':          'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'pt-PT,pt;q=0.9',
            'Referer':         'https://scoring.datagolf.pt/',
          }
          if (cookie) headers['Cookie'] = cookie

          try {
            const fpgRes = await fetch(fpgUrl, { headers, redirect: 'follow' })
            const html   = await fpgRes.text()
            console.log('[inscricoes] tcode=' + tcode + ' -> HTTP ' + fpgRes.status)

            if (!fpgRes.ok) {
              console.warn('[inscricoes] Resposta erro: ' + html.slice(0, 300))
              if (raw) { res.writeHead(fpgRes.status, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(html); return }
              res.writeHead(502, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ error: 'FPG HTTP ' + fpgRes.status, tcode, ...meta, totalInscritos: 0, jogadores: [], lastFetched: null }))
              return
            }

            if (raw) { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(html); return }

            const jogadores = parseAdmissionsTable(html)
            console.log('[inscricoes] tcode=' + tcode + ' -> ' + jogadores.length + ' inscritos')
            res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' })
            res.end(JSON.stringify({ tcode, ...meta, totalInscritos: jogadores.length, jogadores, lastFetched: new Date().toISOString(), fpgUrl }))

          } catch (err) {
            console.error('[inscricoes] Erro tcode=' + tcode + ':', err)
            res.writeHead(502, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: String(err), tcode, ...meta, totalInscritos: 0, jogadores: [], lastFetched: null }))
          }
        })

        server.middlewares.use((req, res, next) => {
          const url = req.url?.split('?')[0]
          if (!url || !/^\/\d+\//.test(url)) return next()
          const file = join(process.cwd(), 'output', decodeURIComponent(url))
          try {
            if (existsSync(file) && statSync(file).isFile()) {
              res.setHeader('Content-Type', MIME[extname(file).toLowerCase()] || 'application/octet-stream')
              createReadStream(file).pipe(res)
              return
            }
          } catch {}
          next()
        })
      },
    },
  ],

  build: {
    outDir: 'output',
    emptyOutDir: false,
  },

  optimizeDeps: {
    entries: ['src/main.tsx'],
  },

  server: {
    watch: {
      ignored: (p: string) => p.replace(/\\/g, '/').includes('/output/'),
    },
  },
})