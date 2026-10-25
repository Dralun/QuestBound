import {
  statKeys,
  type Payload,
  type Quest,
  type Reputation,
  type ShopItem,
  type Stats,
} from '../types/game'

const invalid = (cause?: unknown) =>
  new Error('The realm returned an unexpected response. Please try again.', { cause })

export function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid()
  return value as Record<string, unknown>
}

export function text(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 20000) throw invalid()
  return value
}

export function identifier(value: unknown): string {
  const id = text(value)
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(id)) throw invalid()
  return id
}

export function gameIdentifier(value: unknown): string {
  const id = typeof value === 'string' ? value.trim() : ''
  if (!/^[a-zA-Z0-9]{1,8}$/.test(id))
    throw new Error('Enter a game ID with 1 to 8 letters or numbers.')
  return id
}

export function number(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) throw invalid()
  return value
}

export function flag(value: unknown): boolean {
  if (value === true || value === 'true') return true
  if (value === false || value === 'false') return false
  throw invalid()
}

export function statsPatch(payload: Payload): Partial<Stats> {
  if (Array.isArray(payload)) return {}
  const patch: Partial<Stats> = {}
  for (const key of statKeys) {
    if (Object.hasOwn(payload, key)) patch[key] = number(payload[key])
  }
  return patch
}

export function parseReputation(payload: Payload): Reputation {
  const row = record(payload)
  const value = (key: keyof Reputation) => {
    const entry = row[key]
    if (typeof entry !== 'number' || !Number.isFinite(entry)) throw invalid()
    return entry
  }
  return { people: value('people'), state: value('state'), underworld: value('underworld') }
}

function list(payload: Payload, key: string): unknown[] {
  const entries = Array.isArray(payload) ? payload : payload[key]
  if (!Array.isArray(entries) || entries.length > 1000) throw invalid()
  return entries
}

function unique<T>(entries: T[], key: (entry: T) => string): T[] {
  if (new Set(entries.map(key)).size !== entries.length) throw invalid()
  return entries
}

function decodeBase64(value: unknown): string {
  const encoded = text(value)
  try {
    const bytes = Uint8Array.from(atob(encoded), (char) => char.charCodeAt(0))
    return text(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
  } catch (cause) {
    throw invalid(cause)
  }
}

function decodeRot13(value: unknown): string {
  return text(value).replace(/[a-zA-Z]/g, (char) =>
    String.fromCharCode(char.charCodeAt(0) + (char.toLowerCase() <= 'm' ? 13 : -13)),
  )
}

export function quests(payload: Payload): Quest[] {
  return unique(
    list(payload, 'messages').map((entry) => {
      const row = record(entry)
      const encrypted = row.encrypted == null ? null : number(row.encrypted)
      const decode = encrypted === 1 ? decodeBase64 : encrypted === 2 ? decodeRot13 : text
      const reward =
        typeof row.reward === 'string' && /^\d+$/.test(row.reward) ? Number(row.reward) : row.reward
      return {
        adId: identifier(decode(row.adId)),
        message: decode(row.message),
        probability: row.probability == null ? 'Unknown' : decode(row.probability),
        reward: number(reward),
        expiresIn: number(row.expiresIn),
      }
    }),
    (quest) => quest.adId,
  ).filter((quest) => quest.expiresIn > 0)
}

export function items(payload: Payload): ShopItem[] {
  return unique(
    list(payload, 'items').map((entry) => {
      const row = record(entry)
      return { id: identifier(row.id), name: text(row.name), cost: number(row.cost) }
    }),
    (item) => item.id,
  )
}
