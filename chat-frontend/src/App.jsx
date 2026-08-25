import { useEffect, useState } from "react"
import {BrowserRouter,Routes,Route} from "react-router-dom"
import { Toaster } from "react-hot-toast"
import Login from "./pages/Login"
import Register from "./pages/Register"
import Chat from "./pages/Chat"
import LockScreenOverlay from "./components/chat/LockScreenOverlay"
import { isLocked, onLockRequested } from "./utils/localPasscode"
import { LanguageProvider } from "./utils/i18n"

function App(){
  const [locked, setLocked] = useState(() => isLocked())

  useEffect(() => onLockRequested(() => setLocked(true)), [])

  if (locked) {
    return <LockScreenOverlay onUnlocked={() => setLocked(false)} />
  }

  return(

    <LanguageProvider>
    <BrowserRouter>
    {/* 🔔 GLOBAL TOAST */}
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 3000
        }}
        gutter={8}
        containerStyle={{ top: 20 }}
      />

      <Routes>

        <Route path="/" element={<Login/>}/>
        <Route path="/register" element={<Register/>}/>
        <Route path="/chat" element={<Chat/>}/>

      </Routes>

    </BrowserRouter>
    </LanguageProvider>

  )
}

export default App