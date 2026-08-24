import React from 'react'
import ReactDOM from 'react-dom/client'
import * as Sentry from '@sentry/react'
import App from './App.jsx'
import './styles/style.css'
import { getTheme, applyTheme, initAutoNightModeListener } from './utils/theme'
import { getAccentColor, applyAccentColor } from './utils/accentColor'

import { GoogleOAuthProvider } from '@react-oauth/google'
import { OnlineUsersProvider } from './context/OnlineUsersContext'   // 👈 qo‘sh
import { registerServiceWorker } from './utils/push'

applyTheme(getTheme())
applyAccentColor(getAccentColor())
initAutoNightModeListener()

// Registered unconditionally (not just when push is enabled) — this is
// also what makes the app installable as a PWA (manifest.json + an active
// service worker are both required by browsers' install criteria).
registerServiceWorker()

// Optional error monitoring — silently disabled unless VITE_SENTRY_DSN is set.
if (import.meta.env.VITE_SENTRY_DSN) {
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    environment: import.meta.env.VITE_SENTRY_ENVIRONMENT || 'development',
    tracesSampleRate: 0.1,
  })
}

ReactDOM.createRoot(document.getElementById('root')).render(

  <GoogleOAuthProvider clientId={import.meta.env.VITE_GOOGLE_CLIENT_ID}>
    
    <OnlineUsersProvider>   {/* 👈 SHU YERGA QO‘Y */}
      <App />
    </OnlineUsersProvider>

  </GoogleOAuthProvider>

)