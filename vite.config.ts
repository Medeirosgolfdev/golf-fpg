import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { join, extname } from 'path'
import { existsSync, statSync, createReadStream } from 'fs'

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
}

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'serve-output',
      configureServer(server) {
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

  // Build para dentro de output/ sem apagar os scorecards existentes
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
