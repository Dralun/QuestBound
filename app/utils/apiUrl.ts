export function normalizeApiUrl(value = ''): string {
  const url = value.trim()
  if (!URL.canParse(url) || !/^https?:\/\//i.test(url))
    throw new Error('Set VITE_GAME_API_URL to an absolute HTTP(S) API base URL.')
  return url.replace(/\/+$/, '')
}
