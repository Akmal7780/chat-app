import { createContext, useCallback, useContext, useState } from "react"

const KEY = "chat_app_language"

const DICTIONARY = {
  en: {
    allChats: "All chats",
    private: "Private",
    groups: "Groups",
    channels: "Channels",
    unread: "Unread",
    edit: "Edit",
    search: "Search",
    menu_myProfile: "My Profile",
    menu_newGroup: "New Group",
    menu_newChannel: "New Channel",
    menu_publicChannels: "Public Channels",
    menu_contacts: "Contacts",
    menu_calls: "Calls",
    menu_savedMessages: "Saved Messages",
    menu_settings: "Settings",
    menu_nightMode: "Night Mode",
    menu_logout: "Logout",
    settings_title: "Settings",
    settings_myAccount: "My Account",
    settings_notifications: "Notifications and Sounds",
    settings_privacy: "Privacy and Security",
    settings_chatSettings: "Chat Settings",
    settings_folders: "Folders",
    settings_advanced: "Advanced",
    settings_language: "Language",
    settings_darkMode: "Dark Mode",
    settings_logout: "Log out",
    language_title: "Language",
    language_showTranslateButton: "Show Translate Button",
    language_translateEntireChats: "Translate Entire Chats",
    language_hint: "The 'Translate' button will appear in the context menu of messages containing text.",
    language_search: "Search",
    language_name_en: "English",
    language_name_ru: "Russian",
    privacy_lastSeen: "Last seen & online",
    privacy_profilePhotos: "Profile photos",
    privacy_everybody: "Everybody",
    privacy_nobody: "Nobody",
  },
  ru: {
    allChats: "Все чаты",
    private: "Личные",
    groups: "Группы",
    channels: "Каналы",
    unread: "Непрочитанные",
    edit: "Изменить",
    search: "Поиск",
    menu_myProfile: "Мой профиль",
    menu_newGroup: "Новая группа",
    menu_newChannel: "Новый канал",
    menu_publicChannels: "Публичные каналы",
    menu_contacts: "Контакты",
    menu_calls: "Звонки",
    menu_savedMessages: "Избранное",
    menu_settings: "Настройки",
    menu_nightMode: "Ночной режим",
    menu_logout: "Выйти",
    settings_title: "Настройки",
    settings_myAccount: "Мой аккаунт",
    settings_notifications: "Уведомления и звуки",
    settings_privacy: "Конфиденциальность",
    settings_chatSettings: "Настройки чата",
    settings_folders: "Папки",
    settings_advanced: "Дополнительно",
    settings_language: "Язык",
    settings_darkMode: "Тёмная тема",
    settings_logout: "Выйти",
    language_title: "Язык",
    language_showTranslateButton: "Показывать кнопку перевода",
    language_translateEntireChats: "Переводить весь чат",
    language_hint: "Кнопка «Перевести» появится в контекстном меню сообщений с текстом.",
    language_search: "Поиск",
    language_name_en: "Английский",
    language_name_ru: "Русский",
    privacy_lastSeen: "Последнее посещение",
    privacy_profilePhotos: "Фото профиля",
    privacy_everybody: "Все",
    privacy_nobody: "Никто",
  },
}

export function getLanguage() {
  try {
    const stored = localStorage.getItem(KEY)
    return DICTIONARY[stored] ? stored : "en"
  } catch {
    return "en"
  }
}

export function setLanguage(code) {
  localStorage.setItem(KEY, code)
}

const LanguageContext = createContext(null)

export function LanguageProvider({ children }) {
  const [lang, setLangState] = useState(getLanguage)

  const changeLanguage = useCallback((code) => {
    if (!DICTIONARY[code]) return
    setLanguage(code)
    setLangState(code)
  }, [])

  const t = useCallback(
    (key) => DICTIONARY[lang]?.[key] ?? DICTIONARY.en[key] ?? key,
    [lang]
  )

  return (
    <LanguageContext.Provider value={{ lang, setLang: changeLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  )
}

export function useLanguage() {
  return useContext(LanguageContext)
}
