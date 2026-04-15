import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { join, extname } from 'path'
import { existsSync, statSync, createReadStream, readFileSync, writeFileSync, mkdirSync } from 'fs'

function loadEnvLocal() {
  const p = join(process.cwd(), '.env.local')
  console.log('[env] A procurar .env.local em: ' + p)
  if (!existsSync(p)) { console.warn('[env] Ficheiro nao encontrado!'); return }
  const raw = readFileSync(p)
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
    console.log('[env] Linha: k=' + JSON.stringify(k) + ' v=' + JSON.stringify(v.slice(0, 20)))
    if (k && !(k in process.env)) { process.env[k] = v; loaded++ }
  }
  console.log('[env] Carregadas ' + loaded + ' variaveis do .env.local')
  console.log('[env] DATAGOLF_SESSION = ' + (process.env.DATAGOLF_SESSION ? process.env.DATAGOLF_SESSION.slice(0, 30) + '...' : '(indefinido)'))
}
loadEnvLocal()

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css',
  '.js':   'application/javascript',
  '.json': 'application/json',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.svg':  'image/svg+xml',
}

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

/* Cookies para scoring.fpg.pt/lists (domínio real das inscrições):
   ASP.NET_SessionId + DG_Lists_URL capturados do Chrome 90 com user=admin&page=admissions.
   Sem estes, GET a tournAdmissions.aspx devolve 500 ou redirect. */
function loadScoringCookies(): string {
  if (process.env.FPG_ADMISSIONS_COOKIES) {
    console.log('[inscricoes] cookies de env FPG_ADMISSIONS_COOKIES')
    return process.env.FPG_ADMISSIONS_COOKIES
  }
  try {
    const fp = join(process.cwd(), 'api', '.fpg-admissions-cookies.json')
    if (existsSync(fp)) {
      const j = JSON.parse(readFileSync(fp, 'utf8'))
      if (j.cookieHeader) {
        console.log('[inscricoes] cookies de api/.fpg-admissions-cookies.json')
        return j.cookieHeader
      }
    }
    const fp2 = join(process.cwd(), 'api', '.scoring-datagolf-cookies.json')
    if (existsSync(fp2)) {
      const j = JSON.parse(readFileSync(fp2, 'utf8'))
      if (j.cookieHeader) {
        console.log('[inscricoes] cookies fallback de api/.scoring-datagolf-cookies.json')
        return j.cookieHeader
      }
    }
  } catch (e) {
    console.warn('[inscricoes] erro a ler cookies locais:', (e as Error).message)
  }
  return ''
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

/* ── Parser ──────────────────────────────────────────────────────────── */
type Jogador = {
  fed: string | null; nome: string; clube: string
  hcp: number | null; vac: number | null; dataInscricao: string | null
}

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&#\d+;/g, '').replace(/\s+/g, ' ').trim()
}

function parseNum(s: string): number | null {
  if (!s || s === '-' || s === '\u2013') return null
  const n = parseFloat(s.replace(',', '.'))
  return isNaN(n) ? null : n
}

function extractCells(rowHtml: string): string[] {
  const cells: string[] = []
  let m: RegExpExecArray | null
  const re = /<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi
  while ((m = re.exec(rowHtml)) !== null) cells.push(stripTags(m[1]))
  return cells
}

function parseAdmissionsTable(html: string, logPrefix: string): Jogador[] {
  const jogadores: Jogador[] = []
  const clean = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')

  const rows: string[] = []
  let m: RegExpExecArray | null
  const trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi
  while ((m = trRe.exec(clean)) !== null) rows.push(m[1])
  if (rows.length < 2) return jogadores

  // Detectar a melhor header row nas primeiras 10 linhas
  let headerRowIdx = 0
  let bestScore = -1
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const joined = extractCells(rows[i]).join(' ').toLowerCase()
    let score = 0
    if (/fed|lic/.test(joined))                  score += 3
    if (/nome|jogador/.test(joined))             score += 3
    if (/hcp|handicap|ndice|index/.test(joined)) score += 2
    if (/\bvac\b/.test(joined))                  score += 2
    if (/data|insc/.test(joined))                score += 2
    if (/clube|assoc/.test(joined))              score += 1
    if (score > bestScore) { bestScore = score; headerRowIdx = i }
  }

  // FIX 2026-04-15: se o "header" detectado tem score muito baixo (<3), provavelmente
  // é uma linha de dados ou ruído ("Volta 1"). Nesse caso processar TODAS as linhas
  // (start = 0) — perdíamos um inscrito por tcode antes deste fix.
  const hasRealHeader = bestScore >= 3
  const startRow = hasRealHeader ? headerRowIdx + 1 : 0

  const headers = hasRealHeader
    ? extractCells(rows[headerRowIdx]).map(c => c.toLowerCase())
    : []
  const iNome  = headers.findIndex(h => /nome|jogador/.test(h))
  const iFed   = headers.findIndex(h => /fed|lic/.test(h))
  const iHcp   = headers.findIndex(h => /hcp|handicap|ndice|index/.test(h))
  const iVac   = headers.findIndex(h => /\bvac\b/.test(h))
  const iClube = headers.findIndex(h => /clube|assoc/.test(h))
  const iData  = headers.findIndex(h => /data|insc/.test(h))
  console.log(logPrefix + ' headers:' + JSON.stringify(headers.slice(0, 8)) + ' (score=' + bestScore + (hasRealHeader ? ', usar' : ', IGNORAR — sem header real') + ') cols nome:' + iNome + ' fed:' + iFed + ' hcp:' + iHcp + ' vac:' + iVac + ' clube:' + iClube + ' data:' + iData)

  for (let i = startRow; i < rows.length; i++) {
    const cells: string[] = []
    const tdRe = /<td[^>]*>([\s\S]*?)<\/td>/gi
    while ((m = tdRe.exec(rows[i])) !== null) cells.push(stripTags(m[1]))
    if (cells.length < 2) continue

    // Fed: por header, senão scan de todas as células
    let fed: string | null = iFed >= 0 ? ((cells[iFed]?.match(/\b(\d{4,6})\b/) ?? [])[1] ?? null) : null
    let fedIdx = iFed
    if (!fed) {
      for (let ci = 0; ci < cells.length; ci++) {
        const fm = cells[ci].match(/\b(\d{4,6})\b/)
        if (fm) { fed = fm[1]; fedIdx = ci; break }
      }
    }

    // Nome: por header, senão primeira célula com texto longo
    const nome = iNome >= 0
      ? (cells[iNome] ?? '')
      : (cells.find(c => c.length > 4 && /[a-z\u00C0-\u017F]/i.test(c) && !/^\d/.test(c)) ?? '')

    // Clube: por header apenas
    const clube = iClube >= 0 ? (cells[iClube] ?? '') : ''

    // HCP e VAC: por header se encontrado, senão fallback posicional
    // HCP está no intervalo [-10, 54]; VAC é tipicamente > 60
    let hcp: number | null = iHcp >= 0 ? parseNum(cells[iHcp] ?? '') : null
    let vac: number | null = iVac >= 0 ? parseNum(cells[iVac] ?? '') : null

    if ((hcp === null || vac === null) && fedIdx >= 0) {
      for (let ci = fedIdx + 1; ci < cells.length; ci++) {
        const v = parseNum(cells[ci])
        if (v === null) continue
        if (hcp === null && v >= -10 && v <= 54) { hcp = v; continue }
        if (vac === null && v > 60) { vac = v; break }
      }
    }

    // Data: por header, senão primeira célula no formato YYYY/MM/DD
    let dataInscricao: string | null = iData >= 0 ? (cells[iData] || null) : null
    if (!dataInscricao) {
      const dc = cells.find(c => /\d{4}\/\d{2}\/\d{2}/.test(c))
      if (dc) dataInscricao = dc
    }

    if (!nome && !fed) continue
    jogadores.push({ fed: fed || null, nome, clube, hcp, vac, dataInscricao })
  }

  return jogadores
}

/* ── Ficheiro de estado ─────────────────────────────────────────────── */
type CacheEntry = {
  tcode: string; nome: string; escalao: string; sex: string
  totalInscritos: number; jogadores: Jogador[]
  lastFetched: string; lastChanged: string; fpgUrl: string
}
type CacheFile = Record<string, CacheEntry>

const CACHE_FILE   = join(process.cwd(), 'data', 'inscricoes_nacionais.json')
const PUBLIC_CACHE = join(process.cwd(), 'public', 'data', 'inscricoes_nacionais.json')

function readCache(): CacheFile {
  try {
    if (existsSync(CACHE_FILE)) return JSON.parse(readFileSync(CACHE_FILE, 'utf8')) as CacheFile
  } catch {}
  return {}
}

function writeCache(data: CacheFile): void {
  const json = JSON.stringify(data, null, 2)
  try {
    const dir = join(process.cwd(), 'data')
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    writeFileSync(CACHE_FILE, json, 'utf8')
  } catch (e) { console.warn('[inscricoes] Erro a gravar data/:', e) }
  try {
    const pubDir = join(process.cwd(), 'public', 'data')
    if (!existsSync(pubDir)) mkdirSync(pubDir, { recursive: true })
    writeFileSync(PUBLIC_CACHE, json, 'utf8')
    console.log('[inscricoes] public/data/ actualizado -- faz commit para publicar no Vercel')
  } catch (e) { console.warn('[inscricoes] Erro a gravar public/data/:', e) }
}

function diffJogadores(
  prev: Jogador[], next: Jogador[]
): { added: string[]; removed: string[] } {
  const prevFeds = new Set(prev.map(j => j.fed).filter(Boolean) as string[])
  const nextFeds = new Set(next.map(j => j.fed).filter(Boolean) as string[])
  return {
    added:   [...nextFeds].filter(f => !prevFeds.has(f)).map(f => next.find(j => j.fed === f)?.nome ?? f),
    removed: [...prevFeds].filter(f => !nextFeds.has(f)).map(f => prev.find(j => j.fed === f)?.nome ?? f),
  }
}

/* ── Vite config ───────────────────────────────────────────────────── */
export default defineConfig({
  plugins: [
    react(),
    {
      name: 'serve-output',
      configureServer(server) {

        /* /api/datagolf — proxy para PlayerWHS.aspx endpoints */
        server.middlewares.use(async (req, res, next) => {
          if (!req.url?.startsWith('/api/datagolf')) return next()
          try {
            // @ts-ignore - JS module sem tipos
            const handler = (await import('./api/datagolf.js')).default
            await handler(req, res)
          } catch (e: any) {
            res.writeHead(500, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ ok: false, error: String(e?.message || e) }))
          }
        })

        /* /api/inscricoes — vai SEMPRE à FPG, sem cache */
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

          // 2 URLs diferentes do FPG têm os mesmos dados de inscrições.
          // Cada um com cookies próprios. Tentamos AMBOS e usamos o que
          // devolver mais inscritos (prevalece o melhor parse).
          const FPG_URL_1 = 'https://scoring.fpg.pt/lists/tournAdmissions.aspx?ccode=000&tcode=' + tcode
          const FPG_URL_2 = 'https://scoring.datagolf.pt/pt/tournAdmissions.aspx?ccode=000&tcode=' + tcode
          const fpgUrl = FPG_URL_1  // mantido para o cache.fpgUrl

          const baseHeaders: Record<string, string> = {
            'User-Agent':              UA,
            'Accept':                  'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language':         'pt-PT,pt;q=0.9,en-US;q=0.8,en;q=0.7',
            'Accept-Encoding':         'gzip, deflate, br',
            'Connection':              'keep-alive',
            'Upgrade-Insecure-Requests': '1',
            'Referer':                 'https://competicoes.fpg.pt/evento/campeonato-nacional-de-jovens-sub10-12-14-16-18-pga-aroeira/',
            'Cache-Control':           'no-cache',
          }

          // Carregar cookies por domínio
          const cookieFpg = loadScoringCookies()  // scoring.fpg.pt (admissions)
          let cookieDatagolf = ''
          try {
            const fp = join(process.cwd(), 'api', '.scoring-datagolf-cookies.json')
            if (existsSync(fp)) {
              const j = JSON.parse(readFileSync(fp, 'utf8'))
              if (j.cookieHeader) cookieDatagolf = j.cookieHeader
            }
          } catch {}

          // Tentativas: 4 (2 URLs × com/sem cookie próprio do domínio)
          type Attempt = { url: string; headers: Record<string, string>; label: string }
          const attempts: Attempt[] = []
          if (cookieFpg) attempts.push({ url: FPG_URL_1, headers: { ...baseHeaders, Cookie: cookieFpg }, label: 'fpg+cookie' })
          if (cookieDatagolf) attempts.push({ url: FPG_URL_2, headers: { ...baseHeaders, Cookie: cookieDatagolf }, label: 'datagolf+cookie' })
          attempts.push({ url: FPG_URL_1, headers: { ...baseHeaders }, label: 'fpg sem cookie' })
          attempts.push({ url: FPG_URL_2, headers: { ...baseHeaders }, label: 'datagolf sem cookie' })

          // Tentar todos os URLs e FUNDIR resultados (deduplicar por fed code).
          // Os 2 URLs (scoring.fpg.pt vs scoring.datagolf.pt) podem ter
          // inscritos diferentes — alguns aparecem só num, outros só noutro.
          // O union final dá o conjunto completo.
          const merged = new Map<string, Jogador>()  // fed → jogador
          let bestStatus = 0
          let bestHtml = ''
          let totalRowsByLabel: Record<string, number> = {}
          for (const att of attempts) {
            console.log('[inscricoes] tcode=' + tcode + ' [' + att.label + '] ' + att.url)
            try {
              const r = await fetch(att.url, { headers: att.headers, redirect: 'follow' })
              const txt = await r.text()
              console.log('[inscricoes] tcode=' + tcode + ' [' + att.label + '] -> HTTP ' + r.status)
              if (!r.ok) continue
              if (!bestStatus) { bestStatus = r.status; bestHtml = txt }
              const parsed = parseAdmissionsTable(txt, '[inscricoes] tcode=' + tcode + ' [' + att.label + ']')
              totalRowsByLabel[att.label] = parsed.length
              for (const j of parsed) {
                if (!j.fed) {
                  // Sem fed code — usar nome como key (raro mas evita perda)
                  const key = '_noFed_' + (j.nome || Math.random()).slice(0, 50)
                  if (!merged.has(key)) merged.set(key, j)
                  continue
                }
                if (!merged.has(j.fed)) {
                  merged.set(j.fed, j)
                } else {
                  // Já existe — preservar mas merge campos vazios
                  const existing = merged.get(j.fed)!
                  if (!existing.nome && j.nome) existing.nome = j.nome
                  if (!existing.clube && j.clube) existing.clube = j.clube
                  if (existing.hcp == null && j.hcp != null) existing.hcp = j.hcp
                  if (existing.vac == null && j.vac != null) existing.vac = j.vac
                  if (!existing.dataInscricao && j.dataInscricao) existing.dataInscricao = j.dataInscricao
                }
              }
            } catch (fetchErr) {
              console.error('[inscricoes] fetch erro [' + att.label + ']:', fetchErr)
            }
          }
          const bestJogadores = [...merged.values()]
          const breakdown = Object.entries(totalRowsByLabel).map(([k, v]) => k + '=' + v).join(', ')
          console.log('[inscricoes] tcode=' + tcode + ' MERGE: ' + bestJogadores.length + ' únicos (' + breakdown + ')')

          try {
            if (raw) {
              res.writeHead(bestStatus || 502, { 'Content-Type': 'text/html; charset=utf-8' })
              res.end(bestHtml || 'sem resposta de nenhum dos 2 URLs')
              return
            }

            // Para compatibilidade com o resto do código abaixo
            const fpgRes: { ok: boolean; status: number } = { ok: bestStatus > 0, status: bestStatus || 502 }
            const html = bestHtml
            if (!fpgRes.ok) {
              console.warn('[inscricoes] tcode=' + tcode + ' — todos os attempts falharam (status=' + fpgRes.status + ')')
              res.writeHead(502, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ error: 'FPG HTTP ' + fpgRes.status, tcode, ...meta, totalInscritos: 0, jogadores: [], lastFetched: null }))
              return
            }

            const jogadores = bestJogadores
            const now       = new Date().toISOString()

            const prevCache  = readCache()
            const cached     = prevCache[tcode]

            // PROTECÇÃO CRÍTICA (2026-04-15): se o parser devolveu 0 mas o
            // cache tinha jogadores, NÃO sobrescrever — provavelmente cookies
            // expiraram ou parser falhou. Devolver o cache existente.
            if (jogadores.length === 0 && cached && cached.jogadores.length > 0) {
              console.warn('[inscricoes] tcode=' + tcode + ' -> 0 inscritos NOVO mas cache tem ' + cached.jogadores.length + ' — A PRESERVAR cache (provável erro de cookies/parser)')
              res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' })
              res.end(JSON.stringify({ ...cached, fromCache: true, warning: 'parser devolveu 0 — usar cache' }))
              return
            }

            const diff       = cached ? diffJogadores(cached.jogadores, jogadores) : null
            const hasChanges = !!diff && (diff.added.length > 0 || diff.removed.length > 0)
            if (diff?.added.length)   console.log('[inscricoes] NOVOS: '     + diff.added.join(', '))
            if (diff?.removed.length) console.log('[inscricoes] REMOVIDOS: ' + diff.removed.join(', '))

            const lastChanged = hasChanges ? now : (cached?.lastChanged ?? now)
            const entry: CacheEntry = { tcode, ...meta, totalInscritos: jogadores.length, jogadores, lastFetched: now, lastChanged, fpgUrl }
            prevCache[tcode] = entry
            writeCache(prevCache)
            console.log('[inscricoes] tcode=' + tcode + ' -> ' + jogadores.length + ' inscritos, ficheiro actualizado')

            res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' })
            res.end(JSON.stringify({ ...entry, fromCache: false, diff }))

          } catch (err) {
            console.error('[inscricoes] Erro tcode=' + tcode + ':', err)
            res.writeHead(502, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: String(err), tcode, ...meta, totalInscritos: 0, jogadores: [], lastFetched: null }))
          }
        })

        /* Ficheiros de output estáticos */
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