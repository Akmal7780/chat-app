import { createContext, useContext, useState } from "react";

const OnlineUsersContext = createContext();

export const OnlineUsersProvider = ({ children }) => {
  const [onlineUsers, setOnlineUsers] = useState(new Set());

  // 🔥 YANGI: users global state
  const [users, setUsers] = useState([]);

  return (
    <OnlineUsersContext.Provider
      value={{
        onlineUsers,
        setOnlineUsers,
        users,        // 🔥 qo‘shildi
        setUsers      // 🔥 qo‘shildi
      }}
    >
      {children}
    </OnlineUsersContext.Provider>
  );
};

export const useOnlineUsers = () => useContext(OnlineUsersContext);