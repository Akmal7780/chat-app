const URL_REGEX = /https?:\/\/[^\s<]+[^\s<.,:;"')\]]/i

export function extractFirstUrl(text) {
  if (!text) return null
  const match = text.match(URL_REGEX)
  return match ? match[0] : null
}
