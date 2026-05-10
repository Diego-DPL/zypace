import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HelmetProvider } from 'react-helmet-async'
import { initAnalytics, hasAnalyticsConsent } from './lib/analytics'
import App from './App'
import './index.css'

// Only load GA4 if user has already given analytics consent in a previous visit
if (hasAnalyticsConsent()) initAnalytics()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HelmetProvider>
      <App />
    </HelmetProvider>
  </StrictMode>,
)
