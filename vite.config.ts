import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { join, extname } from 'path'
import { existsSync, statSync, createReadStream, readFileSync, writeFileSync, mkdirSync, renameSync, unlinkSync } from 'fs'

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
  console.log(logPrefix + ' headers:' + JSON.stringify(headers.slice(0, 8)) + ' (score=' + bestScore + (hasRealHeader ? ', usar' : ', sem header — fallback posicional') + ') cols nome:' + iNome + ' fed:' + iFed + ' hcp:' + iHcp + ' vac:' + iVac + ' clube:' + iClube + ' data:' + iData)

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

// FONTE ÚNICA DE VERDADE: public/data/inscricoes_nacionais.json.
// Decisão 2026-04-17 (Via B): antes lia de `data/` e escrevia para ambos
// → edições manuais em public/data/ eram sobrescritas. Agora tudo passa
// pelo mesmo ficheiro — que também é o servido pelo Vite/Vercel ao cliente.
// O antigo `data/inscricoes_nacionais.json` deixa de ser lido ou escrito;
// pode ser apagado manualmente (fica como backup histórico, não ignorado).
const CACHE_FILE = join(process.cwd(), 'public', 'data', 'inscricoes_nacionais.json')

function readCache(): CacheFile {
  try {
    if (existsSync(CACHE_FILE)) return JSON.parse(readFileSync(CACHE_FILE, 'utf8')) as CacheFile
  } catch {}
  return {}
}

// Escrita atómica (write→.tmp + rename). O Vite serve o ficheiro em watch
// mode e pode lê-lo enquanto escrevemos — sem isto, ficheiros ficavam
// truncados a meio várias vezes. O rename é atómico em NTFS e POSIX.
function writeAtomic(target: string, content: string): void {
  const dir = require('path').dirname(target)
  const tmp = require('path').join(dir, '.' + require('path').basename(target) + '.tmp.' + process.pid + '.' + Date.now())
  try {
    writeFileSync(tmp, content, 'utf8')
    renameSync(tmp, target)
  } catch (e) {
    try { unlinkSync(tmp) } catch {}
    throw e
  }
}

function writeCache(data: CacheFile): void {
  const json = JSON.stringify(data, null, 2)
  try {
    const pubDir = join(process.cwd(), 'public', 'data')
    if (!existsSync(pubDir)) mkdirSync(pubDir, { recursive: true })
    writeAtomic(CACHE_FILE, json)
    console.log('[inscricoes] public/data/inscricoes_nacionais.json actualizado -- faz commit para publicar no Vercel')
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

/* HTTPS no dev server — necessário para a galeria de Logos poder guardar
   imagens em Fotografias no iPhone (a Web Share API de ficheiros só funciona
   em contexto seguro). Certificado self-signed em .certs/ (gitignored, gerado
   com openssl). Carregado só se os ficheiros existirem — assim outros
   ambientes (CI, Vercel build) continuam a funcionar sem certificados. */
function devHttps(): { key: Buffer; cert: Buffer } | undefined {
  try {
    const keyPath = join(process.cwd(), '.certs', 'dev-key.pem')
    const certPath = join(process.cwd(), '.certs', 'dev-cert.pem')
    if (existsSync(keyPath) && existsSync(certPath)) {
      console.log('[https] certificados encontrados em .certs/ — dev server em HTTPS')
      return { key: readFileSync(keyPath), cert: readFileSync(certPath) }
    }
    console.log('[https] sem certificados em .certs/ — dev server em HTTP')
  } catch (e) {
    console.warn('[https] erro a ler certificados:', (e as Error).message)
  }
  return undefined
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

        /* /api/fpg-photo?path=<photo_path> — proxy de fotos do FPG.
           Descoberto 2026-04-16: hcp-portugal.datagolf.pt/photos/{path} é público.
           O frontend agora aponta directamente para lá (sem proxy), mas mantemos
           este endpoint para compatibilidade e como fallback server-side. */
        server.middlewares.use(async (req, res, next) => {
          if (!req.url?.startsWith('/api/fpg-photo')) return next()
          try {
            const url = new URL(req.url, 'http://localhost')
            const photoPath = url.searchParams.get('path') || ''
            if (!photoPath) {
              res.writeHead(400, { 'Content-Type': 'text/plain' })
              res.end('missing ?path=')
              return
            }

            // URL público principal — não precisa de cookies
            const candidates = [
              { url: 'https://hcp-portugal.datagolf.pt/photos/' + photoPath, referer: 'https://hcp-portugal.datagolf.pt/' },
            ]

            console.log('[fpg-photo] tentar', candidates.length, 'URLs para', photoPath)
            for (const cand of candidates) {
              try {
                const r = await fetch(cand.url, {
                  headers: {
                    'User-Agent': UA,
                    'Accept': 'image/*,*/*;q=0.8',
                    'Referer': cand.referer,
                  },
                  redirect: 'follow',
                })
                const ct = r.headers.get('content-type') || ''
                console.log('  →', new URL(cand.url).hostname + new URL(cand.url).pathname, 'HTTP', r.status, 'CT=', ct)
                if (!r.ok) continue
                if (ct.includes('text/html') || ct.includes('application/json')) continue
                const buf = Buffer.from(await r.arrayBuffer())
                if (buf.length < 200) continue   // demasiado pequeno para ser foto válida
                console.log('[fpg-photo] OK via', new URL(cand.url).hostname, '(', buf.length, 'bytes)')
                res.writeHead(200, {
                  'Content-Type': ct || 'image/jpeg',
                  'Cache-Control': 'public, max-age=86400',
                  'Content-Length': String(buf.length),
                })
                res.end(buf)
                return
              } catch (err) {
                console.log('  → erro:', String((err as Error).message))
              }
            }
            // Nenhum candidato funcionou
            res.writeHead(404, { 'Content-Type': 'text/plain' })
            res.end('Foto não encontrada')
          } catch (e: any) {
            res.writeHead(500, { 'Content-Type': 'text/plain' })
            res.end(String(e?.message || e))
          }
        })

        /* /api/inscricoes/health — diagnóstico de saúde das fontes.
           Testa um tcode de amostra contra TODAS as 4-6 combinações de
           URL×cookie e devolve um sumário JSON. Análogo ao que /api/datagolf
           faz implicitamente nos logs. Útil para diagnóstico rápido sem abrir
           a página completa.

           GET /api/inscricoes/health          → usa tcode 10941 como sample
           GET /api/inscricoes/health?tcode=X  → usa tcode especificado */
        server.middlewares.use(async (req, res, next) => {
          if (!req.url?.startsWith('/api/inscricoes/health')) return next()
          const url = new URL(req.url, 'http://localhost')
          const tcode = url.searchParams.get('tcode') || '10941'
          if (!TORNEIOS[tcode]) {
            res.writeHead(400, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: 'tcode invalido' }))
            return
          }

          // Gateway canónico (ambos os domínios): linkpage.aspx?page=admissions
          // com o mesmo ack universal XH256YF450. Descoberta 2026-04-22 via probe:
          // • scoring.fpg.pt/lists/linkpage.aspx?page=admissions    → funciona
          // • scoring.datagolf.pt/pt/linkpage.aspx?page=admissions  → funciona (mesmo ack!)
          // Ir directo a tournAdmissions.aspx em QUALQUER dos dois é frágil —
          // devolve "Param Error" se a sessão não estiver aquecida. O linkpage
          // seta o estado e redireciona automaticamente para tournAdmissions com
          // os dados carregados (fetch com redirect:'follow' apanha a resposta final).
          const FPG_URL_1 = 'https://scoring.fpg.pt/lists/linkpage.aspx?page=admissions&club=000&tourn=' + tcode + '&ack=XH256YF450'
          const FPG_URL_2 = 'https://scoring.datagolf.pt/pt/linkpage.aspx?page=admissions&club=000&tourn=' + tcode + '&ack=XH256YF450'
          const baseHeaders: Record<string, string> = {
            'User-Agent': UA,
            'Accept': 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'pt-PT,pt;q=0.9',
            'Upgrade-Insecure-Requests': '1',
            'Referer': 'https://competicoes.fpg.pt/evento/campeonato-nacional-de-jovens-sub10-12-14-16-18-pga-aroeira/',
          }

          const cookieFpg = loadScoringCookies()
          let cookieDatagolf = ''
          try {
            const fp = join(process.cwd(), 'api', '.scoring-datagolf-cookies.json')
            if (existsSync(fp)) { const j = JSON.parse(readFileSync(fp, 'utf8')); if (j.cookieHeader) cookieDatagolf = j.cookieHeader }
          } catch {}
          // Só testamos as combinações que podem realmente funcionar: cada domínio
          // com as suas próprias cookies. Os experimentos "cross-domain"
          // (my.fpg.pt cookies em scoring.fpg.pt / scoring.datagolf.pt) e "sem
          // cookies" foram removidos 2026-04-22 — devolvem sempre HTTP 500 por
          // razões arquitecturais (servidores de scoring não aceitam cookies de
          // outro subdomínio; sem sessão devolvem Param_Errors). Ficam só as
          // duas fontes legítimas.
          const tests: Array<{ label: string; url: string; cookie: string }> = [
            { label: 'fpg+admissions-cookie',    url: FPG_URL_1, cookie: cookieFpg },
            { label: 'datagolf+datagolf-cookie', url: FPG_URL_2, cookie: cookieDatagolf },
          ]

          type HealthResult = { label: string; cookieLen: number; http: number; paramErr: boolean; parsed: number; bytes: number; error?: string }
          const results: HealthResult[] = []
          for (const t of tests) {
            const hdrs: Record<string, string> = { ...baseHeaders }
            if (t.cookie) hdrs.Cookie = t.cookie
            const row: HealthResult = { label: t.label, cookieLen: t.cookie?.length || 0, http: 0, paramErr: false, parsed: 0, bytes: 0 }
            try {
              const r = await fetch(t.url, { headers: hdrs, redirect: 'follow' })
              const txt = await r.text()
              row.http = r.status
              row.bytes = txt.length
              row.paramErr = /Param_Errors|Err=999/.test(txt)
              if (r.ok && !row.paramErr) {
                row.parsed = parseAdmissionsTable(txt, '[health]').length
              }
            } catch (e) {
              row.error = (e as Error).message
            }
            results.push(row)
          }

          const healthy = results.filter(r => r.parsed > 0)
          const rejected = results.filter(r => r.paramErr)
          const summary = {
            tcode,
            torneio: TORNEIOS[tcode].nome,
            liveSources: healthy.map(r => ({ label: r.label, parsed: r.parsed })),
            rejectedByServer: rejected.map(r => r.label),
            recommendation: healthy.length > 0
              ? 'OK — fontes vivas: ' + healthy.map(r => r.label).join(', ')
              : (rejected.length > 0
                  ? 'Renovar cookies: ' + rejected.map(r => r.label.split('+')[1] || r.label).join(' e ')
                  : 'Nenhuma fonte responde com dados — verifica se o endpoint HTML mudou'),
            results,
          }
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-cache' })
          res.end(JSON.stringify(summary, null, 2))
        })

        /* /api/inscricoes — vai SEMPRE à FPG, sem cache */
        server.middlewares.use(async (req, res, next) => {
          if (!req.url?.startsWith('/api/inscricoes')) return next()
          // Health-check é tratado pelo middleware acima; aqui só para não cair nele
          if (req.url.startsWith('/api/inscricoes/health')) return next()

          const url   = new URL(req.url, 'http://localhost')
          const tcode = url.searchParams.get('tcode') ?? ''
          const ccode = (url.searchParams.get('ccode') ?? '000').padStart(3, '0')
          const raw   = url.searchParams.get('raw') === '1'
          // Meta conhecida (Nacional 2026) é opcional — qualquer (ccode, tcode)
          // válido é aceite. Generalização 2026-07-10 para a verificação live
          // dos FEATURED_TOURNAMENTS (src/hooks/useLiveAdmissions.ts).
          const meta  = TORNEIOS[tcode] ?? { nome: 'Torneio ' + ccode + '/' + tcode, escalao: '', sex: '' }

          if (!/^\d{3,6}$/.test(tcode) || !/^\d{3}$/.test(ccode)) {
            res.writeHead(400, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: 'tcode/ccode invalido' }))
            return
          }

          // 2 URLs diferentes do FPG têm os mesmos dados de inscrições.
          // Cada um com cookies próprios. Tentamos AMBOS e usamos o que
          // devolver mais inscritos (prevalece o melhor parse).
          //
          // Ambos gateway canónicos (descoberta 2026-04-22 via probe).
          // Ir directo a tournAdmissions.aspx funciona às vezes, mas devolve
          // "Param Error" quando a sessão não está aquecida. O linkpage SETA
          // o estado de sessão necessário e redireciona para tournAdmissions
          // com os dados carregados — fetch com redirect:'follow' apanha tudo.
          //
          // O ack=XH256YF450 (universal para page=admissions) funciona em AMBOS
          // os domínios gémeos — o servidor `scoring.datagolf.pt/pt/linkpage.aspx`
          // partilha a mesma infra e aceita o mesmo ack.
          //
          // Duas fontes fiáveis = redundância real, não mais teórica. Em cada tcode,
          // as duas devem devolver os mesmos inscritos; o log mostra se divergem.
          const FPG_URL_1 = 'https://scoring.fpg.pt/lists/linkpage.aspx?page=admissions&club=' + ccode + '&tourn=' + tcode + '&ack=XH256YF450'
          const FPG_URL_2 = 'https://scoring.datagolf.pt/pt/linkpage.aspx?page=admissions&club=' + ccode + '&tourn=' + tcode + '&ack=XH256YF450'
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

          // Tentativas: cada domínio com as suas próprias cookies. NUNCA cookies
          // cross-domain (my.fpg.pt cookies em scoring.* devolvem sempre 500 — o
          // servidor rejeita cookies de subdomínio errado). NUNCA sem cookies (500
          // por falta de sessão ASP.NET). A experiência "cross-subdomain via SSO"
          // foi testada 2026-04-17 → 2026-04-22 e é conclusivamente inviável.
          type Attempt = { url: string; headers: Record<string, string>; label: string }
          const attempts: Attempt[] = []
          if (cookieFpg)      attempts.push({ url: FPG_URL_1, headers: { ...baseHeaders, Cookie: cookieFpg },      label: 'fpg+cookie' })
          if (cookieDatagolf) attempts.push({ url: FPG_URL_2, headers: { ...baseHeaders, Cookie: cookieDatagolf }, label: 'datagolf+cookie' })

          // Tentar todos os URLs e FUNDIR resultados (deduplicar por fed code).
          // Os 2 URLs (scoring.fpg.pt vs scoring.datagolf.pt) podem ter
          // inscritos diferentes — alguns aparecem só num, outros só noutro.
          // O union final dá o conjunto completo.
          //
          // DIAGNÓSTICO (2026-04-17, equivalente "verificação WHS"): para cada
          // attempt registamos HTTP status, se houve redirect para Param_Errors
          // (indicador de cookie expirado/rejeitado), e quantas linhas o parser
          // extraiu. Assim a utilizadora vê no log exactamente qual fonte está
          // viva e qual não — análogo ao que se passa em /api/datagolf.
          type Diag = { label: string; http: number; paramErr: boolean; parsed: number; unique: number; note?: string }
          const diagnostics: Diag[] = []
          const merged = new Map<string, Jogador>()  // fed → jogador
          let bestStatus = 0
          let bestHtml = ''
          // Contabilidade: `parsed` é quantas linhas a fonte extraiu; `unique` é
          // quantas CONTRIBUIU que eram novas (fed ainda não visto). A segunda
          // é o que importa para avaliar se uma fonte acrescenta valor.
          const parsedByLabel: Record<string, number> = {}
          const uniqueByLabel: Record<string, number> = {}
          for (const att of attempts) {
            console.log('[inscricoes] tcode=' + tcode + ' [' + att.label + '] ' + att.url)
            try {
              const r = await fetch(att.url, { headers: att.headers, redirect: 'follow' })
              const txt = await r.text()
              const paramErr = /Param_Errors|Err=999/.test(txt)
              const diag: Diag = { label: att.label, http: r.status, paramErr, parsed: 0, unique: 0 }
              console.log('[inscricoes] tcode=' + tcode + ' [' + att.label + '] -> HTTP ' + r.status + (paramErr ? ' ⚠ Param_Errors (cookies rejeitados)' : ''))
              if (!r.ok) { diag.note = 'http-nao-ok'; diagnostics.push(diag); continue }
              if (paramErr) { diag.note = 'param-errors'; diagnostics.push(diag); continue }
              if (!bestStatus) { bestStatus = r.status; bestHtml = txt }
              const parsed = parseAdmissionsTable(txt, '[inscricoes] tcode=' + tcode + ' [' + att.label + ']')
              parsedByLabel[att.label] = parsed.length
              diag.parsed = parsed.length
              let uniqueContrib = 0
              for (const j of parsed) {
                if (!j.fed) {
                  // Sem fed code — usar nome como key (raro mas evita perda)
                  const key = '_noFed_' + (j.nome || Math.random()).slice(0, 50)
                  if (!merged.has(key)) { merged.set(key, j); uniqueContrib++ }
                  continue
                }
                if (!merged.has(j.fed)) {
                  merged.set(j.fed, j)
                  uniqueContrib++
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
              uniqueByLabel[att.label] = uniqueContrib
              diag.unique = uniqueContrib
              diagnostics.push(diag)
            } catch (fetchErr) {
              diagnostics.push({ label: att.label, http: 0, paramErr: false, parsed: 0, unique: 0, note: 'fetch-error: ' + (fetchErr as Error).message })
              console.error('[inscricoes] fetch erro [' + att.label + ']:', fetchErr)
            }
          }
          const bestJogadores = [...merged.values()]
          // Breakdown agora mostra "parsed(unique)" para cada fonte — fica claro
          // quais fontes contribuíram dados NOVOS vs quais só duplicaram.
          const breakdown = Object.keys(parsedByLabel).map(k =>
            k + '=' + parsedByLabel[k] + '(+' + (uniqueByLabel[k] || 0) + ' novos)'
          ).join(', ')
          console.log('[inscricoes] tcode=' + tcode + ' MERGE: ' + bestJogadores.length + ' únicos | ' + breakdown)

          // Sumário de saúde de cada fonte.
          // "Viva com dados NOVOS" = unique > 0 (contribui valor).
          // "Viva sem dados novos" = parsed > 0 mas unique == 0 (fonte funciona mas
          //   duplica o que a anterior já deu — útil como redundância).
          const liveUnique = diagnostics.filter(d => d.unique > 0).map(d => d.label)
          const liveRedundant = diagnostics.filter(d => d.parsed > 0 && d.unique === 0).map(d => d.label)
          const rejected = diagnostics.filter(d => d.paramErr).map(d => d.label)
          if (liveUnique.length > 0) {
            const suffix = liveRedundant.length > 0 ? ' | redundantes (parsed mas sem novos): ' + liveRedundant.join(', ') : ''
            console.log('[inscricoes] ✓ FONTES VIVAS: ' + liveUnique.join(', ') + suffix)
          } else if (liveRedundant.length > 0) {
            console.log('[inscricoes] ✓ FONTES VIVAS (só duplicados, nenhuma com dados novos): ' + liveRedundant.join(', '))
          } else if (rejected.length > 0) {
            console.log('[inscricoes] ⚠ COOKIES REJEITADOS em: ' + rejected.join(', ') + ' — precisa renovar')
          } else {
            console.log('[inscricoes] ⚠ Nenhuma fonte devolveu dados e nenhum Param_Errors — HTML vazio ou formato mudou')
          }

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

            // Chave da cache: tcode simples para o legado (ccode 000 — o painel
            // antigo e o inscricoes_nacionais.json usam só o tcode); prefixada
            // com ccode para torneios de clube (evita colisão de tcodes).
            const cacheKey   = ccode === '000' ? tcode : ccode + '/' + tcode
            const prevCache  = readCache()
            const cached     = prevCache[cacheKey]

            // PROTECÇÃO CRÍTICA (2026-04-15): se o parser devolveu 0 mas o
            // cache tinha jogadores, NÃO sobrescrever — provavelmente cookies
            // expiraram ou parser falhou. Devolver o cache existente + diagnóstico
            // (para a UI poder mostrar "fonte live falhou, a usar cache").
            if (jogadores.length === 0 && cached && cached.jogadores.length > 0) {
              const rejected = diagnostics.filter(d => d.paramErr).map(d => d.label)
              const reason = rejected.length > 0
                ? 'cookies rejeitados em: ' + rejected.join(', ')
                : 'parser devolveu 0 linhas em todas as fontes'
              console.warn('[inscricoes] tcode=' + tcode + ' -> 0 inscritos NOVO mas cache tem ' + cached.jogadores.length + ' — A PRESERVAR cache (' + reason + ')')
              res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' })
              res.end(JSON.stringify({ ...cached, fromCache: true, warning: reason, diagnostics }))
              return
            }

            const diff       = cached ? diffJogadores(cached.jogadores, jogadores) : null
            const hasChanges = !!diff && (diff.added.length > 0 || diff.removed.length > 0)
            if (diff?.added.length)   console.log('[inscricoes] NOVOS: '     + diff.added.join(', '))
            if (diff?.removed.length) console.log('[inscricoes] REMOVIDOS: ' + diff.removed.join(', '))

            const lastChanged = hasChanges ? now : (cached?.lastChanged ?? now)
            const entry: CacheEntry = { tcode, ...meta, totalInscritos: jogadores.length, jogadores, lastFetched: now, lastChanged, fpgUrl }
            prevCache[cacheKey] = entry
            writeCache(prevCache)
            const liveSource = diagnostics.find(d => d.parsed > 0)?.label || '?'
            console.log('[inscricoes] tcode=' + tcode + ' -> ' + jogadores.length + ' inscritos, ficheiro actualizado (fonte viva: ' + liveSource + ')')

            res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' })
            res.end(JSON.stringify({ ...entry, fromCache: false, diff, diagnostics, liveSource }))

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
    host: true,          // expõe na rede local (LAN) para o iPhone aceder
    https: devHttps(),   // HTTPS se .certs/ existir, senão HTTP
    watch: {
      ignored: (p: string) => p.replace(/\\/g, '/').includes('/output/'),
    },
  },
})