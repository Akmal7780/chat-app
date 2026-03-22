import { useEffect, useState } from "react"
import api from "../api/axios"

function ChatList({ setConversationId }) {

const [chats, setChats] = useState([])

useEffect(() => {

const fetchChats = async () => {

  try {

    const token = localStorage.getItem("token")

    const res = await api.get("/conversations/", {
      headers: {
        Authorization: `Bearer ${token}`
      }
    })

    const data = res.data.results || res.data

    if (Array.isArray(data)) {
      setChats(data)
    } else {
      setChats([])
    }

  } catch (error) {
    console.log("Chats fetch error:", error)
    setChats([])
  }

}

fetchChats()

}, [])

return (

<div style={{ width: "250px", borderRight: "1px solid #ddd" }}>

  <h3 style={{ padding: "10px" }}>Chats</h3>

  {chats.length === 0 ? (
    <p style={{ padding: "10px" }}>No chats yet</p>
  ) : (
    chats.map(chat => (
      <div
        key={chat.id}
        style={{ padding: "10px", cursor: "pointer" }}
        onClick={() => setConversationId(chat.id)}
      >
        {chat.name || `Chat ${chat.id}`}
      </div>
    ))
  )}

</div>

)
}

export default ChatList