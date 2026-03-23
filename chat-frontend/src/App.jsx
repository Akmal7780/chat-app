import {BrowserRouter,Routes,Route} from "react-router-dom"
import { Toaster } from "react-hot-toast"
import Login from "./pages/Login"
import Register from "./pages/Register"
import Chat from "./pages/Chat"

function App(){

  return(

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

  )
}

export default App