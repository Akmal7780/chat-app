import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './styles/style.css'
import { getTheme, applyTheme, initAutoNightModeListener } from './utils/theme'
import { getAccentColor, applyAccentColor } from './utils/accentColor'

import { GoogleOAuthProvider } from '@react-oauth/google'
import { OnlineUsersProvider } from './context/OnlineUsersContext'   // 👈 qo‘sh

applyTheme(getTheme())
applyAccentColor(getAccentColor())
initAutoNightModeListener()

ReactDOM.createRoot(document.getElementById('root')).render(

  <GoogleOAuthProvider clientId={import.meta.env.VITE_GOOGLE_CLIENT_ID}>
    
    <OnlineUsersProvider>   {/* 👈 SHU YERGA QO‘Y */}
      <App />
    </OnlineUsersProvider>

  </GoogleOAuthProvider>

)