import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { join, extname } from 'path'
import { existsSync, statSync, createReadStream, readFileSync, writeFileSync, mkdirSync } from 'fs'

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

// Formato: {seq} {fed} {nome+clube} {hcp} {vac} {YYYY/MM/DD} {HH:MM}
// Exemplo: "1 46311 Tomas Rente Miramar 6.9 77.6 2026/04/04 08:46"
type Jogador = { fed: string | null; nome: string; clube: string; hcp: number | null; vac: number | null; dataInscricao: string | null }

function parseAdmissionsTable(html: string): Jogador[] {
  const text = stripHtml(html)

  const reEntry = /\b(\d{1,3})\s+(\d{4,6})\s+([A-Za-z\u00C0-\u017F][A-Za-z\u00C0-\u017F\s,.'()\-]*?)\s+(\d{1,3}\.\d)\s+([\d.]+)\s+(\d{4}\/\d{2}\/\d{2})\s+(\d{2}:\d{2})/g

  const jogadores: Jogador[] = []
  let m: RegExpExecArray | null

  while ((m = reEntry.exec(text)) !== null) {
    const fed           = m[2]
    const nome          = m[3].trim()
    const hcp           = parseFloat(m[4])
    const vac           = parseFloat(m[5])
    const dataInscricao = m[6] + ' ' + m[7]
    jogadores.push({
      fed,
      nome,
      clube: '',
      hcp: isNaN(hcp) ? null : hcp,
      vac: isNaN(vac) ? null : vac,
      dataInscricao,
    })
  }

  if (jogadores.length === 0) {
    const fedRe = /\b(\d{4,6})\b/g
    const feds = new Set<string>()
    let fm: RegExpExecArray | null
    while ((fm = fedRe.exec(text)) !== null) feds.add(fm[1])
    for (const fed of feds) jogadores.push({ fed, nome: '', clube: '', hcp: null, vac: null, dataInscricao: null })
  }

  return jogadores
}


/* -- Cache de inscricoes em data/inscricoes_nacionais.json ------------- */
const CACHE_FILE = join(process.cwd(), 'data', 'inscricoes_nacionais.json')

type CacheEntry = {
  tcode: string; nome: string; escalao: string; sex: string;
  totalInscritos: number; jogadores: { fed: string | null; nome: string; clube: string; hcp: number | null; vac: number | null; dataInscricao: string | null }[];
  lastFetched: string; lastChanged: string; fpgUrl: string;
}
type CacheFile = Record<string, CacheEntry>

function readCache(): CacheFile {
  try {
    if (existsSync(CACHE_FILE)) return JSON.parse(readFileSync(CACHE_FILE, 'utf8'))
  } catch {}
  return {}
}

const PUBLIC_CACHE = join(process.cwd(), 'public', 'data', 'inscricoes_nacionais.json')

function writeCache(data: CacheFile) {
  const json = JSON.stringify(data, null, 2)
  // 1. data/ -- usado pelo middleware local
  try {
    const dir = join(process.cwd(), 'data')
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    writeFileSync(CACHE_FILE, json, 'utf8')
  } catch (e) {
    console.warn('[inscricoes] Nao foi possivel gravar data/cache:', e)
  }
  // 2. public/data/ -- servido como ficheiro estatico (Vercel / mobile)
  try {
    const pubDir = join(process.cwd(), 'public', 'data')
    if (!existsSync(pubDir)) mkdirSync(pubDir, { recursive: true })
    writeFileSync(PUBLIC_CACHE, json, 'utf8')
    console.log('[inscricoes] public/data/ actualizado -- faz commit para publicar no Vercel')
  } catch (e) {
    console.warn('[inscricoes] Nao foi possivel gravar public/data/cache:', e)
  }
}

function diffJogadores(
  prev: CacheEntry['jogadores'],
  next: CacheEntry['jogadores']
): { added: string[]; removed: string[] } {
  const prevFeds = new Set(prev.map(j => j.fed).filter(Boolean) as string[])
  const nextFeds = new Set(next.map(j => j.fed).filter(Boolean) as string[])
  const added   = [...nextFeds].filter(f => !prevFeds.has(f))
  const removed = [...prevFeds].filter(f => !nextFeds.has(f))
  // Nomes dos adicionados/removidos para o log
  const addedNomes  = added.map(f  => next.find(j => j.fed === f)?.nome  ?? f)
  const removedNomes = removed.map(f => prev.find(j => j.fed === f)?.nome ?? f)
  return { added: addedNomes, removed: removedNomes }
}

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'serve-output',
      configureServer(server) {

        server.middlewares.use(async (req, res, next) => {
          if (!req.url?.startsWith('/api/inscricoes')) return next()

          const url     = new URL(req.url, 'http://localhost')
          const tcode   = url.searchParams.get('tcode') ?? ''
          const raw     = url.searchParams.get('raw') === '1'
          const refresh = url.searchParams.get('refresh') === '1'
          const meta    = TORNEIOS[tcode]

          if (!tcode || !meta) {
            res.writeHead(400, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: 'tcode invalido (10935-10944)' }))
            return
          }

          const fpgUrl = 'https://scoring.datagolf.pt/pt/tournAdmissions.aspx?ccode=000&tcode=' + tcode
          const cache  = readCache()
          const cached = cache[tcode]

          // Servir cache se existir e nao for pedido de refresh
          if (cached && !refresh && !raw) {
            console.log('[inscricoes] tcode=' + tcode + ' -> CACHE (' + cached.totalInscritos + ' inscritos, ' + cached.lastFetched + ')')
            res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' })
            res.end(JSON.stringify({ ...cached, fromCache: true, diff: null }))
            return
          }

          const cookie = process.env.DATAGOLF_SESSION ?? ''
          if (!cookie) console.warn('[inscricoes] DATAGOLF_SESSION em falta no .env.local !')
          console.log('[inscricoes] tcode=' + tcode + (refresh ? ' [REFRESH]' : ' [FETCH]') + ' cookie=' + (cookie ? cookie.slice(0, 20) + '...' : 'VAZIA'))

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
              // Se falhou mas temos cache, devolve a cache com aviso
              if (cached) {
                console.warn('[inscricoes] FPG falhou, a usar cache anterior')
                res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' })
                res.end(JSON.stringify({ ...cached, fromCache: true, fetchError: 'FPG HTTP ' + fpgRes.status, diff: null }))
                return
              }
              res.writeHead(502, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ error: 'FPG HTTP ' + fpgRes.status, tcode, ...meta, totalInscritos: 0, jogadores: [], lastFetched: null }))
              return
            }

            if (raw) { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(html); return }

            const jogadores   = parseAdmissionsTable(html)
            const now         = new Date().toISOString()
            const diff        = cached ? diffJogadores(cached.jogadores, jogadores) : null
            const hasChanges  = diff && (diff.added.length > 0 || diff.removed.length > 0)
            const lastChanged = hasChanges ? now : (cached?.lastChanged ?? now)

            if (diff && hasChanges) {
              if (diff.added.length)   console.log('[inscricoes] NOVOS: ' + diff.added.join(', '))
              if (diff.removed.length) console.log('[inscricoes] REMOVIDOS: ' + diff.removed.join(', '))
            }

            const entry: CacheEntry = { tcode, ...meta, totalInscritos: jogadores.length, jogadores, lastFetched: now, lastChanged, fpgUrl }

            // Guardar cache
            cache[tcode] = entry
            writeCache(cache)
            console.log('[inscricoes] tcode=' + tcode + ' -> ' + jogadores.length + ' inscritos, cache gravada')

            res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' })
            res.end(JSON.stringify({ ...entry, fromCache: false, diff }))

          } catch (err) {
            console.error('[inscricoes] Erro tcode=' + tcode + ':', err)
            // Fallback para cache em caso de erro de rede
            if (cached) {
              console.warn('[inscricoes] Erro de rede, a usar cache anterior')
              res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' })
              res.end(JSON.stringify({ ...cached, fromCache: true, fetchError: String(err), diff: null }))
              return
            }
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
