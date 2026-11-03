import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { Analytics } from '@vercel/analytics/react'
import App from './App'
import { reloadForStaleChunk } from './utils/staleChunk'

// Depois de um deploy, uma página aberta de antes pede ficheiros JS que já não
// existem (404). O Vite avisa com este evento: recarregar uma vez apanha a versão nova.
window.addEventListener('vite:preloadError', (e) => {
  if (reloadForStaleChunk()) e.preventDefault()
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
      {/* Contador de visitas — Vercel Web Analytics.
          Fica AQUI (e não dentro do App) para contar a visita mesmo quando o
          utilizador só vê o ecrã de loading, de erro ou o PasswordGate.
          Só dispara em produção; em `npm run dev` fica inerte. */}
      <Analytics />
    </BrowserRouter>
  </StrictMode>,
)
