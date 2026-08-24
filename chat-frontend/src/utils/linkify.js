export const URL_REGEX = /https?:\/\/[^\s<]+[^\s<.,:;"')\]]/i
export const URL_REGEX_GLOBAL = new RegExp(URL_REGEX.source, "gi")

export function extractFirstUrl(text) {
  if (!text) return null
  const match = text.match(URL_REGEX)
  return match ? match[0] : null
}
